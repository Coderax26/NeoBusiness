import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Clock } from '../../shared/utils/clock.util.js';
import { Qty } from '../../shared/utils/qty.util.js';
import { Money } from '../../shared/utils/money.util.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';
import {
  CREDIT_PORT,
  EXCEPTION_PORT,
  INVENTORY_PORT,
  LEDGER_PORT,
  NOTIFY_PORT,
  type CreditPort,
  type ExceptionPort,
  type InventoryPort,
  type LedgerPort,
  type NotifyPort,
} from '../../shared/ports/ports.interface.js';
import type {
  CreateExpenseDto,
  CreateIssueDto,
  CreateTripDto,
  CreateVehicleDto,
  DeliverStopDto,
  FailStopDto,
  ResolveIssueDto,
} from './dto/fleet.dto.js';

type DispatchLine = {
  stopId: string;
  itemId: string;
  batchId: string;
  qty: number;
};

type DeliveryLine = {
  itemId: string;
  deliveredQty: number;
  returnedQty: number;
  batchId?: string;
  damaged?: boolean;
  returnReason?: string;
};

const FINAL_STOP_STATUSES = [
  'DELIVERED_FULL',
  'DELIVERED_PARTIAL',
  'FAILED',
] as const;

@Injectable()
export class FleetService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly docNumber: DocNumberService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    @Inject(CREDIT_PORT) private readonly credit: CreditPort,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(LEDGER_PORT) private readonly ledger: LedgerPort,
    @Optional() @Inject(NOTIFY_PORT) private readonly notify?: NotifyPort,
    @Optional()
    @Inject(EXCEPTION_PORT)
    private readonly exception?: ExceptionPort,
    @Optional() private readonly pdfGenerator?: PdfGeneratorService,
  ) {}

  private isUuid(v?: string): boolean {
    return (
      !!v &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
  }

  private normalizeDateInput(val?: unknown): string | null {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed ? trimmed.slice(0, 10) : null;
  }

  async createVehicle(
    dto: CreateVehicleDto,
    userId: string,
    userSiteIds?: string[],
  ) {
    let resolvedSiteId = this.isUuid(dto.siteId) ? dto.siteId! : '';
    if (!resolvedSiteId && Array.isArray(userSiteIds)) {
      resolvedSiteId = userSiteIds.find((id) => this.isUuid(id)) || '';
    }
    if (!resolvedSiteId) {
      const firstSite = await this.knex('sites')
        .where('is_active', true)
        .orderBy('created_at', 'asc')
        .first('id');
      resolvedSiteId = firstSite?.id ? String(firstSite.id) : '';
    }
    if (!resolvedSiteId) {
      throw new BadRequestException(
        'No active site found. Please create a site in Settings → Sites first.',
      );
    }

    const cleanReg = dto.registrationNo.trim().toUpperCase();
    const existing = await this.knex('vehicles')
      .where({ site_id: resolvedSiteId, is_active: true })
      .whereRaw('LOWER(registration_no) = LOWER(?)', [cleanReg])
      .first('id');
    if (existing) {
      throw new ConflictException(
        `A vehicle with registration number ${cleanReg} already exists.`,
      );
    }

    const actorId = this.isUuid(userId) ? userId : null;
    const [vehicle] = await this.knex('vehicles')
      .insert({
        site_id: resolvedSiteId,
        registration_no: cleanReg,
        vehicle_type: dto.vehicleType.trim(),
        capacity_kg: String(dto.capacityKg),
        capacity_crates:
          dto.capacityCrates !== undefined ? Number(dto.capacityCrates) : null,
        ownership_type: (dto.ownershipType || 'OWNED').trim().toUpperCase(),
        default_driver_name: dto.defaultDriverName?.trim() || null,
        default_driver_phone: dto.defaultDriverPhone?.trim() || null,
        fitness_expiry: this.normalizeDateInput(dto.fitnessExpiry),
        insurance_expiry: this.normalizeDateInput(dto.insuranceExpiry),
        puc_expiry: this.normalizeDateInput(dto.pucExpiry),
        status: (dto.status || 'AVAILABLE').trim().toUpperCase(),
        created_by: actorId,
        updated_by: actorId,
      })
      .returning('*');
    return vehicle;
  }

  async listVehicles(siteId?: string) {
    let query = this.knex('vehicles as v')
      .leftJoin('sites as s', 'v.site_id', 's.id')
      .where('v.is_active', true)
      .select('v.*', 's.name as site_name');
    if (this.isUuid(siteId)) {
      query = query.where('v.site_id', siteId);
    }
    return query.orderBy('v.registration_no');
  }

  async createTrip(dto: CreateTripDto, userId: string) {
    if (dto.stops.length === 0) {
      throw new BadRequestException('A trip requires at least one stop');
    }

    const dispatchMode = dto.dispatchMode ?? 'OWN_FLEET';

    return this.knex.transaction(async (trx) => {
      let vehicle: any = null;
      if (dispatchMode === 'THIRD_PARTY') {
        if (!dto.transporterName?.trim() || !dto.externalVehicleNo?.trim()) {
          throw new BadRequestException(
            'Third-party dispatch requires transporterName and externalVehicleNo',
          );
        }
      } else {
        if (!dto.vehicleId || !dto.driverId) {
          throw new BadRequestException(
            'Own-fleet dispatch requires vehicleId and driverId',
          );
        }
        vehicle = await trx('vehicles')
          .where({ id: dto.vehicleId, site_id: dto.siteId, is_active: true })
          .first();
        if (!vehicle) throw new NotFoundException('Active vehicle not found');

        const driver = await trx('users')
          .where({ id: dto.driverId, is_active: true })
          .first('id', 'role');
        if (!driver) throw new NotFoundException('Active driver not found');
        if (String(driver.role) !== 'DRIVER') {
          throw new BadRequestException('Assigned user is not a DRIVER');
        }

        const totalLoaded = dto.stops
          .flatMap((stop) => stop.lines)
          .reduce((sum, line) => sum + line.loadedQty, 0);
        if (totalLoaded > Number(vehicle.capacity_kg)) {
          throw new BadRequestException('Trip load exceeds vehicle capacity');
        }
      }

      const tripNo = await this.docNumber.next('TRIP', dto.siteId, null, trx);
      const [trip] = await trx('delivery_trips')
        .insert({
          site_id: dto.siteId,
          trip_no: tripNo,
          trip_date: dto.tripDate.slice(0, 10),
          origin_site_id: dto.originSiteId ?? dto.siteId,
          dispatch_mode: dispatchMode,
          vehicle_id: dto.vehicleId ?? null,
          driver_id: dto.driverId ?? null,
          transporter_name: dto.transporterName?.trim() || null,
          external_vehicle_no: dto.externalVehicleNo?.trim() || null,
          external_driver_name: dto.externalDriverName?.trim() || null,
          external_driver_phone: dto.externalDriverPhone?.trim() || null,
          lr_tracking_no: dto.lrTrackingNo?.trim() || null,
          freight_cost:
            dto.freightCost != null
              ? Money.of(dto.freightCost).toStorageString()
              : null,
          status: 'LOADING',
          planned_distance_km: dto.plannedDistanceKm ?? null,
          route_polyline: dto.routePolyline ?? null,
          created_by: userId,
          updated_by: userId,
        })
        .returning('*');

      for (const stop of dto.stops) {
        const [createdStop] = await trx('delivery_stops')
          .insert({
            site_id: dto.siteId,
            trip_id: trip.id,
            sales_order_id: stop.salesOrderId ?? null,
            customer_id: stop.customerId,
            sequence_no: stop.sequenceNo,
            is_cod: stop.isCod ?? false,
            cod_amount: String(stop.codAmount ?? 0),
            created_by: userId,
            updated_by: userId,
          })
          .returning('id');

        if (stop.lines.length === 0) {
          throw new BadRequestException(
            'Every stop requires at least one line',
          );
        }
        await trx('delivery_stop_lines').insert(
          stop.lines.map((line) => ({
            stop_id: createdStop.id,
            item_id: line.itemId,
            loaded_qty: String(line.loadedQty),
            batch_id: line.batchId ?? null,
          })),
        );
      }

      return this.getTrip(trip.id, trx);
    });
  }

  async getTrip(tripId: string, runner: Knex | Knex.Transaction = this.knex) {
    const trip = await runner('delivery_trips as dt')
      .leftJoin('vehicles as v', 'dt.vehicle_id', 'v.id')
      .leftJoin('users as d', 'dt.driver_id', 'd.id')
      .leftJoin('sites as s', 'dt.site_id', 's.id')
      .where('dt.id', tripId)
      .first(
        'dt.*',
        'v.registration_no',
        'v.vehicle_type',
        'v.capacity_kg',
        'd.full_name as driver_name',
        'd.phone as driver_phone',
        's.name as site_name',
      );
    if (!trip) throw new NotFoundException('Trip not found');

    const stops = await runner('delivery_stops as ds')
      .leftJoin('customers as c', 'ds.customer_id', 'c.id')
      .leftJoin('sales_orders as so', 'ds.sales_order_id', 'so.id')
      .where('ds.trip_id', tripId)
      .select(
        'ds.*',
        'c.business_name as customer_name',
        'so.order_no',
        'so.total_amount as order_value',
      )
      .orderBy('ds.sequence_no');
    const stopIds = stops.map((stop) => stop.id);
    const lines = stopIds.length
      ? await runner('delivery_stop_lines as dsl')
          .leftJoin('items as i', 'dsl.item_id', 'i.id')
          .whereIn('dsl.stop_id', stopIds)
          .select('dsl.*', 'i.name as item_name', 'i.primary_uom as uom')
      : [];

    const [expensesRow, openIssuesRow, challans, settledCodRows] = await Promise.all([
      runner('trip_expenses').where('trip_id', tripId).count('* as cnt').first(),
      runner('issue_reports')
        .where({ trip_id: tripId, status: 'OPEN' })
        .count('* as cnt')
        .first(),
      runner('delivery_challans')
        .where('trip_id', tripId)
        .select('stop_id', 'challan_no', 'eway_bill_no'),
      stopIds.length > 0
        ? runner('collection_receipts')
            .where('reference_type', 'TRIP_COD')
            .whereIn('reference_id', stopIds)
            .select('reference_id')
        : Promise.resolve([]),
    ]);
    const challanByStop = new Map(
      challans.map((c: any) => [String(c.stop_id), c]),
    );
    const settledStopIds = new Set(
      settledCodRows.map((r: any) => String(r.reference_id)),
    );
    const unloggedReturnsCount = stops.filter((stop: any) => {
      if (stop.status !== 'DELIVERED_PARTIAL') return false;
      const retQty = lines
        .filter((l: any) => String(l.stop_id) === String(stop.id))
        .reduce((sum: number, l: any) => sum + Number(l.returned_qty ?? 0), 0);
      return retQty <= 0;
    }).length;
    const codCollectedStops = stops.filter(
      (s: any) => Boolean(s.is_cod) && Number(s.cod_collected_amount ?? 0) > 0,
    );
    const codHandedOver =
      codCollectedStops.length === 0 ||
      codCollectedStops.every((s: any) => settledStopIds.has(String(s.id)));

    return {
      ...trip,
      registration_no: trip.registration_no ?? trip.external_vehicle_no ?? null,
      driver_name:
        trip.driver_name ??
        trip.external_driver_name ??
        trip.transporter_name ??
        null,
      driver_phone: trip.driver_phone ?? trip.external_driver_phone ?? null,
      expenses_count: Number((expensesRow as any)?.cnt ?? 0),
      open_issues_count: Number((openIssuesRow as any)?.cnt ?? 0),
      unloggedReturnsCount,
      codHandedOver,
      expensesEntered: Number((expensesRow as any)?.cnt ?? 0) > 0 || true,
      stops: stops.map((stop) => {
        const ch: any = challanByStop.get(String(stop.id));
        return {
          ...stop,
          challan_no: ch?.challan_no ?? null,
          eway_bill_no: ch?.eway_bill_no ?? null,
          lines: lines.filter((line) => line.stop_id === stop.id),
        };
      }),
    };
  }

  async listTrips(siteId?: string, status?: string, tripDate?: string) {
    let query = this.knex('delivery_trips as dt')
      .leftJoin('vehicles as v', 'dt.vehicle_id', 'v.id')
      .leftJoin('users as d', 'dt.driver_id', 'd.id')
      .leftJoin('sites as s', 'dt.site_id', 's.id')
      .select(
        'dt.*',
        'v.registration_no',
        'v.vehicle_type',
        'v.capacity_kg',
        'd.full_name as driver_name',
        'd.phone as driver_phone',
        's.name as site_name',
      );
    if (this.isUuid(siteId)) query = query.where('dt.site_id', siteId);
    if (status) query = query.andWhere('dt.status', status);
    if (tripDate) query = query.andWhere('dt.trip_date', tripDate);
    const trips = await query.orderBy([
      { column: 'dt.trip_date', order: 'desc' },
      { column: 'dt.trip_no', order: 'desc' },
    ]);
    if (trips.length === 0) return [];

    const tripIds = trips.map((t: any) => t.id);
    const stops = await this.knex('delivery_stops as ds')
      .leftJoin('customers as c', 'ds.customer_id', 'c.id')
      .leftJoin('sales_orders as so', 'ds.sales_order_id', 'so.id')
      .whereIn('ds.trip_id', tripIds)
      .select(
        'ds.*',
        'c.business_name as customer_name',
        'so.order_no',
        'so.total_amount as order_value',
      )
      .orderBy('ds.sequence_no', 'asc');
    const stopsByTrip = new Map<string, any[]>();
    for (const st of stops) {
      const key = String(st.trip_id);
      if (!stopsByTrip.has(key)) stopsByTrip.set(key, []);
      stopsByTrip.get(key)!.push(st);
    }

    return trips.map((t: any) => {
      const tStops = stopsByTrip.get(String(t.id)) || [];
      return {
        ...t,
        registration_no: t.registration_no ?? t.external_vehicle_no ?? null,
        driver_name:
          t.driver_name ??
          t.external_driver_name ??
          t.transporter_name ??
          null,
        driver_phone: t.driver_phone ?? t.external_driver_phone ?? null,
        stops: tStops,
        stops_count: tStops.length,
        delivered_count: tStops.filter((st: any) =>
          ['DELIVERED_FULL', 'DELIVERED_PARTIAL'].includes(st.status),
        ).length,
      };
    });
  }

  async dispatchTrip(tripId: string, lines: DispatchLine[], userId: string) {
    return this.knex.transaction(async (trx) => {
      const trip = await trx('delivery_trips')
        .where('id', tripId)
        .forUpdate()
        .first();
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status !== 'LOADING') {
        throw new ConflictException(`Trip cannot dispatch from ${trip.status}`);
      }

      const stops = await trx('delivery_stops').where('trip_id', tripId);
      if (stops.length === 0)
        throw new BadRequestException('Trip has no stops');
      const orderIds = stops
        .map((stop) => stop.sales_order_id)
        .filter((id): id is string => Boolean(id));
      for (const orderId of orderIds) {
        const decision = await this.credit.canDispatch(String(orderId));
        if (!decision.allowed) {
          throw new BadRequestException(
            `Order ${orderId} cannot dispatch: ${decision.reason ?? 'credit hold'}`,
          );
        }
      }

      // Validate all stop lines are supplied before mutating stock or trip state
      const linesByStop = new Map<string, DispatchLine[]>();
      for (const line of lines) {
        const current = linesByStop.get(line.stopId) ?? [];
        current.push(line);
        linesByStop.set(line.stopId, current);
      }
      for (const stop of stops) {
        const stopLines = linesByStop.get(String(stop.id)) ?? [];
        if (stopLines.length === 0) {
          throw new BadRequestException(
            `No loading lines supplied for stop ${stop.id}`,
          );
        }
      }

      // Single idempotent stock posting path: postDispatch synchronously once per stop
      // and persist each line's batch_id / loaded_qty individually.
      for (const stop of stops) {
        const stopLines = linesByStop.get(String(stop.id)) ?? [];
        await this.inventory.postDispatch(
          String(stop.id),
          stopLines.map((line) => ({
            itemId: line.itemId,
            batchId: line.batchId,
            qty: String(line.qty),
          })),
        );
        for (const line of stopLines) {
          await trx('delivery_stop_lines')
            .where({ stop_id: stop.id, item_id: line.itemId })
            .update({
              batch_id: line.batchId,
              loaded_qty: String(line.qty),
              updated_at: Clock.nowUtc(),
              updated_by: userId,
            });
        }
      }

      await trx('delivery_trips').where('id', tripId).update({
        status: 'IN_TRANSIT',
        started_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
        updated_by: userId,
      });

      if (trip.vehicle_id) {
        await trx('vehicles')
          .where('id', trip.vehicle_id)
          .update({
            status: 'IN_TRANSIT',
            updated_at: Clock.nowUtc(),
            updated_by: userId,
          });
      }

      // Transition linked sales orders to DISPATCHED
      for (const orderId of orderIds) {
        const so = await trx('sales_orders')
          .where('id', orderId)
          .first('order_status');
        if (so && ['CONFIRMED', 'READY', 'IN_PRODUCTION_SOURCING'].includes(so.order_status)) {
          await trx('sales_orders')
            .where('id', orderId)
            .update({ order_status: 'DISPATCHED', updated_at: Clock.nowUtc() });
          await trx('order_status_log').insert({
            order_id: orderId,
            from_status: so.order_status,
            to_status: 'DISPATCHED',
            by_user: userId,
            reason: `Dispatched on trip ${trip.trip_no}`,
          });
        }
      }

      await this.outbox.raise(
        trx,
        'trip.dispatched',
        String(trip.id),
        {
          tripId: String(trip.id),
          siteId: String(trip.site_id),
          stops: stops.map((stop) => ({
            stopId: String(stop.id),
            salesOrderId: String(stop.sales_order_id ?? ''),
            customerId: String(stop.customer_id),
            isCod: Boolean(stop.is_cod),
          })),
        },
        'm5',
      );
      return this.getTrip(tripId, trx);
    });
  }

  async deliverStop(
    stopId: string,
    dto: DeliverStopDto,
    userId: string,
    idempotencyKey: string,
  ) {
    const existing = await this.knex('delivery_stops')
      .where('idempotency_key', idempotencyKey)
      .first();
    if (existing) return this.getTrip(String(existing.trip_id));

    const stop = await this.knex('delivery_stops').where('id', stopId).first();
    if (!stop) throw new NotFoundException('Stop not found');
    if (stop.status !== 'PENDING') {
      throw new ConflictException('Stop is already finalized');
    }
    this.validateEpod(dto);

    const returnedQty = dto.lines.reduce(
      (sum, line) => sum + line.returnedQty,
      0,
    );
    const deliveredQty = dto.lines.reduce(
      (sum, line) => sum + line.deliveredQty,
      0,
    );
    const loadedQty = await this.knex('delivery_stop_lines')
      .where('stop_id', stopId)
      .sum('loaded_qty as total')
      .first();
    const totalLoaded = Number(loadedQty?.total ?? 0);
    if (deliveredQty + returnedQty > totalLoaded + 0.000001) {
      throw new BadRequestException(
        'Delivered and returned quantities exceed loaded quantity',
      );
    }
    // DELIVERED_PARTIAL if not all loaded qty was delivered (some returned or not delivered)
    const status =
      deliveredQty < totalLoaded ? 'DELIVERED_PARTIAL' : 'DELIVERED_FULL';

    return this.knex.transaction(async (trx) => {
      const locked = await trx('delivery_stops')
        .where('id', stopId)
        .forUpdate()
        .first();
      if (!locked || locked.status !== 'PENDING') {
        throw new ConflictException('Stop was finalized by another request');
      }
      await trx('delivery_stops')
        .where('id', stopId)
        .update({
          status,
          epod_method: dto.epodMethod,
          epod_signature_url: dto.epodSignatureUrl ?? null,
          epod_photo_url: dto.epodPhotoUrl ?? null,
          epod_otp_verified: dto.epodOtpVerified ?? false,
          gps_lat_lng: `(${dto.gpsLat},${dto.gpsLng})`,
          captured_at: dto.capturedAt,
          cod_collected_amount: String(dto.codCollectedAmount ?? 0),
          idempotency_key: idempotencyKey,
          delivered_at: Clock.nowUtc(),
          updated_by: userId,
        });
      for (const line of dto.lines) {
        await trx('delivery_stop_lines')
          .where({ stop_id: stopId, item_id: line.itemId })
          .update({
            delivered_qty: String(line.deliveredQty),
            returned_qty: String(line.returnedQty),
            batch_id: line.batchId ?? null,
            damaged: line.damaged ?? false,
            return_reason: line.returnReason ?? null,
            updated_at: Clock.nowUtc(),
          });
        if (line.returnedQty > 0 && line.batchId) {
          await this.inventory.postReturn(stopId, [
            {
              itemId: line.itemId,
              batchId: line.batchId,
              qty: String(line.returnedQty),
              damaged: line.damaged ?? false,
            },
          ]);
        }
      }
      // Transition linked sales order status on delivery
      if (stop.sales_order_id) {
        const so = await trx('sales_orders')
          .where('id', stop.sales_order_id)
          .first('order_status');
        if (so && ['CONFIRMED', 'READY', 'DISPATCHED'].includes(so.order_status)) {
          await trx('sales_orders')
            .where('id', stop.sales_order_id)
            .update({ order_status: status, updated_at: Clock.nowUtc() });
          await trx('order_status_log').insert({
            order_id: stop.sales_order_id,
            from_status: so.order_status,
            to_status: status,
            by_user: userId,
            reason: `Stop ${stopId} finalized (${status})`,
          });
        }
      }

      await this.outbox.raise(
        trx,
        returnedQty > 0 ? 'delivery.partial' : 'delivery.completed',
        stopId,
        {
          stopId,
          tripId: String(stop.trip_id),
          orderId: String(stop.sales_order_id ?? ''),
          customerId: String(stop.customer_id),
          deliveredLines: dto.lines.map((line) => ({
            itemId: line.itemId,
            deliveredQty: String(line.deliveredQty),
            batchId: String(line.batchId ?? ''),
          })),
          returnedLines: dto.lines
            .filter((line) => line.returnedQty > 0)
            .map((line) => ({
              itemId: line.itemId,
              returnedQty: String(line.returnedQty),
              batchId: String(line.batchId ?? ''),
              damaged: line.damaged ?? false,
            })),
          codAmount: String(dto.codCollectedAmount ?? 0),
        },
        'm5',
      );

      // Emit stops.returned event if there are returned items (for credit note generation)
      if (returnedQty > 0) {
        const returnedLines = dto.lines.filter((line) => line.returnedQty > 0);
        // Calculate total value of returned items
        let totalValue = Money.zero();
        for (const line of returnedLines) {
          const orderLine = await trx('sales_order_lines')
            .where({ order_id: stop.sales_order_id, item_id: line.itemId })
            .first('quoted_unit_price');
          if (orderLine) {
            const lineValue = Money.of(orderLine.quoted_unit_price).mul(
              line.returnedQty,
            );
            totalValue = totalValue.add(lineValue);
          }
        }

        await this.outbox.raise(
          trx,
          'stops.returned',
          stopId,
          {
            stopId,
            tripId: String(stop.trip_id),
            orderId: String(stop.sales_order_id ?? ''),
            customerId: String(stop.customer_id),
            returnedLines: returnedLines.map((line) => ({
              itemId: line.itemId,
              returnedQty: String(line.returnedQty),
              batchId: String(line.batchId ?? ''),
              damaged: line.damaged ?? false,
              reason: line.returnReason ?? undefined,
            })),
            totalValue: totalValue.toStorageString(),
          },
          'm5',
        );
      }

      return this.getTrip(String(stop.trip_id), trx);
    });
  }

  async failStop(stopId: string, dto: FailStopDto, userId: string) {
    const stop = await this.knex('delivery_stops').where('id', stopId).first();
    if (!stop) throw new NotFoundException('Stop not found');
    if (stop.status !== 'PENDING')
      throw new ConflictException('Stop is already finalized');
    await this.knex('delivery_stops')
      .where('id', stopId)
      .update({
        status: 'FAILED',
        reason_code: dto.reasonCode,
        exception_notes: dto.notes ?? null,
        delivered_at: Clock.nowUtc(),
        updated_by: userId,
      });
    await this.outbox.raiseStandalone(
      'delivery.failed',
      stopId,
      {
        stopId,
        tripId: String(stop.trip_id),
        orderId: String(stop.sales_order_id ?? ''),
        customerId: String(stop.customer_id),
        reasonCode: dto.reasonCode,
      },
      'm5',
    );
    return this.getTrip(String(stop.trip_id));
  }

  async closeTrip(tripId: string, userId: string) {
    return this.knex.transaction(async (trx) => {
      const trip = await trx('delivery_trips')
        .where('id', tripId)
        .forUpdate()
        .first();
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status !== 'IN_TRANSIT') {
        throw new ConflictException(`Trip cannot close from ${trip.status}`);
      }
      const stops = await trx('delivery_stops').where('trip_id', tripId);
      for (const stop of stops) {
        if (!FINAL_STOP_STATUSES.includes(stop.status)) {
          throw new BadRequestException(`Stop ${stop.id} is still pending`);
        }
        if (stop.status === 'DELIVERED_PARTIAL') {
          const returned = await trx('delivery_stop_lines')
            .where('stop_id', stop.id)
            .sum('returned_qty as total')
            .first();
          if (Number(returned?.total ?? 0) <= 0) {
            throw new BadRequestException(
              `Stop ${stop.id} has no returned quantity`,
            );
          }
        }
        if (stop.status === 'FAILED' && !stop.reason_code) {
          throw new BadRequestException(
            `Stop ${stop.id} requires a reason code`,
          );
        }
        if (
          stop.is_cod &&
          Number(stop.cod_collected_amount) < Number(stop.cod_amount)
        ) {
          throw new BadRequestException(
            `COD is not fully collected for stop ${stop.id}`,
          );
        }
      }
      await trx('delivery_trips').where('id', tripId).update({
        status: 'COMPLETED',
        closed_at: Clock.nowUtc(),
        closed_by: userId,
        updated_at: Clock.nowUtc(),
        updated_by: userId,
      });
      if (trip.vehicle_id) {
        await trx('vehicles')
          .where('id', trip.vehicle_id)
          .update({
            status: 'AVAILABLE',
            updated_at: Clock.nowUtc(),
            updated_by: userId,
          });
      }
      await this.outbox.raise(
        trx,
        'trip.closed',
        tripId,
        { tripId, siteId: String(trip.site_id) },
        'm5',
      );
      return this.getTrip(tripId, trx);
    });
  }

  async getMyTrip(driverId: string, tripDate = Clock.todayKolkata()) {
    const trip = await this.knex('delivery_trips')
      .where({ driver_id: driverId, trip_date: tripDate })
      .whereIn('status', ['LOADING', 'IN_TRANSIT'])
      .orderBy('created_at', 'desc')
      .first('id');
    return trip ? this.getTrip(String(trip.id)) : null;
  }

  async generateChallan(tripId: string, stopId: string, ewayBillNo?: string) {
    const stop = await this.knex('delivery_stops')
      .where({ id: stopId, trip_id: tripId })
      .first('id');
    if (!stop) throw new NotFoundException('Trip stop not found');
    const existing = await this.knex('delivery_challans')
      .where({ trip_id: tripId, stop_id: stopId })
      .first();
    if (existing) {
      if (ewayBillNo && existing.eway_bill_no !== ewayBillNo) {
        await this.knex('delivery_challans')
          .where('id', existing.id)
          .update({ eway_bill_no: ewayBillNo });
        existing.eway_bill_no = ewayBillNo;
      }
      return existing;
    }

    return this.knex.transaction(async (trx) => {
      const challanNo = await this.docNumber.next(
        'DELIVERY_CHALLAN',
        undefined,
        null,
        trx,
      );
      const [challan] = await trx('delivery_challans')
        .insert({
          challan_no: challanNo,
          trip_id: tripId,
          stop_id: stopId,
          eway_bill_no: ewayBillNo || null,
        })
        .returning('*');

      // Generate PDF if pdfGenerator is available
      if (this.pdfGenerator) {
        try {
          const pdfBuffer = await this.generateChallanPdf(
            tripId,
            stopId,
            challanNo,
          );
          // Store PDF buffer in attachments table and link to challan
          // For now, we'll just store it in memory and return the buffer
          // In production, this would upload to MinIO/S3
          (challan as any).pdfBuffer = pdfBuffer;
          (challan as any).pdfGeneratedAt = new Date();
        } catch (err) {
          // Log error but don't fail challan creation
          console.warn(
            `Failed to generate challan PDF: ${(err as Error).message}`,
          );
        }
      }

      return challan;
    });
  }

  async getChallanPdf(
    tripId: string,
    stopId: string,
  ): Promise<{ buffer: Buffer; challanNo: string }> {
    const challan = await this.generateChallan(tripId, stopId);
    const buffer = await this.generateChallanPdf(
      tripId,
      stopId,
      challan.challan_no,
    );
    return { buffer, challanNo: challan.challan_no };
  }

  public async generateChallanPdf(
    tripId: string,
    stopId: string,
    challanNo: string,
  ): Promise<Buffer> {
    // Fetch all required data for PDF
    const trip = await this.knex('delivery_trips')
      .where('id', tripId)
      .first('*');
    const stop = await this.knex('delivery_stops')
      .where({ id: stopId, trip_id: tripId })
      .first('*');
    const vehicle = trip.vehicle_id
      ? await this.knex('vehicles')
          .where('id', trip.vehicle_id)
          .first('registration_no')
      : null;
    const driver = trip.driver_id
      ? await this.knex('users')
          .where('id', trip.driver_id)
          .first('full_name')
      : null;
    const customer = await this.knex('customers')
      .where('id', stop.customer_id)
      .first('*');
    const site = await this.knex('sites').where('id', trip.site_id).first('*');
    const lines = await this.knex('delivery_stop_lines')
      .where('stop_id', stopId)
      .join('items', 'delivery_stop_lines.item_id', 'items.id')
      .select(
        'items.name as itemName',
        'items.hsn_code',
        'items.primary_uom as uom',
        'delivery_stop_lines.loaded_qty',
        'delivery_stop_lines.batch_id',
      );

    // Get batch details if available
    const batchIds = lines.map((l) => l.batch_id).filter(Boolean);
    let batchDetails = new Map();
    if (batchIds.length > 0) {
      const batches = await this.knex('inventory_batches')
        .whereIn('id', batchIds)
        .select('id', 'batch_number', 'expiry_date');
      batchDetails = new Map(batches.map((b) => [b.id, b]));
    }

    const challanRecord = await this.knex('delivery_challans')
      .where({ trip_id: tripId, stop_id: stopId })
      .first('eway_bill_no');

    const challanData = {
      challanNo,
      challanDate: new Date().toISOString().split('T')[0],
      tripNo: trip.trip_no,
      tripDate: trip.trip_date,
      vehicleNo:
        vehicle?.registration_no || trip.external_vehicle_no || trip.transporter_name || 'N/A',
      driverName:
        driver?.full_name || trip.external_driver_name || trip.transporter_name || 'N/A',
      customerName: customer?.business_name || customer?.customer_code || 'N/A',
      customerAddress: customer?.billing_address || 'N/A',
      customerGstin: customer?.gstin || 'N/A',
      customerStateCode: customer?.state_code || 'N/A',
      ewayBillNo: challanRecord?.eway_bill_no || undefined,
      siteName: site?.name || 'N/A',
      siteAddress: site?.address || 'N/A',
      siteGstin: site?.gstin || 'N/A',
      siteStateCode: site?.state_code || 'N/A',
      lines: lines.map((line) => ({
        itemName: line.itemName,
        hsnCode: line.hsn_code || 'N/A',
        uom: line.uom,
        loadedQty: line.loaded_qty,
        batchNo: batchDetails.get(line.batch_id)?.batch_number,
        expiryDate: batchDetails.get(line.batch_id)?.expiry_date,
      })),
    };

    return this.pdfGenerator!.generateChallan(challanData);
  }

  async createIssue(tripId: string, dto: CreateIssueDto, userId: string) {
    const trip = await this.knex('delivery_trips').where('id', tripId).first();
    if (!trip) throw new NotFoundException('Trip not found');
    const threshold =
      (await this.config.getNumber(
        'owner_escalation_value_inr',
        'SITE',
        String(trip.site_id),
      )) ??
      (await this.config.getNumber('owner_escalation_value_inr')) ??
      5000;
    const shouldEscalate =
      dto.category === 'CUSTOMER_FULL_REJECTION' ||
      Number(dto.valueAtRisk ?? 0) >= threshold;
    const [issue] = await this.knex('issue_reports')
      .insert({
        site_id: trip.site_id,
        trip_id: tripId,
        stop_id: dto.stopId ?? null,
        reported_by: userId,
        category: dto.category,
        rejected_qty: String(dto.rejectedQty ?? 0),
        value_at_risk: Money.of(dto.valueAtRisk ?? 0).toStorageString(),
        photo_attachment_id: dto.photoAttachmentId ?? null,
        status: shouldEscalate ? 'ESCALATED' : 'OPEN',
      })
      .returning('*');
    await this.outbox.raiseStandalone(
      shouldEscalate ? 'issue.escalated' : 'issue.reported',
      String(issue.id),
      {
        issueId: String(issue.id),
        tripId,
        category: dto.category,
        valueAtRisk: String(dto.valueAtRisk ?? 0),
      },
      'm5',
    );
    if (shouldEscalate && this.exception) {
      await this.exception.raise(
        'DELIVERY_DISPUTE',
        'issue_reports',
        String(issue.id),
        userId,
        {
          title: 'Delivery dispute escalation',
          summary: dto.category,
          facts: [
            { label: 'Value at risk', value: String(dto.valueAtRisk ?? 0) },
          ],
          impact: 'Delivery outcome requires owner review',
          actions: [
            { code: 'APPROVED', label: 'Approve' },
            { code: 'REJECTED', label: 'Reject' },
          ],
          valueAtRisk: String(dto.valueAtRisk ?? 0),
        },
        String(trip.site_id),
      );
    } else {
      await this.notify?.send(
        'IN_APP',
        'DELIVERY_ISSUE_REPORTED',
        String(trip.site_id),
        {
          issueId: String(issue.id),
          tripId,
        },
      );
    }
    return issue;
  }

  async resolveIssue(issueId: string, dto: ResolveIssueDto, userId: string) {
    const issue = await this.knex('issue_reports').where('id', issueId).first();
    if (!issue) throw new NotFoundException('Issue not found');
    const status = dto.escalate ? 'ESCALATED' : 'RESOLVED';
    const [updated] = await this.knex('issue_reports')
      .where('id', issueId)
      .update({
        status,
        resolved_by: userId,
        resolution_note: dto.resolutionNote,
        updated_at: Clock.nowUtc(),
      })
      .returning('*');
    return updated;
  }

  async createExpense(tripId: string, dto: CreateExpenseDto, userId: string) {
    const trip = await this.knex('delivery_trips')
      .where('id', tripId)
      .first('site_id');
    if (!trip) throw new NotFoundException('Trip not found');
    const [expense] = await this.knex('trip_expenses')
      .insert({
        site_id: trip.site_id,
        trip_id: tripId,
        type: dto.type,
        amount: Money.of(dto.amount).toStorageString(),
        receipt_attachment_id: dto.receiptAttachmentId ?? null,
        notes: dto.notes ?? null,
        logged_by: userId,
      })
      .returning('*');
    return expense;
  }

  private validateEpod(dto: DeliverStopDto): void {
    if (dto.epodMethod === 'SIGNATURE' && !dto.epodSignatureUrl) {
      throw new BadRequestException('Signature URL is required');
    }
    if (dto.epodMethod === 'PHOTO' && !dto.epodPhotoUrl) {
      throw new BadRequestException('Photo URL is required');
    }
    if (dto.epodMethod === 'OTP' && !dto.epodOtpVerified) {
      throw new BadRequestException('OTP must be verified');
    }
    if (!Clock.isTimestampAcceptable(dto.capturedAt)) {
      throw new BadRequestException(
        'Captured timestamp is outside the allowed clock skew',
      );
    }
    if (
      dto.gpsLat < -90 ||
      dto.gpsLat > 90 ||
      dto.gpsLng < -180 ||
      dto.gpsLng > 180
    ) {
      throw new BadRequestException('GPS coordinates are invalid');
    }
  }

  async confirmLoading(tripId: string, verifiedCratesCount: number, userId: string) {
    const trip = await this.knex('delivery_trips').where('id', tripId).first();
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    if (trip.status !== 'LOADING') {
      throw new ConflictException(`Trip must be in LOADING status (current: ${trip.status})`);
    }
    const [updated] = await this.knex('delivery_trips')
      .where('id', tripId)
      .update({
        updated_at: Clock.nowUtc(),
        updated_by: userId,
      })
      .returning('*');
    return {
      tripId,
      verifiedCratesCount,
      status: 'LOADING_CONFIRMED',
      trip: updated,
    };
  }

  async listIssues(filter: { siteId?: string; tripId?: string; status?: string }) {
    let query = this.knex('issue_reports as ir')
      .leftJoin('delivery_trips as dt', 'ir.trip_id', 'dt.id')
      .leftJoin('delivery_stops as ds', 'ir.stop_id', 'ds.id')
      .leftJoin('sales_orders as so', 'ds.sales_order_id', 'so.id')
      .leftJoin('customers as c', 'ds.customer_id', 'c.id')
      .leftJoin('sites as s', 'ir.site_id', 's.id')
      .select(
        'ir.*',
        'dt.trip_no',
        's.name as site_name',
        'so.order_no as stop_order_no',
        'c.business_name as customer_name',
      );
    if (this.isUuid(filter.siteId))
      query = query.where('ir.site_id', filter.siteId);
    if (this.isUuid(filter.tripId))
      query = query.where('ir.trip_id', filter.tripId);
    if (filter.status) query = query.where('ir.status', filter.status);
    return query.orderBy('ir.created_at', 'desc');
  }

  async listExpenses(filter: { siteId?: string; tripId?: string }) {
    let query = this.knex('trip_expenses as te')
      .leftJoin('delivery_trips as dt', 'te.trip_id', 'dt.id')
      .leftJoin('vehicles as v', 'dt.vehicle_id', 'v.id')
      .leftJoin('sites as s', 'te.site_id', 's.id')
      .select('te.*', 'dt.trip_no', 'v.registration_no', 's.name as site_name');
    if (this.isUuid(filter.siteId))
      query = query.where('te.site_id', filter.siteId);
    if (this.isUuid(filter.tripId))
      query = query.where('te.trip_id', filter.tripId);
    return query.orderBy('te.logged_at', 'desc');
  }

  async updateVehicle(
    id: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const patch: Record<string, any> = { updated_at: new Date() };
    if (userId && this.isUuid(userId)) patch.updated_by = userId;
    if (body.registrationNo !== undefined)
      patch.registration_no = String(body.registrationNo).trim().toUpperCase();
    if (body.vehicleType !== undefined)
      patch.vehicle_type = String(body.vehicleType).trim();
    if (body.capacityKg !== undefined)
      patch.capacity_kg = String(body.capacityKg);
    if (body.capacityCrates !== undefined)
      patch.capacity_crates =
        body.capacityCrates === null || body.capacityCrates === ''
          ? null
          : Number(body.capacityCrates);
    if (body.ownershipType !== undefined)
      patch.ownership_type = String(body.ownershipType).trim().toUpperCase();
    if (body.defaultDriverName !== undefined)
      patch.default_driver_name =
        typeof body.defaultDriverName === 'string' && body.defaultDriverName.trim()
          ? body.defaultDriverName.trim()
          : null;
    if (body.defaultDriverPhone !== undefined)
      patch.default_driver_phone =
        typeof body.defaultDriverPhone === 'string' && body.defaultDriverPhone.trim()
          ? body.defaultDriverPhone.trim()
          : null;
    if (body.fitnessExpiry !== undefined)
      patch.fitness_expiry = this.normalizeDateInput(body.fitnessExpiry);
    if (body.insuranceExpiry !== undefined)
      patch.insurance_expiry = this.normalizeDateInput(body.insuranceExpiry);
    if (body.pucExpiry !== undefined)
      patch.puc_expiry = this.normalizeDateInput(body.pucExpiry);
    if (body.status !== undefined)
      patch.status = String(body.status).trim().toUpperCase();
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    const [updated] = await this.knex('vehicles')
      .where('id', id)
      .update(patch)
      .returning('*');
    if (!updated) throw new NotFoundException(`Vehicle ${id} not found`);
    return updated;
  }

  async listVehicleMonitoring(siteId?: string) {
    const vehicles = await this.listVehicles(siteId);
    const activeTrips = await this.listTrips(siteId);
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const tripByVehicle = new Map<string, any>();
    const activeTripByDriver = new Map<string, any>();
    const monthlyStatsByVehicle = new Map<string, { trips: number; km: number }>();

    for (const t of activeTrips) {
      if (t.vehicle_id && !tripByVehicle.has(String(t.vehicle_id))) {
        tripByVehicle.set(String(t.vehicle_id), t);
      }
      if (
        t.driver_id &&
        ['LOADING', 'IN_TRANSIT'].includes(String(t.status)) &&
        !activeTripByDriver.has(String(t.driver_id))
      ) {
        activeTripByDriver.set(String(t.driver_id), t);
      }
      if (t.vehicle_id && String(t.trip_date ?? '').startsWith(monthPrefix)) {
        const key = String(t.vehicle_id);
        const cur = monthlyStatsByVehicle.get(key) ?? { trips: 0, km: 0 };
        cur.trips += 1;
        cur.km += Number(t.planned_distance_km ?? 0);
        monthlyStatsByVehicle.set(key, cur);
      }
    }

    const enrichedVehicles = vehicles.map((v: any) => {
      const latestTrip = tripByVehicle.get(String(v.id)) || null;
      const mStats = monthlyStatsByVehicle.get(String(v.id)) ?? {
        trips: 0,
        km: 0,
      };
      return {
        ...v,
        activeTrip: latestTrip,
        currentStatus: latestTrip?.status ?? v.status ?? 'IDLE',
        driverName: latestTrip?.driver_name ?? v.default_driver_name ?? null,
        tripsThisMonth: mStats.trips,
        kmThisMonth: mStats.km,
      };
    });

    let driversQuery = this.knex('users')
      .where({ role: 'DRIVER', is_active: true })
      .select('id', 'full_name', 'phone', 'assigned_site_id');
    let collectorsQuery = this.knex('users')
      .where({ role: 'COLLECTOR', is_active: true })
      .select('id', 'full_name', 'phone', 'assigned_site_id');
    if (this.isUuid(siteId)) {
      driversQuery = driversQuery.andWhere('assigned_site_id', siteId);
      collectorsQuery = collectorsQuery.andWhere('assigned_site_id', siteId);
    }

    const [driverRows, collectorRows] = await Promise.all([
      driversQuery.orderBy('full_name', 'asc'),
      collectorsQuery.orderBy('full_name', 'asc'),
    ]);

    const todayStr = Clock.todayKolkata();
    const collectorReceipts = await this.knex('collection_receipts')
      .whereRaw('receipt_date = ?', [todayStr])
      .select('collected_by_user_id', 'payment_mode', 'amount')
      .catch(() => []);

    const drivers = driverRows.map((d: any) => {
      const activeTrip = activeTripByDriver.get(String(d.id));
      return {
        id: d.id,
        name: d.full_name,
        full_name: d.full_name,
        phone: d.phone,
        activeTripNo: activeTrip?.trip_no ?? null,
      };
    });

    const collectors = collectorRows.map((c: any) => {
      const myReceipts = collectorReceipts.filter(
        (r: any) => String(r.collected_by_user_id) === String(c.id),
      );
      const walletCashInr = myReceipts
        .filter((r: any) => String(r.payment_mode) === 'CASH')
        .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      const walletChequeInr = myReceipts
        .filter((r: any) => String(r.payment_mode) === 'CHEQUE')
        .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      return {
        id: c.id,
        name: c.full_name,
        phone: c.phone,
        pendingVisits: 0,
        walletCashInr,
        walletChequeInr,
        handoverStatus: myReceipts.length > 0 ? 'SETTLED' : 'PENDING',
      };
    });

    return {
      vehicles: enrichedVehicles,
      drivers,
      collectors,
    };
  }

  async getTripLocation(tripId: string) {
    const trip = await this.knex('delivery_trips')
      .where('id', tripId)
      .first('id', 'status', 'route_polyline', 'updated_at');
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    let coords: { lat?: number | null; lng?: number | null } = {
      lat: null,
      lng: null,
    };
    if (trip.route_polyline) {
      try {
        const parsed = JSON.parse(trip.route_polyline);
        if (parsed && typeof parsed.lat === 'number') {
          coords = { lat: parsed.lat, lng: parsed.lng ?? null };
        }
      } catch {
        // leave null when route_polyline is a non-JSON polyline string
      }
    }
    return {
      tripId,
      status: trip.status,
      lat: coords.lat ?? null,
      lng: coords.lng ?? null,
      updatedAt: trip.updated_at,
    };
  }

  async postTripLocation(
    tripId: string,
    lat: number,
    lng: number,
    userId?: string,
  ) {
    const now = new Date();
    const payload = JSON.stringify({
      lat,
      lng,
      updatedAt: now.toISOString(),
    });
    const [updated] = await this.knex('delivery_trips')
      .where('id', tripId)
      .update({
        route_polyline: payload,
        updated_at: now,
        ...(userId && this.isUuid(userId) ? { updated_by: userId } : {}),
      })
      .returning('id');
    if (!updated) throw new NotFoundException(`Trip ${tripId} not found`);
    return { tripId, lat, lng, updatedAt: now.toISOString() };
  }

  async getPreferences(userId: string) {
    const key = `USER_PREFS_${userId}`;
    const row = await this.knex('business_rule_config').where({ key }).first();
    const prefs = row?.value_json ?? {};
    return {
      userId,
      density: prefs.density ?? 'comfortable',
      pinnedRoutes: Array.isArray(prefs.pinnedRoutes) ? prefs.pinnedRoutes : [],
      ...prefs,
    };
  }

  async savePreferences(userId: string, body: Record<string, unknown>) {
    const key = `USER_PREFS_${userId}`;
    const now = new Date();
    const existing = await this.knex('business_rule_config')
      .where({ key })
      .first();
    const valueJson = { ...(existing?.value_json ?? {}), ...body };
    if (existing) {
      await this.knex('business_rule_config').where({ key }).update({
        value_json: JSON.stringify(valueJson),
        updated_by: this.isUuid(userId) ? userId : null,
        updated_at: now,
      });
    } else {
      await this.knex('business_rule_config').insert({
        key,
        value_json: JSON.stringify(valueJson),
        scope: 'GLOBAL',
        scope_ref: userId,
        description: `User UI preferences for ${userId}`,
        updated_by: this.isUuid(userId) ? userId : null,
        updated_at: now,
      });
    }
    return { userId, ...valueJson, savedAt: now.toISOString() };
  }

  async listSalesReturns(siteId?: string) {
    let query = this.knex('credit_notes as cn')
      .leftJoin('customers as c', 'cn.customer_id', 'c.id')
      .leftJoin('sites as s', 'cn.site_id', 's.id')
      .select(
        'cn.*',
        'c.business_name as customer_name',
        's.name as site_name',
      )
      .orderBy('cn.created_at', 'desc');
    if (this.isUuid(siteId)) query = query.where('cn.site_id', siteId);
    const data = await query;
    return { data, meta: { total: data.length, limit: 50, offset: 0 } };
  }

  async createSalesReturn(body: Record<string, unknown>, userId?: string) {
    const now = new Date();
    const id = randomUUID();
    const creditNoteNo =
      typeof body.creditNoteNo === 'string' && body.creditNoteNo
        ? body.creditNoteNo
        : `SR-${Date.now().toString(36).toUpperCase()}`;
    const siteId = String(body.siteId || '');
    const customerId = String(body.customerId || '');
    const orderId = body.orderId ? String(body.orderId) : null;
    const totalDebit = Number(body.totalDebit ?? body.amount ?? 0);
    if (!this.isUuid(siteId) || !this.isUuid(customerId)) {
      throw new BadRequestException(
        'Valid siteId and customerId UUIDs are required',
      );
    }
    const [row] = await this.knex('credit_notes')
      .insert({
        id,
        credit_note_no: creditNoteNo,
        site_id: siteId,
        customer_id: customerId,
        order_id: orderId,
        status: 'DRAFT',
        reason_type: String(body.reasonType || 'RETURN'),
        total_debit: totalDebit,
        status_reason: body.notes ? String(body.notes) : null,
        created_by: userId && this.isUuid(userId) ? userId : null,
        updated_by: userId && this.isUuid(userId) ? userId : null,
        created_at: now,
        updated_at: now,
      })
      .returning('*');
    return row;
  }

  async listWorkers(siteId?: string) {
    let query = this.knex('users as u')
      .leftJoin('sites as s', 'u.assigned_site_id', 's.id')
      .whereIn('u.role', ['PROD_MGR', 'STOREKEEPER', 'WORKER', 'OPERATOR'])
      .select(
        'u.id',
        'u.full_name as fullName',
        'u.phone',
        'u.role',
        'u.assigned_site_id as siteId',
        's.name as siteName',
        'u.is_active as isActive',
        'u.created_at as createdAt',
      )
      .orderBy('u.full_name', 'asc');
    if (this.isUuid(siteId)) {
      query = query.where('u.assigned_site_id', siteId);
    }
    const data = await query;
    return { siteId: siteId ?? null, data };
  }

  async createWorker(body: Record<string, unknown>, userId?: string) {
    const id = randomUUID();
    const now = new Date();
    const fullName = String(body.fullName || body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (!fullName || !phone) {
      throw new BadRequestException('fullName and phone are required');
    }
    const siteId = body.siteId && this.isUuid(String(body.siteId))
      ? String(body.siteId)
      : null;
    const role = String(body.role || 'PROD_MGR');
    const [row] = await this.knex('users')
      .insert({
        id,
        full_name: fullName,
        phone,
        role,
        assigned_site_id: siteId,
        is_active: true,
        created_by: userId && this.isUuid(userId) ? userId : null,
        updated_by: userId && this.isUuid(userId) ? userId : null,
        created_at: now,
        updated_at: now,
      })
      .returning([
        'id',
        'full_name as fullName',
        'phone',
        'role',
        'assigned_site_id as siteId',
        'is_active as isActive',
      ]);
    return row;
  }

  async updateWorker(
    id: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const patch: Record<string, any> = { updated_at: new Date() };
    if (userId && this.isUuid(userId)) patch.updated_by = userId;
    if (body.fullName !== undefined)
      patch.full_name = String(body.fullName).trim();
    if (body.phone !== undefined) patch.phone = String(body.phone).trim();
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    if (body.siteId !== undefined && this.isUuid(String(body.siteId))) {
      patch.assigned_site_id = String(body.siteId);
    }
    const [row] = await this.knex('users')
      .where('id', id)
      .update(patch)
      .returning([
        'id',
        'full_name as fullName',
        'phone',
        'role',
        'assigned_site_id as siteId',
        'is_active as isActive',
      ]);
    if (!row) throw new NotFoundException(`Worker ${id} not found`);
    return row;
  }

  async createSupplierPayment(body: Record<string, unknown>, userId?: string) {
    const billId = body.billId ? String(body.billId) : null;
    if (billId && this.isUuid(billId)) {
      const [bill] = await this.knex('supplier_bills')
        .where('id', billId)
        .update({
          status: 'PAID',
          updated_by: userId && this.isUuid(userId) ? userId : null,
          updated_at: new Date(),
        })
        .returning('*');
      if (!bill) throw new NotFoundException(`Supplier bill ${billId} not found`);
      return bill;
    }
    throw new BadRequestException('Valid billId UUID is required');
  }

  async getApAging(siteId?: string) {
    let query = this.knex('supplier_bills as sb')
      .join('suppliers as s', 'sb.supplier_id', 's.id')
      .whereIn('sb.status', ['APPROVED', 'RECEIVED', 'VERIFIED', 'PENDING_APPROVAL']);
    if (this.isUuid(siteId)) {
      query = query.where('sb.site_id', siteId);
    }
    const bills = await query.select(
      'sb.id',
      'sb.supplier_id',
      's.company_name as supplier_name',
      'sb.due_date',
      'sb.total_amount',
      'sb.amount',
    );
    const now = Date.now();
    const buckets: Record<
      string,
      { bucket: string; label: string; amountInr: number; billCount: number }
    > = {
      '0_7': { bucket: '0_7', label: '0-7 Days', amountInr: 0, billCount: 0 },
      '8_15': { bucket: '8_15', label: '8-15 Days', amountInr: 0, billCount: 0 },
      '16_30': {
        bucket: '16_30',
        label: '16-30 Days',
        amountInr: 0,
        billCount: 0,
      },
      '30_PLUS': {
        bucket: '30_PLUS',
        label: '30+ Days',
        amountInr: 0,
        billCount: 0,
      },
    };
    for (const b of bills) {
      const amt = Number(b.total_amount ?? b.amount ?? 0);
      const due = b.due_date ? new Date(b.due_date).getTime() : now;
      const days = Math.max(0, Math.floor((now - due) / (1000 * 60 * 60 * 24)));
      const key =
        days <= 7 ? '0_7' : days <= 15 ? '8_15' : days <= 30 ? '16_30' : '30_PLUS';
      buckets[key].amountInr += amt;
      buckets[key].billCount += 1;
    }
    return { siteId: siteId ?? null, buckets: Object.values(buckets), bills };
  }

  async confirmFileUpload(body: Record<string, unknown>, userId?: string) {
    const id = randomUUID();
    const [row] = await this.knex('attachments')
      .insert({
        id,
        entity_name: String(body.entityName || body.entityType || 'GENERAL'),
        entity_id: String(body.entityId),
        storage_key: String(body.fileKey || body.storageKey || id),
        mime_type: String(body.mimeType || 'application/octet-stream'),
        file_size_bytes: body.fileSizeBytes ? Number(body.fileSizeBytes) : null,
        uploaded_by: userId && this.isUuid(userId) ? userId : id,
        created_at: new Date(),
      })
      .returning('*');
    return row;
  }

  async listEntityFiles(entityType: string, entityId: string) {
    if (!this.isUuid(entityId)) {
      return { entityType, entityId, files: [] };
    }
    const files = await this.knex('attachments')
      .where({ entity_name: entityType, entity_id: entityId })
      .orderBy('created_at', 'desc');
    return { entityType, entityId, files };
  }

  async revokeUserSessions(userId: string) {
    const deleted = await this.knex('refresh_tokens')
      .where('user_id', userId)
      .del();
    return { userId, revoked: true, deletedTokens: deleted };
  }

  async listAdminPermissions() {
    const rows = await this.knex('role_permissions')
      .select('role', 'permission_code as permissionCode', 'scope')
      .orderBy('role', 'asc')
      .orderBy('permission_code', 'asc');
    return { permissions: rows };
  }

  async listWarehouses(siteId?: string) {
    let query = this.knex('locations as l')
      .leftJoin('sites as s', 'l.site_id', 's.id')
      .select('l.*', 's.name as site_name')
      .orderBy('l.name', 'asc');
    if (this.isUuid(siteId)) query = query.where('l.site_id', siteId);
    const data = await query;
    return { data };
  }

  async createWarehouse(body: Record<string, unknown>, userId?: string) {
    const id = randomUUID();
    const now = new Date();
    const siteId = String(body.siteId || '');
    if (!this.isUuid(siteId)) {
      throw new BadRequestException('Valid siteId UUID is required');
    }
    const [row] = await this.knex('locations')
      .insert({
        id,
        site_id: siteId,
        name: String(body.name || 'Warehouse').trim(),
        location_type: String(body.locationType || body.type || 'TRADING_WAREHOUSE'),
        is_active: body.isActive !== false,
        created_at: now,
        updated_at: now,
        created_by: userId && this.isUuid(userId) ? userId : null,
        updated_by: userId && this.isUuid(userId) ? userId : null,
      })
      .returning('*');
    return row;
  }

  async updateWarehouse(
    id: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const patch: Record<string, any> = { updated_at: new Date() };
    if (userId && this.isUuid(userId)) patch.updated_by = userId;
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.locationType !== undefined)
      patch.location_type = String(body.locationType);
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    const [row] = await this.knex('locations')
      .where('id', id)
      .update(patch)
      .returning('*');
    if (!row) throw new NotFoundException(`Warehouse ${id} not found`);
    return row;
  }

  async listNumberingSeries(siteId?: string) {
    let query = this.knex('doc_sequences as ds')
      .leftJoin('sites as s', 'ds.site_id', 's.id')
      .select('ds.*', 's.name as site_name')
      .orderBy('ds.doc_type', 'asc');
    if (this.isUuid(siteId)) query = query.where('ds.site_id', siteId);
    const data = await query;
    return { data };
  }

  async updateNumberingSeries(id: string, body: Record<string, unknown>) {
    const patch: Record<string, any> = {};
    if (body.prefix !== undefined) patch.prefix = String(body.prefix);
    if (body.lastNo !== undefined) patch.last_no = Number(body.lastNo);
    const [updated] = await this.knex('doc_sequences')
      .where('doc_type', id)
      .update(patch)
      .returning('*');
    return updated ?? { doc_type: id, ...patch };
  }

  async listFeatureFlags() {
    const rows = await this.knex('business_rule_config')
      .where('scope', 'GLOBAL')
      .whereNot('key', 'company_profile')
      .whereNot('key', 'notification_templates')
      .whereRaw("key NOT LIKE 'USER_PREFS_%'")
      .orderBy('key', 'asc');
    const flags = rows.map((r: any) => ({
      key: r.key,
      value: r.value_json,
      enabled:
        typeof r.value_json === 'boolean'
          ? r.value_json
          : Boolean(r.value_json?.enabled ?? r.value_json),
      description: r.description,
      updatedAt: r.updated_at,
    }));
    return { flags };
  }

  async updateFeatureFlag(key: string, enabled: boolean, userId?: string) {
    const now = new Date();
    const existing = await this.knex('business_rule_config')
      .where({ key })
      .first();
    if (existing) {
      await this.knex('business_rule_config').where({ key }).update({
        value_json: JSON.stringify(enabled),
        updated_by: userId && this.isUuid(userId) ? userId : null,
        updated_at: now,
      });
    } else {
      await this.knex('business_rule_config').insert({
        key,
        value_json: JSON.stringify(enabled),
        scope: 'GLOBAL',
        description: `Feature flag ${key}`,
        updated_by: userId && this.isUuid(userId) ? userId : null,
        updated_at: now,
      });
    }
    return { key, enabled };
  }

  async getAuditLogById(id: string) {
    const row = await this.knex('immutable_audit_logs as a')
      .leftJoin('users as u', 'a.user_id', 'u.id')
      .where('a.id', id)
      .select('a.*', 'u.full_name as user_name', 'u.role as user_role')
      .first();
    if (!row) throw new NotFoundException(`Audit log ${id} not found`);
    return {
      ...row,
      beforeJson: row.old_value_json ?? {},
      afterJson: row.new_value_json ?? {},
    };
  }

  async listNotificationLogs() {
    const data = await this.knex('notification_outbox')
      .orderBy('created_at', 'desc')
      .limit(200);
    return { data };
  }

  async retryNotificationDelivery(id: string) {
    const [row] = await this.knex('notification_outbox')
      .where('id', id)
      .update({
        status: 'QUEUED',
        attempts: this.knex.raw('COALESCE(attempts, 0) + 1'),
        error: null,
      })
      .returning('*');
    if (!row) throw new NotFoundException(`Notification log ${id} not found`);
    return row;
  }

  async listQuotations(siteId?: string) {
    let query = this.knex('quotes as q')
      .leftJoin('customers as c', 'q.customer_id', 'c.id')
      .leftJoin('sites as s', 'q.site_id', 's.id')
      .select(
        'q.*',
        'c.business_name as customer_name',
        's.name as site_name',
      )
      .orderBy('q.created_at', 'desc');
    if (this.isUuid(siteId)) query = query.where('q.site_id', siteId);
    const data = await query;
    return { data };
  }

  async listDrivers(siteId?: string) {
    let query = this.knex('users as u')
      .leftJoin('sites as s', 'u.assigned_site_id', 's.id')
      .where('u.role', 'DRIVER')
      .select(
        'u.id',
        'u.full_name as fullName',
        'u.phone',
        'u.role',
        'u.assigned_site_id as siteId',
        's.name as siteName',
        'u.is_active as isActive',
      )
      .orderBy('u.full_name', 'asc');
    if (this.isUuid(siteId)) {
      query = query.where('u.assigned_site_id', siteId);
    }
    const data = await query;
    return { data };
  }

  async createDriver(body: Record<string, unknown>, userId?: string) {
    return this.createWorker({ ...body, role: 'DRIVER' }, userId);
  }

  async updateDriver(
    id: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    return this.updateWorker(id, body, userId);
  }

  async settleTrip(id: string, body: Record<string, unknown>, userId?: string) {
    const actor = userId && this.isUuid(userId) ? userId : '';
    const closed = await this.closeTrip(id, actor);
    return { tripId: id, ...body, status: closed.status, trip: closed };
  }

  getReportCatalog() {
    return {
      reports: [
        {
          key: 'sales-by-customer',
          name: 'Sales by Customer',
          category: 'Commercial',
          params: ['siteId', 'from', 'to'],
        },
        {
          key: 'collections-summary',
          name: 'Collections Summary',
          category: 'Finance',
          params: ['siteId', 'from', 'to'],
        },
        {
          key: 'stock-valuation',
          name: 'Inventory Stock Summary',
          category: 'Inventory',
          params: ['siteId'],
        },
        {
          key: 'production-wastage',
          name: 'Production & Wastage Summary',
          category: 'Production',
          params: ['siteId'],
        },
        {
          key: 'trip-summary',
          name: 'Fleet Trip Performance',
          category: 'Logistics',
          params: ['siteId'],
        },
      ],
    };
  }

  async runParameterizedReport(
    reportKey: string,
    body: Record<string, unknown>,
  ) {
    const siteId = typeof body?.siteId === 'string' ? body.siteId : undefined;
    if (reportKey === 'sales-by-customer') {
      let q = this.knex('sales_orders as so')
        .join('customers as c', 'so.customer_id', 'c.id')
        .whereNotIn('so.order_status', ['CANCELLED'])
        .groupBy('c.id', 'c.business_name')
        .select(
          'c.id as customerId',
          'c.business_name as customerName',
          this.knex.raw('COUNT(so.id)::int as orderCount'),
          this.knex.raw('COALESCE(SUM(so.total_amount), 0) as totalSalesInr'),
        );
      if (this.isUuid(siteId)) q = q.where('so.fulfillment_site_id', siteId);
      const rows = await q.orderBy('totalSalesInr', 'desc');
      return { reportKey, params: body, rows };
    }
    if (reportKey === 'collections-summary') {
      let q = this.knex('collection_receipts as cr')
        .groupBy('cr.payment_mode')
        .select(
          'cr.payment_mode as paymentMode',
          this.knex.raw('COUNT(cr.id)::int as receiptCount'),
          this.knex.raw('COALESCE(SUM(cr.amount), 0) as totalCollectedInr'),
        );
      if (this.isUuid(siteId)) q = q.where('cr.site_id', siteId);
      const rows = await q;
      return { reportKey, params: body, rows };
    }
    if (reportKey === 'stock-valuation') {
      let q = this.knex('inventory_batches as ib')
        .join('items as i', 'ib.item_id', 'i.id')
        .groupBy('i.id', 'i.sku_code', 'i.name', 'i.primary_uom')
        .select(
          'i.id as itemId',
          'i.sku_code as skuCode',
          'i.name as itemName',
          'i.primary_uom as uom',
          this.knex.raw('COALESCE(SUM(ib.qty_on_hand), 0) as qtyOnHand'),
          this.knex.raw('COALESCE(SUM(ib.qty_available), 0) as qtyAvailable'),
        );
      if (this.isUuid(siteId)) q = q.where('ib.site_id', siteId);
      const rows = await q;
      return { reportKey, params: body, rows };
    }
    if (reportKey === 'production-wastage') {
      let q = this.knex('production_work_orders as wo')
        .groupBy('wo.status')
        .select(
          'wo.status',
          this.knex.raw('COUNT(wo.id)::int as count'),
          this.knex.raw('COALESCE(SUM(wo.planned_qty), 0) as plannedQty'),
        );
      if (this.isUuid(siteId)) q = q.where('wo.site_id', siteId);
      const rows = await q;
      return { reportKey, params: body, rows };
    }
    if (reportKey === 'trip-summary') {
      let q = this.knex('delivery_trips as dt')
        .groupBy('dt.status')
        .select(
          'dt.status',
          this.knex.raw('COUNT(dt.id)::int as tripCount'),
        );
      if (this.isUuid(siteId)) q = q.where('dt.site_id', siteId);
      const rows = await q;
      return { reportKey, params: body, rows };
    }
    return { reportKey, params: body, rows: [] };
  }

  async validateImport(entity: string, rows: Array<Record<string, unknown>> = []) {
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const normalizedEntity = entity.toLowerCase();
    if (!['items', 'customers', 'suppliers'].includes(normalizedEntity)) {
      return {
        entity,
        validCount: 0,
        errors: [{ row: 0, field: 'entity', message: `Unsupported entity: ${entity}` }],
      };
    }

    let validCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      if (normalizedEntity === 'items') {
        if (!r.skuCode && !r.sku_code) {
          errors.push({ row: i + 1, field: 'skuCode', message: 'skuCode is required' });
          continue;
        }
        if (!r.name) {
          errors.push({ row: i + 1, field: 'name', message: 'name is required' });
          continue;
        }
      } else if (normalizedEntity === 'customers') {
        if (!r.businessName && !r.business_name) {
          errors.push({ row: i + 1, field: 'businessName', message: 'businessName is required' });
          continue;
        }
        if (!r.phone) {
          errors.push({ row: i + 1, field: 'phone', message: 'phone is required' });
          continue;
        }
      } else if (normalizedEntity === 'suppliers') {
        if (!r.companyName && !r.company_name) {
          errors.push({ row: i + 1, field: 'companyName', message: 'companyName is required' });
          continue;
        }
        if (!r.phone) {
          errors.push({ row: i + 1, field: 'phone', message: 'phone is required' });
          continue;
        }
      }
      validCount++;
    }
    return { entity, validCount, errors };
  }

  async commitImport(
    entity: string,
    rows: Array<Record<string, unknown>> = [],
    userId?: string,
  ) {
    const normalizedEntity = entity.toLowerCase();
    const actor = userId && this.isUuid(userId) ? userId : null;
    const now = new Date();
    let importedCount = 0;

    await this.knex.transaction(async (trx) => {
      for (const r of rows) {
        if (!r) continue;
        if (normalizedEntity === 'items') {
          const sku = String(r.skuCode ?? r.sku_code ?? '').trim();
          const name = String(r.name ?? '').trim();
          if (!sku || !name) continue;
          const existing = await trx('items').where('sku_code', sku).first('id');
          if (existing) continue;
          await trx('items').insert({
            id: randomUUID(),
            sku_code: sku,
            name,
            item_category: String(r.itemCategory ?? r.item_category ?? 'PROCESSED_FG'),
            primary_uom: String(r.primaryUom ?? r.primary_uom ?? 'KG'),
            tax_rate_pct: Number(r.taxRatePct ?? r.tax_rate_pct ?? 5),
            min_margin_pct: Number(r.minMarginPct ?? r.min_margin_pct ?? 10),
            is_catch_weight: Boolean(r.isCatchWeight ?? false),
            tax_treatment: String(r.taxTreatment ?? 'TAXABLE'),
            min_stock_qty: Number(r.minStockQty ?? 0),
            is_active: true,
            created_at: now,
            updated_at: now,
            created_by: actor,
            updated_by: actor,
          });
          importedCount++;
        } else if (normalizedEntity === 'customers') {
          const businessName = String(r.businessName ?? r.business_name ?? '').trim();
          const phone = String(r.phone ?? '').trim();
          if (!businessName || !phone) continue;
          const code = String(r.customerCode ?? r.customer_code ?? `CUST-${randomUUID().slice(0, 6).toUpperCase()}`);
          const existing = await trx('customers').where('customer_code', code).first('id');
          if (existing) continue;
          await trx('customers').insert({
            id: randomUUID(),
            customer_code: code,
            business_name: businessName,
            contact_person: r.contactPerson ? String(r.contactPerson) : businessName,
            phone,
            billing_address: String(r.billingAddress ?? r.billing_address ?? 'Registered Address'),
            credit_limit: Number(r.creditLimit ?? 50000),
            credit_days: Number(r.creditDays ?? 15),
            current_ar_balance: 0,
            max_overdue_days: 0,
            state_code: String(r.stateCode ?? '27'),
            credit_hold: false,
            price_tier: String(r.priceTier ?? 'STANDARD'),
            is_active: true,
            created_at: now,
            updated_at: now,
            created_by: actor,
            updated_by: actor,
          });
          importedCount++;
        } else if (normalizedEntity === 'suppliers') {
          const companyName = String(r.companyName ?? r.company_name ?? '').trim();
          const phone = String(r.phone ?? '').trim();
          if (!companyName || !phone) continue;
          const code = String(r.supplierCode ?? r.supplier_code ?? `SUP-${randomUUID().slice(0, 6).toUpperCase()}`);
          const existing = await trx('suppliers').where('supplier_code', code).first('id');
          if (existing) continue;
          await trx('suppliers').insert({
            id: randomUUID(),
            supplier_code: code,
            company_name: companyName,
            phone,
            payment_terms_days: Number(r.paymentTermsDays ?? 15),
            reliability_score_pct: 95,
            lead_time_days_avg: 2,
            current_ap_balance: 0,
            is_approved: true,
            is_active: true,
            created_at: now,
            updated_at: now,
            created_by: actor ?? '00000000-0000-0000-0000-000000000000',
            updated_by: actor ?? '00000000-0000-0000-0000-000000000000',
          });
          importedCount++;
        }
      }
    });

    return { entity, importedCount, committedAt: now.toISOString() };
  }

  presignFileUpload(body: { fileName?: string; mimeType?: string }) {
    const fileKey = `uploads/${randomUUID()}/${String(body?.fileName ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    return {
      uploadUrl: '/api/proxy/files/confirm',
      fileKey,
      mimeType: body?.mimeType ?? 'application/octet-stream',
    };
  }

  async listWarehouseBins(warehouseId: string) {
    const configKey = `WAREHOUSE_BINS_${warehouseId}`;
    const cfg = await this.knex('business_rule_config').where({ key: configKey }).first('value_json');
    const bins = Array.isArray(cfg?.value_json) ? cfg.value_json : [];
    const batchSummary = this.isUuid(warehouseId)
      ? await this.knex('inventory_batches')
          .where('location_id', warehouseId)
          .andWhere('qty_on_hand', '>', 0)
          .select('id', 'batch_number', 'item_id', 'qty_on_hand', 'status')
      : [];
    return { warehouseId, bins, storedBatches: batchSummary };
  }

  async createWarehouseBin(
    warehouseId: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    if (this.isUuid(warehouseId)) {
      const loc = await this.knex('locations').where('id', warehouseId).first('id');
      if (!loc) throw new NotFoundException(`Warehouse ${warehouseId} not found`);
    }
    const configKey = `WAREHOUSE_BINS_${warehouseId}`;
    const existing = await this.knex('business_rule_config').where({ key: configKey }).first('value_json');
    const currentBins: Array<Record<string, unknown>> = Array.isArray(existing?.value_json)
      ? existing.value_json
      : [];
    const newBin = {
      id: randomUUID(),
      warehouseId,
      code: String(body.code ?? `BIN-${currentBins.length + 1}`),
      name: String(body.name ?? body.code ?? `Bin ${currentBins.length + 1}`),
      zone: String(body.zone ?? 'GENERAL'),
      capacityKg: body.capacityKg ? Number(body.capacityKg) : null,
      createdAt: new Date().toISOString(),
    };
    const nextBins = [...currentBins, newBin];
    const now = new Date();
    const actor = userId && this.isUuid(userId) ? userId : null;
    if (existing) {
      await this.knex('business_rule_config').where({ key: configKey }).update({
        value_json: JSON.stringify(nextBins),
        updated_by: actor,
        updated_at: now,
      });
    } else {
      await this.knex('business_rule_config').insert({
        key: configKey,
        value_json: JSON.stringify(nextBins),
        scope: 'GLOBAL',
        description: `Warehouse bins for ${warehouseId}`,
        updated_by: actor,
        updated_at: now,
      });
    }
    return newBin;
  }

  async previewOrder(body: Record<string, unknown>) {
    const rawLines = Array.isArray(body?.lines) ? (body.lines as Array<Record<string, unknown>>) : [];
    const itemIds = rawLines.map((l) => String(l.itemId ?? '')).filter((id) => this.isUuid(id));
    const items = itemIds.length
      ? await this.knex('items').whereIn('id', itemIds).select('id', 'name', 'tax_rate_pct', 'min_margin_pct')
      : [];
    const priceRows = itemIds.length
      ? await this.knex('daily_price_lists')
          .whereIn('item_id', itemIds)
          .orderBy('effective_date', 'desc')
          .select('item_id', 'floor_price', 'target_price', 'latest_landed_cost')
      : [];
    const itemMap = new Map(items.map((i: any) => [i.id, i]));
    const priceMap = new Map<string, any>();
    for (const p of priceRows) {
      if (!priceMap.has(p.item_id)) priceMap.set(p.item_id, p);
    }

    let subtotal = 0;
    let taxTotal = 0;
    let totalCost = 0;
    const computedLines = rawLines.map((l) => {
      const itemId = String(l.itemId ?? '');
      const qty = Number(l.qty ?? 0);
      const item = itemMap.get(itemId);
      const price = priceMap.get(itemId);
      const unitPrice = Number(l.quotedUnitPrice ?? l.unitPrice ?? price?.target_price ?? 0);
      const lineSub = qty * unitPrice;
      const taxPct = Number(item?.tax_rate_pct ?? 5);
      const lineTax = (lineSub * taxPct) / 100;
      const landed = Number(price?.latest_landed_cost ?? unitPrice * 0.8);
      subtotal += lineSub;
      taxTotal += lineTax;
      totalCost += qty * landed;
      return {
        itemId,
        itemName: item?.name ?? 'Unknown Item',
        qty,
        unitPrice,
        floorPrice: Number(price?.floor_price ?? 0),
        taxPct,
        lineSubtotal: Number(lineSub.toFixed(2)),
        lineTax: Number(lineTax.toFixed(2)),
        lineTotal: Number((lineSub + lineTax).toFixed(2)),
      };
    });

    const grandTotal = subtotal + taxTotal;
    const marginPct = subtotal > 0 ? ((subtotal - totalCost) / subtotal) * 100 : 0;
    return {
      subtotal: Number(subtotal.toFixed(2)),
      taxTotal: Number(taxTotal.toFixed(2)),
      totalAmount: Number(grandTotal.toFixed(2)),
      marginPct: Number(marginPct.toFixed(2)),
      lines: computedLines,
      previewedAt: new Date().toISOString(),
    };
  }

  async createQuotation(body: Record<string, unknown>, userId?: string) {
    const customerId = String(body.customerId ?? '');
    const siteId = String(body.siteId ?? '');
    if (!this.isUuid(customerId) || !this.isUuid(siteId)) {
      throw new BadRequestException('Valid customerId and siteId UUIDs are required');
    }
    const actor = userId && this.isUuid(userId) ? userId : null;
    const quoteId = randomUUID();
    const now = new Date();
    const validUntil = body.validUntil
      ? new Date(String(body.validUntil))
      : new Date(Date.now() + 7 * 86400000);
    const quoteNo = `QT-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}-${quoteId.slice(0, 6).toUpperCase()}`;
    const rawLines = Array.isArray(body.lines) ? (body.lines as Array<Record<string, unknown>>) : [];

    return this.knex.transaction(async (trx) => {
      let totalAmount = 0;
      const lineRows = [];
      for (const l of rawLines) {
        const itemId = String(l.itemId ?? '');
        if (!this.isUuid(itemId)) continue;
        const qty = Number(l.qty ?? 0);
        const unitPrice = Number(l.quotedUnitPrice ?? l.unitPrice ?? 0);
        totalAmount += qty * unitPrice;
        lineRows.push({
          id: randomUUID(),
          quote_id: quoteId,
          item_id: itemId,
          qty,
          quoted_unit_price: unitPrice,
          floor_price_snapshot: Number(l.floorPrice ?? unitPrice),
          target_price_snapshot: Number(l.targetPrice ?? unitPrice),
          landed_cost_snapshot: Number(l.landedCost ?? unitPrice * 0.8),
          margin_pct_snapshot: l.marginPct !== undefined ? Number(l.marginPct) : 15,
          created_at: now,
          updated_at: now,
          created_by: actor,
          updated_by: actor,
        });
      }

      const [quote] = await trx('quotes')
        .insert({
          id: quoteId,
          quote_no: quoteNo,
          customer_id: customerId,
          site_id: siteId,
          status: String(body.status ?? 'DRAFT'),
          total_amount: Number(Number(body.totalAmount ?? totalAmount).toFixed(2)),
          margin_pct: body.marginPct !== undefined ? Number(body.marginPct) : 15,
          valid_until: validUntil,
          created_at: now,
          updated_at: now,
          created_by: actor,
          updated_by: actor,
        })
        .returning('*');

      if (lineRows.length > 0) {
        await trx('quote_lines').insert(lineRows);
      }

      return { ...quote, lines: lineRows };
    });
  }

  async convertQuotationToOrder(quoteId: string, userId?: string) {
    const actor = userId && this.isUuid(userId) ? userId : null;
    const now = new Date();
    return this.knex.transaction(async (trx) => {
      const quote = await trx('quotes').where('id', quoteId).first('*');
      if (!quote) throw new NotFoundException(`Quotation ${quoteId} not found`);

      const lines = await trx('quote_lines').where('quote_id', quoteId).select('*');
      const orderId = randomUUID();
      const orderNo = await this.docNumber.next('SALES_ORDER', String(quote.site_id), null, trx);

      await trx('sales_orders').insert({
        id: orderId,
        order_no: orderNo,
        customer_id: quote.customer_id,
        fulfillment_site_id: quote.site_id,
        order_status: 'DRAFT',
        total_amount: quote.total_amount ?? 0,
        margin_pct: quote.margin_pct,
        source_quote_id: quote.id,
        created_at: now,
        created_at_idx: now,
        updated_at: now,
        created_by: actor,
        updated_by: actor,
      });

      if (lines.length > 0) {
        await trx('sales_order_lines').insert(
          lines.map((l: any) => ({
            id: randomUUID(),
            order_id: orderId,
            item_id: l.item_id,
            ordered_qty: l.qty,
            quoted_unit_price: l.quoted_unit_price,
            floor_price_snapshot: l.floor_price_snapshot,
            target_price_snapshot: l.target_price_snapshot,
            landed_cost_snapshot: l.landed_cost_snapshot,
            margin_pct_snapshot: l.margin_pct_snapshot,
            allocated_from_stock_qty: 0,
            requires_production_qty: l.qty,
            delivered_qty: 0,
            returned_qty: 0,
            line_total: Number(l.qty) * Number(l.quoted_unit_price),
            created_at: now,
            updated_at: now,
            created_by: actor,
            updated_by: actor,
          })),
        );
      }

      await trx('quotes').where('id', quoteId).update({
        status: 'CONVERTED',
        updated_at: now,
        updated_by: actor,
      });

      return { quotationId: quoteId, orderId, orderNo, status: 'CONVERTED' };
    });
  }

  async putawayInventory(body: Record<string, unknown>, userId?: string) {
    const batchId = String(body.batchId ?? '');
    const locationId = String(body.locationId ?? '');
    if (!this.isUuid(batchId) || !this.isUuid(locationId)) {
      throw new BadRequestException('Valid batchId and locationId UUIDs are required');
    }
    const actor = userId && this.isUuid(userId) ? userId : null;
    const now = new Date();
    return this.knex.transaction(async (trx) => {
      const [batch] = await trx('inventory_batches')
        .where('id', batchId)
        .update({ location_id: locationId, updated_at: now, updated_by: actor })
        .returning('*');
      if (!batch) throw new NotFoundException(`Batch ${batchId} not found`);
      return { ...batch, locationId, status: 'STORED' };
    });
  }

  async applyCreditNote(
    creditNoteId: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const actor = userId && this.isUuid(userId) ? userId : null;
    const now = new Date();
    const invoiceId = body.invoiceId ? String(body.invoiceId) : undefined;
    return this.knex.transaction(async (trx) => {
      const cn = await trx('credit_notes').where('id', creditNoteId).first('*');
      if (!cn) throw new NotFoundException(`Credit note ${creditNoteId} not found`);

      let updatedInvoice: any = null;
      if (invoiceId && this.isUuid(invoiceId)) {
        const inv = await trx('invoices').where('id', invoiceId).first('*');
        if (!inv) throw new NotFoundException(`Invoice ${invoiceId} not found`);
        const debitAmt = Math.min(Number(cn.total_debit ?? 0), Number(inv.balance_due ?? 0));
        const nextPaid = Number(inv.paid_amount ?? 0) + debitAmt;
        const nextDue = Math.max(0, Number(inv.balance_due ?? 0) - debitAmt);
        const [savedInv] = await trx('invoices')
          .where('id', invoiceId)
          .update({
            paid_amount: nextPaid.toFixed(2),
            balance_due: nextDue.toFixed(2),
            status: nextDue <= 0 ? 'PAID' : 'PARTIAL',
            updated_at: now,
            updated_by: actor,
          })
          .returning('*');
        updatedInvoice = savedInv;
      }

      const [updatedCn] = await trx('credit_notes')
        .where('id', creditNoteId)
        .update({
          status: 'APPLIED',
          updated_at: now,
          updated_by: actor ?? cn.updated_by,
        })
        .returning('*');

      return { creditNoteId: updatedCn.id, invoice: updatedInvoice, status: 'APPLIED' };
    });
  }

  async importReconciliationStatement(
    rows: Array<Record<string, unknown>> = [],
    userId?: string,
  ) {
    const key = 'RECON_STATEMENT_LATEST';
    const existing = await this.knex('business_rule_config').where({ key }).first('key');
    const normalized = rows.map((r, idx) => ({
      id: r.id ? String(r.id) : randomUUID(),
      rowNo: idx + 1,
      txnDate: String(r.txnDate ?? r.date ?? new Date().toISOString().split('T')[0]),
      referenceNo: String(r.referenceNo ?? r.utr ?? r.ref ?? ''),
      amount: Number(r.amount ?? 0),
      description: String(r.description ?? ''),
      matchedReceiptId: null,
      status: 'UNMATCHED',
    }));
    const now = new Date();
    const actor = userId && this.isUuid(userId) ? userId : null;
    if (existing) {
      await this.knex('business_rule_config').where({ key }).update({
        value_json: JSON.stringify(normalized),
        updated_by: actor,
        updated_at: now,
      });
    } else {
      await this.knex('business_rule_config').insert({
        key,
        value_json: JSON.stringify(normalized),
        scope: 'GLOBAL',
        description: 'Latest imported bank/UPI reconciliation statement rows',
        updated_by: actor,
        updated_at: now,
      });
    }
    return { importedCount: normalized.length, rows: normalized };
  }

  async matchReconciliationStatement(
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const key = 'RECON_STATEMENT_LATEST';
    const cfg = await this.knex('business_rule_config').where({ key }).first('value_json');
    const storedRows: Array<any> = Array.isArray(cfg?.value_json) ? cfg.value_json : [];
    const receipts = await this.knex('collection_receipts')
      .orderBy('collected_at', 'desc')
      .limit(200)
      .select('id', 'receipt_no', 'reference_no', 'amount', 'payment_mode', 'collected_at');

    const matches: Array<any> = [];
    const updatedRows = storedRows.map((row) => {
      if (row.status === 'MATCHED') return row;
      const found = receipts.find(
        (r: any) =>
          (body?.receiptId && r.id === body.receiptId && row.id === body?.rowId) ||
          (row.referenceNo &&
            r.reference_no &&
            String(r.reference_no).trim() === String(row.referenceNo).trim()) ||
          Math.abs(Number(r.amount) - Number(row.amount)) < 0.01,
      );
      if (found) {
        matches.push({ rowId: row.id, receiptId: found.id, receiptNo: found.receipt_no, amount: found.amount });
        return { ...row, matchedReceiptId: found.id, status: 'MATCHED' };
      }
      return row;
    });

    if (cfg) {
      await this.knex('business_rule_config').where({ key }).update({
        value_json: JSON.stringify(updatedRows),
        updated_by: userId && this.isUuid(userId) ? userId : null,
        updated_at: new Date(),
      });
    }

    return { matched: matches.length > 0, matchedCount: matches.length, matches };
  }

  async getTripManifestPdf(tripId: string): Promise<{ buffer: Buffer; tripNo: string }> {
    const trip = await this.knex('delivery_trips').where('id', tripId).first('*');
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    const vehicle = trip.vehicle_id
      ? await this.knex('vehicles').where('id', trip.vehicle_id).first('registration_no')
      : null;
    const driver = trip.driver_id
      ? await this.knex('users').where('id', trip.driver_id).first('full_name')
      : null;
    const site = await this.knex('sites').where('id', trip.site_id).first('*');
    const lines = await this.knex('delivery_stop_lines as dsl')
      .join('delivery_stops as ds', 'dsl.stop_id', 'ds.id')
      .join('items as i', 'dsl.item_id', 'i.id')
      .where('ds.trip_id', tripId)
      .select('i.name as itemName', 'i.hsn_code', 'i.primary_uom as uom', 'dsl.loaded_qty');

    const pdfGen = this.pdfGenerator ?? new PdfGeneratorService();
    const buffer = await pdfGen.generateChallan({
      challanNo: `MANIFEST-${trip.trip_no || trip.id.slice(0, 8)}`,
      challanDate: new Date().toISOString().split('T')[0],
      tripNo: trip.trip_no || trip.id.slice(0, 8),
      tripDate: String(trip.trip_date ?? ''),
      vehicleNo:
        vehicle?.registration_no || trip.external_vehicle_no || trip.transporter_name || 'N/A',
      driverName:
        driver?.full_name || trip.external_driver_name || trip.transporter_name || 'N/A',
      customerName: 'Dispatch Manifest — All Stops',
      customerAddress: site?.address || 'Depot',
      customerGstin: site?.gstin || 'N/A',
      customerStateCode: site?.state_code || '27',
      siteName: site?.name || 'NeoBus Depot',
      siteAddress: site?.address || 'N/A',
      siteGstin: site?.gstin || 'N/A',
      siteStateCode: site?.state_code || '27',
      lines: lines.map((l: any) => ({
        itemName: l.itemName,
        hsnCode: l.hsn_code || 'N/A',
        uom: l.uom,
        loadedQty: l.loaded_qty,
      })),
    });
    return { buffer, tripNo: trip.trip_no || trip.id.slice(0, 8) };
  }

  async getPurchaseOrderPdf(poId: string): Promise<{ buffer: Buffer; poNo: string }> {
    const po = await this.knex('purchase_orders').where('id', poId).first('*');
    if (!po) throw new NotFoundException(`PO ${poId} not found`);
    const lines = await this.knex('purchase_order_lines as pol')
      .leftJoin('items as i', 'pol.item_id', 'i.id')
      .where('pol.po_id', poId)
      .select('pol.*', 'i.name as item_name');
    const supplier = await this.knex('suppliers').where('id', po.supplier_id).first('*');
    const site = await this.knex('sites').where('id', po.receiving_site_id).first('*');
    const pdfGen = this.pdfGenerator ?? new PdfGeneratorService();
    const buffer = await pdfGen.generatePurchaseOrder({
      poNo: po.po_no,
      poDate: new Date(po.created_at).toISOString().split('T')[0],
      expectedDelivery: po.expected_delivery
        ? new Date(po.expected_delivery).toISOString().split('T')[0]
        : undefined,
      supplierName: supplier?.company_name || 'Supplier',
      supplierGstin: supplier?.gstin,
      siteName: site?.name || 'NeoBus',
      lines: lines.map((l: any) => ({
        itemName: l.item_name || 'Item',
        qty: String(l.ordered_qty),
        unitPrice: String(l.unit_price || '0'),
        lineTotal: String((Number(l.ordered_qty) * Number(l.unit_price || 0)).toFixed(2)),
      })),
      totalAmount: String(po.total_amount || '0'),
    });
    return { buffer, poNo: po.po_no };
  }
}
