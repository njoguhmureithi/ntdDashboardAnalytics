// app/partners/page.js
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Navigation from '../../components/Navigation';
import PartnersHeader from '../../components/PartnersHeader';
import Footer from '../../components/Footer';
import WashTrendsCharts from '../../components/WashTrendsCharts';
import ExportModal from '../../components/ExportModal';
import { useDebouncedCallback } from 'use-debounce';
import dynamic from 'next/dynamic';
import { Download } from 'lucide-react';

const ChoroplethMap = dynamic(() => import('../../components/ChoroplethMap'), { 
  ssr: false,
  loading: () => <div className="h-full bg-gray-100 rounded-lg flex items-center justify-center">Loading map...</div>
});

// Target counties for Western Kenya - memoized outside component
const TARGET_COUNTIES = [
  'Vihiga County',
  'Bungoma County', 
  'Trans Nzoia County',
  'Kakamega County'
];

// Interventions - memoized outside component
// Based on actual activityCodes in the database and their display names
const INTERVENTIONS = {
  wasp: [
    { code: 'W_BOREHOLE', name: 'Borehole drilling/rehabilitation' },
    { code: 'W_PIPED_SCHEMES', name: 'Piped water schemes' },
    { code: 'W_SPRING_PROTECT', name: 'Protection of springs/catchments' },
    { code: 'W_TREATMENT', name: 'Water treatment (chlorination/filters)' },
    { code: 'S_COMMUNITY_LATRINES', name: 'Community latrine/toilet construction/upgrading' },
    { code: 'S_SCHOOL_LATRINES', name: 'School latrine/toilet construction/upgrading' },
    { code: 'S_SOLID_WASTE', name: 'Solid waste management initiatives' },
    { code: 'H_BCC', name: 'Hygiene behaviour change campaigns' },
    { code: 'H_HANDWASH_STATIONS', name: 'Handwashing stations / hygiene kits' }
  ],
  ntd: [
    { code: 'N_MDA', name: 'Mass Drug Administration (MDA)' },
    { code: 'N_SURVEILLANCE', name: 'Disease surveillance / case finding' },
    { code: 'N_HEALTH_EDU', name: 'Health education / awareness creation' },
    { code: 'N_MORBIDITY', name: 'Morbidity management' }
  ]
};

