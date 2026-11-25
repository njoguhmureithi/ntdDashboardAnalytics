'use client';

import { useEffect, useRef, useState } from 'react';

export default function Map({ filters, visibleWashLayers, washQualityFilter }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapInitialized = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [surveyPoints, setSurveyPoints] = useState([]);
  const [subcountyBoundaries, setSubcountyBoundaries] = useState(null);
  const [wardBoundaries, setWardBoundaries] = useState(null);
  const [showSubcountyBoundaries, setShowSubcountyBoundaries] = useState(true);
  const [showWardBoundaries, setShowWardBoundaries] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [choroplethData, setChoroplethData] = useState(null);
  const [activeChoropleth, setActiveChoropleth] = useState('sth');
  const [washPointData, setWashPointData] = useState([]);
  const markersRef = useRef([]);
  const layersRef = useRef([]);
  const currentPopupRef = useRef(null);

  // Helper function to normalize context values
  const normalizeContext = (context) => {
    if (!context) return null;
    const normalized = context.trim();
    const lower = normalized.toLowerCase();
    
    if (lower === 'household') return 'Household';
    if (lower === 'school') return 'School';
    if (lower.includes('public') && lower.includes('space')) return 'Public Space';
    
    return normalized;
  };

  // Context shapes configuration - consistent shapes for each context
  const contextShapes = {
    'Household': {
      // House icon
      getSvg: (color) => `data:image/svg+xml;base64,${btoa(`
        <svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 18L20 5l17 13" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M7 18v15h26V18" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="15" y="23" width="10" height="10" fill="${color}" fill-opacity="0.5"/>
        </svg>
      `)}`
    },
  'School': {
  getSvg: (color) => `data:image/svg+xml;base64,${btoa(`
    <svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <!-- Single flag on pole -->
      <line x1="20" y1="8" x2="20" y2="32" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M20 12 L32 8 L32 20 L20 22 Z" fill="${color}" fill-opacity="0.8" stroke="${color}" stroke-width="1.5"/>
    </svg>
  `)}`
},
    'Public Space': {
      // Building/Monument icon
      getSvg: (color) => `data:image/svg+xml;base64,${btoa(`
        <svg width="32" height="32" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10h32l-4 8H8l-4-8z" fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 18h24v16H8V18z" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="14" y1="22" x2="14" y2="30" stroke="${color}" stroke-width="2"/>
          <line x1="20" y1="22" x2="20" y2="30" stroke="${color}" stroke-width="2"/>
          <line x1="26" y1="22" x2="26" y2="30" stroke="${color}" stroke-width="2"/>
        </svg>
      `)}`
    }
  };
  // Looser Western Kenya bounds for better context
  const WESTERN_KENYA_BOUNDS = [[33.5, -0.5], [36.0, 2.0]];

  // Fetch WASH point data from ward_context_summary
  const fetchWashPointData = async () => {
    try {
      const params = new URLSearchParams({
        year: filters?.year || '2025'
      });

      if (filters?.county) params.append('county', filters.county);
      if (filters?.subCounty) params.append('subCounty', filters.subCounty);
      if (filters?.ward) params.append('ward', filters.ward);
      
      // Add IoT filter - only send if explicitly set to true/yes
      // Convert boolean true to 'yes' string for API
      if (filters?.iotUnit === true || filters?.iotUnit === 'yes') {
        params.append('iotUnit', 'yes');
      }

      const response = await fetch(`/api/map-data?${params}`);
      if (response.ok) {
        const data = await response.json();
        const validPoints = data.surveyPoints.filter(point => {
          const lat = parseFloat(point.latitude);
          const lng = parseFloat(point.longitude);
          return lat >= -0.5 && lat <= 2.0 && lng >= 33.5 && lng <= 36.0 && 
                 !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
        });
        
        setWashPointData(validPoints);
        console.log(`WASH points: ${validPoints.length} valid from ${data.surveyPoints?.length || 0} total`);
      }
    } catch (error) {
      console.error('Error fetching WASH point data:', error);
    }
  };

  useEffect(() => {
    const fetchBoundaryData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch subcounty boundaries
        const subcountyResponse = await fetch('/api/boundaries?type=subcounty');
        if (subcountyResponse.ok) {
          const subcountyData = await subcountyResponse.json();
          setSubcountyBoundaries(subcountyData);
        }

        // Fetch ward boundaries
        const wardResponse = await fetch('/api/boundaries?type=ward');
        if (wardResponse.ok) {
          const wardData = await wardResponse.json();
          setWardBoundaries(wardData);
        }

        // Fetch initial data
        await fetchChoroplethData('sth');
        await fetchWashPointData();

      } catch (error) {
        console.error('Error fetching boundary data:', error);
        setError('Failed to load boundary data');
      } finally {
        setLoading(false);
      }
    };

    fetchBoundaryData();
  }, []);

  // Fetch choropleth data when disease changes
  const fetchChoroplethData = async (diseaseType) => {
    try {
      const params = new URLSearchParams({
        disease: diseaseType,
        year: filters?.year || '2025'
      });

      if (filters?.county) params.append('county', filters.county);
      if (filters?.subCounty) params.append('subCounty', filters.subCounty);
      if (filters?.ward) params.append('ward', filters.ward);

      const response = await fetch(`/api/choropleth-data?${params}`);
      if (response.ok) {
        const data = await response.json();
        setChoroplethData(data);
      }
    } catch (error) {
      console.error('Error fetching choropleth data:', error);
    }
  };

  // Handle disease choropleth toggle
  useEffect(() => {
    if (filters?.diseases && filters.diseases.length > 0) {
      const diseaseMap = { 'STH': 'sth', 'Schisto': 'schistosomiasis' };
      const newDisease = diseaseMap[filters.diseases[filters.diseases.length - 1]] || 'sth';
      if (newDisease !== activeChoropleth) {
        setActiveChoropleth(newDisease);
        fetchChoroplethData(newDisease);
      }
    } else {
      setActiveChoropleth(null);
    }
  }, [filters?.diseases]);

  // Update when filters change
  useEffect(() => {
    if (mapInitialized.current && (filters?.county || filters?.subCounty || filters?.ward || filters?.year || filters?.iotUnit !== undefined)) {
      if (activeChoropleth) {
        fetchChoroplethData(activeChoropleth);
      }
      fetchWashPointData();
      setTimeout(() => flyToLocation(), 100);
    }
  }, [filters?.county, filters?.subCounty, filters?.ward, filters?.year, filters?.iotUnit]);

  // Fly to location based on filters
  const flyToLocation = () => {
    if (!mapRef.current || !mapInitialized.current) return;

    let center = [34.75, 0.6];
    let zoom = 8;

    if (filters?.ward && wardBoundaries) {
      const ward = wardBoundaries.features.find(f => 
        f.properties.name?.toLowerCase() === filters.ward.toLowerCase()
      );
      if (ward) {
        const bbox = getBounds(ward.geometry);
        center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
        zoom = 12;
      }
    } else if (filters?.subCounty && subcountyBoundaries) {
      const subCounty = subcountyBoundaries.features.find(f => 
        f.properties.name?.toLowerCase() === filters.subCounty.toLowerCase()
      );
      if (subCounty) {
        const bbox = getBounds(subCounty.geometry);
        center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
        zoom = 10;
      }
    } else if (filters?.county) {
      const countyCenters = {
        'Kakamega County': [34.752, 0.284],
        'Bungoma County': [34.563, 0.563], 
        'Vihiga County': [34.728, 0.081],
        'Trans Nzoia County': [35.011, 1.021]
      };
      center = countyCenters[filters.county] || center;
      zoom = 9;
    }

    mapRef.current.flyTo({
      center: center,
      zoom: zoom,
      duration: 1200,
      essential: true
    });
  };

  // Helper function to get bounds from geometry
  const getBounds = (geometry) => {
    let bounds = [Infinity, Infinity, -Infinity, -Infinity];
    
    const updateBounds = (coords) => {
      bounds[0] = Math.min(bounds[0], coords[0]);
      bounds[1] = Math.min(bounds[1], coords[1]);
      bounds[2] = Math.max(bounds[2], coords[0]);
      bounds[3] = Math.max(bounds[3], coords[1]);
    };

    if (geometry.type === 'Polygon') {
      geometry.coordinates[0].forEach(updateBounds);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        polygon[0].forEach(updateBounds);
      });
    }

    return bounds;
  };

  // Get color based on WASH quality
  const getWashQualityColor = (value) => {
    if (value >= 76) return '#1A9641'; // Good
    if (value >= 51) return '#2b9ffb'; // Moderate
    if (value >= 26) return '#FFBA00'; // Low 
    return '#D7191C'; // Very Low
  };
  

  // Get quality category for a value
  const getQualityCategory = (value) => {
    if (value >= 76) return '76-100';
    if (value >= 51) return '51-75';
    if (value >= 26) return '26-50';
    return '0-25';
  };
  

