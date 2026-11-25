'use client';

import { TrendingUp, TrendingDown, Droplets, Home, Sparkles, User, Users } from 'lucide-react';

export default function PartnersHeader({ 
  washPartners = 0,
  ntdPartners = 0,
  washIndicators = { water: 0, sanitation: 0, hygiene: 0 },
  sthPrevalence = 0,
  schistoPrevalence = 0,
  genderStatusIndex = { School: 0, 'Public Space': 0, Household: 0 },
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

  // Get trend data, default to neutral if not available
  const sthTrend = trends?.sth || { value: 0.0, direction: 'neutral' };
  const schistoTrend = trends?.schisto || { value: 0.0, direction: 'neutral' };

  // Calculate prevalence color based on both values
  const prevalenceColorClass = getPrevalenceColor(schistoPrevalence, sthPrevalence);

  const metrics = [
    {
      title: 'WASH Partners',
      value: washPartners,
      unit: '',
      colorClass: 'text-blue-600 bg-blue-50 border-blue-200'
    },
    {
      title: 'NTD Partners',
      value: ntdPartners,
      unit: '',
      colorClass: 'text-green-600 bg-green-50 border-green-200'
    },
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
    }
  ];

  const washMetrics = [
    {
      title: 'Water',
      value: washIndicators.water,
      icon: Droplets,
      color: 'blue'
    },
    {
      title: 'Sanitation',
      value: washIndicators.sanitation,
      icon: Home,
      color: 'green'
    },
    {
      title: 'Hygiene',
      value: washIndicators.hygiene,
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
        <div className="flex flex-col md:flex-row gap-4 w-full">
          {metrics.map((metric, index) => (
            <div key={index} className="flex-1 bg-white rounded-xl p-4 shadow-lg flex flex-col items-center text-center border">
              <h3 className="text-gray-600 text-xs font-medium mb-2">{metric.title}</h3>
              <div className={`inline-flex items-baseline justify-center px-2 py-1 rounded-lg border ${metric.colorClass} mb-2`}>
                <span className="text-2xl font-bold">{metric.value}</span>
                {metric.unit && <span className="text-sm ml-1">{metric.unit}</span>}
              </div>
              {metric.trend && (
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
                    // For other metrics: up is good (green), down is bad (red)
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
              )}
            </div>
          ))}

          {/* WASH Indicators Card */}
          <div className="flex-1 bg-white rounded-xl p-4 shadow-lg border w-full">
            <h3 className="text-gray-600 text-xs font-medium mb-2">WASH Indicators</h3>
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

          {/* WASH Gender Status Index Card */}
          <div className="flex-1 bg-white rounded-xl p-4 shadow-lg border w-full">
            <h3 className="text-gray-600 text-xs font-medium mb-2">WASH Gender Status Index</h3>
            <div className="space-y-2">
              {/* School */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <User size={14} className="mr-1 text-blue-600" />
                  <span className="text-xs text-blue-600">School</span>
                </div>
                <span className="text-sm font-bold text-blue-600">
                  {genderStatusIndex.School || genderStatusIndex.school || 0}%
                </span>
              </div>
              
              {/* Public Space */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Users size={14} className="mr-1 text-green-600" />
                  <span className="text-xs text-green-600">Public Space</span>
                </div>
                <span className="text-sm font-bold text-green-600">
                  {genderStatusIndex['Public Space'] || genderStatusIndex['public space'] || genderStatusIndex.PublicSpace || 0}%
                </span>
              </div>
              
              {/* Household */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Home size={14} className="mr-1 text-purple-600" />
                  <span className="text-xs text-purple-600">Household</span>
                </div>
                <span className="text-sm font-bold text-purple-600">
                  {genderStatusIndex.Household || genderStatusIndex.household || 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

