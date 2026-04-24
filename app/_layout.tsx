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
    if (Platform.OS === 'web') {
      window.onerror = (message, source, lineno, colno, error) => {
        alert(`CRASH DETECTED:\n${message}\nAt: ${source}:${lineno}:${colno}\nStack: ${error?.stack}`);
        return false;
      };
      window.onunhandledrejection = (event) => {
        alert(`ASYNC CRASH DETECTED:\n${event.reason}`);
      };
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup  = segments[0] === '(tabs)';
    const onLoginPage  = segments[0] === 'login';
    const onSetup      = segments[0] === 'currency-setup';

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
  }, [user, loading, segments, router]);

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
      <InteractiveTutorial />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
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
