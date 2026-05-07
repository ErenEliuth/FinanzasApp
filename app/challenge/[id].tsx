import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, convertToBase } from '@/utils/currency';
import { getLocalISOString } from '@/utils/dateUtils';
import {
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ActivityIndicator,
    Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
                    newStreak += 1;
                } else if (diffDays > 1) {
                    newStreak = 1;
                }
            }

            const { error: updateError } = await supabase.from('saving_challenges').update({
                current_amount: newAmount,
                completed_indices: JSON.stringify(newCompleted),
                current_streak: newStreak,
                last_payment_date: today
            }).eq('id', challenge.id);

            if (updateError) throw updateError;

            await supabase.from('transactions').insert([{
                user_id: user?.id,
                type: 'expense',
                amount: amountToPay,
                description: `Ahorro Reto: ${challenge.name}`,
                category: 'Ahorro',
                account: selectedAccount,
                date: getLocalISOString()
            }]);

            setPayModalVisible(false);
            setSelectedIndex(null);
            loadChallenge();
            
            const randomTip = FINANCIAL_TIPS[Math.floor(Math.random() * FINANCIAL_TIPS.length)];
            Alert.alert('¡Ahorrado!', `Has sumado ${fmt(amountToPay)} a tu reto. 🚀\n\n🧠 Tip del día:\n"${randomTip}"`);
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo registrar el ahorro.');
        } finally {
            setIsProcessing(false);
        }
    };

    const getTierStyles = (pct: number) => {
        if (pct < 30) return { colors: ['#A85E32', '#7A431D'], label: 'BRONCE', icon: 'medal-outline' };
        if (pct < 70) return { colors: ['#94A3B8', '#475569'], label: 'PLATA', icon: 'medal' };
        return { colors: ['#F59E0B', '#B45309'], label: 'ORO', icon: 'trophy' };
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
    const pendingDays = dailyAmounts
        .map((amount: number, index: number) => ({ amount, index }))
        .filter((item: any) => !completedIndices.includes(item.index));

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
                    <Text style={[styles.headerTitle, { color: colors.text }]}>{challenge.name}</Text>
                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Meta: {fmt(challenge.target_amount)}</Text>
                </View>
                <TouchableOpacity onPress={() => {
                    Alert.alert('Eliminar Reto', '¿Deseas eliminar este reto?', [
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

            <View style={styles.content}>
                {/* JAR CENTER TOP */}
                <View style={styles.jarWrapper}>
                    <View style={[styles.jarContainer, { borderColor: colors.border }]}>
                        <View style={styles.jarNeck} />
                        <View style={[styles.jarBody, { borderColor: colors.border + '40' }]}>
                            <View style={[styles.jarWater, { height: `${pct}%`, backgroundColor: tier.colors[0] }]} />
                            {completedIndices.length > 0 && (
                                <View style={{ position: 'absolute', bottom: '20%', alignSelf: 'center' }}>
                                    <Ionicons name="cash" size={40} color="rgba(255,255,255,0.4)" />
                                </View>
                            )}
                        </View>
                    </View>
                    <View style={styles.statusBadge}>
                        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>{Math.round(pct)}%</Text>
                    </View>
                </View>

                {/* INFO CARDS */}
                <View style={styles.infoRow}>
                    <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                        <Text style={[styles.infoLabel, { color: colors.sub }]}>LLEVAMOS</Text>
                        <Text style={[styles.infoVal, { color: colors.text }]}>{fmt(challenge.current_amount)}</Text>
                    </View>
                    <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                        <Text style={[styles.infoLabel, { color: colors.sub }]}>RACHA</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.infoVal, { color: colors.text }]}>{challenge.current_streak || 0}</Text>
                            <Ionicons name="flame" size={16} color="#FF9F0A" />
                        </View>
                    </View>
                </View>

                {/* CAROUSEL OF PENDING DAYS */}
                <View style={{ flex: 1, marginTop: 20 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Próximos Ahorros</Text>
                    <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 20, marginLeft: 20 }}>Toca un día para completarlo.</Text>
                    
                    {pendingDays.length > 0 ? (
                        <FlatList
                            data={pendingDays}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                                    onPress={() => {
                                        setSelectedIndex(item.index);
                                        setPayModalVisible(true);
                                    }}
                                >
                                    <LinearGradient colors={[tier.colors[0], tier.colors[0] + '80']} style={styles.dayHeader}>
                                        <Text style={styles.dayHeaderText}>DÍA {item.index + 1}</Text>
                                    </LinearGradient>
                                    <View style={styles.dayBody}>
                                        <Text style={[styles.dayAmount, { color: colors.text }]}>
                                            {fmt(item.amount)}
                                        </Text>
                                        <View style={styles.saveBtn}>
                                            <Text style={styles.saveBtnText}>AHORRAR</Text>
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <View style={styles.allDone}>
                            <Ionicons name="trophy" size={60} color="#F59E0B" />
                            <Text style={[styles.allDoneTitle, { color: colors.text }]}>¡RETO COMPLETADO!</Text>
                            <Text style={[styles.allDoneSub, { color: colors.sub }]}>Has cumplido con todos los días de ahorro.</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Modal de Pago */}
            <Modal visible={payModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Confirmar Ahorro</Text>
                        <Text style={{ color: colors.sub, textAlign: 'center', marginBottom: 20 }}>
                            ¿Quieres ahorrar {fmt(selectedIndex !== null ? dailyAmounts[selectedIndex!] : 0)} hoy?
                        </Text>
                        
                        <Text style={[styles.label, { color: colors.sub }]}>¿DE DÓNDE SALE EL DINERO?</Text>
                        <FlatList 
                            horizontal
                            data={['Efectivo', ...(customAccounts || [])]}
                            showsHorizontalScrollIndicator={false}
                            style={{ marginBottom: 20, width: '100%' }}
                            renderItem={({ item: acc }) => (
                                <TouchableOpacity 
                                    style={[styles.accBtn, { backgroundColor: selectedAccount === acc ? colors.accent : colors.bg, borderColor: colors.border }]}
                                    onPress={() => setSelectedAccount(acc)}
                                >
                                    <Text style={{ color: selectedAccount === acc ? '#FFF' : colors.text, fontWeight: '700' }}>{acc}</Text>
                                </TouchableOpacity>
                            )}
                        />

                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.accent }]} onPress={handlePayAmount} disabled={isProcessing}>
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>{isProcessing ? '...' : 'Confirmar'}</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 10 },
    headerTitle: { fontSize: 20, fontWeight: '900' },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    content: { flex: 1 },
    
    jarWrapper: { alignItems: 'center', marginVertical: 30 },
    jarContainer: { width: 140, height: 200, alignItems: 'center', justifyContent: 'flex-end' },
    jarNeck: { width: 80, height: 16, backgroundColor: 'rgba(200,200,200,0.4)', borderRadius: 8, marginBottom: -4, zIndex: 1, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
    jarBody: { width: 140, height: 180, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 50, borderBottomRightRadius: 50, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: 'rgba(255,255,255,0.05)' },
    jarWater: { width: '100%', position: 'absolute', bottom: 0 },
    statusBadge: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: -20, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },

    infoRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
    infoBox: { flex: 1, padding: 16, borderRadius: 24, elevation: 2 },
    infoLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
    infoVal: { fontSize: 18, fontWeight: '900' },

    sectionTitle: { fontSize: 18, fontWeight: '900', marginLeft: 20 },
    dayCard: { width: width * 0.45, borderRadius: 24, borderWidth: 1, overflow: 'hidden', height: 180 },
    dayHeader: { paddingVertical: 10, alignItems: 'center' },
    dayHeaderText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
    dayBody: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
    dayAmount: { fontSize: 20, fontWeight: '900', marginBottom: 12 },
    saveBtn: { backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    saveBtnText: { fontSize: 11, fontWeight: '800', opacity: 0.7 },

    allDone: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    allDoneTitle: { fontSize: 22, fontWeight: '900', marginTop: 16 },
    allDoneSub: { fontSize: 14, fontWeight: '600', marginTop: 8 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modal: { borderRadius: 32, padding: 24, alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
    label: { fontSize: 11, fontWeight: '800', alignSelf: 'flex-start', marginBottom: 12 },
    accBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginRight: 8, borderWidth: 1, height: 40 },
    modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
    btn: { flex: 1, paddingVertical: 16, borderRadius: 18, alignItems: 'center' }
});
