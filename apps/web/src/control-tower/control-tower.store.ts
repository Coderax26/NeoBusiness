/**
 * Milestone F2 — Interactive Owner Control Tower & Executive Dashboard Controller
 *
 * Implements:
 * - F2.1: Glassmorphic Pulse Header with animated KPI metrics & SSE heartbeat
 * - F2.2: Interactive Mission Control 5-Stage Pipeline Funnel (click-to-filter)
 * - F2.3: Active Fleet & Dispatch Telemetry Mini-Board & Map Drawer state
 * - F2.4: Cross-Filtering Analytics Workbench (Timeframe scrubber, Customer selection, AR Aging 30d+ drawer)
 * - F2.5: Zero-Latency Exception Workbench with real-time Margin Simulator Slider & A/C/R hotkeys
 * - F2.6: Wall-Board Kiosk Mode with auto-rotating panel carousel
 */

import {
  NeoApiClient,
  RealtimeEventHub,
  type PulseDto,
  type StatusMatrixDto,
  type ExceptionCardDto,
  type ARAgingBucketDto,
  type CustomerProfitabilityDto,
  type ActiveTruckTelemetryDto,
  type FactoryBatchDto,
} from '../../../../packages/api-client/src/index.js';
import {
  INITIAL_PULSE_FIXTURE,
  INITIAL_STATUS_MATRIX_FIXTURE,
  INITIAL_EXCEPTIONS_FIXTURE,
  INITIAL_AR_AGING_FIXTURE,
  INITIAL_FLEET_TELEMETRY_FIXTURE,
  INITIAL_FACTORY_BATCHES_FIXTURE,
  INITIAL_CUSTOMER_PROFITABILITY_FIXTURE,
} from '../../../../packages/mocks/src/index.js';
import {
  simulateCounterOfferMargin,
  formatINR,
  type CounterOfferSimulation,
} from '../../../../packages/shared/src/index.js';
import { buildSparklineSvgPoints } from '../../../../packages/ui/src/index.js';

export type PipelineStageKey =
  | 'ALL'
  | 'CONFIRMED'
  | 'PRODUCTION'
  | 'LOADING'
  | 'IN_TRANSIT'
  | 'DELIVERED';

export type AnalyticsTimeframe = 'TODAY' | 'YESTERDAY' | '7D' | 'MTD' | 'CUSTOM';

export type KioskCarouselPanel =
  | 'PIPELINE_OVERVIEW'
  | 'FLEET_RADAR'
  | 'FACTORY_YIELD'
  | 'AR_COLLECTIONS';

const KIOSK_PANELS: readonly KioskCarouselPanel[] = [
  'PIPELINE_OVERVIEW',
  'FLEET_RADAR',
  'FACTORY_YIELD',
  'AR_COLLECTIONS',
];

export class ControlTowerController {
  private pulse: PulseDto = structuredClone(INITIAL_PULSE_FIXTURE);
  private statusMatrix: StatusMatrixDto = structuredClone(INITIAL_STATUS_MATRIX_FIXTURE);
  private exceptions: ExceptionCardDto[] = structuredClone(INITIAL_EXCEPTIONS_FIXTURE);
  private arAging: ARAgingBucketDto[] = structuredClone(INITIAL_AR_AGING_FIXTURE);
  private fleet: ActiveTruckTelemetryDto[] = structuredClone(INITIAL_FLEET_TELEMETRY_FIXTURE);
  private batches: FactoryBatchDto[] = structuredClone(INITIAL_FACTORY_BATCHES_FIXTURE);
  private customerProfitability: CustomerProfitabilityDto[] = structuredClone(
    INITIAL_CUSTOMER_PROFITABILITY_FIXTURE,
  );

  // Interactive UI Filter & Selection States
  private selectedPipelineStage: PipelineStageKey = 'ALL';
  private selectedTimeframe: AnalyticsTimeframe = 'TODAY';
  private selectedCustomerId: string | null = null;
  private selectedArBucket: ARAgingBucketDto['bucket'] | null = null;
  private isGeospatialMapModalOpen = false;
  private isKioskModeActive = false;
  private activeKioskPanelIndex = 0;
  private themeMode: 'OBSIDIAN_DARK' | 'CLEAN_SLATE_LIGHT' = 'OBSIDIAN_DARK';

