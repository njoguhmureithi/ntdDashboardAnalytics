// app/api/dashboard-data/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const county = searchParams.get('county');
    const subcounty = searchParams.get('subCounty');
    const ward = searchParams.get('ward');
    const selectedYear = searchParams.get('year') || '2025';
    const iotUnit = searchParams.get('iotUnit');

    console.log('API Request - Filters:', { county, subcounty, ward, selectedYear, iotUnit });

    // Match by both Year column (integer) and time_period (text) to catch all data
    const yearInt = parseInt(selectedYear) || 2025;
    let headerMetricsQuery = `
      SELECT 
        COALESCE(ROUND(AVG(sth)::numeric, 1), 0) as avg_sth,
        COALESCE(ROUND(AVG(schistosomiasis)::numeric, 1), 0) as avg_schisto,
        COALESCE(ROUND(AVG((COALESCE(water_access_index, 0) + COALESCE(sanitation_index, 0) + COALESCE(hygiene_index, 0)) / 3.0)::numeric, 1), 0) as avg_wash_index,
        COALESCE(ROUND(AVG(water_access_index)::numeric, 1), 0) as water,
        COALESCE(ROUND(AVG(sanitation_index)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(hygiene_index)::numeric, 1), 0) as hygiene
      FROM ward_context_summary 
      WHERE ("Year" = $1 OR time_period LIKE $2)
    `;

    const headerParams = [yearInt, `%${selectedYear}%`];
    let paramIndex = 2; // Start at 2 since we already have 2 parameters (yearInt and time_period pattern)
    
    if (county) {
      paramIndex++;
      headerMetricsQuery += ` AND county = $${paramIndex}`;
      headerParams.push(county);
    }
    if (subcounty) {
      paramIndex++;
      headerMetricsQuery += ` AND subcounty = $${paramIndex}`;
      headerParams.push(subcounty);
    }
    if (ward) {
      paramIndex++;
      headerMetricsQuery += ` AND ward_name = $${paramIndex}`;
      headerParams.push(ward);
    }
    // Add IOT filter if specified (IOT column is TEXT, not BOOLEAN)
    if (iotUnit !== null && iotUnit !== undefined && iotUnit !== '') {
      const iotValue = String(iotUnit).toLowerCase();
      if (iotValue === 'yes' || iotValue === 'true') {
        paramIndex++;
        headerMetricsQuery += ` AND LOWER(IOT) = LOWER($${paramIndex})`;
        headerParams.push('Yes');
      } else if (iotValue === 'no' || iotValue === 'false') {
        paramIndex++;
        headerMetricsQuery += ` AND LOWER(IOT) = LOWER($${paramIndex})`;
        headerParams.push('No');
      }
    }

    console.log('Header query params:', headerParams);
    const headerResult = await query(headerMetricsQuery, headerParams);
    console.log('Header result:', headerResult.rows[0]);
    
    // Check if WASH data actually exists (not all zeros) for the selected year
    const hasWashData = headerResult.rows[0] && (
      parseFloat(headerResult.rows[0].water) > 0 ||
      parseFloat(headerResult.rows[0].sanitation) > 0 ||
      parseFloat(headerResult.rows[0].hygiene) > 0
    );

    // Build IOT filter condition for trend query (IOT column is TEXT, not BOOLEAN)
    const buildIotCondition = () => {
      if (iotUnit === null || iotUnit === undefined || iotUnit === '') {
        return '';
      }
      const iotValue = String(iotUnit).toLowerCase();
      if (iotValue === 'yes' || iotValue === 'true') {
        return "AND LOWER(IOT) = LOWER('Yes')";
      }
      if (iotValue === 'no' || iotValue === 'false') {
        return "AND LOWER(IOT) = LOWER('No')";
      }
      return '';
    };
    const iotCondition = buildIotCondition();

    // Get trend data - match by both Year column and time_period
    // Build parameterized query with proper indexing
    let trendParamIndex = 0;
    const trendWhereConditions = [];
    if (county) {
      trendParamIndex++;
      trendWhereConditions.push(`county = $${trendParamIndex}`);
    }
    if (subcounty) {
      trendParamIndex++;
      trendWhereConditions.push(`subcounty = $${trendParamIndex}`);
    }
    if (ward) {
      trendParamIndex++;
      trendWhereConditions.push(`ward_name = $${trendParamIndex}`);
    }
    const trendWhereClause = trendWhereConditions.length > 0 
      ? `WHERE ${trendWhereConditions.join(' AND ')}` 
      : 'WHERE 1=1';
    
    const trendQuery = `
      SELECT 
        '2021' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN sanitation_index END)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN (COALESCE(water_access_index, 0) + COALESCE(sanitation_index, 0) + COALESCE(hygiene_index, 0)) / 3.0 END)::numeric, 1), 0) as wash_index
      FROM ward_context_summary 
      ${trendWhereClause}
      ${iotCondition}
      
      UNION ALL
      
      SELECT 
        '2022' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN sanitation_index END)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN (COALESCE(water_access_index, 0) + COALESCE(sanitation_index, 0) + COALESCE(hygiene_index, 0)) / 3.0 END)::numeric, 1), 0) as wash_index
      FROM ward_context_summary 
      ${trendWhereClause}
      ${iotCondition}
      
      UNION ALL
      
      SELECT 
        '2023' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN sanitation_index END)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN (COALESCE(water_access_index, 0) + COALESCE(sanitation_index, 0) + COALESCE(hygiene_index, 0)) / 3.0 END)::numeric, 1), 0) as wash_index
      FROM ward_context_summary 
      ${trendWhereClause}
      ${iotCondition}
      
      UNION ALL
      
      SELECT 
        '2024' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN sanitation_index END)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN (COALESCE(water_access_index, 0) + COALESCE(sanitation_index, 0) + COALESCE(hygiene_index, 0)) / 3.0 END)::numeric, 1), 0) as wash_index
      FROM ward_context_summary 
      ${trendWhereClause}
      ${iotCondition}
      
      UNION ALL
      
      SELECT 
        '2025' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN sanitation_index END)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN (COALESCE(water_access_index, 0) + COALESCE(sanitation_index, 0) + COALESCE(hygiene_index, 0)) / 3.0 END)::numeric, 1), 0) as wash_index
      FROM ward_context_summary 
      ${trendWhereClause}
      ${iotCondition}
      
      ORDER BY year
    `;

    const trendParams = [];
    if (county) trendParams.push(county);
    if (subcounty) trendParams.push(subcounty);
    if (ward) trendParams.push(ward);

    const trendResult = await query(trendQuery, trendParams);
    console.log('Trend result:', trendResult.rows);
    console.log('Available years in trend result:', trendResult.rows.map(r => ({ year: r.year, yearType: typeof r.year })));

    // Calculate trend data: compare current year with previous year
    const currentYear = parseInt(selectedYear);
    const previousYear = currentYear - 1;
    
    // Improved year matching: handle both string and integer years
    const currentYearData = trendResult.rows.find(row => {
      const rowYear = typeof row.year === 'string' ? parseInt(row.year) : row.year;
      return rowYear === currentYear;
    });
    const previousYearData = trendResult.rows.find(row => {
      const rowYear = typeof row.year === 'string' ? parseInt(row.year) : row.year;
      return rowYear === previousYear;
    });
    
    console.log(`Trend calculation for year ${currentYear} vs ${previousYear}:`);
    console.log('Current year data:', currentYearData);
    console.log('Previous year data:', previousYearData);
    
    // Calculate trend: compare current year with previous year
    const calculateTrend = (current, previous, metricName = '') => {
      // Convert to numbers and handle null/undefined
      const currentNum = typeof current === 'number' ? current : (current !== null && current !== undefined ? parseFloat(current) : 0);
      const previousNum = typeof previous === 'number' ? previous : (previous !== null && previous !== undefined ? parseFloat(previous) : 0);
      
      // Log the calculation for debugging
      if (metricName) {
        console.log(`  calculateTrend(${metricName}): current=${current} (${typeof current}) -> ${currentNum}, previous=${previous} (${typeof previous}) -> ${previousNum}`);
      }
      
      // Handle cases where we can't calculate a meaningful trend
      if (isNaN(currentNum) || isNaN(previousNum)) {
        console.log(`  -> Returning N/A (NaN detected)`);
        return { value: 0, direction: 'neutral', label: 'N/A' };
      }
      
      // If both are 0, no change
      if (currentNum === 0 && previousNum === 0) {
        console.log(`  -> Returning No change (both are 0)`);
        return { value: 0, direction: 'neutral', label: 'No change' };
      }
      
      // Calculate absolute difference (current - previous)
      const difference = currentNum - previousNum;
      
      // If difference is exactly 0 (or very close to 0 due to floating point), show "No change"
      if (Math.abs(difference) < 0.01) {
        console.log(`  -> Difference is 0 (values are identical), returning No change`);
        return { value: 0, direction: 'neutral', label: 'No change' };
      }
      
      // Round to 1 decimal place and determine direction
      const result = {
        value: Math.abs(difference).toFixed(1),
        direction: difference > 0 ? 'up' : difference < 0 ? 'down' : 'neutral',
        label: `${difference > 0 ? '+' : ''}${difference.toFixed(1)}`
      };
      if (metricName) {
        console.log(`  -> Calculated difference: ${difference.toFixed(2)}, returning:`, result);
      }
      return result;
    };
    
    const sthTrend = calculateTrend(
      currentYearData?.sth !== undefined && currentYearData?.sth !== null ? currentYearData.sth : 0,
      previousYearData?.sth !== undefined && previousYearData?.sth !== null ? previousYearData.sth : 0,
      'STH'
    );
    
    const schistoTrend = calculateTrend(
      currentYearData?.schisto !== undefined && currentYearData?.schisto !== null ? currentYearData.schisto : 0,
      previousYearData?.schisto !== undefined && previousYearData?.schisto !== null ? previousYearData.schisto : 0,
      'Schisto'
    );
    
    // Log wash_index values for debugging
    const currentWashIndex = currentYearData?.wash_index;
    const previousWashIndex = previousYearData?.wash_index;
    console.log('WASH Index trend calculation:');
    console.log(`  Current year (${currentYear}) wash_index:`, currentWashIndex, typeof currentWashIndex);
    console.log(`  Previous year (${previousYear}) wash_index:`, previousWashIndex, typeof previousWashIndex);
    
    const washIndexTrend = calculateTrend(
      currentWashIndex !== undefined && currentWashIndex !== null ? currentWashIndex : 0,
      previousWashIndex !== undefined && previousWashIndex !== null ? previousWashIndex : 0,
      'WASH Index'
    );
    console.log('  Final WASH Index trend:', washIndexTrend);

    // Get contextual data - normalize context values to handle variations
    let contextQuery = `
      SELECT 
        CASE 
          WHEN LOWER(TRIM(context)) LIKE '%public%space%' THEN 'Public Space'
          WHEN LOWER(TRIM(context)) = 'household' THEN 'Household'
          WHEN LOWER(TRIM(context)) = 'school' THEN 'School'
          ELSE TRIM(context)
        END as context,
        COALESCE(ROUND(AVG(water_access_index)::numeric, 1), 0) as water,
        COALESCE(ROUND(AVG(sanitation_index)::numeric, 1), 0) as sanitation,
        COALESCE(ROUND(AVG(hygiene_index)::numeric, 1), 0) as hygiene
      FROM ward_context_summary 
      WHERE time_period LIKE '%' || $1 || '%'
    `;
    
    let contextParamIndex = 1;
    const contextParams = [selectedYear];
    
    if (county) {
      contextParamIndex++;
      contextQuery += ` AND county = $${contextParamIndex}`;
      contextParams.push(county);
    }
    if (subcounty) {
      contextParamIndex++;
      contextQuery += ` AND subcounty = $${contextParamIndex}`;
      contextParams.push(subcounty);
    }
    if (ward) {
      contextParamIndex++;
      contextQuery += ` AND ward_name = $${contextParamIndex}`;
      contextParams.push(ward);
    }
    // Add IOT filter if specified (IOT column is TEXT, not BOOLEAN)
    if (iotUnit !== null && iotUnit !== undefined && iotUnit !== '') {
      const iotValue = String(iotUnit).toLowerCase();
      if (iotValue === 'yes' || iotValue === 'true') {
        contextParamIndex++;
        contextQuery += ` AND LOWER(IOT) = LOWER($${contextParamIndex})`;
        contextParams.push('Yes');
      } else if (iotValue === 'no' || iotValue === 'false') {
        contextParamIndex++;
        contextQuery += ` AND LOWER(IOT) = LOWER($${contextParamIndex})`;
        contextParams.push('No');
      }
    }
    
    contextQuery += `
      GROUP BY 
        CASE 
          WHEN LOWER(TRIM(context)) LIKE '%public%space%' THEN 'Public Space'
          WHEN LOWER(TRIM(context)) = 'household' THEN 'Household'
          WHEN LOWER(TRIM(context)) = 'school' THEN 'School'
          ELSE TRIM(context)
        END
    `;

    const contextResult = await query(contextQuery, contextParams);
    console.log('Context result:', contextResult.rows);

    return Response.json({
      headerMetrics: {
        sthPrevalence: parseFloat(headerResult.rows[0]?.avg_sth) || 0,
        schistoPrevalence: parseFloat(headerResult.rows[0]?.avg_schisto) || 0,
        washIndex: parseFloat(headerResult.rows[0]?.avg_wash_index) || 0,
        water: parseFloat(headerResult.rows[0]?.water) || 0,
        sanitation: parseFloat(headerResult.rows[0]?.sanitation) || 0,
        hygiene: parseFloat(headerResult.rows[0]?.hygiene) || 0,
        hasWashData: hasWashData || false,
        trends: {
          sth: sthTrend,
          schisto: schistoTrend,
          washIndex: washIndexTrend
        }
      },
      chartData: trendResult.rows.map(row => ({
        year: parseInt(row.year),
        schisto: parseFloat(row.schisto),
        safewater: parseFloat(row.safewater),
        sth: parseFloat(row.sth),
        hygiene: parseFloat(row.hygiene),
        sanitation: parseFloat(row.sanitation)
      })),
      contextData: contextResult.rows.map(row => ({
        context: row.context,
        water: parseFloat(row.water),
        sanitation: parseFloat(row.sanitation),
        hygiene: parseFloat(row.hygiene)
      }))
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}