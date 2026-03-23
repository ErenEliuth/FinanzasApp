import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/utils/auth';

type TutorialStep = 
  | 'welcome' 
  | 'add_income' 
  | 'add_transfer' 
  | 'add_debt' 
  | 'add_goal' 
  | 'delete_tx' 
  | 'finish' 
  | 'off';

interface TutorialContextType {
  step: TutorialStep;
  isTutorialMode: boolean;
  setStep: (step: TutorialStep) => void;
  startTutorial: () => void;
  completeStep: (current: TutorialStep) => void;
  finishTutorial: () => Promise<void>;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<TutorialStep>('off');

  useEffect(() => {
    const checkTutorial = async () => {
      if (!user) {
        setStep('off');
        return;
      }
      
      const done = await AsyncStorage.getItem(`@tutorial_done_${user.id}`);
      if (done === 'true') {
        setStep('off');
        return;
      }

      // Verificamos si realmente es una cuenta nueva (sin transacciones)
      try {
        const { count, error } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        
        if (!error && count && count > 0) {
          // Ya tiene datos, marcar como terminado y no mostrar
          await AsyncStorage.setItem(`@tutorial_done_${user.id}`, 'true');
          setStep('off');
        } else {
          setStep('welcome');
        }
      } catch (e) {
        setStep('off');
      }
    };
    checkTutorial();
  }, [user]);

  const startTutorial = () => setStep('add_income');

  const completeStep = (current: TutorialStep) => {
    if (step === current) {
      if (current === 'add_income') setStep('add_transfer');
      else if (current === 'add_transfer') setStep('add_debt');
      else if (current === 'add_debt') setStep('add_goal');
      else if (current === 'add_goal') setStep('delete_tx');
      else if (current === 'delete_tx') setStep('finish');
    }
  };

  const finishTutorial = async () => {
    if (!user) return;
    
    try {
      // 1. Limpiar datos de prueba
      // Borramos transacciones, deudas y metas que empiecen con "Tutorial:"
      await Promise.all([
        supabase.from('transactions').delete().eq('user_id', user.id).ilike('description', 'Tutorial:%'),
        supabase.from('debts').delete().eq('user_id', user.id).ilike('description', 'Tutorial:%'),
        supabase.from('goals').delete().eq('user_id', user.id).ilike('name', 'Tutorial:%'),
      ]);

      await AsyncStorage.setItem(`@tutorial_done_${user.id}`, 'true');
      setStep('off');
    } catch (e) {
      console.error('Error limpiando tutorial:', e);
      setStep('off');
    }
  };

  return (
    <TutorialContext.Provider value={{ 
      step, 
      isTutorialMode: step !== 'off', 
      setStep, 
      startTutorial, 
      completeStep, 
      finishTutorial 
    }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('useTutorial must be used within a TutorialProvider');
  return context;
};
