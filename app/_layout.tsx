// VERSION: 1.0.6 - GITHUB_PAGES_ULTIMATE_FONTS_FIX
import { AuthProvider, useAuth } from '@/utils/auth';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

// ─── Guard de autenticación ───────────────────────────────────────────────────

import { useFonts } from 'expo-font';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const INJECT_FONTS_WEB = `
  @font-face {
    font-family: 'Ionicons';
    src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/Ionicons.ttf') format('truetype');
  }
  @font-face {
    font-family: 'MaterialIcons';
    src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/MaterialIcons.ttf') format('truetype');
  }
  @font-face {
    font-family: 'Material Icons';
    src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/MaterialIcons.ttf') format('truetype');
  }
  @font-face {
    font-family: 'Feather';
    src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/Feather.ttf') format('truetype');
  }
  @font-face {
    font-family: 'MaterialCommunityIcons';
    src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/MaterialCommunityIcons.ttf') format('truetype');
  }
  @font-face {
    font-family: 'Material Community Icons';
    src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/MaterialCommunityIcons.ttf') format('truetype');
  }
  /* Aliases para asegurar compatibilidad con diferentes versiones de librerías */
  @font-face { font-family: 'ionicons'; src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/Ionicons.ttf') format('truetype'); }
  @font-face { font-family: 'feather'; src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/Feather.ttf') format('truetype'); }
  @font-face { font-family: 'material'; src: url('https://unpkg.com/react-native-vector-icons@latest/Fonts/MaterialIcons.ttf') format('truetype'); }
`;

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
      const id = 'expo-vector-icons-cdn';
      if (!document.getElementById(id)) {
        const style = document.createElement('style');
        style.id = id;
        style.textContent = INJECT_FONTS_WEB;
        document.head.appendChild(style);
      }
    }
  }, []);

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

  if (loading || (!fontsLoaded && !fontError)) return null;

  return (
    <ThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="goals" options={{ presentation: 'modal' }} />
      </Stack>
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

