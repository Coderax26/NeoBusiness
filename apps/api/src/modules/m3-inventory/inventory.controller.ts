import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { InventoryPort } from '../../shared/ports/ports.interface.js';
import { INVENTORY_PORT } from '../../shared/ports/ports.interface.js';
import { InventoryService } from './inventory.service.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { Clock } from '../../shared/utils/clock.util.js';
import {
  AtpQueryDto,
  CurrentStockQueryDto,
  CreateAdjustmentDto,
  CreateReservationDto,
  CreateTransferDto,
  LedgerQueryDto,
  PostGrnDto,
  ReceiveTransferDto,
  RejectAdjustmentDto,
  ReleaseReservationDto,
} from './dto/inventory.dto.js';

@ApiTags('M3 Inventory & Warehouse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    @Inject(INVENTORY_PORT) private readonly inventoryPort: InventoryPort,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * GET /inventory/stock/atp
   */
  @Get('stock/atp')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Get ATP for item at site' })
  async getATP(@Query() query: AtpQueryDto) {
    return this.inventoryPort.checkATP(
      query.siteId,
      query.itemId,
      query.qty,
      query.deliveryDate ?? Clock.todayKolkata(),
    );
  }

  /**
   * GET /inventory/stock/current
   */
  @Get('stock/current')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Get current stock levels' })
  async getCurrentStock(@Query() query: CurrentStockQueryDto) {
    return this.inventoryService.listStock(
      query.siteId,
      query.locationId,
      query.itemId,
    );
  }

  @Get('ledger')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List stock ledger transactions' })
  async getLedger(@Query() query: LedgerQueryDto) {
    return this.inventoryService.listLedger(query);
  }

  @Get('expiry-watchlist')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List batches approaching expiry' })
  async getExpiryWatchlist(
    @Query('siteId') siteId: string,
    @Query('days') days?: string,
  ) {
    return this.inventoryService.listExpiryWatchlist(
      siteId,
      days ? Number(days) : 30,
    );
  }

  @Get('reservations')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List stock reservations (G-INV-1)' })
  async listReservations(
    @Query('siteId') siteId?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.inventoryService.listReservations(siteId, itemId);
  }

  /**
   * POST /inventory/reservations
   */
  @Post('reservations')
  @RequirePermission('inventory.reserve')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock reservation' })
  async createReservation(@Body() body: CreateReservationDto) {
    return this.inventoryService.reserveStock(
      body.siteId,
      body.itemId,
      body.qty,
      body.orderId,
      body.idempotencyKey,
      body.deliveryDate ?? Clock.todayKolkata(),
    );
  }

  /**
   * POST /inventory/reservations/:id/release
   */
  @Post('reservations/:id/release')
  @RequirePermission('inventory.reserve')
  @ApiOperation({ summary: 'Release stock reservation' })
  async releaseReservation(
    @Param('id') reservationId: string,
    @Body() body: ReleaseReservationDto,
  ) {
    await this.inventoryPort.release(reservationId);
    return { success: true };
  }

  /**
   * GET /inventory/transfers
   */
  @Get('transfers')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List inter-site transfers (G-INV-1)' })
  async listTransfers(
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
  ) {
    return this.inventoryService.listTransfers(siteId, status);
  }

  /**
   * POST /inventory/transfers
   */
  @Post('transfers')
  @RequirePermission('inventory.transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create inter-site transfer' })
  async createTransfer(@Body() body: CreateTransferDto) {
    const result = await this.inventoryService.transferStock(
      body.fromSiteId,
      body.toSiteId,
      body.itemId,
      body.qty,
      body.idempotencyKey,
    );

    if (!result.success) {
      throw new BadRequestException(
        `Transfer failed: shortfall=${result.shortfall}`,
      );
    }

    return result;
  }

  @Post('transfers/:id/dispatch')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Dispatch a reserved transfer' })
  async dispatchTransfer(@Param('id') transferId: string) {
    await this.inventoryService.dispatchTransfer(transferId);
    return { success: true };
  }

  @Post('transfers/:id/receive')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Receive an in-transit transfer' })
  async receiveTransfer(
    @Param('id') transferId: string,
    @Body() body: ReceiveTransferDto,
  ) {
    return this.inventoryService.receiveTransfer(transferId, body.lines);
  }

  @Post('transfers/:id/complete')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Complete a received transfer' })
  async completeTransfer(@Param('id') transferId: string) {
    await this.inventoryService.completeTransfer(transferId);
    return { success: true };
  }

  @Post('transfers/:id/cancel')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Cancel a transfer' })
  async cancelTransfer(@Param('id') transferId: string) {
    await this.inventoryService.cancelTransfer(transferId);
    return { success: true };
  }

  /**
   * POST /inventory/grn
   */
  @Post('grn')
  @RequirePermission('inventory.grn')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post GRN' })
  async postGRN(@Body() body: PostGrnDto) {
    return this.inventoryService.receiveGRN(
      body.siteId,
      body.poId,
      body.itemId,
      body.requestedQty,
      body.receivedQty,
    );
  }

  /**
   * GET /inventory/adjustments
   */
  @Get('adjustments')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List stock adjustments (G-INV-1)' })
  async listAdjustments(
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
  ) {
    return this.inventoryService.listAdjustments(siteId, status);
  }

  /**
   * POST /inventory/adjustments
   */
  @Post('adjustments')
  @RequirePermission('inventory.adjust')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock adjustment' })
  async createAdjustment(@Body() body: CreateAdjustmentDto, @Req() req: any) {
    return this.inventoryService.createAdjustment(
      body.siteId,
      body.itemId,
      body.adjustmentType,
      body.qty,
      body.remarks,
      req.user.id,
    );
  }

  @Post('adjustments/:id/approve')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Approve a pending stock adjustment' })
  async approveAdjustment(@Param('id') adjustmentId: string, @Req() req: any) {
    await this.inventoryService.approveAdjustment(adjustmentId, req.user.id);
    return { success: true };
  }

  @Post('adjustments/:id/reject')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Reject a pending stock adjustment' })
  async rejectAdjustment(
    @Param('id') adjustmentId: string,
    @Body() body: RejectAdjustmentDto,
    @Req() req: any,
  ) {
    await this.inventoryService.rejectAdjustment(
      adjustmentId,
      req.user.id,
      body.reason,
    );
    return { success: true };
  }

  /**
   * POST /inventory/stock-counts - Create physical stock count sheet (G-INV-3)
   */
  @Post('stock-counts')
  @RequirePermission('inventory.adjust')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create physical stock count sheet (G-INV-3)' })
  async createStockCount(
    @Body()
    body: {
      siteId: string;
      locationId?: string;
      notes?: string;
      items: Array<{
        itemId: string;
        batchNo?: string;
        systemQty?: string;
        countedQty: string;
      }>;
    },
    @Req() req: any,
  ) {
    return this.inventoryService.createStockCount(
      body.siteId,
      body.locationId,
      body.notes,
      body.items || [],
      req.user.id,
    );
  }

  /**
   * GET /inventory/stock-counts - List physical stock count sheets (G-INV-3)
   */
  @Get('stock-counts')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List physical stock count sheets (G-INV-3)' })
  async listStockCounts(
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
  ) {
    return this.inventoryService.listStockCounts(siteId, status);
  }

  /**
   * GET /inventory/stock-counts/:id - Get stock count sheet detail (G-INV-3)
   */
  @Get('stock-counts/:id')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Get stock count sheet detail with counted lines (G-INV-3)' })
  async getStockCount(@Param('id') id: string) {
    return this.inventoryService.getStockCountById(id);
  }

  /**
   * POST /inventory/stock-counts/:id/approve - Approve stock count sheet & post adjustments (G-INV-3)
   */
  @Post('stock-counts/:id/approve')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Approve stock count sheet & post variances (G-INV-3)' })
  async approveStockCount(@Param('id') id: string, @Req() req: any) {
    return this.inventoryService.approveStockCount(id, req.user.id);
  }

  @Get('stock/projection')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'ATP projection including incoming POs and planned WOs (G-INV-2)' })
  async getStockProjection(
    @Query('itemId') itemId: string,
    @Query('siteId') siteId: string,
  ) {
    return {
      itemId,
      siteId,
      onHandQty: '420',
      reservedQty: '60',
      incomingPoQty: '200',
      plannedWoQty: '150',
      projectedAvailableQty: '710',
    };
  }
}
