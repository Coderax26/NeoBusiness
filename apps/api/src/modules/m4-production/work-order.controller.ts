import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { WorkOrderService } from './work-order.service.js';
import {
  CreateWorkOrderDto,
  RecordConsumptionDto,
  RecordOutputDto,
  WorkOrderResponseDto,
} from './dto/work-order.dto.js';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { RbacGuard } from '../m0-platform/rbac.service.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';

@ApiTags('M4 Production - Work Orders')
@Controller('production/work-orders')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WorkOrderController {
  constructor(private readonly woService: WorkOrderService) {}

  @Post()
  @RequirePermission('production.workorder.create')
  @ApiOperation({ summary: 'Create a new work order from a BOM' })
  @ApiResponse({
    status: 201,
    description: 'Work order created',
    type: WorkOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or BOM not ACTIVE' })
  @ApiResponse({ status: 409, description: 'Work order number already exists' })
  async createWorkOrder(
    @Body() dto: CreateWorkOrderDto,
    @Req() req: any,
  ): Promise<WorkOrderResponseDto> {
    const resolvedSiteId = resolveUserSiteId(req.user, dto.siteId);
    return this.woService.createWorkOrder(
      { ...dto, siteId: resolvedSiteId ?? dto.siteId },
      req.user.sub,
    );
  }

  @Get()
  @RequirePermission('production.workorder.read')
  @ApiOperation({ summary: 'List work orders for a site' })
  @ApiQuery({ name: 'siteId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of work orders',
    type: [WorkOrderResponseDto],
  })
  async listWorkOrders(
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
  ): Promise<WorkOrderResponseDto[]> {
    return this.woService.listWorkOrders(siteId, status);
  }

  @Get(':id')
  @RequirePermission('production.workorder.read')
  @ApiOperation({ summary: 'Get work order by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Work order details',
    type: WorkOrderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  async getWorkOrder(@Param('id') id: string): Promise<WorkOrderResponseDto> {
    return this.woService.getWorkOrder(id);
  }

  @Post(':id/start')
  @RequirePermission('production.workorder.start')
  @ApiOperation({ summary: 'Start a work order (PLANNED → IN_PROGRESS)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Work order started',
    type: WorkOrderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot start in current status' })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  async startWorkOrder(
    @Param('id') id: string,
    @Body() dto: { startedBy?: string; siteId?: string },
    @Req() req: any,
  ): Promise<WorkOrderResponseDto> {
    return this.woService.startWorkOrder(
      id,
      req.user.sub,
      dto?.siteId,
    );
  }

  @Post(':id/consumption')
  @RequirePermission('production.workorder.consume')
  @ApiOperation({ summary: 'Record raw material consumption' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Consumption recorded',
    type: WorkOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or WO not in PROGRESS',
  })
  @ApiResponse({ status: 404, description: 'Work order or batch not found' })
  async recordConsumption(
    @Param('id') id: string,
    @Body() dto: RecordConsumptionDto,
    @Req() req: any,
  ): Promise<WorkOrderResponseDto> {
    return this.woService.recordConsumption(
      id,
      dto,
      req.user.sub,
    );
  }

  @Post(':id/output')
  @RequirePermission('production.workorder.output')
  @ApiOperation({ summary: 'Record finished goods output' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Output recorded',
    type: WorkOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or WO not in PROGRESS',
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  async recordOutput(
    @Param('id') id: string,
    @Body() dto: RecordOutputDto,
    @Req() req: any,
  ): Promise<WorkOrderResponseDto> {
    return this.woService.recordOutput(
      id,
      dto,
      req.user.sub,
    );
  }

  @Post(':id/complete')
  @RequirePermission('production.workorder.complete')
  @ApiOperation({
    summary: 'Complete a work order (BR-06 yield check applied)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Work order completed',
    type: WorkOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot complete in current status',
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  async completeWorkOrder(
    @Param('id') id: string,
    @Body() dto: { completedBy?: string; siteId?: string },
    @Req() req: any,
  ): Promise<WorkOrderResponseDto> {
    return this.woService.completeWorkOrder(
      id,
      req.user.sub,
      dto?.siteId,
    );
  }

  @Post(':id/cancel')
  @RequirePermission('production.workorder.cancel')
  @ApiOperation({ summary: 'Cancel a work order' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 204,
    description: 'Work order cancelled',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel a COMPLETED work order',
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  async cancelWorkOrder(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<void> {
    await this.woService.cancelWorkOrder(id, req.user.sub);
  }
}
