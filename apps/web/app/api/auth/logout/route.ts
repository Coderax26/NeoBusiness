import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('neobus_access_token')?.value;
  const refreshToken = req.cookies.get('neobus_refresh_token')?.value;

  if (refreshToken) {
    try {
      await fetch(`${API_ORIGIN}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Best-effort logout to backend
    }
  } else if (token) {
    try {
      await fetch(`${API_ORIGIN}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Best-effort logout to backend
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('neobus_access_token');
  response.cookies.delete('neobus_refresh_token');
  response.cookies.delete('neobus_session_user');
  return response;
}

