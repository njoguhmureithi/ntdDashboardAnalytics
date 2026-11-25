// app/api/matrix-data/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subCounty');
    const ward = searchParams.get('ward');
    const time_period = searchParams.get('year') || '2025';
    const iotUnit = searchParams.get('iotUnit');

    let matrixQuery = `
      SELECT 
        matrix,
        COUNT(DISTINCT ward_name) as ward_count,
        COUNT(*) as total_records
      FROM ward_context_summary 
      WHERE matrix IS NOT NULL 
      AND matrix != ''
      AND time_period LIKE $1
    `;

    const matrixParams = [`%${time_period}%`];
    let paramIndex = 1;

    // Add filters if they have actual values
    if (county && county.trim() !== '') {
      paramIndex++;
      matrixQuery += ` AND LOWER(county) = LOWER($${paramIndex})`;
      matrixParams.push(county.trim());
    }
    
    if (subcounty && subcounty.trim() !== '') {
      paramIndex++;
      matrixQuery += ` AND LOWER(sub_county) = LOWER($${paramIndex})`;
      matrixParams.push(subcounty.trim());
    }
    
    if (ward && ward.trim() !== '') {
      paramIndex++;
      matrixQuery += ` AND LOWER(ward_name) = LOWER($${paramIndex})`;
      matrixParams.push(ward.trim());
    }

    // Filter by IoT if specified
    if (iotUnit && (iotUnit.toLowerCase() === 'yes' || iotUnit.toLowerCase() === 'true')) {
      paramIndex++;
      matrixQuery += ` AND LOWER(iot) = LOWER($${paramIndex})`;
      matrixParams.push('Yes');
    }

    matrixQuery += ` GROUP BY matrix ORDER BY matrix`;

    const matrixResult = await query(matrixQuery, matrixParams);

    // Group by matrix value
    const matrixData = {};
    let totalWards = 0;
    
    matrixResult.rows.forEach(row => {
      const matrixValue = row.matrix?.trim() || '';
      matrixData[matrixValue] = {
        wardCount: parseInt(row.ward_count) || 0,
        totalRecords: parseInt(row.total_records) || 0
      };
      totalWards += parseInt(row.ward_count) || 0;
    });

    return Response.json({
      matrixData,
      totalWards,
      filters: {
        county: county || null,
        subcounty: subcounty || null,
        ward: ward || null,
        time_period,
        iotUnit: iotUnit || null
      }
    });
    
  } catch (error) {
    console.error('ERROR in matrix-data API:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

