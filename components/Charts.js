import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

export default function Charts({ data = [] }) {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
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

  // Custom label component for displaying values at the top of bars
  const renderCustomizedLabel = ({ x, y, width, height, value }) => {
    if (value === 0) return null; // Don't show label for zero values
    
    return (
      <text 
        x={x + width / 2} 
        y={y - 5} // Position above the bar with 5px padding
        fill="#374151" // Dark gray color for better readability
        textAnchor="middle" 
        dominantBaseline="middle"
        fontSize="11"
        fontWeight="bold"
      >
        {value.toFixed(0)}%
      </text>
    );
  };

  // Clean the data to ensure all values are numbers
  const cleanData = data.map(item => ({
    year: item.year,
    schisto: typeof item.schisto === 'number' ? item.schisto : 0,
    safewater: typeof item.safewater === 'number' ? item.safewater : 0,
    sth: typeof item.sth === 'number' ? item.sth : 0,
    hygiene: typeof item.hygiene === 'number' ? item.hygiene : 0,
    sanitation: typeof item.sanitation === 'number' ? item.sanitation : 0
  }));

  if (cleanData.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center text-gray-500 py-12">
          No data available for the selected filters
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Schistosomiasis (Line) vs Safe Water Access (Bar) */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Schistosomiasis vs Safe Water Access</h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cleanData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="year" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
              />
              {/* Left Y-Axis for WASH indicators */}
              <YAxis 
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'WASH (%)', angle: -90, position: 'insideLeft', fontSize: 12 }}
              />
              {/* Right Y-Axis for disease prevalence */}
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Disease (%)', angle: -90, position: 'insideRight', fontSize: 12 }}
                domain={[0, 'dataMax + 5']} // Add some padding
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar 
                yAxisId="left"
                dataKey="safewater" 
                fill="#00BFFF" 
                name="Safe Water Access (%)"
                radius={[2, 2, 0, 0]}
              >
                <LabelList dataKey="safewater" content={renderCustomizedLabel} />
              </Bar>
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="schisto" 
                stroke="#ef4444" 
                strokeWidth={3}
                name="Schisto Prevalence (%)"
                dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* STH (Line) vs Hygiene & Sanitation (Bars) */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">STH vs Hygiene & Sanitation</h4>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cleanData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="year" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
              />
              {/* Left Y-Axis for WASH indicators */}
              <YAxis 
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'WASH (%)', angle: -90, position: 'insideLeft', fontSize: 12 }}
              />
              {/* Right Y-Axis for disease prevalence */}
              <YAxis 
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
                label={{ value: 'Disease (%)', angle: -90, position: 'insideRight', fontSize: 12 }}
                domain={[0, 'dataMax + 5']} // Add some padding
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar 
                yAxisId="left"
                dataKey="hygiene" 
                name="Hygiene (%)"
                fill="#2ca02c" 
                radius={[2, 2, 0, 0]}
              >
                <LabelList dataKey="hygiene" content={renderCustomizedLabel} />
              </Bar>
              <Bar 
                yAxisId="left"
                dataKey="sanitation" 
                fill="#8B4513" 
                name="Sanitation (%)"
                radius={[2, 2, 0, 0]}
              >
                <LabelList dataKey="sanitation" content={renderCustomizedLabel} />
              </Bar>
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="sth" 
                stroke="#f97316" 
                strokeWidth={3}
                name="STH Prevalence (%)"
                dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#f97316', strokeWidth: 2 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}