import { NextResponse } from 'next/server';
import { buildStats } from '../../../../lib/analytics-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = Number(searchParams.get('range') || 30);
    const days = [1, 7, 30, 90].includes(range) ? range : 30;
    return NextResponse.json(await buildStats(days));
  } catch (error) {
    return NextResponse.json({ error: 'stats_failed' }, { status: 500 });
  }
}