  // Margin Simulator State per Exception Card
  private sliderSimulations = new Map<string, CounterOfferSimulation>();

  constructor(
    private readonly apiClient: NeoApiClient,
    private readonly eventHub: RealtimeEventHub,
  ) {
    // Initialize default slider simulations for price overrides
    for (const exc of this.exceptions) {
      if (exc.exceptionType === 'PRICE_OVERRIDE' && exc.contextPayload.requestedPrice) {
        this.updateCounterOfferSlider(exc.id, exc.contextPayload.requestedPrice);
      }
    }

    // Subscribe to realtime SSE events
    this.eventHub.on('exception.requested', (payload) => {
      const incoming = payload as unknown as ExceptionCardDto;
      if (incoming && incoming.id) {
        this.exceptions.unshift(incoming);
        this.pulse.pendingExceptions = this.exceptions.filter(
          (e) => e.status === 'PENDING',
        ).length;
      }
    });
  }

  getPulseViewModel() {
    const salesNum = Number(this.pulse.todaysSales);
    const targetNum = Number(this.pulse.salesTargetInr ?? '600000');
    const targetProgressPct =
      targetNum > 0 ? Math.min(100, Number(((salesNum / targetNum) * 100).toFixed(1))) : 0;
    const marginNum = Number(this.pulse.grossMarginPct);
    const marginTone =
      marginNum < 5 ? 'rose' : marginNum < 10 ? 'amber' : 'emerald';

    const cashNum = Number(this.pulse.cashCollectedToday);
    const chequeNum = Number(this.pulse.chequesInCustody ?? '0');
    const totalCustody = cashNum + chequeNum;

    return {
      connectionState: this.eventHub.getState(),
      todaysSalesFormatted: formatINR(this.pulse.todaysSales),
      salesTargetProgressPct: targetProgressPct,
      sparklinePoints: buildSparklineSvgPoints(this.pulse.hourlyVelocity ?? []),
      grossMarginPct: `${this.pulse.grossMarginPct}%`,
      marginTone,
      totalInCustodyFormatted: formatINR(totalCustody),
      cashFormatted: formatINR(cashNum),
      chequesFormatted: formatINR(chequeNum),
      pendingExceptionsCount: this.exceptions.filter((e) => e.status === 'PENDING').length,
      themeMode: this.themeMode,
    };
  }

  /**
   * F2.2: Click-to-filter on Mission Control Pipeline stages.
   * Clicking an already-selected stage resets filter to 'ALL'.
   */
  selectPipelineStage(stage: PipelineStageKey): PipelineStageKey {
    this.selectedPipelineStage =
      this.selectedPipelineStage === stage ? 'ALL' : stage;
    return this.selectedPipelineStage;
  }

  getSelectedPipelineStage(): PipelineStageKey {
    return this.selectedPipelineStage;
  }

  getStatusMatrix(): StatusMatrixDto {
    return structuredClone(this.statusMatrix);
  }

  /**
   * F2.3: Opens or closes the interactive Geospatial Fleet Map modal.
   */
  toggleGeospatialMapModal(open?: boolean): boolean {
    this.isGeospatialMapModalOpen =
      open !== undefined ? open : !this.isGeospatialMapModalOpen;
    return this.isGeospatialMapModalOpen;
  }

  getFleetTelemetry(): ActiveTruckTelemetryDto[] {
    return structuredClone(this.fleet);
  }

  getFactoryBatches(): FactoryBatchDto[] {
    return structuredClone(this.batches);
  }

  /**
   * F2.4: Cross-filtering across Analytics widgets.
   */
  setTimeframe(tf: AnalyticsTimeframe): void {
    this.selectedTimeframe = tf;
  }

  getTimeframe(): AnalyticsTimeframe {
    return this.selectedTimeframe;
  }

  selectCustomerForCrossFilter(customerId: string | null): void {
    this.selectedCustomerId =
      this.selectedCustomerId === customerId ? null : customerId;
  }

  getSelectedCustomerId(): string | null {
    return this.selectedCustomerId;
  }

  selectArBucket(bucket: ARAgingBucketDto['bucket'] | null): void {
    this.selectedArBucket = this.selectedArBucket === bucket ? null : bucket;
  }

  getSelectedArBucket(): ARAgingBucketDto['bucket'] | null {
    return this.selectedArBucket;
  }

