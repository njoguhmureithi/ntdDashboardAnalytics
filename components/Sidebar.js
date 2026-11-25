import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Filter, Download, FileText, Table } from 'lucide-react';
import ExportModal from './ExportModal';

function Sidebar({ filters, onFilterChange, isMobileOpen, onMobileClose, visibleWashLayers, onWashLayerToggle, washQualityFilter, onWashQualityFilterChange }) {
  const [geographicData, setGeographicData] = useState({
    counties: [],
    subCounties: {},
    wards: {}
  });
  const [loading, setLoading] = useState(true);
  const [choroplethMaxValue, setChoroplethMaxValue] = useState(100);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');

  useEffect(() => {
    const fetchGeographicData = async () => {
      try {
        const response = await fetch('/api/geographic-data');
        const data = await response.json();
        if (response.ok) {
          setGeographicData(data);
        }
      } catch (error) {
        console.error('Error fetching geographic data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGeographicData();
  }, []);

  useEffect(() => {
    if (filters?.diseases?.length > 0) {
      const fetchMaxValue = async () => {
        try {
          const diseaseMap = { 'STH': 'sth', 'Schisto': 'schistosomiasis' };
          const disease = diseaseMap[filters.diseases[filters.diseases.length - 1]] || 'sth';
          
          const params = new URLSearchParams({
            disease: disease,
            year: filters?.year || '2025'
          });

          if (filters?.county) params.append('county', filters.county);
          if (filters?.subCounty) params.append('subCounty', filters.subCounty);
          if (filters?.ward) params.append('ward', filters.ward);

          const response = await fetch(`/api/choropleth-data?${params}`);
          if (response.ok) {
            const data = await response.json();
            const maxValue = Math.max(...data.choroplethData.map(d => parseFloat(d.disease_prevalence)));
            setChoroplethMaxValue(maxValue);
          }
        } catch (error) {
          console.error('Error fetching choropleth max value:', error);
        }
      };

      fetchMaxValue();
    }
  }, [filters?.diseases, filters?.county, filters?.subCounty, filters?.ward, filters?.year]);

  const handleFilterUpdate = useCallback((key, value) => {
    const newFilters = { ...filters, [key]: value };
    
    if (key === 'county') {
      newFilters.subCounty = '';
      newFilters.ward = '';
    } else if (key === 'subCounty') {
      newFilters.ward = '';
    }
    
    onFilterChange(newFilters);
  }, [filters, onFilterChange]);

  const toggleDisease = useCallback((disease) => {
    const newDiseases = filters.diseases.includes(disease)
      ? filters.diseases.filter(d => d !== disease)
      : [...filters.diseases, disease];
    
    onFilterChange({ ...filters, diseases: newDiseases });
  }, [filters, onFilterChange]);

  const handleExportClick = useCallback((format) => {
    setExportFormat(format);
    setShowExportModal(true);
  }, []);

  const availableSubCounties = useMemo(() => {
    return filters.county ? geographicData.subCounties[filters.county] || [] : [];
  }, [filters.county, geographicData.subCounties]);

  const availableWards = useMemo(() => {
    return filters.county && filters.subCounty 
      ? geographicData.wards[`${filters.county}-${filters.subCounty}`] || []
      : [];
  }, [filters.county, filters.subCounty, geographicData.wards]);

  const currentDiseaseType = useMemo(() => {
    if (!filters?.diseases || filters.diseases.length === 0) return null;
    const diseaseMap = { 'STH': 'sth', 'Schisto': 'schistosomiasis' };
    return diseaseMap[filters.diseases[filters.diseases.length - 1]] || 'sth';
  }, [filters?.diseases]);

  if (loading) {
    return (
      <div className="fixed lg:static inset-y-0 left-0 z-50 w-80 bg-white shadow-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading filters...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      
      <aside className={`
  fixed top-16 left-0 z-40 w-80 h-[calc(100vh-4rem)] bg-white shadow-lg 
  transform transition-transform duration-300 ease-in-out overflow-y-auto
  ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
  lg:translate-x-0 lg:shadow-none lg:border-r lg:border-gray-200
  flex flex-col
`}>

        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          <div className="lg:hidden space-y-6 mb-6">
            <h3 className="font-medium text-gray-900 text-lg">Location Filters</h3>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Year</label>
              <select 
                value={filters.year} 
                onChange={(e) => handleFilterUpdate('year', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">County</label>
              <select 
                value={filters.county} 
                onChange={(e) => handleFilterUpdate('county', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Counties</option>
                {geographicData.counties.map(county => (
                  <option key={county} value={county}>{county}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Sub-County</label>
              <select 
                value={filters.subCounty} 
                onChange={(e) => handleFilterUpdate('subCounty', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!filters.county}
              >
                <option value="">All Sub-Counties</option>
                {availableSubCounties.map(subCounty => (
                  <option key={subCounty} value={subCounty}>{subCounty}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Ward</label>
              <select 
                value={filters.ward} 
                onChange={(e) => handleFilterUpdate('ward', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!filters.subCounty}
              >
                <option value="">All Wards</option>
                {availableWards.map(ward => (
                  <option key={ward} value={ward}>{ward}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">IoT Unit</label>
        
              <select 
          value={filters?.iotUnit === null ? 'no-selection' : filters?.iotUnit === true ? 'yes' : filters?.iotUnit === false ? 'no' : 'all'} 
          onChange={(e) => {
            let value;
            switch(e.target.value) {
              case 'no-selection':
                value = null;
                break;
              case 'all':
                value = undefined;
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
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              {/* <h3 className="font-medium text-gray-900">Disease Layers</h3> */}
              
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Active Diseases</label>
                <div className="space-y-2">
                  {['STH', 'Schisto'].map(disease => (
                    <label key={disease} className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={filters.diseases.includes(disease)} 
                        onChange={() => toggleDisease(disease)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">
                        {disease === 'STH' ? 'Soil-Transmitted Helminths' : 'Schistosomiasis'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 space-y-6">
              {filters?.diseases && filters.diseases.length > 0 && currentDiseaseType && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-sm text-gray-800 mb-3">
                    {currentDiseaseType === 'sth' ? 'STH Prevalence' : 'Schistosomiasis Prevalence'} (%)
                  </h4>
                  
                  <div className="space-y-2">
                    {[
                      { range: '0-2', color: '#FFE1D2' },
                      { range: '2-10', color: '#FDBEA5' },
                      { range: '10-20', color: '#FC7050' },
                      { range: '20-50', color: '#D42020' },
                      { range: '50-68.12', color: '#67000D' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center">
                        <div 
                          className="w-4 h-4 rounded-full mr-3 flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-700">{item.range}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-sm text-gray-800 mb-3">WASH Indicators</h4>
                
                <div className="space-y-4">
                  <div>
                    {/* <h5 className="font-medium text-xs text-gray-700 mb-2 uppercase tracking-wide">Show Indicators</h5> */}
                    <div className="space-y-2">
                      {[
                        { key: 'water', label: 'Water Access' },
                        { key: 'sanitation', label: 'Sanitation' },
                        { key: 'hygiene', label: 'Hygiene' },
                        { key: 'overall', label: 'Overall WASH' }
                      ].map(indicator => (
                        <label key={indicator.key} className="flex items-center space-x-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={visibleWashLayers?.[indicator.key] || false}
                            onChange={() => onWashLayerToggle?.(indicator.key)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="text-sm text-gray-700">{indicator.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-3">
                    <h5 className="font-medium text-xs text-gray-700 mb-2 uppercase tracking-wide">Quality Filter</h5>
                    <div className="space-y-2">
                      {[
                        { range: '0-25', label: 'Very Low', color: '#D7191C' },
                        { range: '26-50', label: 'Low', color: '#FFBA00' },
                        { range: '51-75', label: 'Moderate', color: '#2b9ffb' },
                        { range: '76-100', label: 'Good', color: '#1A9641' }
                      ].map(quality => (
                        <label key={quality.range} className="flex items-center space-x-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={washQualityFilter?.[quality.range] || false}
                            onChange={() => onWashQualityFilterChange?.(quality.range)}
                            className="h-4 w-4 focus:ring-blue-500 border-gray-300 rounded"
                            style={{ accentColor: quality.color }}
                          />
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: quality.color }}
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {quality.range} ({quality.label})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-3">
                    <h5 className="font-medium text-xs text-gray-700 mb-2 uppercase tracking-wide">Context Types</h5>
                    <div className="space-y-2">
                      {[
                        { 
                          type: 'Household', 
                          svg: `<svg width="24" height="24" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 18L20 5l17 13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 18v15h26V18" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <rect x="15" y="23" width="10" height="10" fill="currentColor" fill-opacity="0.5"/>
                          </svg>`
                        },
                        {
                          type: 'School', 
                          svg: `<svg width="24" height="24" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                            <!-- Single flag on pole -->
                            <line x1="20" y1="8" x2="20" y2="32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                            <path d="M20 12 L32 8 L32 20 L20 22 Z" fill="currentColor" fill-opacity="0.8" stroke="currentColor" stroke-width="1.5"/>
                          </svg>`
                        },
                        { 
                          type: 'Public Space', 
                          svg: `<svg width="24" height="24" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 10h32l-4 8H8l-4-8z" fill="currentColor" fill-opacity="0.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M8 18h24v16H8V18z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <line x1="14" y1="22" x2="14" y2="30" stroke="currentColor" stroke-width="2"/>
                            <line x1="20" y1="22" x2="20" y2="30" stroke="currentColor" stroke-width="2"/>
                            <line x1="26" y1="22" x2="26" y2="30" stroke="currentColor" stroke-width="2"/>
                          </svg>`
                        }
                      ].map(context => (
                        <div key={context.type} className="flex items-center space-x-3 text-sm text-gray-700">
                          <div className="w-6 h-6 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: context.svg }} />
                          <span>{context.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2 mb-4">
            <Download size={18} className="text-gray-600" />
            <h3 className="font-medium text-gray-900">Export Data</h3>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => handleExportClick('pdf')}
              className="w-full flex items-center justify-center gap-3 px-5 py-3 text-base font-semibold text-white bg-red-600 rounded-full shadow-md hover:bg-red-700 active:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            >
              <FileText size={18} />
              <span>Export PDF</span>
            </button>
            <button
              onClick={() => handleExportClick('csv')}
              className="w-full flex items-center justify-center gap-3 px-5 py-3 text-base font-semibold text-white bg-green-600 rounded-full shadow-md hover:bg-green-700 active:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
            >
              <Table size={18} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </aside>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        initialFilters={filters}
      />
    </>
  );
}

export default React.memo(Sidebar)