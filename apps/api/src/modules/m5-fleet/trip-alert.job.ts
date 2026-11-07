import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { ConfigService } from '../m0-platform/config.service.js';
import { NOTIFY_PORT } from '../../shared/ports/ports.interface.js';
import type { NotifyPort } from '../../shared/ports/ports.interface.js';
import { Clock } from '../../shared/utils/clock.util.js';

@Injectable()
export class TripAlertJob {
  private readonly logger = new Logger(TripAlertJob.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly config: ConfigService,
    @Inject(NOTIFY_PORT) private readonly notify?: NotifyPort,
  ) {}

  /**
   * Check for late trips and send notifications
   * Called by scheduler every 30 minutes
   */
  async checkLateTrips(): Promise<{ checked: number; alertsSent: number }> {
    // Get configurable threshold (default 4 hours)
    const thresholdHours = await this.getLateTripThresholdHours();
    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const cutoffTime = new Date(Date.now() - thresholdMs);

    this.logger.log(
      `Checking for trips IN_TRANSIT longer than ${thresholdHours} hours (since ${cutoffTime.toISOString()})`,
    );

    // Find trips that are IN_TRANSIT and started more than threshold ago
    const lateTrips = await this.knex('delivery_trips')
      .where('status', 'IN_TRANSIT')
      .where('started_at', '<', cutoffTime)
      .select(
        'id',
        'trip_no',
        'driver_id',
        'site_id',
        'started_at',
        'vehicle_id',
      );

    let alertsSent = 0;

    for (const trip of lateTrips) {
      try {
        await this.sendLateTripAlert(trip, thresholdHours);
        alertsSent++;
      } catch (err) {
        this.logger.error(
          `Failed to send late trip alert for ${trip.trip_no}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Late trip check complete: ${lateTrips.length} trips checked, ${alertsSent} alerts sent`,
    );
    return { checked: lateTrips.length, alertsSent };
  }

  /**
   * Send late trip alert to driver and coordinator
   */
  private async sendLateTripAlert(
    trip: {
      id: string;
      trip_no: string;
      driver_id: string;
      site_id: string;
      started_at: Date;
      vehicle_id: string;
    },
    thresholdHours: number,
  ): Promise<void> {
    if (!this.notify) {
      this.logger.warn('NotifyPort not available - skipping late trip alert');
      return;
    }

    // Get driver info
    const driver = await this.knex('users')
      .where('id', trip.driver_id)
      .first('full_name', 'phone', 'role');

    // Get vehicle info
    const vehicle = await this.knex('vehicles')
      .where('id', trip.vehicle_id)
      .first('registration_no');

    // Get site coordinators
    const coordinators = await this.knex('users')
      .where('assigned_site_id', trip.site_id)
      .whereIn('role', ['OPS_COORD', 'OWNER'])
      .where('is_active', true)
      .select('id', 'full_name', 'phone', 'role');

    const tripDurationHours = Math.floor(
      (Date.now() - new Date(trip.started_at).getTime()) / (1000 * 60 * 60),
    );

    const payload = {
      tripNo: trip.trip_no,
      tripId: trip.id,
      vehicleNo: vehicle?.registration_no || 'Unknown',
      driverName: driver?.full_name || 'Unknown',
      durationHours: tripDurationHours,
      thresholdHours,
      alertTime: Clock.nowUtc().toISOString(),
    };

    // Send to driver
    if (driver?.phone) {
      await this.notify.send('SMS', 'trip_late_alert_driver', driver.phone, {
        ...payload,
        recipientName: driver.full_name,
      });

      // Also send in-app notification
      await this.notify.send(
        'IN_APP',
        'trip_late_alert_driver',
        String(driver.id),
        payload,
      );
    }

    // Send to coordinators
    for (const coord of coordinators) {
      if (coord.phone) {
        await this.notify.send(
          'SMS',
          'trip_late_alert_coordinator',
          coord.phone,
          {
            ...payload,
            recipientName: coord.full_name,
            recipientRole: coord.role,
          },
        );
      }

      await this.notify.send(
        'IN_APP',
        'trip_late_alert_coordinator',
        String(coord.id),
        payload,
      );
    }

    this.logger.log(
      `Late trip alert sent for ${trip.trip_no}: driver ${driver?.full_name} + ${coordinators.length} coordinators`,
    );
  }

  /**
   * Get late trip threshold from config (hours)
   */
  private async getLateTripThresholdHours(): Promise<number> {
    const siteValue = await this.config.getNumber(
      'late_trip_threshold_hours',
      'SITE',
    );
    if (siteValue) return siteValue;

    const globalValue = await this.config.getNumber(
      'late_trip_threshold_hours',
    );
    if (globalValue) return globalValue;

    return 4; // Default 4 hours
  }

  /**
   * Get late trips for dashboard/reporting
   */
  async getLateTrips(thresholdHours = 4): Promise<
    Array<{
      tripId: string;
      tripNo: string;
      driverName: string;
      vehicleNo: string;
      startedAt: Date;
      durationHours: number;
    }>
  > {
    const cutoffTime = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

    const trips = await this.knex('delivery_trips')
      .where('status', 'IN_TRANSIT')
      .where('started_at', '<', cutoffTime)
      .join('users', 'delivery_trips.driver_id', 'users.id')
      .join('vehicles', 'delivery_trips.vehicle_id', 'vehicles.id')
      .select(
        'delivery_trips.id as tripId',
        'delivery_trips.trip_no as tripNo',
        'users.full_name as driverName',
        'vehicles.registration_no as vehicleNo',
        'delivery_trips.started_at as startedAt',
      );

    return trips.map((trip) => ({
      tripId: String(trip.tripId),
      tripNo: trip.tripNo,
      driverName: trip.driverName,
      vehicleNo: trip.vehicleNo,
      startedAt: trip.startedAt,
      durationHours: Math.floor(
        (Date.now() - new Date(trip.startedAt).getTime()) / (1000 * 60 * 60),
      ),
    }));
  }
}