  getArAgingBuckets(): ARAgingBucketDto[] {
    return structuredClone(this.arAging);
  }

  getCustomerProfitability(): CustomerProfitabilityDto[] {
    if (!this.selectedCustomerId) {
      return structuredClone(this.customerProfitability);
    }
    return structuredClone(
      this.customerProfitability.filter((c) => c.customerId === this.selectedCustomerId),
    );
  }

  /**
   * F2.5: Updates the interactive Counter-Offer Margin Simulator Slider on an Exception Card.
   */
  updateCounterOfferSlider(
    exceptionId: string,
    proposedPrice: number,
  ): CounterOfferSimulation | null {
    const card = this.exceptions.find((e) => e.id === exceptionId);
    if (!card) return null;

    const floor = card.contextPayload.floorPrice ?? 90;
    const cost = card.contextPayload.landedCost ?? 82;
    const qty = card.contextPayload.qty ?? 1;
    const requested = card.contextPayload.requestedPrice ?? proposedPrice;

    const sim = simulateCounterOfferMargin(proposedPrice, floor, cost, qty, requested);
    this.sliderSimulations.set(exceptionId, sim);
    return sim;
  }

  getCounterOfferSimulation(exceptionId: string): CounterOfferSimulation | undefined {
    return this.sliderSimulations.get(exceptionId);
  }

  getPendingExceptions(): ExceptionCardDto[] {
    return structuredClone(this.exceptions.filter((e) => e.status === 'PENDING'));
  }

  getAllExceptions(): ExceptionCardDto[] {
    return structuredClone(this.exceptions);
  }

  /**
   * F2.5: Resolves an exception via hotkey ('A' | 'C' | 'R') or button click.
   */
  async resolveExceptionByHotkey(
    exceptionId: string,
    hotkey: 'A' | 'C' | 'R',
    remarks = 'Resolved from Control Tower Workbench',
  ) {
    const card = this.exceptions.find((e) => e.id === exceptionId);
    if (!card) {
      throw new Error(`Exception ${exceptionId} not found`);
    }

    const actionMap = {
      A: 'APPROVED',
      C: 'COUNTERED',
      R: 'REJECTED',
    } as const;
    const action = actionMap[hotkey];
    const sim = this.sliderSimulations.get(exceptionId);

    const response = await this.apiClient.request<ExceptionCardDto>(
      `/exceptions/${exceptionId}/resolve`,
      {
        method: 'POST',
        body: {
          action,
          remarks,
          counter:
            action === 'COUNTERED' && sim
              ? { proposedPrice: sim.proposedPrice }
              : undefined,
        },
        idempotencyKey: `resolve-${exceptionId}-${action}`,
      },
    );

    if (response.data) {
      const idx = this.exceptions.findIndex((e) => e.id === exceptionId);
      if (idx >= 0) {
        this.exceptions[idx] = response.data;
      }
      this.pulse.pendingExceptions = this.exceptions.filter(
        (e) => e.status === 'PENDING',
      ).length;
      this.eventHub.emit('exception.resolved', {
        exceptionId,
        action,
        referenceId: card.referenceId,
      });
    }

    return response;
  }

  /**
   * F2.6: Wall-Board Kiosk Mode & 60-second auto-rotation.
   */
  toggleKioskMode(enable?: boolean): {
    isKioskModeActive: boolean;
    themeMode: 'OBSIDIAN_DARK' | 'CLEAN_SLATE_LIGHT';
    activePanel: KioskCarouselPanel;
  } {
    this.isKioskModeActive =
      enable !== undefined ? enable : !this.isKioskModeActive;
    if (this.isKioskModeActive) {
      this.themeMode = 'OBSIDIAN_DARK';
    }
    return {
      isKioskModeActive: this.isKioskModeActive,
      themeMode: this.themeMode,
      activePanel: KIOSK_PANELS[this.activeKioskPanelIndex],
    };
  }

  advanceKioskCarousel(): KioskCarouselPanel {
    this.activeKioskPanelIndex =
      (this.activeKioskPanelIndex + 1) % KIOSK_PANELS.length;
    return KIOSK_PANELS[this.activeKioskPanelIndex];
  }

  setThemeMode(mode: 'OBSIDIAN_DARK' | 'CLEAN_SLATE_LIGHT'): void {
    this.themeMode = mode;
  }
}

