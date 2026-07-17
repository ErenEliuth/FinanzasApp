const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectColumns() {
  console.log('Inserting standard row...');
  const { data, error } = await supabase.from('debts').insert([{
    user_id: 'a0e8d0e8-d0e8-d0e8-d0e8-d0e8d0e8d0e8',
    client: 'Inspection Temp Row',
    value: 100,
    paid: 0,
    due_date: '2026-07-17',
    debt_type: 'debt',
    created_date: new Date().toISOString()
  }]).select();

  if (error) {
    console.error('Error inserting row:', error);
  } else {
    console.log('Successfully inserted! Row keys:', Object.keys(data[0]));
    console.log('Row content:', data[0]);
    // clean up
    await supabase.from('debts').delete().eq('id', data[0].id);
  }
}

inspectColumns();
