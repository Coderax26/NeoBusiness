import {
  INITIAL_PULSE_FIXTURE,
  INITIAL_STATUS_MATRIX_FIXTURE,
  INITIAL_EXCEPTIONS_FIXTURE,
} from '@neo/mocks';

export const isMockModeEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_MOCKS === '1';
};

/**
 * Returns mock responses for BFF requests when mock mode is enabled
 */
export function getMockResponse(path: string): any | null {
  if (!isMockModeEnabled()) return null;

  if (path.includes('dashboard/pulse')) {
    return INITIAL_PULSE_FIXTURE;
  }
  if (path.includes('dashboard/status-matrix')) {
    return INITIAL_STATUS_MATRIX_FIXTURE;
  }
  if (path.includes('exceptions')) {
    return INITIAL_EXCEPTIONS_FIXTURE;
  }
  if (path.includes('auth/me')) {
    return {
      id: 'mock-owner-1',
      name: 'Owner (Mock Mode)',
      phone: '9876543210',
      role: 'OWNER',
      permissions: ['*'],
      sites: [
        { id: 'site-pune-central', name: 'Pune Central Factory', code: 'PCF', siteType: 'FACTORY' },
      ],
      siteIds: ['site-pune-central'],
      preferredLanguage: 'en',
    };
  }

  return null;
}

