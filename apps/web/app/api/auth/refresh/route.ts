import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '../../../../lib/session';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const cookieRefreshToken = req.cookies.get('neobus_refresh_token')?.value;
    let bodyRefreshToken: string | undefined;

    try {
      const body = await req.json();
      bodyRefreshToken = body?.refreshToken;
    } catch {
      // Body is optional if cookie is present
    }

    const refreshToken = cookieRefreshToken || bodyRefreshToken;

    if (!refreshToken) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'No refresh token provided' } },
        { status: 401 },
      );
      response.cookies.delete('neobus_access_token');
      response.cookies.delete('neobus_refresh_token');
      return response;
    }

    const res = await fetch(`${API_ORIGIN}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await res.json();
    if (!res.ok) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Session expired or refresh token invalid' } },
        { status: 401 },
      );
      response.cookies.delete('neobus_access_token');
      response.cookies.delete('neobus_refresh_token');
      return response;
    }

    const { accessToken, refreshToken: newRefreshToken } = data;
    const response = NextResponse.json({ success: true, accessToken });

    const isSecureCookie = shouldUseSecureCookies(req);

    response.cookies.set('neobus_access_token', accessToken, {
      httpOnly: true,
      secure: isSecureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });

    if (newRefreshToken) {
      response.cookies.set('neobus_refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: isSecureCookie,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'BFF_ERROR', message: err.message || 'Token refresh failed' } },
      { status: 500 },
    );
  }
}

