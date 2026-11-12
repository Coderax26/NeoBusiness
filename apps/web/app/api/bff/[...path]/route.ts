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
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const upstreamData = await upstream.arrayBuffer();

    return new NextResponse(upstreamData, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
      },
    });
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

