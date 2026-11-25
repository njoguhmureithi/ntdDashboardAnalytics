'use client';

import { useState, useEffect, useMemo } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navigation({ filters, onFilterChange }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [geographicData, setGeographicData] = useState({
    counties: [],
    subCounties: {},
    wards: {}
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchGeographicData = async () => {
      try {
        const response = await fetch('/api/geographic-data');
        const data = await response.json();
        if (response.ok) {
          setGeographicData(data);
        } else {
          console.error('Error fetching geographic data:', data.error || 'Unknown error');
          // Set empty data structure to prevent errors
          setGeographicData({ counties: [], subCounties: {}, wards: {} });
        }
      } catch (error) {
        console.error('Error fetching geographic data:', error);
        // Set empty data structure to prevent errors
        setGeographicData({ counties: [], subCounties: {}, wards: {} });
      } finally {
        setLoading(false);
      }
    };

    fetchGeographicData();
  }, []);

  // Memoize sub-counties and wards based on filters
  const availableSubCounties = useMemo(() => {
    return filters?.county ? geographicData?.subCounties?.[filters.county] || [] : [];
  }, [filters?.county, geographicData?.subCounties]);

  const availableWards = useMemo(() => {
    return filters?.county && filters?.subCounty 
      ? geographicData?.wards?.[`${filters.county}-${filters.subCounty}`] || []
      : [];
  }, [filters?.county, filters?.subCounty, geographicData?.wards]);

  const handleFilterUpdate = (key, value) => {
    if (!onFilterChange) return;
    
    const newFilters = { ...filters, [key]: value };
    
    // Reset dependent filters when parent filter changes
    if (key === 'county') {
      newFilters.subCounty = '';
      newFilters.ward = '';
    } else if (key === 'subCounty') {
      newFilters.ward = '';
    }
    
    onFilterChange(newFilters);
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50 w-full">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Left: Logo + Links */}
          <div className="flex items-center space-x-8 flex-shrink-0">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img src="/Logo.png" alt="Logo" className="h-16 w-auto" />
              <span className="hidden lg:block text-gray-900 font-semibold text-lg whitespace-nowrap">
                NTD-WASH Dashboard
              </span>
            </div>

            {/* Navigation Links - Hidden on mobile */}
            <div className="hidden md:flex items-center space-x-6">
              <a 
                href="/" 
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                Main Dashboard
              </a>
              <a
                href="/partners"
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                Partners Dashboard
              </a>
              <a
                href="/WASH_INDICES.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                WASH Indices
              </a>
              <a
                href="/WASH_NTD_Dashboard_User_Guide.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-700 hover:text-blue-600 font-medium transition-colors duration-200 px-3 py-2 rounded-md text-sm"
              >
                User Guide
              </a>
            </div>
          </div>

          {/* Right Section: Filters + Account */}
          <div className="flex items-center space-x-4 flex-shrink-0">
            {/* Filters - Moved to right side and made smaller */}
            <div className="hidden md:flex items-center space-x-2">
              {/* Year Filter */}
              <select 
                value={filters?.year || '2025'} 
                onChange={(e) => handleFilterUpdate('year', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white min-w-[90px] hover:border-gray-400 transition-colors"
              >
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
              </select>

              {/* County Filter */}
              <select 
                value={filters?.county || ''} 
                onChange={(e) => handleFilterUpdate('county', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white min-w-[120px] hover:border-gray-400 transition-colors"
                disabled={loading}
              >
                <option value="">All Counties</option>
                {geographicData?.counties?.map(county => (
                  <option key={county} value={county}>{county}</option>
                ))}
              </select>

              {/* Sub-County Filter */}
              <select 
                value={filters?.subCounty || ''} 
                onChange={(e) => handleFilterUpdate('subCounty', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white min-w-[130px] hover:border-gray-400 transition-colors"
                disabled={!filters?.county || loading}
              >
                <option value="">All Sub-Counties</option>
                {availableSubCounties.map(subCounty => (
                  <option key={subCounty} value={subCounty}>{subCounty}</option>
                ))}
              </select>

              {/* Ward Filter */}
              <select 
                value={filters?.ward || ''} 
                onChange={(e) => handleFilterUpdate('ward', e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white min-w-[110px] hover:border-gray-400 transition-colors"
                disabled={!filters?.subCounty || loading}
              >
                <option value="">All Wards</option>
                {availableWards.map(ward => (
                  <option key={ward} value={ward}>{ward}</option>
                ))}
              </select>

      {/* IoT Unit Filter */}
<select 
  value={filters?.iotUnit === null ? 'no-selection' : filters?.iotUnit === true ? 'yes' : filters?.iotUnit === false ? 'no' : 'all'} 
  onChange={(e) => {
    let value;
    switch(e.target.value) {
      case 'no-selection':
        value = null;
        break;
      case 'all':
        value = undefined; // or whatever represents "all" in your system
        break;
      case 'yes':
        value = true;
        break;
      case 'no':
        value = false;
        break;
      default:
        value = null;
    }
    handleFilterUpdate('iotUnit', value);
  }}
  className="px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white min-w-[95px] hover:border-gray-400 transition-colors"
>
  <option value="no-selection">IOT Selection</option>
  <option value="all">All Wards</option>
  <option value="yes">Yes IOT</option>
  <option value="no">Not IOT</option>
</select>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu - Only shows navigation links and account options, NO FILTERS */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4 bg-white">
            <div className="space-y-4">
              {/* Navigation Links */}
              <div className="space-y-2">
                <a 
                  href="/" 
                  className="block px-4 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md font-medium transition-colors duration-200 border-l-4 border-transparent hover:border-blue-500"
                >
                  Main Dashboard
                </a>
                <a
                  href="/partners"
                  className="block px-4 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md font-medium transition-colors duration-200 border-l-4 border-transparent hover:border-blue-500"
                >
                  Partners Dashboard
                </a>
                <a
                  href="/WASH_INDICES.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md font-medium transition-colors duration-200 border-l-4 border-transparent hover:border-blue-500"
                >
                  WASH Indices
                </a>
                <a
                  href="/WASH_NTD_Dashboard_User_Guide.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 text-gray-700 hover:text-blue-600 hover:bg-gray-50 rounded-md font-medium transition-colors duration-200 border-l-4 border-transparent hover:border-blue-500"
                >
                  User Guide
                </a>
              </div>

            </div>
          </div>
        )}
      </div>
    </nav>
  );
}