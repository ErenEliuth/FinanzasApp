import { HapticTab } from '@/components/haptic-tab';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Tabs, usePathname, useSegments } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useAuth } from '@/utils/auth';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function TabLayout() {
  const pathname = usePathname();
  const segments = useSegments();
  const { theme } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const colorsNav = useThemeColors();
  const isDark = colorsNav.isDark;

  const isInvestOrRestricted = (segments as string[]).some(s => ['invest', 'debts', 'goals', 'budgets', 'explore'].includes(s));

  const colors = {
    bg: colorsNav.card,
    text: colorsNav.text,
    inactive: isDark ? '#64748B' : '#B0A89C',
    active: colorsNav.accent,
    border: colorsNav.border,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 34 : 24,
          left: 16,
          right: 16,
          height: 72,
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.98)',
          borderRadius: 36,
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.12,
          shadowRadius: 20,
          zIndex: 100,
          display: isDesktop || isInvestOrRestricted ? 'none' : 'flex',
          paddingBottom: 12,
          paddingTop: 12,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        },
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          href: '/',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'Gastos',
          href: !isDesktop ? '/history' : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "receipt" : "receipt-outline"} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Añadir',
          href: '/explore',
          tabBarItemStyle: isInvestOrRestricted 
            ? { pointerEvents: 'none' as any, opacity: 0.5 } 
            : {},
          tabBarIcon: ({ focused }) => {
            return (
              <View 
                style={[
                  styles.fabButton, 
                  isInvestOrRestricted && styles.fabButtonDisabled,
                  { backgroundColor: colorsNav.accent }
                ]}
              >
                <Ionicons name="swap-horizontal" size={26} color="#FFFFFF" />
              </View>
            );
          },
          tabBarLabel: () => null,
        }}
        listeners={{
          tabPress: (e) => {
            if (isInvestOrRestricted) {
              e.preventDefault();
            }
          },
        }}
      />

      <Tabs.Screen
        name="cards"
        options={{
          title: 'Cuentas',
          href: !isDesktop ? '/cards' : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          href: '/profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="invest"
        options={{
          title: 'Invertir',
          href: null,
        }}
      />

      <Tabs.Screen
        name="debts"
        options={{
          title: 'Deudas',
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fabButton: {
    width: 68,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
});