export default function PartnersDashboard() {
  const [filters, setFilters] = useState({
    year: '2025',
    county: '',
    subcounty: '',
    ward: '',
    diseases: ['STH', 'Schisto']
  });
  const [loading, setLoading] = useState(true);
  const [partnersData, setPartnersData] = useState({ wasp: [], ntd: [] });
  const [washIndicators, setWashIndicators] = useState({ water: 0, sanitation: 0, hygiene: 0 });
  const [prevalence, setPrevalence] = useState({ sth: 0, schisto: 0 });
  const [washTrends, setWashTrends] = useState({});
  const [prevalenceTrends, setPrevalenceTrends] = useState({});
  const [selectedInterventions, setSelectedInterventions] = useState({
    wasp: null,
    ntd: null
  });
  const [showExportModal, setShowExportModal] = useState(false);

  // Use refs to track in-flight requests and prevent duplicates
  const fetchingRef = useRef(false);
  const lastFetchParamsRef = useRef(null);

  const fetchPartnersDataWithInterventions = useCallback(async (currentFilters, interventions) => {
    // Create a unique key for this fetch request
    const fetchKey = JSON.stringify({
      filters: currentFilters,
      interventions: interventions
    });

    // Skip if already fetching with the same parameters
    if (fetchingRef.current && lastFetchParamsRef.current === fetchKey) {
      return;
    }

    fetchingRef.current = true;
    lastFetchParamsRef.current = fetchKey;

    try {
      const params = new URLSearchParams();
      if (currentFilters.year) params.append('year', currentFilters.year);
      if (currentFilters.county) params.append('county', currentFilters.county);
      if (currentFilters.subcounty) params.append('subcounty', currentFilters.subcounty);
      if (currentFilters.ward) params.append('ward', currentFilters.ward);

      // Add target counties filter
      TARGET_COUNTIES.forEach(county => {
        params.append('counties', county);
      });

      // Fetch WASH partners with intervention filter
      const waspParams = new URLSearchParams(params);
      waspParams.append('sector', 'WATER');
      if (interventions?.wasp) {
        waspParams.append('activityCode', interventions.wasp);
      }
      const waspResponse = await fetch(`/api/partners?${waspParams}`);
      const waspData = await waspResponse.json();

      // Fetch NTD partners with intervention filter
      const ntdParams = new URLSearchParams(params);
      ntdParams.append('sector', 'NTD');
      if (interventions?.ntd) {
        ntdParams.append('activityCode', interventions.ntd);
      }
      const ntdResponse = await fetch(`/api/partners?${ntdParams}`);
      const ntdData = await ntdResponse.json();
      
      // Reduced logging to prevent console spam
      // console.log('WASH Partners Response:', { 
      //   intervention: interventions?.wasp, 
      //   count: waspData.partners?.length || 0,
      //   sample: waspData.partners?.slice(0, 3)
      // });
      // console.log('NTD Partners Response:', { 
      //   intervention: interventions?.ntd, 
      //   count: ntdData.partners?.length || 0,
      //   sample: ntdData.partners?.slice(0, 3)
      // });

      setPartnersData({
        wasp: waspData.partners || [],
        ntd: ntdData.partners || []
      });
    } catch (error) {
      console.error('Error fetching partners data:', error);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Fetch WASH indicators and prevalence data
  const fetchDashboardMetrics = useCallback(async (currentFilters) => {
    try {
      const params = new URLSearchParams();
      if (currentFilters.year) params.append('year', currentFilters.year);
      if (currentFilters.county) params.append('county', currentFilters.county);
      if (currentFilters.subcounty) params.append('subCounty', currentFilters.subcounty);
      if (currentFilters.ward) params.append('ward', currentFilters.ward);

      const response = await fetch(`/api/dashboard-data?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.headerMetrics) {
          setWashIndicators({
            water: data.headerMetrics.water || 0,
            sanitation: data.headerMetrics.sanitation || 0,
            hygiene: data.headerMetrics.hygiene || 0
          });
          setPrevalence({
            sth: data.headerMetrics.sthPrevalence || 0,
            schisto: data.headerMetrics.schistoPrevalence || 0
          });
          // Set trend data
          if (data.headerMetrics.trends) {
            setPrevalenceTrends(data.headerMetrics.trends);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
    }
  }, []);

  // Fetch WASH trends data
  const fetchWashTrends = useCallback(async (currentFilters) => {
    try {
      const params = new URLSearchParams();
      if (currentFilters.year) params.append('year', currentFilters.year);
      if (currentFilters.county) params.append('county', currentFilters.county);
      if (currentFilters.subcounty) params.append('subcounty', currentFilters.subcounty);
      if (currentFilters.ward) params.append('ward', currentFilters.ward);

      const response = await fetch(`/api/wash-trends?${params}`);
      if (response.ok) {
        const data = await response.json();
        setWashTrends(data);
      }
    } catch (error) {
      console.error('Error fetching WASH trends:', error);
    }
  }, []);

  // Use a ref to always access the latest selectedInterventions
  const selectedInterventionsRef = useRef(selectedInterventions);
  useEffect(() => {
    selectedInterventionsRef.current = selectedInterventions;
  }, [selectedInterventions]);

  // Memoize the debounced callback - it will use the ref to get latest interventions
  const debouncedFilterChange = useDebouncedCallback(
    (newFilters) => {
      fetchPartnersDataWithInterventions(newFilters, selectedInterventionsRef.current);
      fetchDashboardMetrics(newFilters);
      fetchWashTrends(newFilters);
    },
    500
  );

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters);
    debouncedFilterChange(newFilters);
  }, [debouncedFilterChange]);

  const handleInterventionSelect = useCallback((sector, interventionCode) => {
    setSelectedInterventions(prev => {
      const newSelectedInterventions = {
        ...prev,
        [sector]: prev[sector] === interventionCode ? null : interventionCode
      };
      
      // Refetch partners data with the new intervention filter
      fetchPartnersDataWithInterventions(filters, newSelectedInterventions);
      
      return newSelectedInterventions;
    });
  }, [filters, fetchPartnersDataWithInterventions]);

  const getFilteredPartners = (sector) => {
    const partners = sector === 'wasp' ? partnersData.wasp : partnersData.ntd;
    
    if (!partners || partners.length === 0) {
      return [];
    }
    
    // Note: API already filters by activityCode when an intervention is selected
    // So we don't need to filter again here - just return unique partner names
    
    // Return unique partner names only
    const uniquePartners = [];
    const seenNames = new Set();
    
    partners.forEach(partner => {
      const partnerName = partner.partnerName?.trim();
      if (partnerName && !seenNames.has(partnerName.toLowerCase())) {
        seenNames.add(partnerName.toLowerCase());
        uniquePartners.push({ partnerName });
      }
    });
    
    // Sort alphabetically by partner name
    return uniquePartners.sort((a, b) => 
      a.partnerName.localeCompare(b.partnerName)
    );
  };

  // Calculate unique partner counts based on location filters
  const getUniquePartnerCount = (sector) => {
    const partners = sector === 'wasp' ? partnersData.wasp : partnersData.ntd;
    const seenNames = new Set();
    
    partners.forEach(partner => {
      const partnerName = partner.partnerName?.trim();
      if (partnerName) {
        seenNames.add(partnerName.toLowerCase());
      }
    });
    
    return seenNames.size;
  };

  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      await Promise.all([
        fetchPartnersDataWithInterventions(filters, selectedInterventions),
        fetchDashboardMetrics(filters),
        fetchWashTrends(filters)
      ]);
      
      if (mounted) {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Calculate header metrics from partners data
  const washPartnerCount = useMemo(() => getUniquePartnerCount('wasp'), [partnersData.wasp]);
  const ntdPartnerCount = useMemo(() => getUniquePartnerCount('ntd'), [partnersData.ntd]);
  
  const headerMetrics = useMemo(() => ({
    washPartners: washPartnerCount,
    ntdPartners: ntdPartnerCount,
    washIndicators: washIndicators,
    sthPrevalence: prevalence.sth,
    schistoPrevalence: prevalence.schisto,
    genderStatusIndex: washTrends.genderStatusIndex || {}
  }), [washPartnerCount, ntdPartnerCount, washIndicators, prevalence, washTrends]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation filters={filters} onFilterChange={handleFilterChange} />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading partners data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation filters={filters} onFilterChange={handleFilterChange} />
      
      <div className="flex">
        <main className="flex-1">
          <PartnersHeader 
            washPartners={headerMetrics.washPartners}
            ntdPartners={headerMetrics.ntdPartners}
            washIndicators={headerMetrics.washIndicators}
            sthPrevalence={headerMetrics.sthPrevalence}
            schistoPrevalence={headerMetrics.schistoPrevalence}
            genderStatusIndex={headerMetrics.genderStatusIndex}
            trends={prevalenceTrends}
          />
          
          <div className="px-6 py-8">
            {/* Maps and Charts Row */}
            <div className="mb-8">
              <div className="flex flex-col md:flex-row gap-6">
                {/* WASH Map */}
                <div className="flex-1 flex flex-col">
                  <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                      <h3 className="text-base font-bold text-gray-900">WASH Partners Distribution</h3>
                    </div>
                    <div className="h-[450px] relative">
                      <ChoroplethMap
                        dataType="wasp"
                        boundaryType="ward"
                        counties={TARGET_COUNTIES}
                        filters={filters}
                        selectedIntervention={selectedInterventions.wasp}
                        interventions={INTERVENTIONS.wasp}
                        onInterventionSelect={(code) => handleInterventionSelect('wasp', code)}
                      />
                    </div>
                  </div>
                  {/* WASH Partners List Below Map */}
                  <div className="mt-4 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-blue-50 px-3 py-2 border-b border-blue-200 flex-shrink-0">
                      <h4 className="text-xs font-semibold text-gray-900">WASH Partners</h4>
                      <p className="text-xs text-gray-500">
                        {getFilteredPartners('wasp').length} partner{getFilteredPartners('wasp').length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: '200px', scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <div className="p-2 space-y-1">
                        {getFilteredPartners('wasp').map((partner, index) => (
                          <div 
                            key={`wasp-${index}-${partner.partnerName || index}`} 
                            className="px-2 py-1.5 bg-white rounded border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs font-medium text-gray-900"
                          >
                            {partner.partnerName || 'Unknown Partner'}
                          </div>
                        ))}
                        {getFilteredPartners('wasp').length === 0 && (
                          <div className="text-center py-4 text-gray-500 text-xs">
                            {selectedInterventions.wasp 
                              ? 'No partners found' 
                              : 'No WASH partners'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* NTD Map */}
                <div className="flex-1 flex flex-col">
                  <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    <div className="bg-green-50 px-4 py-3 border-b border-green-200">
                      <h3 className="text-base font-bold text-gray-900">NTD Partners Distribution</h3>
                    </div>
                    <div className="h-[450px] relative">
                      <ChoroplethMap
                        dataType="ntd"
                        boundaryType="ward"
                        counties={TARGET_COUNTIES}
                        filters={filters}
                        selectedIntervention={selectedInterventions.ntd}
                        interventions={INTERVENTIONS.ntd}
                        onInterventionSelect={(code) => handleInterventionSelect('ntd', code)}
                      />
                    </div>
                  </div>
                  {/* NTD Partners List Below Map */}
                  <div className="mt-4 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col">
                    <div className="bg-green-50 px-3 py-2 border-b border-green-200 flex-shrink-0">
                      <h4 className="text-xs font-semibold text-gray-900">NTD Partners</h4>
                      <p className="text-xs text-gray-500">
                        {getFilteredPartners('ntd').length} partner{getFilteredPartners('ntd').length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: '200px', scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <div className="p-2 space-y-1">
                        {getFilteredPartners('ntd').map((partner, index) => (
                          <div 
                            key={`ntd-${index}-${partner.partnerName || index}`} 
                            className="px-2 py-1.5 bg-white rounded border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors text-xs font-medium text-gray-900"
                          >
                            {partner.partnerName || 'Unknown Partner'}
                          </div>
                        ))}
                        {getFilteredPartners('ntd').length === 0 && (
                          <div className="text-center py-4 text-gray-500 text-xs">
                            {selectedInterventions.ntd 
                              ? 'No partners found' 
                              : 'No NTD partners'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* WASH Trends Charts */}
                <div className="flex-1 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col" style={{ height: '850px' }}>
                  <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                    <div className="p-4 pb-8">
                      <WashTrendsCharts trendsData={washTrends} />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Export Button - Below Partner Lists */}
              <div className="flex justify-center mt-6 mb-4">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 transition-colors duration-200"
                >
                  <Download size={20} />
                  <span className="font-medium">Export Data</span>
                </button>
              </div>
            </div>

          </div>
          
          <Footer />
        </main>
      </div>
      
      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        initialFilters={filters}
        exportEndpoint="/api/partners-export"
      />
    </div>
  );
}