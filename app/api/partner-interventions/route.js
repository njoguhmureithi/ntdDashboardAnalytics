import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subcounty');
    const ward = searchParams.get('ward');
    const time_period = searchParams.get('time_period');

    let sql = `
      SELECT 
        partnername as partner,
        orgtype,
        sector,
        activityname as activity,
        countyname as county,
        subcountyname as subcounty,
        wardname as ward,
        wardcode,
        periodyear as time_period,
        status,
        unit,
        fundingsrc as funding,
        diseases as disease,
        notes
      FROM partners 
      WHERE 1=1
    `;
    const params = [];

    if (county) {
      sql += ` AND countyname ILIKE $${params.length + 1}`;
      params.push(`%${county}%`);
    }

    if (subcounty) {
      sql += ` AND subcountyname ILIKE $${params.length + 1}`;
      params.push(`%${subcounty}%`);
    }

    if (ward) {
      sql += ` AND (wardname ILIKE $${params.length + 1} OR wardcode ILIKE $${params.length + 1})`;
      params.push(`%${ward}%`);
    }

    if (time_period) {
      // Cast periodyear to text for ILIKE comparison since it's an integer column
      sql += ` AND periodyear::text ILIKE $${params.length + 1}`;
      params.push(`%${time_period}%`);
    }

    sql += ` ORDER BY countyname, subcountyname, wardname, partnername`;

    const result = await query(sql, params);
    return Response.json(result.rows);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}