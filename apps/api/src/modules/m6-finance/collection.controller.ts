import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { CollectionService } from './collection.service.js';
import { LedgerService } from './ledger.service.js';
import {
  LogCollectionDto,
  AllocateReceiptDto,
  ListCollectionsQueryDto,
} from './dto/collection.dto.js';

@ApiTags('M6 Finance — Field Collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class CollectionController {
  constructor(
    private readonly collectionService: CollectionService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Post('collections')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('collection.log')
  @ApiOperation({
    summary:
      'Log mobile/field collection receipt (idempotent, atomic BR-07 transaction)',
  })
  @ApiResponse({ status: 201, description: 'Collection logged' })
  async logCollection(@Body() dto: LogCollectionDto, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user, dto.siteId) || '';
    const result = await this.collectionService.logCollection({
      siteId,
      customerId: dto.customerId,
      amount: dto.amount,
      onAccountAmount: dto.onAccountAmount,
      paymentMode: dto.paymentMode,
      referenceNo: dto.referenceNo,
      collectedByUserId: req.user.id,
      gpsLatLng: dto.gpsLatLng,
      deviceId: dto.deviceId,
      idempotencyKey: dto.idempotencyKey,
      chequeDetails: dto.chequeDetails
        ? {
            chequeNo: dto.chequeDetails.chequeNo,
            bank: dto.chequeDetails.bank,
            chequeDate: new Date(dto.chequeDetails.chequeDate),
          }
        : undefined,
      allocations: dto.allocations,
    });
    return wrapResponse(result);
  }

  @Post('collections/allocate')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Allocate an existing receipt to invoices' })
  @ApiResponse({ status: 200, description: 'Allocations posted' })
  async allocate(@Body() dto: AllocateReceiptDto) {
    const allocations = await this.ledgerService.allocateReceipt(
      dto.receiptId,
      dto.allocations,
    );
    return wrapResponse(allocations);
  }

  @Get('collections')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'List collection receipts' })
  @ApiResponse({ status: 200, description: 'Receipts list' })
  async list(@Query() query: ListCollectionsQueryDto, @Req() req: any) {
    const siteId =
      query.siteId ||
      (req.user.role === 'OWNER' ? undefined : resolveUserSiteId(req.user));
    const result = await this.collectionService.listReceipts({
      ...query,
      siteId,
    });
    return wrapResponse(result.items, {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  }

  @Get('collections/:id')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Get collection receipt detail with allocations' })
  @ApiResponse({ status: 200, description: 'Receipt detail' })
  async getById(@Param('id') id: string) {
    const receipt = await this.collectionService.getReceipt(id);
    return wrapResponse(receipt);
  }

  @Get('me/collections')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: "Get current user's collections for today" })
  @ApiResponse({ status: 200, description: "Today's user collections" })
  async getMyCollections(@Query('date') date: string, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user) || '';
    const collections = await this.collectionService.getMyCollections(
      req.user.id,
      siteId,
      date,
    );
    return wrapResponse(collections);
  }

  @Post('collections/:id/reverse')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Reverse a posted collection receipt via contra entry' })
  @ApiResponse({ status: 200, description: 'Receipt reversed' })
  async reverseReceipt(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const result = await this.collectionService.reverseReceipt(
      id,
      String(body?.reason || 'Receipt reversed'),
      req.user.id,
    );
    return wrapResponse(result);
  }
}

