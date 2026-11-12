import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('neobus_access_token')?.value;

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No active session' } },
      { status: 401 },
    );
  }

  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'BFF_ERROR', message: err.message || 'Failed to fetch session' } },
      { status: 500 },
    );
  }
}

