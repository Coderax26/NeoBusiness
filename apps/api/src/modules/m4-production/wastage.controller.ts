import {
  Controller,
  Get,
  Post,
  Patch,
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
import { WastageService } from './wastage.service.js';
import {
  CreateWastageDto,
  UpdateWastageDto,
  WastageResponseDto,
  WastageStatus,
} from './dto/wastage.dto.js';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { RbacGuard } from '../m0-platform/rbac.service.js';

@ApiTags('M4 Production - Wastage')
@Controller('production/wastage')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WastageController {
  constructor(private readonly wastageService: WastageService) {}

  @Post()
  @RequirePermission('production.wastage.create')
  @ApiOperation({ summary: 'Record production wastage' })
  @ApiResponse({
    status: 201,
    description: 'Wastage recorded',
    type: WastageResponseDto,
  })
  async recordWastage(
    @Body() dto: CreateWastageDto,
    @Req() req: any,
  ): Promise<WastageResponseDto> {
    return this.wastageService.recordWastage(dto, req.user.sub);
  }

  @Get()
  @RequirePermission('production.wastage.read')
  @ApiOperation({ summary: 'List wastage records for a site' })
  @ApiQuery({ name: 'siteId', required: true, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of wastage records',
    type: [WastageResponseDto],
  })
  async listWastage(
    @Query('siteId') siteId: string,
    @Query('status') status?: string,
  ): Promise<WastageResponseDto[]> {
    // Note: siteId from query is not used directly due to RLS middleware
    // The service will resolve site from work_order site
    return this.wastageService.listWastage(siteId, status);
  }

  @Get('work-order/:woId')
  @RequirePermission('production.wastage.read')
  @ApiOperation({ summary: 'Get wastage records for a work order' })
  @ApiParam({ name: 'woId', type: String })
  @ApiResponse({
    status: 200,
    description: 'Wastage records for work order',
    type: [WastageResponseDto],
  })
  async getWastageByWo(
    @Param('woId') woId: string,
  ): Promise<WastageResponseDto[]> {
    return this.wastageService.getWastageByWo(woId);
  }

  @Patch(':id')
  @RequirePermission('production.wastage.update')
  @ApiOperation({ summary: 'Update wastage record (approve/write-off)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'Wastage record updated',
    type: WastageResponseDto,
  })
  async updateWastage(
    @Param('id') id: string,
    @Body() dto: UpdateWastageDto,
    @Req() req: any,
  ): Promise<WastageResponseDto> {
    return this.wastageService.updateWastage(id, {
      ...dto,
      approvedBy: req.user.sub,
    });
  }
}
