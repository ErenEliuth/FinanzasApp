import { supabase } from './utils/supabase';

async function checkTables() {
    const { data, error } = await supabase.from('cards').select('*').limit(1);
    if (error) {
        console.log('Cards table error:', error.message);
    } else {
        console.log('Cards table exists!');
    }

    const { data: accData, error: accError } = await supabase.from('accounts').select('*').limit(1);
    if (accError) {
        console.log('Accounts table error:', accError.message);
    } else {
        console.log('Accounts table exists!');
    }
}

checkTables();
