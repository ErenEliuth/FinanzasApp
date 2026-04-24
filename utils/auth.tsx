import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { syncDown, syncUp, SYNC_KEYS } from './sync';
import { ThemeName, THEMES } from '@/constants/Themes';
import { fetchExchangeRates, areRatesStale, DEFAULT_RATES } from '@/utils/currency';

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
    ratesUpdatedAt: number | null;
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
    const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
    const [isHidden, setIsHidden] = useState(false);
    const [ratesUpdatedAt, setRatesUpdatedAt] = useState<number | null>(null);

    useEffect(() => {
        // Escuchar cambios en el estado de autenticación (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const userId = session?.user?.id;
            const newUser = session?.user ?? null;
            
            setSession(session);
            setUser(newUser);

            if (newUser) {
                // Si el usuario acaba de iniciar sesión, intentamos sincronizar y cargar sus preferencias
                if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
                    const remoteConfig = await syncDown(userId!);
                    if (remoteConfig) {
                        // Si hay config remota, la aplicamos al estado local inmediatamente
                        if (remoteConfig.theme) setTheme(remoteConfig.theme as ThemeName);
                        if (remoteConfig.currency) setCurrency(remoteConfig.currency);
                        if (remoteConfig.hidden_mode !== undefined) setIsHidden(remoteConfig.hidden_mode);
                    } else {
                        // Si no hay config remota, cargamos lo que haya en AsyncStorage localmente para este usuario
                        await loadUserPrefs(userId!);
                    }
                } else {
                    // Para otros eventos con usuario, cargamos preferencias locales
                    await loadUserPrefs(userId!);
                }
            } else {
                // LOGOUT: Resetear estados a valores por defecto para que el siguiente usuario no los herede
                setTheme('light');
                setCurrency('COP');
                setIsHidden(false);
            }

            setLoading(false);
        });

        const loadUserPrefs = async (userId: string) => {
            const [storedTheme, storedCurrency, storedHidden] = await Promise.all([
                AsyncStorage.getItem(SYNC_KEYS.THEME(userId)),
                AsyncStorage.getItem(SYNC_KEYS.CURRENCY(userId)),
                AsyncStorage.getItem(SYNC_KEYS.HIDDEN_MODE(userId))
            ]);

            if (storedTheme && Object.keys(THEMES).includes(storedTheme as string)) {
                setTheme(storedTheme as ThemeName);
            }
            if (storedCurrency) {
                setCurrency(storedCurrency);
            }
            if (storedHidden === 'true') {
                setIsHidden(true);
            } else if (storedHidden === 'false') {
                setIsHidden(false);
            }
        };

        // Cargar tasas de cambio (pueden ser compartidas ya que son globales)
        const loadGlobalRates = async () => {
            const storedRates = await AsyncStorage.getItem('user_rates');
            if (storedRates) {
                setRates(JSON.parse(storedRates));
            }
            const liveRates = await fetchExchangeRates(false);
            if (liveRates) {
                setRates(liveRates);
                setRatesUpdatedAt(Date.now());
                await AsyncStorage.setItem('user_rates', JSON.stringify(liveRates));
            }
        };

        loadGlobalRates();

        return () => subscription.unsubscribe();
    }, []);

    const toggleTheme = async () => {
        if (!user?.id) return;
        let nextTheme: ThemeName = 'light';
        if (theme === 'snow') nextTheme = 'light';
        else if (theme === 'light') nextTheme = 'dark';
        else if (theme === 'dark') nextTheme = 'lavender';
        else if (theme === 'lavender') nextTheme = 'ocean';
        else if (theme === 'ocean') nextTheme = 'nature';
        else if (theme === 'nature') nextTheme = 'midnight';
        else if (theme === 'midnight') nextTheme = 'sunset';
        else if (theme === 'sunset') nextTheme = 'snow';

        setTheme(nextTheme);
        await AsyncStorage.setItem(SYNC_KEYS.THEME(user.id), nextTheme);
        await syncUp(user.id);
        await supabase.auth.updateUser({ data: { theme: nextTheme } });
    };

    const setThemeConfig = async (newTheme: ThemeName) => {
        setTheme(newTheme);
        if (user?.id) {
            await AsyncStorage.setItem(SYNC_KEYS.THEME(user.id), newTheme);
            await syncUp(user.id);
            await supabase.auth.updateUser({ data: { theme: newTheme } });
        }
    };

    const setCurrencyConfig = async (newCurrency: string) => {
        if (!user?.id) return;
        setCurrency(newCurrency);
        await AsyncStorage.setItem(SYNC_KEYS.CURRENCY(user.id), newCurrency);
        await syncUp(user.id);

        // Persistent save in Supabase metadata if logged in
        if (user) {
            await supabase.auth.updateUser({
                data: { 
                    currency: newCurrency,
                    currency_setup_done: true 
                }
            });
        }

        // Refresh rates whenever the currency changes so conversions are always fresh
        const liveRates = await fetchExchangeRates(false);
        if (liveRates) {
            setRates(liveRates);
            setRatesUpdatedAt(Date.now());
            await AsyncStorage.setItem('user_rates', JSON.stringify(liveRates));
        }
    };

    const setRatesConfig = async (newRates: Record<string, number>) => {
        setRates(newRates);
        await AsyncStorage.setItem('user_rates', JSON.stringify(newRates));
    };

    const syncRates = async () => {
        const newRates = await fetchExchangeRates(true); // force refresh
        if (newRates) {
            setRates(newRates);
            setRatesUpdatedAt(Date.now());
            await AsyncStorage.setItem('user_rates', JSON.stringify(newRates));
        }
    };

    const toggleHiddenMode = async () => {
        if (!user?.id) return;
        const nextState = !isHidden;
        setIsHidden(nextState);
        await AsyncStorage.setItem(SYNC_KEYS.HIDDEN_MODE(user.id), nextState ? 'true' : 'false');
        await syncUp(user.id);
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
        <AuthContext.Provider value={{ user, session, loading, theme, toggleTheme, setThemeConfig, currency, setCurrencyConfig, rates, setRatesConfig, syncRates, ratesUpdatedAt, isHidden, toggleHiddenMode, login, register, signInWithGoogle, logout }}>
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

