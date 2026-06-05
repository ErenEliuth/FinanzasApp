const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log('Checking Supabase connection...');
  try {
    const { data, error } = await supabase.from('push_subscriptions').select('*').limit(5);
    if (error) {
      console.error('Error querying push_subscriptions:', error);
    } else {
      console.log('Successfully queried push_subscriptions. Entries found:', data.length);
      console.log('Data:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

check();
