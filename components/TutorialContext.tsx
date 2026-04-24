import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import { useAuth } from '@/utils/auth';

type TutorialStep = 
  | 'off' 
  | 'welcome' 
  | 'accounts' 
  | 'fixed_expenses' 
  | 'savings' 
  | 'movements' 
  | 'cards' 
  | 'profile' 
  | 'stats' 
  | 'advice' 
  | 'security' 
  | 'wealth' 
  | 'finish';

interface TutorialContextType {
  step: TutorialStep;
  isTutorialMode: boolean;
  startTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  finishTutorial: () => void;
  setStep: (step: TutorialStep) => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

const STEPS: TutorialStep[] = [
  'welcome', 
  'accounts', 
  'fixed_expenses', 
  'savings', 
  'movements', 
  'cards', 
  'profile', 
  'stats', 
  'advice', 
  'security', 
  'wealth', 
  'finish'
];

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [step, setStep] = useState<TutorialStep>('off');
  const [isTutorialMode, setIsTutorialMode] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) checkTutorialStatus();
  }, [user]);

  const checkTutorialStatus = async () => {
    if (!user?.id) return;
    try {
        const hasSeen = await AsyncStorage.getItem(SYNC_KEYS.TUTORIAL_SEEN(user.id));
        const forceDisable = await AsyncStorage.getItem('disable_tutorial_v1');
        
        if (!hasSeen && !forceDisable) {
          console.log('[Tutorial] Initializing for user:', user.id);
          setStep('welcome');
          setIsTutorialMode(true);
        }
    } catch (e) {
        console.warn('[Tutorial] Error checking status:', e);
    }
  };

  const startTutorial = () => {
    setStep('welcome');
    setIsTutorialMode(true);
  };

  const nextStep = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex !== -1 && currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    } else if (step === 'finish') {
        finishTutorial();
    }
  };

  const prevStep = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  };

  const finishTutorial = async () => {
    if (user?.id) {
        await AsyncStorage.setItem(SYNC_KEYS.TUTORIAL_SEEN(user.id), 'true');
        await syncUp(user.id);
    }
    setStep('off');
    setIsTutorialMode(false);
  };

  return (
    <TutorialContext.Provider value={{ step, isTutorialMode, startTutorial, nextStep, prevStep, finishTutorial, setStep }}>
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};
