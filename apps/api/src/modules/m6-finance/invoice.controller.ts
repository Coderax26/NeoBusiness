import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { AuditInterceptor } from '../../shared/interceptors/audit.interceptor.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { InvoiceService } from './invoice.service.js';
import {
  GenerateInvoiceDto,
  CancelInvoiceDto,
  ListInvoicesQueryDto,
} from './dto/invoice.dto.js';

@ApiTags('M6 Finance — Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('generate')
  @UseInterceptors(AuditInterceptor)
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Generate tax invoice from confirmed sales order' })
  @ApiResponse({ status: 201, description: 'Invoice generated' })
  async generate(@Body() dto: GenerateInvoiceDto, @Req() req: any) {
    const siteId = resolveUserSiteId(req.user, dto.siteId) || '';
    const result = await this.invoiceService.generateFromOrder(
      dto.orderId,
      siteId,
      req.user.id,
      {
        tripId: dto.tripId,
        placeOfSupplyStateCode: dto.placeOfSupplyStateCode,
        isCOD: dto.isCOD,
      },
    );
    return wrapResponse(result);
  }

  @Get()
  @RequirePermission('invoice.read')
  @ApiOperation({ summary: 'List invoices with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Invoices list' })
  async list(@Query() query: ListInvoicesQueryDto, @Req() req: any) {
    const siteId =
      query.siteId ||
      (req.user.role === 'OWNER' ? undefined : resolveUserSiteId(req.user));
    const result = await this.invoiceService.listInvoices({
      ...query,
      siteId,
    });
    return wrapResponse(result.items, {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  }

  @Get(':id')
  @RequirePermission('invoice.read')
  @ApiOperation({ summary: 'Get invoice details with lines' })
  @ApiResponse({ status: 200, description: 'Invoice details' })
  async getById(@Param('id') id: string) {
    const invoice = await this.invoiceService.getInvoice(id);
    return wrapResponse(invoice);
  }

  @Get(':id/pdf')
  @RequirePermission('invoice.read')
  @ApiOperation({ summary: 'Download generated Tax Invoice PDF' })
  @ApiResponse({ status: 200, description: 'Tax Invoice PDF stream' })
  async downloadPdf(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer = await this.invoiceService.getInvoicePdf(id);
    const invoice = await this.invoiceService.getInvoice(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Invoice-${invoice.invoice_no}.pdf"`,
    );
    res.send(pdfBuffer);
  }

  @Post(':id/cancel')
  @UseInterceptors(AuditInterceptor)
  @HttpCode(HttpStatus.OK)
  @RequirePermission('invoice.void_request')
  @ApiOperation({ summary: 'Cancel an invoice with ledger reversal (owner approval)' })
  @ApiResponse({ status: 200, description: 'Invoice cancelled' })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
    @Req() req: any,
  ) {
    const result = await this.invoiceService.cancelInvoice(
      id,
      req.user.id,
      dto.reason,
    );
    return wrapResponse(result);
  }
}

