import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
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
        style={[styles.headerIconBtn, { backgroundColor: colorsNav.accent, borderColor: colorsNav.accent + '33', borderWidth: 1 }]}
        onPress={() => setVisible(true)}
      >
        <Text style={{ fontSize: 18 }}>✨</Text>
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
