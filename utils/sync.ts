import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SYNC_KEYS = {
    ACCOUNTS: (uid: string) => `@custom_accounts_${uid}`,
    CATEGORIES: (uid: string) => `@user_custom_categories_v2_${uid}`,
    CARDS: (uid: string) => `@cards_${uid}`,
    BUDGET_PERIOD: (uid: string) => `@budget_period_${uid}`,
    SMART_SAVINGS: (uid: string) => `@smart_savings_enabled_${uid}`,
    THEME: (uid: string) => `user_theme_${uid}`,
    CURRENCY: (uid: string) => `user_currency_${uid}`,
    HIDDEN_MODE: (uid: string) => `user_hidden_mode_${uid}`,
    REMINDERS: (uid: string) => `@user_reminders_config_${uid}`,
    TUTORIAL_SEEN: (uid: string) => `@tutorial_v1_seen_${uid}`,
    LOCK: (uid: string) => `@user_lock_config_${uid}`,
    INVEST_DIVS: (uid: string) => `@invest_divs_${uid}`,
    INVEST_SYNC: (uid: string) => `@invest_last_div_sync_${uid}`,
    INVEST_PERF: (uid: string) => `@invest_show_perf_${uid}`,
    INVEST_ALLOC: (uid: string) => `@invest_show_alloc_${uid}`,
    NOTIFS_DISMISSED: (uid: string) => `@dismissed_notifs_${uid}`,
    REMINDER_PROMPT_DISMISSED: (uid: string) => `@dismissed_reminder_prompt_${uid}`,
    ONBOARDING_DONE: (uid: string) => `@onboarding_done_${uid}`,
    CHANGELOG_SEEN: (uid: string) => `@last_seen_changelog_${uid}`,
};

/**
 * Sincroniza los datos locales hacia Supabase
 */
