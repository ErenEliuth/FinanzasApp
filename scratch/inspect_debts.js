const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
  console.log('Fetching a row from debts table...');
  const { data, error } = await supabase.from('debts').select('*').limit(1);
  if (error) {
    console.error('Error fetching debt:', error);
  } else {
    console.log('Successfully fetched. Row keys:', data.length > 0 ? Object.keys(data[0]) : 'No rows found');
    if (data.length > 0) {
      console.log('Sample row:', data[0]);
    }
  }
}

inspect();
