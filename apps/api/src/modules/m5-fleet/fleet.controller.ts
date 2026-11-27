import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { FleetService } from './fleet.service.js';
import {
  CreateExpenseDto,
  CreateIssueDto,
  CreateTripDto,
  CreateVehicleDto,
  DeliverStopDto,
  DispatchTripDto,
  FailStopDto,
  ResolveIssueDto,
} from './dto/fleet.dto.js';

@ApiTags('M5 Fleet, Dispatch & Delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('vehicles')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'List active vehicles' })
  listVehicles(@Query('siteId') siteId?: string) {
    return this.fleet.listVehicles(siteId);
  }

  @Get('vehicles/monitoring')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'Live vehicle status & active trip monitoring' })
  listVehicleMonitoring(@Query('siteId') siteId?: string) {
    return this.fleet.listVehicleMonitoring(siteId);
  }

  @Post('vehicles')
  @RequirePermission('fleet.manage')
  @ApiOperation({ summary: 'Register a vehicle' })
  createVehicle(@Body() dto: CreateVehicleDto, @Req() req: any) {
    return this.fleet.createVehicle(dto, req.user.sub || req.user.id);
  }

  @Get('trips')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'List delivery trips' })
  listTrips(
    @Query('siteId') siteId?: string,
    @Query('status') status?: string,
    @Query('tripDate') tripDate?: string,
  ) {
    return this.fleet.listTrips(siteId, status, tripDate);
  }

  @Post('trips')
  @RequirePermission('fleet.manage')
  @ApiOperation({ summary: 'Build a delivery trip' })
  createTrip(@Body() dto: CreateTripDto, @Req() req: any) {
    return this.fleet.createTrip(dto, req.user.id);
  }

  @Get('trips/:id')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'Get trip manifest' })
  getTrip(@Param('id') id: string) {
    return this.fleet.getTrip(id);
  }

  @Post('trips/:id/dispatch')
  @RequirePermission('fleet.dispatch')
  @ApiOperation({ summary: 'Load and dispatch a trip' })
  dispatchTrip(
    @Param('id') id: string,
    @Body() dto: DispatchTripDto,
    @Req() req: any,
  ) {
    return this.fleet.dispatchTrip(id, dto.lines, req.user.id);
  }

  @Post('trips/:tripId/stops/:stopId/challan')
  @RequirePermission('fleet.manage')
  @ApiOperation({ summary: 'Generate a delivery challan record' })
  generateChallan(
    @Param('tripId') tripId: string,
    @Param('stopId') stopId: string,
    @Body() body?: { ewayBillNo?: string },
  ) {
    return this.fleet.generateChallan(tripId, stopId, body?.ewayBillNo);
  }

  @Get('trips/:tripId/stops/:stopId/challan/pdf')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'Download delivery challan PDF' })
  async getChallanPdf(
    @Param('tripId') tripId: string,
    @Param('stopId') stopId: string,
    @Res() res: Response,
  ) {
    const { buffer, challanNo } = await this.fleet.getChallanPdf(
      tripId,
      stopId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Challan-${challanNo}.pdf"`,
    );
    res.end(buffer);
  }

  @Get('me/trip')
  @RequirePermission('fleet.read_own')
  @ApiOperation({ summary: 'Get the driver manifest' })
  getMyTrip(@Req() req: any, @Query('tripDate') tripDate?: string) {
    return this.fleet.getMyTrip(req.user.id, tripDate);
  }

  @Post('stops/:id/deliver')
  @RequirePermission('fleet.deliver')
  @ApiOperation({ summary: 'Record delivery and ePOD' })
  deliverStop(
    @Param('id') id: string,
    @Body() dto: DeliverStopDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
  ) {
    return this.fleet.deliverStop(
      id,
      dto,
      req.user.id,
      idempotencyKey ?? `delivery:${id}:${req.user.id}`,
    );
  }

  @Post('stops/:id/fail')
  @RequirePermission('fleet.deliver')
  @ApiOperation({ summary: 'Record a failed delivery' })
  failStop(@Param('id') id: string, @Body() dto: FailStopDto, @Req() req: any) {
    return this.fleet.failStop(id, dto, req.user.id);
  }

  @Post('trips/:id/close')
  @RequirePermission('fleet.close')
  @ApiOperation({ summary: 'Close a trip after BR-08 checks' })
  closeTrip(@Param('id') id: string, @Req() req: any) {
    return this.fleet.closeTrip(id, req.user.id);
  }

  @Post('trips/:id/issues')
  @RequirePermission('fleet.deliver')
  @ApiOperation({ summary: 'Report a delivery issue' })
  createIssue(
    @Param('id') id: string,
    @Body() dto: CreateIssueDto,
    @Req() req: any,
  ) {
    return this.fleet.createIssue(id, dto, req.user.id);
  }

  @Post('issues/:id/resolve')
  @RequirePermission('fleet.resolve_issue')
  @ApiOperation({ summary: 'Resolve or escalate a delivery issue' })
  resolveIssue(
    @Param('id') id: string,
    @Body() dto: ResolveIssueDto,
    @Req() req: any,
  ) {
    return this.fleet.resolveIssue(id, dto, req.user.id);
  }

  @Post('trips/:id/expenses')
  @RequirePermission('fleet.deliver')
  @ApiOperation({ summary: 'Log a trip expense' })
  createExpense(
    @Param('id') id: string,
    @Body() dto: CreateExpenseDto,
    @Req() req: any,
  ) {
    return this.fleet.createExpense(id, dto, req.user.id);
  }

  @Post('trips/:id/confirm-loading')
  @RequirePermission('fleet.manage')
  @ApiOperation({ summary: 'Storekeeper confirms loading before dispatch (G-FLT-2)' })
  confirmLoading(
    @Param('id') id: string,
    @Body() body: { verifiedCratesCount?: number },
    @Req() req: any,
  ) {
    return this.fleet.confirmLoading(id, body?.verifiedCratesCount ?? 0, req.user.id);
  }

  @Get('issues')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'List delivery issue reports' })
  listIssues(
    @Query('siteId') siteId?: string,
    @Query('tripId') tripId?: string,
    @Query('status') status?: string,
  ) {
    return this.fleet.listIssues({ siteId, tripId, status });
  }

  @Get('trip-expenses')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'List trip expenses' })
  listExpenses(
    @Query('siteId') siteId?: string,
    @Query('tripId') tripId?: string,
  ) {
    return this.fleet.listExpenses({ siteId, tripId });
  }

  @Post('trips/issues/:issueId/resolve')
  @RequirePermission('fleet.dispatch')
  @ApiOperation({ summary: 'Resolve a delivery issue report (alias route)' })
  resolveTripIssueAlias(
    @Param('issueId') issueId: string,
    @Body() dto: ResolveIssueDto,
    @Req() req: any,
  ) {
    return this.fleet.resolveIssue(issueId, dto, req.user?.sub || req.user?.id);
  }

  @Patch('vehicles/:id')
  @RequirePermission('fleet.manage')
  @ApiOperation({ summary: 'Update vehicle capacity, status, and compliance expiry dates (G-FLT-1)' })
  updateVehicle(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.updateVehicle(id, body, req.user?.sub || req.user?.id);
  }

  @Get('trips/:id/location')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'Read latest GPS ping for a trip (G-FLT-3)' })
  getTripLocation(@Param('id') id: string) {
    return this.fleet.getTripLocation(id);
  }

  @Post('trips/:id/location')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'Record latest GPS ping from driver app (G-FLT-3)' })
  postTripLocation(
    @Param('id') id: string,
    @Body() body: { lat: number; lng: number },
    @Req() req: any,
  ) {
    return this.fleet.postTripLocation(
      id,
      body?.lat,
      body?.lng,
      req.user?.sub || req.user?.id,
    );
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get current user UI & dashboard preferences (G-PREF-1)' })
  getPreferences(@Req() req: any) {
    return this.fleet.getPreferences(req.user?.sub || req.user?.id);
  }

  @Put('me/preferences')
  @ApiOperation({ summary: 'Save current user UI & dashboard preferences (G-PREF-1)' })
  savePreferences(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.savePreferences(req.user?.sub || req.user?.id, body);
  }

  @Post('import/:entity/validate')
  @ApiOperation({ summary: 'Dry-run validate CSV/Excel rows for items/customers/suppliers (G-IMP-1)' })
  validateImport(
    @Param('entity') entity: string,
    @Body() body: { rows?: Array<Record<string, unknown>> },
  ) {
    return this.fleet.validateImport(entity, body?.rows ?? []);
  }

  @Post('import/:entity/commit')
  @ApiOperation({ summary: 'Transactional batch commit of validated master rows (G-IMP-1)' })
  commitImport(
    @Param('entity') entity: string,
    @Body() body: { rows?: Array<Record<string, unknown>> },
    @Req() req: any,
  ) {
    return this.fleet.commitImport(entity, body?.rows ?? [], req.user?.sub || req.user?.id);
  }

  @Get('sales-returns')
  @RequirePermission('order.view')
  @ApiOperation({ summary: 'List sales returns (G-M1-3)' })
  listSalesReturns(@Query('siteId') siteId?: string) {
    return this.fleet.listSalesReturns(siteId);
  }

  @Post('sales-returns')
  @RequirePermission('order.create')
  @ApiOperation({ summary: 'Create a sales return linked to stock receipt & credit note (G-M1-3)' })
  createSalesReturn(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.createSalesReturn(body, req.user?.sub || req.user?.id);
  }

  @Get('production/workers')
  @ApiOperation({ summary: 'List factory workers for attendance tiles (G-M4-2)' })
  listWorkers(@Query('siteId') siteId?: string) {
    return this.fleet.listWorkers(siteId);
  }

  @Post('production/workers')
  @ApiOperation({ summary: 'Create a factory worker record (G-M4-2)' })
  createWorker(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.createWorker(body, req.user?.sub || req.user?.id);
  }

  @Patch('production/workers/:id')
  @ApiOperation({ summary: 'Update a factory worker record (G-M4-2)' })
  updateWorker(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.updateWorker(id, body, req.user?.sub || req.user?.id);
  }

  @Post('procurement/supplier-payments')
  @ApiOperation({ summary: 'Record payment against approved supplier bills (G-AP-1)' })
  createSupplierPayment(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.createSupplierPayment(body, req.user?.sub || req.user?.id);
  }

  @Get('procurement/ap/aging')
  @ApiOperation({ summary: 'Accounts Payable aging buckets by supplier (G-AP-2)' })
  getApAging(@Query('siteId') siteId?: string) {
    return this.fleet.getApAging(siteId);
  }

  @Post('files/presign-upload')
  @ApiOperation({ summary: 'Presign object storage upload URL (G-FILE-1)' })
  presignFileUpload(@Body() body: { fileName: string; mimeType: string }) {
    return this.fleet.presignFileUpload(body);
  }

  @Post('files/confirm')
  @ApiOperation({ summary: 'Confirm attachment upload against entity (G-FILE-1)' })
  confirmFileUpload(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.confirmFileUpload(body, req.user?.sub || req.user?.id);
  }

  @Get('files/:entityType/:entityId')
  @ApiOperation({ summary: 'List attachments for an entity (G-FILE-1)' })
  listEntityFiles(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.fleet.listEntityFiles(entityType, entityId);
  }

  @Post('admin/users/:id/revoke-sessions')
  @ApiOperation({ summary: 'Revoke active sessions for user (G-ADM-1)' })
  revokeUserSessions(@Param('id') id: string) {
    return this.fleet.revokeUserSessions(id);
  }

  @Get('admin/permissions')
  @ApiOperation({ summary: 'Inspect all system permission keys (G-ADM-2)' })
  listAdminPermissions() {
    return this.fleet.listAdminPermissions();
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'List warehouses (G-ADM-3)' })
  listWarehouses(@Query('siteId') siteId?: string) {
    return this.fleet.listWarehouses(siteId);
  }

  @Post('warehouses')
  @ApiOperation({ summary: 'Create warehouse (G-ADM-3)' })
  createWarehouse(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.createWarehouse(body, req.user?.sub || req.user?.id);
  }

  @Patch('warehouses/:id')
  @ApiOperation({ summary: 'Update warehouse (G-ADM-3)' })
  updateWarehouse(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.updateWarehouse(id, body, req.user?.sub || req.user?.id);
  }

  @Get('warehouses/:id/bins')
  @ApiOperation({ summary: 'List bins in warehouse (G-ADM-3)' })
  listWarehouseBins(@Param('id') id: string) {
    return this.fleet.listWarehouseBins(id);
  }

  @Post('warehouses/:id/bins')
  @ApiOperation({ summary: 'Create bin in warehouse (G-ADM-3)' })
  createWarehouseBin(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.createWarehouseBin(id, body, req.user?.sub || req.user?.id);
  }

  @Get('admin/numbering-series')
  @ApiOperation({ summary: 'List document numbering series (G-ADM-5)' })
  listNumberingSeries(@Query('siteId') siteId?: string) {
    return this.fleet.listNumberingSeries(siteId);
  }

  @Patch('admin/numbering-series/:id')
  @ApiOperation({ summary: 'Update document numbering series (G-ADM-5)' })
  updateNumberingSeries(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.fleet.updateNumberingSeries(id, body);
  }

  @Get('admin/feature-flags')
  @ApiOperation({ summary: 'List feature flags (G-ADM-8)' })
  listFeatureFlags() {
    return this.fleet.listFeatureFlags();
  }

  @Patch('admin/feature-flags/:key')
  @ApiOperation({ summary: 'Toggle feature flag (G-ADM-8)' })
  updateFeatureFlag(
    @Param('key') key: string,
    @Body() body: { enabled: boolean },
    @Req() req: any,
  ) {
    return this.fleet.updateFeatureFlag(
      key,
      body?.enabled ?? true,
      req.user?.sub || req.user?.id,
    );
  }

  @Get('audit-logs/:id')
  @ApiOperation({ summary: 'Get single audit log entry with before/after diff (G-AUD-1)' })
  getAuditLogById(@Param('id') id: string) {
    return this.fleet.getAuditLogById(id);
  }

  @Get('notifications/logs')
  @ApiOperation({ summary: 'List notification delivery logs (G-NOTIF-1)' })
  listNotificationDeliveryLogs() {
    return this.fleet.listNotificationLogs();
  }

  @Post('notifications/logs/:id/retry')
  @ApiOperation({ summary: 'Retry failed notification delivery (G-NOTIF-1)' })
  retryNotificationDelivery(@Param('id') id: string) {
    return this.fleet.retryNotificationDelivery(id);
  }

  @Post('orders/preview')
  @ApiOperation({ summary: 'Dry-run order price & GST preview (G-M1-1)' })
  previewOrder(@Body() body: Record<string, unknown>) {
    return this.fleet.previewOrder(body);
  }

  @Get('quotations')
  @ApiOperation({ summary: 'List sales quotations (G-M1-2)' })
  listQuotations(@Query('siteId') siteId?: string) {
    return this.fleet.listQuotations(siteId);
  }

  @Post('quotations')
  @ApiOperation({ summary: 'Create sales quotation (G-M1-2)' })
  createQuotation(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.createQuotation(body, req.user?.sub || req.user?.id);
  }

  @Post('quotations/:id/convert-to-order')
  @ApiOperation({ summary: 'Convert quotation to sales order (G-M1-2)' })
  convertQuotationToOrder(@Param('id') id: string, @Req() req: any) {
    return this.fleet.convertQuotationToOrder(id, req.user?.sub || req.user?.id);
  }

  @Post('inventory/putaway')
  @ApiOperation({ summary: 'Assign received GRN batch to warehouse bin (G-INV-3)' })
  putawayInventory(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.putawayInventory(body, req.user?.sub || req.user?.id);
  }

  @Get('drivers')
  @ApiOperation({ summary: 'List driver roster (G-FLT-2)' })
  listDrivers(@Query('siteId') siteId?: string) {
    return this.fleet.listDrivers(siteId);
  }

  @Post('drivers')
  @ApiOperation({ summary: 'Create driver record (G-FLT-2)' })
  createDriver(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.createDriver(body, req.user?.sub || req.user?.id);
  }

  @Patch('drivers/:id')
  @ApiOperation({ summary: 'Update driver record (G-FLT-2)' })
  updateDriver(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.updateDriver(id, body, req.user?.sub || req.user?.id);
  }

  @Post('trips/:id/settle')
  @ApiOperation({ summary: 'Driver cash/UPI/crate trip settlement sign-off (G-FLT-4)' })
  settleTrip(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.settleTrip(id, body, req.user?.sub || req.user?.id);
  }

  @Post('credit-notes/:id/apply')
  @ApiOperation({ summary: 'Apply credit note against open invoice (G-FIN-2)' })
  applyCreditNote(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.fleet.applyCreditNote(id, body, req.user?.sub || req.user?.id);
  }

  @Post('finance/reconciliation/import')
  @ApiOperation({ summary: 'Import bank/UPI statement rows for reconciliation (G-FIN-3)' })
  importReconciliationStatement(
    @Body() body: { rows?: Array<Record<string, unknown>> },
    @Req() req: any,
  ) {
    return this.fleet.importReconciliationStatement(
      body?.rows ?? [],
      req.user?.sub || req.user?.id,
    );
  }

  @Post('finance/reconciliation/match')
  @ApiOperation({ summary: 'Auto/manual match statement lines to collections/payments (G-FIN-3)' })
  matchReconciliationStatement(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.fleet.matchReconciliationStatement(
      body,
      req.user?.sub || req.user?.id,
    );
  }

  @Get('reports/catalog')
  @ApiOperation({ summary: 'List available reports & parameter schemas (G-RPT-1)' })
  getReportCatalog() {
    return this.fleet.getReportCatalog();
  }

  @Post('reports/:reportKey/run')
  @ApiOperation({ summary: 'Execute parameterized report query (G-RPT-1)' })
  runParameterizedReport(@Param('reportKey') reportKey: string, @Body() body: Record<string, unknown>) {
    return this.fleet.runParameterizedReport(reportKey, body);
  }

  @Get('trips/:id/manifest-pdf')
  @ApiOperation({ summary: 'Generate Dispatch Manifest & Loading Sheet PDF (G-DOC-3)' })
  async getTripManifestPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, tripNo } = await this.fleet.getTripManifestPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Manifest-${tripNo}.pdf"`);
    res.end(buffer);
  }

  @Get('procurement/pos/:id/pdf')
  @ApiOperation({ summary: 'Generate Purchase Order PDF (G-DOC-4)' })
  async getPurchaseOrderPdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, poNo } = await this.fleet.getPurchaseOrderPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PO-${poNo}.pdf"`);
    res.end(buffer);
  }
}
