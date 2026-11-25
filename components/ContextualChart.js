import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';

export default function ContextualChart({ data = [] }) {
  // Helper function to find context data with flexible matching
  const findContextData = (contextName) => {
    // Try exact match first
    let found = data.find(d => d.context === contextName);
    
    // If not found, try case-insensitive match
    if (!found) {
      found = data.find(d => d.context && d.context.toLowerCase().trim() === contextName.toLowerCase().trim());
    }
    
    // For Public Space, also try variations like "Public Spaces"
    if (!found && contextName === 'Public Space') {
      found = data.find(d => d.context && d.context.toLowerCase().includes('public') && d.context.toLowerCase().includes('space'));
    }
    
    return found;
  };

  // Transform the data for the chart with safe number handling
  const householdData = findContextData('Household');
  const schoolData = findContextData('School');
  const publicSpaceData = findContextData('Public Space');

  const chartData = [
    { 
      name: 'Household', 
      Water: typeof householdData?.water === 'number' ? householdData.water : 0, 
      Sanitation: typeof householdData?.sanitation === 'number' ? householdData.sanitation : 0, 
      Hygiene: typeof householdData?.hygiene === 'number' ? householdData.hygiene : 0 
    },
    { 
      name: 'School', 
      Water: typeof schoolData?.water === 'number' ? schoolData.water : 0, 
      Sanitation: typeof schoolData?.sanitation === 'number' ? schoolData.sanitation : 0, 
      Hygiene: typeof schoolData?.hygiene === 'number' ? schoolData.hygiene : 0 
    },
    { 
      name: 'Public Space', 
      Water: typeof publicSpaceData?.water === 'number' ? publicSpaceData.water : 0, 
      Sanitation: typeof publicSpaceData?.sanitation === 'number' ? publicSpaceData.sanitation : 0, 
      Hygiene: typeof publicSpaceData?.hygiene === 'number' ? publicSpaceData.hygiene : 0 
    }
  ];

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

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">WASH Coverage by Context</h3>
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar 
                dataKey="Water" 
                fill="#00BFFF" 
                name="Water (%)"
                radius={[2, 2, 0, 0]}
              >
                <LabelList dataKey="Water" content={renderCustomizedLabel} />
              </Bar>
              <Bar 
                dataKey="Sanitation" 
                fill="#8B4513" 
                name="Sanitation (%)"
                radius={[2, 2, 0, 0]}
              >
                <LabelList dataKey="Sanitation" content={renderCustomizedLabel} />
              </Bar>
              <Bar 
                dataKey="Hygiene" 
                fill="#2ca02c" 
                name="Hygiene (%)"
                radius={[2, 2, 0, 0]}
              >
                <LabelList dataKey="Hygiene" content={renderCustomizedLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}