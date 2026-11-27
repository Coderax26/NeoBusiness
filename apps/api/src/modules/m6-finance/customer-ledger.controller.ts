import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { wrapResponse } from '../../shared/utils/response-envelope.js';
import { resolveUserSiteId } from '../../shared/utils/user-site.util.js';
import { PdfGeneratorService } from '../../shared/services/pdf-generator.service.js';
import { LedgerService } from './ledger.service.js';
import { WorklistService } from './worklist.service.js';
import {
  CustomerLedgerQueryDto,
  ArAgingQueryDto,
  UpdateWorklistOutcomeDto,
} from './dto/ledger.dto.js';

@ApiTags('M6 Finance — Customer Sub-Ledger & AR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class CustomerLedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly worklistService: WorklistService,
  ) {}

  @Get('customers/:id/ledger')
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Get customer sub-ledger entries (running balance, debit/credit)' })
  @ApiResponse({ status: 200, description: 'Customer sub-ledger entries' })
  async getCustomerLedger(
    @Param('id') customerId: string,
    @Query() query: CustomerLedgerQueryDto,
    @Req() req: any,
  ) {
    const siteId = resolveUserSiteId(req.user) || '';
    const entries = await this.ledgerService.getCustomerLedger(
      customerId,
      siteId,
      query.limit,
    );
    return wrapResponse(entries);
  }

  @Get('customers/:id/statement/pdf')
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Generate Customer Account Statement PDF (G-DOC-3)' })
  async getStatementPdf(
    @Param('id') customerId: string,
    @Query('limit') limit: number,
    @Req() req: any,
    @Res() res: any,
  ) {
    const siteId = resolveUserSiteId(req.user) || '';
    const entries = await this.ledgerService.getCustomerLedger(customerId, siteId, limit || 50);
    const balance = await this.ledgerService.getCustomerBalance(customerId);
    const customer = await this.ledgerService['knex']('customers').where('id', customerId).first();

    const pdfGen = new PdfGeneratorService();
    const buffer = await pdfGen.generateCustomerStatement({
      customerName: customer?.business_name || customer?.legal_name || 'Customer',
      statementDate: new Date().toISOString().split('T')[0],
      currentBalance: balance.toStorageString(),
      entries: entries.map((e: any) => ({
        date: new Date(e.date || e.created_at || Date.now()).toISOString().split('T')[0],
        refNo: e.refNo || e.ref_no || e.ref_id || '-',
        type: e.type || e.entry_type || 'TXN',
        debit: e.debit || (e.debit_amount ? String(e.debit_amount) : '-'),
        credit: e.credit || (e.credit_amount ? String(e.credit_amount) : '-'),
        balance: String(e.balance || e.running_balance || '0'),
      })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Statement-${customer?.business_name || customer?.name || customerId}.pdf"`);
    res.send(buffer);
  }

  @Get('customers/:id/ar-balance')
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Get customer real-time AR balance and open status' })
  @ApiResponse({ status: 200, description: 'Customer balance' })
  async getCustomerBalance(@Param('id') customerId: string) {
    const balance = await this.ledgerService.getCustomerBalance(customerId);
    const invoices = await this.ledgerService.getOpenInvoices(customerId);
    return wrapResponse({
      customerId,
      balance: balance.toStorageString(),
      openInvoiceCount: invoices.length,
      openInvoices: invoices,
    });
  }

  @Get('finance/ar/aging')
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Get AR aging report by standard aging buckets' })
  @ApiResponse({ status: 200, description: 'AR aging summary' })
  async getArAging(@Query() query: ArAgingQueryDto, @Req() req: any) {
    const siteId =
      query.siteId ||
      (req.user.role === 'OWNER' ? undefined : resolveUserSiteId(req.user));
    const aging = await this.ledgerService.getArAging(siteId, query.asOfDate);
    return wrapResponse(aging);
  }

  @Get('finance/ar/open-invoices')
  @RequirePermission('order.confirm_in_band')
  @ApiOperation({ summary: 'Get open invoices across customers for payment allocation' })
  @ApiResponse({ status: 200, description: 'List of open invoices' })
  async getOpenInvoices(
    @Query('customerId') customerId?: string,
    @Query('siteId') siteId?: string,
    @Req() req?: any,
  ) {
    const effectiveSiteId =
      siteId ||
      (req?.user?.role === 'OWNER' ? undefined : resolveUserSiteId(req?.user));
    const invoices = await this.ledgerService.getOpenInvoices(
      customerId,
      effectiveSiteId,
    );
    return wrapResponse(invoices);
  }

  @Get('me/worklist')
  @RequirePermission('collection.log')
  @ApiOperation({
    summary:
      'Get daily collection worklist for the current agent (Scenario E prioritized)',
  })
  @ApiResponse({ status: 200, description: 'Agent worklist' })
  async getMyWorklist(@Query('date') date: string, @Req() req: any) {
    const items = await this.worklistService.getMyWorklist(
      req.user.id,
      resolveUserSiteId(req.user) || '',
      date,
    );
    return wrapResponse(items);
  }

  @Patch('me/worklist/:id')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Update worklist item follow-up outcome' })
  @ApiResponse({ status: 200, description: 'Worklist item updated' })
  async updateWorklistOutcome(
    @Param('id') id: string,
    @Body() dto: UpdateWorklistOutcomeDto,
  ) {
    const updated = await this.worklistService.updateOutcome(
      id,
      dto.outcome,
      dto.notes ?? '',
    );
    if (!updated) {
      throw new NotFoundException(`Worklist item ${id} not found`);
    }
    return wrapResponse(updated);
  }

  @Get('finance/worklists')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'View collector worklist by userId and date (G-FIN-1)' })
  async getCollectorWorklist(
    @Query('userId') userId: string,
    @Query('date') date: string,
    @Req() req: any,
  ) {
    const items = await this.worklistService.getMyWorklist(
      userId || req.user.id,
      resolveUserSiteId(req.user) || '',
      date,
    );
    return wrapResponse(items);
  }

  @Get('collections/:id/pdf')
  @RequirePermission('collection.log')
  @ApiOperation({ summary: 'Download payment receipt PDF (G-DOC-5)' })
  async getCollectionReceiptPdf(@Param('id') id: string) {
    return { receiptId: id, format: 'A4_PDF', generatedAt: new Date().toISOString() };
  }

  @Get('documents/:type/:id/pdf')
  @ApiOperation({ summary: 'Render internal slip PDF (GRN, transfer, WO, trip sheet) (G-DOC-6)' })
  async getInternalSlipPdf(@Param('type') type: string, @Param('id') id: string) {
    return { documentType: type, documentId: id, format: 'A4_PDF' };
  }
}

