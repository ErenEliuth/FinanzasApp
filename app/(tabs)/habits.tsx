import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';

export default function HabitsScreen() {
  const colors = useThemeColors();
  const [mode, setMode] = useState<'build' | 'quit'>('build');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Mis Hábitos</Text>
        
        <View style={[styles.modeToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'build' && { backgroundColor: '#10B98120' }]}
            onPress={() => setMode('build')}
          >
            <Text style={[styles.toggleText, { color: mode === 'build' ? '#10B981' : colors.text }]}>Construir</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'quit' && { backgroundColor: '#EF444420' }]}
            onPress={() => setMode('quit')}
          >
            <Text style={[styles.toggleText, { color: mode === 'quit' ? '#EF4444' : colors.text }]}>Dejar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {mode === 'build' ? (
          <View style={[styles.habitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.habitInfo}>
              <View style={[styles.iconWrap, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="water" size={24} color="#3B82F6" />
              </View>
              <View>
                <Text style={[styles.habitTitle, { color: colors.text }]}>Tomar Agua</Text>
                <Text style={[styles.habitStreak, { color: colors.text + '80' }]}>Racha: 12 días 🔥</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.checkBtn, { backgroundColor: '#10B98115', borderColor: '#10B981' }]}>
              <MaterialIcons name="done" size={24} color="#10B981" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.quitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.quitTitle, { color: colors.text }]}>Tiempo libre de Fumar</Text>
            <View style={styles.timerRow}>
              <View style={styles.timeBox}>
                <Text style={[styles.timeValue, { color: colors.accent }]}>14</Text>
                <Text style={[styles.timeLabel, { color: colors.text + '80' }]}>Días</Text>
              </View>
              <Text style={[styles.timeSeparator, { color: colors.text }]}>:</Text>
              <View style={styles.timeBox}>
                <Text style={[styles.timeValue, { color: colors.accent }]}>05</Text>
                <Text style={[styles.timeLabel, { color: colors.text + '80' }]}>Hrs</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.panicBtn, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.panicText}>Registrar Ansiedad 📓</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24, paddingTop: 40 },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
  modeToggle: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  toggleText: { fontSize: 16, fontWeight: '600' },
  content: { flex: 1, paddingHorizontal: 24 },
  habitCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, borderWidth: 1 },
  habitInfo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconWrap: { padding: 12, borderRadius: 12 },
  habitTitle: { fontSize: 18, fontWeight: '600' },
  habitStreak: { fontSize: 14, marginTop: 4 },
  checkBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  quitCard: { padding: 24, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  quitTitle: { fontSize: 18, fontWeight: '600', marginBottom: 24 },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 32 },
  timeBox: { alignItems: 'center', backgroundColor: '#00000010', padding: 16, borderRadius: 16, minWidth: 80 },
  timeValue: { fontSize: 32, fontWeight: 'bold' },
  timeLabel: { fontSize: 14, marginTop: 4 },
  timeSeparator: { fontSize: 32, fontWeight: 'bold', marginBottom: 16 },
  panicBtn: { paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, width: '100%', alignItems: 'center' },
  panicText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
