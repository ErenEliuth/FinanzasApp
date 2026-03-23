import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SYNC_KEYS = {
    ACCOUNTS: '@custom_accounts',
    CATEGORIES: '@user_custom_categories_v2',
    CARDS_PREFIX: '@cards_',
};

/**
 * Sincroniza los datos locales hacia Supabase
 */
export async function syncUp(userId: string) {
    try {
        const [accounts, categories, cards] = await Promise.all([
            AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS),
            AsyncStorage.getItem(SYNC_KEYS.CATEGORIES),
            AsyncStorage.getItem(`${SYNC_KEYS.CARDS_PREFIX}${userId}`),
        ]);

        const data = {
            accounts: accounts ? JSON.parse(accounts) : [],
            categories: categories ? JSON.parse(categories) : [],
            cards: cards ? JSON.parse(cards) : [],
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from('user_configs')
            .upsert({ user_id: userId, data, updated_at: data.updated_at });

        if (error) console.error('Error in syncUp:', error.message);
    } catch (e) {
        console.error('Failed to sync up:', e);
    }
}

/**
 * Descarga los datos de Supabase y los guarda localmente
 */
export async function syncDown(userId: string) {
    try {
        const { data, error } = await supabase
            .from('user_configs')
            .select('data')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            console.log('No remote config found or error:', error?.message);
            return;
        }

        const config = data.data;

        const tasks = [];
        if (config.accounts) tasks.push(AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS, JSON.stringify(config.accounts)));
        if (config.categories) tasks.push(AsyncStorage.setItem(SYNC_KEYS.CATEGORIES, JSON.stringify(config.categories)));
        if (config.cards) tasks.push(AsyncStorage.setItem(`${SYNC_KEYS.CARDS_PREFIX}${userId}`, JSON.stringify(config.cards)));

        await Promise.all(tasks);
        console.log('Sync down complete');
    } catch (e) {
        console.error('Failed to sync down:', e);
    }
}
