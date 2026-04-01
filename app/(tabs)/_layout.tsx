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

  const isDebtsOrRestricted = (segments as string[]).some(s => ['debts', 'goals', 'cards', 'budgets'].includes(s));

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
          height: Platform.OS === 'ios' ? 80 : 62,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          zIndex: 100,
          display: isDesktop ? 'none' : 'flex',
          paddingBottom: Platform.OS === 'ios' ? 20 : 4,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}>

      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          href: '/',
          tabBarIcon: ({ color, focused }) => (
            <View style={[focused ? { backgroundColor: colorsNav.accent + '15' } : {}, styles.iconWrap]}>
              <Ionicons name="home" size={22} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          href: !isDesktop ? '/history' : null,
          tabBarIcon: ({ color, focused }) => (
            <View style={[focused ? { backgroundColor: colorsNav.accent + '15' } : {}, styles.iconWrap]}>
              <MaterialIcons name="receipt-long" size={22} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: 'Añadir',
          href: '/explore',
          tabBarItemStyle: isDebtsOrRestricted 
            ? { pointerEvents: 'none' as any, opacity: 0.5 } 
            : {},
          tabBarIcon: ({ focused }) => {
            return (
              <View 
                style={[
                  styles.fabButton, 
                  isDebtsOrRestricted && styles.fabButtonDisabled, 
                  { backgroundColor: colorsNav.accent }
                ]}
              >
                <MaterialIcons name="add" size={28} color="#FFFFFF" />
              </View>
            );
          },
          tabBarLabel: () => null,
        }}
        listeners={{
          tabPress: (e) => {
            if (isDebtsOrRestricted) {
              e.preventDefault();
            }
          },
        }}
      />

      <Tabs.Screen
        name="cards"
        options={{
          title: 'Cuentas',
          href: !isDesktop ? '/cards' : null, // Disable link on PC
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : styles.iconWrap}>
              <MaterialIcons name="account-balance-wallet" size={22} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          href: '/profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : styles.iconWrap}>
              <Ionicons name="person" size={22} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="invest"
        options={{
          title: 'Invertir',
          href: '/invest' as any,
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : styles.iconWrap}>
              <MaterialIcons name="show-chart" size={22} color={color} />
            </View>
          ),
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
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 32,
    borderRadius: 10,
  },
  activeIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 32,
    borderRadius: 10,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 0 : 20,
    top: Platform.OS === 'web' ? -10 : 0,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  fabButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
});
