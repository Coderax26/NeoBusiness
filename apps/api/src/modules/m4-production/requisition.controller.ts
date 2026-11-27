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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RequisitionService } from './requisition.service.js';
import {
  CreateRequisitionDto,
  UpdateRequisitionDto,
  RequisitionResponseDto,
  RequisitionStatus,
} from './dto/requisition.dto.js';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { RbacGuard } from '../m0-platform/rbac.service.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';

@ApiTags('M4 Production - Requisitions')
@Controller('production/requisitions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class RequisitionController {
  constructor(private readonly reqService: RequisitionService) { }

  @Post()
  @RequirePermission('production.requisition.create')
  @ApiOperation({ summary: 'Create a new production requisition' })
  @ApiResponse({
    status: 201,
    description: 'Requisition created',
    type: RequisitionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 409,
    description: 'Requisition number already exists',
  })
  async createRequisition(
    @Body() dto: CreateRequisitionDto,
    @Req() req: any,
  ): Promise<RequisitionResponseDto> {
    const resolvedSiteId = resolveUserSiteId(req.user, dto.siteId);
    return this.reqService.createRequisitionFromDto(
      {
        ...dto,
        siteId: resolvedSiteId ?? dto.siteId,
        requestedBy: dto.requestedBy || req.user.sub,
      },
      req.user.sub,
    );
  }

  @Post('generate')
  @RequirePermission('production.requisition.generate')
  @ApiOperation({
    summary:
      'Generate requisition from finished good demand (BOM explosion + net requirements)',
  })
  @ApiResponse({
    status: 201,
    description: 'Requisition generated',
    type: RequisitionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'No active BOM or all requirements covered',
  })
  async generateRequisition(
    @Body()
    dto: {
      siteId?: string;
      demands?: Array<{ itemId: string; qty: string; requiredBy: string }>;
      reqNoPrefix?: string;
    },
    @Req() req: any,
  ): Promise<RequisitionResponseDto> {
    const resolvedSiteId = resolveUserSiteId(req.user, dto?.siteId);
    if (!resolvedSiteId) {
      throw new BadRequestException('siteId is required to generate requisitions');
    }
    return this.reqService.generateRequisitionFromDemand(
      resolvedSiteId,
      dto?.demands ?? [],
      req.user.sub,
      dto?.reqNoPrefix,
    );
  }

  @Get()
  @RequirePermission('production.requisition.read')
  @ApiOperation({ summary: 'List requisitions for a site' })
  @ApiQuery({ name: 'siteId', required: true, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of requisitions',
    type: [RequisitionResponseDto],
  })
  async listRequisitions(
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
  ): Promise<RequisitionResponseDto[]> {
    return this.reqService.listRequisitions(siteId, status);
  }

  @Get(':id')
  @RequirePermission('production.requisition.read')
  @ApiOperation({ summary: 'Get requisition by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Requisition details',
    type: RequisitionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Requisition not found' })
  async getRequisition(
    @Param('id') id: string,
  ): Promise<RequisitionResponseDto> {
    return this.reqService.getRequisition(id);
  }

  @Patch(':id')
  @RequirePermission('production.requisition.update')
  @ApiOperation({ summary: 'Update a DRAFT/PENDING requisition' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Requisition updated',
    type: RequisitionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot update CONVERTED/CANCELLED requisition',
  })
  @ApiResponse({ status: 404, description: 'Requisition not found' })
  async updateRequisition(
    @Param('id') id: string,
    @Body() dto: UpdateRequisitionDto,
    @Req() req: any,
  ): Promise<RequisitionResponseDto> {
    return this.reqService.updateRequisition(id, dto, req.user.sub);
  }

  @Post(':id/approve')
  @RequirePermission('production.requisition.approve')
  @ApiOperation({ summary: 'Approve a DRAFT/PENDING requisition' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Requisition approved',
    type: RequisitionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot approve in current status' })
  @ApiResponse({ status: 404, description: 'Requisition not found' })
  async approveRequisition(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<RequisitionResponseDto> {
    return this.reqService.approveRequisition(id, req.user.sub);
  }

  @Post(':id/convert-to-po')
  @RequirePermission('production.requisition.convert')
  @ApiOperation({
    summary: 'Convert APPROVED requisition to PO(s) via ProcurementPort',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Requisition converted',
    type: 'object',
  })
  @ApiResponse({
    status: 400,
    description: 'Can only convert APPROVED requisitions',
  })
  @ApiResponse({ status: 404, description: 'Requisition not found' })
  async convertToPo(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<{ requisition: RequisitionResponseDto; poIds: string[] }> {
    return this.reqService.convertToPo(id, req.user.sub);
  }

  @Post(':id/cancel')
  @RequirePermission('production.requisition.cancel')
  @ApiOperation({ summary: 'Cancel a requisition' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Requisition cancelled' })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel CONVERTED requisition',
  })
  @ApiResponse({ status: 404, description: 'Requisition not found' })
  async cancelRequisition(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<void> {
    await this.reqService.cancelRequisition(id, req.user.sub);
  }

  @Delete(':id')
  @RequirePermission('production.requisition.delete')
  @ApiOperation({ summary: 'Delete a DRAFT/CANCELLED requisition' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Requisition deleted' })
  @ApiResponse({
    status: 400,
    description: 'Can only delete DRAFT/CANCELLED requisitions',
  })
  @ApiResponse({ status: 404, description: 'Requisition not found' })
  async deleteRequisition(@Param('id') id: string): Promise<void> {
    await this.reqService.deleteRequisition(id);
  }
}
