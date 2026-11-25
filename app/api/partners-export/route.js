// app/api/partners-export/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    
    if (format === 'csv') {
      return await exportPartnersCSV(searchParams);
    } else if (format === 'pdf') {
      return await exportPartnersHTMLReport(searchParams);
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    console.error('Partners export error:', error);
    return NextResponse.json(
      { error: 'Export failed', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to get partners data
async function getPartnersData(searchParams, sector) {
  const year = searchParams.get('year');
  const county = searchParams.get('county');
  const subcounty = searchParams.get('subcounty') || searchParams.get('subCounty');
  const ward = searchParams.get('ward');
  const activityCode = searchParams.get('activityCode');

  let partnersQuery = `
    SELECT 
      p.partnername as "partnerName",
      p.activityname as "activityName",
      p.activityname as "activityCode",
      p.countyname as "countyName",
      p.subcountyname as "subcountyName",
      p.wardname as "wardName",
      p.periodyear as "periodYear"
    FROM partners p
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

  // Filter by sector - use the sector column directly
  if (sector) {
    paramCount++;
    partnersQuery += ` AND p.sector ILIKE $${paramCount}`;
    params.push(`%${sector}%`);
  }

  // Filter by activityCode if provided
  if (activityCode) {
    paramCount++;
    partnersQuery += ` AND p.activityname ILIKE $${paramCount}`;
    params.push(`%${activityCode}%`);
  }

  partnersQuery += ` ORDER BY p.countyname, p.subcountyname, p.wardname, p.partnername`;

  const result = await query(partnersQuery, params);
  return result.rows;
}

// Helper function to get WASH trends data
async function getWashTrendsData(searchParams) {
  const year = searchParams.get('year') || '2025';
  const county = searchParams.get('county');
  const subcounty = searchParams.get('subcounty') || searchParams.get('subCounty');
  const ward = searchParams.get('ward');

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

  const result = await query(sql, params);
  
  // Process data similar to wash-trends API
  const processedData = {
    accessibility: {
      school: { sanitation: 0, water: 0 },
      publicSpace: { sanitation: 0, water: 0 }
    },
    sanitationTrends: [],
    waterTrends: []
  };

  const yearData = {};

  result.rows.forEach(row => {
    const yr = row.year || parseInt(row.time_period?.substring(0, 4)) || parseInt(year);
    const ctx = (row.context || 'Community').trim();

    // Accessibility data
    if (!year || yr.toString() === year || row.time_period?.includes(year)) {
      if (ctx === 'School' || ctx.toLowerCase() === 'school') {
        const sanitValue = parseFloat(String(row.sanitation_access_disabled || 0).replace('%', ''));
        const waterValue = parseFloat(String(row.water_access_disabled || 0).replace('%', ''));
        if (!isNaN(sanitValue)) processedData.accessibility.school.sanitation = sanitValue;
        if (!isNaN(waterValue)) processedData.accessibility.school.water = waterValue;
      } else if (ctx === 'Public Space' || ctx.toLowerCase().includes('public')) {
        const sanitValue = parseFloat(String(row.sanitation_access_disabled || 0).replace('%', ''));
        const waterValue = parseFloat(String(row.water_access_disabled || 0).replace('%', ''));
        if (!isNaN(sanitValue)) processedData.accessibility.publicSpace.sanitation = sanitValue;
        if (!isNaN(waterValue)) processedData.accessibility.publicSpace.water = waterValue;
      }
    }

    // Trends data by year
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

    const parsePercentage = (val) => {
      if (val === null || val === undefined || val === '') return NaN;
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

  return processedData;
}

async function exportPartnersCSV(searchParams) {
  try {
    const year = searchParams.get('year');
    // CSV-specific parameters - check if explicitly set, otherwise default to true
    const includePartnerDistribution = searchParams.get('includePartnerDistribution') === 'true' || 
      (searchParams.get('includePartnerDistribution') !== 'false' && !searchParams.has('includePartnerDistribution'));
    const includeTrends = searchParams.get('includeTrends') === 'true' || 
      (searchParams.get('includeTrends') !== 'false' && !searchParams.has('includeTrends'));
    const includePartnerLists = searchParams.get('includePartnerLists') === 'true' || 
      (searchParams.get('includePartnerLists') !== 'false' && !searchParams.has('includePartnerLists'));

    const csvSections = [];

    // 1. Partner Distribution Data
    if (includePartnerDistribution) {
      csvSections.push('=== PARTNER DISTRIBUTION DATA ===');
      csvSections.push('Ward,Sub-County,County,WASH Partners Count,NTD Partners Count,Total Partners,Year');
      
      const waspPartners = await getPartnersData(searchParams, 'WATER');
      const ntdPartners = await getPartnersData(searchParams, 'NTD');
      
      const wardPartnerCounts = {};
      
      waspPartners.forEach(partner => {
        const wardKey = `${partner.wardName || 'Unknown'}|${partner.subcountyName || 'Unknown'}|${partner.countyName || 'Unknown'}`;
        if (!wardPartnerCounts[wardKey]) {
          wardPartnerCounts[wardKey] = {
            ward: partner.wardName || 'Unknown',
            subcounty: partner.subcountyName || 'Unknown',
            county: partner.countyName || 'Unknown',
            waspCount: new Set(),
            ntdCount: new Set()
          };
        }
        if (partner.partnerName) {
          wardPartnerCounts[wardKey].waspCount.add(partner.partnerName.toLowerCase());
        }
      });
      
      ntdPartners.forEach(partner => {
        const wardKey = `${partner.wardName || 'Unknown'}|${partner.subcountyName || 'Unknown'}|${partner.countyName || 'Unknown'}`;
        if (!wardPartnerCounts[wardKey]) {
          wardPartnerCounts[wardKey] = {
            ward: partner.wardName || 'Unknown',
            subcounty: partner.subcountyName || 'Unknown',
            county: partner.countyName || 'Unknown',
            waspCount: new Set(),
            ntdCount: new Set()
          };
        }
        if (partner.partnerName) {
          wardPartnerCounts[wardKey].ntdCount.add(partner.partnerName.toLowerCase());
        }
      });
      
      Object.values(wardPartnerCounts).forEach(wardData => {
        const waspCount = wardData.waspCount.size;
        const ntdCount = wardData.ntdCount.size;
        csvSections.push(`"${wardData.ward}","${wardData.subcounty}","${wardData.county}",${waspCount},${ntdCount},${waspCount + ntdCount},"${year || '2025'}"`);
      });
      
      csvSections.push('');
    }

    // 2. Partner Lists
    if (includePartnerLists) {
      csvSections.push('=== PARTNER LISTS ===');
      csvSections.push('Sector,Partner Name,Intervention Type,County,Sub-County,Ward,Year');
      
      const waspPartners = await getPartnersData(searchParams, 'WATER');
      const ntdPartners = await getPartnersData(searchParams, 'NTD');
      
      waspPartners.forEach(partner => {
        csvSections.push(`"WASH","${partner.partnerName || ''}","${partner.activityName || partner.activityCode || ''}","${partner.countyName || ''}","${partner.subcountyName || ''}","${partner.wardName || ''}","${year || '2025'}"`);
      });
      
      ntdPartners.forEach(partner => {
        csvSections.push(`"NTD","${partner.partnerName || ''}","${partner.activityName || partner.activityCode || ''}","${partner.countyName || ''}","${partner.subcountyName || ''}","${partner.wardName || ''}","${year || '2025'}"`);
      });
      
      csvSections.push('');
    }

    // 3. WASH Trends Data
    if (includeTrends) {
      csvSections.push('=== WASH TRENDS DATA ===');
      
      csvSections.push('--- Accessibility to Differently Abled ---');
      csvSections.push('Location Type,Sanitation Accessible (%),Water Accessible (%)');
      
      const trendsData = await getWashTrendsData(searchParams);
      
      csvSections.push(`"School",${trendsData.accessibility.school?.sanitation || 0},${trendsData.accessibility.school?.water || 0}`);
      csvSections.push(`"Public Space",${trendsData.accessibility.publicSpace?.sanitation || 0},${trendsData.accessibility.publicSpace?.water || 0}`);
      
      csvSections.push('');
      
      csvSections.push('--- Improved Water Source Trends ---');
      csvSections.push('Year,Community - Improved Water (%),School - Improved Water (%),Community - Treated Water (%),School - Treated Water (%)');
      
      if (trendsData.waterTrends && trendsData.waterTrends.length > 0) {
        trendsData.waterTrends.forEach(trend => {
          csvSections.push(`${trend.year},${trend.improvedWaterCommunity || 0},${trend.improvedWaterSchool || 0},${trend.treatedWaterCommunity || 0},${trend.treatedWaterSchool || 0}`);
        });
      }
      
      csvSections.push('');
      
      csvSections.push('--- Improved Sanitation Trends ---');
      csvSections.push('Year,Community - Improved Sanitation (%),School - Improved Sanitation (%),Open Defecation Prevalence (%)');
      
      if (trendsData.sanitationTrends && trendsData.sanitationTrends.length > 0) {
        trendsData.sanitationTrends.forEach(trend => {
          csvSections.push(`${trend.year},${trend.improvedSanitationCommunity || 0},${trend.improvedSanitationSchool || 0},${trend.openDefecationPrevalence || 0}`);
        });
      }
    }

    const csv = csvSections.join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="partners-dashboard-data-${year || 'all'}-${Date.now()}.csv"`
      }
    });
  } catch (error) {
    console.error('Partners CSV export error:', error);
    throw error;
  }
}

