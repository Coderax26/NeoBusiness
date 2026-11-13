import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

const DEMO_USERS: Record<string, { id: string; fullName: string; role: string; email: string }> = {
  'owner@neobus.in': {
    id: 'usr-owner-01',
    fullName: 'Vikram Deshmukh',
    role: 'OWNER',
    email: 'owner@neobus.in',
  },
  '9876543210': {
    id: 'usr-owner-01',
    fullName: 'Vikram Deshmukh',
    role: 'OWNER',
    email: 'owner@neobus.in',
  },
  'ops@neobus.in': {
    id: 'usr-ops-01',
    fullName: 'Priya Kulkarni',
    role: 'OPS_COORD',
    email: 'ops@neobus.in',
  },
  '9876543211': {
    id: 'usr-ops-01',
    fullName: 'Priya Kulkarni',
    role: 'OPS_COORD',
    email: 'ops@neobus.in',
  },
  '9876543212': {
    id: 'usr-store-01',
    fullName: 'Ramesh Jadhav',
    role: 'STOREKEEPER',
    email: 'store@neobus.in',
  },
  '9876543213': {
    id: 'usr-prod-01',
    fullName: 'Suresh Patil',
    role: 'PROD_MGR',
    email: 'prod@neobus.in',
  },
};

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Invalid login payload' } },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const { accessToken, refreshToken, user } = data;
      const response = NextResponse.json({ success: true, user });

      response.cookies.set('neobus_access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      });

      if (refreshToken) {
        response.cookies.set('neobus_refresh_token', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
      }

      return response;
    }
  } catch {
    // Backend API unreachable; check local demo personas below
  }

  // Fallback for Demo Personas when testing UI without seeded DB user
  const identifierKey = String(body?.identifier || '').trim().toLowerCase();
  const submittedSecret = String(body?.pin || body?.password || '').trim();
  const demoUser = DEMO_USERS[identifierKey];

  if (demoUser && submittedSecret === '123456') {
    const response = NextResponse.json({ success: true, user: demoUser });
    response.cookies.set('neobus_access_token', `demo-jwt-${demoUser.role}-${Date.now()}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return response;
  }

  return NextResponse.json(
    {
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid identifier or PIN/password. For demo login, use PIN/password 123456.',
      },
    },
    { status: 401 },
  );
}
