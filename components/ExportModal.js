import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Table, Calendar, MapPin, Activity } from 'lucide-react';

function ExportModal({ isOpen, onClose, initialFilters, exportEndpoint = '/api/export' }) {
  const [exportFormat, setExportFormat] = useState('pdf');
  const [filters, setFilters] = useState({
    year: initialFilters?.year || '2025',
    county: initialFilters?.county || '',
    subCounty: initialFilters?.subCounty || '',
    ward: initialFilters?.ward || '',
    diseases: initialFilters?.diseases || [],
    iotUnit: initialFilters?.iotUnit,
    // PDF options
    includeMap: true,
    includeCharts: true,
    includeRawData: false,
    includePartnerDistribution: true,
    includeTrends: true,
    includePartnerLists: true,
    // CSV options
    csvIncludeMap: true,
    csvIncludeCharts: true,
    csvIncludeRawData: false,
    csvIncludePartnerDistribution: true,
    csvIncludeTrends: true,
    csvIncludePartnerLists: true
  });
  const [geographicData, setGeographicData] = useState({
    counties: [],
    subCounties: {},
    wards: {}
  });
  const [loading, setLoading] = useState(false);
  const [loadingGeo, setLoadingGeo] = useState(true);

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
        setLoadingGeo(false);
      }
    };

    if (isOpen) {
      fetchGeographicData();
    }
  }, [isOpen]);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    
    if (key === 'county') {
      newFilters.subCounty = '';
      newFilters.ward = '';
    } else if (key === 'subCounty') {
      newFilters.ward = '';
    }
    
    setFilters(newFilters);
  };

  const toggleDisease = (disease) => {
    const newDiseases = filters.diseases.includes(disease)
      ? filters.diseases.filter(d => d !== disease)
      : [...filters.diseases, disease];
    
    setFilters({ ...filters, diseases: newDiseases });
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        format: exportFormat,
        year: filters.year,
        diseases: filters.diseases.join(',')
      });

      // Add format-specific options
      if (exportFormat === 'pdf') {
        params.append('includeMap', filters.includeMap);
        params.append('includeCharts', filters.includeCharts);
        params.append('includeRawData', filters.includeRawData);
        params.append('includePartnerDistribution', filters.includePartnerDistribution);
        params.append('includeTrends', filters.includeTrends);
        params.append('includePartnerLists', filters.includePartnerLists);
      } else if (exportFormat === 'csv') {
        params.append('includeMap', filters.csvIncludeMap);
        params.append('includeCharts', filters.csvIncludeCharts);
        params.append('includeRawData', filters.csvIncludeRawData);
        params.append('includePartnerDistribution', filters.csvIncludePartnerDistribution);
        params.append('includeTrends', filters.csvIncludeTrends);
        params.append('includePartnerLists', filters.csvIncludePartnerLists);
      }

      if (filters.county) params.append('county', filters.county);
      if (filters.subCounty) {
        // Support both subCounty and subcounty parameter names
        params.append('subCounty', filters.subCounty);
        params.append('subcounty', filters.subCounty);
      }
      if (filters.ward) params.append('ward', filters.ward);
      if (filters.iotUnit !== undefined && filters.iotUnit !== null) {
        params.append('iotUnit', filters.iotUnit);
      }

      const response = await fetch(`${exportEndpoint}?${params}`);
      
      if (response.ok) {
        if (exportFormat === 'pdf') {
          // For PDF, open in new window for printing
          const html = await response.text();
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(html);
            newWindow.document.close();
          } else {
            alert('Please allow pop-ups to view the PDF report.');
          }
        } else {
          // For CSV, download directly
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `wash-data-${filters.year}-${Date.now()}.${exportFormat}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }
        
        onClose();
      } else {
        const error = await response.json();
        alert(`Export failed: ${error.error || error.details || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const availableSubCounties = filters.county 
    ? geographicData.subCounties[filters.county] || [] 
    : [];

  const availableWards = filters.county && filters.subCounty 
    ? geographicData.wards[`${filters.county}-${filters.subCounty}`] || []
    : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Export Data</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setExportFormat('pdf')}
                className={`p-3 border rounded-lg text-sm font-medium ${
                  exportFormat === 'pdf'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <FileText size={16} className="inline mr-2" />
                PDF
              </button>
              <button
                onClick={() => setExportFormat('csv')}
                className={`p-3 border rounded-lg text-sm font-medium ${
                  exportFormat === 'csv'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <Table size={16} className="inline mr-2" />
                CSV
              </button>
            </div>
          </div>

          {/* Export Options - Different for PDF and CSV */}
          {(exportFormat === 'pdf' || exportFormat === 'csv') && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Include in {exportFormat === 'pdf' ? (exportEndpoint?.includes('partners') ? 'PDF Report' : 'PDF') : 'CSV Export'}
              </label>
              <div className="space-y-2">
                {exportEndpoint?.includes('partners') ? (
                  // Partners-specific options
                  [
                    { key: exportFormat === 'csv' ? 'csvIncludePartnerDistribution' : 'includePartnerDistribution', label: 'Partner Distribution Data' + (exportFormat === 'pdf' ? ' & Maps' : '') },
                    { key: exportFormat === 'csv' ? 'csvIncludeTrends' : 'includeTrends', label: 'WASH Trends Data' + (exportFormat === 'pdf' ? ' & Charts' : '') },
                    { key: exportFormat === 'csv' ? 'csvIncludePartnerLists' : 'includePartnerLists', label: 'Partner Lists' }
                  ].map((option) => {
                    const isChecked = filters[option.key] !== false && filters[option.key] !== undefined;
                    return (
                      <label key={option.key} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleFilterChange(option.key, e.target.checked)}
                          className="h-4 w-4 text-blue-600 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                      </label>
                    );
                  })
                ) : (
                  // Main dashboard options
                  [
                    { key: exportFormat === 'csv' ? 'csvIncludeMap' : 'includeMap', label: 'Map' },
                    { key: exportFormat === 'csv' ? 'csvIncludeCharts' : 'includeCharts', label: 'Charts' },
                    { key: exportFormat === 'csv' ? 'csvIncludeRawData' : 'includeRawData', label: 'Raw Data' }
                  ].map((option) => {
                    const isChecked = filters[option.key] !== false && filters[option.key] !== undefined;
                    return (
                      <label key={option.key} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleFilterChange(option.key, e.target.checked)}
                          className="h-4 w-4 text-blue-600 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">{option.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Basic Filters */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <select
                value={filters.year}
                onChange={(e) => handleFilterChange('year', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                County
              </label>
              <select
                value={filters.county}
                onChange={(e) => handleFilterChange('county', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                disabled={loadingGeo}
              >
                <option value="">All Counties</option>
                {geographicData.counties.map(county => (
                  <option key={county} value={county}>{county}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sub-County
              </label>
              <select
                value={filters.subCounty}
                onChange={(e) => handleFilterChange('subCounty', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                disabled={!filters.county}
              >
                <option value="">All Sub-Counties</option>
                {availableSubCounties.map(subCounty => (
                  <option key={subCounty} value={subCounty}>{subCounty}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ward
              </label>
              <select
                value={filters.ward}
                onChange={(e) => handleFilterChange('ward', e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                disabled={!filters.subCounty}
              >
                <option value="">All Wards</option>
                {availableWards.map(ward => (
                  <option key={ward} value={ward}>{ward}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Diseases - Only show for main dashboard */}
          {!exportEndpoint?.includes('partners') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Diseases
              </label>
              <div className="space-y-2">
                {['STH', 'Schisto'].map(disease => (
                  <label key={disease} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.diseases.includes(disease)}
                      onChange={() => toggleDisease(disease)}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {disease === 'STH' ? 'Soil-Transmitted Helminths' : 'Schistosomiasis'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className={`px-4 py-2 text-sm text-white rounded-md ${
              exportFormat === 'pdf' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            } disabled:opacity-50`}
          >
            {loading ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;