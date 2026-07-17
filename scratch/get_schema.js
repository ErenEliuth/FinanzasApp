const fetch = require('node-fetch');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const apiKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

async function getSchema() {
  console.log('Fetching Supabase schema...');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }
    const schema = await res.json();
    console.log('Tables found:', Object.keys(schema.definitions));
    if (schema.definitions.debts) {
      console.log('debts columns:', Object.keys(schema.definitions.debts.properties));
      console.log('debts properties details:', schema.definitions.debts.properties);
    } else {
      console.log('debts definition not found.');
    }
  } catch (err) {
    console.error('Error fetching schema:', err);
  }
}

getSchema();
