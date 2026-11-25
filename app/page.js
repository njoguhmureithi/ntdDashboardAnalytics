'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Menu } from 'lucide-react';
import Navigation from '../components/Navigation';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import Map from '../components/Map';
import Charts from '../components/Charts';
import ContextualChart from '../components/ContextualChart';
import Footer from '../components/Footer';
import { useDebouncedCallback } from 'use-debounce';

export default function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [filters, setFilters] = useState({
    year: '2025',
    county: '',
    subCounty: '',
    ward: '',
    iotUnit: null,
    diseases: ['STH', 'Schisto']
  });
  
  const [washQualityFilter, setWashQualityFilter] = useState({
    '0-25': true,
    '26-50': true,
    '51-75': true,
    '76-100': true
  });
  
  const [visibleWashLayers, setVisibleWashLayers] = useState({
    water: false,
    sanitation: false,
    hygiene: false,
    overall: true
  });

  const [data, setData] = useState({
    headerMetrics: {
      sthPrevalence: 0,
      schistoPrevalence: 0,
      washIndex: 0,
      water: 0,
      sanitation: 0,
      hygiene: 0
    },
    chartData: [],
    contextData: []
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);

  const [debouncedFilters, setDebouncedFilters] = useState(filters);

  const debouncedFilterChange = useDebouncedCallback((newFilters) => {
    setDebouncedFilters(newFilters);
  }, 500);

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    debouncedFilterChange(newFilters);
  }, [debouncedFilterChange]);

  const handleWashQualityFilterChange = useCallback((quality) => {
    setWashQualityFilter(prev => ({
      ...prev,
      [quality]: !prev[quality]
    }));
  }, []);

  const handleWashLayerToggle = useCallback((layer) => {
    setVisibleWashLayers(prev => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  }, []);

  const handleMobileClose = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const handleMobileSidebarToggle = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (initialLoading) {
          setInitialLoading(true);
        } else {
          setDataLoading(true);
        }
        setError(null);

        const params = new URLSearchParams();
        if (debouncedFilters.year) params.append('year', debouncedFilters.year);
        if (debouncedFilters.county) params.append('county', debouncedFilters.county);
        if (debouncedFilters.subCounty) params.append('subCounty', debouncedFilters.subCounty);
        if (debouncedFilters.ward) params.append('ward', debouncedFilters.ward);
        if (debouncedFilters.iotUnit !== null && debouncedFilters.iotUnit !== undefined) {
          params.append('iotUnit', debouncedFilters.iotUnit === true ? 'yes' : debouncedFilters.iotUnit === false ? 'no' : debouncedFilters.iotUnit);
        }

        const response = await fetch(`/api/dashboard-data?${params}`);
        const result = await response.json();
        
        if (response.ok) {
          setData(result);
        } else {
          setError(result.error);
        }
      } catch (error) {
        setError(error.message);
      } finally {
        setInitialLoading(false);
        setDataLoading(false);
      }
    };

    fetchData();
  }, [debouncedFilters, initialLoading]);

  const headerMetrics = useMemo(() => data.headerMetrics, [data.headerMetrics]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p>Error loading data: {error}</p>
          <p className="text-sm mt-2">Please check the console for details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <Navigation 
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      
      {/* Sidebar - Fixed on Desktop */}
      <Sidebar 
        filters={filters}
        onFilterChange={handleFilterChange}
        isMobileOpen={isSidebarOpen}
        onMobileClose={handleMobileClose}
        visibleWashLayers={visibleWashLayers}
        onWashLayerToggle={handleWashLayerToggle}
        washQualityFilter={washQualityFilter}
        onWashQualityFilterChange={handleWashQualityFilterChange}
      />
      
      {/* Main Content - Pushed to the right on desktop */}
      <div className="lg:pl-80">
        {/* Mobile sidebar toggle */}
        <div className="lg:hidden p-4 bg-white border-b">
          <button 
            onClick={handleMobileSidebarToggle}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <Menu size={20} />
            <span>Filters & Export</span>
          </button>
        </div>

        {/* Header */}
        <Header 
          {...headerMetrics} 
          trends={data.headerMetrics?.trends || {}}
          filters={debouncedFilters} 
          isLoading={dataLoading} 
        />
        
        {/* Main Content */}
        <main className="p-4 md:p-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
            {/* Map Section */}
            <div className="xl:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-96 xl:h-[600px] overflow-hidden relative">
                {dataLoading && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 z-10 flex items-center justify-center">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="text-sm text-gray-600">Updating map...</span>
                    </div>
                  </div>
                )}
                <Map 
                  filters={debouncedFilters} 
                  visibleWashLayers={visibleWashLayers}
                  washQualityFilter={washQualityFilter}
                />
              </div>
            </div>

            {/* Charts Column */}
            <div className="xl:col-span-1">
              <div className="h-96 xl:h-[600px] overflow-y-auto space-y-2 md:space-y-3 pr-2">
                {/* Contextual Chart */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 relative">
                  {dataLoading && (
                    <div className="absolute inset-0 bg-white bg-opacity-75 z-10 flex items-center justify-center rounded-xl">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-xs text-gray-600">Updating...</span>
                      </div>
                    </div>
                  )}
                  <ContextualChart data={data.contextData} />
                </div>

                {/* Charts */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 relative">
                  {dataLoading && (
                    <div className="absolute inset-0 bg-white bg-opacity-75 z-10 flex items-center justify-center rounded-xl">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-xs text-gray-600">Updating...</span>
                      </div>
                    </div>
                  )}
                  <Charts data={data.chartData} />
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}