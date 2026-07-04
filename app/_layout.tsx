import { AuthProvider, useAuth } from '@/utils/auth';
import { TutorialProvider } from '@/components/TutorialContext';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';
import { THEMES, ThemeName } from '@/constants/Themes';
import { supabase } from '@/utils/supabase';

import { useFonts } from 'expo-font';
import { Feather, Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import SanctuaryLock from '@/components/SanctuaryLock';
import * as Notifications from 'expo-notifications';
import { SYNC_KEYS } from '@/utils/sync';
import { InteractiveTutorial } from '@/components/InteractiveTutorial';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync();

import * as SystemUI from 'expo-system-ui';

function RootStack() {
  const { user, loading, theme } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const colors = THEMES[theme as ThemeName] || THEMES.light;

  // Sincronizar el color de la barra de estado / tema de interfaz con el tema activo
  useEffect(() => {
    // Sincronizar fondo raíz nativo para evitar barra de estado de otro color
    SystemUI.setBackgroundColorAsync(colors.bg);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Usar el helper expuesto en +html.tsx para sincronizar el color de la barra
      if (typeof (window as any).__applyThemeColor === 'function') {
        (window as any).__applyThemeColor(colors.bg);
      } else {
        // Fallback: actualizar manualmente
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'theme-color');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', colors.bg);
        document.body.style.backgroundColor = colors.bg;
        document.documentElement.style.backgroundColor = colors.bg;
      }
    }
  }, [theme, colors.bg]);

  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...Feather.font,
    ...MaterialCommunityIcons.font,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      window.onerror = (message) => {
        console.error("Global Error:", message);
        return false;
      };
      window.onunhandledrejection = (event) => {
        console.error("Unhandled Rejection:", event.reason);
      };
    }
  }, []);

  // Detectar flujo de recuperación de contraseña.
  //
  // EL HASH DE LA URL ya fue borrado por Supabase antes de que React monte,
  // así que NO podemos leerlo aquí. En cambio, el script inline en +html.tsx
  // capturó el hash ANTES de que Supabase cargara y lo guardó en sessionStorage.
  // Nosotros solo leemos sessionStorage.
  const RECOVERY_KEY = 'sanctuary_password_recovery';
  const [isRecovering, setIsRecovering] = useState(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return sessionStorage.getItem(RECOVERY_KEY) === '1';
    }
    return false;
  });
  const recoveryHandled = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Backup: si el evento llega antes de que el script HTML lo capturara
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          sessionStorage.setItem(RECOVERY_KEY, '1');
        }
        setIsRecovering(true);
        if (!recoveryHandled.current) {
          recoveryHandled.current = true;
          setTimeout(() => {
            router.replace('/reset-password');
          }, 100);
        }
      }
      if (event === 'SIGNED_OUT') {
        // Limpiar todo cuando el usuario cierra sesión
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          sessionStorage.removeItem(RECOVERY_KEY);
        }
        setIsRecovering(false);
        recoveryHandled.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    const onLoginPage = segments[0] === 'login';
    const onSetup     = segments[0] === 'currency-setup';
    const onResetPass = segments[0] === 'reset-password';

    // Durante el flujo de recuperación de contraseña: bloquear CUALQUIER
    // redirección automática. El usuario debe quedarse en reset-password.
    if (isRecovering) {
      if (!onResetPass) {
        router.replace('/reset-password');
      }
      return;
    }

    if (!user && inAuthGroup) {
      router.replace('/login');
      return;
    }

    if (user && (onLoginPage || segments[0] === 'onboarding')) {
      const isSetupDone = user.user_metadata?.currency_setup_done === true;
      if (!isSetupDone) {
        router.replace('/currency-setup');
      } else {
        router.replace('/(tabs)');
      }
      return;
    }

    if (user && inAuthGroup && !onSetup) {
      const isSetupDone = user.user_metadata?.currency_setup_done === true;
      if (!isSetupDone) {
        router.replace('/currency-setup');
      }
    }
  }, [user, loading, segments, router, isRecovering]);

  useEffect(() => {
    const timeout = setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {});
    }, 5000);

    if (fontsLoaded || fontError) {
      clearTimeout(timeout);
      SplashScreen.hideAsync().catch(() => {});
    }
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const registerNotifications = async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    };
    registerNotifications();
  }, []);

  // HACK: Heartbeat para recordatorios
  useEffect(() => {
    if (!user) return;
    let lastNotifDate = '';
    const checkNotif = async () => {
      if (!user?.id) return;
      try {
        const raw = await AsyncStorage.getItem(SYNC_KEYS.REMINDERS(user.id));
        if (!raw) return;
        const config = JSON.parse(raw);
        if (!config.enabled) return;
        const h = config.h || 20;
        const m = config.m || 30;
        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const todayKey = now.toDateString();
        if (currentH === parseInt(h) && currentM === parseInt(m)) {
          if (lastNotifDate !== todayKey) {
            lastNotifDate = todayKey;
            if (Platform.OS === 'web') {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("💰 Sanctuary: ¡Es hora!", { body: "¿Ya anotaste tus gastos de hoy?", icon: "/favicon.png" });
              } else {
                import('react-native').then(({ Alert }) => {
                  Alert.alert("🔔 Recordatorio", "¿Ya anotaste tus gastos de hoy? Mantén tus finanzas al día.");
                });
              }
            }
          }
        }
      } catch (e) { }
    };
    const interval = setInterval(checkNotif, 30000);
    return () => clearInterval(interval);
  }, [user]);

  if (!fontsLoaded && !fontError) return null;

  const customTheme = {
    ...(colors.isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(colors.isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.bg,
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={customTheme}>
        <SanctuaryLock userName={user?.user_metadata?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Usuario'}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="login" options={{ gestureEnabled: false }} />
            <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
            <Stack.Screen name="currency-setup" options={{ gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
            <Stack.Screen name="goals" options={{ presentation: 'modal' }} />
          </Stack>
        </SanctuaryLock>
        {/* <InteractiveTutorial /> */}
        <StatusBar 
          style={colors.isDark ? 'light' : 'dark'} 
          backgroundColor={colors.bg} 
          translucent={Platform.OS === 'android'}
        />
      </ThemeProvider>
    </View>
  );
}

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  return (
    <AuthProvider>
      <TutorialProvider>
        <RootStack />
      </TutorialProvider>
    </AuthProvider>
  );
}
