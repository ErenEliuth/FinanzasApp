import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform, ScrollView } from 'react-native';
import { useTutorial } from './TutorialContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/utils/auth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const TUTORIAL_CONTENT = {
  welcome: {
    title: '¡Bienvenido a Sanctuary! 🌿',
    desc: 'Vamos a aprender a usar tu paz financiera en 1 minuto. Te enseñaré cómo registrar tus movimientos para que tomes el control.',
    button: '¡Comencemos!',
    icon: 'auto-fix-high' as any,
    type: 'info',
  },
  add_income: {
    title: '1. Tu primer Ingreso 💰',
    desc: 'Toca el botón (+) y agrega un Ingreso llamado "Tutorial: Sueldo".',
    button: 'Esperando acción...',
    icon: 'trending-up',
    type: 'action',
  },
  add_transfer: {
    title: '2. Mueve tu dinero 🔄',
    desc: 'Toca (+) y ve a la pestaña "Mover". Pon "Tutorial: Movimiento".',
    button: 'Esperando acción...',
    icon: 'swap-horiz',
    type: 'action',
  },
  add_debt: {
    title: '3. Gastos Fijos y Deudas 💳',
    desc: 'Ve a la pestaña "Tarjetas" y agrega una deuda o gasto fijo llamado "Tutorial: Luz".',
    button: 'Esperando acción...',
    icon: 'credit-card',
    type: 'action',
  },
  add_goal: {
    title: '4. Sueña en grande 🎯',
    desc: 'En el Inicio, toca "Ahorro Total" y crea una meta llamada "Tutorial: Vacaciones".',
    button: 'Esperando acción...',
    icon: 'flag',
    type: 'action',
  },
  delete_tx: {
    title: '5. Tú tienes el control 🗑️',
    desc: 'Ve a "Historial", busca tu "Sueldo" de prueba y elimínalo.',
    button: 'Esperando acción...',
    icon: 'delete-sweep',
    type: 'action',
  },
  finish: {
    title: '¡Todo listo! 🥳',
    desc: 'Has aprendido las funciones clave. He borrado todos los datos de prueba automáticamente por ti.',
    button: 'Empezar de verdad',
    icon: 'check-circle',
    type: 'info',
  },
};

export const TutorialOverlay: React.FC = () => {
  const { step, startTutorial, finishTutorial, isTutorialMode } = useTutorial();
  const { user, theme } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  if (!user || !isTutorialMode || step === 'off') return null;

  const content = TUTORIAL_CONTENT[step as keyof typeof TUTORIAL_CONTENT];
  if (!content) return null;

  const handleAction = () => {
    if (step === 'welcome') startTutorial();
    else if (step === 'finish') finishTutorial();
  };

  const isActionStep = content.type === 'action';

  if (isActionStep) {
    // RENDER: Banner Superior (No bloquea la pantalla)
    return (
      <View style={[styles.headerContainer, { top: insets.top + 10 }]} pointerEvents="box-none">
        <View style={[
          styles.actionBanner, 
          { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: '#6366F1' }
        ]}>
          <View style={styles.actionIconBg}>
            <MaterialIcons name={content.icon} size={20} color="#6366F1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: isDark ? '#FFF' : '#1E293B' }]}>{content.title}</Text>
            <Text style={[styles.actionDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>{content.desc}</Text>
          </View>
        </View>
      </View>
    );
  }

  // RENDER: Modal Centrado (Bloquea con fondo oscuro)
  return (
    <View style={styles.fullscreenOverlay}>
      <View style={[styles.infoCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
        <View style={styles.infoIconBg}>
          <MaterialIcons name={content.icon} size={40} color="#6366F1" />
        </View>
        <Text style={[styles.infoTitle, { color: isDark ? '#FFF' : '#1E293B' }]}>{content.title}</Text>
        <Text style={[styles.infoDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>{content.desc}</Text>
        
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={handleAction}
          style={styles.infoButton}
        >
          <Text style={styles.infoButtonText}>{content.button}</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Action Banner Styles
  headerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999999,
  },
  actionBanner: {
    width: width * 0.92,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  actionIconBg: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  actionTitle: {
    fontSize: 13, fontWeight: '800', marginBottom: 2,
  },
  actionDesc: {
    fontSize: 11, fontWeight: '500', lineHeight: 14,
  },

  // Info Card Styles
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999,
    padding: 20,
  },
  infoCard: {
    width: '100%',
    padding: 30,
    borderRadius: 32,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  infoIconBg: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(99,102,241,0.1)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12,
  },
  infoDesc: {
    fontSize: 16, textAlign: 'center', marginBottom: 30, lineHeight: 24,
  },
  infoButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6366F1', paddingVertical: 16, paddingHorizontal: 30,
    borderRadius: 20, gap: 10, width: '100%',
  },
  infoButtonText: {
    color: '#FFF', fontSize: 16, fontWeight: '800',
  },
});
