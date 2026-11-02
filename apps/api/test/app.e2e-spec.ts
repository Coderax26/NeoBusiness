import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../tests/e2e/test-app.factory.js';

describe('Application HTTP e2e', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('serves the health endpoint', async () => {
    const response = await app.getHttpServer().inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });
});
