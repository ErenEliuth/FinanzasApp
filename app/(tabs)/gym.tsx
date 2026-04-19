import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';

const MACHINES = [
  { id: '1', name: 'Prensa de 45°', img: 'fitness-center' },
  { id: '2', name: 'Sentadilla Hack', img: 'sports-gymnastics' },
  { id: '3', name: 'Sillón Cuádriceps', img: 'weekend' },
];

export default function GymScreen() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'setup' | 'routine'>('setup');
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [myMachines, setMyMachines] = useState<string[]>([]);
  const [routine, setRoutine] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadMyMachines();
    }
  }, [user]);

  const loadMyMachines = async () => {
    try {
      const { data, error } = await supabase
        .from('gym_machines')
        .select('machine_name')
        .eq('user_id', user?.id)
        .eq('is_available', true);

      if (error) throw error;
      
      const machinesArr = data ? data.map(m => m.machine_name) : [];
      setMyMachines(machinesArr);
      
      if (machinesArr.length > 0) {
        await generateRoutine(machinesArr);
      } else {
        setPhase('setup');
      }
    } catch (error) {
      console.error("Error cargando máquinas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwipe = async (hasMachine: boolean) => {
    const machineName = MACHINES[currentIndex].name;
    
    if (hasMachine) {
      const newMachines = [...myMachines, machineName];
      setMyMachines(newMachines);
      
      // Guardar en Supabase
      if (user) {
        await supabase.from('gym_machines').upsert({
          user_id: user.id,
          machine_name: machineName,
          is_available: true
        }, { onConflict: 'user_id, machine_name' });
      }
    }
    
    if (currentIndex < MACHINES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      const finalMachines = hasMachine ? [...myMachines, machineName] : myMachines;
      await generateRoutine(finalMachines);
    }
  };

  const generateRoutine = async (machinesToUse: string[]) => {
    const listToMap = machinesToUse.length > 0 ? machinesToUse : ['Sentadilla Libre (Sin equipo)'];
    
    // Obtenemos sugerencia de pesos de Supabase (El cerebro IA)
    const newRoutine = await Promise.all(listToMap.map(async (m, i) => {
      let suggestedWeight = '40kg'; // Defecto
      
      if (user) {
        const { data } = await supabase
          .from('gym_progress')
          .select('actual_weight, difficulty')
          .eq('user_id', user.id)
          .eq('exercise_name', m)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        if (data) {
           // Algoritmo IA: Si la última vez fue Fácil, aumentamos peso (simulando extraer el número)
           if (data.difficulty === 'Fácil') {
              const num = parseInt(data.actual_weight) || 40;
              suggestedWeight = `${num + 5}kg`;
           } else {
              suggestedWeight = data.actual_weight; // Mantenemos igual
           }
        }
      }

      return {
        id: `e${i}`,
        name: m,
        sets: 4, reps: 10, targetWeight: suggestedWeight, completed: false, actualWeight: '', difficulty: ''
      };
    }));
    
    setRoutine(newRoutine);
    setPhase('routine');
  };

  const completeExercise = async (index: number, weight: string, diff: string) => {
    const updated = [...routine];
    updated[index].completed = true;
    updated[index].actualWeight = weight;
    updated[index].difficulty = diff;
    setRoutine(updated);

    // Registrar en Supabase el progreso real
    if (user) {
      await supabase.from('gym_progress').insert({
        user_id: user.id,
        exercise_name: updated[index].name,
        actual_weight: weight,
        difficulty: diff
      });
    }
  };

  if (loading) {
    return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}><ActivityIndicator size="large" color={colors.accent} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Smart Gym</Text>
        <Text style={[styles.subtitle, { color: colors.text + '80' }]}>
          {phase === 'setup' ? 'Mapeando tu entorno 🔍' : 'Rutina Generada con IA 🤖'}
        </Text>
      </View>

      {phase === 'setup' ? (
        <View style={styles.cardContainer}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.progress}>
              <Text style={{ color: colors.text }}>{currentIndex + 1} / {MACHINES.length}</Text>
            </View>
            <MaterialIcons name={MACHINES[currentIndex].img as any || "fitness-center"} size={80} color={colors.accent} style={{ marginVertical: 20 }} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{MACHINES[currentIndex].name}</Text>
            <Text style={[styles.cardDesc, { color: colors.text + '80' }]}>
              ¿Tienes esta máquina disponible hoy en tu gimnasio?
            </Text>
            
            <View style={styles.swipeButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnNo]} onPress={() => handleSwipe(false)}>
                <MaterialIcons name="close" size={36} color="#EF4444" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnYes]} onPress={() => handleSwipe(true)}>
                <MaterialIcons name="check" size={36} color="#10B981" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <ScrollView style={styles.routineContainer}>
          {routine.map((ex, i) => (
            <View key={ex.id} style={[styles.exerciseCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.exHeader}>
                <Text style={[styles.exName, { color: colors.text }]}>{i+1}. {ex.name}</Text>
                {ex.completed ? <Ionicons name="checkmark-circle" size={24} color="#10B981" /> : null}
              </View>
              
              <Text style={[styles.exDetails, { color: colors.text + '80' }]}>
                Series: {ex.sets} • Reps: {ex.reps}
              </Text>
              
              {!ex.completed ? (
                <View style={styles.actionArea}>
                  <Text style={[styles.targetLabel, { color: colors.accent }]}>Peso Sugerido: {ex.targetWeight}</Text>
                  
                  <View style={styles.finishRow}>
                     <TouchableOpacity 
                      style={[styles.finishBtn, { backgroundColor: '#10B98120' }]}
                      onPress={() => completeExercise(i, ex.targetWeight, 'Fácil')}
                    >
                      <Text style={[styles.finishBtnText, { color: '#10B981' }]}>¡Fácil! (Subir después)</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.finishRow, { marginTop: 8 }]}>
                    <TouchableOpacity 
                      style={[styles.finishBtn, { backgroundColor: colors.accent + '20' }]}
                      onPress={() => completeExercise(i, ex.targetWeight, 'Normal')}
                    >
                      <Text style={[styles.finishBtnText, { color: colors.accent }]}>Normal ({ex.targetWeight})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.finishBtn, { backgroundColor: '#EF444420' }]}
                      onPress={() => completeExercise(i, 'Menos Peso', 'Difícil')}
                    >
                      <Text style={[styles.finishBtnText, { color: '#EF4444' }]}>Me costó/Menos peso</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[styles.completedBadge, { backgroundColor: '#10B98120' }]}>
                  <Text style={{ color: '#10B981', fontWeight: 'bold', textAlign: 'center' }}>
                    Registrado: {ex.actualWeight} ({ex.difficulty})
                  </Text>
                </View>
              )}
            </View>
          ))}
          
          <TouchableOpacity style={[styles.resetBtn, { backgroundColor: colors.accent }]} onPress={() => { setPhase('setup'); setCurrentIndex(0); setMyMachines([]); }}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Borrar y Re - Escanear Gym</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 24, paddingTop: 40 },
  title: { fontSize: 32, fontWeight: 'bold' },
  subtitle: { fontSize: 16, marginTop: 8 },
  cardContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', padding: 32, borderRadius: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 8 },
  progress: { position: 'absolute', top: 16, right: 16, backgroundColor: '#00000010', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  cardTitle: { fontSize: 28, fontWeight: 'bold', marginTop: 12, marginBottom: 12, textAlign: 'center' },
  cardDesc: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  swipeButtons: { flexDirection: 'row', gap: 30, justifyContent: 'center', width: '100%' },
  btn: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  btnNo: { borderColor: '#EF4444', backgroundColor: '#EF444415' },
  btnYes: { borderColor: '#10B981', backgroundColor: '#10B98115' },
  routineContainer: { flex: 1, padding: 24 },
  exerciseCard: { padding: 20, borderRadius: 16, marginBottom: 16 },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { fontSize: 20, fontWeight: 'bold' },
  exDetails: { fontSize: 14, marginTop: 4, marginBottom: 16 },
  actionArea: { marginTop: 8 },
  targetLabel: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  finishRow: { flexDirection: 'row', gap: 12 },
  finishBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  finishBtnText: { fontWeight: 'bold', fontSize: 14 },
  completedBadge: { marginTop: 12, padding: 12, borderRadius: 8, alignItems: 'center' },
  resetBtn: { padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 20, marginBottom: 40 }
});
