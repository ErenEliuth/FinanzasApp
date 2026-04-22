import { AuthProvider, useAuth } from '@/utils/auth';
import { TutorialProvider } from '@/components/TutorialContext';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useFonts } from 'expo-font';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import SanctuaryLock from '@/components/SanctuaryLock';
import * as Notifications from 'expo-notifications';

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

function RootStack() {
  const { user, loading, theme } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...Feather.font,
  });

  useEffect(() => {
    if (loading) return;

    const inAuthGroup  = segments[0] === '(tabs)';
    const onLoginPage  = segments[0] === 'login';
    const onSetup      = segments[0] === 'currency-setup';

    // ── Not logged in → go to login ──────────────────────────────────────────
    if (!user && inAuthGroup) {
      router.replace('/login');
      return;
    }

    // ── Logged in, coming from login/onboarding ─────────────────────────────
    if (user && (onLoginPage || segments[0] === 'onboarding')) {
      // Check if this specific user has already chosen their currency
      const isSetupDone = user.user_metadata?.currency_setup_done === true;
      
      if (!isSetupDone) {
        // New user or missing config → ask which currency they want to use
        router.replace('/currency-setup');
      } else {
        // Returning user → straight into the app
        router.replace('/(tabs)');
      }
      return;
    }

    // ── Check if user is in tabs but hasn't done setup ─────────────────────
    if (user && inAuthGroup && !onSetup) {
      const isSetupDone = user.user_metadata?.currency_setup_done === true;
      if (!isSetupDone) {
        // Force setup if they somehow landed in tabs without choosing currency
        router.replace('/currency-setup');
      }
    }
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
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

  // HACK: Heartbeat para recordatorios en PWA (Web)
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
            
            // Mostrar notificación o alerta
            if (Platform.OS === 'web') {
              // Intentar notificación nativa del navegador
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("💰 Sanctuary: ¡Es hora!", {
                  body: "¿Ya anotaste tus gastos de hoy?",
                  icon: "/favicon.png"
                });
              } else {
                // Fallback: Alerta interna
                import('react-native').then(({ Alert }) => {
                  Alert.alert("🔔 Recordatorio", "¿Ya anotaste tus gastos de hoy? Mantén tus finanzas al día.");
                });
              }
            }
          }
        }
      } catch (e) { }
    };

    const interval = setInterval(checkNotif, 30000); // Cada 30 segs
    return () => clearInterval(interval);
  }, [user]);

  // Chequeo de Recordatorio Pendiente al entrar (v11)
  useEffect(() => {
    if (!user?.id) return;

    const checkMissedReminders = async () => {
      try {
        const raw = await AsyncStorage.getItem(SYNC_KEYS.REMINDERS(user.id));
        if (!raw) return;
        const config = JSON.parse(raw);
        if (!config.enabled) return;

        const h = parseInt(config.h || '20');
        const m = parseInt(config.m || '30');

        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const todayKey = now.toDateString();

        const lastShown = await AsyncStorage.getItem(`@last_rem_entry_today_${user.id}`);
        
        // Si ha pasado la hora Y aún no hemos avisado hoy
        const currentTimeInMins = currentH * 60 + currentM;
        const targetTimeInMins = h * 60 + m;

        if (currentTimeInMins > targetTimeInMins && lastShown !== todayKey) {
            await AsyncStorage.setItem(`@last_rem_entry_today_${user.id}`, todayKey);
            
            // Un pequeño delay para que la app cargue
            setTimeout(() => {
                 import('react-native').then(({ Alert }) => {
                  Alert.alert(
                    "💰 ¡Hola de nuevo!",
                    "Notamos que se pasó tu recordatorio hoy. ¿Quieres anotar tus gastos ahora?",
                    [
                      { text: "Ahora no", style: "cancel" },
                      { text: "¡Sí, anotar!", onPress: () => router.push('/explore') }
                    ]
                  );
                });
            }, 2000);
        }
      } catch (e) { }
    };

    checkMissedReminders();
  }, [user]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <SanctuaryLock userName={user?.user_metadata?.name?.split(' ')[0] || 'Usuario'}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="login" options={{ gestureEnabled: false }} />
          <Stack.Screen name="currency-setup" options={{ gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
          <Stack.Screen name="goals" options={{ presentation: 'modal' }} />
        </Stack>
      </SanctuaryLock>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <TutorialProvider>
        <RootStack />
      </TutorialProvider>
    </AuthProvider>
  );
}
