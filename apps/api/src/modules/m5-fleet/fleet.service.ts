import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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

  async createVehicle(dto: CreateVehicleDto, userId: string) {
    const [vehicle] = await this.knex('vehicles')
      .insert({
        site_id: dto.siteId,
        registration_no: dto.registrationNo.trim(),
        vehicle_type: dto.vehicleType.trim(),
        capacity_kg: String(dto.capacityKg),
        capacity_crates: dto.capacityCrates ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .returning('*');
    return vehicle;
  }

  async listVehicles(siteId: string) {
    return this.knex('vehicles')
      .where('site_id', siteId)
      .where('is_active', true)
      .orderBy('registration_no');
  }

  async createTrip(dto: CreateTripDto, userId: string) {
    if (dto.stops.length === 0) {
      throw new BadRequestException('A trip requires at least one stop');
    }

    return this.knex.transaction(async (trx) => {
      const vehicle = await trx('vehicles')
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

      const tripNo = await this.docNumber.next('TRIP', dto.siteId, null, trx);
      const [trip] = await trx('delivery_trips')
        .insert({
          site_id: dto.siteId,
          trip_no: tripNo,
          trip_date: dto.tripDate.slice(0, 10),
          origin_site_id: dto.originSiteId ?? dto.siteId,
          vehicle_id: dto.vehicleId,
          driver_id: dto.driverId,
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
    const trip = await runner('delivery_trips').where('id', tripId).first();
    if (!trip) throw new NotFoundException('Trip not found');
    const stops = await runner('delivery_stops')
      .where('trip_id', tripId)
      .orderBy('sequence_no');
    const stopIds = stops.map((stop) => stop.id);
    const lines = stopIds.length
      ? await runner('delivery_stop_lines').whereIn('stop_id', stopIds)
      : [];
    return {
      ...trip,
      stops: stops.map((stop) => ({
        ...stop,
        lines: lines.filter((line) => line.stop_id === stop.id),
      })),
    };
  }

  async listTrips(siteId: string, status?: string, tripDate?: string) {
    const query = this.knex('delivery_trips').where('site_id', siteId);
    if (status) query.andWhere('status', status);
    if (tripDate) query.andWhere('trip_date', tripDate);
    return query.orderBy([
      { column: 'trip_date', order: 'desc' },
      { column: 'trip_no', order: 'desc' },
    ]);
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
        await this.inventory.postDispatch(
          String(stop.id),
          stopLines.map((line) => ({
            itemId: line.itemId,
            batchId: line.batchId,
            qty: String(line.qty),
          })),
        );
        await this.outbox.raise(
          trx,
          'trip.loaded',
          String(trip.id),
          {
            tripId: String(trip.id),
            siteId: String(trip.site_id),
            lines: stopLines.map((line) => ({
              itemId: line.itemId,
              batchId: line.batchId,
              qty: String(line.qty),
            })),
          },
          'm5',
        );
        await trx('delivery_stop_lines')
          .where('stop_id', stop.id)
          .update({
            batch_id: stopLines[0].batchId,
            loaded_qty: String(
              stopLines.reduce((sum, line) => sum + line.qty, 0),
            ),
            updated_at: Clock.nowUtc(),
            updated_by: userId,
          });
      }

      await trx('delivery_trips').where('id', tripId).update({
        status: 'IN_TRANSIT',
        started_at: Clock.nowUtc(),
        updated_at: Clock.nowUtc(),
        updated_by: userId,
      });
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
      await this.ledger.postInvoice(String(trip.id));
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

  async generateChallan(tripId: string, stopId: string) {
    const stop = await this.knex('delivery_stops')
      .where({ id: stopId, trip_id: tripId })
      .first('id');
    if (!stop) throw new NotFoundException('Trip stop not found');
    const existing = await this.knex('delivery_challans')
      .where({ trip_id: tripId, stop_id: stopId })
      .first();
    if (existing) return existing;

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

  private async generateChallanPdf(
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
    const vehicle = await this.knex('vehicles')
      .where('id', trip.vehicle_id)
      .first('registration_no');
    const driver = await this.knex('users')
      .where('id', trip.driver_id)
      .first('full_name');
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
        .select('id', 'batch_no', 'expiry_date');
      batchDetails = new Map(batches.map((b) => [b.id, b]));
    }

    const challanData = {
      challanNo,
      challanDate: new Date().toISOString().split('T')[0],
      tripNo: trip.trip_no,
      tripDate: trip.trip_date,
      vehicleNo: vehicle?.registration_no || 'N/A',
      driverName: driver?.full_name || 'N/A',
      customerName: customer?.business_name || customer?.customer_code || 'N/A',
      customerAddress: customer?.billing_address || 'N/A',
      customerGstin: customer?.gstin || 'N/A',
      customerStateCode: customer?.state_code || 'N/A',
      siteName: site?.name || 'N/A',
      siteAddress: site?.address || 'N/A',
      siteGstin: site?.gstin || 'N/A',
      siteStateCode: site?.state_code || 'N/A',
      lines: lines.map((line) => ({
        itemName: line.itemName,
        hsnCode: line.hsn_code || 'N/A',
        uom: line.uom,
        loadedQty: line.loaded_qty,
        batchNo: batchDetails.get(line.batch_id)?.batch_no,
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
}
