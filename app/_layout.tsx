import { AuthProvider, useAuth } from '@/utils/auth';
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

    const inAuthGroup = segments[0] === '(tabs)';
    const onLoginPage = segments[0] === 'login';

    if (!user && inAuthGroup) {
      router.replace('/login');
    }

    if (user && onLoginPage) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // HACK: Heartbeat para recordatorios en PWA (Web)
  useEffect(() => {
    if (!user) return;

    let lastNotifDate = '';

    const checkNotif = async () => {
      try {
        const enabled = await AsyncStorage.getItem('user_reminders');
        if (enabled !== 'true') return;

        const h = await AsyncStorage.getItem('user_reminders_h') || '20';
        const m = await AsyncStorage.getItem('user_reminders_m') || '30';
        
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
    if (!user) return;

    const checkMissedReminders = async () => {
      try {
        const enabled = await AsyncStorage.getItem('user_reminders');
        if (enabled !== 'true') return;

        const h = parseInt(await AsyncStorage.getItem('user_reminders_h') || '20');
        const m = parseInt(await AsyncStorage.getItem('user_reminders_m') || '30');

        const now = new Date();
        const currentH = now.getHours();
        const currentM = now.getMinutes();
        const todayKey = now.toDateString();

        const lastShown = await AsyncStorage.getItem('@last_rem_entry_today');
        
        // Si ha pasado la hora Y aún no hemos avisado hoy
        const currentTimeInMins = currentH * 60 + currentM;
        const targetTimeInMins = h * 60 + m;

        if (currentTimeInMins > targetTimeInMins && lastShown !== todayKey) {
            await AsyncStorage.setItem('@last_rem_entry_today', todayKey);
            
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

  if (loading || (!fontsLoaded && !fontError)) return null;

  return (
    <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <SanctuaryLock userName={user?.user_metadata?.name || 'Eliuth'}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="login" options={{ gestureEnabled: false }} />
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
      <RootStack />
    </AuthProvider>
  );
}
