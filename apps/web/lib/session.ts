import { can, toSessionUser, type SessionUser, type AuthMeResponse } from '@neo/shared';

export interface ClientSession {
  user: SessionUser | null;
  activeSiteId: string | null;
  isAuthenticated: boolean;
}

export function createInitialSession(authMe?: AuthMeResponse | null, defaultSiteId?: string): ClientSession {
  if (!authMe) {
    return {
      user: null,
      activeSiteId: null,
      isAuthenticated: false,
    };
  }

  const user = toSessionUser(authMe);
  const activeSiteId = defaultSiteId || user.activeSiteId || (user.siteIds?.[0] ?? null);

  return {
    user,
    activeSiteId,
    isAuthenticated: true,
  };
}

/**
 * Determines whether auth cookies should be marked `Secure` for the current request,
 * respecting `COOKIE_SECURE=false` and checking `x-forwarded-proto` / request protocol
 * so HTTP pre-production origins do not silently drop cookies.
 */
export function shouldUseSecureCookies(req: {
  headers: { get(name: string): string | null };
  nextUrl?: { protocol?: string };
}): boolean {
  const configured = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (configured === 'false') {
    return false;
  }

  const forwardedProto = req.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === 'https';
  }

  const protocol = req.nextUrl?.protocol?.replace(':', '').toLowerCase();
  return protocol === 'https';
}

export { can, toSessionUser };
export type { SessionUser, AuthMeResponse };
