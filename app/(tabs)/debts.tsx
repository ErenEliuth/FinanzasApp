import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform, SafeAreaView, ScrollView, StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';

const { height } = Dimensions.get('window');

type Tab = 'debt' | 'fixed';

const SUBSCRIPTIONS_PRESETS = [
    { name: 'Netflix', color: '#E50914' },
    { name: 'Spotify', color: '#1DB954' },
    { name: 'Apple', color: '#000000' },
    { name: 'YouTube', color: '#FF0000' },
    { name: 'Gym', color: '#6366F1' },
    { name: 'Internet', color: '#0EA5E9' },
    { name: 'Arriendo', color: '#F59E0B' },
];

const getBrandColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('netflix')) return '#E50914';
    if (n.includes('spotify')) return '#1DB954';
    if (n.includes('apple') || n.includes('icloud')) return '#000000';
    if (n.includes('youtube')) return '#FF0000';
    if (n.includes('amazon') || n.includes('prime')) return '#00A8E1';
    if (n.includes('disney')) return '#113CCF';
    if (n.includes('gym') || n.includes('smartfit')) return '#F5A623';
    return null; // fallback
};

export default function DebtsScreen() {
    const isFocused = useIsFocused();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark';
    const colors = {
        bg: isDark ? '#0F172A' : '#F4F6FF',
        card: isDark ? '#1E293B' : '#FFFFFF',
        text: isDark ? '#F1F5F9' : '#1E293B',
        sub: isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#334155' : '#E2E8F0',
        tabBg: isDark ? '#1E293B' : '#E2E8F0',
    };
    const [activeTab, setActiveTab] = useState<Tab>('debt');
    const [debts, setDebts] = useState<any[]>([]);
    const [fixedExpenses, setFixedExpenses] = useState<any[]>([]);

    // Add Modal
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newClient, setNewClient] = useState('');
    const [newValue, setNewValue] = useState('');
    const [newDueDate, setNewDueDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [accounts, setAccounts] = useState<string[]>(['Efectivo']);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    const formatInput = (text: string) => {
        const numeric = text.replace(/\D/g, '');
        if (!numeric) return '';
        return numeric.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setNewClient('');
        setNewValue('');
        setNewDueDate(new Date());
    };

    const loadAccounts = async () => {
        try {
            const stored = await AsyncStorage.getItem('@custom_accounts');
            if (stored) setAccounts(['Efectivo', ...JSON.parse(stored)]);
            else setAccounts(['Efectivo']);
        } catch (e) { }
    };

    useEffect(() => {
        if (isFocused) {
            loadData();
            loadAccounts();
            setNewClient('');
            setNewValue('');
            setNewDueDate(new Date());
        }
    }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('debts')
                .select('*')
                .eq('user_id', user.id)
                .order('id', { ascending: false });

            if (error) throw error;

            setDebts((data || []).filter((d: any) => d.debt_type === 'debt'));
            setFixedExpenses((data || []).filter((d: any) => d.debt_type === 'fixed'));
        } catch (e) { console.error('Error cargando deudas de Supabase:', e); }
    };

    const handleAdd = async () => {
        const val = parseFloat(newValue.replace(/\./g, '').replace(',', '.'));
        if (!newClient.trim() || isNaN(val) || val <= 0) return;

        // Format: YYYY-MM-DD (ISO standard for DB)
        const d = newDueDate.getDate().toString().padStart(2, '0');
        const m = (newDueDate.getMonth() + 1).toString().padStart(2, '0');
        const y = newDueDate.getFullYear();
        const dateStr = `${y}-${m}-${d}`;

        try {
            const { error } = await supabase
                .from('debts')
                .insert([
                    {
                        user_id: user?.id,
                        client: newClient.trim(),
                        value: val,
                        paid: 0,
                        due_date: dateStr,
                        debt_type: activeTab
                    }
                ]);

            if (error) throw error;

            setNewClient(''); setNewValue(''); setNewDueDate(new Date());
            setAddModalVisible(false);
            Keyboard.dismiss();
            loadData();
        } catch (e) { console.error('Error agregando deuda a Supabase:', e); }
    };

    const handlePayment = async () => {
        if (!selectedDebt) return;
        Keyboard.dismiss();

        const isFixed = selectedDebt.debt_type === 'fixed';

        if (isFixed) {
            try {
                const { error: debtError } = await supabase
                    .from('debts')
                    .update({ paid: selectedDebt.value })
                    .eq('id', selectedDebt.id);

                if (debtError) throw debtError;

                const { error: txError } = await supabase
                    .from('transactions')
                    .insert([{
                        user_id: user?.id,
                        amount: selectedDebt.value,
                        type: 'expense',
                        category: 'Gasto Fijo',
                        description: `Suscripción/Fijo: ${selectedDebt.client}`,
                        account: selectedAccount,
                        date: new Date().toISOString()
                    }]);

                setPayModalVisible(false); setSelectedDebt(null);
                loadData();
            } catch (e) { console.error(e); }
            return;
        }

        const pay = parseFloat(payAmount.replace(/\./g, '').replace(',', '.'));
        if (isNaN(pay) || pay <= 0) return;
        const remaining = selectedDebt.value - selectedDebt.paid;
        const actualPay = Math.min(pay, remaining);

        try {
            const { error: debtError } = await supabase
                .from('debts')
                .update({ paid: selectedDebt.paid + actualPay })
                .eq('id', selectedDebt.id);

            if (debtError) throw debtError;

            const { error: txError } = await supabase
                .from('transactions')
                .insert([{
                    user_id: user?.id,
                    amount: actualPay,
                    type: 'expense',
                    category: 'Deudas',
                    description: `Abono a deuda: ${selectedDebt.client}`,
                    account: selectedAccount,
                    date: new Date().toISOString()
                }]);

            if (txError) console.error('Error creando transacción de deuda:', txError);

            setPayAmount(''); setPayModalVisible(false); setSelectedDebt(null);
            loadData();
        } catch (e) { console.error('Error actualizando pago en Supabase:', e); }
    };

    // Helper para calcular días restantes y estado
    const parseDateStr = (dateStr: string) => {
        if (!dateStr) return new Date();
        const cleanStr = dateStr.trim();

        // Format YYYY-MM-DD (Standard)
        if (cleanStr.includes('-')) {
            const parts = cleanStr.split('-');
            if (parts.length >= 3) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const d = parseInt(parts[2], 10);
                return new Date(y, m - 1, d);
            }
        }

        // Formato DD/MM/YYYY
        if (cleanStr.includes('/')) {
            const parts = cleanStr.split('/');
            if (parts.length >= 3) {
                const d = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                const y = parseInt(parts[2], 10);
                return new Date(y, m - 1, d);
            }
        }

        const date = new Date(cleanStr);
        return isNaN(date.getTime()) ? new Date() : date;
    };

    const getStatusInfo = (dueDate: string, type: string = 'debt') => {
        try {
            const targetDate = parseDateStr(dueDate);
            const d = targetDate.getDate().toString().padStart(2, '0');
            const m = (targetDate.getMonth() + 1).toString().padStart(2, '0');
            const y = targetDate.getFullYear();

            // Referencia para urgencia (color de la campanilla/punto)
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let checkDate = new Date(targetDate);
            if (type === 'fixed') {
                checkDate = new Date(today.getFullYear(), today.getMonth(), targetDate.getDate());
            }
            checkDate.setHours(0, 0, 0, 0);

            const diffTime = checkDate.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            const isUrgent = diffDays <= 3;
            const color = diffDays < 0 ? '#EF4444' : (diffDays <= 3 ? '#F59E0B' : '#10B981');

            if (type === 'fixed') {
                return {
                    label: `Cobra todos los ${d}`,
                    color: color,
                    isUrgent: isUrgent
                };
            }

            return {
                label: `Vence el ${d}/${m}/${y}`,
                color: color,
                isUrgent: isUrgent
            };
        } catch (e) {
            return { label: `Vence: ${dueDate}`, color: '#94A3B8', isUrgent: false };
        }
    };

    const handleFixedAction = async (debt: any) => {
        const isPaidNow = debt.paid >= debt.value;
        
        if (!isPaidNow) {
            // En vez de pagar directo, abrimos el modal para pedir la cuenta bancaria
            setSelectedDebt(debt);
            setSelectedAccount('Efectivo'); // Default
            setPayModalVisible(true);
        } else {
            // Lógica de "Restablecer" (Reset mensual)
            let newDueDate = debt.due_date;
            const date = parseDateStr(debt.due_date);
            if (date) {
                date.setMonth(date.getMonth() + 1);
                const nextD = date.getDate().toString().padStart(2, '0');
                const nextM = (date.getMonth() + 1).toString().padStart(2, '0');
                const nextY = date.getFullYear();
                newDueDate = `${nextY}-${nextM}-${nextD}`;
            }

            try {
                await supabase
                    .from('debts')
                    .update({
                        paid: 0,
                        due_date: newDueDate
                    })
                    .eq('id', debt.id);
                loadData();
            } catch (e) { console.error(e); }
        }
    };

    const handleSkipFixed = async (debt: any) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Omitir cobro de "${debt.client}" por este mes? (Aparecerá como pagado pero no se descontará dinero)`)) {
                try {
                    await supabase.from('debts').update({ paid: debt.value }).eq('id', debt.id);
                    loadData();
                } catch (e) { console.error(e); }
            }
            return;
        }
        Alert.alert(
            `Omitir ${debt.client}`,
            `¿Deseas omitir este pago por este mes? (Aparecerá como pagado pero no se debitará de tu dinero)`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Omitir', onPress: async () => {
                    try {
                        await supabase.from('debts').update({ paid: debt.value }).eq('id', debt.id);
                        loadData();
                    } catch (e) { console.error(e); }
                }}
            ]
        );
    };

    const handleDelete = (debt: any) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Eliminar "${debt.client}"?`)) {
                (async () => {
                    try {
                        const { error } = await supabase.from('debts').delete().eq('id', debt.id);
                        if (error) throw error;
                        loadData();
                    } catch (e) {
                        console.error('Error eliminando deuda en Supabase:', e);
                    }
                })();
            }
            return;
        }
        Alert.alert(
            'Eliminar',
            `¿Eliminar "${debt.client}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar', style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('debts')
                                .delete()
                                .eq('id', debt.id);

                            if (error) throw error;
                            loadData();
                        } catch (e) { console.error('Error eliminando deuda en Supabase:', e); }
                    }
                }
            ]
        );
    };

    const fmt = (n: number) =>
        isHidden
            ? '****'
            : new Intl.NumberFormat('es-CO', {
                style: 'currency', currency: 'COP', minimumFractionDigits: 0
              }).format(n);

    const totalDebtsPending = debts.reduce((s, d) => s + Math.max(0, d.value - d.paid), 0);
    const totalFixedPending = fixedExpenses.filter(d => d.paid < d.value).reduce((s, d) => s + d.value, 0);
    const currentList = activeTab === 'debt' ? debts : fixedExpenses;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>

            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{activeTab === 'debt' ? 'Deudas' : 'Fijos'}</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
                    <MaterialIcons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Tab Selector */}
            <View style={[styles.tabRow, { backgroundColor: colors.tabBg, borderColor: colors.border }]}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'debt' && styles.tabActive, activeTab === 'debt' && { backgroundColor: colors.card }]}
                    onPress={() => handleTabChange('debt')}
                >
                    <MaterialIcons name="credit-card" size={16}
                        color={activeTab === 'debt' ? '#6366F1' : colors.sub} />
                    <Text style={[styles.tabText, activeTab === 'debt' && styles.tabTextActive, { color: activeTab === 'debt' ? '#6366F1' : colors.sub }]}>
                        Deudas
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'fixed' && styles.tabActive, activeTab === 'fixed' && { backgroundColor: colors.card }]}
                    onPress={() => handleTabChange('fixed')}
                >
                    <MaterialIcons name="repeat" size={16}
                        color={activeTab === 'fixed' ? '#6366F1' : colors.sub} />
                    <Text style={[styles.tabText, activeTab === 'fixed' && styles.tabTextActive, { color: activeTab === 'fixed' ? '#6366F1' : colors.sub }]}>
                        Fijos
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Summary Card */}
            <View style={[styles.summaryCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#000' }]}>
                {activeTab === 'debt' ? (
                    <>
                        <MaterialIcons name="credit-card" size={22} color="#EF4444" />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.summaryLabel}>Deuda pendiente total</Text>
                            <Text style={styles.summaryAmountRed}>{fmt(totalDebtsPending)}</Text>
                        </View>
                    </>
                ) : (
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                             <MaterialIcons name="star-border" size={18} color="#F59E0B" />
                             <Text style={styles.summaryLabel}> Tu carga mensual fija</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <Text style={styles.summaryAmountOrange}>{fmt(fixedExpenses.reduce((s, d) => s + d.value, 0))}</Text>
                            <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: 'bold' }}>
                                Pendiente: {fmt(totalFixedPending)}
                            </Text>
                        </View>
                    </View>
                )}
            </View>

            {/* Info Banner */}
            <View style={[styles.infoBanner, { backgroundColor: isDark ? 'rgba(129, 140, 248, 0.12)' : 'rgba(99,102,241,0.06)' }]}>
                <Ionicons name="information-circle-outline" size={16}
                    color={activeTab === 'debt' ? '#6366F1' : '#F59E0B'} style={{ marginTop: 2, marginRight: 4 }} />
                <Text style={[styles.infoText, isDark && { color: colors.sub }]}>
                    {activeTab === 'debt'
                        ? 'Las deudas se abonan hasta quedar en $0 y quedan marcadas como Pagadas ✅'
                        : 'Suscripciones y recibos. Al marcarlos como pagados, se genera el gasto en tu historial y puedes pasarlo al próximo mes 🔄'}
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {currentList.length === 0 && (
                    <View style={styles.emptyState}>
                        <Ionicons
                            name={activeTab === 'debt' ? 'checkmark-circle' : 'calendar-outline'}
                            size={60} color={activeTab === 'debt' ? '#10B981' : '#F59E0B'} />
                        <Text style={styles.emptyTitle}>
                            {activeTab === 'debt' ? '¡Sin deudas!' : '¡Sin gastos fijos!'}
                        </Text>
                        <Text style={styles.emptyText}>Toca el + para agregar</Text>
                    </View>
                )}

                {/* ── DEBTS ── */}
                {activeTab === 'debt' && debts.map((debt) => {
                    const saldo = debt.value - debt.paid;
                    const isPaid = saldo <= 0;
                    const pct = Math.min(100, (debt.paid / debt.value) * 100);
                    return (
                        <View key={debt.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, isPaid && styles.cardPaid]}>
                            <View style={styles.cardTop}>
                                <View style={[styles.cardAvatar, isPaid && styles.cardAvatarPaid]}>
                                    {isPaid
                                        ? <MaterialIcons name="check" size={20} color="#FFF" />
                                        : <Text style={styles.cardAvatarText}>{debt.client[0].toUpperCase()}</Text>
                                    }
                                </View>
                                <View style={styles.cardInfo}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{debt.client}</Text>
                                    {!isPaid && (
                                        <View style={styles.countdownRow}>
                                            <View style={[styles.statusDot, { backgroundColor: getStatusInfo(debt.due_date, 'debt').color }]} />
                                            <Text style={[styles.cardSub, { color: getStatusInfo(debt.due_date, 'debt').color, fontWeight: '700' }]}>
                                                {getStatusInfo(debt.due_date, 'debt').label}
                                            </Text>
                                        </View>
                                    )}
                                    {isPaid && <Text style={[styles.cardSub, { color: colors.sub }]}>Pagada el {debt.due_date}</Text>}
                                </View>
                                <View style={[styles.badge, { backgroundColor: colors.border }, isPaid ? styles.badgePaid : styles.badgePending]}>
                                    <Text style={[styles.badgeText, isPaid ? styles.badgeTextPaid : styles.badgeTextPending]}>
                                        {isPaid ? '✅ Pagada' : '⏳ Vigente'}
                                    </Text>
                                </View>
                            </View>

                            {/* Progress bar */}
                            <View style={styles.progressRow}>
                                <View style={styles.progressBg}>
                                    <View style={[styles.progressFill, isPaid && styles.progressFillPaid,
                                    { width: `${pct}%` as any }]} />
                                </View>
                                <Text style={styles.progressPct}>{Math.round(pct)}%</Text>
                            </View>

                            {/* Amounts */}
                            <View style={styles.amountsRow}>
                                <View style={styles.amountCol}>
                                    <Text style={styles.amountLabel}>Deuda</Text>
                                    <Text style={[styles.amountVal, { color: colors.text }]}>{fmt(debt.value)}</Text>
                                </View>
                                <View style={styles.amountCol}>
                                    <Text style={styles.amountLabel}>Abonado</Text>
                                    <Text style={[styles.amountVal, { color: '#10B981' }]}>{fmt(debt.paid)}</Text>
                                </View>
                                <View style={styles.amountCol}>
                                    <Text style={styles.amountLabel}>Saldo</Text>
                                    <Text style={[styles.amountVal, { color: isPaid ? '#10B981' : '#EF4444' }]}>
                                        {fmt(Math.max(0, saldo))}
                                    </Text>
                                </View>
                            </View>

                            {/* Actions */}
                            <View style={styles.actionsRow}>
                                {!isPaid && (
                                    <TouchableOpacity
                                        style={styles.primaryBtn}
                                        onPress={() => { setSelectedDebt(debt); setSelectedAccount('Efectivo'); setPayModalVisible(true); }}
                                    >
                                        <MaterialIcons name="payment" size={16} color="#FFF" />
                                        <Text style={styles.primaryBtnText}>Hacer Abono</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(debt)}>
                                    <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}

                {/* ── FIXED EXPENSES OR SUBSCRIPTIONS ── */}
                {activeTab === 'fixed' && fixedExpenses.map((fe) => {
                    const isPaid = fe.paid >= fe.value;
                    const brandColor = getBrandColor(fe.client) || '#F59E0B';
                    
                    return (
                        <View key={fe.id} style={[styles.card, { backgroundColor: colors.card }, isPaid && styles.cardFixedPaid]}>
                            <View style={styles.cardTop}>
                                <View style={[styles.cardAvatar,
                                { backgroundColor: isPaid ? '#10B981' : brandColor }]}>
                                    {isPaid
                                        ? <MaterialIcons name="check" size={20} color="#FFF" />
                                        : <Text style={styles.cardAvatarText}>{fe.client.substring(0, 1).toUpperCase()}</Text>
                                    }
                                </View>
                                <View style={styles.cardInfo}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{fe.client}</Text>
                                    {!isPaid && (
                                        <View style={styles.countdownRow}>
                                            <View style={[styles.statusDot, { backgroundColor: getStatusInfo(fe.due_date, 'fixed').color }]} />
                                            <Text style={[styles.cardSub, { color: getStatusInfo(fe.due_date, 'fixed').color, fontWeight: '700' }]}>
                                                {getStatusInfo(fe.due_date, 'fixed').label}
                                            </Text>
                                        </View>
                                    )}
                                    {isPaid && <Text style={[styles.cardSub, { color: colors.sub }]}>Pagado este mes</Text>}
                                </View>
                                <View style={[styles.badge, isPaid ? styles.badgePaid : styles.badgeFixed]}>
                                    <Text style={[styles.badgeText, isPaid ? styles.badgeTextPaid : styles.badgeTextFixed]}>
                                        {isPaid ? '✅ Pagado' : '🔄 Pendiente'}
                                    </Text>
                                </View>
                            </View>

                            {/* Monthly amount */}
                            <View style={[styles.fixedAmountRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFF' }]}>
                                <View>
                                    <Text style={styles.amountLabel}>Monto mensual</Text>
                                    <Text style={[styles.fixedAmount, { color: isPaid ? '#10B981' : '#F59E0B' }]}>
                                        {fmt(fe.value)}
                                    </Text>
                                </View>
                                {isPaid && (
                                    <View style={styles.paidBadgeRow}>
                                        <MaterialIcons name="check-circle" size={16} color="#10B981" />
                                        <Text style={styles.paidText}>Pagado este mes</Text>
                                    </View>
                                )}
                            </View>

                            {/* Actions */}
                            <View style={styles.actionsRow}>
                                <TouchableOpacity
                                    style={[styles.primaryBtn, isPaid
                                        ? { backgroundColor: '#64748B', flex: 1.5 }
                                        : { backgroundColor: '#F59E0B', flex: 1.5 }]}
                                    onPress={() => handleFixedAction(fe)}
                                >
                                    <MaterialIcons name={isPaid ? 'refresh' : 'check'} size={16} color="#FFF" />
                                    <Text style={styles.primaryBtnText}>
                                        {isPaid ? 'Restablecer pago' : 'Pagar Fijo'}
                                    </Text>
                                </TouchableOpacity>

                                {!isPaid && (
                                    <TouchableOpacity
                                        style={[styles.deleteBtn, { flex: 1, flexDirection: 'row', gap: 4, width: 'auto', borderStyle: 'dashed', borderColor: colors.sub }]}
                                        onPress={() => handleSkipFixed(fe)}
                                    >
                                        <MaterialIcons name="skip-next" size={16} color={colors.sub} />
                                        <Text style={{ fontSize: 13, color: colors.sub, fontWeight: '700' }}>Omitir</Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity style={[styles.deleteBtn, { marginLeft: 8 }]} onPress={() => handleDelete(fe)}>
                                    <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── Add Modal ── */}
            <Modal visible={addModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                    >
                        <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                            <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: height * 0.9 }]}>
                                <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                                    <View style={styles.modalHeader}>
                                        <View style={[styles.modalIcon,
                                        { backgroundColor: activeTab === 'debt' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                                            <MaterialIcons
                                                name={activeTab === 'debt' ? 'credit-card' : 'repeat'}
                                                size={22}
                                                color={activeTab === 'debt' ? '#EF4444' : '#F59E0B'}
                                            />
                                        </View>
                                        <Text style={[styles.modalTitle, { color: colors.text }]}>
                                            {activeTab === 'debt' ? 'Nueva Deuda' : 'Suscripción / Gasto Fijo'}
                                        </Text>
                                    </View>
                                    <Text style={[styles.modalHint, { color: colors.sub }]}>
                                        {activeTab === 'debt'
                                            ? 'Una deuda que pagarás hasta saldarla completamente'
                                            : 'Controla Netflix, Spotify, Arriendo, Internet o cualquier gasto recurrente'}
                                    </Text>
                                    
                                    {/* Sugerencias Rápidas para Suscripciones */}
                                    {activeTab === 'fixed' && (
                                        <View style={{ marginBottom: 14 }}>
                                            <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold', marginBottom: 8 }}>SUGERENCIAS RÁPIDAS</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                {SUBSCRIPTIONS_PRESETS.map(sub => (
                                                    <TouchableOpacity
                                                        key={sub.name}
                                                        style={{ 
                                                            paddingHorizontal: 12, paddingVertical: 6, 
                                                            borderRadius: 16, borderWidth: 1, 
                                                            borderColor: sub.color + '40',
                                                            backgroundColor: sub.color + '10'
                                                        }}
                                                        onPress={() => setNewClient(sub.name)}
                                                    >
                                                        <Text style={{ color: sub.color, fontSize: 13, fontWeight: '700' }}>{sub.name}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    )}

                                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F4F6FF', borderColor: colors.border, color: colors.text }]}
                                        placeholder={activeTab === 'debt' ? 'Nombre (ej. Juan, Banco)' : 'Nombre del servicio'}
                                        placeholderTextColor={colors.sub} value={newClient}
                                        onChangeText={setNewClient} returnKeyType="next" />
                                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F4F6FF', borderColor: colors.border, color: colors.text }]}
                                        placeholder={activeTab === 'debt' ? 'Valor total de la deuda' : 'Costo mensual'}
                                        placeholderTextColor={colors.sub} keyboardType="decimal-pad"
                                        value={newValue} onChangeText={(text) => setNewValue(formatInput(text))} returnKeyType="next" />
                                    <View style={{ position: 'relative' }}>
                                        <TouchableOpacity
                                            style={[styles.datePickerBtn, { backgroundColor: isDark ? '#0F172A' : '#F4F6FF', borderColor: colors.border }]}
                                            onPress={() => {
                                                Keyboard.dismiss();
                                                if (Platform.OS !== 'web') setShowDatePicker(true);
                                            }}
                                        >
                                            <MaterialIcons name="event" size={20} color="#6366F1" />
                                            <Text style={[styles.datePickerBtnText, { color: colors.text }]}>
                                                {activeTab === 'debt'
                                                    ? `Vence: ${newDueDate.toLocaleDateString()}`
                                                    : `Día de pago: ${newDueDate.getDate()}`
                                                }
                                            </Text>
                                        </TouchableOpacity>

                                        {Platform.OS === 'web' && React.createElement('input', {
                                            type: 'date',
                                            style: {
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                width: '100%',
                                                height: '100%',
                                                opacity: 0,
                                                cursor: 'pointer'
                                            },
                                            value: `${newDueDate.getFullYear()}-${String(newDueDate.getMonth() + 1).padStart(2, '0')}-${String(newDueDate.getDate()).padStart(2, '0')}`,
                                            onChange: (e: any) => {
                                                const text = e.target.value;
                                                if (!text) return;
                                                const parts = text.split('-');
                                                if (parts.length === 3) {
                                                    const y = parseInt(parts[0], 10);
                                                    const m = parseInt(parts[1], 10);
                                                    const d = parseInt(parts[2], 10);
                                                    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                                                        const localDate = new Date(y, m - 1, d);
                                                        setNewDueDate(localDate);
                                                    }
                                                }
                                            }
                                        })}
                                    </View>

                                    {Platform.OS !== 'web' && showDatePicker && (
                                        <DateTimePicker
                                            value={newDueDate}
                                            mode="date"
                                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                            themeVariant={isDark ? 'dark' : 'light'}
                                            onChange={(event, selectedDate) => {
                                                if (Platform.OS === 'android') setShowDatePicker(false);
                                                if (selectedDate) setNewDueDate(selectedDate);
                                            }}
                                        />
                                    )}
                                    {Platform.OS === 'ios' && showDatePicker && (
                                        <TouchableOpacity
                                            style={[styles.modalBtnConfirm, { marginTop: 10, backgroundColor: '#64748B' }]}
                                            onPress={() => setShowDatePicker(false)}
                                        >
                                            <Text style={styles.modalBtnConfirmText}>Aceptar Fecha</Text>
                                        </TouchableOpacity>
                                    )}

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity style={styles.modalBtnCancel}
                                            onPress={() => { setAddModalVisible(false); Keyboard.dismiss(); }}>
                                            <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.modalBtnConfirm,
                                            { backgroundColor: activeTab === 'debt' ? '#6366F1' : '#F59E0B' }]}
                                            onPress={handleAdd}>
                                            <Text style={styles.modalBtnConfirmText}>Agregar</Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ── Payment Modal ── */}
            <Modal visible={payModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}
                        >
                            <TouchableWithoutFeedback>
                                <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                                        {selectedDebt?.debt_type === 'fixed' ? `Pagar ${selectedDebt.client}` : `Abono a ${selectedDebt?.client}`}
                                    </Text>
                                    {selectedDebt && selectedDebt.debt_type !== 'fixed' && (
                                        <Text style={[styles.modalHint, { color: colors.sub }]}>
                                            Saldo pendiente: {fmt(selectedDebt.value - selectedDebt.paid)}
                                        </Text>
                                    )}
                                    {selectedDebt?.debt_type === 'fixed' && (
                                        <Text style={[styles.modalHint, { color: colors.sub }]}>
                                            Valor: {fmt(selectedDebt.value)}
                                        </Text>
                                    )}

                                    {selectedDebt?.debt_type !== 'fixed' && (
                                        <TextInput style={[styles.modalInput, { backgroundColor: isDark ? '#0F172A' : '#F4F6FF', borderColor: colors.border, color: colors.text }]}
                                            placeholder="Monto del abono" placeholderTextColor={colors.sub}
                                            keyboardType="decimal-pad" value={payAmount} onChangeText={(text) => setPayAmount(formatInput(text))}
                                            returnKeyType="done" onSubmitEditing={Keyboard.dismiss} autoFocus />
                                    )}

                                    <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold', marginTop: 12, marginBottom: 8, marginLeft: 4 }}>
                                        MÉTODO DE PAGO
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                                        {accounts.map(acc => (
                                            <TouchableOpacity 
                                                key={acc} 
                                                style={{
                                                    paddingHorizontal: 16, paddingVertical: 10,
                                                    borderRadius: 12, borderWidth: 1.5,
                                                    borderColor: selectedAccount === acc ? '#6366F1' : colors.border,
                                                    backgroundColor: selectedAccount === acc ? '#6366F110' : (isDark ? '#0F172A' : '#FFFFFF')
                                                }}
                                                onPress={() => setSelectedAccount(acc)}
                                            >
                                                <Text style={{ fontWeight: '600', color: selectedAccount === acc ? '#6366F1' : colors.sub }}>
                                                    {acc}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity style={styles.modalBtnCancel}
                                            onPress={() => { setPayModalVisible(false); setPayAmount(''); Keyboard.dismiss(); }}>
                                            <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.modalBtnConfirm} onPress={handlePayment}>
                                            <Text style={styles.modalBtnConfirmText}>Confirmar</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 50 : 20,
        paddingBottom: 12,
    },
    headerTitle: { fontSize: 26, fontWeight: '800' },
    addBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
    },

    // Tabs
    tabRow: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 12,
        borderRadius: 14, padding: 4,
    },
    tab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, borderRadius: 12, gap: 6,
    },
    tabActive: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
    tabTextActive: { color: '#6366F1' },

    // Summary
    summaryCard: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 20, marginBottom: 8,
        borderRadius: 16, padding: 14,
        borderLeftWidth: 4, borderLeftColor: '#EF4444',
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    summaryLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
    summaryAmountRed: { fontSize: 22, fontWeight: '800', color: '#EF4444' },
    summaryAmountOrange: { fontSize: 22, fontWeight: '800', color: '#F59E0B' },

    // Info Banner
    infoBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
        marginHorizontal: 20, marginBottom: 12,
        borderRadius: 10, padding: 10,
    },
    infoText: { flex: 1, fontSize: 11, color: '#64748B', lineHeight: 16 },

    scrollContent: { paddingHorizontal: 20 },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 22, fontWeight: '700', marginTop: 16 },
    emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 6 },

    // Cards
    card: {
        borderRadius: 20, padding: 16, marginBottom: 14,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    cardPaid: { borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },
    cardFixedPaid: { borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)' },

    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    cardAvatar: {
        width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366F1',
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    cardAvatarPaid: { backgroundColor: '#10B981' },
    cardAvatarText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '700' },
    cardSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
    countdownRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },

    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    badgePaid: { backgroundColor: 'rgba(16,185,129,0.1)' },
    badgePending: { backgroundColor: 'rgba(239,68,68,0.08)' },
    badgeFixed: { backgroundColor: 'rgba(245,158,11,0.1)' },
    badgeText: { fontSize: 11, fontWeight: '700' },
    badgeTextPaid: { color: '#10B981' },
    badgeTextPending: { color: '#EF4444' },
    badgeTextFixed: { color: '#F59E0B' },

    // Debt progress
    progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    progressBg: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 4 },
    progressFillPaid: { backgroundColor: '#10B981' },
    progressPct: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },

    amountsRow: {
        flexDirection: 'row',
        borderRadius: 12, padding: 12, marginBottom: 12,
    },
    amountCol: { flex: 1, alignItems: 'center' },
    amountLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
    amountVal: { fontSize: 14, fontWeight: '700' },

    // Fixed expense specific
    fixedAmountRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderRadius: 12, padding: 12, marginBottom: 12,
    },
    fixedAmount: { fontSize: 22, fontWeight: '800' },
    paidBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    paidText: { fontSize: 12, color: '#10B981', fontWeight: '600' },

    // Actions
    actionsRow: { flexDirection: 'row', gap: 8 },
    primaryBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 12, gap: 6,
    },
    primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
    deleteBtn: {
        width: 44, height: 44, borderRadius: 12,
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: {
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 40,
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    modalIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    modalHint: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
    modalInput: {
        borderRadius: 14, padding: 16,
        fontSize: 16, marginBottom: 10,
        borderWidth: 1,
    },
    datePickerBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        borderRadius: 14, padding: 16,
        marginBottom: 10, borderWidth: 1,
    },
    datePickerBtnText: { fontSize: 16, fontWeight: '600' },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalBtnCancel: {
        flex: 1, borderWidth: 1, borderColor: '#E2E8F0',
        borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    },
    modalBtnCancelText: { color: '#64748B', fontWeight: '700', fontSize: 15 },
    modalBtnConfirm: {
        flex: 1, backgroundColor: '#6366F1',
        borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    },
    modalBtnConfirmText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
});
