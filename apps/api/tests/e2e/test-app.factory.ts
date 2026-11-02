import { Test as NestTest } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request, { type Test as SupertestTest } from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { JwtAuthGuard } from '../../src/modules/m0-platform/jwt-auth.guard.js';
import { RbacGuard } from '../../src/modules/m0-platform/rbac.service.js';
import { InventoryExpiryJob } from '../../src/modules/m3-inventory/inventory-expiry.job.js';
import { InventoryDriftJob } from '../../src/modules/m3-inventory/inventory-drift.job.js';
import { InventoryEventHandler } from '../../src/modules/m3-inventory/inventory-event.handler.js';

export async function createTestApp(): Promise<{
  getHttpServer: () => { inject: (options: Record<string, unknown>) => Promise<unknown> };
  close: () => Promise<void>;
}> {
  const moduleRef = await NestTest.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(InventoryExpiryJob)
    .useValue({})
    .overrideProvider(InventoryDriftJob)
    .useValue({})
    .overrideProvider(InventoryEventHandler)
    .useValue({})
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: {
        switchToHttp: () => { getRequest: () => { headers: Record<string, string>; user?: object } };
      }) => {
        const request = context.switchToHttp().getRequest();
        const token = request.headers.authorization?.replace('Bearer ', '');
        const role =
          token === 'owner'
            ? 'OWNER'
            : token === 'coord'
              ? 'OPS_COORD'
              : 'STOREKEEPER';
        request.user = {
          sub: 'e2e-user',
          phone: '+910000000000',
          role,
          siteIds: [],
        };
        return true;
      },
    })
    .overrideGuard(RbacGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return {
    getHttpServer: () => ({
      inject: async (options) => {
        const method = String(options.method ?? 'GET').toLowerCase();
        const url = String(options.url ?? '/');
        let response: SupertestTest;
        if (method === 'post') response = request(app.getHttpServer()).post(url);
        else if (method === 'put') response = request(app.getHttpServer()).put(url);
        else if (method === 'patch') response = request(app.getHttpServer()).patch(url);
        else if (method === 'delete') response = request(app.getHttpServer()).delete(url);
        else response = request(app.getHttpServer()).get(url);
        const headers = (options.headers ?? {}) as Record<string, string>;
        for (const [name, value] of Object.entries(headers)) response = response.set(name, value);
        if (options.payload !== undefined) response = response.send(options.payload);
        const result = await response;
        return {
          statusCode: result.status,
          json: () => result.body,
        };
      },
    }),
    close: async () => app.close(),
  };
}
