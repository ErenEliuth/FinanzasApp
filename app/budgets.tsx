import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { syncUp, syncDown } from '@/utils/sync';
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatCurrency, convertCurrency, convertToBase, getCurrencyInfo } from '@/utils/currency';

const DEFAULT_CATEGORIES = [
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

const CATEGORY_STORAGE_KEY = '@user_custom_categories_v2';


export default function BudgetsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden, currency, rates } = useAuth();
    const isDark = theme === 'dark';

    const colors = isDark 
        ? { bg: '#1A1A2E', card: '#25253D', text: '#F5F0E8', sub: '#A09B8C', border: '#3A3A52', accent: '#4A7C59', lightAccent: '#4A7C5930', input: '#1A1A2E' }
        : { bg: '#FFF8F0', card: '#FFFFFF', text: '#2D2D2D', sub: '#8B8680', border: '#F0E8DC', accent: '#4A7C59', lightAccent: '#E8F5E9', input: '#F5EDE0' };

    const [budgets, setBudgets] = useState<any[]>([]);
    const [spending, setSpending] = useState<Record<string, number>>({});
    const [modalVisible, setModalVisible] = useState(false);
    const [addCatModalVisible, setAddCatModalVisible] = useState(false);
    const [selectedCat, setSelectedCat] = useState(DEFAULT_CATEGORIES[0]);
    const [limitAmount, setLimitAmount] = useState('');
    const [period, setPeriod] = useState<'monthly' | 'biweekly'>('monthly');
    const [customCategories, setCustomCategories] = useState<string[]>([]);
    const [newCatName, setNewCatName] = useState('');

    useEffect(() => { if (isFocused) loadData(); }, [isFocused, period]);

    const loadData = async () => {
        if (!user) return;
        try {
            if (user?.id) await syncDown(user?.id);
            const [budgetRes, customCatsRaw] = await Promise.all([
                supabase.from('budgets').select('*').eq('user_id', user.id),
                AsyncStorage.getItem(CATEGORY_STORAGE_KEY)
            ]);
            
            if (customCatsRaw) setCustomCategories(JSON.parse(customCatsRaw));
            setBudgets(budgetRes.data || []);

            const today = new Date();
            let startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            if (period === 'biweekly') {
                if (today.getDate() > 15) {
                    startDate = new Date(today.getFullYear(), today.getMonth(), 16);
                } else {
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                }
            }

            const { data: txData } = await supabase.from('transactions')
                .select('category, amount')
                .eq('user_id', user.id)
                .eq('type', 'expense')
                .neq('category', 'Ahorro')
                .neq('category', 'Transferencia')
                .gte('date', startDate.toISOString());

            const totals: Record<string, number> = {};
            txData?.forEach(tx => {
                const cat = tx.category || 'Otros';
                totals[cat] = (totals[cat] || 0) + tx.amount;
            });
            setSpending(totals);
        } catch (e) { console.error(e); }
    };

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);
    
    const handleAmountChange = (text: string) => {
        if (!text) { setLimitAmount(''); return; }
        const info = getCurrencyInfo(currency);
        if (currency === 'COP') {
            const clean = text.replace(/\D/g, '');
            if (!clean) { setLimitAmount(''); return; }
            setLimitAmount(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
        } else {
            let raw = text.replace(/,/g, '');
            const parts = raw.split('.');
            if (parts.length > 2) return;
            const integerRaw = parts[0].replace(/\D/g, '');
            const integerFormatted = integerRaw ? new Intl.NumberFormat('en-US').format(parseInt(integerRaw, 10)) : '';
            if (parts.length === 2) setLimitAmount(`${integerFormatted}.${parts[1].slice(0, 2)}`);
            else if (raw.endsWith('.')) setLimitAmount(`${integerFormatted}.`);
            else setLimitAmount(integerFormatted);
        }
    };

    const handleSaveBudget = async () => {
        let cleanVal = limitAmount;
        if (currency === 'COP') cleanVal = limitAmount.replace(/\./g, '');
        else cleanVal = limitAmount.replace(/,/g, '');
        
        const typedVal = parseFloat(cleanVal);
        const val = convertToBase(typedVal, currency, rates);
        
        if (isNaN(val) || val <= 0) return;
        try {
            await supabase.from('budgets').upsert([{ user_id: user?.id, category: selectedCat.name, monthly_limit: val }], { onConflict: 'user_id,category' });
            setLimitAmount(''); setModalVisible(false); loadData();
        } catch (e) { console.error(e); }
    };

    const handleAddCategory = async () => {
        const trimmed = newCatName.trim();
        if (!trimmed) return;
        const updated = [...customCategories, trimmed];
        await AsyncStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(updated));
        if (user?.id) syncUp(user.id);
        setCustomCategories(updated);
        setNewCatName('');
        setAddCatModalVisible(false);
    };

    const deleteCategory = async (cat: string) => {
        const updated = customCategories.filter(c => c !== cat);
        await AsyncStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(updated));
        if (user?.id) syncUp(user.id);
        setCustomCategories(updated);
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

    const openModal = (cat: any, existing?: any) => {
        setSelectedCat(cat);
        if (existing) {
            const val = convertCurrency(existing.monthly_limit, currency, rates);
            setLimitAmount(val.toString());
        } else {
            setLimitAmount('');
        }
        setModalVisible(true);
    };

    const allCategories = [
        ...DEFAULT_CATEGORIES,
        ...customCategories.map(c => ({ name: c, icon: 'label', color: '#94A3B8' }))
    ];

    const today = new Date();
    let remainingDays = 0;
    let periodName = '';
    
    if (period === 'monthly') {
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        remainingDays = lastDayOfMonth - today.getDate() + 1;
        periodName = today.toLocaleString('es-CO', { month: 'long', year: 'numeric' });
    } else {
        const currentDay = today.getDate();
        if (currentDay <= 15) {
            remainingDays = 15 - currentDay + 1;
            periodName = `1ra Quincena de ${today.toLocaleString('es-CO', { month: 'long' })}`;
        } else {
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            remainingDays = lastDay - currentDay + 1;
            periodName = `2da Quincena de ${today.toLocaleString('es-CO', { month: 'long' })}`;
        }
    }

    const totalLimit = budgets.reduce((sum, b) => sum + b.monthly_limit, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + (spending[b.category] || 0), 0);
    const totalRemaining = Math.max(0, totalLimit - totalSpent);
    const dailySafeSpend = remainingDays > 0 ? totalRemaining / remainingDays : 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Presupuestos</Text>
                    <Text style={[styles.headerSub, { color: colors.sub }]}>{periodName}</Text>
                </View>
                <TouchableOpacity onPress={() => setAddCatModalVisible(true)} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="add" size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabSwitcher}>
                <TouchableOpacity 
                    style={[styles.tab, period === 'monthly' && { backgroundColor: colors.accent }]} 
                    onPress={() => setPeriod('monthly')}
                >
                    <Text style={[styles.tabTxt, { color: period === 'monthly' ? '#FFF' : colors.sub }]}>Mensual</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, period === 'biweekly' && { backgroundColor: colors.accent }]} 
                    onPress={() => setPeriod('biweekly')}
                >
                    <Text style={[styles.tabTxt, { color: period === 'biweekly' ? '#FFF' : colors.sub }]}>Quincenal</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                {/* ── Summary Card: Smart Features ── */}
                <View style={[styles.summaryCard, { backgroundColor: colors.accent }]}>
                    <View style={styles.summaryRow}>
                        <View>
                            <Text style={styles.summaryLab}>Presupuesto Total</Text>
                            <Text style={styles.summaryVal}>{fmt(totalLimit)}</Text>
                        </View>
                        <View style={styles.dailyBox}>
                            <Text style={styles.dailyLab}>Diario Sugerido</Text>
                            <Text style={styles.dailyVal}>{fmt(dailySafeSpend)}</Text>
                        </View>
                    </View>
                    <View style={styles.summaryBarBg}>
                        <View style={[styles.summaryBarFill, { width: `${Math.min(100, (totalSpent / (totalLimit || 1)) * 100)}%` }]} />
                    </View>
                    <Text style={styles.summaryHint}>
                         {totalRemaining > 0 
                            ? `Te quedan ${fmt(totalRemaining)} para los próximos ${remainingDays} días.`
                            : "¡Has alcanzado tu límite total mensual! Evita gastos innecesarios."}
                    </Text>
                </View>

                {/* Categorías */}
                {allCategories.map(cat => {
                    const budget = budgets.find(b => b.category === cat.name);
                    const spent = spending[cat.name] || 0;
                    const limit = budget?.monthly_limit || 0;
                    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                    const isOver = limit > 0 && spent > limit;
                    const isNear = limit > 0 && pct >= 85 && !isOver;
                    const statusColor = isOver ? '#EF4444' : isNear ? '#F59E0B' : colors.accent;
                    const isCustom = customCategories.includes(cat.name);

                    return (
                        <TouchableOpacity 
                            key={cat.name} 
                            style={[styles.budgetCard, { backgroundColor: colors.card }, isOver && { borderColor: '#EF444430', borderWidth: 1 }]}
                            onPress={() => openModal(cat, budget)}
                            onLongPress={() => isCustom && deleteCategory(cat.name)}
                        >
                            <View style={styles.cardTop}>
                                <View style={[styles.iconBox, { backgroundColor: cat.color + '15' }]}>
                                    <MaterialIcons name={cat.icon as any} size={20} color={cat.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
                                        <Text style={[styles.spentNum, { color: isOver ? '#EF4444' : colors.text }]}>{fmt(spent)}</Text>
                                    </View>
                                    {limit > 0 && (
                                        <Text style={[styles.limitNum, { color: colors.sub }]}>de {fmt(limit)} {period === 'monthly' ? 'mensuales' : 'quincenales'}</Text>
                                    )}
                                </View>
                                {isCustom && (
                                    <TouchableOpacity onPress={() => deleteCategory(cat.name)} style={{ padding: 4 }}>
                                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {budget ? (
                                <View style={styles.barCont}>
                                    <View style={[styles.barBg, { backgroundColor: colors.bg }]}>
                                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                                    </View>
                                    <View style={styles.barLabels}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <View style={[styles.dot, { backgroundColor: statusColor }]} />
                                            <Text style={[styles.pctTxt, { color: statusColor }]}>{pct.toFixed(0)}% del límite</Text>
                                        </View>
                                        {isOver && <Text style={styles.alertTxt}>Excedido</Text>}
                                        {isNear && <Text style={[styles.alertTxt, { color: '#F59E0B' }]}>Casi al límite</Text>}
                                        {!isOver && !isNear && <Text style={[styles.daysTxt, { color: colors.sub }]}>{remainingDays} días rest.</Text>}
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.addPlaceholder}>
                                    <Ionicons name="add" size={16} color={colors.accent} />
                                    <Text style={[styles.addTxt, { color: colors.accent }]}>Definir límite mensual</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modal Límite */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', alignItems: 'center' }}>
                        <View style={[styles.modalBox, { backgroundColor: colors.card, width: '100%' }]}>
                            <View style={styles.modalHeaderInner}>
                                <View style={[styles.modalIcon, { backgroundColor: selectedCat.color + '15' }]}>
                                    <MaterialIcons name={selectedCat.icon as any} size={28} color={selectedCat.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedCat.name}</Text>
                                    <Text style={[styles.modalSub, { color: colors.sub }]}>Fijar límite máximo de gasto</Text>
                                </View>
                                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.inputArea}>
                                <Text style={[styles.currency, { color: colors.text }]}>{getCurrencyInfo(currency).symbol}</Text>
                                <TextInput 
                                    style={[styles.amountInput, { color: colors.text }]}
                                    value={limitAmount} onChangeText={handleAmountChange}
                                    placeholder="0" placeholderTextColor={colors.sub + '40'}
                                    keyboardType="decimal-pad" autoFocus
                                />
                            </View>

                            <View style={styles.modalFooter}>
                                <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.bg }]} onPress={() => setModalVisible(false)}>
                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Cerrar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.accent }]} onPress={handleSaveBudget}>
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text>
                                </TouchableOpacity>
                            </View>
                            
                            {budgets.find(b => b.category === selectedCat.name) && (
                                <TouchableOpacity style={styles.delOption} onPress={() => { setModalVisible(false); handleDelete(budgets.find(b => b.category === selectedCat.name)); }}>
                                    <Text style={styles.delOptionTxt}>Eliminar presupuesto para esta categoría</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Modal de Nueva Categoría */}
            <Modal visible={addCatModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card, width: '90%' }]}>
                        <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 20 }]}>Nueva Categoría</Text>
                        <TextInput 
                            style={[styles.modalInputText, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                            placeholder="Nombre de la categoría"
                            placeholderTextColor={colors.sub}
                            value={newCatName}
                            onChangeText={setNewCatName}
                            autoFocus
                        />
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.bg }]} onPress={() => setAddCatModalVisible(false)}>
                                <Text style={{ color: colors.text, fontWeight: '800' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.accent }]} onPress={handleAddCategory}>
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 10 },
    headerTitle: { fontSize: 22, fontWeight: '900' },
    headerSub: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize', opacity: 0.6 },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

    tabSwitcher: { flexDirection: 'row', marginHorizontal: 24, marginBottom: 20, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 16, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    tabTxt: { fontSize: 13, fontWeight: '800' },
    
    scroll: { paddingHorizontal: 24 },

    summaryCard: { borderRadius: 32, padding: 24, marginBottom: 24, elevation: 8, shadowColor: '#4A7C59', shadowOpacity: 0.2, shadowRadius: 20 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    summaryLab: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
    summaryVal: { color: '#FFF', fontSize: 28, fontWeight: '900' },
    dailyBox: { alignItems: 'flex-end' },
    dailyLab: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },
    dailyVal: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    summaryBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
    summaryBarFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 4 },
    summaryHint: { color: '#FFF', fontSize: 12, fontWeight: '600', opacity: 0.9, lineHeight: 18 },

    budgetCard: { borderRadius: 28, padding: 20, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    catName: { fontSize: 16, fontWeight: '800' },
    spentNum: { fontSize: 16, fontWeight: '800' },
    limitNum: { fontSize: 11, fontWeight: '600', marginTop: 2 },

    barCont: { marginTop: 16 },
    barBg: { height: 10, borderRadius: 5, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 5 },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' },
    dot: { width: 6, height: 6, borderRadius: 3 },
    pctTxt: { fontSize: 11, fontWeight: '800' },
    daysTxt: { fontSize: 11, fontWeight: '700' },
    alertTxt: { fontSize: 11, fontWeight: '900', color: '#EF4444' },

    addPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, opacity: 0.8 },
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
    mBtnB: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
    delOption: { marginTop: 24, alignItems: 'center' },
    delOptionTxt: { color: '#EF4444', fontSize: 12, fontWeight: '800' },
    modalInputText: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, marginBottom: 20 },
});

