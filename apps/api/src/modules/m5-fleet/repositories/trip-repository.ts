import { Injectable } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

export interface DriverManifestStop {
  id: string;
  tripId: string;
  sequenceNo: number;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  isCod: boolean;
  codAmount: string;
  status: string;
  lines: Array<{
    id: string;
    itemId: string;
    itemName: string;
    itemSku: string;
    loadedQty: string;
    deliveredQty: string;
    returnedQty: string;
    batchId: string;
    batchNo: string;
    uom: string;
    hsnCode: string;
    taxRatePct: string;
  }>;
}

export interface DriverManifest {
  tripId: string;
  tripNo: string;
  tripDate: string;
  vehicleId: string;
  vehicleRegNo: string;
  driverId: string;
  driverName: string;
  stops: DriverManifestStop[];
  totalLoadedWeight: number;
  totalStops: number;
}

@Injectable()
export class TripRepository {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Get driver's manifest for a specific trip or current active trip
   * Used by offline mobile app to cache delivery data
   */
  async getDriverManifest(
    driverId: string,
    tripId?: string,
    tripDate?: string,
  ): Promise<DriverManifest | null> {
    let tripQuery = this.knex('delivery_trips')
      .where('driver_id', driverId)
      .whereIn('status', ['LOADING', 'IN_TRANSIT']);

    if (tripId) {
      tripQuery = tripQuery.where('id', tripId);
    } else if (tripDate) {
      tripQuery = tripQuery.where('trip_date', tripDate);
    } else {
      // Default to today's date
      tripQuery = tripQuery.where('trip_date', this.getTodayKolkata());
    }

    const trip = await tripQuery.orderBy('created_at', 'desc').first('*');

    if (!trip) return null;

    return this.buildManifest(String(trip.id));
  }

  /**
   * Build complete manifest with all stop and line details
   */
  private async buildManifest(tripId: string): Promise<DriverManifest> {
    const trip = await this.knex('delivery_trips')
      .where('delivery_trips.id', tripId)
      .leftJoin('vehicles', 'delivery_trips.vehicle_id', 'vehicles.id')
      .leftJoin('users', 'delivery_trips.driver_id', 'users.id')
      .select(
        'delivery_trips.id as tripId',
        'delivery_trips.trip_no as tripNo',
        'delivery_trips.trip_date as tripDate',
        'delivery_trips.dispatch_mode as dispatchMode',
        'delivery_trips.transporter_name as transporterName',
        'delivery_trips.lr_tracking_no as lrTrackingNo',
        'vehicles.id as vehicleId',
        this.knex.raw(
          "COALESCE(vehicles.registration_no, delivery_trips.external_vehicle_no, '3PL') as \"vehicleRegNo\"",
        ),
        'users.id as driverId',
        this.knex.raw(
          "COALESCE(users.full_name, delivery_trips.external_driver_name, delivery_trips.transporter_name, 'External Driver') as \"driverName\"",
        ),
      )
      .first();

    if (!trip) throw new Error(`Trip ${tripId} not found`);

    const stops = await this.knex('delivery_stops')
      .where('trip_id', tripId)
      .orderBy('sequence_no')
      .select('*');

    const stopIds = stops.map((s) => s.id);
    const lines =
      stopIds.length > 0
        ? await this.knex('delivery_stop_lines')
            .whereIn('stop_id', stopIds)
            .join('items', 'delivery_stop_lines.item_id', 'items.id')
            .leftJoin(
              'inventory_batches',
              'delivery_stop_lines.batch_id',
              'inventory_batches.id',
            )
            .select(
              'delivery_stop_lines.id',
              'delivery_stop_lines.stop_id',
              'delivery_stop_lines.item_id',
              'items.name as itemName',
              'items.sku_code as itemSku',
              'delivery_stop_lines.loaded_qty',
              'delivery_stop_lines.delivered_qty',
              'delivery_stop_lines.returned_qty',
              'delivery_stop_lines.batch_id',
              'inventory_batches.batch_number as batch_no',
              'items.primary_uom as uom',
              'items.hsn_code',
              'items.tax_rate_pct',
            )
        : [];

    // Group lines by stop_id
    const linesByStop = new Map<string, typeof lines>();
    for (const line of lines) {
      const stopId = String(line.stop_id);
      const existing = linesByStop.get(stopId) ?? [];
      existing.push(line);
      linesByStop.set(stopId, existing);
    }

    // Build stop details with customer info
    const customerIds = [...new Set(stops.map((s) => s.customer_id))];
    const customers =
      customerIds.length > 0
        ? await this.knex('customers')
            .whereIn('id', customerIds)
            .select('id', 'business_name', 'billing_address', 'phone')
        : [];

    const customerMap = new Map(customers.map((c) => [String(c.id), c]));

    const manifestStops: DriverManifestStop[] = stops.map((stop) => {
      const customer = customerMap.get(String(stop.customer_id));
      const stopLines = linesByStop.get(String(stop.id)) ?? [];

      return {
        id: String(stop.id),
        tripId: String(stop.trip_id),
        sequenceNo: Number(stop.sequence_no),
        customerId: String(stop.customer_id),
        customerName: customer?.business_name ?? 'Unknown Customer',
        customerAddress: customer?.billing_address ?? '',
        customerPhone: customer?.phone ?? '',
        isCod: Boolean(stop.is_cod),
        codAmount: String(stop.cod_amount ?? '0'),
        status: stop.status,
        lines: stopLines.map((line) => ({
          id: String(line.id),
          itemId: String(line.item_id),
          itemName: line.itemName,
          itemSku: line.itemSku,
          loadedQty: String(line.loaded_qty),
          deliveredQty: String(line.delivered_qty ?? '0'),
          returnedQty: String(line.returned_qty ?? '0'),
          batchId: String(line.batch_id ?? ''),
          batchNo: line.batch_no ?? '',
          uom: line.uom,
          hsnCode: line.hsn_code ?? '',
          taxRatePct: String(line.tax_rate_pct ?? '0'),
        })),
      };
    });

    // Calculate total loaded weight
    const totalLoadedWeight = manifestStops.reduce(
      (sum, stop) =>
        sum + stop.lines.reduce((s, l) => s + Number(l.loadedQty), 0),
      0,
    );

    return {
      tripId: String(trip.tripId),
      tripNo: trip.tripNo,
      tripDate: trip.tripDate,
      vehicleId: String(trip.vehicleId),
      vehicleRegNo: trip.vehicleRegNo,
      driverId: String(trip.driverId),
      driverName: trip.driverName,
      stops: manifestStops,
      totalLoadedWeight,
      totalStops: manifestStops.length,
    };
  }

  /**
   * Get all active trips for a driver (for offline sync)
   */
  async getDriverActiveTrips(driverId: string): Promise<DriverManifest[]> {
    const trips = await this.knex('delivery_trips')
      .where('driver_id', driverId)
      .whereIn('status', ['LOADING', 'IN_TRANSIT'])
      .orderBy('trip_date', 'desc')
      .select('id');

    const manifests: DriverManifest[] = [];
    for (const trip of trips) {
      const manifest = await this.buildManifest(String(trip.id));
      if (manifest) manifests.push(manifest);
    }
    return manifests;
  }

  /**
   * Get manifest by trip ID (for coordinator/owner views)
   */
  async getManifestByTripId(tripId: string): Promise<DriverManifest | null> {
    return this.buildManifest(tripId);
  }

  private getTodayKolkata(): string {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    return istDate.toISOString().split('T')[0];
  }
}
