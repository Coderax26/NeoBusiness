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
import { BomService } from './bom.service.js';
import {
  CreateBomDto,
  BomHeaderResponseDto,
  BomStatus,
} from './dto/bom.dto.js';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
import { RbacGuard } from '../m0-platform/rbac.service.js';

@ApiTags('M4 Production - BOM')
@Controller('production/boms')
@UseGuards(JwtAuthGuard, RbacGuard)
export class BomController {
  constructor(private readonly bomService: BomService) {}

  @Post()
  @RequirePermission('production.bom.create')
  @ApiOperation({ summary: 'Create a new BOM' })
  @ApiResponse({
    status: 201,
    description: 'BOM created',
    type: BomHeaderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'BOM number already exists' })
  async createBom(
    @Body() dto: CreateBomDto,
    @Req() req: any,
  ): Promise<BomHeaderResponseDto> {
    return this.bomService.createBom(dto, req.user.sub);
  }

  @Get()
  @RequirePermission('production.bom.read')
  @ApiOperation({ summary: 'List BOMs for an item at a site' })
  @ApiQuery({ name: 'itemId', required: true, type: String })
  @ApiQuery({ name: 'siteId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'List of BOMs',
    type: [BomHeaderResponseDto],
  })
  async listBoms(
    @Query('itemId') itemId: string,
    @Query('siteId') siteId: string,
  ): Promise<BomHeaderResponseDto[]> {
    return this.bomService.listBoms(itemId, siteId);
  }

  @Get('active')
  @RequirePermission('production.bom.read')
  @ApiOperation({ summary: 'Get the active BOM for an item at a site' })
  @ApiQuery({ name: 'itemId', required: true, type: String })
  @ApiQuery({ name: 'siteId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Active BOM or null',
    type: BomHeaderResponseDto,
  })
  async getActiveBom(
    @Query('itemId') itemId: string,
    @Query('siteId') siteId: string,
  ): Promise<BomHeaderResponseDto | null> {
    return this.bomService.getActiveBom(itemId, siteId);
  }

  @Get(':id')
  @RequirePermission('production.bom.read')
  @ApiOperation({ summary: 'Get BOM by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'BOM details',
    type: BomHeaderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async getBom(@Param('id') id: string): Promise<BomHeaderResponseDto> {
    return this.bomService.getBom(id);
  }

  @Post(':id/activate')
  @RequirePermission('production.bom.activate')
  @ApiOperation({ summary: 'Activate a BOM (deactivates other versions)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'BOM activated',
    type: BomHeaderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot activate OBSOLETE BOM or already ACTIVE',
  })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async activateBom(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<BomHeaderResponseDto> {
    return this.bomService.activateBom(id, req.user.sub);
  }

  @Patch(':id')
  @RequirePermission('production.bom.update')
  @ApiOperation({ summary: 'Update a DRAFT BOM' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({
    status: 200,
    description: 'BOM updated',
    type: BomHeaderResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot update ACTIVE BOM' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  @ApiResponse({ status: 409, description: 'BOM number already exists' })
  async updateBom(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBomDto>,
    @Req() req: any,
  ): Promise<BomHeaderResponseDto> {
    return this.bomService.updateBom(id, dto, req.user.sub);
  }

  @Delete(':id')
  @RequirePermission('production.bom.delete')
  @ApiOperation({ summary: 'Delete a non-ACTIVE BOM' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'BOM deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete ACTIVE BOM' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async deleteBom(@Param('id') id: string): Promise<void> {
    await this.bomService.deleteBom(id);
  }
}
