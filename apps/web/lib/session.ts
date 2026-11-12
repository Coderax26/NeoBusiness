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

export { can, toSessionUser };
export type { SessionUser, AuthMeResponse };
