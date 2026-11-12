import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('neobus_access_token')?.value;

  if (token) {
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
  return response;
}

