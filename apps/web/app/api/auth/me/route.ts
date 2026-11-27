import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '../../../../lib/session';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

function buildSessionUserPayload(raw: any) {
  const role = String(raw?.role || '').toUpperCase();
  const sites = Array.isArray(raw?.sites)
    ? raw.sites.map((s: any) => ({
        id: String(s.id),
        name: s.name,
        type: s.type || s.siteType || 'OFFICE',
        siteType: s.siteType || s.type || 'OFFICE',
        code: s.code || s.site_code || '',
        isFulfillmentSite:
          s.isFulfillmentSite ?? s.is_fulfillment_site ?? (s.type !== 'OFFICE' && s.siteType !== 'OFFICE'),
      }))
    : [];
  const siteIds =
    Array.isArray(raw?.siteIds) && raw.siteIds.length > 0
      ? raw.siteIds
      : sites.map((s: any) => s.id);

  const permissions = Array.isArray(raw?.permissions)
    ? Array.from(new Set(raw.permissions))
    : role === 'OWNER'
      ? ['*']
      : [];

  const fullName = raw?.fullName || raw?.full_name || raw?.name || raw?.phone || 'User';

  const user = {
    id: raw?.id || '',
    name: fullName,
    fullName,
    phone: raw?.phone || '',
    role,
    siteIds,
    sites,
    activeSiteId: raw?.assigned_site_id || sites[0]?.id || '',
    preferredLanguage: raw?.preferredLanguage || raw?.preferred_language || 'en',
    permissions,
  };

  return { ...user, user };
}

export async function GET(req: NextRequest) {
  let token = req.cookies.get('neobus_access_token')?.value;
  const refreshToken = req.cookies.get('neobus_refresh_token')?.value;

  if (!token && !refreshToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No active session' } },
      { status: 401 },
    );
  }

  let newAccessToken: string | undefined;
  let newRefreshToken: string | undefined;

  try {
    let res = token
      ? await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      : null;

    if ((!res || res.status === 401) && refreshToken) {
      const refreshRes = await fetch(`${API_ORIGIN}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        newAccessToken = refreshData.accessToken;
        newRefreshToken = refreshData.refreshToken;
        token = newAccessToken;
        if (token) {
          res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    }

    if (res && res.ok) {
      const data = await res.json();
      const rawUser = data?.user || data;
      const payload = buildSessionUserPayload(rawUser);
      const response = NextResponse.json(payload, { status: 200 });

      const isSecureCookie = shouldUseSecureCookies(req);

      if (newAccessToken) {
        response.cookies.set('neobus_access_token', newAccessToken, {
          httpOnly: true,
          secure: isSecureCookie,
          sameSite: 'lax',
          path: '/',
          maxAge: 8 * 60 * 60,
        });
      }
      if (newRefreshToken) {
        response.cookies.set('neobus_refresh_token', newRefreshToken, {
          httpOnly: true,
          secure: isSecureCookie,
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
      }
      return response;
    }

    const unauthorized = NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Session invalid or expired' } },
      { status: 401 },
    );
    unauthorized.cookies.delete('neobus_access_token');
    unauthorized.cookies.delete('neobus_refresh_token');
    unauthorized.cookies.delete('neobus_session_user');
    return unauthorized;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_UNREACHABLE',
          message: `Cannot reach API at ${API_ORIGIN} (${err?.message || 'connection failed'})`,
        },
      },
      { status: 502 },
    );
  }
}
