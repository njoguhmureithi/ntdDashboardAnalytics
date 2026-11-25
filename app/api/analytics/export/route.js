import { iterateEvents, iterateLocalEvents } from '../../../../lib/analytics-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = [
  'id',
  'timestamp_utc',
  'path',
  'session_id',
  'referrer',
  'device',
  'browser',
  'os',
  'country',
];

function esc(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toLine(row) {
  return (
    [
      row.id,
      row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
      row.path,
      row.session_id,
      row.referrer,
      row.device,
      row.browser,
      row.os,
      row.country,
    ]
      .map(esc)
      .join(',') + '\r\n'
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get('range') || 30);
  const days = [1, 7, 30, 90].includes(requested) ? requested : 30;
  const filename = `nphi-analytics-raw-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;

  const encoder = new TextEncoder();
  let source = 'postgres';

  const stream = new ReadableStream({
    async start(controller) {
      const write = (text) => controller.enqueue(encoder.encode(text));

      write('\uFEFF');
      write(HEADERS.join(',') + '\r\n');

      try {
        for await (const row of iterateEvents(days)) {
          write(toLine(row));
        }
      } catch (dbError) {
        source = 'jsonl';
        try {
          for (const row of iterateLocalEvents(days)) {
            write(toLine(row));
            }
        } catch (fileError) {
          write(`# export_error,${esc(fileError.message)}\r\n`);
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Analytics-Source': source,
    },
  });
}
