import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from './rbac.service.js';
import { AdminService } from './admin.service.js';
import {
  CreateUserDto,
  UpdateUserDto,
  ResetPinDto,
  CreateSiteDto,
  UpdateSiteDto,
  CreateLocationDto,
  UpdateBusinessRuleDto,
  UpdateApprovalPolicyDto,
} from './dto/admin.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List users with optional role/site filtering' })
  async listUsers(
    @Query('role') role?: string,
    @Query('siteId') siteId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers({ role, siteId, isActive, search });
  }

  @Post('users')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Create a new user' })
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.adminService.createUser(dto, req.user?.id);
  }

  @Get('users/:id')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Get user detail by ID' })
  async getUser(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update user profile or status' })
  async updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    return this.adminService.updateUser(id, dto, req.user?.id);
  }

  @Post('users/:id/reset-pin')
  @RequirePermission('config.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a user PIN' })
  async resetPin(
    @Param('id') id: string,
    @Body() dto: ResetPinDto,
    @Req() req: any,
  ) {
    return this.adminService.resetPin(id, dto.pin, req.user?.id);
  }

  @Post('users/:id/revoke-sessions')
  @RequirePermission('config.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all active refresh sessions for a user' })
  async revokeSessions(@Param('id') id: string, @Req() req: any) {
    return this.adminService.revokeUserSessions(id, req.user?.sub || req.user?.id);
  }

  // ─── Sites & Locations ──────────────────────────────────────────────────────

  @Get('sites')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List all sites' })
  async listSites(@Query('includeInactive') includeInactive?: string) {
    return this.adminService.listSites(includeInactive === 'true');
  }

  @Post('sites')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Create a new site' })
  async createSite(@Body() dto: CreateSiteDto, @Req() req: any) {
    return this.adminService.createSite(dto, req.user?.id);
  }

  @Patch('sites/:id')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update site details' })
  async updateSite(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @Req() req: any,
  ) {
    return this.adminService.updateSite(id, dto, req.user?.id);
  }

  @Get('sites/:id/locations')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List locations for a specific site' })
  async listSiteLocations(@Param('id') siteId: string) {
    return this.adminService.listLocations(siteId);
  }

  @Post('sites/:id/locations')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Create a location under a site' })
  async createLocation(
    @Param('id') siteId: string,
    @Body() dto: Omit<CreateLocationDto, 'siteId'>,
    @Req() req: any,
  ) {
    return this.adminService.createLocation({ ...dto, siteId }, req.user?.id);
  }

  // ─── Roles ──────────────────────────────────────────────────────────────────

  @Get('roles')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List all roles and their mapped permissions' })
  async listRoles() {
    return this.adminService.listRoles();
  }

  // ─── Business Rules & Approvals ─────────────────────────────────────────────

  @Get('business-rules')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List all business rule thresholds and configs' })
  async listBusinessRules() {
    return this.adminService.listBusinessRules();
  }

  @Patch('business-rules/:key')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update a business rule threshold' })
  async updateBusinessRule(
    @Param('key') key: string,
    @Body() dto: UpdateBusinessRuleDto,
    @Req() req: any,
  ) {
    return this.adminService.updateBusinessRule(key, dto, req.user?.id);
  }

  @Get('approval-policies')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List all exception approval policies' })
  async listApprovalPolicies() {
    return this.adminService.listApprovalPolicies();
  }

  @Patch('approval-policies/:exceptionType')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update approval policy for an exception type' })
  async updateApprovalPolicy(
    @Param('exceptionType') exceptionType: string,
    @Body() dto: UpdateApprovalPolicyDto,
    @Req() req: any,
  ) {
    return this.adminService.updateApprovalPolicy(exceptionType, dto, req.user?.id);
  }

  @Get('doc-sequences')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List document numbering sequences' })
  async listDocSequences() {
    return this.adminService.listDocSequences();
  }

  @Get('company-profile')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Get company legal profile and invoice header settings (G-ADM-4)' })
  async getCompanyProfile() {
    return this.adminService.getCompanyProfile();
  }

  @Put('company-profile')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update company legal profile and invoice header settings (G-ADM-4)' })
  async updateCompanyProfile(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.adminService.updateCompanyProfile(body, req.user?.sub || req.user?.id);
  }

  @Get('notification-templates')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'List WhatsApp/SMS/in-app notification templates (G-ADM-7)' })
  async listNotificationTemplates() {
    return this.adminService.listNotificationTemplates();
  }

  @Patch('notification-templates/:code')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update a notification template (G-ADM-7)' })
  async updateNotificationTemplate(
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateNotificationTemplate(code, body);
  }

  @Get('system-health')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'System health, outbox queue depth, and background job status (G-ADM-9)' })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('rollout')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Get rollout gate readiness and setup wizard state' })
  async getRolloutConfig() {
    return this.adminService.getRolloutConfig();
  }

  @Put('rollout')
  @RequirePermission('config.edit')
  @ApiOperation({ summary: 'Update rollout gate readiness and setup wizard state' })
  async updateRolloutConfig(@Body() body: Record<string, unknown>, @Req() req: any) {
    return this.adminService.updateRolloutConfig(body, req.user?.sub || req.user?.id);
  }
}

