'use client';

import { useState, useEffect } from 'react';

export default function EndemicityMatrix({ filters = {} }) {
  const [washData, setWashData] = useState({ water: 0, sanitation: 0, hygiene: 0 });
  const [ntdData, setNtdData] = useState({ schisto: 0, sth: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.year) params.append('year', filters.year);
        if (filters.county) params.append('county', filters.county);
        if (filters.subCounty) params.append('subCounty', filters.subCounty);
        if (filters.ward) params.append('ward', filters.ward);

        const response = await fetch(`/api/dashboard-data?${params}`);
        const result = await response.json();
        
        if (response.ok && result.headerMetrics) {
          setWashData({
            water: result.headerMetrics.water || 0,
            sanitation: result.headerMetrics.sanitation || 0,
            hygiene: result.headerMetrics.hygiene || 0
          });
          setNtdData({
            schisto: result.headerMetrics.schistoPrevalence || 0,
            sth: result.headerMetrics.sthPrevalence || 0
          });
        }
      } catch (error) {
        console.error('Error fetching matrix data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  // Determine quadrant based on classification rules
  const getQuadrant = () => {
    // High WASH: Water ≥80% AND Sanitation ≥85% AND Hygiene ≥85%
    const isHighWASH = washData.water >= 80 && washData.sanitation >= 85 && washData.hygiene >= 85;
    
    // High NTD: Schisto ≥10% OR STH ≥20%
    // Low NTD: Schisto < 10% AND STH < 20%
    const isHighNTD = ntdData.schisto >= 10 || ntdData.sth >= 20;

    // Determine quadrant
    if (isHighNTD && !isHighWASH) {
      // Quadrant 1: High NTD, Low WASH
      return {
        id: 1,
        color: 'bg-red-100 border-red-300 text-red-800',
        backgroundColor: '#fee2e2',
        borderColor: '#fca5a5',
        textColor: '#991b1b',
        message: 'FOCUS: Surge response to interrupt transmission',
        label: 'High NTD\nLow WASH'
      };
    } else if (isHighNTD && isHighWASH) {
      // Quadrant 2: High NTD, High WASH
      return {
        id: 2,
        color: 'bg-yellow-100 border-yellow-300 text-yellow-800',
        backgroundColor: '#fef3c7',
        borderColor: '#fcd34d',
        textColor: '#92400e',
        message: 'FOCUS: Close the residual transmission gaps',
        label: 'High NTD\nHigh WASH'
      };
    } else if (!isHighNTD && !isHighWASH) {
      // Quadrant 3: Low NTD, Low WASH
      return {
        id: 3,
        color: 'bg-blue-100 border-blue-300 text-blue-800',
        backgroundColor: '#dbeafe',
        borderColor: '#93c5fd',
        textColor: '#1e40af',
        message: 'FOCUS: Prevent resurgence while scaling WASH',
        label: 'Low NTD\nLow WASH'
      };
    } else {
      // Quadrant 4: Low NTD, High WASH
      return {
        id: 4,
        color: 'bg-green-100 border-green-300 text-green-800',
        backgroundColor: '#dcfce7',
        borderColor: '#86efac',
        textColor: '#166534',
        message: 'FOCUS: Sustain success & showcase learning',
        label: 'Low NTD\nHigh WASH'
      };
    }
  };

  const quadrant = getQuadrant();

  if (loading) {
  return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ height: '100%', maxHeight: '100%', minHeight: 0 }}>
      {/* Single Quadrant Display */}
      <div 
        className="w-full h-full flex flex-col items-center justify-center overflow-hidden rounded border-2" 
        style={{ 
          minHeight: 0,
          backgroundColor: quadrant.backgroundColor,
          borderColor: quadrant.borderColor,
          color: quadrant.textColor
        }}
      >
        <div className="text-center w-full px-2 py-1 flex flex-col items-center justify-center h-full">
          <div className="text-[10px] font-bold mb-1 leading-tight whitespace-pre-line text-center">
            {quadrant.label}
          </div>
          <div className="text-[8px] font-semibold mt-1 leading-tight text-center px-1" style={{ lineHeight: '1.2' }}>
            {quadrant.message}
          </div>
        </div>
      </div>
    </div>
  );
}