// app/api/export/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    
    if (format === 'csv') {
      return await exportCSV(searchParams);
    } else if (format === 'pdf') {
      return await exportHTMLReport(searchParams);
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Export failed', details: error.message },
      { status: 500 }
    );
  }
}

async function exportCSV(searchParams) {
  try {
    const year = searchParams.get('year');
    const county = searchParams.get('county');
    const subCounty = searchParams.get('subCounty');
    const ward = searchParams.get('ward');
    const diseases = searchParams.get('diseases')?.split(',').filter(Boolean) || [];

    // Match by both Year column (integer) and time_period (text) to catch all data
    const yearInt = parseInt(year) || 2025;
    let queryText = `
      SELECT 
        wcs.ward_name,
        wcs.subcounty as sub_county,
        wcs.county,
        wcs.time_period,
        wcs.context,
        wcs.water_access_index as water_index,
        wcs.sanitation_index,
        wcs.hygiene_index,
        wcs.overall_wash_index,
        wcs.latitude,
        wcs.longitude,
        wcs.sth,
        wcs.schistosomiasis,
        wcs.total_students
      FROM ward_context_summary wcs
      WHERE ("Year" = $1 OR wcs.time_period LIKE $2)
    `;

    const params = [yearInt, `%${year || '2025'}%`];
    let paramIndex = 2;

    if (county) {
      paramIndex++;
      queryText += ` AND wcs.county = $${paramIndex}`;
      params.push(county);
    }

    if (subCounty) {
      paramIndex++;
      queryText += ` AND wcs.subcounty = $${paramIndex}`;
      params.push(subCounty);
    }

    if (ward) {
      paramIndex++;
      queryText += ` AND wcs.ward_name = $${paramIndex}`;
      params.push(ward);
    }

    queryText += ` ORDER BY wcs.county, wcs.subcounty, wcs.ward_name, wcs.context`;

    const result = await query(queryText, params);

    const headers = [
      'Ward',
      'Sub-County',
      'County',
      'Time Period',
      'Context',
      'Water Index',
      'Sanitation Index',
      'Hygiene Index',
      'Overall WASH Index',
      'Latitude',
      'Longitude',
      'STH Prevalence',
      'Schistosomiasis Prevalence',
      'Total Students'
    ];

    let csv = headers.join(',') + '\n';

    result.rows.forEach(row => {
      const values = [
        row.ward_name || '',
        row.sub_county || '',
        row.county || '',
        row.time_period || '',
        row.context || '',
        row.water_index || '',
        row.sanitation_index || '',
        row.hygiene_index || '',
        row.overall_wash_index || '',
        row.latitude || '',
        row.longitude || '',
        row.sth || '',
        row.schistosomiasis || '',
        row.total_students || ''
      ];

      csv += values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="wash-data-${year || 'all'}-${Date.now()}.csv"`
      }
    });
  } catch (error) {
    console.error('CSV export error:', error);
    throw error;
  }
}

async function exportHTMLReport(searchParams) {
  try {
    const year = searchParams.get('year');
    const county = searchParams.get('county');
    const subCounty = searchParams.get('subCounty');
    const ward = searchParams.get('ward');
    const diseases = searchParams.get('diseases')?.split(',').filter(Boolean) || [];
    const includeCharts = searchParams.get('includeCharts') === 'true';
    const includeMap = searchParams.get('includeMap') === 'true';
    const includeRawData = searchParams.get('includeRawData') === 'true';

    // Get summary statistics - match by both Year column and time_period
    const yearInt = parseInt(year) || 2025;
    let queryText = `
      SELECT 
        COUNT(DISTINCT ward_name) as ward_count,
        COUNT(*) as total_points,
        ROUND(AVG(water_access_index)::numeric, 2) as avg_water,
        ROUND(AVG(sanitation_index)::numeric, 2) as avg_sanitation,
        ROUND(AVG(hygiene_index)::numeric, 2) as avg_hygiene,
        ROUND(AVG(overall_wash_index)::numeric, 2) as avg_overall,
        ROUND(AVG(sth)::numeric, 2) as avg_sth,
        ROUND(AVG(schistosomiasis)::numeric, 2) as avg_schisto
      FROM ward_context_summary
      WHERE ("Year" = $1 OR time_period LIKE $2)
    `;

    const params = [yearInt, `%${year || '2025'}%`];
    let paramIndex = 2;

    if (county) {
      paramIndex++;
      queryText += ` AND county = $${paramIndex}`;
      params.push(county);
    }

    if (subCounty) {
      paramIndex++;
      queryText += ` AND subcounty = $${paramIndex}`;
      params.push(subCounty);
    }

    if (ward) {
      paramIndex++;
      queryText += ` AND ward_name = $${paramIndex}`;
      params.push(ward);
    }

    const stats = await query(queryText, params);
    const data = stats.rows[0];

    // Get detailed data for table - match by both Year column and time_period
    const detailYearInt = parseInt(year) || 2025;
    let detailQuery = `
      SELECT 
        ward_name,
        subcounty as sub_county,
        county,
        context,
        ROUND(water_access_index::numeric, 2) as water_index,
        ROUND(sanitation_index::numeric, 2) as sanitation_index,
        ROUND(hygiene_index::numeric, 2) as hygiene_index,
        ROUND(overall_wash_index::numeric, 2) as overall_wash_index,
        ROUND(sth::numeric, 2) as sth_prevalence,
        ROUND(schistosomiasis::numeric, 2) as schisto_prevalence,
        total_students
      FROM ward_context_summary
      WHERE ("Year" = $1 OR time_period LIKE $2)
    `;

    const detailParams = [detailYearInt, `%${year || '2025'}%`];
    let detailParamIndex = 2;

    if (county) {
      detailParamIndex++;
      detailQuery += ` AND county = $${detailParamIndex}`;
      detailParams.push(county);
    }

    if (subCounty) {
      detailParamIndex++;
      detailQuery += ` AND subcounty = $${detailParamIndex}`;
      detailParams.push(subCounty);
    }

    if (ward) {
      detailParamIndex++;
      detailQuery += ` AND ward_name = $${detailParamIndex}`;
      detailParams.push(ward);
    }

    detailQuery += ` ORDER BY county, subcounty, ward_name LIMIT 200`;

    const details = await query(detailQuery, detailParams);

    // Get trend data for charts - match by both Year column and time_period
    // Build parameterized query with proper indexing
    let trendParamIndex = 0;
    const trendWhereConditions = [];
    if (county) {
      trendParamIndex++;
      trendWhereConditions.push(`county = $${trendParamIndex}`);
    }
    if (subCounty) {
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
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2021 OR time_period LIKE '%2021%' THEN sanitation_index END)::numeric, 1), 0) as sanitation
      FROM ward_context_summary 
      ${trendWhereClause}
      
      UNION ALL
      
      SELECT 
        '2022' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2022 OR time_period LIKE '%2022%' THEN sanitation_index END)::numeric, 1), 0) as sanitation
      FROM ward_context_summary 
      ${trendWhereClause}
      
      UNION ALL
      
      SELECT 
        '2023' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2023 OR time_period LIKE '%2023%' THEN sanitation_index END)::numeric, 1), 0) as sanitation
      FROM ward_context_summary 
      ${trendWhereClause}
      
      UNION ALL
      
      SELECT 
        '2024' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2024 OR time_period LIKE '%2024%' THEN sanitation_index END)::numeric, 1), 0) as sanitation
      FROM ward_context_summary 
      ${trendWhereClause}
      
      UNION ALL
      
      SELECT 
        '2025' as year,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN schistosomiasis END)::numeric, 1), 0) as schisto,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN water_access_index END)::numeric, 1), 0) as safewater,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN sth END)::numeric, 1), 0) as sth,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN hygiene_index END)::numeric, 1), 0) as hygiene,
        COALESCE(ROUND(AVG(CASE WHEN "Year" = 2025 OR time_period LIKE '%2025%' THEN sanitation_index END)::numeric, 1), 0) as sanitation
      FROM ward_context_summary 
      ${trendWhereClause}
      
      ORDER BY year
    `;

    const trendParams = [];
    if (county) trendParams.push(county);
    if (subCounty) trendParams.push(subCounty);
    if (ward) trendParams.push(ward);

    const trendResult = await query(trendQuery, trendParams);
    const trendData = trendResult.rows.map(row => ({
      year: parseInt(row.year),
      schisto: parseFloat(row.schisto),
      safewater: parseFloat(row.safewater),
      sth: parseFloat(row.sth),
      hygiene: parseFloat(row.hygiene),
      sanitation: parseFloat(row.sanitation)
    }));

    // Get contextual data for charts - normalize context values to handle variations
    // Match by both Year column and time_period
    const contextYearInt = parseInt(year) || 2025;
    let contextParamIndex = 2; // Start at 2 since we have 2 year parameters
    const contextWhereConditions = [];
    if (county) {
      contextParamIndex++;
      contextWhereConditions.push(`county = $${contextParamIndex}`);
    }
    if (subCounty) {
      contextParamIndex++;
      contextWhereConditions.push(`subcounty = $${contextParamIndex}`);
    }
    if (ward) {
      contextParamIndex++;
      contextWhereConditions.push(`ward_name = $${contextParamIndex}`);
    }
    const contextWhereClause = contextWhereConditions.length > 0 
      ? `AND ${contextWhereConditions.join(' AND ')}` 
      : '';
    
    const contextQuery = `
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
      WHERE ("Year" = $1 OR time_period LIKE $2)
      ${contextWhereClause}
      GROUP BY 
        CASE 
          WHEN LOWER(TRIM(context)) LIKE '%public%space%' THEN 'Public Space'
          WHEN LOWER(TRIM(context)) = 'household' THEN 'Household'
          WHEN LOWER(TRIM(context)) = 'school' THEN 'School'
          ELSE TRIM(context)
        END
    `;

    const contextParams = [contextYearInt, `%${year || '2025'}%`];
    if (county) contextParams.push(county);
    if (subCounty) contextParams.push(subCounty);
    if (ward) contextParams.push(ward);

    const contextResult = await query(contextQuery, contextParams);
    const contextData = contextResult.rows.map(row => ({
      context: row.context,
      water: parseFloat(row.water),
      sanitation: parseFloat(row.sanitation),
      hygiene: parseFloat(row.hygiene)
    }));

    // Generate SVG charts
    const trendChartsSVG = generateTrendChartsSVG(trendData);
    const contextChartSVG = generateContextChartSVG(contextData);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>WASH Data Report - ${year || '2025'}</title>
  <style>
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      .chart-container { break-inside: avoid; }
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
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    }
    .stat-card:nth-child(3) {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    }
    .stat-card:nth-child(4) {
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
    }
    .stat-card:nth-child(5) {
      background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
    }
    .stat-card:nth-child(6) {
      background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);
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
      position: sticky;
      top: 0;
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
      transition: all 0.2s;
    }
    .btn:hover {
      background: #2563eb;
      transform: translateY(-2px);
      box-shadow: 0 6px 8px rgba(59, 130, 246, 0.4);
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
  </style>
</head>
<body>
  <div class="btn-group no-print">
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">Close</button>
  </div>

  <div class="container">
    <h1>WASH Data Report</h1>
    
    <div class="metadata">
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Year:</strong> ${year || '2025'}</p>
      ${county ? `<p><strong>County:</strong> ${county}</p>` : ''}
      ${subCounty ? `<p><strong>Sub-County:</strong> ${subCounty}</p>` : ''}
      ${ward ? `<p><strong>Ward:</strong> ${ward}</p>` : ''}
      ${diseases.length > 0 ? `<p><strong>Diseases:</strong> ${diseases.join(', ')}</p>` : ''}
    </div>

    <h2>Summary Statistics</h2>
    <div class="stats">
      <div class="stat-card">
        <h3>Total Wards</h3>
        <div class="value">${data.ward_count || 0}</div>
      </div>
      <div class="stat-card">
        <h3>Water Index</h3>
        <div class="value">${data.avg_water || 0}</div>
      </div>
      <div class="stat-card">
        <h3>Sanitation Index</h3>
        <div class="value">${data.avg_sanitation || 0}</div>
      </div>
      <div class="stat-card">
        <h3>Hygiene Index</h3>
        <div class="value">${data.avg_hygiene || 0}</div>
      </div>
      <div class="stat-card">
        <h3>Overall</h3>
        <div class="value">${data.avg_overall || 0}</div>
      </div>
      ${data.avg_sth > 0 ? `
      <div class="stat-card">
        <h3>STH</h3>
        <div class="value">${data.avg_sth || 0}</div>
      </div>
      ` : ''}
      ${data.avg_schisto > 0 ? `
      <div class="stat-card">
        <h3>Schisto</h3>
        <div class="value">${data.avg_schisto || 0}</div>
      </div>
      ` : ''}
    </div>

    ${includeCharts ? `
    <div class="page-break"></div>
    
    <h2>Trend Analysis Charts</h2>
    
    <div class="chart-container">
      <div class="chart-title">Schistosomiasis vs Safe Water Access</div>
      ${trendChartsSVG.schistoWater}
    </div>

    <div class="chart-container">
      <div class="chart-title">STH vs Hygiene & Sanitation</div>
      ${trendChartsSVG.sthHygieneSanitation}
    </div>

    <div class="chart-container">
      <div class="chart-title">WASH Coverage by Context</div>
      ${contextChartSVG}
    </div>
    ` : ''}

    ${includeRawData ? `
    <div class="page-break"></div>

    <h2>Detailed Data</h2>
    <table>
      <thead>
        <tr>
          <th>Ward</th>
          <th>Sub-County</th>
          <th>County</th>
          <th>Context</th>
          <th>Water</th>
          <th>Sanitation</th>
          <th>Hygiene</th>
          <th>Overall</th>
          <th>STH %</th>
          <th>Schisto %</th>
          <th>Students</th>
        </tr>
      </thead>
      <tbody>
        ${details.rows.map(row => `
          <tr>
            <td>${row.ward_name || '-'}</td>
            <td>${row.sub_county || '-'}</td>
            <td>${row.county || '-'}</td>
            <td>${row.context || '-'}</td>
            <td>${row.water_index || '-'}</td>
            <td>${row.sanitation_index || '-'}</td>
            <td>${row.hygiene_index || '-'}</td>
            <td>${row.overall_wash_index || '-'}</td>
            <td>${row.sth_prevalence || '-'}</td>
            <td>${row.schisto_prevalence || '-'}</td>
            <td>${row.total_students || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">
      <p>Generated by WASH Data Dashboard | ${new Date().toLocaleDateString()}</p>
      <p>This report contains ${details.rows.length} records</p>
      ${includeCharts ? `<p>Includes trend analysis and contextual charts</p>` : ''}
    </div>
  </div>

  <script>
    // Auto-print functionality
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
    console.error('HTML export error:', error);
    throw error;
  }
}

// Function to generate SVG for trend charts
function generateTrendChartsSVG(data) {
  if (!data || data.length === 0) {
    return {
      schistoWater: '<div style="text-align: center; padding: 40px; color: #666;">No trend data available</div>',
      sthHygieneSanitation: '<div style="text-align: center; padding: 40px; color: #666;">No trend data available</div>'
    };
  }

  const width = 800;
  const height = 300;
  const margin = { top: 40, right: 80, bottom: 50, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Calculate max disease values for separate scaling
  const maxSchisto = Math.max(...data.map(d => d.schisto || 0), 1);
  const maxSth = Math.max(...data.map(d => d.sth || 0), 1);
  
  // Use a higher scale for disease (multiply by 4-5x to make it more visible)
  // This ensures disease lines use more of the chart height
  const diseaseScaleMultiplier = 4;
  const schistoMaxScale = Math.max(maxSchisto * diseaseScaleMultiplier, 20); // At least 20% scale
  const sthMaxScale = Math.max(maxSth * diseaseScaleMultiplier, 20); // At least 20% scale

  // Calculate scales
  const xScale = (value, index) => margin.left + (index * chartWidth) / (data.length - 1);
  const yScaleLeft = (value) => margin.top + chartHeight - (value * chartHeight) / 100;
  // Right scale for disease - uses separate scale for better visibility
  const yScaleRightSchisto = (value) => margin.top + chartHeight - (value * chartHeight) / schistoMaxScale;
  const yScaleRightSth = (value) => margin.top + chartHeight - (value * chartHeight) / sthMaxScale;

  // Generate Schisto vs Water chart
  const schistoWaterSVG = `
    <svg width="${width}" height="${height}" class="chart-svg">
      <!-- Title -->
      <text x="${width/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">Schistosomiasis vs Safe Water Access</text>
      
      <!-- Axes -->
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      
      <!-- Y-axis labels -->
      <text x="${margin.left - 10}" y="${margin.top}" text-anchor="end" font-size="10">100%</text>
      <text x="${margin.left - 10}" y="${margin.top + chartHeight}" text-anchor="end" font-size="10">0%</text>
      <text x="${margin.left - 40}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left - 40},${margin.top + chartHeight/2})" font-size="11">WASH Indicators</text>
      
      <text x="${margin.left + chartWidth + 10}" y="${margin.top}" text-anchor="start" font-size="10">${schistoMaxScale.toFixed(0)}%</text>
      <text x="${margin.left + chartWidth + 10}" y="${margin.top + chartHeight}" text-anchor="start" font-size="10">0%</text>
      <text x="${margin.left + chartWidth + 40}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left + chartWidth + 40},${margin.top + chartHeight/2})" font-size="11">Disease Prevalence</text>
      
      <!-- Bars for Safe Water -->
      ${data.map((d, i) => {
        const barHeight = Math.max(1, (margin.top + chartHeight) - yScaleLeft(d.safewater));
        const barY = yScaleLeft(d.safewater);
        return `
        <rect 
          x="${xScale(d.year, i) - 15}" 
          y="${barY}" 
          width="30" 
          height="${barHeight}" 
          fill="#00BFFF" 
          fill-opacity="0.8"
          stroke="#0066CC"
          stroke-width="1"
          style="shape-rendering: crispEdges;"
        />
        <text x="${xScale(d.year, i)}" y="${barY - 5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">
          ${d.safewater.toFixed(0)}%
        </text>
      `;
      }).join('')}
      
      <!-- Line for Schistosomiasis -->
      <polyline 
        points="${data.map((d, i) => `${xScale(d.year, i)},${yScaleRightSchisto(d.schisto)}`).join(' ')}" 
        fill="none" 
        stroke="#ef4444" 
        stroke-width="3"
      />
      ${data.map((d, i) => `
        <circle 
          cx="${xScale(d.year, i)}" 
          cy="${yScaleRightSchisto(d.schisto)}" 
          r="4" 
          fill="#ef4444"
        />
        <text x="${xScale(d.year, i)}" y="${yScaleRightSchisto(d.schisto) - 10}" text-anchor="middle" font-size="10" font-weight="bold" fill="#ef4444">
          ${d.schisto.toFixed(1)}%
        </text>
      `).join('')}
      
      <!-- X-axis labels -->
      ${data.map((d, i) => `
        <text x="${xScale(d.year, i)}" y="${margin.top + chartHeight + 20}" text-anchor="middle" font-size="11">
          ${d.year}
        </text>
      `).join('')}
      
      <!-- Legend -->
      <rect x="${width - 150}" y="20" width="12" height="12" fill="#00BFFF" />
      <text x="${width - 130}" y="30" font-size="11">Safe Water</text>
      <line x1="${width - 150}" y1="45" x2="${width - 130}" y2="45" stroke="#ef4444" stroke-width="2" />
      <text x="${width - 120}" y="48" font-size="11">Schistosomiasis</text>
    </svg>
  `;

  // Generate STH vs Hygiene & Sanitation chart
  const sthHygieneSanitationSVG = `
    <svg width="${width}" height="${height}" class="chart-svg">
      <!-- Title -->
      <text x="${width/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">STH vs Hygiene & Sanitation</text>
      
      <!-- Axes -->
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      
      <!-- Y-axis labels -->
      <text x="${margin.left - 10}" y="${margin.top}" text-anchor="end" font-size="10">100%</text>
      <text x="${margin.left - 10}" y="${margin.top + chartHeight}" text-anchor="end" font-size="10">0%</text>
      <text x="${margin.left - 40}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left - 40},${margin.top + chartHeight/2})" font-size="11">WASH Indicators</text>
      
      <text x="${margin.left + chartWidth + 10}" y="${margin.top}" text-anchor="start" font-size="10">${sthMaxScale.toFixed(0)}%</text>
      <text x="${margin.left + chartWidth + 10}" y="${margin.top + chartHeight}" text-anchor="start" font-size="10">0%</text>
      <text x="${margin.left + chartWidth + 40}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left + chartWidth + 40},${margin.top + chartHeight/2})" font-size="11">Disease Prevalence</text>
      
      <!-- Bars for Hygiene and Sanitation -->
      ${data.map((d, i) => {
        const hygieneBarHeight = Math.max(1, (margin.top + chartHeight) - yScaleLeft(d.hygiene));
        const hygieneBarY = yScaleLeft(d.hygiene);
        const sanitationBarHeight = Math.max(1, (margin.top + chartHeight) - yScaleLeft(d.sanitation));
        const sanitationBarY = yScaleLeft(d.sanitation);
        return `
        <rect 
          x="${xScale(d.year, i) - 20}" 
          y="${hygieneBarY}" 
          width="15" 
          height="${hygieneBarHeight}" 
          fill="#2ca02c" 
          fill-opacity="0.8"
          stroke="#1a6b1a"
          stroke-width="1"
          style="shape-rendering: crispEdges;"
        />
        <text x="${xScale(d.year, i) - 12}" y="${hygieneBarY - 5}" text-anchor="middle" font-size="9" font-weight="bold" fill="#000">
          ${d.hygiene.toFixed(0)}%
        </text>
        
        <rect 
          x="${xScale(d.year, i) + 5}" 
          y="${sanitationBarY}" 
          width="15" 
          height="${sanitationBarHeight}" 
          fill="#8B4513" 
          fill-opacity="0.8"
          stroke="#5a2a0a"
          stroke-width="1"
          style="shape-rendering: crispEdges;"
        />
        <text x="${xScale(d.year, i) + 12}" y="${sanitationBarY - 5}" text-anchor="middle" font-size="9" font-weight="bold" fill="#000">
          ${d.sanitation.toFixed(0)}%
        </text>
      `;
      }).join('')}
      
      <!-- Line for STH -->
      <polyline 
        points="${data.map((d, i) => `${xScale(d.year, i)},${yScaleRightSth(d.sth)}`).join(' ')}" 
        fill="none" 
        stroke="#f97316" 
        stroke-width="3"
      />
      ${data.map((d, i) => `
        <circle 
          cx="${xScale(d.year, i)}" 
          cy="${yScaleRightSth(d.sth)}" 
          r="4" 
          fill="#f97316"
        />
        <text x="${xScale(d.year, i)}" y="${yScaleRightSth(d.sth) - 10}" text-anchor="middle" font-size="10" font-weight="bold" fill="#f97316">
          ${d.sth.toFixed(1)}%
        </text>
      `).join('')}
      
      <!-- X-axis labels -->
      ${data.map((d, i) => `
        <text x="${xScale(d.year, i)}" y="${margin.top + chartHeight + 20}" text-anchor="middle" font-size="11">
          ${d.year}
        </text>
      `).join('')}
      
      <!-- Legend -->
      <rect x="${width - 180}" y="20" width="12" height="12" fill="#2ca02c" />
      <text x="${width - 160}" y="30" font-size="11">Hygiene</text>
      <rect x="${width - 180}" y="40" width="12" height="12" fill="#8B4513" />
      <text x="${width - 160}" y="50" font-size="11">Sanitation</text>
      <line x1="${width - 180}" y1="65" x2="${width - 160}" y2="65" stroke="#f97316" stroke-width="2" />
      <text x="${width - 150}" y="68" font-size="11">STH</text>
    </svg>
  `;

  return {
    schistoWater: schistoWaterSVG,
    sthHygieneSanitation: sthHygieneSanitationSVG
  };
}

// Function to generate SVG for contextual chart
function generateContextChartSVG(data) {
  if (!data || data.length === 0) {
    return '<div style="text-align: center; padding: 40px; color: #666;">No contextual data available</div>';
  }

  const width = 800;
  const height = 300;
  const margin = { top: 40, right: 80, bottom: 50, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const contexts = ['Household', 'School', 'Public Space'];
  const barWidth = 60;
  const groupWidth = barWidth * 3 + 20;

  const yScale = (value) => margin.top + chartHeight - (value * chartHeight) / 100;

  return `
    <svg width="${width}" height="${height}" class="chart-svg">
      <!-- Title -->
      <text x="${width/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">WASH Coverage by Context</text>
      
      <!-- Axes -->
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="#ccc" />
      
      <!-- Y-axis labels -->
      <text x="${margin.left - 10}" y="${margin.top}" text-anchor="end" font-size="10">100%</text>
      <text x="${margin.left - 10}" y="${margin.top + chartHeight/2}" text-anchor="end" font-size="10">50%</text>
      <text x="${margin.left - 10}" y="${margin.top + chartHeight}" text-anchor="end" font-size="10">0%</text>
      <text x="${margin.left - 40}" y="${margin.top + chartHeight/2}" text-anchor="middle" transform="rotate(-90 ${margin.left - 40},${margin.top + chartHeight/2})" font-size="11">WASH Coverage (%)</text>
      
      ${contexts.map((context, i) => {
        // Helper function to find context data with flexible matching
        const findContextData = (ctx) => {
          // Try exact match first
          let found = data.find(d => d.context === ctx);
          if (found) return found;
          
          // Try case-insensitive match
          found = data.find(d => d.context && d.context.toLowerCase() === ctx.toLowerCase());
          if (found) return found;
          
          // For Public Space, try variations
          if (ctx === 'Public Space') {
            found = data.find(d => d.context && d.context.toLowerCase().includes('public') && d.context.toLowerCase().includes('space'));
            if (found) return found;
          }
          
          return { water: 0, sanitation: 0, hygiene: 0 };
        };
        
        const contextData = findContextData(context);
        const groupX = margin.left + (i * groupWidth) + (chartWidth - (contexts.length * groupWidth)) / 2;
        
        return `
          <!-- Bars for ${context} -->
          <rect 
            x="${groupX}" 
            y="${yScale(contextData.water)}" 
            width="${barWidth}" 
            height="${Math.max(1, (margin.top + chartHeight) - yScale(contextData.water))}" 
            fill="#00BFFF" 
            fill-opacity="0.8"
            stroke="#0066CC"
            stroke-width="1"
            style="shape-rendering: crispEdges;"
          />
          <text x="${groupX + barWidth/2}" y="${yScale(contextData.water) - 5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">
            ${contextData.water.toFixed(0)}%
          </text>
          
          <rect 
            x="${groupX + barWidth}" 
            y="${yScale(contextData.sanitation)}" 
            width="${barWidth}" 
            height="${Math.max(1, (margin.top + chartHeight) - yScale(contextData.sanitation))}" 
            fill="#8B4513" 
            fill-opacity="0.8"
            stroke="#5a2a0a"
            stroke-width="1"
            style="shape-rendering: crispEdges;"
          />
          <text x="${groupX + barWidth * 1.5}" y="${yScale(contextData.sanitation) - 5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">
            ${contextData.sanitation.toFixed(0)}%
          </text>
          
          <rect 
            x="${groupX + barWidth * 2}" 
            y="${yScale(contextData.hygiene)}" 
            width="${barWidth}" 
            height="${Math.max(1, (margin.top + chartHeight) - yScale(contextData.hygiene))}" 
            fill="#2ca02c" 
            fill-opacity="0.8"
            stroke="#1a6b1a"
            stroke-width="1"
            style="shape-rendering: crispEdges;"
          />
          <text x="${groupX + barWidth * 2.5}" y="${yScale(contextData.hygiene) - 5}" text-anchor="middle" font-size="10" font-weight="bold" fill="#000">
            ${contextData.hygiene.toFixed(0)}%
          </text>
          
          <!-- Context label -->
          <text x="${groupX + barWidth * 1.5}" y="${margin.top + chartHeight + 20}" text-anchor="middle" font-size="11">
            ${context}
          </text>
        `;
      }).join('')}
      
      <!-- Legend -->
      <rect x="${width - 150}" y="20" width="12" height="12" fill="#00BFFF" />
      <text x="${width - 130}" y="30" font-size="11">Water</text>
      <rect x="${width - 150}" y="40" width="12" height="12" fill="#8B4513" />
      <text x="${width - 130}" y="50" font-size="11">Sanitation</text>
      <rect x="${width - 150}" y="60" width="12" height="12" fill="#2ca02c" />
      <text x="${width - 130}" y="70" font-size="11">Hygiene</text>
    </svg>
  `;
}