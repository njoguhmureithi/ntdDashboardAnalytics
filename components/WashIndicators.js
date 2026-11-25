import { Droplets, Home, Sparkles } from 'lucide-react';

export default function WashIndicators() {
  const indicators = [
    {
      title: 'Water Access',
      value: 78,
      icon: Droplets,
      color: 'blue',
      description: 'Safe drinking water'
    },
    {
      title: 'Sanitation',
      value: 65,
      icon: Home,
      color: 'green',
      description: 'Improved facilities'
    },
    {
      title: 'Hygiene',
      value: 72,
      icon: Sparkles,
      color: 'purple',
      description: 'Handwashing with soap'
    }
  ];

  const getColorClasses = (color, value) => {
    const intensity = value >= 75 ? '600' : value >= 50 ? '500' : '400';
    return {
      blue: {
        bg: `bg-blue-${intensity}`,
        text: 'text-blue-600',
        lightBg: 'bg-blue-50',
        border: 'border-blue-200'
      },
      green: {
        bg: `bg-green-${intensity}`,
        text: 'text-green-600',
        lightBg: 'bg-green-50',
        border: 'border-green-200'
      },
      purple: {
        bg: `bg-purple-${intensity}`,
        text: 'text-purple-600',
        lightBg: 'bg-purple-50',
        border: 'border-purple-200'
      }
    }[color];
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">WASH Indicators</h3>
      <div className="space-y-4">
        {indicators.map((indicator, index) => {
          const colors = getColorClasses(indicator.color, indicator.value);
          const Icon = indicator.icon;
          
          return (
            <div key={index} className={`p-4 rounded-lg border ${colors.lightBg} ${colors.border}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${colors.bg} bg-opacity-10`}>
                    <Icon size={20} className={colors.text} />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{indicator.title}</h4>
                    <p className="text-sm text-gray-600">{indicator.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${colors.text}`}>
                    {indicator.value}%
                  </div>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${colors.bg}`}
                  style={{ width: `${indicator.value}%` }}
                ></div>
              </div>
              
              {/* Status indicator */}
              <div className="mt-2 flex justify-end">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  indicator.value >= 75 ? 'bg-green-100 text-green-700' :
                  indicator.value >= 50 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {indicator.value >= 75 ? 'Good' : indicator.value >= 50 ? 'Fair' : 'Poor'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
    </div>
  );
}