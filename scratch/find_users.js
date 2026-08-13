const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  // Let's see if we can get anything from public tables
  const tables = ['user_configs', 'transactions', 'debts', 'goals', 'saving_challenges'];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      console.log(`Table ${t}:`, error ? `Error: ${error.message}` : `Success, rows: ${data.length}`);
      if (data && data.length > 0) {
        console.log(`Sample row from ${t}:`, data[0]);
      }
    } catch (e) {
      console.log(`Table ${t} failed:`, e.message);
    }
  }
}

check();
