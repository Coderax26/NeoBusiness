import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';
const IS_SECURE_COOKIE =
  process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';

const EMAIL_TO_SEEDED_PHONE: Record<string, string> = {
  'owner@neobus.in': '+919876543210',
  'ops@neobus.in': '+919876543211',
  'prod@neobus.in': '+919876543212',
  'driver@neobus.in': '+919876543213',
  'collector@neobus.in': '+919876543214',
  'store@neobus.in': '+919876543215',
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
      const normalizedUser = {
        ...user,
        name: user?.full_name || user?.fullName || user?.name || 'User',
        fullName: user?.full_name || user?.fullName || user?.name || 'User',
      };
      const response = NextResponse.json({ success: true, user: normalizedUser });

      response.cookies.set('neobus_access_token', accessToken, {
        httpOnly: true,
        secure: IS_SECURE_COOKIE,
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60,
      });

      response.cookies.set('neobus_session_user', JSON.stringify(normalizedUser), {
        httpOnly: true,
        secure: IS_SECURE_COOKIE,
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60,
      });

      if (refreshToken) {
        response.cookies.set('neobus_refresh_token', refreshToken, {
          httpOnly: true,
          secure: IS_SECURE_COOKIE,
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
      }

      return response;
    }

    let upstreamErr: any = null;
    try {
      upstreamErr = await res.json();
    } catch {
      upstreamErr = null;
    }

    return NextResponse.json(
      {
        error: {
          code: upstreamErr?.error?.code || 'AUTH_INVALID_CREDENTIALS',
          message:
            upstreamErr?.message ||
            upstreamErr?.error?.message ||
            'Invalid phone or PIN/password.',
        },
      },
      { status: res.status || 401 },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_UNREACHABLE',
          message: `Cannot reach authentication service at ${API_ORIGIN} (${err?.message || 'connection failed'}).`,
        },
      },
      { status: 502 },
    );
  }
}
