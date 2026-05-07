import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, convertToBase } from '@/utils/currency';
import { getLocalISOString } from '@/utils/dateUtils';
import {
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const FINANCIAL_TIPS = [
    "No ahorres lo que te queda después de gastar; gasta lo que te queda después de ahorrar. - Warren Buffett",
    "La regla número 1 es nunca perder dinero. La regla número 2 es nunca olvidar la regla número 1. - Warren Buffett",
    "No es cuánto dinero ganas, sino cuánto dinero conservas. - Robert Kiyosaki",
    "La libertad financiera está disponible para aquellos que aprenden sobre ella y trabajan para obtenerla. - Robert Kiyosaki",
    "El hábito de ahorrar es en sí mismo una educación; fomenta todas las virtudes. - Thornton T. Munger",
    "Compra solo lo que estarías encantado de tener si el mercado cerrara durante 10 años. - Warren Buffett",
    "El interés compuesto es la octava maravilla del mundo. - Albert Einstein",
    "No busques el momento perfecto, solo comienza. El mejor momento para ahorrar fue ayer."
];

export default function ChallengeDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user, currency, rates, isHidden, customAccounts } = useAuth();
    const colors = useThemeColors();

    const [challenge, setChallenge] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');
    const [isProcessing, setIsProcessing] = useState(false);

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    useEffect(() => { loadChallenge(); }, [id]);

    const loadChallenge = async () => {
        if (!user || !id) return;
        try {
            const { data, error } = await supabase.from('saving_challenges').select('*').eq('id', id).single();
            if (error) throw error;
            setChallenge(data);
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo cargar el reto.');
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const handlePayAmount = async () => {
        if (selectedIndex === null || !challenge || isProcessing) return;
        setIsProcessing(true);
        
        try {
            const dailyAmounts = JSON.parse(challenge.daily_amounts);
            const amountToPay = dailyAmounts[selectedIndex];
            const completedIndices = JSON.parse(challenge.completed_indices);
            
            if (completedIndices.includes(selectedIndex)) {
                setIsProcessing(false);
                return;
            }

            const newCompleted = [...completedIndices, selectedIndex];
            const newAmount = challenge.current_amount + amountToPay;

            // --- Lógica de Racha ---
            const today = new Date().toISOString().split('T')[0];
            let newStreak = (challenge.current_streak || 0);
            const lastPayment = challenge.last_payment_date;

            if (!lastPayment) {
                newStreak = 1;
            } else {
                const lastDate = new Date(lastPayment);
                const todayDate = new Date(today);
                const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    newStreak += 1; // Consecutivo
                } else if (diffDays > 1) {
                    newStreak = 1; // Racha rota, empezamos de nuevo
                }
                // Si diffDays === 0, ya ahorró hoy, la racha se mantiene igual
            }

            // 1. Actualizar Reto
            const { error: updateError } = await supabase.from('saving_challenges').update({
                current_amount: newAmount,
                completed_indices: JSON.stringify(newCompleted),
                current_streak: newStreak,
                last_payment_date: today
            }).eq('id', challenge.id);

            if (updateError) throw updateError;

            // 2. Crear Transacción
            const { error: txError } = await supabase.from('transactions').insert([{
                user_id: user?.id,
                type: 'expense',
                amount: amountToPay,
                description: `Ahorro Reto: ${challenge.name}`,
                category: 'Ahorro',
                account: selectedAccount,
                date: getLocalISOString()
            }]);

            if (txError) throw txError;

            setPayModalVisible(false);
            setSelectedIndex(null);
            loadChallenge();
            
            const randomTip = FINANCIAL_TIPS[Math.floor(Math.random() * FINANCIAL_TIPS.length)];
            let streakMsg = `Has sumado ${fmt(amountToPay)} a tu reto. 🚀\n\n🧠 Tip del día:\n"${randomTip}"`;
            
            if (newStreak > 1) streakMsg = `¡Llevas una racha de ${newStreak} días! 🔥\n\n` + streakMsg;
            
            Alert.alert('¡Ahorrado!', streakMsg);
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo registrar el ahorro.');
        } finally {
            setIsProcessing(false);
        }
    };

    const getEquivalencies = (amount: number) => {
        // Valores estimados en COP
        const items = [
            { name: 'Cafés', price: 5000, icon: 'coffee' },
            { name: 'Cines', price: 15000, icon: 'movie' },
            { name: 'Hamburguesas', price: 25000, icon: 'fastfood' },
            { name: 'Suscripciones', price: 40000, icon: 'subscriptions' },
        ];

        return items.map(item => ({
            ...item,
            count: Math.floor(amount / item.price)
        })).filter(item => item.count > 0).slice(0, 2);
    };

    const getTierStyles = (pct: number) => {
        if (pct < 30) return { 
            colors: ['#A85E32', '#7A431D'], 
            label: 'BRONCE', 
            icon: 'medal-outline',
            sparkles: false 
        };
        if (pct < 70) return { 
            colors: ['#94A3B8', '#475569'], 
            label: 'PLATA', 
            icon: 'medal',
            sparkles: false 
        };
        return { 
            colors: ['#F59E0B', '#B45309'], 
            label: 'ORO', 
            icon: 'trophy',
            sparkles: true 
        };
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        );
    }

    const dailyAmounts = JSON.parse(challenge.daily_amounts || '[]');
    const completedIndices = JSON.parse(challenge.completed_indices || '[]');
    const pct = (completedIndices.length / dailyAmounts.length) * 100;

    const tier = getTierStyles(pct);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{challenge.name}</Text>
                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Meta: {fmt(challenge.target_amount)}</Text>
                </View>
                <TouchableOpacity onPress={() => {
                    Alert.alert('Eliminar Reto', '¿Estás seguro de que deseas eliminar este reto? Los fondos ya ahorrados se mantendrán en tu historial.', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Eliminar', style: 'destructive', onPress: async () => {
                            await supabase.from('saving_challenges').delete().eq('id', challenge.id);
                            router.back();
                        }}
                    ]);
                }} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 16, marginBottom: 30 }}>
                    {/* Summary Card - EVOLUTIVA */}
                    <LinearGradient 
                        colors={tier.colors as any} 
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={[styles.summaryCard, { flex: 2, marginBottom: 0 }]}
                    >
                        {tier.sparkles && (
                            <View style={StyleSheet.absoluteFill}>
                                <Ionicons name="star" size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: 10, left: 40 }} />
                                <Ionicons name="star" size={10} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', bottom: 20, right: 30 }} />
                                <Ionicons name="star" size={12} color="rgba(255,255,255,0.5)" style={{ position: 'absolute', top: 40, right: 80 }} />
                            </View>
                        )}
                        <View style={styles.summaryRow}>
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <Ionicons name={tier.icon as any} size={16} color="rgba(255,255,255,0.8)" />
                                    <Text style={styles.summaryLabel}>RANGO {tier.label}</Text>
                                </View>
                                <Text style={[styles.summaryVal, { fontSize: 18 }]}>{fmt(challenge.current_amount)}</Text>
                            </View>
                        </View>
                        <View style={styles.progressBg}>
                            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: '#FFF' }]} />
                        </View>
                        <Text style={[styles.summarySub, { fontSize: 10 }]}>{completedIndices.length}/{dailyAmounts.length} días</Text>
                    </LinearGradient>

                    {/* FRASCO VIRTUAL */}
                    <View style={[styles.jarContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.jarNeck} />
                        <View style={styles.jarBody}>
                            <View style={[styles.jarWater, { height: `${pct}%`, backgroundColor: tier.colors[0] }]} />
                            {/* Monedas flotantes */}
                            {completedIndices.length > 0 && (
                                <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center' }}>
                                    <Ionicons name="cash" size={20} color="rgba(255,255,255,0.6)" />
                                </View>
                            )}
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: colors.sub, marginTop: 8 }}>{Math.round(pct)}%</Text>
                    </View>
                </View>

                {/* Equivalencies Section */}
                {challenge.current_amount > 0 && (
                    <View style={[styles.equivCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', marginBottom: 12, letterSpacing: 1 }}>LO QUE HAS GANADO (EQUIVALENCIA)</Text>
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                            {getEquivalencies(challenge.current_amount).map((item, i) => (
                                <View key={i} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, padding: 12, borderRadius: 16 }}>
                                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + '15', justifyContent: 'center', alignItems: 'center' }}>
                                        <MaterialIcons name={item.icon as any} size={20} color={colors.accent} />
                                    </View>
                                    <View>
                                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{item.count}</Text>
                                        <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{item.name}</Text>
                                    </View>
                                </View>
                            ))}
                            {getEquivalencies(challenge.current_amount).length === 0 && (
                                <Text style={{ color: colors.sub, fontSize: 12, fontStyle: 'italic' }}>Sigue ahorrando para ver tus recompensas...</Text>
                            )}
                        </View>
                    </View>
                )}

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Tu Plan de Ahorro</Text>
                <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 20 }}>Toca un valor para marcarlo como ahorrado hoy.</Text>

                {/* Grid */}
                <View style={styles.grid}>
                    {dailyAmounts.map((amount: number, index: number) => {
                        const isPaid = completedIndices.includes(index);
                        return (
                            <TouchableOpacity 
                                key={index}
                                style={[
                                    styles.gridItem, 
                                    { backgroundColor: colors.card, borderColor: isPaid ? tier.colors[0] : colors.border }
                                ]}
                                onPress={() => {
                                    if (!isPaid) {
                                        setSelectedIndex(index);
                                        setPayModalVisible(true);
                                    }
                                }}
                            >
                                {isPaid && (
                                    <View style={[styles.fillWater, { backgroundColor: tier.colors[0] + '30' }]} />
                                )}
                                
                                <Text style={[styles.gridText, { color: isPaid ? tier.colors[0] : colors.text }]}>
                                    {convertCurrency(amount, currency, rates).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </Text>
                                {isPaid && (
                                    <View style={styles.check}>
                                        <Ionicons name="checkmark-circle" size={14} color={tier.colors[0]} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modal de Pago */}
            <Modal visible={payModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Confirmar Ahorro</Text>
                        <Text style={{ color: colors.sub, textAlign: 'center', marginBottom: 20 }}>
                            Vas a ahorrar {fmt(selectedIndex !== null ? dailyAmounts[selectedIndex] : 0)} el día de hoy.
                        </Text>
                        
                        <Text style={[styles.label, { color: colors.sub }]}>¿DE DÓNDE SALE EL DINERO?</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                            {['Efectivo', ...(customAccounts || [])].map(acc => (
                                <TouchableOpacity 
                                    key={acc}
                                    style={[styles.accBtn, { backgroundColor: selectedAccount === acc ? colors.accent : colors.bg, borderColor: colors.border }]}
                                    onPress={() => setSelectedAccount(acc)}
                                >
                                    <Text style={{ color: selectedAccount === acc ? '#FFF' : colors.text, fontWeight: '700' }}>{acc}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.accent }]} onPress={handlePayAmount} disabled={isProcessing}>
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>{isProcessing ? '...' : 'Ahorrar Ahora'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 20 },
    headerTitle: { fontSize: 20, fontWeight: '900' },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 20 },
    
    summaryCard: { borderRadius: 28, padding: 24, marginBottom: 30 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    summaryVal: { color: '#FFF', fontSize: 22, fontWeight: '900' },
    progressBg: { height: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
    progressFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 5 },
    summarySub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },

    jarContainer: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
    jarNeck: { width: 40, height: 8, backgroundColor: 'rgba(200,200,200,0.3)', borderRadius: 4, marginBottom: -2, zIndex: 1 },
    jarBody: { width: 60, height: 100, borderLeftWidth: 3, borderRightWidth: 3, borderBottomWidth: 3, borderColor: 'rgba(200,200,200,0.4)', borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: 'hidden', justifyContent: 'flex-end' },
    jarWater: { width: '100%', position: 'absolute', bottom: 0 },

    equivCard: { borderRadius: 24, padding: 20, marginBottom: 30, borderWidth: 1 },

    sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridItem: { width: '22%', aspectRatio: 1, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, overflow: 'hidden' },
    fillWater: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%' },
    gridText: { fontSize: 12, fontWeight: '800', zIndex: 1 },
    check: { position: 'absolute', top: 4, right: 4 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modal: { borderRadius: 32, padding: 24, alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
    label: { fontSize: 11, fontWeight: '800', alignSelf: 'flex-start', marginBottom: 12 },
    accBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginRight: 8, borderWidth: 1 },
    modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
    btn: { flex: 1, paddingVertical: 16, borderRadius: 18, alignItems: 'center' }
});
