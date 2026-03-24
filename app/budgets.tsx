import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const CATEGORIES = [
    { name: 'Comida',          icon: 'restaurant',     color: '#E67E22' },
    { name: 'Transporte',      icon: 'directions-car', color: '#34495E' },
    { name: 'Hogar',           icon: 'home',           color: '#4A7C59' },
    { name: 'Salud',           icon: 'medical-services', color: '#16A085' },
    { name: 'Educación',       icon: 'school',         color: '#2980B9' },
    { name: 'Entretenimiento', icon: 'sports-esports', color: '#8E44AD' },
    { name: 'Ropa',            icon: 'checkroom',      color: '#D35400' },
    { name: 'Recibos',         icon: 'receipt',        color: '#7F8C8D' },
    { name: 'Gimnasio',        icon: 'fitness-center', color: '#27AE60' },
    { name: 'Otros',           icon: 'more-horiz',     color: '#95A5A6' },
];

export default function BudgetsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark';

    // ── Sanctuary Palette ──
    const colors = isDark 
        ? { bg: '#1A1A2E', card: '#25253D', text: '#F5F0E8', sub: '#A09B8C', border: '#3A3A52', accent: '#4A7C59', lightAccent: '#4A7C5930', input: '#1A1A2E' }
        : { bg: '#FFF8F0', card: '#FFFFFF', text: '#2D2D2D', sub: '#8B8680', border: '#F0E8DC', accent: '#4A7C59', lightAccent: '#E8F5E9', input: '#F5EDE0' };

    const [budgets, setBudgets] = useState<any[]>([]);
    const [spending, setSpending] = useState<Record<string, number>>({});
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedCat, setSelectedCat] = useState(CATEGORIES[0]);
    const [limitAmount, setLimitAmount] = useState('');

    useEffect(() => { if (isFocused) loadData(); }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            const { data: budgetData } = await supabase.from('budgets').select('*').eq('user_id', user.id);
            setBudgets(budgetData || []);
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
            const { data: txData } = await supabase.from('transactions').select('category, amount').eq('user_id', user.id).eq('type', 'expense').neq('category', 'Ahorro').gte('date', startOfMonth);
            const totals: Record<string, number> = {};
            txData?.forEach(tx => {
                const cat = tx.category || 'Otros';
                totals[cat] = (totals[cat] || 0) + tx.amount;
            });
            setSpending(totals);
        } catch (e) { console.error(e); }
    };

    const fmt = (n: number) => isHidden ? '****' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
    const formatInput = (text: string) => {
        const clean = text.replace(/\D/g, '');
        if (!clean) return '';
        return new Intl.NumberFormat('es-CO').format(parseInt(clean, 10));
    };

    const handleSaveBudget = async () => {
        const val = parseFloat(limitAmount.replace(/\./g, '').replace(',', '.'));
        if (isNaN(val) || val <= 0) return;
        try {
            await supabase.from('budgets').upsert([{ user_id: user?.id, category: selectedCat.name, monthly_limit: val }], { onConflict: 'user_id,category' });
            setLimitAmount(''); setModalVisible(false); loadData();
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (budget: any) => {
        const msg = `¿Quitar el límite para "${budget.category}"?`;
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) { await supabase.from('budgets').delete().eq('id', budget.id); loadData(); }
            return;
        }
        Alert.alert('Eliminar presupuesto', msg, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: async () => { await supabase.from('budgets').delete().eq('id', budget.id); loadData(); } }
        ]);
    };

    const openModal = (cat: typeof CATEGORIES[0], existing?: any) => {
        setSelectedCat(cat);
        setLimitAmount(existing ? String(existing.monthly_limit).replace(/\./g, '') : '');
        setModalVisible(true);
    };

    const monthName = new Date().toLocaleString('es-CO', { month: 'long', year: 'numeric' });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Presupuestos</Text>
                    <Text style={[styles.headerSub, { color: colors.sub }]}>{monthName}</Text>
                </View>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Banner */}
                <View style={[styles.banner, { backgroundColor: colors.accent + '10' }]}>
                    <Ionicons name="bulb" size={20} color={colors.accent} />
                    <Text style={[styles.bannerTxt, { color: colors.sub }]}>Controla tus gastos definiendo límites mensuales por categoría.</Text>
                </View>

                {/* Categorías */}
                {CATEGORIES.map(cat => {
                    const budget = budgets.find(b => b.category === cat.name);
                    const spent = spending[cat.name] || 0;
                    const limit = budget?.monthly_limit || 0;
                    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                    const isOver = limit > 0 && spent > limit;
                    const isNear = limit > 0 && pct >= 85 && !isOver;

                    const statusColor = isOver ? '#EF4444' : isNear ? '#F59E0B' : colors.accent;

                    return (
                        <TouchableOpacity 
                            key={cat.name} 
                            style={[styles.budgetCard, { backgroundColor: colors.card }, isOver && { borderColor: '#EF444420', borderWidth: 1 }]}
                            onPress={() => openModal(cat, budget)}
                        >
                            <View style={styles.cardTop}>
                                <View style={[styles.iconBox, { backgroundColor: cat.color + '15' }]}>
                                    <MaterialIcons name={cat.icon as any} size={20} color={cat.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
                                    <Text style={[styles.progressTxt, { color: isOver ? '#EF4444' : colors.sub }]}>
                                        {fmt(spent)} {limit > 0 ? `de ${fmt(limit)}` : '· Sin límite'}
                                    </Text>
                                </View>
                                {budget && (
                                    <TouchableOpacity style={styles.miniDel} onPress={(e) => { e.stopPropagation(); handleDelete(budget); }}>
                                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {budget && (
                                <View style={styles.barCont}>
                                    <View style={[styles.barBg, { backgroundColor: colors.bg }]}>
                                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                                    </View>
                                    <View style={styles.barLabels}>
                                        <Text style={[styles.pctTxt, { color: statusColor }]}>{pct.toFixed(0)}% Utilizado</Text>
                                        {isOver && <Text style={styles.alertTxt}>⚠️ Excedido</Text>}
                                        {isNear && <Text style={[styles.alertTxt, { color: '#F59E0B' }]}>⚡ Cerca</Text>}
                                    </View>
                                </View>
                            )}
                            
                            {!budget && (
                                <View style={styles.addPlaceholder}>
                                    <Ionicons name="add-circle-outline" size={16} color={colors.accent} />
                                    <Text style={[styles.addTxt, { color: colors.accent }]}>Definir presupuesto</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modal Sanctuary */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                            <View style={styles.modalHeaderInner}>
                                <View style={[styles.modalIcon, { backgroundColor: selectedCat.color + '15' }]}>
                                    <MaterialIcons name={selectedCat.icon as any} size={28} color={selectedCat.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedCat.name}</Text>
                                    <Text style={[styles.modalSub, { color: colors.sub }]}>Presupuesto sugerido</Text>
                                </View>
                                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.inputArea}>
                                <Text style={[styles.currency, { color: colors.text }]}>$</Text>
                                <TextInput 
                                    style={[styles.amountInput, { color: colors.text }]}
                                    value={limitAmount} onChangeText={t => setLimitAmount(formatInput(t))}
                                    placeholder="0" placeholderTextColor={colors.sub + '40'}
                                    keyboardType="decimal-pad" autoFocus
                                />
                            </View>

                            <View style={styles.modalFooter}>
                                <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setModalVisible(false)}>
                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.accent }]} onPress={handleSaveBudget}>
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Fijar Límite</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 20 },
    headerTitle: { fontSize: 22, fontWeight: '900' },
    headerSub: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize', opacity: 0.6 },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    
    scroll: { paddingHorizontal: 24 },
    banner: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 20, marginBottom: 24, alignItems: 'center' },
    bannerTxt: { fontSize: 13, flex: 1, lineHeight: 18, fontWeight: '600' },

    budgetCard: { borderRadius: 28, padding: 20, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    catName: { fontSize: 16, fontWeight: '800' },
    progressTxt: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    miniDel: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    barCont: { marginTop: 16 },
    barBg: { height: 10, borderRadius: 5, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 5 },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    pctTxt: { fontSize: 11, fontWeight: '800' },
    alertTxt: { fontSize: 11, fontWeight: '800', color: '#EF4444' },

    addPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, opacity: 0.8 },
    addTxt: { fontSize: 13, fontWeight: '800' },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalBox: { borderRadius: 32, padding: 32 },
    modalHeaderInner: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
    modalIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: '900' },
    modalSub: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 2 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    inputArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 10 },
    currency: { fontSize: 32, fontWeight: '900' },
    amountInput: { fontSize: 40, fontWeight: '900', minWidth: 150, textAlign: 'center' },

    modalFooter: { flexDirection: 'row', gap: 12 },
    mBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
});
