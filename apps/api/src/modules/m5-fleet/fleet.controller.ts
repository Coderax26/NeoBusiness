import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RequirePermission } from '../m0-platform/rbac.service.js';
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
@UseGuards(JwtAuthGuard)
@Controller()
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('vehicles')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'List active vehicles' })
  listVehicles(@Query('siteId') siteId: string) {
    return this.fleet.listVehicles(siteId);
  }

  @Post('vehicles')
  @RequirePermission('fleet.manage')
  @ApiOperation({ summary: 'Register a vehicle' })
  createVehicle(@Body() dto: CreateVehicleDto, @Req() req: any) {
    return this.fleet.createVehicle(dto, req.user.id);
  }

  @Get('trips')
  @RequirePermission('fleet.read')
  @ApiOperation({ summary: 'List delivery trips' })
  listTrips(
    @Query('siteId') siteId: string,
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
}
