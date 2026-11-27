/**
 * Resolve the active siteId for the authenticated user.
 *
 * JWT payloads carry `siteIds: string[]` (rather than a singular `siteId`).
 * This helper honors an explicit `explicitSiteId` first, then `user.siteId`,
 * and finally falls back to `user.siteIds[0]`.
 */
export function resolveUserSiteId(
  user: any,
  explicitSiteId?: string,
): string | undefined {
  if (explicitSiteId && explicitSiteId !== 'all') {
    return explicitSiteId;
  }
  if (user?.siteId) {
    return String(user.siteId);
  }
  if (Array.isArray(user?.siteIds) && user.siteIds.length > 0) {
    return String(user.siteIds[0]);
  }
  return undefined;
}
