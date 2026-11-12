import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../m0-platform/jwt-auth.guard.js';
import { RbacGuard, RequirePermission } from '../m0-platform/rbac.service.js';
import { ExpenseService, CreateExpenseDto } from './expense.service.js';

@ApiTags('M6 Finance — Non-trip Expenses & Cashbook')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  /**
   * POST /finance/expenses - Record non-trip office / site expense (G-FIN-2)
   */
  @Post('expenses')
  @RequirePermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record non-trip office or site expense (G-FIN-2)' })
  async createExpense(@Body() dto: CreateExpenseDto, @Req() req: any) {
    return this.expenseService.createExpense(dto, req.user.id);
  }

  /**
   * GET /finance/expenses - List non-trip expenses (G-FIN-2)
   */
  @Get('expenses')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'List non-trip expenses with category and site filters (G-FIN-2)' })
  async listExpenses(
    @Query('siteId') siteId?: string,
    @Query('category') category?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.expenseService.listExpenses({
      siteId,
      category,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
  }

  /**
   * GET /finance/cashbook - Read cashbook entries (G-FIN-3)
   */
  @Get('cashbook')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Read cashbook entries with date filters (G-FIN-3)' })
  async getCashbook(
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.expenseService.getCashbook({
      siteId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
  }
}

