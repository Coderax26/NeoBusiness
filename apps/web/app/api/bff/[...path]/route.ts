import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');
  const search = req.nextUrl.search;
  const targetUrl = `${API_ORIGIN}/api/v1/${targetPath}${search}`;

  const token = req.cookies.get('neobus_access_token')?.value;
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('connection');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    let upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    let newAccessToken: string | undefined;
    let newRefreshToken: string | undefined;

    // Silent refresh attempt on 401 (Section 5 / D-2 BFF pattern)
    if (upstream.status === 401) {
      const refreshToken = req.cookies.get('neobus_refresh_token')?.value;
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_ORIGIN}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            newAccessToken = refreshData.accessToken;
            newRefreshToken = refreshData.refreshToken;

            headers.set('Authorization', `Bearer ${newAccessToken}`);
            // Retry request with rotated access token
            upstream = await fetch(targetUrl, {
              method: req.method,
              headers,
              body,
            });
          }
        } catch {
          // If refresh fails, return original 401 response
        }
      }
    }

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const upstreamData = await upstream.arrayBuffer();

    const response = new NextResponse(upstreamData, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (newAccessToken) {
      response.cookies.set('neobus_access_token', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      });
    }

    if (newRefreshToken) {
      response.cookies.set('neobus_refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'UPSTREAM_ERROR', message: `Cannot reach API: ${err.message}` } },
      { status: 502 },
    );
  }
}

export {
  handleProxy as GET,
  handleProxy as POST,
  handleProxy as PUT,
  handleProxy as PATCH,
  handleProxy as DELETE,
};