// Generate SVG charts for WASH trends
function generateWashTrendsChartsSVG(trendsData) {
  if (!trendsData) {
    return {
      accessibility: '<div style="text-align: center; padding: 40px; color: #666;">No accessibility data available</div>',
      waterTrends: '<div style="text-align: center; padding: 40px; color: #666;">No water trends data available</div>',
      sanitationTrends: '<div style="text-align: center; padding: 40px; color: #666;">No sanitation trends data available</div>'
    };
  }

  const width = 800;
  const height = 380; // Increased height to accommodate legend and Y-axis labels
  const margin = { top: 50, right: 120, bottom: 90, left: 70 }; // Increased margins for Y-axes and legend
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Accessibility Chart (Bar Chart)
  const accessibilitySVG = `
    <svg width="${width}" height="${height}" class="chart-svg">
      <text x="${width/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">WASH Accessibility to Differently Abled</text>
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      <text x="${margin.left - 10}" y="${margin.top}" text-anchor="end" font-size="10">100%</text>
      <text x="${margin.left - 10}" y="${margin.top + chartHeight}" text-anchor="end" font-size="10">0%</text>
      <text x="${margin.left - 40}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left - 40},${margin.top + chartHeight/2})" font-size="11">% Accessible</text>
      
      ${['School', 'Public Space'].map((location, i) => {
        const data = location === 'School' ? trendsData.accessibility?.school : trendsData.accessibility?.publicSpace;
        const sanitValue = data?.sanitation || 0;
        const waterValue = data?.water || 0;
        const xPos = margin.left + (i * chartWidth / 2) + (chartWidth / 4);
        const barWidth = 40;
        const sanitBarHeight = (sanitValue / 100) * chartHeight;
        const waterBarHeight = (waterValue / 100) * chartHeight;
        
        return `
          <rect x="${xPos - barWidth}" y="${margin.top + chartHeight - sanitBarHeight}" width="${barWidth}" height="${sanitBarHeight}" fill="#f97316" fill-opacity="0.8" stroke="#c2410c" stroke-width="1" />
          <text x="${xPos - barWidth/2}" y="${margin.top + chartHeight - sanitBarHeight - 5}" text-anchor="middle" font-size="10" font-weight="bold">${sanitValue.toFixed(1)}%</text>
          <rect x="${xPos}" y="${margin.top + chartHeight - waterBarHeight}" width="${barWidth}" height="${waterBarHeight}" fill="#60a5fa" fill-opacity="0.8" stroke="#2563eb" stroke-width="1" />
          <text x="${xPos + barWidth/2}" y="${margin.top + chartHeight - waterBarHeight - 5}" text-anchor="middle" font-size="10" font-weight="bold">${waterValue.toFixed(1)}%</text>
          <text x="${xPos}" y="${margin.top + chartHeight + 20}" text-anchor="middle" font-size="11">${location}</text>
        `;
      }).join('')}
      
      <rect x="${width - 150}" y="20" width="12" height="12" fill="#f97316" />
      <text x="${width - 130}" y="30" font-size="11">Sanitation</text>
      <rect x="${width - 150}" y="40" width="12" height="12" fill="#60a5fa" />
      <text x="${width - 130}" y="50" font-size="11">Water</text>
    </svg>
  `;

  // Water Trends Chart - Dual Y-axis like dashboard
  const waterTrendsSVG = trendsData.waterTrends && trendsData.waterTrends.length > 0 ? (() => {
    // Left Y-axis: Improved Water (bars)
    const leftMax = Math.max(
      ...trendsData.waterTrends.map(d => Math.max(
        d.improvedWaterCommunity || 0,
        d.improvedWaterSchool || 0
      ))
    );
    const leftYMax = Math.ceil(leftMax / 10) * 10 || 100;
    
    // Right Y-axis: Treated Water (lines)
    const rightMax = Math.max(
      ...trendsData.waterTrends.map(d => Math.max(
        d.treatedWaterCommunity || 0,
        d.treatedWaterSchool || 0
      ))
    );
    const rightYMax = Math.ceil(rightMax / 10) * 10 || 100;
    
    // Calculate bar area - bars should not extend beyond chartWidth
    const barAreaWidth = chartWidth - 40; // Reserve space for right Y-axis
    const getXPos = (i) => margin.left + (i * barAreaWidth) / Math.max(1, trendsData.waterTrends.length - 1);
    const getLeftYPos = (value) => margin.top + chartHeight - ((value / leftYMax) * chartHeight);
    const getRightYPos = (value) => margin.top + chartHeight - ((value / rightYMax) * chartHeight);
    
    // Generate tick marks for left Y-axis
    const leftTicks = [];
    const leftTickCount = 5;
    for (let i = 0; i <= leftTickCount; i++) {
      const value = (leftYMax / leftTickCount) * i;
      const yPos = margin.top + chartHeight - ((value / leftYMax) * chartHeight);
      leftTicks.push({ value, yPos });
    }
    
    // Generate tick marks for right Y-axis
    const rightTicks = [];
    const rightTickCount = 5;
    for (let i = 0; i <= rightTickCount; i++) {
      const value = (rightYMax / rightTickCount) * i;
      const yPos = margin.top + chartHeight - ((value / rightYMax) * chartHeight);
      rightTicks.push({ value, yPos });
    }
    
    // Generate polyline points for treated water lines (right Y-axis)
    const treatedCommPoints = trendsData.waterTrends.map((d, i) => `${getXPos(i)},${getRightYPos(d.treatedWaterCommunity || 0)}`).join(' ');
    const treatedSchoolPoints = trendsData.waterTrends.map((d, i) => `${getXPos(i)},${getRightYPos(d.treatedWaterSchool || 0)}`).join(' ');
    
    // Right Y-axis position - after the bars
    const rightAxisX = margin.left + barAreaWidth + 20;
    
    return `
    <svg width="${width}" height="${height}" class="chart-svg">
      <text x="${width/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">Improved Water source Trends</text>
      
      <!-- Left Y-axis (Improved Water) -->
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#ccc" stroke-width="1" />
      ${leftTicks.map(tick => `
        <line x1="${margin.left}" y1="${tick.yPos}" x2="${margin.left - 5}" y2="${tick.yPos}" stroke="#ccc" stroke-width="1" />
        <text x="${margin.left - 8}" y="${tick.yPos + 3}" text-anchor="end" font-size="9">${tick.value.toFixed(tick.value >= 1 ? 0 : 1)}</text>
      `).join('')}
      <text x="${margin.left - 50}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left - 50},${margin.top + chartHeight/2})" font-size="11">% of Population with Improved Water</text>
      
      <!-- Right Y-axis (Treated Water) - Positioned after bars -->
      <line x1="${rightAxisX}" y1="${margin.top}" x2="${rightAxisX}" y2="${margin.top + chartHeight}" stroke="#ccc" stroke-width="1" />
      ${rightTicks.map(tick => `
        <line x1="${rightAxisX}" y1="${tick.yPos}" x2="${rightAxisX + 5}" y2="${tick.yPos}" stroke="#ccc" stroke-width="1" />
        <text x="${rightAxisX + 8}" y="${tick.yPos + 3}" text-anchor="start" font-size="9">${tick.value.toFixed(tick.value >= 1 ? 0 : 1)}</text>
      `).join('')}
      <text x="${rightAxisX + 35}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${rightAxisX + 35},${margin.top + chartHeight/2})" font-size="11">% Using Treated Water</text>
      
      <!-- X-axis -->
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + barAreaWidth}" y2="${margin.top + chartHeight}" stroke="#ccc" stroke-width="1" />
      
      <!-- Bars for Improved Water (left Y-axis) -->
      ${trendsData.waterTrends.map((d, i) => {
        const xPos = getXPos(i);
        const commHeight = ((d.improvedWaterCommunity || 0) / leftYMax) * chartHeight;
        const schoolHeight = ((d.improvedWaterSchool || 0) / leftYMax) * chartHeight;
        const barWidth = 20;
        
        return `
          <rect x="${xPos - barWidth - 10}" y="${margin.top + chartHeight - commHeight}" width="${barWidth}" height="${commHeight}" fill="#f97316" fill-opacity="0.8" stroke="#c2410c" stroke-width="1" />
          <text x="${xPos - barWidth/2 - 10}" y="${margin.top + chartHeight - commHeight - 5}" text-anchor="middle" font-size="9" font-weight="bold">${(d.improvedWaterCommunity || 0).toFixed(0)}</text>
          <rect x="${xPos + 10}" y="${margin.top + chartHeight - schoolHeight}" width="${barWidth}" height="${schoolHeight}" fill="#60a5fa" fill-opacity="0.8" stroke="#2563eb" stroke-width="1" />
          <text x="${xPos + barWidth/2 + 10}" y="${margin.top + chartHeight - schoolHeight - 5}" text-anchor="middle" font-size="9" font-weight="bold">${(d.improvedWaterSchool || 0).toFixed(0)}</text>
          <text x="${xPos}" y="${margin.top + chartHeight + 20}" text-anchor="middle" font-size="11">${d.year}</text>
        `;
      }).join('')}
      
      <!-- Lines for Treated Water (right Y-axis) -->
      <polyline points="${treatedCommPoints}" fill="none" stroke="#f97316" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round" />
      ${trendsData.waterTrends.map((d, i) => {
        const xPos = getXPos(i);
        const yPos = getRightYPos(d.treatedWaterCommunity || 0);
        return `<circle cx="${xPos}" cy="${yPos}" r="4" fill="#f97316" stroke="#fff" stroke-width="2" />`;
      }).join('')}
      
      <polyline points="${treatedSchoolPoints}" fill="none" stroke="#60a5fa" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round" />
      ${trendsData.waterTrends.map((d, i) => {
        const xPos = getXPos(i);
        const yPos = getRightYPos(d.treatedWaterSchool || 0);
        return `<circle cx="${xPos}" cy="${yPos}" r="4" fill="#60a5fa" stroke="#fff" stroke-width="2" />`;
      }).join('')}
      
      <!-- Legend - Positioned at top right, outside chart area -->
      <g transform="translate(${rightAxisX + 50}, ${margin.top})">
        <rect x="0" y="0" width="12" height="12" fill="#f97316" />
        <text x="15" y="10" font-size="10">Community - Improved Water</text>
        <rect x="0" y="18" width="12" height="12" fill="#60a5fa" />
        <text x="15" y="28" font-size="10">School - Improved Water</text>
        <line x1="0" y1="36" x2="12" y2="36" stroke="#f97316" stroke-width="2" stroke-dasharray="5 5" />
        <text x="15" y="39" font-size="10">Community - Treated Water</text>
        <line x1="0" y1="48" x2="12" y2="48" stroke="#60a5fa" stroke-width="2" stroke-dasharray="5 5" />
        <text x="15" y="51" font-size="10">School - Treated Water</text>
      </g>
    </svg>
  `;
  })() : '<div style="text-align: center; padding: 40px; color: #666;">No water trends data available</div>';

  // Sanitation Trends Chart - Dual Y-axis like dashboard
  const sanitationTrendsSVG = trendsData.sanitationTrends && trendsData.sanitationTrends.length > 0 ? (() => {
    // Left Y-axis: Improved Sanitation (bars)
    const leftMax = Math.max(
      ...trendsData.sanitationTrends.map(d => Math.max(
        d.improvedSanitationCommunity || 0,
        d.improvedSanitationSchool || 0
      ))
    );
    const leftYMax = Math.ceil(leftMax / 10) * 10 || 100;
    
    // Right Y-axis: Open Defecation (line) - Use a more visible scale for small values
    const rightMax = Math.max(
      ...trendsData.sanitationTrends.map(d => d.openDefecationPrevalence || 0)
    );
    // If the max value is very small (< 10), use a scale that makes it more visible
    // Scale to show the data better while keeping it proportional
    let rightYMax;
    if (rightMax > 0 && rightMax < 10) {
      // For values < 1%, use 1% as max. For 1-10%, use 1.5x the max (rounded up)
      if (rightMax < 1) {
        rightYMax = 1.0;
      } else {
        rightYMax = Math.ceil(rightMax * 1.5 / 0.5) * 0.5; // Round to nearest 0.5
        if (rightYMax > 10) rightYMax = 10;
      }
    } else {
      rightYMax = Math.ceil(rightMax / 10) * 10 || (rightMax > 0 ? Math.max(1, rightMax) : 1);
    }
    
    // Calculate bar area - bars should not extend beyond chartWidth
    const barAreaWidth = chartWidth - 40; // Reserve space for right Y-axis
    const getXPos = (i) => margin.left + (i * barAreaWidth) / Math.max(1, trendsData.sanitationTrends.length - 1);
    const getLeftYPos = (value) => margin.top + chartHeight - ((value / leftYMax) * chartHeight);
    const getRightYPos = (value) => margin.top + chartHeight - ((value / rightYMax) * chartHeight);
    
    // Generate tick marks for left Y-axis
    const leftTicks = [];
    const leftTickCount = 5;
    for (let i = 0; i <= leftTickCount; i++) {
      const value = (leftYMax / leftTickCount) * i;
      const yPos = margin.top + chartHeight - ((value / leftYMax) * chartHeight);
      leftTicks.push({ value, yPos });
    }
    
    // Generate tick marks for right Y-axis
    const rightTicks = [];
    const rightTickCount = 5;
    for (let i = 0; i <= rightTickCount; i++) {
      const value = (rightYMax / rightTickCount) * i;
      const yPos = margin.top + chartHeight - ((value / rightYMax) * chartHeight);
      rightTicks.push({ value, yPos });
    }
    
    // Generate polyline points for open defecation line (right Y-axis)
    const openDefecPoints = trendsData.sanitationTrends.map((d, i) => `${getXPos(i)},${getRightYPos(d.openDefecationPrevalence || 0)}`).join(' ');
    
    // Right Y-axis position - after the bars
    const rightAxisX = margin.left + barAreaWidth + 20;
    
    return `
    <svg width="${width}" height="${height}" class="chart-svg">
      <text x="${width/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">Improved Sanitation Trends</text>
      
      <!-- Left Y-axis (Improved Sanitation) -->
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#ccc" stroke-width="1" />
      ${leftTicks.map(tick => `
        <line x1="${margin.left}" y1="${tick.yPos}" x2="${margin.left - 5}" y2="${tick.yPos}" stroke="#ccc" stroke-width="1" />
        <text x="${margin.left - 8}" y="${tick.yPos + 3}" text-anchor="end" font-size="9">${tick.value.toFixed(tick.value >= 1 ? 0 : 1)}</text>
      `).join('')}
      <text x="${margin.left - 50}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left - 50},${margin.top + chartHeight/2})" font-size="11">Improved Sanitation (%)</text>
      
      <!-- Right Y-axis (Open Defecation) - Positioned after bars -->
      <line x1="${rightAxisX}" y1="${margin.top}" x2="${rightAxisX}" y2="${margin.top + chartHeight}" stroke="#ccc" stroke-width="1" />
      ${rightTicks.map(tick => `
        <line x1="${rightAxisX}" y1="${tick.yPos}" x2="${rightAxisX + 5}" y2="${tick.yPos}" stroke="#ccc" stroke-width="1" />
        <text x="${rightAxisX + 8}" y="${tick.yPos + 3}" text-anchor="start" font-size="9">${tick.value.toFixed(tick.value >= 1 ? 0 : 1)}</text>
      `).join('')}
      <text x="${rightAxisX + 35}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${rightAxisX + 35},${margin.top + chartHeight/2})" font-size="11">Open Defecation Prevalence (%)</text>
      ${rightMax > 0 && rightMax < 10 ? `<text x="${rightAxisX + 8}" y="${margin.top + chartHeight/2 + 15}" text-anchor="start" font-size="8" fill="#666">(Note: Scale adjusted)</text>` : ''}
      
      <!-- X-axis -->
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + barAreaWidth}" y2="${margin.top + chartHeight}" stroke="#ccc" stroke-width="1" />
      
      <!-- Bars for Improved Sanitation (left Y-axis) -->
      ${trendsData.sanitationTrends.map((d, i) => {
        const xPos = getXPos(i);
        const commHeight = ((d.improvedSanitationCommunity || 0) / leftYMax) * chartHeight;
        const schoolHeight = ((d.improvedSanitationSchool || 0) / leftYMax) * chartHeight;
        const barWidth = 20;
        
        return `
          <rect x="${xPos - barWidth - 10}" y="${margin.top + chartHeight - commHeight}" width="${barWidth}" height="${commHeight}" fill="#f97316" fill-opacity="0.8" stroke="#c2410c" stroke-width="1" />
          <text x="${xPos - barWidth/2 - 10}" y="${margin.top + chartHeight - commHeight - 5}" text-anchor="middle" font-size="9" font-weight="bold">${(d.improvedSanitationCommunity || 0).toFixed(0)}</text>
          <rect x="${xPos + 10}" y="${margin.top + chartHeight - schoolHeight}" width="${barWidth}" height="${schoolHeight}" fill="#60a5fa" fill-opacity="0.8" stroke="#2563eb" stroke-width="1" />
          <text x="${xPos + barWidth/2 + 10}" y="${margin.top + chartHeight - schoolHeight - 5}" text-anchor="middle" font-size="9" font-weight="bold">${(d.improvedSanitationSchool || 0).toFixed(0)}</text>
          <text x="${xPos}" y="${margin.top + chartHeight + 20}" text-anchor="middle" font-size="11">${d.year}</text>
        `;
      }).join('')}
      
      <!-- Line for Open Defecation (right Y-axis) -->
      <polyline points="${openDefecPoints}" fill="none" stroke="#8B4513" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round" />
      ${trendsData.sanitationTrends.map((d, i) => {
        const xPos = getXPos(i);
        const yPos = getRightYPos(d.openDefecationPrevalence || 0);
        return `<circle cx="${xPos}" cy="${yPos}" r="4" fill="#8B4513" stroke="#fff" stroke-width="2" />`;
      }).join('')}
      
      <!-- Legend - Positioned at top right, outside chart area -->
      <g transform="translate(${rightAxisX + 50}, ${margin.top})">
        <rect x="0" y="0" width="12" height="12" fill="#f97316" />
        <text x="15" y="10" font-size="10">Improved Sanitation (Community)</text>
        <rect x="0" y="18" width="12" height="12" fill="#60a5fa" />
        <text x="15" y="28" font-size="10">Improved Sanitation (Schools)</text>
        <line x1="0" y1="36" x2="12" y2="36" stroke="#8B4513" stroke-width="2" stroke-dasharray="5 5" />
        <text x="15" y="39" font-size="10">Open Defecation Prevalence</text>
      </g>
    </svg>
  `;
  })() : '<div style="text-align: center; padding: 40px; color: #666;">No sanitation trends data available</div>';

  return {
    accessibility: accessibilitySVG,
    waterTrends: waterTrendsSVG,
    sanitationTrends: sanitationTrendsSVG
  };
}

