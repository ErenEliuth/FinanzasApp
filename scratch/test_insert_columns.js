const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testInsert() {
  const dummyRow = {
    user_id: 'a0e8d0e8-d0e8-d0e8-d0e8-d0e8d0e8d0e8',
    client: 'Test Loan Column Check',
    value: 1000,
    paid: 0,
    due_date: '2026-07-17',
    debt_type: 'loan_owe',
    created_date: new Date().toISOString(),
    // Let's test only metadata
    metadata: { test: true }
  };

  console.log('Testing insert with metadata...');
  const { data, error } = await supabase.from('debts').insert([dummyRow]).select();
  if (error) {
    console.log('Insertion failed. Error details:');
    console.log('Code:', error.code);
    console.log('Message:', error.message);
  } else {
    console.log('Insert succeeded! metadata exists!', data);
    await supabase.from('debts').delete().eq('id', data[0].id);
  }
}

testInsert();
