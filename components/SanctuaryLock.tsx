import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  Dimensions, Animated, Platform, Alert, Image 
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { useThemeColors } from '@/hooks/useThemeColors';

const { width, height } = Dimensions.get('window');

export default function SanctuaryLock({ children, userName }: { children: React.ReactNode; userName: string }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [method, setMethod] = useState<'pin' | 'biometric'>('pin');
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const colorsNav = useThemeColors();
  const isDark = colorsNav.isDark;

  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    checkLockStatus();
  }, []);

  const checkLockStatus = async () => {
    try {
      const isEnabled = await AsyncStorage.getItem('@lock_enabled');
      if (isEnabled === 'true') {
        const storedMethod = await AsyncStorage.getItem('@lock_method') || 'pin';
        const storedPin = await AsyncStorage.getItem('@lock_pin') || '';
        setEnabled(true);
        setMethod(storedMethod as any);
        setSavedPin(storedPin);
        setLocked(true);
        
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

        if (storedMethod === 'biometric') {
           handleBiometric();
        }
      } else {
        setLocked(false);
      }
    } catch (e) {
      setLocked(false);
    }
  };

  const handleBiometric = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
       // Si no hay biometría, dejar que use el PIN
       return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Identifícate, Sanctuary ${userName || 'Usuario'}`,
      fallbackLabel: 'Usar PIN',
    });

    if (result.success) {
      unlock();
    }
  };

  const unlock = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      setLocked(false);
      setPin('');
    });
  };

  const pressKey = (key: string) => {
    if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === savedPin) {
          unlock();
        } else {
          setAttempts(a => a + 1);
          setPin('');
          if (attempts >= 2) {
             // Shake or alert?
          }
        }
      }
    }
  };

  const removeLast = () => setPin(pin.slice(0, -1));

  if (locked === false || locked === null) return <>{children}</>;

  return (
    <View style={styles.absoluteOuter}>
      {children}
      <Animated.View style={[styles.lockContainer, { opacity: fadeAnim }]}>
        <BlurView intensity={isDark ? 80 : 95} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        
        <View style={styles.content}>
           {/* Mascota Santy */}
           <View style={[styles.mascotCircle, { backgroundColor: colorsNav.accent + '20' }]}>
              <Text style={{ fontSize: 40 }}>🤖</Text>
           </View>

           <Text style={[styles.title, { color: colorsNav.text }]}>¡Tranquilo {userName || 'Usuario'}!</Text>
           <Text style={[styles.subtitle, { color: colorsNav.sub }]}>Tu santuario financiero está protegido</Text>

           {/* PIN Indicators */}
           <View style={styles.pinRow}>
              {[1, 2, 3, 4].map(i => (
                <View key={i} style={[
                  styles.dot, 
                  { borderColor: colorsNav.accent }, 
                  pin.length >= i && { backgroundColor: colorsNav.accent }
                ]} />
              ))}
           </View>

           {/* Keypad */}
           <View style={styles.keypad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <TouchableOpacity key={num} style={styles.key} onPress={() => pressKey(num.toString())}>
                  <Text style={[styles.keyText, { color: colorsNav.text }]}>{num}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.key} onPress={handleBiometric}>
                <Ionicons name="finger-print" size={28} color={method === 'biometric' ? colorsNav.accent : colorsNav.sub} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.key} onPress={() => pressKey('0')}>
                <Text style={[styles.keyText, { color: colorsNav.text }]}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.key} onPress={removeLast}>
                <Ionicons name="backspace-outline" size={24} color={colorsNav.sub} />
              </TouchableOpacity>
           </View>

           <Text style={[styles.footerText, { color: colorsNav.sub }]}>
             Toda tu información está cifrada localmente 🛡️
           </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteOuter: { flex: 1 },
  lockContainer: { ...StyleSheet.absoluteFillObject, zIndex: 9999 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  mascotCircle: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  subtitle: { fontSize: 14, fontWeight: '600', marginBottom: 40, textAlign: 'center' },
  pinRow: { flexDirection: 'row', gap: 15, marginBottom: 50 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  keypad: { width: '80%', flexWrap: 'wrap', flexDirection: 'row', justifyContent: 'center', gap: 20 },
  key: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  keyText: { fontSize: 28, fontWeight: '700' },
  footerText: { marginTop: 60, fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.7 }
});
