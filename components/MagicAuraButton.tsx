import React, { useState } from 'react';
import { TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuth } from '@/utils/auth';
import { AuraAI } from './AuraAI';

export const MagicAuraButton = () => {
  const [visible, setVisible] = useState(false);
  const colorsNav = useThemeColors();
  const { user } = useAuth();
  const isDark = colorsNav.isDark;

  return (
    <>
      <TouchableOpacity
        style={[styles.headerIconBtn, { backgroundColor: colorsNav.accent, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }]}
        onPress={() => setVisible(true)}
      >
        <Image 
          source={require('../assets/images/santy_eye.png')} 
          style={{ width: 24, height: 24, resizeMode: 'contain', borderRadius: 12 }} 
        />
      </TouchableOpacity>

      <AuraAI 
        visible={visible}
        onClose={() => setVisible(false)}
        userName={user?.user_metadata?.name || user?.email?.split('@')[0] || 'Amigo'}
      />
    </>
  );
};

const styles = StyleSheet.create({
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
