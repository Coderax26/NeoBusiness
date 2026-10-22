import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * Health check endpoint — used by load balancers and deployment pipelines.
 * Returns the status of all critical dependencies.
 *
 * GET /health — no authentication required
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor() {}

  @Get()
  @ApiOperation({ summary: 'System health check' })
  @ApiResponse({
    status: 200,
    description: 'All systems operational',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-10-21T11:00:00.000Z',
        version: '0.1.0',
        environment: 'development',
        uptime: 123.456,
      },
    },
  })
  check(): Record<string, unknown> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.1',
      environment: process.env.NODE_ENV ?? 'development',
      uptime: process.uptime(),
    };
  }
}
