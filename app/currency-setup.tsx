/**
 * currency-setup.tsx
 * Shown ONCE to new users right after they log in for the first time.
 * Old users never see this — they land directly in /(tabs).
 */
import { useAuth } from '@/utils/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ActivityIndicator,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const CURRENCY_OPTIONS = [
    { code: 'COP', name: 'Peso Colombiano',    flag: '🇨🇴', hint: 'Colombia' },
    { code: 'USD', name: 'Dólar Americano',    flag: '🇺🇸', hint: 'Estados Unidos' },
    { code: 'EUR', name: 'Euro',               flag: '🇪🇺', hint: 'Zona Euro' },
    { code: 'DOP', name: 'Peso Dominicano',    flag: '🇩🇴', hint: 'República Dominicana' },
];

export default function CurrencySetupScreen() {
    const router = useRouter();
    const { setCurrencyConfig } = useAuth();
    const colors = useThemeColors();
    const isDark = colors.isDark;

    const [selected, setSelected] = useState('COP');
    const [saving, setSaving] = useState(false);

    const handleConfirm = async () => {
        setSaving(true);
        try {
            // Save currency preference
            await setCurrencyConfig(selected);
            // Mark setup as done so this screen never shows again
            await AsyncStorage.setItem('@currency_setup_done', 'true');
        } catch (e) {
            console.warn('[CurrencySetup] Error saving currency:', e);
        } finally {
            setSaving(false);
            // Go directly into the app
            router.replace('/(tabs)');
        }
    };

    return (
        <View style={[s.container, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={s.header}>
                        <View style={[s.globeContainer, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                            <Image
                                source={require('@/assets/images/icon.png')}
                                style={{ width: 80, height: 80 }}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={[s.title, { color: isDark ? '#FFF' : '#000' }]}>Configura tu moneda</Text>
                        <Text style={[s.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                            Tus ingresos, gastos y ahorros se mostrarán en esta moneda.{'\n'}
                            Puedes cambiarla después en tu Perfil.
                        </Text>
                    </View>

                    {/* Form Card */}
                    <View style={[s.mainCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <View style={s.list}>
                            {CURRENCY_OPTIONS.map(opt => {
                                const isSelected = selected === opt.code;
                                return (
                                    <TouchableOpacity
                                        key={opt.code}
                                        style={[
                                            s.card, 
                                            { borderColor: isDark ? '#334155' : '#E2E8F0' },
                                            isSelected && [s.cardSelected, { borderColor: isDark ? '#4F46E5' : '#4F46E5' }]
                                        ]}
                                        onPress={() => setSelected(opt.code)}
                                        activeOpacity={0.85}
                                    >
                                        <View style={s.cardLeft}>
                                            <Text style={s.flag}>{opt.flag}</Text>
                                            <View>
                                                <Text style={[s.cardName, { color: isDark ? '#FFF' : '#1E293B' }]}>
                                                    {opt.name}
                                                </Text>
                                                <Text style={s.cardHint}>{opt.hint} · {opt.code}</Text>
                                            </View>
                                        </View>
                                        <View style={[
                                            s.radio, 
                                            { borderColor: isDark ? '#334155' : '#CBD5E1' },
                                            isSelected && { borderColor: '#4F46E5', backgroundColor: '#4F46E5' }
                                        ]}>
                                            {isSelected && <View style={s.radioDot} />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={[s.btn, saving && s.btnDisabled, { backgroundColor: isDark ? '#4F46E5' : '#0F172A' }]}
                            onPress={handleConfirm}
                            disabled={saving}
                            activeOpacity={0.85}
                        >
                            {saving
                                ? <ActivityIndicator color="#FFF" />
                                : <Text style={s.btnText}>Comenzar con {selected} →</Text>
                            }
                        </TouchableOpacity>
                    </View>

                    <Text style={s.footerHint}>🔐 Tu elección es personal y segura</Text>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 60 : 40,
        paddingBottom: 40,
        justifyContent: 'center',
    },
    header: { alignItems: 'center', marginBottom: 32 },
    globeContainer: {
        width: 100,
        height: 100,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 8,
        marginBottom: 24,
    },
    globe: { fontSize: 50 },
    title: {
        fontSize: 28,
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        fontWeight: '500',
    },
    mainCard: {
        borderRadius: 32,
        padding: 24,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    list: { gap: 12, marginBottom: 24 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        backgroundColor: '#F8FAFC',
    },
    cardSelected: {
        backgroundColor: '#F0FDF4',
        borderColor: '#10B981',
    },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    flag: { fontSize: 32 },
    cardName: { fontSize: 16, fontWeight: '700' },
    cardHint: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
    radio: {
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2,
        justifyContent: 'center', alignItems: 'center',
    },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
    btn: {
        height: 60,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 4,
    },
    btnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0, elevation: 0 },
    btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
    footerHint: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 24, fontWeight: '600' },
});
