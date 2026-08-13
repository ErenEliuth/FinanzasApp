const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkBalances() {
  // First, sign in to access the data (RLS)
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'ereneliuth@gmail.com',
    password: process.argv[2] || ''
  });
  
  if (authErr) {
    console.error('Auth error:', authErr.message);
    console.log('Usage: node check_balance.js <password>');
    
    // Try without auth - maybe RLS allows it
    console.log('\nTrying without auth...');
  } else {
    console.log('Signed in as:', authData.user?.email);
  }

  const userId = authData?.user?.id;
  
  // Get all transactions for this user
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('amount, type, account, category, description, date')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  
  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log(`\nTotal transactions: ${txs.length}`);
  
  // Calculate balances per account
  const balances = {};
  const balancesStr = {}; // Using string concatenation (the bug)
  const balancesNum = {}; // Using Number() conversion (the fix)
  
  txs.forEach(tx => {
    const acc = tx.account || 'Efectivo';
    if (!balances[acc]) { balances[acc] = 0; balancesStr[acc] = 0; balancesNum[acc] = 0; }
    
    // With Number() conversion (CORRECT)
    const amt = Number(tx.amount || 0);
    if (tx.type === 'income') {
      balancesNum[acc] += amt;
    } else {
      balancesNum[acc] -= amt;
    }
    
    // Without conversion (THE BUG) - simulating old code
    if (tx.type === 'income') {
      balancesStr[acc] = balancesStr[acc] + tx.amount;
    } else {
      balancesStr[acc] = balancesStr[acc] - tx.amount;
    }
  });
  
  console.log('\n=== BALANCES (Number() - CORRECTO) ===');
  Object.entries(balancesNum).forEach(([acc, bal]) => {
    console.log(`  ${acc}: ${bal}`);
  });
  
  console.log('\n=== BALANCES (sin conversión - BUG) ===');
  Object.entries(balancesStr).forEach(([acc, bal]) => {
    console.log(`  ${acc}: ${bal} (type: ${typeof bal})`);
  });
  
  // Show Efectivo transactions specifically
  console.log('\n=== Últimas 15 transacciones de Efectivo ===');
  const efectivoTxs = txs.filter(tx => tx.account === 'Efectivo');
  efectivoTxs.slice(-15).forEach(tx => {
    console.log(`  ${tx.type.padEnd(7)} | ${String(tx.amount).padStart(10)} (${typeof tx.amount}) | ${tx.category} | ${tx.description} | ${tx.date}`);
  });
  
  console.log('\n=== Últimas 15 transacciones de Nequi ===');
  const nequiTxs = txs.filter(tx => tx.account === 'Nequi');
  nequiTxs.slice(-15).forEach(tx => {
    console.log(`  ${tx.type.padEnd(7)} | ${String(tx.amount).padStart(10)} (${typeof tx.amount}) | ${tx.category} | ${tx.description} | ${tx.date}`);
  });
}

checkBalances().catch(console.error);
