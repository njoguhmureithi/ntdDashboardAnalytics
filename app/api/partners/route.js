
// app/api/partners/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subcounty');
    const ward = searchParams.get('ward');
    const year = searchParams.get('year');
    const sector = searchParams.get('sector');
    const activityCode = searchParams.get('activityCode');
    const counties = searchParams.getAll('counties');

    // Reduced logging to prevent console spam
    // console.log('Partners API called with params:', {
    //   county, subcounty, ward, year, sector, activityCode, counties
    // });

    // Query from new partners table with updated column mappings
    // Column names are all lowercase: partnername, orgtype, activityname, countyname, subcountyname, wardname, wardcode, periodyear, fundingsrc
    let partnersQuery = `
      SELECT 
        p.partnername as "partnerName",
        p.orgtype as "orgType",
        p.sector,
        p.activityname as "activityCode",
        p.activityname as "activityName",
        p.countyname as "countyName",
        p.subcountyname as "subcountyName",
        p.wardname as "wardName",
        COALESCE(
          wb.code,
          p.wardcode,
          p.wardname
        ) as "wardCode",
        p.periodyear as "periodYear",
        COALESCE(p.status, 'ongoing') as status,
        p.activityname as modality,
        COALESCE(p.unit, 'project') as unit,
        COALESCE(p.fundingsrc, 'Unknown') as "fundingSrc",
        COALESCE(p.diseases, '') as diseases,
        COALESCE(p.notes, '') as notes
      FROM partners p
      LEFT JOIN ward_boundaries wb ON 
        p.wardcode = wb.code
        OR p.wardname = wb.name
        OR LOWER(TRIM(p.wardname)) = LOWER(TRIM(wb.name))
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    if (county) {
      paramCount++;
      partnersQuery += ` AND p.countyname ILIKE $${paramCount}`;
      params.push(`%${county}%`);
    }

    if (subcounty) {
      paramCount++;
      partnersQuery += ` AND p.subcountyname ILIKE $${paramCount}`;
      params.push(`%${subcounty}%`);
    }

    if (ward) {
      paramCount++;
      partnersQuery += ` AND (p.wardname ILIKE $${paramCount} OR p.wardcode ILIKE $${paramCount})`;
      params.push(`%${ward}%`);
    }

    if (year) {
      paramCount++;
      // Cast periodyear to text for ILIKE comparison since it's an integer column
      partnersQuery += ` AND p.periodyear::text ILIKE $${paramCount}`;
      params.push(`%${year}%`);
    }

    // Map activity codes to match activity values in new partners table
    // The new table has an 'activity' column that contains the intervention type
    const codeToKeywords = {
      // Water interventions
      'W_BOREHOLE': ['borehole', 'bore hole', 'drilling'],
      'W_PIPED_SCHEMES': ['piped', 'pipeline', 'water scheme'],
      'W_SPRING_PROTECT': ['spring', 'protection', 'catchment'],
      'W_TREATMENT': ['treatment', 'chlorination', 'filter', 'water treatment'],
      
      // Sanitation interventions
      'S_COMMUNITY_LATRINES': [
        'latrine', 
        'toilet',
        'sanitation',
        'community'
      ],
      'S_SCHOOL_LATRINES': [
        'school',
        'latrine',
        'toilet'
      ],
      'S_SOLID_WASTE': [
        'waste', 
        'refuse',
        'solid waste'
      ],
      
      // Health/Hygiene interventions
      'H_BCC': [
        'hygiene',
        'behavior',
        'behaviour',
        'bcc',
        'promotion'
      ],
      'H_HANDWASH_STATIONS': [
        'handwash',
        'hand washing',
        'handwashing'
      ],
      
      // NTD interventions
      'N_MDA': [
        'mda',
        'mass drug',
        'deworming',
        'drug administration'
      ],
      'N_SURVEILLANCE': [
        'surveillance',
        'case finding',
        'monitoring'
      ],
      'N_HEALTH_EDU': [
        'education',
        'health education',
        'awareness',
        'promotion'
      ],
      'N_MORBIDITY': [
        'morbidity',
        'management',
        'case management'
      ]
    };
    
    // Filter by activityCode if provided (e.g., W_BOREHOLE, N_MDA)
    if (activityCode) {
      const keywords = codeToKeywords[activityCode] || [activityCode.toLowerCase().replace('_', ' ')];
      
      // Also try matching the code name itself (e.g., "WATER_QUALITY" -> "water quality")
      const codeName = activityCode
        .replace(/^[WN]_/, '') // Remove W_ or N_ prefix
        .toLowerCase()
        .replace(/_/g, ' '); // Replace underscores with spaces
      
      // Add code name to keywords if not already included
      if (!keywords.some(k => k.toLowerCase() === codeName)) {
        keywords.push(codeName);
      }
      
      // Build conditions for all keywords
      const conditions = keywords.map((keyword) => {
        paramCount++;
        params.push(`%${keyword}%`);
        return `p.activityname ILIKE $${paramCount}`;
      }).join(' OR ');
      
      partnersQuery += ` AND (${conditions})`;
      
      // Also apply sector filter when activityCode is provided
      if (sector) {
        paramCount++;
        partnersQuery += ` AND p.sector ILIKE $${paramCount}`;
        params.push(`%${sector}%`);
      }
    } else if (sector) {
      // Filter by sector if no activityCode is provided
      paramCount++;
      partnersQuery += ` AND p.sector ILIKE $${paramCount}`;
      params.push(`%${sector}%`);
    }

    if (counties && counties.length > 0) {
      const countyConditions = counties.map((_, index) => {
        paramCount++;
        // Remove "County" suffix for matching flexibility
        const countyName = counties[index].replace(/\s+County\s*$/i, '').trim();
        params.push(`%${countyName}%`);
        return `p.countyname ILIKE $${paramCount}`;
      }).join(' OR ');
      partnersQuery += ` AND (${countyConditions})`;
    }

    partnersQuery += ` ORDER BY "partnerName", "activityName"`;

    // Reduced logging to prevent console spam
    // console.log('Executing query:', partnersQuery);
    // console.log('With params:', params);

    const result = await query(partnersQuery, params);
    
    // Only log if there's an issue or for important information
    if (result.rows.length === 0) {
      console.warn('⚠️ No partners returned from query', { sector, activityCode, year });
      
      // If activityCode is provided and no results, show debug info
      if (activityCode) {
        try {
          const debugQuery = `
            SELECT DISTINCT activityname, COUNT(*) as count
            FROM partners
            WHERE periodyear::text ILIKE $1
            ${counties && counties.length > 0 ? `AND (${counties.map((_, i) => `countyname ILIKE $${i + 2}`).join(' OR ')})` : ''}
            GROUP BY activityname
            ORDER BY activityname
          `;
          const debugParams = [`%${year || '2025'}%`];
          if (counties && counties.length > 0) {
            counties.forEach(county => debugParams.push(`%${county}%`));
          }
          const debugResult = await query(debugQuery, debugParams);
          console.log(`📊 Available activity values (${debugResult.rows.length} total):`, 
            debugResult.rows.map(r => `${r.activity} (${r.count})`).join(', '));
          
          // Show which ones might match the current activityCode
          if (activityCode && codeToKeywords[activityCode]) {
            const keywords = codeToKeywords[activityCode];
            const matching = debugResult.rows.filter(row => {
              const activity = (row.activityname || '').toLowerCase();
              return keywords.some(keyword => activity.includes(keyword.toLowerCase()));
            });
            if (matching.length > 0) {
              console.log(`🔍 Activities that match ${activityCode} keywords:`, 
                matching.map(r => r.activityname).join(', '));
            } else {
              console.log(`❌ No activities found matching ${activityCode} keywords:`, keywords);
            }
          }
        } catch (debugError) {
          console.error('Error fetching debug data:', debugError);
        }
      }
    }
    
    const partners = result.rows.map(row => ({
      partnerName: row.partnerName,
      orgType: row.orgType,
      sector: row.sector,
      activityCode: row.activityCode,
      activityName: row.activityName,
      countyName: row.countyName,
      subcountyName: row.subcountyName,
      wardName: row.wardName,
      wardCode: row.wardCode,
      periodYear: row.periodYear,
      status: row.status,
      modality: row.modality,
      unit: row.unit,
      fundingSrc: row.fundingSrc,
      diseases: row.diseases,
      notes: row.notes
    }));
    
    return Response.json({
      partners: partners,
      count: partners.length
    });

  } catch (error) {
    console.error('Error fetching partners data:', error);
    console.error('Error stack:', error.stack);
    return Response.json({ 
      error: error.message,
      details: error.stack 
    }, { status: 500 });
  }
}