export async function syncUp(userId: string) {
    if (!userId) return;
    try {
        const [
            accounts, categories, cards, budgetPeriod, 
            smartSavings, theme, currency, hiddenMode, 
            reminders, tutorialSeen, lock,
            invDivs, invSync, invPerf, invAlloc, notifs,
            remPrompt, onboarding, changelog
        ] = await Promise.all([
            AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(userId)),
            AsyncStorage.getItem(SYNC_KEYS.CATEGORIES(userId)),
            AsyncStorage.getItem(SYNC_KEYS.CARDS(userId)),
            AsyncStorage.getItem(SYNC_KEYS.BUDGET_PERIOD(userId)),
            AsyncStorage.getItem(SYNC_KEYS.SMART_SAVINGS(userId)),
            AsyncStorage.getItem(SYNC_KEYS.THEME(userId)),
            AsyncStorage.getItem(SYNC_KEYS.CURRENCY(userId)),
            AsyncStorage.getItem(SYNC_KEYS.HIDDEN_MODE(userId)),
            AsyncStorage.getItem(SYNC_KEYS.REMINDERS(userId)),
            AsyncStorage.getItem(SYNC_KEYS.TUTORIAL_SEEN(userId)),
            AsyncStorage.getItem(SYNC_KEYS.LOCK(userId)),
            AsyncStorage.getItem(SYNC_KEYS.INVEST_DIVS(userId)),
            AsyncStorage.getItem(SYNC_KEYS.INVEST_SYNC(userId)),
            AsyncStorage.getItem(SYNC_KEYS.INVEST_PERF(userId)),
            AsyncStorage.getItem(SYNC_KEYS.INVEST_ALLOC(userId)),
            AsyncStorage.getItem(SYNC_KEYS.NOTIFS_DISMISSED(userId)),
            AsyncStorage.getItem(SYNC_KEYS.REMINDER_PROMPT_DISMISSED(userId)),
            AsyncStorage.getItem(SYNC_KEYS.ONBOARDING_DONE(userId)),
            AsyncStorage.getItem(SYNC_KEYS.CHANGELOG_SEEN(userId)),
        ]);

        const data = {
            accounts: accounts ? JSON.parse(accounts) : [],
            categories: categories ? JSON.parse(categories) : [],
            cards: cards ? JSON.parse(cards) : [],
            budget_period: budgetPeriod,
            smart_savings: smartSavings,
            theme,
            currency,
            hidden_mode: hiddenMode === 'true',
            reminders: reminders ? JSON.parse(reminders) : null,
            tutorial_seen: tutorialSeen === 'true',
            lock: lock ? JSON.parse(lock) : null,
            invest: {
                divs: invDivs,
                sync: invSync,
                perf: invPerf === 'true',
                alloc: invAlloc === 'true',
            },
            notifs_dismissed: notifs ? JSON.parse(notifs) : null,
            reminder_prompt_dismissed: remPrompt === 'true',
            onboarding_done: onboarding === 'true',
            changelog_seen: changelog,
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
    if (!userId) return null;
    try {
        const { data, error } = await supabase
            .from('user_configs')
            .select('data')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            console.log('No remote config found or error:', error?.message);
            return null;
        }

        const config = data.data;
        const tasks = [];

        if (config.accounts) tasks.push(AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(userId), JSON.stringify(config.accounts)));
        if (config.categories) tasks.push(AsyncStorage.setItem(SYNC_KEYS.CATEGORIES(userId), JSON.stringify(config.categories)));
        if (config.cards) tasks.push(AsyncStorage.setItem(SYNC_KEYS.CARDS(userId), JSON.stringify(config.cards)));
        if (config.budget_period) tasks.push(AsyncStorage.setItem(SYNC_KEYS.BUDGET_PERIOD(userId), config.budget_period));
        if (config.smart_savings) tasks.push(AsyncStorage.setItem(SYNC_KEYS.SMART_SAVINGS(userId), config.smart_savings));
        if (config.theme) tasks.push(AsyncStorage.setItem(SYNC_KEYS.THEME(userId), config.theme));
        if (config.currency) tasks.push(AsyncStorage.setItem(SYNC_KEYS.CURRENCY(userId), config.currency));
        if (config.hidden_mode !== undefined) tasks.push(AsyncStorage.setItem(SYNC_KEYS.HIDDEN_MODE(userId), String(config.hidden_mode)));
        if (config.reminders) tasks.push(AsyncStorage.setItem(SYNC_KEYS.REMINDERS(userId), JSON.stringify(config.reminders)));
        if (config.tutorial_seen !== undefined) tasks.push(AsyncStorage.setItem(SYNC_KEYS.TUTORIAL_SEEN(userId), String(config.tutorial_seen)));
        if (config.lock) tasks.push(AsyncStorage.setItem(SYNC_KEYS.LOCK(userId), JSON.stringify(config.lock)));
        
        if (config.invest) {
            if (config.invest.divs) tasks.push(AsyncStorage.setItem(SYNC_KEYS.INVEST_DIVS(userId), config.invest.divs));
            if (config.invest.sync) tasks.push(AsyncStorage.setItem(SYNC_KEYS.INVEST_SYNC(userId), config.invest.sync));
            if (config.invest.perf !== undefined) tasks.push(AsyncStorage.setItem(SYNC_KEYS.INVEST_PERF(userId), String(config.invest.perf)));
            if (config.invest.alloc !== undefined) tasks.push(AsyncStorage.setItem(SYNC_KEYS.INVEST_ALLOC(userId), String(config.invest.alloc)));
        }
        
        if (config.notifs_dismissed) tasks.push(AsyncStorage.setItem(SYNC_KEYS.NOTIFS_DISMISSED(userId), JSON.stringify(config.notifs_dismissed)));
        if (config.reminder_prompt_dismissed !== undefined) tasks.push(AsyncStorage.setItem(SYNC_KEYS.REMINDER_PROMPT_DISMISSED(userId), String(config.reminder_prompt_dismissed)));
        if (config.onboarding_done !== undefined) tasks.push(AsyncStorage.setItem(SYNC_KEYS.ONBOARDING_DONE(userId), String(config.onboarding_done)));
        if (config.changelog_seen) tasks.push(AsyncStorage.setItem(SYNC_KEYS.CHANGELOG_SEEN(userId), config.changelog_seen));

        await Promise.all(tasks);
        console.log('Sync down complete');
        return config;
    } catch (e) {
        console.error('Failed to sync down:', e);
        return null;
    }
}
