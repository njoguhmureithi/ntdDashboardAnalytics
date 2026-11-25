import { NextResponse } from 'next/server';
import { recordEvent, parseUserAgent, referrerHost } from '../../../../lib/analytics-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ua = request.headers.get('user-agent') || '';
    const { device, browser, os } = parseUserAgent(ua);
    const referrer = body.referrer || request.headers.get('referer') || '';

    const event = {
      t: new Date().toISOString(),
      p: (body.path || '/').slice(0, 300),
      sid: (body.sid || 'anon').slice(0, 64),
      ref: referrerHost(referrer),
      device,
      browser,
      os,
      country:
        request.headers.get('x-vercel-ip-country') ||
        request.headers.get('cf-ipcountry') ||
        request.headers.get('x-country') ||
        'Unknown',
    };

    await recordEvent(event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'track_failed' }, { status: 500 });
  }
}
