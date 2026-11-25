import { TrendingUp, TrendingDown, Droplets, Home, Sparkles } from 'lucide-react';
import EndemicityMatrix from './EndemicityMatrix';

export default function Header({ 
  sthPrevalence = 8.5, 
  schistoPrevalence = 12.3, 
  washIndex = 65.2,
  water = 78.5,
  sanitation = 52.8,
  hygiene = 64.3,
  filters = {},
  trends = {}
}) {
  const getPrevalenceColor = (schistoValue, sthValue) => {
    // High NTD: Schisto >= 10% OR STH >= 20% -> Red
    // Low NTD: Schisto < 10% AND STH < 20% -> Green
    const isHighNTD = schistoValue >= 10 || sthValue >= 20;
    return isHighNTD 
      ? 'text-red-600 bg-red-50 border-red-200' 
      : 'text-green-600 bg-green-50 border-green-200';
  };

  // Get WASH Index value color based on quality filter ranges (using orange instead of blue for 51-75)
  const getWashIndexValueColor = (value) => {
    if (value >= 76) return '#1A9641'; // Good - Green
    if (value >= 51) return '#FF8C00'; // Moderate - Orange (instead of blue)
    if (value >= 26) return '#FFBA00'; // Low - Yellow
    return '#D7191C'; // Very Low - Red
  };

  // Get WASH Index card color classes based on value ranges
  const getWashIndexColorClass = (value) => {
    if (value >= 76) return 'text-green-600 bg-green-50 border-green-200'; // Good - Green
    if (value >= 51) return 'text-orange-600 bg-orange-50 border-orange-200'; // Moderate - Orange
    if (value >= 26) return 'text-yellow-600 bg-yellow-50 border-yellow-200'; // Low - Yellow
    return 'text-red-600 bg-red-50 border-red-200'; // Very Low - Red
  };

  // Get trend data, default to neutral if not available
  const sthTrend = trends?.sth || { value: 0.0, direction: 'neutral' };
  const schistoTrend = trends?.schisto || { value: 0.0, direction: 'neutral' };

  // Calculate prevalence color based on both values
  const prevalenceColorClass = getPrevalenceColor(schistoPrevalence, sthPrevalence);

  const metrics = [
    {
      title: 'STH Prevalence',
      value: sthPrevalence,
      unit: '%',
      trend: sthTrend,
      colorClass: prevalenceColorClass
    },
    {
      title: 'Schistosomiasis Prevalence',
      value: schistoPrevalence,
      unit: '%',
      trend: schistoTrend,
      colorClass: prevalenceColorClass
    },
    {
      title: 'Overall WASH Index',
      value: washIndex,
      unit: '%',
      trend: trends?.washIndex || { value: 0.0, direction: 'neutral' },
      colorClass: getWashIndexColorClass(washIndex)
    }
  ];

  const washMetrics = [
    {
      title: 'Water',
      value: water,
      icon: Droplets,
      color: 'blue'
    },
    {
      title: 'Sanitation',
      value: sanitation,
      icon: Home,
      color: 'green'
    },
    {
      title: 'Hygiene',
      value: hygiene,
      icon: Sparkles,
      color: 'purple'
    }
  ];

  const getColorClasses = (color) => ({
    blue: {
      text: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200'
    },
    green: {
      text: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200'
    },
    purple: {
      text: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-200'
    }
  }[color]);

  return (
    <header className="text-white" style={{ backgroundColor: '#6082B6' }}>
      <div className="w-full px-6 py-8">
        {/* CSS Grid solution */}
        <div className="flex flex-col md:flex-row gap-4 w-full" style={{ alignItems: 'stretch', alignContent: 'stretch' }}>
           

          {metrics.map((metric, index) => {
            // For WASH Index, use dynamic color for the value based on quality ranges
            const isWashIndex = metric.title === 'Overall WASH Index';
            const valueColor = isWashIndex ? getWashIndexValueColor(metric.value) : null;
            
            return (
              <div key={index} className="flex-1 bg-white rounded-xl p-4 shadow-lg flex flex-col items-center text-center border" style={{ alignSelf: 'stretch' }}>

              <h3 className="text-gray-600 text-xs font-medium mb-2">{metric.title}</h3>
              <div className={`inline-flex items-baseline justify-center px-2 py-1 rounded-lg border ${metric.colorClass} mb-2`}>
                <span 
                  className="text-2xl font-bold"
                  style={valueColor ? { color: valueColor } : {}}
                >
                  {metric.value}
                </span>
                <span className="text-sm ml-1">{metric.unit}</span>
              </div>
              <div className="flex items-center space-x-1 text-sm">
                {metric.title.includes('Prevalence') ? (
                  // For prevalence: down is good (green), up is bad (red)
                  metric.trend.direction === 'down' ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium text-green-600">
                        {metric.trend.label || `-${metric.trend.value}`}
                      </span>
                    </>
                  ) : metric.trend.direction === 'up' ? (
                    <>
                      <TrendingUp className="h-3 w-3 text-red-500" />
                      <span className="text-xs font-medium text-red-600">
                        {metric.trend.label || `+${metric.trend.value}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-gray-500">
                      {metric.trend.label || 'No change'}
                    </span>
                  )
                ) : (
                  // For WASH Index: up is good (green), down is bad (red)
                  metric.trend.direction === 'up' ? (
                    <>
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium text-green-600">
                        {metric.trend.label || `+${metric.trend.value}`}
                      </span>
                    </>
                  ) : metric.trend.direction === 'down' ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-red-500" />
                      <span className="text-xs font-medium text-red-600">
                        {metric.trend.label || `-${metric.trend.value}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-gray-500">
                      {metric.trend.label || 'No change'}
                    </span>
                  )
                )}
              </div>
            </div>
            );
          })}

          {/* WASH Indicators Card */}
          <div className="flex-1 bg-white rounded-xl p-4 shadow-lg border w-full flex flex-col" style={{ alignSelf: 'stretch' }}>
            <h3 className="text-gray-600 text-xs font-medium mb-2 flex-shrink-0">WASH Indicators</h3>
            <div className="space-y-2">
              {washMetrics.map((metric, index) => {
                const colors = getColorClasses(metric.color);
                const Icon = metric.icon;
                return (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Icon size={14} className={`mr-1 ${colors.text}`} />
                      <span className="text-xs text-gray-600">{metric.title}</span>
                    </div>
                    <span className={`text-sm font-bold ${colors.text}`}>
                      {metric.value}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Endemicity Matrix */}
          <div className="flex-1 bg-white rounded-xl p-4 shadow-lg border w-full flex flex-col overflow-hidden" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
            <h3 className="text-gray-600 text-xs font-medium mb-1 flex-shrink-0">Endemicity Matrix</h3>
            <div className="flex-1 min-h-0 overflow-hidden" style={{ flex: '1 1 0%', minHeight: 0 }}>
              <EndemicityMatrix filters={filters} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}