import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency } from '@/utils/currency';
import { getLocalISOString } from '@/utils/dateUtils';
import { parseLocalDate } from '@/utils/dateUtils';
import {
    Alert, Modal, Platform, SafeAreaView, FlatList, ScrollView,
    StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Path, Circle, Text as SvgText } from 'react-native-svg';
import AnimatedJar from '@/components/AnimatedJar';

const { width } = Dimensions.get('window');

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

const parseData = (val: any) => {
    if (!val) return [];
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return []; } }
    return val;
};

export default function ChallengeDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user, currency, rates, isHidden, customAccounts } = useAuth();
    const colors = useThemeColors();

    const [challenge, setChallenge] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [completedModalVisible, setCompletedModalVisible] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');
    const [isProcessing, setIsProcessing] = useState(false);
    const [coinDrop, setCoinDrop] = useState(false);
    const [coinRemove, setCoinRemove] = useState(false);

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
            if (Platform.OS === 'web') window.alert('No se pudo cargar el reto.');
            else Alert.alert('Error', 'No se pudo cargar el reto.');
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const getAccountBalance = async (accountName: string): Promise<number> => {
        if (!user) return 0;
        try {
            const { data: txs } = await supabase.from('transactions').select('*').eq('user_id', user.id);
            if (!txs) return 0;
            let balance = 0;
            txs.forEach(tx => {
                const acc = tx.account || 'Efectivo';
                if (acc !== accountName) return;
                if (tx.type === 'income') balance += Number(tx.amount || 0);
                else balance -= Number(tx.amount || 0);
            });
            return balance;
        } catch { return 0; }
    };

    const handlePayAmount = async () => {
        if (selectedIndex === null || !challenge || isProcessing) return;
        setIsProcessing(true);
        try {
            const dailyAmounts = parseData(challenge.daily_amounts);
            const amountToPay = dailyAmounts[selectedIndex];
            const completedIndices = parseData(challenge.completed_indices);
            if (completedIndices.includes(selectedIndex)) { setIsProcessing(false); return; }

            // Validar saldo de la cuenta seleccionada
            const accountBalance = await getAccountBalance(selectedAccount);
            if (accountBalance < amountToPay) {
                setIsProcessing(false);
                const msg = `La cuenta "${selectedAccount}" no tiene saldo suficiente.\n\nDisponible: ${fmt(Math.max(0, accountBalance))}\nNecesitas: ${fmt(amountToPay)}`;
                if (Platform.OS === 'web') window.alert(msg);
                else Alert.alert('Saldo insuficiente', msg);
                return;
            }

            const newCompleted = [...completedIndices, selectedIndex];
            const newAmount = challenge.current_amount + amountToPay;
            const today = new Date().toISOString().split('T')[0];
            let newStreak = (challenge.current_streak || 0);
            const lastPayment = challenge.last_payment_date;

            if (!lastPayment) { newStreak = 1; }
            else {
                const diffDays = Math.ceil(Math.abs(new Date(today).getTime() - new Date(lastPayment).getTime()) / 86400000);
                newStreak = diffDays === 1 ? newStreak + 1 : 1;
            }

            const { error: updateError } = await supabase.from('saving_challenges').update({
                current_amount: newAmount,
                completed_indices: JSON.stringify(newCompleted),
                current_streak: newStreak,
                last_payment_date: today
            }).eq('id', challenge.id);
            if (updateError) throw updateError;

            await supabase.from('transactions').insert([{
                user_id: user?.id, type: 'expense', amount: amountToPay,
                description: `Ahorro Reto: ${challenge.name}`, category: 'Ahorro',
                account: selectedAccount, date: getLocalISOString()
            }]);

            setPayModalVisible(false);
            setSelectedIndex(null);
            // Trigger coin drop animation FIRST, then reload
            setCoinDrop(true);
            setTimeout(() => loadChallenge(), 300);

            const tip = FINANCIAL_TIPS[Math.floor(Math.random() * FINANCIAL_TIPS.length)];
            setTimeout(() => {
                if (Platform.OS === 'web') window.alert(`¡Ahorrado! ${fmt(amountToPay)} 🚀\n\n🧠 Tip:\n"${tip}"`);
                else Alert.alert('¡Ahorrado!', `Has sumado ${fmt(amountToPay)} a tu reto. 🚀\n\n🧠 Tip del día:\n"${tip}"`);
            }, 1200);
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo registrar el ahorro.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUndoPay = async (idx: number) => {
        if (!challenge || isProcessing) return;
        const doUndo = Platform.OS === 'web'
            ? window.confirm('¿Quieres anular el pago de este día?')
            : await new Promise(r => Alert.alert('Deshacer pago', '¿Anular el pago de este día?', [
                { text: 'No', onPress: () => r(false) },
                { text: 'Sí', style: 'destructive', onPress: () => r(true) }
            ]));
        if (!doUndo) return;

        setIsProcessing(true);
        try {
            const dailyAmounts = parseData(challenge.daily_amounts);
            const amountToUndo = dailyAmounts[idx];
            const completedIndices = parseData(challenge.completed_indices);
            const newCompleted = completedIndices.filter((i: number) => i !== idx);
            const newAmount = Math.max(0, challenge.current_amount - amountToUndo);

            const { error } = await supabase.from('saving_challenges').update({
                current_amount: newAmount, completed_indices: JSON.stringify(newCompleted),
            }).eq('id', challenge.id);
            if (error) throw error;

            await supabase.from('transactions').delete()
                .eq('user_id', user?.id)
                .eq('description', `Ahorro Reto: ${challenge.name}`)
                .eq('amount', amountToUndo)
                .limit(1);

            setCompletedModalVisible(false);
            // Trigger remove animation, then reload
            setCoinRemove(true);
            setTimeout(() => loadChallenge(), 300);

            setTimeout(() => {
                if (Platform.OS === 'web') window.alert('Pago deshecho correctamente.');
                else Alert.alert('Hecho', 'Se ha revertido el pago del día.');
            }, 1200);
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo deshacer el pago.');
        } finally {
            setIsProcessing(false);
        }
    };

    const getTier = (p: number) => {
        if (p < 30) return { colors: ['#A85E32', '#7A431D'], label: 'BRONCE' };
        if (p < 70) return { colors: ['#94A3B8', '#475569'], label: 'PLATA' };
        return { colors: ['#F59E0B', '#B45309'], label: 'ORO' };
    };

    const handleDelete = () => {
        const doIt = async () => {
            await supabase.from('saving_challenges').delete().eq('id', challenge.id);
            router.back();
        };
        if (Platform.OS === 'web') { if (window.confirm('¿Eliminar este reto?')) doIt(); }
        else Alert.alert('Eliminar Reto', '¿Deseas eliminar este reto?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: doIt }
        ]);
    };

    // --- LOADING / ERROR ---
    if (loading) return (
        <View style={[st.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={colors.accent} />
        </View>
    );
    if (!challenge) return (
        <View style={[st.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
            <Ionicons name="alert-circle-outline" size={60} color={colors.sub} />
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 16 }}>No se pudo cargar el reto</Text>
            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
                <Text style={{ color: colors.accent, fontWeight: '800' }}>Volver atrás</Text>
            </TouchableOpacity>
        </View>
    );

    // --- DATA ---
    const dailyAmounts = parseData(challenge.daily_amounts);
    const completedIndices = parseData(challenge.completed_indices);
    const pendingDays = dailyAmounts.map((amount: number, index: number) => ({ amount, index })).filter((i: any) => !completedIndices.includes(i.index));
    const totalDays = dailyAmounts.length || 1;
    const pct = Math.min(100, (completedIndices.length / totalDays) * 100);
    const tier = getTier(pct);

    return (
        <SafeAreaView style={[st.container, { backgroundColor: colors.bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Header */}
                <View style={st.header}>
                    <TouchableOpacity onPress={() => router.back()} style={[st.circleBtn, { backgroundColor: colors.card }]}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={[st.headerTitle, { color: colors.text }]}>{challenge.name}</Text>
                        <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Meta: {fmt(challenge.target_amount)}</Text>
                    </View>
                    <TouchableOpacity onPress={handleDelete} style={[st.circleBtn, { backgroundColor: colors.card }]}>
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>

                {/* Tier Badge */}
                <View style={{ alignSelf: 'center', marginTop: 8 }}>
                    <LinearGradient colors={tier.colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20 }}>
                        <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 2 }}>🏅 {tier.label}</Text>
                    </LinearGradient>
                </View>

                {/* ANIMATED JAR */}
                <View style={{ marginTop: 10 }}>
                    <AnimatedJar
                        pct={pct}
                        tierColor={tier.colors[0]}
                        coinCount={completedIndices.length}
                        showCoinDrop={coinDrop}
                        showCoinRemove={coinRemove}
                        isDark={colors.isDark}
                        onAnimDone={() => { setCoinDrop(false); setCoinRemove(false); }}
                    />
                </View>

                {/* INFO CARDS */}
                <View style={st.infoRow}>
                    <View style={[st.infoBox, { backgroundColor: colors.card }]}>
                        <Text style={[st.infoLabel, { color: colors.sub }]}>LLEVAMOS</Text>
                        <Text style={[st.infoVal, { color: colors.text }]}>{fmt(challenge.current_amount)}</Text>
                    </View>
                    <View style={[st.infoBox, { backgroundColor: colors.card }]}>
                        <Text style={[st.infoLabel, { color: colors.sub }]}>RACHA</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[st.infoVal, { color: colors.text }]}>{challenge.current_streak || 0}</Text>
                            <Ionicons name="flame" size={16} color="#FF9F0A" />
                        </View>
                    </View>
                    <View style={[st.infoBox, { backgroundColor: colors.card }]}>
                        <Text style={[st.infoLabel, { color: colors.sub }]}>FALTAN</Text>
                        <Text style={[st.infoVal, { color: colors.text }]}>{pendingDays.length}</Text>
                    </View>
                </View>

                {/* CAROUSEL */}
                <View style={{ marginTop: 24 }}>
                    <Text style={[st.sectionTitle, { color: colors.text }]}>Próximos Ahorros</Text>
                    <Text style={{ color: colors.sub, fontSize: 12, marginBottom: 16, marginLeft: 20 }}>Toca un día para completarlo</Text>

                    {pendingDays.length > 0 ? (
                        <FlatList
                            data={pendingDays}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                            keyExtractor={item => item.index.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => { setSelectedIndex(item.index); setPayModalVisible(true); }}
                                    activeOpacity={0.85}
                                    style={{ width: width * 0.52, height: 120 }}
                                >
                                    <Svg width="100%" height="100%" viewBox="0 0 220 110">
                                        {/* Bill background */}
                                        <Rect x="2" y="2" width="216" height="106" rx="10" fill="#4CAF50" />
                                        <Rect x="6" y="6" width="208" height="98" rx="8" fill="#66BB6A" stroke="#388E3C" strokeWidth="1.5" strokeDasharray="4 3" />
                                        <Rect x="12" y="12" width="196" height="86" rx="6" fill="#81C784" />
                                        {/* Corner ornaments */}
                                        <Path d="M 22 22 L 22 35 M 22 22 L 35 22" stroke="#388E3C" strokeWidth="2.5" strokeLinecap="round" />
                                        <Path d="M 198 22 L 198 35 M 198 22 L 185 22" stroke="#388E3C" strokeWidth="2.5" strokeLinecap="round" />
                                        <Path d="M 22 88 L 22 75 M 22 88 L 35 88" stroke="#388E3C" strokeWidth="2.5" strokeLinecap="round" />
                                        <Path d="M 198 88 L 198 75 M 198 88 L 185 88" stroke="#388E3C" strokeWidth="2.5" strokeLinecap="round" />
                                        {/* Dollar signs */}
                                        <SvgText x="32" y="42" fontSize="16" fontWeight="900" fill="#2E7D32" textAnchor="middle" opacity={0.6}>$</SvgText>
                                        <SvgText x="188" y="42" fontSize="16" fontWeight="900" fill="#2E7D32" textAnchor="middle" opacity={0.6}>$</SvgText>
                                        {/* Center circle */}
                                        <Circle cx="110" cy="52" r="28" fill="#66BB6A" stroke="#388E3C" strokeWidth="1.5" />
                                        <Circle cx="110" cy="52" r="22" fill="#81C784" stroke="#388E3C" strokeWidth="0.8" />
                                    </Svg>
                                    {/* Overlay text */}
                                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                                        <Text style={{ color: '#1B5E20', fontSize: 8, fontWeight: '900', letterSpacing: 2, marginBottom: 2 }}>DÍA {item.index + 1}</Text>
                                        <Text style={{ color: '#1B5E20', fontSize: 16, fontWeight: '900' }}>{fmt(item.amount)}</Text>
                                        <Text style={{ color: '#2E7D32', fontSize: 8, fontWeight: '700', marginTop: 4, opacity: 0.7 }}>TOCA PARA AHORRAR</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <View style={st.allDone}>
                            <Ionicons name="trophy" size={60} color="#F59E0B" />
                            <Text style={[st.allDoneTitle, { color: colors.text }]}>¡RETO COMPLETADO!</Text>
                            <Text style={[st.allDoneSub, { color: colors.sub }]}>Has cumplido con todos los días de ahorro.</Text>
                        </View>
                    )}
                </View>

                {completedIndices.length > 0 && (
                    <TouchableOpacity style={{ alignSelf: 'center', marginTop: 24, padding: 10 }} onPress={() => setCompletedModalVisible(true)}>
                        <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13, textDecorationLine: 'underline' }}>
                            Ver días completados ({completedIndices.length})
                        </Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* Modal Completados */}
            <Modal visible={completedModalVisible} transparent animationType="slide">
                <View style={st.overlay}>
                    <View style={[st.modal, { backgroundColor: colors.card, maxHeight: '80%' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 }}>
                            <Text style={[st.modalTitle, { color: colors.text, marginBottom: 0 }]}>Días Pagados</Text>
                            <TouchableOpacity onPress={() => setCompletedModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.sub} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={[...completedIndices].sort((a: number, b: number) => a - b)}
                            style={{ width: '100%' }}
                            keyExtractor={item => item.toString()}
                            renderItem={({ item: idx }) => (
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border + '20' }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFD70020', justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
                                        <Text style={{ fontSize: 18 }}>🪙</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text, fontWeight: '700' }}>Día {idx + 1}</Text>
                                        <Text style={{ color: colors.sub, fontSize: 12 }}>{fmt(dailyAmounts[idx])}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleUndoPay(idx)}
                                        style={{ backgroundColor: '#EF444415', padding: 10, borderRadius: 14 }}>
                                        <Ionicons name="arrow-undo" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* Modal Pago */}
            <Modal visible={payModalVisible} transparent animationType="fade">
                <View style={st.overlay}>
                    <View style={[st.modal, { backgroundColor: colors.card }]}>
                        <Text style={{ fontSize: 40, marginBottom: 8 }}>🪙</Text>
                        <Text style={[st.modalTitle, { color: colors.text }]}>Confirmar Ahorro</Text>
                        <Text style={{ color: colors.sub, textAlign: 'center', marginBottom: 20 }}>
                            ¿Quieres ahorrar {fmt(selectedIndex !== null ? dailyAmounts[selectedIndex!] : 0)} hoy?
                        </Text>
                        <Text style={[st.label, { color: colors.sub }]}>¿DE DÓNDE SALE EL DINERO?</Text>
                        <FlatList horizontal data={['Efectivo', ...(customAccounts || [])]}
                            showsHorizontalScrollIndicator={false}
                            style={{ marginBottom: 20, width: '100%' }}
                            renderItem={({ item: acc }) => (
                                <TouchableOpacity
                                    style={[st.accBtn, { backgroundColor: selectedAccount === acc ? colors.accent : colors.bg, borderColor: colors.border }]}
                                    onPress={() => setSelectedAccount(acc)}>
                                    <Text style={{ color: selectedAccount === acc ? '#FFF' : colors.text, fontWeight: '700' }}>{acc}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <View style={st.modalBtns}>
                            <TouchableOpacity style={[st.btn, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[st.btn, { backgroundColor: colors.accent }]} onPress={handlePayAmount} disabled={isProcessing}>
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>{isProcessing ? '...' : '💰 Ahorrar'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const st = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 6 },
    headerTitle: { fontSize: 20, fontWeight: '900' },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    infoRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 10 },
    infoBox: { flex: 1, padding: 14, borderRadius: 20, elevation: 2 },
    infoLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
    infoVal: { fontSize: 17, fontWeight: '900' },
    sectionTitle: { fontSize: 18, fontWeight: '900', marginLeft: 20 },
    dayCard: {
        width: width * 0.36, borderRadius: 22, borderWidth: 1, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    },
    dayBody: { flex: 1, paddingBottom: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
    dayAmount: { fontSize: 16, fontWeight: '800' },
    saveBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    allDone: { alignItems: 'center', paddingVertical: 40 },
    allDoneTitle: { fontSize: 22, fontWeight: '900', marginTop: 16 },
    allDoneSub: { fontSize: 14, fontWeight: '600', marginTop: 8 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modal: { borderRadius: 32, padding: 24, alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
    label: { fontSize: 11, fontWeight: '800', alignSelf: 'flex-start', marginBottom: 12 },
    accBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginRight: 8, borderWidth: 1, height: 40 },
    modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
    btn: { flex: 1, paddingVertical: 16, borderRadius: 18, alignItems: 'center' },
});
