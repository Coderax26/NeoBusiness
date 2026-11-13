import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

const EMAIL_TO_SEEDED_PHONE: Record<string, string> = {
  'owner@neobus.in': '+919876543210',
  'ops@neobus.in': '+919876543211',
  'prod@neobus.in': '+919876543212',
  'driver@neobus.in': '+919876543213',
  'collector@neobus.in': '+919876543214',
  'store@neobus.in': '+919876543215',
};

const DEMO_USERS: Record<
  string,
  { id: string; fullName: string; role: string; phone: string; pin: string }
> = {
  '+919876543210': {
    id: 'usr-owner-01',
    fullName: 'Ravi Kumar',
    role: 'OWNER',
    phone: '+919876543210',
    pin: '1234',
  },
  '+919876543211': {
    id: 'usr-ops-01',
    fullName: 'Anita Desai',
    role: 'OPS_COORD',
    phone: '+919876543211',
    pin: '2233',
  },
  '+919876543212': {
    id: 'usr-prod-01',
    fullName: 'Suresh Patel',
    role: 'PROD_MGR',
    phone: '+919876543212',
    pin: '3344',
  },
  '+919876543213': {
    id: 'usr-driver-01',
    fullName: 'Mehul Shah',
    role: 'DRIVER',
    phone: '+919876543213',
    pin: '4455',
  },
  '+919876543214': {
    id: 'usr-collector-01',
    fullName: 'Priya Nair',
    role: 'COLLECTOR',
    phone: '+919876543214',
    pin: '5566',
  },
  '+919876543215': {
    id: 'usr-store-01',
    fullName: 'Arjun Rao',
    role: 'STOREKEEPER',
    phone: '+919876543215',
    pin: '6677',
  },
};

function normalizePhone(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  if (EMAIL_TO_SEEDED_PHONE[cleaned]) {
    return EMAIL_TO_SEEDED_PHONE[cleaned];
  }
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  return raw.trim();
}

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

  const rawId = String(body?.phone || body?.identifier || body?.email || '').trim();
  const normalizedPhone = normalizePhone(rawId);
  const submittedSecret = String(body?.pin || body?.password || '').trim();

  if (!normalizedPhone || !submittedSecret) {
    return NextResponse.json(
      {
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Please enter both phone/email and PIN/password.',
        },
      },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: normalizedPhone,
        password: submittedSecret,
        pin: submittedSecret,
      }),
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
    // Backend API unreachable; check seeded demo users below
  }

  // Fallback for seeded demo users (accepts either exact seeded PIN or '123456')
  const demoUser = DEMO_USERS[normalizedPhone];
  if (demoUser && (submittedSecret === demoUser.pin || submittedSecret === '123456')) {
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
        message:
          'Invalid phone or PIN/password. Click one of the Role Persona cards on the left to load valid seeded credentials.',
      },
    },
    { status: 401 },
  );
}
