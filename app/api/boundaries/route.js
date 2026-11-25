// app/api/boundaries/route.js
import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const boundaryType = searchParams.get('type');
    const countyFilters = searchParams.getAll('counties');

    let boundariesQuery;
    let params = [];

    if (boundaryType === 'subcounty') {
      boundariesQuery = `
        SELECT 
          name,
          parentname as county,
          ST_AsGeoJSON(wkb_geometry) as geojson,
          jsonb_build_object(
            'id', id,
            'code', code,
            'parentname', parentname
          ) as properties
        FROM subcounty_boundaries
        WHERE 1=1
      `;
      
      if (countyFilters && countyFilters.length > 0) {
        const countyConditions = countyFilters.map((_, index) => `parentname ILIKE $${index + 1}`).join(' OR ');
        boundariesQuery += ` AND (${countyConditions})`;
        params = countyFilters.map(county => `%${county}%`);
      }
      
    } else if (boundaryType === 'ward') {
      boundariesQuery = `
        SELECT 
          name,
          county,
          subcounty,
          ST_AsGeoJSON(wkb_geometry) as geojson,
          jsonb_build_object(
            'id', id,
            'code', code,
            'county', county,
            'subcounty', subcounty
          ) as properties
        FROM ward_boundaries
        WHERE 1=1
      `;
      
      if (countyFilters && countyFilters.length > 0) {
        const countyConditions = countyFilters.map((_, index) => {
          params.push(`%${countyFilters[index]}%`);
          return `county ILIKE $${index + 1}`;
        }).join(' OR ');
        boundariesQuery += ` AND (${countyConditions})`;
      }
      
    } else {
      return Response.json({ error: 'Invalid boundary type' }, { status: 400 });
    }

    const result = await query(boundariesQuery, params);
    
    if (result.rows.length === 0) {
      return Response.json({ type: 'FeatureCollection', features: [] });
    }

    const features = result.rows.map(row => {
      let geometry;
      try {
        geometry = JSON.parse(row.geojson);
      } catch (e) {
        return null;
      }

      return {
        type: 'Feature',
        geometry: geometry,
        properties: {
          name: row.name,
          county: row.county,
          subcounty: row.subcounty || null,
          ...row.properties
        }
      };
    }).filter(f => f !== null);

    return Response.json({
      type: 'FeatureCollection',
      features: features
    });
    
  } catch (error) {
    console.error('Error fetching boundary data:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
