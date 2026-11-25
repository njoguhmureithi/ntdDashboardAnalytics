'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';

export default function WashTrendsCharts({ trendsData = {} }) {
  // Debug: Always log to verify component is rendering
  console.log('WashTrendsCharts component rendering with data:', trendsData);
  
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: <span className="font-semibold">
                {typeof entry.value === 'number' ? entry.value.toFixed(1) : '0'}%
              </span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Custom tick formatter to prevent overlapping values
  const formatTick = (value) => {
    if (typeof value !== 'number') return value;
    // For values >= 1, show 0 decimal places
    if (value >= 1) {
      return Math.round(value).toString();
    }
    // For values < 1, show 1 decimal place
    return value.toFixed(1);
  };

  // Accessibility data
  const accessibility = trendsData.accessibility || {
    school: { sanitation: 0, water: 0 },
    publicSpace: { sanitation: 0, water: 0 }
  };

  // Trends data
  const sanitationTrends = trendsData.sanitationTrends || [];
  const waterTrends = trendsData.waterTrends || [];

  // Debug logging
  console.log('WashTrendsCharts - Full trendsData:', trendsData);
  console.log('WashTrendsCharts - sanitationTrends length:', sanitationTrends.length, sanitationTrends);
  console.log('WashTrendsCharts - waterTrends length:', waterTrends.length, waterTrends);
  console.log('WashTrendsCharts - accessibility:', accessibility);
  
  // Show debug info in UI
  const hasSanitationData = sanitationTrends && sanitationTrends.length > 0;
  const hasWaterData = waterTrends && waterTrends.length > 0;
  const hasAccessibilityData = (accessibility.school.sanitation > 0 || accessibility.school.water > 0 || 
                                accessibility.publicSpace.sanitation > 0 || accessibility.publicSpace.water > 0);

  return (
    <div className="space-y-6" style={{ width: '100%', minHeight: '100%' }}>
      {/* Accessibility Chart */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          WASH Accessibility to differently abled
        </h3>
        <div style={{ width: '100%', height: '320px' }}>
          {hasAccessibilityData ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={[
                  {
                    name: 'School',
                    'Sanitation - Accessible (%)': accessibility.school.sanitation || 0,
                    'Water - Accessible (%)': accessibility.school.water || 0
                  },
                  {
                    name: 'Public Space',
                    'Sanitation - Accessible (%)': accessibility.publicSpace.sanitation || 0,
                    'Water - Accessible (%)': accessibility.publicSpace.water || 0
                  }
                ]}
                margin={{ top: 20, right: 10, left: 70, bottom: 60 }}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Location Type', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#374151' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: '% of Facilities Accessible', angle: -90, position: 'left', style: { textAnchor: 'middle' }, fontSize: 11, fill: '#374151' }}
                domain={[0, 100]}
                width={55}
                tickFormatter={formatTick}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px', lineHeight: '1.5' }}
                iconSize={12}
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperClassName="chart-legend"
              />
              <Bar 
                dataKey="Sanitation - Accessible (%)" 
                fill="#f97316" 
                name="Sanitation - Accessible (%)"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="Water - Accessible (%)" 
                fill="#60a5fa" 
                name="Water - Accessible (%)"
                radius={[4, 4, 0, 0]}
              />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No accessibility data available. School: {accessibility.school.sanitation}, {accessibility.school.water} | 
              Public Space: {accessibility.publicSpace.sanitation}, {accessibility.publicSpace.water}
            </div>
          )}
        </div>
      </div>

      {/* Sanitation Trends Chart */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Improved Sanitation Trends</h3>
        <div style={{ width: '100%', height: '360px' }}>
          {sanitationTrends && sanitationTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart
                data={sanitationTrends}
                margin={{ top: 20, right: 100, left: 70, bottom: 70 }}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="year" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Year', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#374151' }}
              />
              <YAxis 
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Improved Sanitation (%)', angle: -90, position: 'left', style: { textAnchor: 'middle' }, fontSize: 11, fill: '#374151' }}
                domain={[0, 'dataMax']}
                width={55}
                tickFormatter={formatTick}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Open Defecation Prevalence (%)', angle: -90, position: 'right', style: { textAnchor: 'middle' }, fontSize: 11, fill: '#374151' }}
                domain={[0, 'dataMax']}
                width={55}
                tickFormatter={formatTick}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px', lineHeight: '1.5' }}
                iconSize={12}
                layout="horizontal"
                verticalAlign="top"
                align="right"
                wrapperClassName="chart-legend"
              />
              <Bar 
                yAxisId="left"
                dataKey="improvedSanitationCommunity" 
                fill="#f97316" 
                name="Improved Sanitation (Community)"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                yAxisId="left"
                dataKey="improvedSanitationSchool" 
                fill="#60a5fa" 
                name="Improved Sanitation (Schools)"
                radius={[4, 4, 0, 0]}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="openDefecationPrevalence" 
                stroke="#8B4513" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Open Defecation Prevalence"
                dot={{ fill: '#8B4513', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No sanitation trends data available
            </div>
          )}
        </div>
      </div>

      {/* Water Access & Treated Water Usage Chart */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Improved Water source Trends</h3>
        <div style={{ width: '100%', height: '360px' }}>
          {waterTrends && waterTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart
                data={waterTrends}
                margin={{ top: 20, right: 100, left: 70, bottom: 70 }}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="year" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Year', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#374151' }}
              />
              <YAxis 
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: '% of Population with Improved Water', angle: -90, position: 'left', style: { textAnchor: 'middle' }, fontSize: 11, fill: '#374151' }}
                domain={[0, 'dataMax']}
                width={55}
                tickFormatter={formatTick}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: '% Using Treated Water', angle: -90, position: 'right', style: { textAnchor: 'middle' }, fontSize: 11, fill: '#374151' }}
                domain={[0, 'dataMax']}
                width={55}
                tickFormatter={formatTick}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px', lineHeight: '1.5' }}
                iconSize={12}
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperClassName="chart-legend"
              />
              <Bar 
                yAxisId="left"
                dataKey="improvedWaterCommunity" 
                fill="#f97316" 
                name="Community - Improved Water"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                yAxisId="left"
                dataKey="improvedWaterSchool" 
                fill="#60a5fa" 
                name="School - Improved Water"
                radius={[4, 4, 0, 0]}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="treatedWaterCommunity" 
                stroke="#f97316" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Community - Treated Water"
                dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="treatedWaterSchool" 
                stroke="#60a5fa" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name="School - Treated Water"
                dot={{ fill: '#60a5fa', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No water trends data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

