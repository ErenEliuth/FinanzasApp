import { HapticTab } from '@/components/haptic-tab';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/utils/auth';

export default function TabLayout() {
  const pathname = usePathname();
  const { theme } = useAuth();
  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#1E293B' : '#FFFFFF',
    text: isDark ? '#F1F5F9' : '#1E293B',
    inactive: isDark ? '#64748B' : '#94A3B8',
    active: isDark ? '#818CF8' : '#6366F1',
    border: isDark ? '#334155' : '#E2E8F0',
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
          shadowColor: colors.active,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
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
          tabBarIcon: ({ focused }) => {
            const isDisabled = pathname === '/debts' || pathname === '/goals';
            return (
              <View style={[styles.fabButton, isDisabled && styles.fabButtonDisabled, isDark && !isDisabled && { backgroundColor: '#4F46E5' }]}>
                <MaterialIcons name="add" size={28} color="#FFFFFF" />
              </View>
            );
          },
          tabBarLabel: () => null,
        }}
        listeners={{
          tabPress: (e) => {
            if (pathname === '/debts' || pathname === '/goals') {
              e.preventDefault();
            }
          },
        }}
      />

      <Tabs.Screen
        name="debts"
        options={{
          title: 'Deudas',
          href: null, // Ocultar del tab bar — se accede desde el dashboard
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : styles.iconWrap}>
              <Ionicons name="person" size={22} color={color} />
            </View>
          ),
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
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabButtonDisabled: {
    backgroundColor: '#CBD5E1', // disabled gray
    shadowOpacity: 0,
    elevation: 0,
  },
});
