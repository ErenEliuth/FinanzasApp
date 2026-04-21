/**
 * currency-setup.tsx
 * Shown ONCE to new users right after they log in for the first time.
 * Old users never see this — they land directly in /(tabs).
 */
import { useAuth } from '@/utils/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
} from 'react-native';

const CURRENCY_OPTIONS = [
    { code: 'COP', name: 'Peso Colombiano',    flag: '🇨🇴', hint: 'Colombia' },
    { code: 'USD', name: 'Dólar Americano',    flag: '🇺🇸', hint: 'Estados Unidos' },
    { code: 'EUR', name: 'Euro',               flag: '🇪🇺', hint: 'Zona Euro' },
    { code: 'DOP', name: 'Peso Dominicano',    flag: '🇩🇴', hint: 'República Dominicana' },
];

export default function CurrencySetupScreen() {
    const router = useRouter();
    const { setCurrencyConfig } = useAuth();

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
        <SafeAreaView style={s.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <ScrollView
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={s.header}>
                    <Text style={s.globe}>🌍</Text>
                    <Text style={s.title}>¿Con qué moneda trabajas?</Text>
                    <Text style={s.subtitle}>
                        Tus ingresos, gastos y ahorros se mostrarán en esta moneda.{'\n'}
                        Puedes cambiarla cuando quieras desde tu Perfil.
                    </Text>
                </View>

                {/* Opciones */}
                <View style={s.list}>
                    {CURRENCY_OPTIONS.map(opt => {
                        const isSelected = selected === opt.code;
                        return (
                            <TouchableOpacity
                                key={opt.code}
                                style={[s.card, isSelected && s.cardSelected]}
                                onPress={() => setSelected(opt.code)}
                                activeOpacity={0.85}
                            >
                                <View style={s.cardLeft}>
                                    <Text style={s.flag}>{opt.flag}</Text>
                                    <View>
                                        <Text style={[s.cardName, isSelected && { color: '#0F172A' }]}>
                                            {opt.name}
                                        </Text>
                                        <Text style={s.cardHint}>{opt.hint} · {opt.code}</Text>
                                    </View>
                                </View>
                                {/* Radio button */}
                                <View style={[s.radio, isSelected && s.radioSelected]}>
                                    {isSelected && <View style={s.radioDot} />}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Confirmar */}
                <TouchableOpacity
                    style={[s.btn, saving && s.btnDisabled]}
                    onPress={handleConfirm}
                    disabled={saving}
                    activeOpacity={0.85}
                >
                    {saving
                        ? <ActivityIndicator color="#FFF" />
                        : <Text style={s.btnText}>Entrar con {selected} →</Text>
                    }
                </TouchableOpacity>

                <Text style={s.hint}>Esta elección se puede cambiar después en Perfil → Moneda</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'android' ? 60 : 50,
        paddingBottom: 50,
        justifyContent: 'center',
    },
    header: { alignItems: 'center', marginBottom: 40 },
    globe: { fontSize: 64, marginBottom: 20 },
    title: {
        fontSize: 26,
        fontWeight: '900',
        color: '#0F172A',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 23,
    },
    list: { gap: 12, marginBottom: 32 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 20,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#E2E8F0',
    },
    cardSelected: {
        backgroundColor: '#F0FDF4',
        borderColor: '#0F172A',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
    flag: { fontSize: 38 },
    cardName: { fontSize: 16, fontWeight: '700', color: '#334155' },
    cardHint: { fontSize: 12, color: '#94A3B8', fontWeight: '500', marginTop: 3 },
    radio: {
        width: 24, height: 24, borderRadius: 12,
        borderWidth: 2, borderColor: '#CBD5E1',
        justifyContent: 'center', alignItems: 'center',
    },
    radioSelected: { borderColor: '#0F172A', backgroundColor: '#0F172A' },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
    btn: {
        height: 62,
        backgroundColor: '#0F172A',
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    btnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0, elevation: 0 },
    btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
    hint: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 20 },
});
