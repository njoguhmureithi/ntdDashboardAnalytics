// app/api/geographic-data/route.js
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Get unique counties
    const countiesQuery = `SELECT DISTINCT county FROM ward_context_summary WHERE county IS NOT NULL ORDER BY county`;
    const countiesResult = await query(countiesQuery);
    
    // Get unique subcounties with proper county association
    const subcountiesQuery = `
      SELECT DISTINCT county, subcounty 
      FROM ward_context_summary 
      WHERE county IS NOT NULL AND subcounty IS NOT NULL
      ORDER BY county, subcounty
    `;
    const subcountiesResult = await query(subcountiesQuery);
    
    // Get unique wards with proper county and subcounty association
    const wardsQuery = `
      SELECT DISTINCT county, subcounty, ward_name 
      FROM ward_context_summary 
      WHERE county IS NOT NULL AND subcounty IS NOT NULL AND ward_name IS NOT NULL
      ORDER BY county, subcounty, ward_name
    `;
    const wardsResult = await query(wardsQuery);
    
    // Organize the data properly
    const counties = countiesResult.rows
      .map(row => row.county)
      .filter(county => county !== null && county !== undefined && county.trim() !== '');
    
    const subCounties = {};
    subcountiesResult.rows.forEach(row => {
      if (row.county && row.subcounty) {
        if (!subCounties[row.county]) {
          subCounties[row.county] = [];
        }
        // Avoid duplicates
        if (!subCounties[row.county].includes(row.subcounty)) {
          subCounties[row.county].push(row.subcounty);
        }
      }
    });
    
    const wards = {};
    wardsResult.rows.forEach(row => {
      if (row.county && row.subcounty && row.ward_name) {
        const key = `${row.county}-${row.subcounty}`;
        if (!wards[key]) {
          wards[key] = [];
        }
        // Avoid duplicates
        if (!wards[key].includes(row.ward_name)) {
          wards[key].push(row.ward_name);
        }
      }
    });
    
    return Response.json({
      counties,
      subCounties,
      wards
    });
  } catch (error) {
    console.error('Error fetching geographic data:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}