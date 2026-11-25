// app/api/map-data/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subCounty');
    const ward = searchParams.get('ward');
    const time_period = searchParams.get('year') || '2025';
    const iotUnit = searchParams.get('iotUnit');

    console.log('=== MAP API REQUEST ===');
    console.log('Filters received:', { county, subcounty, ward, time_period, iotUnit });

    let mapQuery = `
      SELECT 
        ward_name,
        ward,
        county,
        subcounty as sub_county,
        latitude,
        longitude,
        context,
        "Year" as year,
        time_period,
        water_access_index,
        sanitation_index,
        hygiene_index,
        mhm_index,
        Overall_WASH_index as overall_wash_index,
        sth,
        schistosomiasis,
        Total_Students as total_students,
        IOT as iot,
        "Proportion of households/schools/PS using treated water" as proportion_treated_water,
        Total_Dewormed as total_dewormed,
        "Proportion of school age children dewormed (6-14yrs)" as proportion_school_age_dewormed,
        "Proportion of children aged 12-59 months dewormed" as proportion_children_12_59_months_dewormed,
        "Proportion of Households/Schools with Hand washing facilities" as proportion_handwashing_facilities,
        "% of population who have access to hand washing facilities in schools/Community" as access_handwashing_percent,
        "Proportion of Households/Schools/PS  with Refuse disposal Facility" as proportion_refuse_disposal_facility,
        "% of population who have access to an improved sanitation facility in the community/School" as improved_sanitation_access_percent,
        "Open defecation prevalence" as open_defecation_prevalence,
        "proportion of  Sanitation facilities Accessible to the diffrently abled" as sanitation_access_disabled,
        "proportion of  Water facilities Accessible to the diffrently abled" as water_access_disabled,
        "WASH Gender Status Index" as wash_gender_status_index
      FROM ward_context_summary 
      WHERE latitude IS NOT NULL 
      AND longitude IS NOT NULL
      AND latitude != 0 
      AND longitude != 0
    `;

    const mapParams = [];
    let paramIndex = 0;

    // Add time_period filter - match by both Year column and time_period
    if (time_period) {
      const yearInt = parseInt(time_period) || 2025;
      paramIndex++;
      mapQuery += ` AND ("Year" = $${paramIndex} OR time_period LIKE $${paramIndex + 1})`;
      mapParams.push(yearInt);
      paramIndex++;
      mapParams.push(`%${time_period}%`);
    }

    // Only add filters if they have actual values (not empty strings)
    if (county && county.trim() !== '') {
      paramIndex++;
      mapQuery += ` AND LOWER(county) = LOWER($${paramIndex})`;
      mapParams.push(county.trim());
    }
    
    if (subcounty && subcounty.trim() !== '') {
      paramIndex++;
      mapQuery += ` AND LOWER(subcounty) = LOWER($${paramIndex})`;
      mapParams.push(subcounty.trim());
    }
    
    if (ward && ward.trim() !== '') {
      paramIndex++;
      mapQuery += ` AND LOWER(ward_name) = LOWER($${paramIndex})`;
      mapParams.push(ward.trim());
    }

    // Filter by IoT if specified (only when "Yes" is selected)
    // URLSearchParams always returns strings, so check for string values
    if (iotUnit && (iotUnit.toLowerCase() === 'yes' || iotUnit.toLowerCase() === 'true')) {
      paramIndex++;
      mapQuery += ` AND LOWER(IOT) = LOWER($${paramIndex})`;
      mapParams.push('Yes');
    }

    mapQuery += ` ORDER BY county, subcounty, ward_name, context LIMIT 2000`;

    console.log('Executing query:', mapQuery);
    console.log(' Query params:', mapParams);
    
    const mapResult = await query(mapQuery, mapParams);
    console.log('Total rows returned from DB:', mapResult.rows.length);

    if (mapResult.rows.length > 0) {
      console.log(' First row sample:', JSON.stringify(mapResult.rows[0], null, 2));
      
      const latitudes = mapResult.rows.map(r => parseFloat(r.latitude)).filter(v => !isNaN(v));
      const longitudes = mapResult.rows.map(r => parseFloat(r.longitude)).filter(v => !isNaN(v));
      
      console.log(' Coordinate ranges:', {
        lat: { min: Math.min(...latitudes), max: Math.max(...latitudes) },
        lng: { min: Math.min(...longitudes), max: Math.max(...longitudes) }
      });
      
      // Log unique contexts
      const contexts = [...new Set(mapResult.rows.map(r => r.context))];
      console.log('Contexts found:', contexts);
      
      // Log unique wards
      const wards = [...new Set(mapResult.rows.map(r => r.ward_name))];
      console.log('Wards found:', wards.slice(0, 10), `(showing 10 of ${wards.length})`);
      
    } else {
      console.log('NO ROWS RETURNED FROM DATABASE');
      
      // Debug: Check what data exists
      const countResult = await query('SELECT COUNT(*) as total FROM ward_context_summary WHERE latitude IS NOT NULL AND longitude IS NOT NULL');
      console.log('Total records with coordinates in table:', countResult.rows[0]?.total);
      
      // Check time_period values
      const yearCheck = await query(
        'SELECT DISTINCT "Year" as year, time_period FROM ward_context_summary ORDER BY "Year", time_period LIMIT 20'
      );
      console.log('Available years/time_periods:', yearCheck.rows);
      
      // Check if any data matches the year filter
      const yearMatchCheck = await query(
        `SELECT COUNT(*) as count FROM ward_context_summary WHERE time_period LIKE $1`,
        [`%${time_period}%`]
      );
      console.log(` Records matching time_period LIKE '%${time_period}%':`, yearMatchCheck.rows[0]);
    }

    // Validate coordinates for Western Kenya
    const validPoints = mapResult.rows.filter(point => {
      const lat = parseFloat(point.latitude);
      const lng = parseFloat(point.longitude);
      const isValid = lat >= -0.5 && lat <= 1.5 && lng >= 34.0 && lng <= 35.5 && 
             !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      
      if (!isValid && mapResult.rows.length < 20) {
        console.log(' Invalid point:', { 
          lat, lng, 
          ward: point.ward_name, 
          context: point.context,
          reason: `lat ${lat} lng ${lng} out of bounds or invalid`
        });
      }
      
      return isValid;
    });

    console.log('Valid points after coordinate filtering:', validPoints.length);
    console.log(' Filtered out:', mapResult.rows.length - validPoints.length, 'points');
    console.log('=== MAP API RESPONSE ===\n');

    // Map field names for Map component compatibility
    const mappedValidPoints = validPoints.map(point => ({
      ...point,
      water_index: point.water_access_index || point.water_index, // Map water_access_index to water_index
      sub_county: point.subcounty || point.sub_county // Ensure sub_county is available
    }));

    return Response.json({
      surveyPoints: mappedValidPoints,
      totalPoints: mapResult.rows.length,
      validPoints: mappedValidPoints.length,
      debug: {
        filtersApplied: { 
          county: county || 'none', 
          subcounty: subcounty || 'none', 
          ward: ward || 'none', 
          time_period,
          iotUnit: iotUnit || 'none'
        },
        queryExecuted: true
      }
    });
    
  } catch (error) {
    console.error('ERROR in map-data API:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}