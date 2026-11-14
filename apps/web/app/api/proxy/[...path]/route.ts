import { NextRequest, NextResponse } from 'next/server';

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

  if (token && !token.startsWith('demo-jwt-')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuffer,
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const upstreamData = await upstream.arrayBuffer();
    return new NextResponse(upstreamData, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    });
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

