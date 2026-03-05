import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

// Íconos flotantes decorativos
const FLOAT_ICONS = [
    { icon: 'trending-up', color: '#10B981', bg: '#ECFDF5', top: '18%', left: '8%', size: 20 },
    { icon: 'wallet-outline', color: '#7C3AED', bg: '#F5F3FF', top: '10%', right: '12%', size: 22 },
    { icon: 'receipt-outline', color: '#F59E0B', bg: '#FFFBEB', top: '38%', left: '5%', size: 18 },
    { icon: 'bar-chart-outline', color: '#3B82F6', bg: '#EFF6FF', top: '32%', right: '6%', size: 20 },
    { icon: 'shield-checkmark-outline', color: '#EF4444', bg: '#FEF2F2', top: '55%', left: '12%', size: 16 },
    { icon: 'flash-outline', color: '#8B5CF6', bg: '#F5F3FF', top: '50%', right: '10%', size: 18 },
];

export default function WelcomeScreen() {
    const router = useRouter();
    const { user, loading } = useAuth();

    const fade = useRef(new Animated.Value(0)).current;
    const slideUp = useRef(new Animated.Value(40)).current;
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (loading) return;

        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();

        // Pulso suave en el círculo central
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
            ])
        ).start();
    }, [loading]);

    const handleStart = () => {
        router.push(user ? '/(tabs)' : '/login');
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* ── Zona visual superior ─────────────────────────────── */}
            <View style={styles.visual}>
                {/* Círculos concéntricos de fondo */}
                <View style={styles.ring3} />
                <View style={styles.ring2} />
                <View style={styles.ring1} />

                {/* Círculo central animado */}
                <Animated.View style={[styles.centerCircle, { transform: [{ scale: pulse }] }]}>
                    <Ionicons name="wallet" size={52} color="#7C3AED" />
                </Animated.View>

                {/* Íconos flotantes */}
                {FLOAT_ICONS.map((item, i) => (
                    <View
                        key={i}
                        style={[
                            styles.floatIcon,
                            {
                                backgroundColor: item.bg,
                                top: item.top as any,
                                left: item.left as any,
                                right: item.right as any,
                            }
                        ]}
                    >
                        <Ionicons name={item.icon as any} size={item.size} color={item.color} />
                    </View>
                ))}
            </View>

            {/* ── Zona de contenido inferior ───────────────────────── */}
            <SafeAreaView style={styles.content}>
                <Animated.View style={{ opacity: fade, transform: [{ translateY: slideUp }] }}>

                    {/* Pill de marca */}
                    <View style={styles.brandPill}>
                        <MaterialCommunityIcons name="finance" size={14} color="#7C3AED" />
                        <Text style={styles.brandPillText}>FinanzasApp</Text>
                    </View>

                    {/* Headline */}
                    <Text style={styles.headline}>
                        Controla{' '}
                        <Text style={styles.headlineAccent}>cada peso</Text>
                        {'\n'}sin esfuerzo.
                    </Text>

                    <Text style={styles.sub}>
                        Registra ingresos, gastos y ahorros. Alcanza tus metas financieras desde el primer día.
                    </Text>

                    {/* Features en fila */}
                    <View style={styles.featRow}>
                        {[
                            { icon: 'checkmark-circle', label: 'Sin límites' },
                            { icon: 'lock-closed', label: 'Privado' },
                            { icon: 'flash', label: 'Instantáneo' },
                        ].map(f => (
                            <View key={f.label} style={styles.featItem}>
                                <Ionicons name={f.icon as any} size={16} color="#7C3AED" />
                                <Text style={styles.featLabel}>{f.label}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Botón */}
                    <TouchableOpacity style={styles.btn} onPress={handleStart} activeOpacity={0.85}>
                        <Text style={styles.btnText}>Empezar ahora</Text>
                        <View style={styles.btnArrow}>
                            <Ionicons name="arrow-forward" size={18} color="#7C3AED" />
                        </View>
                    </TouchableOpacity>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

const VISUAL_H = height * 0.46;
const CENTER_R = 72;
const R1 = 120, R2 = 170, R3 = 220;

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },

    // Visual
    visual: {
        height: VISUAL_H,
        backgroundColor: '#FAFAFF',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
    },
    ring3: {
        position: 'absolute', width: R3 * 2, height: R3 * 2, borderRadius: R3,
        borderWidth: 1, borderColor: 'rgba(124,58,237,0.06)',
        backgroundColor: 'rgba(124,58,237,0.025)',
    },
    ring2: {
        position: 'absolute', width: R2 * 2, height: R2 * 2, borderRadius: R2,
        borderWidth: 1, borderColor: 'rgba(124,58,237,0.09)',
        backgroundColor: 'rgba(124,58,237,0.04)',
    },
    ring1: {
        position: 'absolute', width: R1 * 2, height: R1 * 2, borderRadius: R1,
        borderWidth: 1, borderColor: 'rgba(124,58,237,0.15)',
        backgroundColor: 'rgba(124,58,237,0.06)',
    },
    centerCircle: {
        width: CENTER_R * 2, height: CENTER_R * 2, borderRadius: CENTER_R,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 12,
    },
    floatIcon: {
        position: 'absolute',
        width: 44, height: 44, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },

    // Contenido
    content: {
        flex: 1,
        paddingHorizontal: 28,
        justifyContent: 'center',
        paddingTop: 28,
        paddingBottom: Platform.OS === 'ios' ? 0 : 16,
    },
    brandPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        alignSelf: 'flex-start',
        backgroundColor: '#F5F3FF',
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, marginBottom: 20,
    },
    brandPillText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

    headline: {
        fontSize: 36,
        fontWeight: '900',
        color: '#0F172A',
        lineHeight: 44,
        letterSpacing: -1,
        marginBottom: 14,
    },
    headlineAccent: { color: '#7C3AED' },

    sub: {
        fontSize: 15,
        color: '#64748B',
        lineHeight: 23,
        marginBottom: 24,
    },

    featRow: {
        flexDirection: 'row', gap: 20, marginBottom: 32,
    },
    featItem: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
    },
    featLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },

    btn: {
        backgroundColor: '#F5F3FF',
        borderRadius: 18,
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        borderWidth: 1.5,
        borderColor: '#EDE9FE',
    },
    btnText: { fontSize: 17, fontWeight: '800', color: '#4C1D95' },
    btnArrow: {
        width: 36, height: 36, borderRadius: 12,
        backgroundColor: '#EDE9FE',
        justifyContent: 'center', alignItems: 'center',
    },
});
