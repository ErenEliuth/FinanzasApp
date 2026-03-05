import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import 'react-native-url-polyfill/auto';

// Estos valores los obtendrás de tu panel de Supabase: Project Settings > API
const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseAnonKey = 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT';

// Helper para persistencia segura de la sesión en móviles
const ExpoSecureStoreAdapter = {
    getItem: (key: string) => {
        return SecureStore.getItemAsync(key);
    },
    setItem: (key: string, value: string) => {
        SecureStore.setItemAsync(key, value);
    },
    removeItem: (key: string) => {
        SecureStore.deleteItemAsync(key);
    },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
