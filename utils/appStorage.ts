import AsyncStorage from '@react-native-async-storage/async-storage';

// Claves de Almacenamiento Local
const KEYS = {
  HABITS: '@habits_data',
  GYM_MACHINES: '@gym_my_machines',
  GYM_PROGRESS: '@gym_progress_history',
};

// ==========================================
// MÓDULO DE GIMNASIO (SMART GYM)
// ==========================================

export const saveMyMachines = async (machines: string[]) => {
  try {
    await AsyncStorage.setItem(KEYS.GYM_MACHINES, JSON.stringify(machines));
  } catch (error) {
    console.error('Error saving machines', error);
  }
};

export const getMyMachines = async (): Promise<string[]> => {
  try {
    const data = await AsyncStorage.getItem(KEYS.GYM_MACHINES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    return [];
  }
};

// Guarda el peso y dificultad que el usuario logró en un ejercicio
export const saveExerciseProgress = async (exerciseName: string, actualWeight: string, difficulty: string) => {
  try {
    const existingStr = await AsyncStorage.getItem(KEYS.GYM_PROGRESS);
    const existing = existingStr ? JSON.parse(existingStr) : {};
    
    // Guardamos el último registro de ese ejercicio para calcular la siguiente rutina
    existing[exerciseName] = { 
      lastWeight: actualWeight, 
      lastDifficulty: difficulty,
      date: new Date().toISOString()
    };
    
    await AsyncStorage.setItem(KEYS.GYM_PROGRESS, JSON.stringify(existing));
  } catch (error) {
    console.error('Error saving progress', error);
  }
};

// Obtiene el peso sugerido basado en el historial del usuario
export const getSuggestedWeightForExercise = async (exerciseName: string, defaultWeight: string = '40kg') => {
  try {
    const existingStr = await AsyncStorage.getItem(KEYS.GYM_PROGRESS);
    if (!existingStr) return defaultWeight;

    const existing = JSON.parse(existingStr);
    const history = existing[exerciseName];

    if (history) {
      // Lógica simple IA: Si le fue Normal o Fácil, sugerir el mismo peso o un poco más.
      if (history.lastDifficulty === 'Fácil') {
        return `${parseInt(history.lastWeight) + 5}kg`; // Sube 5kg si fue fácil
      }
      return history.lastWeight; // Mantiene el peso si fue "Normal" o "Difícil"
    }

    return defaultWeight;
  } catch (error) {
    return defaultWeight;
  }
};

// ==========================================
// MÓDULO DE HÁBITOS
// ==========================================

export const saveHabits = async (habits: any) => {
  try {
    await AsyncStorage.setItem(KEYS.HABITS, JSON.stringify(habits));
  } catch (error) {
    console.error('Error saving habits', error);
  }
};

export const getHabits = async () => {
  try {
    const data = await AsyncStorage.getItem(KEYS.HABITS);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
};
