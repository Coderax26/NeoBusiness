import { NextRequest, NextResponse } from 'next/server';
import { shouldUseSecureCookies } from '../../../../lib/session';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
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
  const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;

  try {
    let upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuffer,
    });

    let newAccessToken: string | undefined;
    let newRefreshToken: string | undefined;

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
            upstream = await fetch(targetUrl, {
              method: req.method,
              headers,
              body: bodyBuffer,
            });
          }
        } catch {
          // Return original 401 response
        }
      }
    }

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const contentDisposition = upstream.headers.get('content-disposition');
    const responseHeaders: Record<string, string> = { 'Content-Type': contentType };
    if (contentDisposition) {
      responseHeaders['Content-Disposition'] = contentDisposition;
    }
    const upstreamData = await upstream.arrayBuffer();
    const response = new NextResponse(upstreamData, {
      status: upstream.status,
      headers: responseHeaders,
    });

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
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_UNREACHABLE',
          message: `Backend API server at ${API_ORIGIN} is unreachable (${err?.message || 'connection failed'})`,
        },
      },
      { status: 502 },
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;

