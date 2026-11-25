// app/api/wash-trends/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subcounty');
    const ward = searchParams.get('ward');
    const year = searchParams.get('year') || '2025';

    // Build base query for all data (not just current year for trends)
    let sql = `
      SELECT 
        "Year" as year,
        context,
        time_period,
        "% of population who have access to an improved sanitation facility in the community/School" as improved_sanitation_access_percent,
        "Open defecation prevalence" as open_defecation_prevalence,
        "% of population who have access to an improved water source in schools/Community" as improved_water_access_percent,
        "Proportion of households/schools/PS using treated water" as proportion_treated_water,
        "proportion of  Sanitation facilities Accessible to the diffrently abled" as sanitation_access_disabled,
        "proportion of  Water facilities Accessible to the diffrently abled" as water_access_disabled,
        "WASH Gender Status Index" as wash_gender_status_index
      FROM ward_context_summary 
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 0;

    if (county) {
      paramIndex++;
      sql += ` AND county = $${paramIndex}`;
      params.push(county);
    }

    if (subcounty) {
      paramIndex++;
      sql += ` AND subcounty = $${paramIndex}`;
      params.push(subcounty);
    }

    if (ward) {
      paramIndex++;
      sql += ` AND ward_name = $${paramIndex}`;
      params.push(ward);
    }

    sql += ` ORDER BY year, context, time_period`;

    console.log('WASH Trends API - SQL Query:', sql);
    console.log('WASH Trends API - Params:', params);
    
    const result = await query(sql, params);
    
    console.log('WASH Trends API - Rows returned:', result.rows.length);
    if (result.rows.length > 0) {
      console.log('WASH Trends API - First row sample:', result.rows[0]);
    }
    
    // Process data for different chart types
    const processedData = {
      genderStatusIndex: {},
      accessibility: {
        school: { sanitation: 0, water: 0 },
        publicSpace: { sanitation: 0, water: 0 }
      },
      sanitationTrends: [],
      waterTrends: []
    };

    // Group by year for trends
    const yearData = {};
    const contextData = {};

    result.rows.forEach(row => {
      const yr = row.year || parseInt(row.time_period?.substring(0, 4)) || parseInt(year);
      const ctx = (row.context || 'Community').trim();

      // Gender Status Index - aggregate by context (use current year filter if provided)
      if (row.wash_gender_status_index && (!year || yr.toString() === year || row.time_period?.includes(year))) {
        const normalizedCtx = ctx === 'Public Space' || ctx.toLowerCase().includes('public') ? 'Public Space' : ctx;
        if (!contextData[normalizedCtx]) {
          contextData[normalizedCtx] = { total: 0, count: 0 };
        }
        const value = parseFloat(row.wash_gender_status_index);
        if (!isNaN(value)) {
          contextData[normalizedCtx].total += value;
          contextData[normalizedCtx].count += 1;
        }
      }

      // Accessibility data (use current year filter if provided)
      if (!year || yr.toString() === year || row.time_period?.includes(year)) {
        if (ctx === 'School' || ctx.toLowerCase() === 'school') {
          const sanitValue = parseFloat(row.sanitation_access_disabled);
          const waterValue = parseFloat(row.water_access_disabled);
          if (!isNaN(sanitValue)) processedData.accessibility.school.sanitation = sanitValue;
          if (!isNaN(waterValue)) processedData.accessibility.school.water = waterValue;
        } else if (ctx === 'Public Space' || ctx.toLowerCase().includes('public')) {
          const sanitValue = parseFloat(row.sanitation_access_disabled);
          const waterValue = parseFloat(row.water_access_disabled);
          if (!isNaN(sanitValue)) processedData.accessibility.publicSpace.sanitation = sanitValue;
          if (!isNaN(waterValue)) processedData.accessibility.publicSpace.water = waterValue;
        }
      }

      // Trends data by year (aggregate across all contexts)
      if (!yearData[yr]) {
        yearData[yr] = {
          year: yr,
          improvedSanitationCommunity: [],
          improvedSanitationSchool: [],
          openDefecationPrevalence: [],
          improvedWaterCommunity: [],
          improvedWaterSchool: [],
          treatedWaterCommunity: [],
          treatedWaterSchool: []
        };
      }

      // Collect values for averaging - handle TEXT columns that may contain percentages
      const parsePercentage = (val) => {
        if (val === null || val === undefined || val === '') return NaN;
        // Remove % sign if present and parse
        const cleaned = String(val).replace('%', '').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? NaN : parsed;
      };

      const sanitComm = parsePercentage(row.improved_sanitation_access_percent);
      const sanitSchool = (ctx === 'School' || ctx.toLowerCase() === 'school') ? sanitComm : null;
      const openDefec = parsePercentage(row.open_defecation_prevalence);
      const waterComm = parsePercentage(row.improved_water_access_percent);
      const waterSchool = (ctx === 'School' || ctx.toLowerCase() === 'school') ? waterComm : null;
      const treatedComm = parsePercentage(row.proportion_treated_water);
      const treatedSchool = (ctx === 'School' || ctx.toLowerCase() === 'school') ? treatedComm : null;

      if (!isNaN(sanitComm)) yearData[yr].improvedSanitationCommunity.push(sanitComm);
      if (sanitSchool !== null && !isNaN(sanitSchool)) yearData[yr].improvedSanitationSchool.push(sanitSchool);
      if (!isNaN(openDefec)) yearData[yr].openDefecationPrevalence.push(openDefec);
      if (!isNaN(waterComm)) yearData[yr].improvedWaterCommunity.push(waterComm);
      if (waterSchool !== null && !isNaN(waterSchool)) yearData[yr].improvedWaterSchool.push(waterSchool);
      if (!isNaN(treatedComm)) yearData[yr].treatedWaterCommunity.push(treatedComm);
      if (treatedSchool !== null && !isNaN(treatedSchool)) yearData[yr].treatedWaterSchool.push(treatedSchool);
    });

    // Calculate gender status index averages
    Object.keys(contextData).forEach(ctx => {
      if (contextData[ctx].count > 0) {
        processedData.genderStatusIndex[ctx] = contextData[ctx].total / contextData[ctx].count;
      }
    });

    // Convert year data to arrays with averages
    processedData.sanitationTrends = Object.values(yearData)
      .map(yr => ({
        year: yr.year,
        improvedSanitationCommunity: yr.improvedSanitationCommunity.length > 0 
          ? yr.improvedSanitationCommunity.reduce((a, b) => a + b, 0) / yr.improvedSanitationCommunity.length 
          : 0,
        improvedSanitationSchool: yr.improvedSanitationSchool.length > 0 
          ? yr.improvedSanitationSchool.reduce((a, b) => a + b, 0) / yr.improvedSanitationSchool.length 
          : 0,
        openDefecationPrevalence: yr.openDefecationPrevalence.length > 0 
          ? yr.openDefecationPrevalence.reduce((a, b) => a + b, 0) / yr.openDefecationPrevalence.length 
          : 0
      }))
      .sort((a, b) => a.year - b.year);

    processedData.waterTrends = Object.values(yearData)
      .map(yr => ({
        year: yr.year,
        improvedWaterCommunity: yr.improvedWaterCommunity.length > 0 
          ? yr.improvedWaterCommunity.reduce((a, b) => a + b, 0) / yr.improvedWaterCommunity.length 
          : 0,
        improvedWaterSchool: yr.improvedWaterSchool.length > 0 
          ? yr.improvedWaterSchool.reduce((a, b) => a + b, 0) / yr.improvedWaterSchool.length 
          : 0,
        treatedWaterCommunity: yr.treatedWaterCommunity.length > 0 
          ? yr.treatedWaterCommunity.reduce((a, b) => a + b, 0) / yr.treatedWaterCommunity.length 
          : 0,
        treatedWaterSchool: yr.treatedWaterSchool.length > 0 
          ? yr.treatedWaterSchool.reduce((a, b) => a + b, 0) / yr.treatedWaterSchool.length 
          : 0
      }))
      .sort((a, b) => a.year - b.year);

    // Debug: Log the processed data before returning
    console.log('WASH Trends API - Processed data:', {
      genderStatusIndex: processedData.genderStatusIndex,
      accessibility: processedData.accessibility,
      sanitationTrendsCount: processedData.sanitationTrends.length,
      waterTrendsCount: processedData.waterTrends.length,
      sampleSanitation: processedData.sanitationTrends.slice(0, 2),
      sampleWater: processedData.waterTrends.slice(0, 2)
    });

    return Response.json(processedData);
  } catch (error) {
    console.error('Error fetching WASH trends:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

