import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
    Alert,
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

type Tab = 'debt' | 'fixed';

export default function DebtsScreen() {
    const isFocused = useIsFocused();
    const { user, theme } = useAuth();
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
    const [newDueDate, setNewDueDate] = useState('');

    // Payment Modal (only for debts)
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');

    const formatInput = (text: string) => {
        const numericValue = text.replace(/\D/g, '');
        if (!numericValue) return '';
        return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    useEffect(() => {
        if (isFocused) loadData();
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
        if (!newClient.trim() || isNaN(val) || val <= 0 || !newDueDate.trim()) return;

        try {
            const { error } = await supabase
                .from('debts')
                .insert([
                    {
                        user_id: user?.id,
                        client: newClient.trim(),
                        value: val,
                        paid: 0,
                        due_date: newDueDate.trim(),
                        debt_type: activeTab
                    }
                ]);

            if (error) throw error;

            setNewClient(''); setNewValue(''); setNewDueDate('');
            setAddModalVisible(false);
            Keyboard.dismiss();
            loadData();
        } catch (e) { console.error('Error agregando deuda a Supabase:', e); }
    };

    const handlePayment = async () => {
        if (!selectedDebt) return;
        const pay = parseFloat(payAmount.replace(/\./g, '').replace(',', '.'));
        if (isNaN(pay) || pay <= 0) return;
        const remaining = selectedDebt.value - selectedDebt.paid;
        const actualPay = Math.min(pay, remaining);

        try {
            const { error } = await supabase
                .from('debts')
                .update({ paid: selectedDebt.paid + actualPay })
                .eq('id', selectedDebt.id);

            if (error) throw error;

            setPayAmount(''); setPayModalVisible(false); setSelectedDebt(null);
            Keyboard.dismiss();
            loadData();
        } catch (e) { console.error('Error actualizando pago en Supabase:', e); }
    };

    const handleMarkFixedPaid = async (debt: any) => {
        const newPaid = debt.paid >= debt.value ? 0 : debt.value;
        try {
            const { error } = await supabase
                .from('debts')
                .update({ paid: newPaid })
                .eq('id', debt.id);

            if (error) throw error;
            loadData();
        } catch (e) { console.error('Error actualizando gasto fijo en Supabase:', e); }
    };

    const handleDelete = (debt: any) => {
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
        new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

    // Helper para calcular días restantes y estado
    const getStatusInfo = (dueDate: string) => {
        try {
            const [d, m, y] = dueDate.split('/').map(Number);
            const target = new Date(y, m - 1, d);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const diffTime = target.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) return { label: `Venció hace ${Math.abs(diffDays)}d`, color: '#EF4444', isUrgent: true };
            if (diffDays === 0) return { label: 'Vence hoy', color: '#F59E0B', isUrgent: true };
            if (diffDays <= 3) return { label: `Vence en ${diffDays}d`, color: '#F59E0B', isUrgent: true };
            return { label: `En ${diffDays}d`, color: '#10B981', isUrgent: false };
        } catch (e) {
            return { label: dueDate, color: '#94A3B8', isUrgent: false };
        }
    };

    const totalDebtsPending = debts.reduce((s, d) => s + Math.max(0, d.value - d.paid), 0);
    const totalFixedPending = fixedExpenses.filter(d => d.paid < d.value).reduce((s, d) => s + d.value, 0);
    const currentList = activeTab === 'debt' ? debts : fixedExpenses;

    return (
        <SafeAreaView style={styles.container}>

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Control de Cartera</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
                    <MaterialIcons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Tab Selector */}
            <View style={[styles.tabRow, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'debt' && styles.tabActive]}
                    onPress={() => setActiveTab('debt')}
                >
                    <MaterialIcons name="credit-card" size={16}
                        color={activeTab === 'debt' ? '#6366F1' : isDark ? '#64748B' : '#94A3B8'} />
                    <Text style={[styles.tabText, activeTab === 'debt' && styles.tabTextActive, activeTab !== 'debt' && isDark && { color: '#64748B' }]}>
                        Deudas
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'fixed' && styles.tabActive]}
                    onPress={() => setActiveTab('fixed')}
                >
                    <MaterialIcons name="repeat" size={16}
                        color={activeTab === 'fixed' ? '#6366F1' : isDark ? '#64748B' : '#94A3B8'} />
                    <Text style={[styles.tabText, activeTab === 'fixed' && styles.tabTextActive, activeTab !== 'fixed' && isDark && { color: '#64748B' }]}>
                        Gastos Fijos
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Summary Card */}
            <View style={[styles.summaryCard, isDark && { backgroundColor: '#1E293B', shadowColor: '#000' }]}>
                {activeTab === 'debt' ? (
                    <>
                        <MaterialIcons name="credit-card" size={22} color="#EF4444" />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.summaryLabel}>Deuda pendiente total</Text>
                            <Text style={styles.summaryAmountRed}>{fmt(totalDebtsPending)}</Text>
                        </View>
                    </>
                ) : (
                    <>
                        <MaterialIcons name="repeat" size={22} color="#F59E0B" />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.summaryLabel}>Gastos fijos por pagar este mes</Text>
                            <Text style={styles.summaryAmountOrange}>{fmt(totalFixedPending)}</Text>
                        </View>
                    </>
                )}
            </View>

            {/* Info Banner */}
            <View style={[styles.infoBanner, isDark && { backgroundColor: `${activeTab === 'debt' ? '#6366F1' : '#F59E0B'}15` }]}>
                <Ionicons name="information-circle-outline" size={14}
                    color={activeTab === 'debt' ? '#6366F1' : '#F59E0B'} />
                <Text style={[styles.infoText, isDark && { color: colors.sub }]}>
                    {activeTab === 'debt'
                        ? 'Las deudas se abonan hasta quedar en $0 y quedan marcadas como Pagadas ✅'
                        : 'Los gastos fijos se repiten cada mes. Márcalos como pagados y restablece para el próximo mes 🔄'}
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
                        <View key={debt.id} style={[styles.card, isDark && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }, isPaid && styles.cardPaid]}>
                            <View style={styles.cardTop}>
                                <View style={[styles.cardAvatar, isPaid && styles.cardAvatarPaid]}>
                                    {isPaid
                                        ? <MaterialIcons name="check" size={20} color="#FFF" />
                                        : <Text style={styles.cardAvatarText}>{debt.client[0].toUpperCase()}</Text>
                                    }
                                </View>
                                <View style={styles.cardInfo}>
                                    <Text style={[styles.cardTitle, isDark && { color: '#F1F5F9' }]}>{debt.client}</Text>
                                    {!isPaid && (
                                        <View style={styles.countdownRow}>
                                            <View style={[styles.statusDot, { backgroundColor: getStatusInfo(debt.due_date).color }]} />
                                            <Text style={[styles.cardSub, { color: getStatusInfo(debt.due_date).color, fontWeight: '700' }]}>
                                                {getStatusInfo(debt.due_date).label}
                                            </Text>
                                        </View>
                                    )}
                                    {isPaid && <Text style={[styles.cardSub, isDark && { color: '#64748B' }]}>Pagada el {debt.due_date}</Text>}
                                </View>
                                <View style={[styles.badge, isDark && { backgroundColor: '#334155' }, isPaid ? styles.badgePaid : styles.badgePending]}>
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
                                    <Text style={styles.amountVal}>{fmt(debt.value)}</Text>
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
                                        onPress={() => { setSelectedDebt(debt); setPayModalVisible(true); }}
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

                {/* ── FIXED EXPENSES ── */}
                {activeTab === 'fixed' && fixedExpenses.map((fe) => {
                    const isPaid = fe.paid >= fe.value;
                    return (
                        <View key={fe.id} style={[styles.card, isPaid && styles.cardFixedPaid]}>
                            <View style={styles.cardTop}>
                                <View style={[styles.cardAvatar,
                                { backgroundColor: isPaid ? '#10B981' : '#F59E0B' }]}>
                                    {isPaid
                                        ? <MaterialIcons name="check" size={20} color="#FFF" />
                                        : <MaterialIcons name="repeat" size={20} color="#FFF" />
                                    }
                                </View>
                                <View style={styles.cardInfo}>
                                    <Text style={styles.cardTitle}>{fe.client}</Text>
                                    {!isPaid && (
                                        <View style={styles.countdownRow}>
                                            <View style={[styles.statusDot, { backgroundColor: getStatusInfo(fe.due_date).color }]} />
                                            <Text style={[styles.cardSub, { color: getStatusInfo(fe.due_date).color, fontWeight: '700' }]}>
                                                {getStatusInfo(fe.due_date).label}
                                            </Text>
                                        </View>
                                    )}
                                    {isPaid && <Text style={styles.cardSub}>Pagado este mes</Text>}
                                </View>
                                <View style={[styles.badge, isPaid ? styles.badgePaid : styles.badgeFixed]}>
                                    <Text style={[styles.badgeText, isPaid ? styles.badgeTextPaid : styles.badgeTextFixed]}>
                                        {isPaid ? '✅ Pagado' : '🔄 Pendiente'}
                                    </Text>
                                </View>
                            </View>

                            {/* Monthly amount */}
                            <View style={styles.fixedAmountRow}>
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
                                        ? { backgroundColor: '#64748B' }
                                        : { backgroundColor: '#F59E0B' }]}
                                    onPress={() => handleMarkFixedPaid(fe)}
                                >
                                    <MaterialIcons name={isPaid ? 'refresh' : 'check'} size={16} color="#FFF" />
                                    <Text style={styles.primaryBtnText}>
                                        {isPaid ? 'Restablecer para próximo mes' : 'Marcar como Pagado'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(fe)}>
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
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                            <TouchableWithoutFeedback>
                                <View style={styles.modalSheet}>
                                    <View style={styles.modalHeader}>
                                        <View style={[styles.modalIcon,
                                        { backgroundColor: activeTab === 'debt' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                                            <MaterialIcons
                                                name={activeTab === 'debt' ? 'credit-card' : 'repeat'}
                                                size={22}
                                                color={activeTab === 'debt' ? '#EF4444' : '#F59E0B'}
                                            />
                                        </View>
                                        <Text style={styles.modalTitle}>
                                            {activeTab === 'debt' ? 'Nueva Deuda' : 'Nuevo Gasto Fijo'}
                                        </Text>
                                    </View>
                                    <Text style={styles.modalHint}>
                                        {activeTab === 'debt'
                                            ? 'Una deuda que pagarás hasta saldarla completamente'
                                            : 'Un pago recurrente que se repite cada mes (ej: plan celular, internet)'}
                                    </Text>

                                    <TextInput style={styles.modalInput}
                                        placeholder={activeTab === 'debt' ? 'Nombre (ej. MAMA)' : 'Nombre (ej. Plan Celular)'}
                                        placeholderTextColor="#94A3B8" value={newClient}
                                        onChangeText={setNewClient} returnKeyType="next" />
                                    <TextInput style={styles.modalInput}
                                        placeholder={activeTab === 'debt' ? 'Valor total de la deuda' : 'Valor mensual'}
                                        placeholderTextColor="#94A3B8" keyboardType="decimal-pad"
                                        value={newValue} onChangeText={(text) => setNewValue(formatInput(text))} returnKeyType="next" />
                                    <TextInput style={styles.modalInput}
                                        placeholder={activeTab === 'debt' ? 'Fecha de vencimiento (ej. 15/04/2026)' : 'Día de pago (ej. 10/03/2026)'}
                                        placeholderTextColor="#94A3B8" value={newDueDate}
                                        onChangeText={setNewDueDate} returnKeyType="done"
                                        onSubmitEditing={Keyboard.dismiss} />

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
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* ── Payment Modal ── */}
            <Modal visible={payModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                            <TouchableWithoutFeedback>
                                <View style={styles.modalSheet}>
                                    <Text style={styles.modalTitle}>Abono a {selectedDebt?.client}</Text>
                                    {selectedDebt && (
                                        <Text style={styles.modalHint}>
                                            Saldo pendiente: {fmt(selectedDebt.value - selectedDebt.paid)}
                                        </Text>
                                    )}
                                    <TextInput style={styles.modalInput}
                                        placeholder="Monto del abono" placeholderTextColor="#94A3B8"
                                        keyboardType="decimal-pad" value={payAmount} onChangeText={(text) => setPayAmount(formatInput(text))}
                                        returnKeyType="done" onSubmitEditing={Keyboard.dismiss} autoFocus />
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
    container: { flex: 1, backgroundColor: '#F4F6FF' },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 50 : 20,
        paddingBottom: 12,
    },
    headerTitle: { fontSize: 26, fontWeight: '800', color: '#1E293B' },
    addBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
    },

    // Tabs
    tabRow: {
        flexDirection: 'row', marginHorizontal: 20, marginBottom: 12,
        backgroundColor: '#E8EEFF', borderRadius: 14, padding: 4,
    },
    tab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 10, borderRadius: 12, gap: 6,
    },
    tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
    tabText: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
    tabTextActive: { color: '#6366F1' },

    // Summary
    summaryCard: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 20, marginBottom: 8,
        backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
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
        backgroundColor: 'rgba(99,102,241,0.05)',
        borderRadius: 10, padding: 10,
    },
    infoText: { flex: 1, fontSize: 11, color: '#64748B', lineHeight: 16 },

    scrollContent: { paddingHorizontal: 20 },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginTop: 16 },
    emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 6 },

    // Cards
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14,
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
    cardTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
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
    progressPct: { fontSize: 12, fontWeight: '700', color: '#64748B', width: 36, textAlign: 'right' },

    amountsRow: {
        flexDirection: 'row', backgroundColor: '#F8FAFF',
        borderRadius: 12, padding: 12, marginBottom: 12,
    },
    amountCol: { flex: 1, alignItems: 'center' },
    amountLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
    amountVal: { fontSize: 14, fontWeight: '700', color: '#1E293B' },

    // Fixed expense specific
    fixedAmountRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#F8FAFF', borderRadius: 12, padding: 12, marginBottom: 12,
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
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 40,
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
    modalIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    modalHint: { fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 18 },
    modalInput: {
        backgroundColor: '#F4F6FF', borderRadius: 14, padding: 16,
        fontSize: 16, color: '#1E293B', marginBottom: 10,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
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
