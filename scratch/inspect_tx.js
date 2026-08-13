const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

console.log('Service Key defined:', !!supabaseServiceKey);

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

async function inspectTransactions() {
  console.log('Querying transactions...');
  const { data, error } = await supabase.from('transactions').select('*').order('id', { ascending: false }).limit(20);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Transactions count:', data.length);
    data.forEach(tx => {
      console.log(`ID: ${tx.id} | User: ${tx.user_id} | Account: ${tx.account} | Type: ${tx.type} | Amount: ${tx.amount} | Cat: ${tx.category} | Date: ${tx.date} | Desc: ${tx.description}`);
    });
  }
}

inspectTransactions();
