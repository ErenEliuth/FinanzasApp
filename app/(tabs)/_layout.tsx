import { HapticTab } from '@/components/haptic-tab';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Tabs, usePathname, useSegments } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/utils/auth';

export default function TabLayout() {
  const pathname = usePathname();
  const segments = useSegments();
  const { theme } = useAuth();
  const isDark = theme === 'dark';

  const isDebtsOrRestricted = (segments as string[]).some(s => ['debts', 'goals', 'cards', 'budgets'].includes(s));

  const colors = {
    bg: isDark ? '#1A1A2E' : '#FFFFFF',
    text: isDark ? '#F5F0E8' : '#2D2D2D',
    inactive: isDark ? '#64748B' : '#B0A89C',
    active: isDark ? '#7CC68E' : '#4A7C59',
    border: isDark ? '#3A3A52' : '#F0E8DC',
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
          bottom: 0,
          left: 0,
          right: 0,
          height: Platform.OS === 'ios' ? 80 : 65,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          paddingTop: 8,
          backgroundColor: colors.bg,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
          zIndex: 100,
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
            <View style={focused ? styles.activeIconWrap : styles.iconWrap}>
              <Ionicons name="home" size={22} color={color} />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          href: '/history',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : styles.iconWrap}>
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
                  isDark && !isDebtsOrRestricted && { backgroundColor: '#3D8B53' }
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
          href: '/cards',
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
        name="debts"
        options={{
          title: 'Deudas',
          href: null,
        }}
      />

      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Presupuestos',
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
    backgroundColor: 'rgba(74, 124, 89, 0.12)',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4A7C59',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 0 : 20,
    top: Platform.OS === 'web' ? -10 : 0,
    shadowColor: '#4A7C59',
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
