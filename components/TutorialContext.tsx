import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TutorialStep = 'off' | 'welcome' | 'add_income' | 'add_transfer' | 'add_debt' | 'add_goal' | 'delete_tx' | 'finish';

interface TutorialContextType {
  step: TutorialStep;
  isTutorialMode: boolean;
  startTutorial: () => void;
  nextStep: () => void;
  finishTutorial: () => void;
  setStep: (step: TutorialStep) => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [step, setStep] = useState<TutorialStep>('off');
  const [isTutorialMode, setIsTutorialMode] = useState(false);

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  const checkTutorialStatus = async () => {
    const hasSeen = await AsyncStorage.getItem('@tutorial_v1_seen');
    if (!hasSeen) {
      setStep('welcome');
      setIsTutorialMode(true);
    }
  };

  const startTutorial = () => {
    setStep('add_income');
    setIsTutorialMode(true);
  };

  const nextStep = () => {
    const steps: TutorialStep[] = ['welcome', 'add_income', 'add_transfer', 'add_debt', 'add_goal', 'delete_tx', 'finish'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex !== -1 && currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const finishTutorial = async () => {
    await AsyncStorage.setItem('@tutorial_v1_seen', 'true');
    setStep('off');
    setIsTutorialMode(false);
  };

  return (
    <TutorialContext.Provider value={{ step, isTutorialMode, startTutorial, nextStep, finishTutorial, setStep }}>
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
