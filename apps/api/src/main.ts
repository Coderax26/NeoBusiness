import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { validateEnvironmentConfig } from './shared/config/env-validator.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ── P4.5 Environment Configuration Validation ─────────────────────────────
  const envCheck = validateEnvironmentConfig();
  for (const w of envCheck.warnings) {
    logger.warn(`[Config] ${w}`);
  }
  if (!envCheck.valid) {
    for (const e of envCheck.errors) {
      logger.error(`[Config] ${e}`);
    }
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ── P4.5 Graceful Shutdown Hooks ──────────────────────────────────────────
  app.enableShutdownHooks();

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS (office web app origin only in prod) ─────────────────────────────
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    credentials: true,
  });

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true, // auto-convert types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── API prefix ────────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready', 'metrics', 'metrics/json'],
  });

  // ── OpenAPI / Swagger ─────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('NeoBus API')
      .setDescription(
        'Enterprise business operations platform for multi-site food trading and manufacturing. ' +
          'See /docs for module specifications.',
      )
      .setVersion('0.1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('health', 'System health and readiness')
      .addTag('auth', 'Authentication and session management (M0)')
      .addTag('customers', 'Customer master and credit (M1)')
      .addTag('items', 'Item and UoM master (M1)')
      .addTag('pricing', 'Daily price lists and bands (M1)')
      .addTag('orders', 'Sales orders and quotes (M1)')
      .addTag('inventory', 'Stock ledger and ATP (M3)')
      .addTag('suppliers', 'Supplier master and POs (M2)')
      .addTag('production', 'Work orders and BOM (M4)')
      .addTag('fleet', 'Trips, delivery and ePOD (M5)')
      .addTag('finance', 'Invoices, AR, collections, EOD (M6)')
      .addTag('exceptions', 'Exception approvals and notifications (M7)')
      .addTag('analytics', 'Owner dashboards and analytics (M7b)')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
    logger.log('Swagger UI available at: http://localhost:3000/api-docs');
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`NeoBus API is running on: http://localhost:${port}`);
  logger.log(`Health check: http://localhost:${port}/health`);
}
await bootstrap();
