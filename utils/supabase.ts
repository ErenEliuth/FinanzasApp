import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import 'react-native-url-polyfill/auto';

// Estos valores los obtendrás de tu panel de Supabase: Project Settings > API
const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

import { Platform } from 'react-native';

// Helper para persistencia segura de la sesión
const ExpoSecureStoreAdapter = {
    getItem: (key: string) => {
        if (Platform.OS === 'web') {
            if (typeof window === 'undefined') return Promise.resolve(null);
            return Promise.resolve(localStorage.getItem(key));
        }
        return SecureStore.getItemAsync(key);
    },
    setItem: (key: string, value: string) => {
        if (Platform.OS === 'web') {
            if (typeof window === 'undefined') return Promise.resolve();
            return Promise.resolve(localStorage.setItem(key, value));
        }
        return SecureStore.setItemAsync(key, value);
    },
    removeItem: (key: string) => {
        if (Platform.OS === 'web') {
            if (typeof window === 'undefined') return Promise.resolve();
            return Promise.resolve(localStorage.removeItem(key));
        }
        return SecureStore.deleteItemAsync(key);
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
});
