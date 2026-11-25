// components/ChoroplethMap.js
'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

export default function ChoroplethMap({ boundaryType, dataType, filters, counties, selectedIntervention, interventions, onInterventionSelect }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapInitialized = useRef(false);
  const initRetryRef = useRef(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [boundaryData, setBoundaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [partnerData, setPartnerData] = useState([]);
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false);
  const currentPopupRef = useRef(null);
  const partnerDataFetchRef = useRef(null);
  const flyToInProgressRef = useRef(false);
  const lastFlyToFilterRef = useRef(null);
  const layerUpdateInProgressRef = useRef(false);
  const lastProcessedDataRef = useRef(null);
  const layerUpdateTimeoutRef = useRef(null);

  // Western Kenya bounds for consistency
  const WESTERN_KENYA_BOUNDS = [[33.5, -0.5], [36.0, 2.0]];

  // Color scales for different data types - Blue for WASH, Green for NTD
  const colorScales = {
    wasp: {
      low: '#DBEAFE',      // Light blue
      medium: '#93C5FD',   // Medium blue
      high: '#3B82F6',     // Blue
      veryHigh: '#1E40AF'  // Dark blue
    },
    ntd: {
      low: '#DCFCE7',      // Light green
      medium: '#86EFAC',   // Medium green
      high: '#22C55E',     // Green
      veryHigh: '#15803D'  // Dark green
    }
  };

  // Track if boundary data is being fetched to prevent duplicate requests
  const fetchingBoundaryRef = useRef(false);
  
  // Fetch boundary data
  const fetchBoundaryData = async () => {
    // Prevent duplicate fetches
    if (fetchingBoundaryRef.current) {
      return;
    }
    
    try {
      fetchingBoundaryRef.current = true;
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('type', boundaryType);
      
      // Add each county separately
      if (counties && counties.length > 0) {
        counties.forEach(county => {
          params.append('counties', county);
        });
      }

      const response = await fetch(`/api/boundaries?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch boundary data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        // Initialize partnerCount to 0 for all features if not already set
        const initializedData = {
          ...data,
          features: data.features.map(feature => ({
            ...feature,
            properties: {
              ...feature.properties,
              partnerCount: feature.properties.partnerCount || 0,
              hasData: feature.properties.hasData || false
            }
          }))
        };
        setBoundaryData(initializedData);
      } else {
        setError('No boundary data found for the selected area');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
      fetchingBoundaryRef.current = false;
    }
  };

  // Track in-flight fetch to prevent duplicates
  const fetchInProgressRef = useRef(false);
  const lastFetchParamsRef = useRef(null);

  // Fetch partner data for choropleth
  const fetchPartnerData = async () => {
    // Create a unique key for this fetch request
    const params = new URLSearchParams();
    params.append('sector', dataType === 'wasp' ? 'WATER' : 'NTD');
    
    if (filters?.year) params.append('year', filters.year);
    if (filters?.county) params.append('county', filters.county);
    // Handle both subcounty and subCounty property names
    const subcountyFilter = filters?.subcounty || filters?.subCounty;
    if (subcountyFilter) params.append('subcounty', subcountyFilter);
    if (filters?.ward) params.append('ward', filters.ward);
    if (selectedIntervention) params.append('activityCode', selectedIntervention);
    
    // Add counties filter
    if (counties && counties.length > 0) {
      counties.forEach(county => {
        params.append('counties', county);
      });
    }

    const fetchKey = params.toString();

    // Skip if already fetching with the same parameters
    if (fetchInProgressRef.current && lastFetchParamsRef.current === fetchKey) {
      return;
    }

    fetchInProgressRef.current = true;
    lastFetchParamsRef.current = fetchKey;

    try {
      const response = await fetch(`/api/partners?${params}`);
      if (response.ok) {
        const data = await response.json();
        const partners = data.partners || [];
        setPartnerData(partners);
                           
        // Always process data for choropleth, even if partners array is empty
        if (boundaryData) {
          processChoroplethData(partners);
        }
      } else {
        const errorText = await response.text();
        console.error('Partner API error:', response.status, errorText);
        // Even on error, process with empty partners to initialize boundaries
        if (boundaryData) {
          processChoroplethData([]);
        }
      }
    } catch (error) {
      console.error('Error fetching partner data:', error);
      // Even on error, process with empty partners to initialize boundaries
      if (boundaryData) {
        processChoroplethData([]);
      }
    } finally {
      fetchInProgressRef.current = false;
    }
  };

  // Normalize name for matching (remove common suffixes, normalize spaces)
  const normalizeBoundaryName = (name) => {
    if (!name) return '';
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .replace(/\s+ward\s*$/i, '') // Remove trailing " Ward" or " ward"
      .replace(/\s+subcounty\s*$/i, '') // Remove trailing " Subcounty"
      .replace(/['"]/g, '') // Remove quotes
      .trim();
  };

  // Try multiple matching strategies for ward names
  const matchBoundaryName = (boundaryName, partnerName) => {
    if (!boundaryName || !partnerName) return false;
    
    const normalizedBoundary = normalizeBoundaryName(boundaryName);
    const normalizedPartner = normalizeBoundaryName(partnerName);
    
    // Exact match
    if (normalizedBoundary === normalizedPartner) return true;
    
    // Check if one contains the other (handles variations like "North Mara" vs "North Mara Ward")
    if (normalizedBoundary.includes(normalizedPartner) || normalizedPartner.includes(normalizedBoundary)) {
      // But make sure it's not just a partial word match
      const boundaryWords = normalizedBoundary.split(/\s+/);
      const partnerWords = normalizedPartner.split(/\s+/);
      // If most words match, consider it a match
      const matchingWords = boundaryWords.filter(w => partnerWords.includes(w)).length;
      if (matchingWords >= Math.min(boundaryWords.length, partnerWords.length) * 0.7) {
        return true;
      }
    }
    
    return false;
  };

  // Create a hash of boundary data to detect actual changes
  const getBoundaryDataHash = (data) => {
    if (!data || !data.features) return null;
    // Create a hash based on feature count and all partner counts
    const featureCount = data.features.length;
    const partnerCounts = data.features
      .map(f => f.properties?.partnerCount || 0)
      .sort((a, b) => a - b)
      .join(',');
    return `${featureCount}-${partnerCounts}`;
  };

  // Process data for choropleth visualization
  const processChoroplethData = (partners) => {
    if (!boundaryData) {
      console.log('processChoroplethData: No boundary data available');
      return;
    }
    
    // Ensure map is ready before processing
    if (!mapRef.current || !mapLoaded) {
      return;
    }

    // Reduced logging to prevent console spam
    // console.log(`processChoroplethData: Processing ${partners?.length || 0} partners for ${boundaryType} level`);

    // Initialize partner counts - default to 0 for all boundaries
    const partnerCounts = {};
    
    // Count unique partners per boundary (not activities)
    // For wards, use multiple keys (wardCode, wardName, ward ID) for better matching
    if (partners && partners.length > 0) {
      const uniquePartnersByBoundary = new Map();
      
      partners.forEach(partner => {
        const partnerName = partner.partnerName?.trim().toLowerCase();
        if (!partnerName) return;
        
        if (boundaryType === 'ward') {
          // Store partner under multiple possible keys for matching flexibility
          const keys = [];
          
          // Key 1: wardCode (should be KE_Ward_XXXX from join, or original pi.ward)
          if (partner.wardCode) {
            keys.push(partner.wardCode.trim());
            keys.push(partner.wardCode.trim().toLowerCase());
          }
          
          // Key 2: wardName (original pi.ward - could be ID or name)
          if (partner.wardName) {
            keys.push(String(partner.wardName).trim());
            keys.push(String(partner.wardName).trim().toLowerCase());
          }
          
          // Add partner to all possible keys
          keys.forEach(key => {
            if (!uniquePartnersByBoundary.has(key)) {
              uniquePartnersByBoundary.set(key, new Set());
            }
            uniquePartnersByBoundary.get(key).add(partnerName);
          });
        } else {
          // For subcounty-level: use subcountyName
          const key = partner.subcountyName?.trim();
          if (key) {
            if (!uniquePartnersByBoundary.has(key)) {
              uniquePartnersByBoundary.set(key, new Set());
            }
            uniquePartnersByBoundary.get(key).add(partnerName);
          }
        }
      });
      
      // Convert sets to counts
      uniquePartnersByBoundary.forEach((partnerSet, normalizedKey) => {
        partnerCounts[normalizedKey] = partnerSet.size;
      });
      
      // Reduced logging
      // console.log(`Processed ${Object.keys(partnerCounts).length} unique boundary keys with partner data`);
      // console.log('Sample partner keys:', Array.from(uniquePartnersByBoundary.keys()).slice(0, 10));
    }

    // Update boundary data with partner counts (improved matching)
    let matchedCount = 0;
    const unmatchedPartners = [];
    
    const updatedFeatures = boundaryData.features.map(feature => {
      const boundaryName = feature.properties.name;
      const boundaryCode = feature.properties.code; // Ward/subcounty code from boundaries (KE_Ward_XXXX)
      const boundaryId = feature.properties.id; // Ward ID from boundaries (for matching with partner.ward)
      
      let count = 0;
      
      // For ward-level: try multiple matching strategies
      if (boundaryType === 'ward') {
        const normalizedBoundaryName = normalizeBoundaryName(boundaryName);
        
        // Strategy 1: Match by boundary ID (most reliable - pi.ward contains IDs)
        if (boundaryId && count === 0) {
          const idStr = String(boundaryId);
          const idVariations = [
            idStr,
            idStr.trim(),
            idStr.toLowerCase(),
            idStr.trim().toLowerCase()
          ];
          for (const variation of idVariations) {
            if (partnerCounts[variation]) {
              count = partnerCounts[variation];
              break;
            }
          }
        }
        
        // Strategy 2: Try matching by boundary code (KE_Ward_XXXX format)
        if (count === 0 && boundaryCode) {
          const codeVariations = [
            boundaryCode,
            boundaryCode.trim(),
            boundaryCode.toLowerCase(),
            boundaryCode.trim().toLowerCase()
          ];
          for (const variation of codeVariations) {
            if (partnerCounts[variation]) {
              count = partnerCounts[variation];
              break;
            }
          }
        }
        
        // Strategy 3: Try matching by normalized ward name
        if (count === 0) {
          const nameVariations = [
            normalizedBoundaryName,
            normalizedBoundaryName.toLowerCase(),
            boundaryName.trim().toLowerCase()
          ];
          for (const variation of nameVariations) {
            if (partnerCounts[variation]) {
              count = partnerCounts[variation];
              break;
            }
          }
        }
        
        // Strategy 4: Try name variations
        if (count === 0 && Object.keys(partnerCounts).length > 0) {
          const variations = [
            normalizedBoundaryName,
            normalizedBoundaryName.replace(/\s+/g, ''),
            normalizedBoundaryName.replace(/[^a-z0-9]/g, ''),
            boundaryName.trim().toLowerCase(),
            boundaryName.trim().toLowerCase().replace(/\s+/g, ' '),
          ];
          
          for (const variation of variations) {
            if (partnerCounts[variation]) {
              count = partnerCounts[variation];
              break;
            }
          }
        }
        
        // Strategy 5: Direct matching from partners array by ID (most important!)
        // partner.wardName contains the ID that should match boundary.id
        if (count === 0 && partners && partners.length > 0 && boundaryId) {
          const matchedPartnerNames = new Set();
          const idStr = String(boundaryId);
          partners.forEach(partner => {
            // partner.wardName is the original ID from pi.ward (like 'zkVfk8cWPc2')
            // partner.wardCode might be the joined code if join worked, or same as wardName
            const partnerWardId = partner.wardName || partner.wardCode;
            if (partnerWardId) {
              // Try exact match first
              if (partnerWardId === idStr || partnerWardId.trim() === idStr.trim()) {
                const partnerName = partner.partnerName?.trim().toLowerCase();
                if (partnerName) {
                  matchedPartnerNames.add(partnerName);
                }
              }
              // Also try if wardCode from join matches (if join worked)
              if (partner.wardCode && partner.wardCode !== partner.wardName) {
                if (partner.wardCode === idStr || partner.wardCode.trim() === idStr.trim()) {
                  const partnerName = partner.partnerName?.trim().toLowerCase();
                  if (partnerName) {
                    matchedPartnerNames.add(partnerName);
                  }
                }
              }
            }
          });
          
          if (matchedPartnerNames.size > 0) {
            count = matchedPartnerNames.size;
            matchedCount += matchedPartnerNames.size;
            // Reduced logging
            // console.log(`✅ Matched boundary ${boundaryName} (ID: ${boundaryId}) with ${matchedPartnerNames.size} partners`);
          }
        }
        
        // Strategy 6: Direct matching from partners array by code
        if (count === 0 && partners && partners.length > 0 && boundaryCode) {
          const matchedPartnerNames = new Set();
          partners.forEach(partner => {
            const partnerCode = partner.wardCode;
            if (partnerCode && (partnerCode === boundaryCode || partnerCode.trim() === boundaryCode.trim())) {
              const partnerName = partner.partnerName?.trim().toLowerCase();
              if (partnerName) {
                matchedPartnerNames.add(partnerName);
              }
            }
          });
          
          if (matchedPartnerNames.size > 0) {
            count = matchedPartnerNames.size;
            matchedCount += matchedPartnerNames.size;
          }
        }
        
        // Strategy 7: Match by ward name from partners (if wardName exists and matches)
        if (count === 0 && partners && partners.length > 0) {
          const matchedPartnerNames = new Set();
          partners.forEach(partner => {
            const partnerWardName = partner.wardName;
            if (partnerWardName && matchBoundaryName(boundaryName, partnerWardName)) {
              const partnerName = partner.partnerName?.trim().toLowerCase();
              if (partnerName) {
                matchedPartnerNames.add(partnerName);
              }
            }
          });
          
          if (matchedPartnerNames.size > 0) {
            count = matchedPartnerNames.size;
            matchedCount += matchedPartnerNames.size;
          }
        }
      } else {
        // For subcounty-level: match by name
        const normalizedBoundaryName = normalizeBoundaryName(boundaryName);
        count = partnerCounts[normalizedBoundaryName] || 0;
        
        // Try variations if no match
        if (count === 0 && Object.keys(partnerCounts).length > 0) {
          const variations = [
            normalizedBoundaryName,
            normalizedBoundaryName.replace(/\s+/g, ''),
            normalizedBoundaryName.replace(/[^a-z0-9]/g, ''),
            boundaryName.trim().toLowerCase(),
          ];
          
          for (const variation of variations) {
            if (partnerCounts[variation]) {
              count = partnerCounts[variation];
              break;
            }
          }
        }
        
        // Fuzzy matching for subcounties
        if (count === 0 && partners && partners.length > 0) {
          const matchedPartnerNames = new Set();
          partners.forEach(partner => {
            if (partner.subcountyName && matchBoundaryName(boundaryName, partner.subcountyName)) {
              const partnerName = partner.partnerName?.trim().toLowerCase();
              if (partnerName) {
                matchedPartnerNames.add(partnerName);
              }
            }
          });
          
          if (matchedPartnerNames.size > 0) {
            count = matchedPartnerNames.size;
            matchedCount += matchedPartnerNames.size;
          }
        }
      }
      
      // Track unmatched for debugging
      if (count === 0 && unmatchedPartners.length < 3) {
        const samplePartner = partners?.find(p => {
          if (boundaryType === 'ward') {
            return p.wardCode || p.wardName;
          } else {
            return p.subcountyName;
          }
        });
        if (samplePartner) {
          unmatchedPartners.push({
            boundary: boundaryName,
            boundaryCode: boundaryCode,
            boundaryId: boundaryId,
            partner: boundaryType === 'ward' 
              ? (samplePartner.wardCode || samplePartner.wardName)
              : samplePartner.subcountyName,
            partnerCode: samplePartner.wardCode,
            partnerWardId: samplePartner.wardName
          });
        }
      }
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          partnerCount: count,
          hasData: count > 0
        }
      };
    });
    
    // Log matching statistics (reduced logging)
    const totalWithData = updatedFeatures.filter(f => f.properties.partnerCount > 0).length;
    // console.log(`Choropleth matching results:`, {
    //   totalBoundaries: updatedFeatures.length,
    //   boundariesWithData: totalWithData,
    //   totalPartners: partners?.length || 0,
    //   matchedPartners: matchedCount,
    //   unmatchedExamples: unmatchedPartners.slice(0, 5)
    // });

    const updatedBoundaryData = {
      ...boundaryData,
      features: updatedFeatures
    };
    
    const maxPartnerCount = Math.max(...updatedFeatures.map(f => f.properties.partnerCount || 0));
    // Reduced logging - only log if there's an issue
    if (totalWithData === 0 && partners && partners.length > 0) {
      console.warn(`⚠️ No boundaries matched with partner data (${partners.length} partners available)`);
    }
    
    // Log sample names for debugging matching (only if no matches)
    if (totalWithData === 0 && partners && partners.length > 0) {
      const sampleBoundaries = updatedFeatures.slice(0, 5).map(f => ({
        name: f.properties.name,
        code: f.properties.code,
        id: f.properties.id
      }));
      const samplePartners = partners.slice(0, 5).map(p => ({
        wardCode: p.wardCode,
        wardName: p.wardName,
        subcountyName: p.subcountyName
      }));
      console.log('Sample boundaries:', sampleBoundaries);
      console.log('Sample partners:', samplePartners);
      console.log('Boundary IDs:', sampleBoundaries.map(b => b.id));
      console.log('Boundary codes:', sampleBoundaries.map(b => b.code));
      console.log('Partner ward codes (should match boundary ID):', samplePartners.map(p => p.wardCode));
      console.log('Partner ward names (original IDs):', samplePartners.map(p => p.wardName));
      
      // Try to see if any match
      sampleBoundaries.forEach(b => {
        const matchingPartner = samplePartners.find(p => 
          p.wardCode === String(b.id) || 
          p.wardName === String(b.id) ||
          p.wardCode === b.code ||
          p.wardName === b.code
        );
        if (matchingPartner) {
          console.log(`✅ Found match: Boundary ${b.name} (ID: ${b.id}, Code: ${b.code}) matches partner ward ${matchingPartner.wardCode || matchingPartner.wardName}`);
        }
      });
    }
    
    // Create hash to check if data actually changed
    const dataHash = getBoundaryDataHash(updatedBoundaryData);
    if (dataHash === lastProcessedDataRef.current) {
      // Data hasn't changed, skip update to prevent flickering
      return;
    }
    lastProcessedDataRef.current = dataHash;
    
    // Instead of updating state (which triggers useEffect), directly update the map source
    // This prevents the flickering cycle
    if (mapRef.current && mapLoaded) {
      const sourceId = 'choropleth-source';
      const source = mapRef.current.getSource(sourceId);
      
      if (source) {
        // Source exists, update it directly without triggering state updates
        // Ensure all features have partnerCount property
        const processedData = {
          ...updatedBoundaryData,
          features: updatedBoundaryData.features.map(feature => ({
            ...feature,
            properties: {
              ...feature.properties,
              partnerCount: feature.properties.partnerCount ?? 0,
              hasData: feature.properties.hasData ?? false
            }
          }))
        };
        
        // Update source data directly - this is more efficient and prevents flickering
        source.setData(processedData);
        
        // Update boundaryData state only if source doesn't exist (for initial load)
        // This ensures state stays in sync but doesn't trigger unnecessary re-renders
        if (!mapRef.current.getLayer('choropleth-layer')) {
          setBoundaryData(updatedBoundaryData);
        }
      } else {
        // Source doesn't exist yet, update state so it gets created on next render
        setBoundaryData(updatedBoundaryData);
      }
    } else {
      // Map not ready, just update state for when it becomes ready
      setBoundaryData(updatedBoundaryData);
    }
  };

  // Get color based on partner count
  const getChoroplethColor = (count) => {
    const scale = colorScales[dataType];
    
    if (count === 0) return 'rgba(200, 200, 200, 0.1)';
    if (count <= 2) return scale.low;
    if (count <= 5) return scale.medium;
    if (count <= 10) return scale.high;
    return scale.veryHigh;
  };

  // Initialize map - only runs once
  useEffect(() => {
    // If already initialized, don't run again
    if (mapInitialized.current) {
      return;
    }

    const tryInitialize = () => {
      // If ref is not ready, retry
      if (!mapContainerRef.current) {
        if (initRetryRef.current < 10) {
          initRetryRef.current += 1;
          setTimeout(tryInitialize, 200);
          return;
        } else {
          setError('Map container initialization failed: container ref not attached');
          return;
        }
      }

      // Check if container has dimensions
      const container = mapContainerRef.current;
      const hasDimensions = container.offsetWidth > 0 && container.offsetHeight > 0;
      
      if (!hasDimensions) {
        if (initRetryRef.current < 15) {
          initRetryRef.current += 1;
          setTimeout(tryInitialize, 300);
          return;
        } else {
          setError('Map container initialization failed: container has no dimensions');
          return;
        }
      }

      // Ready to initialize
      initializeMapInstance();
    };

    const initializeMapInstance = async () => {
      if (mapInitialized.current) return;

      try {
        // Load Mapbox if not already loaded
        if (!window.mapboxgl) {
          const cssLink = document.createElement('link');
          cssLink.rel = 'stylesheet';
          cssLink.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
          document.head.appendChild(cssLink);

          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Mapbox'));
            document.body.appendChild(script);
          });
        }

        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!mapboxToken) {
          setError('Map configuration error: Mapbox token missing');
          return;
        }

        window.mapboxgl.accessToken = mapboxToken;

        if (!mapContainerRef.current) {
          return;
        }

        const map = new window.mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/light-v10',
          center: [34.75, 0.6],
          zoom: 8,
          minZoom: 7,
          maxZoom: 16,
          maxBounds: WESTERN_KENYA_BOUNDS
        });

        mapRef.current = map;
        mapInitialized.current = true;

        map.on('load', () => {
          setMapLoaded(true);
          map.addControl(new window.mapboxgl.NavigationControl(), 'top-right');
          
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.resize();
            }
          }, 100);
          
          // If boundary data is already available, initialize layers immediately
          if (boundaryData && boundaryData.features && boundaryData.features.length > 0) {
            setTimeout(() => {
              initializeMapLayers();
            }, 200);
          }
        });

        map.on('error', (e) => {
          setError(`Map error: ${e.error?.message || 'Unknown error'}`);
        });

        // Close popup on map click
        map.on('click', (e) => {
          if (currentPopupRef.current && !e.originalEvent.defaultPrevented) {
            currentPopupRef.current.remove();
            currentPopupRef.current = null;
          }
        });

        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.resize();
          }
        }, 200);

      } catch (error) {
        setError(`Failed to initialize map: ${error.message}`);
        mapInitialized.current = false;
      }
    };

    tryInitialize();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapInitialized.current = false;
        setMapLoaded(false);
      }
    };
  }, []); // Empty deps - only run once

  // Memoize counties string for stable comparison
  const countiesKey = useMemo(() => {
    return counties && counties.length > 0 ? [...counties].sort().join(',') : '';
  }, [counties]);

  // Memoize filters string for stable comparison
  const filtersKey = useMemo(() => {
    if (!filters) return '';
    const filterKeys = Object.keys(filters).sort();
    return filterKeys.map(key => `${key}:${filters[key]}`).join(',');
  }, [filters]);

  // Fetch data when component mounts or filters change
  useEffect(() => {
    fetchBoundaryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryType, countiesKey]);

  useEffect(() => {
    // Only fetch partner data if map is loaded and boundary data exists
    if (boundaryData && mapLoaded) {
      // Clear any pending fetch
      if (partnerDataFetchRef.current) {
        clearTimeout(partnerDataFetchRef.current);
        partnerDataFetchRef.current = null;
      }
      
      // Clear fetch state when intervention changes to force a fresh fetch
      // This ensures NTD interventions trigger a new data fetch
      lastFetchParamsRef.current = null;
      fetchInProgressRef.current = false;
      
      // Increased debounce to prevent rapid updates and flickering
      const debounceTime = 300; // Increased from 100ms to 300ms to prevent flickering
      partnerDataFetchRef.current = setTimeout(() => {
        // Double-check that we're not already fetching with the same params
        const params = new URLSearchParams();
        params.append('sector', dataType === 'wasp' ? 'WATER' : 'NTD');
        if (filters?.year) params.append('year', filters.year);
        if (filters?.county) params.append('county', filters.county);
        const subcountyFilter = filters?.subcounty || filters?.subCounty;
        if (subcountyFilter) params.append('subcounty', subcountyFilter);
        if (filters?.ward) params.append('ward', filters.ward);
        if (selectedIntervention) params.append('activityCode', selectedIntervention);
        if (counties && counties.length > 0) {
          counties.forEach(county => {
            params.append('counties', county);
          });
        }
        const fetchKey = params.toString();
        
        // Only fetch if params changed or not currently fetching
        if (!fetchInProgressRef.current || lastFetchParamsRef.current !== fetchKey) {
          fetchPartnerData();
        }
        partnerDataFetchRef.current = null;
      }, debounceTime);
      
      return () => {
        if (partnerDataFetchRef.current) {
          clearTimeout(partnerDataFetchRef.current);
          partnerDataFetchRef.current = null;
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryData, filtersKey, dataType, selectedIntervention, mapLoaded, countiesKey]);

  // Fly to filtered location
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !boundaryData) return;
    
    // Ensure boundary data has features before attempting fly-to
    if (!boundaryData.features || boundaryData.features.length === 0) {
      return;
    }

    // Create a unique key for the current filter state
    // Handle both subcounty and subCounty property names
    const subcountyValue = filters?.subcounty || filters?.subCounty || '';
    const filterKey = JSON.stringify({
      county: filters?.county || '',
      subcounty: subcountyValue,
      ward: filters?.ward || ''
    });

    // Skip if we're already flying to the same location or if fly-to is in progress
    if (flyToInProgressRef.current || lastFlyToFilterRef.current === filterKey) {
      return;
    }

    const flyToFilteredLocation = () => {
      if (!filters || !mapRef.current) return;
      
      // Mark fly-to as in progress
      flyToInProgressRef.current = true;
      lastFlyToFilterRef.current = filterKey;

      let bounds = null;
      const features = boundaryData.features || [];

      // Helper function to normalize county names for matching
      const normalizeCountyName = (name) => {
        if (!name) return '';
        return name
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\s*county\s*$/i, '')
          .trim();
      };

      // If ward filter is set, find matching ward
      if (filters.ward) {
        const matchingFeature = features.find(f => {
          const featureName = f.properties?.name || '';
          return featureName.toLowerCase().includes(filters.ward.toLowerCase());
        });
        
        if (matchingFeature && matchingFeature.geometry) {
          bounds = new window.mapboxgl.LngLatBounds();
          if (matchingFeature.geometry.type === 'Polygon') {
            matchingFeature.geometry.coordinates[0].forEach(coord => {
              bounds.extend(coord);
            });
          } else if (matchingFeature.geometry.type === 'MultiPolygon') {
            matchingFeature.geometry.coordinates.forEach(polygon => {
              polygon[0].forEach(coord => {
                bounds.extend(coord);
              });
            });
          }
        }
      } 
      // If subcounty filter is set, find matching subcounty (for ward-level maps, this finds all wards in subcounty)
      // Handle both subcounty and subCounty property names
      else if (filters.subcounty || filters.subCounty) {
        const filterSubcounty = filters.subcounty || filters.subCounty || '';
        const normalizedFilterSubcounty = normalizeBoundaryName(filterSubcounty);
        const matchingFeatures = features.filter(f => {
          const subcountyName = f.properties?.subcounty || '';
          if (!subcountyName) return false;
          const normalizedSubcounty = normalizeBoundaryName(subcountyName);
          return normalizedSubcounty === normalizedFilterSubcounty || 
                 normalizedSubcounty.includes(normalizedFilterSubcounty) ||
                 normalizedFilterSubcounty.includes(normalizedSubcounty);
        });
        
        if (matchingFeatures.length > 0) {
          bounds = new window.mapboxgl.LngLatBounds();
          matchingFeatures.forEach(feature => {
            if (feature.geometry.type === 'Polygon') {
              feature.geometry.coordinates[0].forEach(coord => {
                bounds.extend(coord);
              });
            } else if (feature.geometry.type === 'MultiPolygon') {
              feature.geometry.coordinates.forEach(polygon => {
                polygon[0].forEach(coord => {
                  bounds.extend(coord);
                });
              });
            }
          });
        }
      }
      // If county filter is set, find all features in that county with improved matching
      else if (filters.county) {
        const normalizedFilterCounty = normalizeCountyName(filters.county);
        const matchingFeatures = features.filter(f => {
          // Check county property (from ward_boundaries table)
          const countyName = f.properties?.county || '';
          const normalizedCounty = normalizeCountyName(countyName);
          
          // Try multiple matching strategies
          const exactMatch = normalizedCounty === normalizedFilterCounty;
          const includesMatch = normalizedCounty.includes(normalizedFilterCounty) || 
                                normalizedFilterCounty.includes(normalizedCounty);
          
          // Also check if filter county name contains the boundary county (handles "Vihiga County" vs "Vihiga")
          const reverseMatch = normalizedFilterCounty.includes(normalizedCounty) && 
                               normalizedCounty.length > 0;
          
          return exactMatch || includesMatch || reverseMatch;
        });
        
        if (matchingFeatures.length > 0) {
          bounds = new window.mapboxgl.LngLatBounds();
          let hasValidBounds = false;
          
          matchingFeatures.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
              if (feature.geometry.type === 'Polygon') {
                feature.geometry.coordinates[0].forEach(coord => {
                  if (Array.isArray(coord) && coord.length >= 2 && 
                      typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                      !isNaN(coord[0]) && !isNaN(coord[1])) {
                    try {
                      bounds.extend([coord[0], coord[1]]);
                      hasValidBounds = true;
                    } catch (e) {
                      // Skip invalid coordinates
                    }
                  }
                });
              } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates.forEach(polygon => {
                  if (polygon && polygon[0]) {
                    polygon[0].forEach(coord => {
                      if (Array.isArray(coord) && coord.length >= 2 && 
                          typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                          !isNaN(coord[0]) && !isNaN(coord[1])) {
                        try {
                          bounds.extend([coord[0], coord[1]]);
                          hasValidBounds = true;
                        } catch (e) {
                          // Skip invalid coordinates
                        }
                      }
                    });
                  }
                });
              }
            }
          });
          
          // If no valid bounds were created, reset bounds to null
          if (!hasValidBounds) {
            bounds = null;
          }
        }
      }

      // Fly to bounds if found with optimized zoom for county level
      if (bounds && !bounds.isEmpty()) {
        try {
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          
          // Validate bounds
          if (sw && ne && 
              typeof sw.lng === 'number' && typeof sw.lat === 'number' &&
              typeof ne.lng === 'number' && typeof ne.lat === 'number' &&
              !isNaN(sw.lng) && !isNaN(sw.lat) && !isNaN(ne.lng) && !isNaN(ne.lat)) {
            
            // Calculate optimal zoom based on filter level
            let maxZoom = 11;
            let padding = 60;
            let minZoom = 8;
            
            if (filters.ward) {
              maxZoom = 14;
              padding = 50;
              minZoom = 10;
            } else if (filters.subcounty || filters.subCounty) {
              maxZoom = 12;
              padding = 60;
              minZoom = 9;
            } else if (filters.county) {
              // For county level, use a more zoomed-in view optimized for county boundaries
              maxZoom = 11;
              padding = 40; // Reduced padding for tighter fit on county
              minZoom = 9; // Ensure we don't zoom out too far
            }
            
            // Stop any ongoing animations first
            if (mapRef.current.isMoving()) {
              mapRef.current.stop();
            }
            
            mapRef.current.fitBounds(bounds, {
              padding: padding,
              duration: 1500, // Smooth animation
              maxZoom: maxZoom,
              minZoom: minZoom,
              essential: true // Make animation essential for better UX
            });
            
            // Reset fly-to flag after animation completes
            setTimeout(() => {
              flyToInProgressRef.current = false;
            }, 1600); // Slightly longer than animation duration
          }
        } catch (error) {
          console.warn('Error fitting bounds:', error);
          flyToInProgressRef.current = false;
        }
      } else {
        // No bounds found, reset flag
        flyToInProgressRef.current = false;
      }
    };

    // Increased debounce time to prevent multiple rapid calls
    // Wait a bit longer to ensure boundary data is stable
    const debounceTime = filters?.county ? 400 : 500;
    const timer = setTimeout(flyToFilteredLocation, debounceTime);
    return () => {
      clearTimeout(timer);
      // Don't reset flyToInProgressRef here as it might interrupt ongoing animation
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.ward, filters?.subcounty, filters?.subCounty, filters?.county, mapLoaded, boundaryData?.features?.length, boundaryType]);

  // Safe layer removal
  const safeRemoveLayer = (layerId) => {
    if (!mapRef.current) return false;
    
    try {
      if (mapRef.current.getLayer(layerId)) {
        mapRef.current.removeLayer(layerId);
        return true;
      }
    } catch (error) {
      console.warn(`Could not remove layer ${layerId}:`, error);
    }
    return false;
  };

  // Safe source removal
  const safeRemoveSource = (sourceId) => {
    if (!mapRef.current) return false;
    
    try {
      if (mapRef.current.getSource(sourceId)) {
        mapRef.current.removeSource(sourceId);
        return true;
      }
    } catch (error) {
      console.warn(`Could not remove source ${sourceId}:`, error);
    }
    return false;
  };

  // Initialize map layers
  const initializeMapLayers = (dataToUse = null) => {
    const data = dataToUse || boundaryData;
    
    // Reduced logging to prevent console spam
    // console.log('initializeMapLayers called:', {
    //   hasMap: !!mapRef.current,
    //   hasData: !!data,
    //   mapLoaded: mapLoaded,
    //   featureCount: data?.features?.length || 0,
    //   samplePartnerCount: data?.features?.[0]?.properties?.partnerCount
    // });
    
    if (!mapRef.current || !data || !mapLoaded) {
      // console.log('initializeMapLayers skipped - missing requirements');
      return;
    }

    // Ensure map style is loaded
    if (!mapRef.current.isStyleLoaded()) {
      // console.log('Map style not loaded, waiting for styledata event');
      // Remove any existing listener to prevent duplicates
      mapRef.current.off('styledata', initializeMapLayers);
      mapRef.current.once('styledata', () => {
        // console.log('Map style loaded, retrying initializeMapLayers');
        // Use a fresh call with current data
        if (mapRef.current && mapLoaded && data) {
          initializeMapLayers(data);
        }
      });
      return;
    }

    // Ensure data has features
    if (!data.features || data.features.length === 0) {
      // console.log('initializeMapLayers skipped - no features in data');
      return;
    }
    
    // console.log(`Initializing layers with ${data.features.length} features`);

    const layerId = 'choropleth-layer';
    const sourceId = 'choropleth-source';
    const outlineLayerId = 'choropleth-outline';

    // Ensure all features have partnerCount property (default to 0 if missing)
    const processedData = {
      ...data,
      features: data.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          partnerCount: feature.properties.partnerCount ?? 0,
          hasData: feature.properties.hasData ?? false
        }
      }))
    };

    // Add or update choropleth source - prefer updating over removing/recreating
    try {
      const existingSource = mapRef.current.getSource(sourceId);
      if (existingSource) {
        // Update existing source data - this is more efficient and prevents flickering
        existingSource.setData(processedData);
        // Reduced logging
        // console.log('Choropleth source data updated:', sourceId);
      } else {
        // Only add source if it doesn't exist
        mapRef.current.addSource(sourceId, {
          type: 'geojson',
          data: processedData
        });
        // Reduced logging
        // console.log('Choropleth source added successfully:', sourceId);
      }
      
      // Reduced logging
      // const sampleData = processedData.features.slice(0, 3).map(f => ({
      //   name: f.properties.name,
      //   partnerCount: f.properties.partnerCount,
      //   hasData: f.properties.hasData
      // }));
      // console.log('Sample feature data:', sampleData);
      
      // Count features with data
      // const featuresWithData = processedData.features.filter(f => (f.properties.partnerCount || 0) > 0).length;
      // console.log(`Features with partner data: ${featuresWithData}/${processedData.features.length}`);
    } catch (error) {
      console.error('Error adding/updating choropleth source:', error);
      return;
    }

    // Remove existing event listeners to avoid duplicates
    try {
      mapRef.current.off('click', layerId);
      mapRef.current.off('mouseenter', layerId);
      mapRef.current.off('mouseleave', layerId);
    } catch (error) {
      // Ignore errors if listeners don't exist
    }

    // Add choropleth fill layer - only if it doesn't exist
    try {
      const existingLayer = mapRef.current.getLayer(layerId);
      if (!existingLayer) {
        mapRef.current.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': [
              'case',
              ['>', ['coalesce', ['get', 'partnerCount'], 0], 0],
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'partnerCount'], 0],
                1, colorScales[dataType].low,
                3, colorScales[dataType].medium,
                6, colorScales[dataType].high,
                10, colorScales[dataType].veryHigh
              ],
              'rgba(200, 200, 200, 0.1)' // No data
            ],
            'fill-opacity': 0.7
          }
        });
        // Reduced logging
        // console.log('Choropleth fill layer added successfully:', layerId);
      }
      
      // Reduced logging
      // const sampleCounts = processedData.features
      //   .slice(0, 5)
      //   .map(f => ({ name: f.properties.name, count: f.properties.partnerCount }));
      // console.log('Sample partner counts:', sampleCounts);
    } catch (error) {
      console.error('Error adding choropleth fill layer:', error);
      return;
    }

    // Add boundary outline - only if it doesn't exist
    try {
      const existingOutlineLayer = mapRef.current.getLayer(outlineLayerId);
      if (!existingOutlineLayer) {
        mapRef.current.addLayer({
          id: outlineLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#4B5563',
            'line-width': 1,
            'line-opacity': 0.8
          }
        });
        // Reduced logging
        // console.log('Choropleth outline layer added successfully:', outlineLayerId);
      }
      // Reduced logging
      // console.log('✅ Choropleth layers initialized successfully!');
    } catch (error) {
      console.error('Error adding choropleth outline layer:', error);
      return;
    }

    // Helper function to calculate centroid of a feature
    const getFeatureCentroid = (feature) => {
      if (!feature || !feature.geometry) return null;
      
      const geometry = feature.geometry;
      let totalLng = 0;
      let totalLat = 0;
      let pointCount = 0;
      
      const processCoordinates = (coords) => {
        if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
          // It's an array of coordinates
          coords.forEach(coord => {
            if (Array.isArray(coord[0])) {
              processCoordinates(coord);
            } else {
              totalLng += coord[0];
              totalLat += coord[1];
              pointCount++;
            }
          });
        } else if (Array.isArray(coords) && typeof coords[0] === 'number') {
          // It's a single coordinate pair
          totalLng += coords[0];
          totalLat += coords[1];
          pointCount++;
        }
      };
      
      if (geometry.type === 'Polygon') {
        processCoordinates(geometry.coordinates[0]); // Use outer ring
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(polygon => {
          processCoordinates(polygon[0]); // Use outer ring of each polygon
        });
      }
      
      if (pointCount > 0) {
        return [totalLng / pointCount, totalLat / pointCount];
      }
      return null;
    };

    // Add interactivity
    mapRef.current.on('click', layerId, (e) => {
      e.originalEvent.preventDefault();
      if (currentPopupRef.current) {
        currentPopupRef.current.remove();
      }
      
      const properties = e.features[0].properties;
      const partnerCount = properties.partnerCount || 0;
      
      // Position popup exactly like WASH indicators popup - to the right side
      const clickPoint = e.lngLat;
      
      const popup = new window.mapboxgl.Popup({ 
        closeButton: true, 
        closeOnClick: false,
        anchor: 'left', // Anchor to left side of click point, popup appears to the right
        offset: [15, 0], // Move 15px to the right of click point
        className: 'choropleth-popup', // Add custom class for styling
        maxWidth: '350px' // Set max width for better readability
      })
        .setLngLat(clickPoint)
        .setHTML(`
          <div class="p-3 max-w-xs">
            <h3 class="font-bold text-gray-800">${properties.name}</h3>
            <p class="text-sm text-gray-600">${properties.county || 'N/A'}</p>
            <hr class="my-2">
            <div class="space-y-2">
              <p class="text-sm">
                <strong>${dataType === 'wasp' ? 'WASH' : 'NTD'} Partners:</strong> 
                <span class="font-bold ml-1 ${partnerCount > 0 ? 'text-green-600' : 'text-gray-500'}">
                  ${partnerCount}
                </span>
              </p>
              ${selectedIntervention ? '<p class="text-xs text-gray-500">Filtered by intervention</p>' : ''}
              <p class="text-xs text-gray-500">
                ${boundaryType === 'subcounty' ? 'Subcounty' : 'Ward'} Level
              </p>
            </div>
          </div>
        `)
        .addTo(mapRef.current);
        
      currentPopupRef.current = popup;
      
      // Ensure popup appears above markers with high z-index - same as WASH indicators
      setTimeout(() => {
        const popupElement = popup.getElement();
        if (popupElement) {
          popupElement.style.zIndex = '10000';
          popupElement.style.pointerEvents = 'auto';
          // Also ensure the popup container has proper z-index
          const popupContainer = popupElement.closest('.mapboxgl-popup-container');
          if (popupContainer) {
            popupContainer.style.zIndex = '10000';
            popupContainer.style.pointerEvents = 'auto';
          }
        }
      }, 10);
    });

    mapRef.current.on('mouseenter', layerId, () => {
      mapRef.current.getCanvas().style.cursor = 'pointer';
    });

    mapRef.current.on('mouseleave', layerId, () => {
      mapRef.current.getCanvas().style.cursor = '';
    });

    // Fit map to data bounds - validate coordinates first
    // Only fit to all bounds if no filter is active (let fly-to handle filtered views)
    // Handle both subcounty and subCounty property names
    const subcountyFilter = filters?.subcounty || filters?.subCounty;
    const hasActiveFilter = filters?.county || subcountyFilter || filters?.ward;
    
    if (data.features.length > 0 && !hasActiveFilter) {
      const bounds = new window.mapboxgl.LngLatBounds();
      let hasValidBounds = false;
      
      data.features.forEach(feature => {
        if (feature.geometry.type === 'Polygon' && feature.geometry.coordinates?.[0]) {
          feature.geometry.coordinates[0].forEach(coord => {
            // Validate coordinate format: must be [lng, lat] array with valid numbers
            // Also check that coordinates are within reasonable bounds (Kenya is roughly 33-42 lng, -5 to 5 lat)
            if (Array.isArray(coord) && coord.length >= 2 && 
                typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                !isNaN(coord[0]) && !isNaN(coord[1]) &&
                coord[0] >= 33 && coord[0] <= 42 && // Longitude bounds for Kenya
                coord[1] >= -5 && coord[1] <= 5) {   // Latitude bounds for Kenya
              try {
                bounds.extend([coord[0], coord[1]]);
                hasValidBounds = true;
              } catch (e) {
                // Silently skip invalid coordinates
              }
            }
          });
        } else if (feature.geometry.type === 'MultiPolygon' && feature.geometry.coordinates) {
          feature.geometry.coordinates.forEach(polygon => {
            if (polygon?.[0]) {
              polygon[0].forEach(coord => {
                // Validate coordinate format with bounds check
                if (Array.isArray(coord) && coord.length >= 2 && 
                    typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                    !isNaN(coord[0]) && !isNaN(coord[1]) &&
                    coord[0] >= 33 && coord[0] <= 42 && // Longitude bounds for Kenya
                    coord[1] >= -5 && coord[1] <= 5) {   // Latitude bounds for Kenya
                  try {
                    bounds.extend([coord[0], coord[1]]);
                    hasValidBounds = true;
                  } catch (e) {
                    // Silently skip invalid coordinates
                  }
                }
              });
            }
          });
        }
      });
      
      // Only fit bounds if we have valid bounds and they're not empty
      if (hasValidBounds) {
        try {
          // Check if bounds is valid before fitting
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          if (sw && ne && 
              typeof sw.lng === 'number' && typeof sw.lat === 'number' &&
              typeof ne.lng === 'number' && typeof ne.lat === 'number' &&
              !bounds.isEmpty()) {
            mapRef.current.fitBounds(bounds, {
              padding: 50,
              duration: 1000
            });
          }
        } catch (e) {
          // Silently handle bounds fitting errors (likely due to empty/invalid data)
        }
      }
    }
  };

  // Track previous boundary data to prevent unnecessary updates
  const prevBoundaryDataHashRef = useRef(null);
  const prevDataTypeRef = useRef(null);
  const prevSelectedInterventionRef = useRef(null);

  // Update layers when data changes - only if data actually changed
  useEffect(() => {
    if (!mapRef.current || !mapInitialized.current || !mapLoaded || !boundaryData) {
      return;
    }

    // Check if boundary data has features
    const hasFeatures = boundaryData.features && boundaryData.features.length > 0;
    if (!hasFeatures) {
      return;
    }

    // Check if data actually changed by comparing hash
    const currentHash = getBoundaryDataHash(boundaryData);
    const interventionChanged = prevSelectedInterventionRef.current !== selectedIntervention;
    const dataChanged = 
      prevBoundaryDataHashRef.current !== currentHash ||
      prevDataTypeRef.current !== dataType ||
      interventionChanged;

    // Always update layers if intervention changed, even if hash is the same
    // This ensures the map reflects the filtered data correctly
    if (!dataChanged && prevBoundaryDataHashRef.current !== null && !interventionChanged) {
      return; // Skip if data hasn't changed and intervention hasn't changed
    }

    // Skip if layer update is already in progress to prevent flickering
    if (layerUpdateInProgressRef.current) {
      return;
    }

    // Clear any pending updates (handle both setTimeout and requestAnimationFrame)
    if (layerUpdateTimeoutRef.current) {
      // Check if it's a requestAnimationFrame ID (number) or setTimeout ID
      if (typeof layerUpdateTimeoutRef.current === 'number' && layerUpdateTimeoutRef.current > 1000000) {
        // Likely a requestAnimationFrame ID
        cancelAnimationFrame(layerUpdateTimeoutRef.current);
      } else {
        // Likely a setTimeout ID
        clearTimeout(layerUpdateTimeoutRef.current);
      }
    }

    // Update refs immediately to prevent duplicate calls
    prevBoundaryDataHashRef.current = currentHash;
    prevDataTypeRef.current = dataType;
    prevSelectedInterventionRef.current = selectedIntervention;

    // Mark update as in progress
    layerUpdateInProgressRef.current = true;

    // Use increased debounce to batch rapid updates and prevent flickering
    // This is especially important for NTD maps that might update frequently
    layerUpdateTimeoutRef.current = setTimeout(() => {
      layerUpdateTimeoutRef.current = requestAnimationFrame(() => {
        // Double-check conditions before initializing
        if (mapRef.current && mapLoaded && boundaryData && boundaryData.features?.length > 0) {
          initializeMapLayers();
        }
        layerUpdateTimeoutRef.current = null;
        layerUpdateInProgressRef.current = false;
      });
    }, 200); // Increased debounce from 50ms to 200ms to prevent flickering
    
    return () => {
      if (layerUpdateTimeoutRef.current) {
        // Clear both timeout and animation frame if they exist
        clearTimeout(layerUpdateTimeoutRef.current);
        if (typeof layerUpdateTimeoutRef.current === 'number' && layerUpdateTimeoutRef.current > 1000000) {
          cancelAnimationFrame(layerUpdateTimeoutRef.current);
        }
        layerUpdateTimeoutRef.current = null;
      }
      // Reset in-progress flag on cleanup
      layerUpdateInProgressRef.current = false;
    };
    // Use boundaryData.features.length instead of boundaryData to prevent unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaryData?.features?.length, dataType, selectedIntervention, mapLoaded]);

  // Calculate filtered ward/subcounty count based on location filters
  const filteredBoundaryCount = useMemo(() => {
    if (!boundaryData?.features) return 0;
    
    const features = boundaryData.features;
    const subcountyFilter = filters?.subcounty || filters?.subCounty;
    
    // Helper function to normalize county names for matching
    const normalizeCountyName = (name) => {
      if (!name) return '';
      return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*county\s*$/i, '')
        .trim();
    };
    
    // Helper function to normalize boundary names
    const normalizeBoundaryName = (name) => {
      if (!name) return '';
      return name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*subcounty\s*$/i, '')
        .replace(/\s*ward\s*$/i, '')
        .trim();
    };
    
    // If ward filter is set, count should be 1 (or 0 if not found)
    if (filters?.ward) {
      const matchingFeature = features.find(f => {
        const featureName = f.properties?.name || '';
        return featureName.toLowerCase().includes(filters.ward.toLowerCase());
      });
      return matchingFeature ? 1 : 0;
    }
    
    // If subcounty filter is set, count wards in that subcounty
    if (subcountyFilter) {
      const normalizedFilterSubcounty = normalizeBoundaryName(subcountyFilter);
      const matchingFeatures = features.filter(f => {
        const subcountyName = f.properties?.subcounty || '';
        if (!subcountyName) return false;
        const normalizedSubcounty = normalizeBoundaryName(subcountyName);
        return normalizedSubcounty === normalizedFilterSubcounty || 
               normalizedSubcounty.includes(normalizedFilterSubcounty) ||
               normalizedFilterSubcounty.includes(normalizedSubcounty);
      });
      return matchingFeatures.length;
    }
    
    // If county filter is set, count features in that county
    if (filters?.county) {
      const normalizedFilterCounty = normalizeCountyName(filters.county);
      const matchingFeatures = features.filter(f => {
        const countyName = f.properties?.county || '';
        const normalizedCounty = normalizeCountyName(countyName);
        const exactMatch = normalizedCounty === normalizedFilterCounty;
        const includesMatch = normalizedCounty.includes(normalizedFilterCounty) || 
                              normalizedFilterCounty.includes(normalizedCounty);
        const reverseMatch = normalizedFilterCounty.includes(normalizedCounty) && 
                             normalizedCounty.length > 0;
        return exactMatch || includesMatch || reverseMatch;
      });
      return matchingFeatures.length;
    }
    
    // No filters active, return total count
    return features.length;
  }, [boundaryData?.features, filters?.county, filters?.subcounty, filters?.subCounty, filters?.ward]);

  return (
    <div className="h-full w-full relative flex flex-col">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-90 rounded-lg flex items-center justify-center z-30">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600 text-sm">Loading {dataType === 'wasp' ? 'WASH' : 'NTD'} map...</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 p-3 border-b border-blue-200 text-sm text-blue-700 flex items-center justify-end flex-shrink-0">
        <div className="flex space-x-2 flex-shrink-0">
          <span className="px-2 py-1 text-xs bg-white rounded border">
            {filteredBoundaryCount} {boundaryType}{filteredBoundaryCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {error && (
        <div className="absolute top-16 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-20">
          <strong>Error: </strong>{error}
        </div>
      )}

      {/* Intervention Selection Controls - Top Right (below header) - Collapsible */}
      {interventions && interventions.length > 0 && (
        <div className="absolute top-16 right-4 bg-white rounded-lg shadow-xl border border-gray-300 z-10 max-w-[160px] backdrop-blur-sm" style={{ marginRight: '180px' }}>
          {/* Header with toggle button */}
          <button
            onClick={() => setIsChecklistExpanded(!isChecklistExpanded)}
            className="w-full flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-t-lg transition-colors"
          >
            <h4 className="font-bold text-[9px] text-gray-800 uppercase tracking-wide">
              {dataType === 'wasp' ? 'WASH' : 'NTD'} Filter
            </h4>
            <svg
              className={`w-3 h-3 text-gray-600 transition-transform ${isChecklistExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Selected intervention preview when collapsed */}
          {!isChecklistExpanded && (
            <div className="px-1.5 pb-1.5">
              <div className="text-[8px] text-gray-600 truncate">
                {selectedIntervention 
                  ? interventions.find(i => i.code === selectedIntervention)?.name || 'Selected'
                  : 'All Interventions'}
              </div>
            </div>
          )}
          
          {/* Expanded checklist */}
          {isChecklistExpanded && (
            <div className="space-y-0.5 max-h-[140px] overflow-y-auto pr-0.5 custom-scrollbar p-1.5 pt-0">
              {interventions.map((intervention) => (
                <label 
                  key={intervention.code} 
                  className={`flex items-start space-x-1 cursor-pointer p-0.5 rounded transition-colors ${
                    selectedIntervention === intervention.code 
                      ? 'bg-blue-50 border border-blue-200' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${dataType}-intervention`}
                    value={intervention.code}
                    checked={selectedIntervention === intervention.code}
                    onChange={() => onInterventionSelect(intervention.code)}
                    className="w-2.5 h-2.5 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer flex-shrink-0 mt-0.5"
                  />
                  <span className={`text-[8px] leading-tight ${
                    selectedIntervention === intervention.code 
                      ? 'text-blue-700 font-medium' 
                      : 'text-gray-700'
                  }`}>
                    {intervention.name}
                  </span>
                </label>
              ))}
              <label className={`flex items-start space-x-1 cursor-pointer p-0.5 rounded transition-colors ${
                !selectedIntervention 
                  ? 'bg-blue-50 border border-blue-200' 
                  : 'hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name={`${dataType}-intervention`}
                  value=""
                  checked={!selectedIntervention}
                  onChange={() => onInterventionSelect(null)}
                  className="w-2.5 h-2.5 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer flex-shrink-0 mt-0.5"
                />
                <span className={`text-[8px] leading-tight ${
                  !selectedIntervention 
                    ? 'text-blue-700 font-medium' 
                    : 'text-gray-700'
                }`}>
                  All Interventions
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      <div
        ref={mapContainerRef}
        className="w-full flex-1 relative"
        style={{ minHeight: '400px' }}
      />

      {/* Legend - Bottom Left */}
      <div className="absolute bottom-4 right-0 bg-white p-3 rounded-lg shadow-lg border border-gray-200 z-10">
        <h4 className="font-semibold text-sm mb-2">Partners Count</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2" style={{ backgroundColor: colorScales[dataType].low }}></div>
            <span>1-2 Partners</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2" style={{ backgroundColor: colorScales[dataType].medium }}></div>
            <span>3-5 Partners</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2" style={{ backgroundColor: colorScales[dataType].high }}></div>
            <span>6-10 Partners</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2" style={{ backgroundColor: colorScales[dataType].veryHigh }}></div>
            <span>10+ Partners</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 mr-2 bg-gray-200"></div>
            <span>No data</span>
          </div>
        </div>
      </div>
    </div>
  );
}