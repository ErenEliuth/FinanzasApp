import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { syncDown } from './sync';
import { ThemeName } from '@/constants/Themes';
import { fetchExchangeRates } from '@/utils/currency';

WebBrowser.maybeCompleteAuthSession(); // Necesario para que el navegador se cierre tras el login

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    theme: ThemeName;
    toggleTheme: () => Promise<void>;
    setThemeConfig: (theme: ThemeName) => Promise<void>;
    currency: string;
    setCurrencyConfig: (currency: string) => Promise<void>;
    rates: Record<string, number>;
    setRatesConfig: (rates: Record<string, number>) => Promise<void>;
    syncRates: () => Promise<void>;
    isHidden: boolean;
    toggleHiddenMode: () => Promise<void>;
    login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
    register: (name: string, email: string, password: string) => Promise<{ success: boolean; message: string }>;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [theme, setTheme] = useState<ThemeName>('light');
    const [currency, setCurrency] = useState<string>('COP');
    const [rates, setRates] = useState<Record<string, number>>({ COP: 1, USD: 3950, EUR: 4250, DOP: 67 });
    const [isHidden, setIsHidden] = useState(false);
    useEffect(() => {
        // Cargar sesión inicial de Supabase
        supabase.auth.getSession().then(({ data: { session } }) => {
            const userId = session?.user?.id;
            setSession(session);
            setUser(session?.user ?? null);
            if (userId) syncDown(userId);
            setLoading(false);
        });

        // Escuchar cambios en el estado de autenticación (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const userId = session?.user?.id;
            setSession(session);
            setUser(session?.user ?? null);
            if (userId && (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED')) {
                syncDown(userId);
            }
            setLoading(false);
        });

        // Cargar tema
        const loadTheme = async () => {
            const storedTheme = await AsyncStorage.getItem('user_theme');
            const validThemes: ThemeName[] = ['light', 'dark', 'lavender', 'ocean', 'snow'];
            if (validThemes.includes(storedTheme as ThemeName)) {
                setTheme(storedTheme as ThemeName);
            }
            const storedCurrency = await AsyncStorage.getItem('user_currency');
            if (storedCurrency) {
                setCurrency(storedCurrency);
            }
            const storedRates = await AsyncStorage.getItem('user_rates');
            if (storedRates) {
                setRates(JSON.parse(storedRates));
            } else {
                syncRates();
            }
            const storedHidden = await AsyncStorage.getItem('user_hidden_mode');
            if (storedHidden === 'true') {
                setIsHidden(true);
            }
        };
        loadTheme();

        return () => subscription.unsubscribe();
    }, []);

    const toggleTheme = async () => {
        let nextTheme: ThemeName = 'light';
        if (theme === 'snow') nextTheme = 'light';
        else if (theme === 'light') nextTheme = 'dark';
        else if (theme === 'dark') nextTheme = 'lavender';
        else if (theme === 'lavender') nextTheme = 'ocean';
        else if (theme === 'ocean') nextTheme = 'snow';
        
        setTheme(nextTheme);
        await AsyncStorage.setItem('user_theme', nextTheme);
    };

    const setThemeConfig = async (newTheme: ThemeName) => {
        setTheme(newTheme);
        await AsyncStorage.setItem('user_theme', newTheme);
    };

    const setCurrencyConfig = async (newCurrency: string) => {
        setCurrency(newCurrency);
        await AsyncStorage.setItem('user_currency', newCurrency);
    };

    const setRatesConfig = async (newRates: Record<string, number>) => {
        setRates(newRates);
        await AsyncStorage.setItem('user_rates', JSON.stringify(newRates));
    };

    const syncRates = async () => {
        const newRates = await fetchExchangeRates();
        if (newRates) {
            await setRatesConfig(newRates);
        }
    };

    const toggleHiddenMode = async () => {
        const nextState = !isHidden;
        setIsHidden(nextState);
        await AsyncStorage.setItem('user_hidden_mode', nextState ? 'true' : 'false');
    };

    // ── Login ──────────────────────────────────────────────────────────────────
    const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password: password,
            });

            if (error) {
                return { success: false, message: error.message };
            }

            return { success: true, message: 'Bienvenido' };
        } catch (e: any) {
            console.error(e);
            return { success: false, message: 'Error al iniciar sesión.' };
        }
    };

    // ── Registro ──────────────────────────────────────────────────────────────
    const register = async (
        name: string,
        email: string,
        password: string
    ): Promise<{ success: boolean; message: string }> => {
        try {
            const emailClean = email.trim().toLowerCase();
            const nameClean = name.trim();

            if (!nameClean || !emailClean || !password) {
                return { success: false, message: 'Todos los campos son obligatorios.' };
            }

            // Registro en Supabase Auth
            const { error } = await supabase.auth.signUp({
                email: emailClean,
                password: password,
                options: {
                    data: {
                        name: nameClean,
                    }
                }
            });

            if (error) {
                return { success: false, message: error.message };
            }

            // Supabase crea el perfil automáticamente mediante un trigger en la base de datos.
            // No hacemos insert manual para evitar conflictos de foreign key.
            return { success: true, message: '¡Cuenta creada! Ya puedes iniciar sesión.' };
        } catch (e: any) {
            console.warn(e);
            return { success: false, message: 'Error al crear la cuenta.' };
        }
    };

    // ── Google Login ──────────────────────────────────────────────────────────
    // El login con Google requiere una build de desarrollo (expo-dev-client) o
    // una build de producción/testflight. NO funciona con Expo Go.
    const signInWithGoogle = async () => {
        try {
            // Usamos la URL del proyecto de Supabase como redirectTo porque
            // el deep link nativo (appmobile://) no funciona en Expo Go.
            const redirectUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co/auth/v1/callback';

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true,
                },
            });

            if (error) throw error;
            if (!data?.url) throw new Error('No se pudo obtener la URL de autenticación.');

            const res = await WebBrowser.openAuthSessionAsync(
                data.url,
                redirectUrl
            );

            if (res.type === 'success' && res.url) {
                // Extraer tokens del fragmento de la URL (#access_token=...)
                const fragmentPart = res.url.includes('#') ? res.url.split('#')[1] : res.url.split('?')[1];
                const params = new URLSearchParams(fragmentPart || '');
                const access_token = params.get('access_token');
                const refresh_token = params.get('refresh_token');

                if (access_token && refresh_token) {
                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token,
                        refresh_token,
                    });
                    if (sessionError) throw sessionError;
                } else {
                    // Fallback: intenta obtener la sesión que Supabase pudo haber seteado
                    await supabase.auth.getSession();
                }
            } else if (res.type === 'cancel') {
                // El usuario cerró el navegador, no hacer nada
                console.log('Login con Google cancelado por el usuario.');
            }
        } catch (error: any) {
            console.error('Error Google Login:', error);
            Alert.alert(
                'Error de Autenticación',
                error.message || 'No se pudo iniciar sesión con Google. Asegúrate de tener conexión a internet.'
            );
        }
    };

    // ── Logout ─────────────────────────────────────────────────────────────────
    const logout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, theme, toggleTheme, setThemeConfig, currency, setCurrencyConfig, rates, setRatesConfig, syncRates, isHidden, toggleHiddenMode, login, register, signInWithGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
}


// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    return ctx;
}

