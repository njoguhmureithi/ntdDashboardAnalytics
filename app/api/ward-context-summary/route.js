// app/api/ward-context-summary/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subcounty');
    const ward = searchParams.get('ward');
    const time_period = searchParams.get('time_period');

    let sql = `
      SELECT * FROM ward_context_summary 
      WHERE 1=1
    `;
    const params = [];

    if (county) {
      sql += ` AND county = $${params.length + 1}`;
      params.push(county);
    }

    if (subcounty) {
      sql += ` AND subcounty = $${params.length + 1}`;
      params.push(subcounty);
    }

    if (ward) {
      sql += ` AND ward = $${params.length + 1}`;
      params.push(ward);
    }

    if (time_period) {
      sql += ` AND time_period = $${params.length + 1}`;
      params.push(time_period);
    }

    sql += ` ORDER BY county, subcounty, ward_name, time_period`;

    const result = await query(sql, params);
    return Response.json(result.rows);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}