// Get indicator value for a point
const getIndicatorValue = (point, indicator) => {
  const parseValue = (val) => {
    if (val === null || val === undefined) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  };

  switch (indicator) {
    case 'water': return parseValue(point.water_index);
    case 'sanitation': return parseValue(point.sanitation_index);
    case 'hygiene': return parseValue(point.hygiene_index);
    case 'overall': 
      // Use the database value if available, otherwise calculate
      const dbValue = parseValue(point.overall_wash_index);
      if (dbValue > 0) {
        return dbValue;
      }
      // Fallback calculation if database value is not available
      const values = [
        parseValue(point.water_index), 
        parseValue(point.sanitation_index), 
        parseValue(point.hygiene_index)
      ].filter(v => v > 0);
      
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    default: return 0;
  }
};

  // Check if point passes quality filter - IMPROVED LOGIC
  const passesQualityFilter = (indicatorValue) => {
    // If no quality filters are selected, show nothing
    if (!washQualityFilter || 
        (!washQualityFilter['0-25'] && !washQualityFilter['26-50'] && 
         !washQualityFilter['51-75'] && !washQualityFilter['76-100'])) {
      return false;
    }
    // Overall WASH 0 means no data (e.g. 2021-2023) - do not show as red/low-quality
    if (indicatorValue === 0) return false;
    
    const qualityCategory = getQualityCategory(indicatorValue);
    return washQualityFilter[qualityCategory] === true;
  };

  // Check if any WASH indicators are visible
  const hasVisibleIndicators = () => {
    return visibleWashLayers?.water || 
           visibleWashLayers?.sanitation || 
           visibleWashLayers?.hygiene || 
           visibleWashLayers?.overall;
  };

  // Check if any quality filters are active
  const hasActiveQualityFilters = () => {
    return washQualityFilter && 
      (washQualityFilter['0-25'] || washQualityFilter['26-50'] || 
       washQualityFilter['51-75'] || washQualityFilter['76-100']);
  };

  // Initialize map only once
  useEffect(() => {
    if (!mapContainerRef.current || mapInitialized.current) return;

    const loadMapbox = () => {
      return new Promise((resolve, reject) => {
        if (window.mapboxgl) {
          resolve();
          return;
        }

        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
        document.head.appendChild(cssLink);

        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Mapbox'));
        document.body.appendChild(script);
      });
    };

    const initializeMap = async () => {
      try {
        await loadMapbox();

        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!mapboxToken) {
          console.error('Mapbox token not found');
          setError('Map configuration error');
          return;
        }

        window.mapboxgl.accessToken = mapboxToken;

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
          console.log('Map loaded successfully');
          setMapLoaded(true);
          map.addControl(new window.mapboxgl.NavigationControl(), 'top-right');
          initializeMapLayers();
        });

        map.on('error', (e) => {
          console.error('Map error:', e.error || e);
        });

        // Close popup on map click
        map.on('click', (e) => {
          if (currentPopupRef.current && !e.originalEvent.defaultPrevented) {
            currentPopupRef.current.remove();
            currentPopupRef.current = null;
          }
        });

        setTimeout(() => {
          map.resize();
        }, 100);

      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map');
      }
    };

    initializeMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapInitialized.current = false;
        setMapLoaded(false);
      }
    };
  }, []);

  // Safe layer removal function
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

  // Safe source removal function
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

  // Initialize map layers when boundaries are loaded
  const initializeMapLayers = () => {
    if (!mapRef.current || !mapLoaded) {
      console.log('Map layers init skipped:', { 
        hasMap: !!mapRef.current, 
        mapLoaded: mapLoaded 
      });
      return;
    }

    // Ensure map style is loaded
    if (!mapRef.current.isStyleLoaded()) {
      console.log('Map style not loaded yet, waiting...');
      mapRef.current.once('styledata', () => {
        initializeMapLayers();
      });
      return;
    }

    console.log('Initializing map layers...');

    // Add boundary layers first (base layers)
    if (subcountyBoundaries) {
      addBoundaryLayer('subcounty', subcountyBoundaries);
    }
    
    if (wardBoundaries) {
      addBoundaryLayer('ward', wardBoundaries);
    }

    // Set initial visibility
    toggleBoundaryVisibility('subcounty', showSubcountyBoundaries);
    toggleBoundaryVisibility('ward', showWardBoundaries);

    // Add choropleth layer if data is available
    if (choroplethData && wardBoundaries) {
      addChoroplethLayer();
    }

    // Add WASH points with shapes
    if (washPointData.length > 0) {
      addWashPointOverlays();
    }

    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    }, 500);
  };

  // Add boundary layer
  const addBoundaryLayer = (type, geoJSON) => {
    if (!mapRef.current) return;

    const layerId = `${type}-boundaries`;
    const fillLayerId = `${layerId}-fill`;
    const sourceId = `${type}-source`;

    // Remove layers first, then source
    safeRemoveLayer(fillLayerId);
    safeRemoveLayer(layerId);
    safeRemoveSource(sourceId);

    // Add source
    mapRef.current.addSource(sourceId, {
      type: 'geojson',
      data: geoJSON
    });

    // Add fill layer (for interactivity)
    mapRef.current.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': 'transparent',
        'fill-opacity': 0
      }
    });

    // Add line layer
    mapRef.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': type === 'subcounty' ? '#4B5563' : '#6B7280',
        'line-width': type === 'subcounty' ? 2 : 1.5,
        'line-opacity': 0.8
      }
    });

    // Remove any existing event listeners
    try {
      mapRef.current.off('click', layerId);
      mapRef.current.off('mouseenter', layerId);
      mapRef.current.off('mouseleave', layerId);
    } catch (error) {
      // Ignore errors if listeners don't exist
    }

    // Add interactivity
    mapRef.current.on('click', layerId, (e) => {
      e.originalEvent.preventDefault();
      if (currentPopupRef.current) {
        currentPopupRef.current.remove();
      }
      
      const properties = e.features[0].properties;
      const popup = new window.mapboxgl.Popup({ closeButton: true, closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="p-2">
            <h3 class="font-bold">${properties.name}</h3>
            ${properties.county ? `<p>County: ${properties.county}</p>` : ''}
          </div>
        `)
        .addTo(mapRef.current);
        
      currentPopupRef.current = popup;
    });

    mapRef.current.on('mouseenter', layerId, () => {
      mapRef.current.getCanvas().style.cursor = 'pointer';
    });

    mapRef.current.on('mouseleave', layerId, () => {
      mapRef.current.getCanvas().style.cursor = '';
    });
  };

  // Add WASH point overlays with shapes - IMPROVED RESPONSIVENESS
  const addWashPointOverlays = () => {
    if (!mapRef.current || washPointData.length === 0) return;

    // Clear existing markers immediately
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // If no indicators are visible OR no quality filters are selected, show nothing
    if (!hasVisibleIndicators() || !hasActiveQualityFilters()) {
      console.log('No visible indicators or quality filters - hiding all markers');
      return;
    }

    const contexts = ['Household', 'School', 'Public Space'];

    contexts.forEach(context => {
      const contextPoints = washPointData.filter(point => {
        const normalizedPointContext = normalizeContext(point.context);
        return normalizedPointContext === context && 
               point.latitude && point.longitude;
      });

      contextPoints.forEach(point => {
        // For each point, check if ANY of the visible indicators pass the quality filter
        const indicators = ['water', 'sanitation', 'hygiene', 'overall'];
        const visibleIndicators = indicators.filter(indicator => visibleWashLayers[indicator]);
        
        const hasVisibleQualityIndicator = visibleIndicators.some(indicator => {
          const indicatorValue = getIndicatorValue(point, indicator);
          return passesQualityFilter(indicatorValue);
        });

        if (!hasVisibleQualityIndicator) return;

        const shapeConfig = contextShapes[context];
        if (!shapeConfig) return;

        // Use the highest visible indicator value for color
        let highestValue = 0;
        let highestIndicator = 'overall';
        
        visibleIndicators.forEach(indicator => {
          const value = getIndicatorValue(point, indicator);
          if (value > highestValue) {
            highestValue = value;
            highestIndicator = indicator;
          }
        });

        // No WASH data (e.g. 2021-2023): do not show red/low-quality indicators
        if (highestValue === 0) return;

        const color = getWashQualityColor(highestValue);

        // Create shape marker with quality-based color
        const shapeSvg = shapeConfig.getSvg(color);

        const el = document.createElement('div');
        el.className = 'wash-marker';
        el.innerHTML = `<img src="${shapeSvg}" alt="${context}" />`;
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.cursor = 'pointer';

        const marker = new window.mapboxgl.Marker({
          element: el,
          anchor: 'center'
        })
          .setLngLat([parseFloat(point.longitude), parseFloat(point.latitude)])
          .addTo(mapRef.current);

        // Add click event
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          
          if (currentPopupRef.current) {
            currentPopupRef.current.remove();
          }

          const overallWash = point.overall_wash_index || getIndicatorValue(point, 'overall');
          // Helper function to safely format WASH values
          const formatWashValue = (value) => {
            if (value === null || value === undefined || value === '') return 'N/A';
            const numValue = parseFloat(value);
            return isNaN(numValue) ? 'N/A' : numValue.toFixed(1);
          };
          const popupContent = `
          <div class="p-3 max-w-xs">
            <div class="flex items-center mb-2">
              <img src="${shapeSvg}" alt="${context}" class="w-6 h-6 mr-2" />
              <div>
                <h3 class="font-bold text-gray-800">${point.ward_name}</h3>
                <p class="text-sm text-gray-600">${point.county}</p>
              </div>
            </div>
            <p class="text-sm text-blue-600 font-medium">${context}</p>
            <div class="flex items-center mt-1 mb-2">
              <div class="w-3 h-3 rounded-full mr-2" style="background-color: ${color}"></div>
              <span class="text-xs font-medium">
  ${highestValue >= 76 ? 'Good' : highestValue >= 51 ? 'Moderate' : highestValue >= 26 ? 'Low' : 'Very Low'} Quality
</span>
            </div>
            <hr class="my-2">
            <div class="space-y-1 text-sm">
              <p><span class="font-medium">Water Index:</span> ${point.water_index || 'N/A'}</p>
              <p><span class="font-medium">Sanitation Index:</span> ${point.sanitation_index || 'N/A'}</p>
              <p><span class="font-medium">Hygiene Index:</span> ${point.hygiene_index || 'N/A'}</p>
              <p><span class="font-medium">Overall WASH:</span> ${formatWashValue(point.overall_wash_index)}</p>
              <p><span class="font-medium">Survey Points:</span> ${point.n_points || 'N/A'}</p>
              ${point.matrix ? `<p class="mt-2"><span class="font-medium text-blue-600">Matrix:</span> <span class="text-xs">${point.matrix}</span></p>` : ''}
              ${point.iot ? `<p class="mt-1"><span class="font-medium ${point.iot.toLowerCase() === 'yes' ? 'text-green-600' : 'text-gray-600'}">IoT:</span> <span class="text-xs font-semibold">${point.iot}</span></p>` : ''}
            </div>
            <div class="mt-2 text-xs text-gray-500">
              Active Indicators: ${visibleIndicators.map(ind => ind.charAt(0).toUpperCase() + ind.slice(1)).join(', ')}
            </div>
          </div>
        `;
          const popup = new window.mapboxgl.Popup({ closeButton: true, closeOnClick: false })
            .setLngLat([parseFloat(point.longitude), parseFloat(point.latitude)])
            .setHTML(popupContent)
            .addTo(mapRef.current);

          currentPopupRef.current = popup;
        });

        markersRef.current.push(marker);
      });
    });
  };

  // Add choropleth layer
  const addChoroplethLayer = () => {
    if (!mapRef.current || !choroplethData || !wardBoundaries) return;
  
    const layerId = 'choropleth-layer';
    const sourceId = 'choropleth-source';
    
    // Remove existing choropleth layer and source
    safeRemoveLayer(layerId);
    safeRemoveSource(sourceId);
  
    // Calculate max value safely
    const prevalenceValues = choroplethData.choroplethData
      .map(d => parseFloat(d.disease_prevalence))
      .filter(val => !isNaN(val) && val > 0);
    
    const maxValue = prevalenceValues.length > 0 ? Math.max(...prevalenceValues) : 100;
    
    // Ensure we have valid breakpoints for the interpolation
    const breakpoints = [
      0,
      maxValue * 0.2,
      maxValue * 0.4,
      maxValue * 0.6,
      maxValue * 0.8,
      maxValue
    ];
  
    // Ensure breakpoints are in strictly ascending order and unique
    const uniqueBreakpoints = [...new Set(breakpoints)].sort((a, b) => a - b);
  
    const choroplethFeatures = wardBoundaries.features.map(wardFeature => {
      const wardData = choroplethData.choroplethData.find(d => 
        d.ward_name.toLowerCase() === wardFeature.properties.name.toLowerCase()
      );
      
      return {
        ...wardFeature,
        properties: {
          ...wardFeature.properties,
          disease_prevalence: wardData ? parseFloat(wardData.disease_prevalence) : 0,
          water_index: wardData ? parseFloat(wardData.water_index) : 0,
          sanitation_index: wardData ? parseFloat(wardData.sanitation_index) : 0,
          hygiene_index: wardData ? parseFloat(wardData.hygiene_index) : 0,
          data_points: wardData ? wardData.data_points : 0
        }
      };
    });
  
    mapRef.current.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: choroplethFeatures
      }
    });
  
    // Only show choropleth if a disease is selected
    const visibility = activeChoropleth ? 'visible' : 'none';
  
    mapRef.current.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      layout: {
        visibility: visibility
      },
      // In the addChoroplethLayer function, replace the fill-color paint property:
paint: {
  'fill-color': [
    'case',
    ['>', ['get', 'disease_prevalence'], 0],
    [
      'interpolate',
      ['linear'],
      ['get', 'disease_prevalence'],
      0, '#FFE1D2',
      2, '#FFE1D2',
      2.1, '#FDBEA5',
      10, '#FDBEA5',
      10.1, '#FC7050',
      20, '#FC7050',
      20.1, '#D42020',
      50, '#D42020',
      50.1, '#67000D',
      68.12, '#67000D'
    ],
    'rgba(200, 200, 200, 0.1)'
  ],
  'fill-opacity': 0.6
}
    }, 'ward-boundaries-fill');
  
    // Remove existing event listeners
    try {
      mapRef.current.off('click', layerId);
    } catch (error) {
      // Ignore errors if listeners don't exist
    }
  
    // Add click handler
    mapRef.current.on('click', layerId, (e) => {
      e.originalEvent.preventDefault();
      if (currentPopupRef.current) {
        currentPopupRef.current.remove();
      }
  
      const properties = e.features[0].properties;
      
      const diseaseTitle = activeChoropleth ? activeChoropleth.toUpperCase() : 'Disease';
      
      const popup = new window.mapboxgl.Popup({ closeButton: true, closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="p-3 max-w-xs">
            <h3 class="font-bold text-gray-800">${properties.name}</h3>
            <p class="text-sm text-gray-600">${properties.county}</p>
            <hr class="my-2">
            <p class="text-sm"><strong>${diseaseTitle}:</strong> ${properties.disease_prevalence}%</p>
            <p class="text-sm"><strong>Water Access:</strong> ${properties.water_index}</p>
            <p class="text-sm"><strong>Sanitation:</strong> ${properties.sanitation_index}</p>
            <p class="text-sm"><strong>Hygiene:</strong> ${properties.hygiene_index}</p>
            <p class="text-xs text-gray-500 mt-2">Survey locations: ${properties.data_points}</p>
          </div>
        `)
        .addTo(mapRef.current);
        
      currentPopupRef.current = popup;
    });
  };

  // Toggle boundary visibility
  const toggleBoundaryVisibility = (boundaryType, visible) => {
    if (!mapRef.current) return;
    
    const layerId = `${boundaryType}-boundaries`;
    const fillLayerId = `${layerId}-fill`;
    
    if (mapRef.current.getLayer(layerId)) {
      mapRef.current.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
    if (mapRef.current.getLayer(fillLayerId)) {
      mapRef.current.setLayoutProperty(fillLayerId, 'visibility', visible ? 'visible' : 'none');
    }
  };

  // Update choropleth visibility when disease selection changes
  useEffect(() => {
    if (mapRef.current && mapInitialized.current) {
      const layerId = 'choropleth-layer';
      if (mapRef.current.getLayer(layerId)) {
        const visibility = activeChoropleth ? 'visible' : 'none';
        mapRef.current.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }
  }, [activeChoropleth]);

  // Update visible WASH layers and quality filtering - IMPROVED RESPONSIVENESS
  useEffect(() => {
    if (mapRef.current && mapInitialized.current) {
      // Clear markers immediately when filters change
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      
      // Then re-add markers with new filters
      addWashPointOverlays();
    }
  }, [visibleWashLayers, washQualityFilter, washPointData]);

  // Update layers when data changes
  useEffect(() => {
    if (mapRef.current && mapInitialized.current && mapLoaded) {
      const timer = setTimeout(() => {
        initializeMapLayers();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [choroplethData, washPointData, activeChoropleth, showSubcountyBoundaries, showWardBoundaries, mapLoaded]);

  // Initialize map when boundaries are loaded
  useEffect(() => {
    if ((subcountyBoundaries || wardBoundaries) && mapRef.current && mapLoaded) {
      setTimeout(() => {
        if (mapRef.current && mapLoaded) {
          initializeMapLayers();
          flyToLocation();
        }
      }, 100);
    }
  }, [subcountyBoundaries, wardBoundaries, mapLoaded]);

  return (
    <div className="h-full w-full relative">
      <div className="bg-blue-50 p-3 border-b border-blue-200 text-sm text-blue-700 flex items-center justify-between">
          <span className="truncate mr-2">
      {loading ? 'Loading map data...' : null}
    </span>

        
        <div className="flex space-x-2 flex-shrink-0">
          <button
            onClick={() => {
              setShowSubcountyBoundaries(!showSubcountyBoundaries);
              toggleBoundaryVisibility('subcounty', !showSubcountyBoundaries);
            }}
            className="px-2 py-1 text-xs rounded whitespace-nowrap text-white"
            style={{ backgroundColor: '#818589' }}
            disabled={!subcountyBoundaries}
          >
            Subcounties ({(() => {
              const features = subcountyBoundaries?.features || [];
              if (!filters?.county) return features.length;
              if (filters?.subCounty) return 1;
              return features.filter(f =>
                f.properties?.parentname?.toLowerCase() === filters.county.toLowerCase()
              ).length;
            })()})
          </button>
          <button
            onClick={() => {
              setShowWardBoundaries(!showWardBoundaries);
              toggleBoundaryVisibility('ward', !showWardBoundaries);
            }}
            className="px-2 py-1 text-xs rounded whitespace-nowrap text-white"
            style={{ backgroundColor: '#818589' }}
            disabled={!wardBoundaries}
          >
            Wards ({(() => {
              const features = wardBoundaries?.features || [];
              if (!filters?.county) return features.length;
              if (filters?.subCounty) {
                return features.filter(f =>
                  f.properties?.county?.toLowerCase() === filters.county.toLowerCase() &&
                  f.properties?.subcounty?.toLowerCase() === filters.subCounty.toLowerCase()
                ).length;
              }
              return features.filter(f =>
                f.properties?.county?.toLowerCase() === filters.county.toLowerCase()
              ).length;
            })()})
          </button>
        </div>
      </div>

      {error && (
        <div className="absolute top-16 left-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-20">
          <strong>Error: </strong>{error}
        </div>
      )}

      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />
    </div>
  );
}