// app/api/choropleth-data/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subCounty');
    const ward = searchParams.get('ward');
    const time_period = searchParams.get('year') || '2025';
    const diseaseType = searchParams.get('disease') || 'sth';

    console.log('Choropleth API - Filters:', { county, subcounty, ward, time_period, diseaseType });

    // Build dynamic query with proper parameter indexing
    let choroplethQuery = `
      SELECT 
        ward_name,
        subcounty as sub_county,
        county,
        COALESCE(ROUND(AVG(CASE WHEN latitude != 0 THEN latitude END)::numeric, 6), 0) as avg_latitude,
        COALESCE(ROUND(AVG(CASE WHEN longitude != 0 THEN longitude END)::numeric, 6), 0) as avg_longitude,
        COALESCE(ROUND(AVG(${diseaseType})::numeric, 2), 0) as disease_prevalence,
        COALESCE(ROUND(AVG(water_access_index)::numeric, 2), 0) as water_index,
        COALESCE(ROUND(AVG(sanitation_index)::numeric, 2), 0) as sanitation_index,
        COALESCE(ROUND(AVG(hygiene_index)::numeric, 2), 0) as hygiene_index,
        COUNT(*) as data_points,
        COUNT(DISTINCT context) as context_types
      FROM ward_context_summary 
      WHERE ("Year" = $1 OR time_period LIKE $2)
      AND latitude IS NOT NULL 
      AND longitude IS NOT NULL
      AND ${diseaseType} IS NOT NULL
    `;

    // Match by both Year column (integer) and time_period (text) to catch all data
    const yearInt = parseInt(time_period) || 2025;
    const choroplethParams = [yearInt, `%${time_period}%`];
    let paramIndex = 2; // Start at 2 since we already have 2 parameters (yearInt and time_period pattern)

    if (county) {
      paramIndex++;
      choroplethQuery += ` AND county = $${paramIndex}`;
      choroplethParams.push(county);
    }
    if (subcounty) {
      paramIndex++;
      choroplethQuery += ` AND subcounty = $${paramIndex}`;
      choroplethParams.push(subcounty);
    }
    if (ward) {
      paramIndex++;
      choroplethQuery += ` AND ward_name = $${paramIndex}`;
      choroplethParams.push(ward);
    }

    choroplethQuery += `
      GROUP BY ward_name, subcounty, county
      ORDER BY disease_prevalence DESC
    `;

    const choroplethResult = await query(choroplethQuery, choroplethParams);
    console.log(`${diseaseType} choropleth data points:`, choroplethResult.rows.length);

    return Response.json({
      choroplethData: choroplethResult.rows,
      diseaseType: diseaseType,
      summary: {
        total_wards: choroplethResult.rows.length,
        avg_prevalence: choroplethResult.rows.length > 0 
          ? (choroplethResult.rows.reduce((sum, row) => sum + parseFloat(row.disease_prevalence), 0) / choroplethResult.rows.length).toFixed(2)
          : 0,
        max_prevalence: choroplethResult.rows.length > 0 
          ? Math.max(...choroplethResult.rows.map(row => parseFloat(row.disease_prevalence))).toFixed(2)
          : 0
      }
    });
  } catch (error) {
    console.error('Error fetching choropleth data:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}