async function exportPartnersHTMLReport(searchParams) {
  try {
    const year = searchParams.get('year');
    const includePartnerDistribution = searchParams.get('includePartnerDistribution') !== 'false';
    const includeTrends = searchParams.get('includeTrends') !== 'false';
    const includePartnerLists = searchParams.get('includePartnerLists') !== 'false';

    // Fetch all data
    const waspPartners = await getPartnersData(searchParams, 'WATER');
    const ntdPartners = await getPartnersData(searchParams, 'NTD');
    const trendsData = await getWashTrendsData(searchParams);

    // Calculate statistics
    const uniqueWashPartners = new Set(waspPartners.map(p => p.partnerName?.toLowerCase()).filter(Boolean));
    const uniqueNtdPartners = new Set(ntdPartners.map(p => p.partnerName?.toLowerCase()).filter(Boolean));
    const totalUniquePartners = new Set([...uniqueWashPartners, ...uniqueNtdPartners]);
    
    // Aggregate partner counts by ward
    const wardPartnerCounts = {};
    waspPartners.forEach(partner => {
      const wardKey = `${partner.wardName || 'Unknown'}|${partner.subcountyName || 'Unknown'}|${partner.countyName || 'Unknown'}`;
      if (!wardPartnerCounts[wardKey]) {
        wardPartnerCounts[wardKey] = {
          ward: partner.wardName || 'Unknown',
          subcounty: partner.subcountyName || 'Unknown',
          county: partner.countyName || 'Unknown',
          waspCount: new Set(),
          ntdCount: new Set()
        };
      }
      if (partner.partnerName) {
        wardPartnerCounts[wardKey].waspCount.add(partner.partnerName.toLowerCase());
      }
    });
    
    ntdPartners.forEach(partner => {
      const wardKey = `${partner.wardName || 'Unknown'}|${partner.subcountyName || 'Unknown'}|${partner.countyName || 'Unknown'}`;
      if (!wardPartnerCounts[wardKey]) {
        wardPartnerCounts[wardKey] = {
          ward: partner.wardName || 'Unknown',
          subcounty: partner.subcountyName || 'Unknown',
          county: partner.countyName || 'Unknown',
          waspCount: new Set(),
          ntdCount: new Set()
        };
      }
      if (partner.partnerName) {
        wardPartnerCounts[wardKey].ntdCount.add(partner.partnerName.toLowerCase());
      }
    });

    const county = searchParams.get('county');
    const subcounty = searchParams.get('subcounty') || searchParams.get('subCounty');
    const ward = searchParams.get('ward');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Partners Dashboard Report - ${year || '2025'}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #1f2937;
      background: #f9fafb;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 {
      color: #1e40af;
      border-bottom: 4px solid #3b82f6;
      padding-bottom: 15px;
      margin: 0 0 30px 0;
      font-size: 32px;
    }
    .metadata {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .metadata p {
      margin: 8px 0;
      font-size: 14px;
    }
    .metadata strong {
      color: #1e40af;
      display: inline-block;
      min-width: 120px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .stat-card:nth-child(2) {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }
    .stat-card:nth-child(3) {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }
    .stat-card:nth-child(4) {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }
    .stat-card h3 {
      margin: 0 0 12px 0;
      font-size: 13px;
      font-weight: 600;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat-card .value {
      font-size: 36px;
      font-weight: bold;
      line-height: 1;
    }
    h2 {
      color: #1e40af;
      margin: 40px 0 20px 0;
      font-size: 24px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    h3 {
      color: #374151;
      margin: 30px 0 15px 0;
      font-size: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 12px 8px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      color: #374151;
    }
    tr:nth-child(even) {
      background: #f9fafb;
    }
    .btn-group {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      gap: 10px;
    }
    .btn {
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
    }
    .btn:hover {
      background: #2563eb;
    }
    .btn-secondary {
      background: #6b7280;
    }
    .btn-secondary:hover {
      background: #4b5563;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
    .trends-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .chart-container {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .chart-title {
      font-size: 18px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 15px;
    }
    .chart-svg {
      width: 100%;
      height: 300px;
      background: white;
    }
    .chart-svg rect,
    .chart-svg line,
    .chart-svg polyline,
    .chart-svg circle,
    .chart-svg text {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    @media print {
      .chart-svg rect,
      .chart-svg line,
      .chart-svg polyline,
      .chart-svg circle {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="btn-group no-print">
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
  </div>

  <div class="container">
    <h1>Partners Dashboard Report</h1>
    
    <div class="metadata">
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Year:</strong> ${year || '2025'}</p>
      ${county ? `<p><strong>County:</strong> ${county}</p>` : ''}
      ${subcounty ? `<p><strong>Sub-County:</strong> ${subcounty}</p>` : ''}
      ${ward ? `<p><strong>Ward:</strong> ${ward}</p>` : ''}
    </div>

    <h2>Summary Statistics</h2>
    <div class="stats">
      <div class="stat-card">
        <h3>Total Partners</h3>
        <div class="value">${totalUniquePartners.size}</div>
      </div>
      <div class="stat-card">
        <h3>WASH Partners</h3>
        <div class="value">${uniqueWashPartners.size}</div>
      </div>
      <div class="stat-card">
        <h3>NTD Partners</h3>
        <div class="value">${uniqueNtdPartners.size}</div>
      </div>
      <div class="stat-card">
        <h3>Wards Covered</h3>
        <div class="value">${Object.keys(wardPartnerCounts).length}</div>
      </div>
    </div>

    ${includePartnerDistribution ? `
    <div class="page-break"></div>
    <h2>🗺️ Partner Distribution by Ward</h2>
    <table>
      <thead>
        <tr>
          <th>Ward</th>
          <th>Sub-County</th>
          <th>County</th>
          <th>WASH Partners</th>
          <th>NTD Partners</th>
          <th>Total Partners</th>
        </tr>
      </thead>
      <tbody>
        ${Object.values(wardPartnerCounts).map(wardData => `
          <tr>
            <td>${wardData.ward}</td>
            <td>${wardData.subcounty}</td>
            <td>${wardData.county}</td>
            <td>${wardData.waspCount.size}</td>
            <td>${wardData.ntdCount.size}</td>
            <td>${wardData.waspCount.size + wardData.ntdCount.size}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    ${includeTrends ? `
    <div class="page-break"></div>
    <h2>WASH Trends Data</h2>
    
    ${(() => {
      const charts = generateWashTrendsChartsSVG(trendsData);
      return `
        <div class="chart-container">
          <div class="chart-title">WASH Accessibility to Differently Abled</div>
          ${charts.accessibility}
        </div>
        
        <div class="chart-container">
          <div class="chart-title">Improved Water Source Trends</div>
          ${charts.waterTrends}
        </div>
        
        <div class="chart-container">
          <div class="chart-title">Improved Sanitation Trends</div>
          ${charts.sanitationTrends}
        </div>
      `;
    })()}
    ` : ''}

    ${includePartnerLists ? `
    <div class="page-break"></div>
    <h2>Partner Lists</h2>
    
    <h3>WASH Partners</h3>
    <table>
      <thead>
        <tr>
          <th>Partner Name</th>
          <th>Intervention Type</th>
          <th>County</th>
          <th>Sub-County</th>
          <th>Ward</th>
        </tr>
      </thead>
      <tbody>
        ${waspPartners.slice(0, 100).map(partner => `
          <tr>
            <td>${partner.partnerName || '-'}</td>
            <td>${partner.activityName || partner.activityCode || '-'}</td>
            <td>${partner.countyName || '-'}</td>
            <td>${partner.subcountyName || '-'}</td>
            <td>${partner.wardName || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3>NTD Partners</h3>
    <table>
      <thead>
        <tr>
          <th>Partner Name</th>
          <th>Intervention Type</th>
          <th>County</th>
          <th>Sub-County</th>
          <th>Ward</th>
        </tr>
      </thead>
      <tbody>
        ${ntdPartners.slice(0, 100).map(partner => `
          <tr>
            <td>${partner.partnerName || '-'}</td>
            <td>${partner.activityName || partner.activityCode || '-'}</td>
            <td>${partner.countyName || '-'}</td>
            <td>${partner.subcountyName || '-'}</td>
            <td>${partner.wardName || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">
      <p>Generated by NTD-WASH Partners Dashboard | ${new Date().toLocaleDateString()}</p>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        try {
          window.print();
        } catch (err) {
          console.log('Print dialog was cancelled or failed');
        }
      }, 1000);
    });
  </script>
</body>
</html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      }
    });
  } catch (error) {
    console.error('Partners HTML export error:', error);
    throw error;
  }
}
