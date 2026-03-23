import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
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
import Svg, { Circle } from 'react-native-svg';

const { height } = Dimensions.get('window');

const ConditionalWrapper = ({ condition, wrapper, children }: { condition: boolean, wrapper: (c: any) => any, children: any }) => 
  condition ? wrapper(children) : children;

type DebtItem = {
    id: string;
    client: string;
    value: number;
    paid: number;
    due_date: string;
    debt_type: 'debt' | 'fixed';
    status?: string;
};

export default function DebtsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark';

    const colors = {
        bg:     isDark ? '#0F172A' : '#F8FAFC',
        card:   isDark ? '#1E293B' : '#FFFFFF',
        text:   isDark ? '#F1F5F9' : '#1E293B',
        sub:    isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#334155' : '#E2E8F0',
        accent: '#6366F1',
        red:    '#EF4444',
        green:  '#10B981',
        orange: '#F59E0B',
    };

    const [viewMode, setViewMode] = useState<'debt' | 'fixed'>('debt');
    const [debts, setDebts] = useState<DebtItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    
    // Form state for new/edit entry
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [dueDate, setDueDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Payment state
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState<DebtItem | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [accounts, setAccounts] = useState<string[]>(['Efectivo']);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    useEffect(() => {
        if (isFocused) {
            loadData();
            loadAccounts();
        }
    }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('debts')
                .select('*')
                .eq('user_id', user.id)
                .order('due_date', { ascending: true });

            if (error) throw error;
            
            // Sorting: Unpaid first (earliest due date first), then Paid (earliest due date first)
            const sorted = (data || []).sort((a, b) => {
                const isPaidA = a.paid >= a.value;
                const isPaidB = b.paid >= b.value;
                
                if (isPaidA !== isPaidB) return isPaidA ? 1 : -1;
                
                return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            });

            setDebts(sorted);
        } catch (e) {
            console.error('Error loading debts:', e);
        } finally {
            setLoading(false);
        }
    };

    const loadAccounts = async () => {
        try {
            const stored = await AsyncStorage.getItem('@custom_accounts');
            if (stored) setAccounts(['Efectivo', ...JSON.parse(stored)]);
            else setAccounts(['Efectivo']);
        } catch (e) { }
    };

    const formatInput = (text: string) => {
        const clean = text.replace(/\D/g, '');
        if (!clean) return '';
        return new Intl.NumberFormat('es-CO').format(parseInt(clean, 10));
    };

    const fmt = (n: number) =>
        isHidden ? '****' : new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', minimumFractionDigits: 0
        }).format(n);

    const handleSave = async () => {
        const val = parseFloat(amount.replace(/\./g, ''));
        if (!name.trim() || isNaN(val) || val <= 0) {
            Alert.alert('Error', 'Completa todos los campos');
            return;
        }

        const dateStr = dueDate.toISOString().split('T')[0];

        try {
            if (isEditing && editId) {
                const { error } = await supabase.from('debts').update({
                    client: name.trim(),
                    value: val,
                    due_date: dateStr,
                }).eq('id', editId);
                if (error) throw error;
                Alert.alert('Éxito', 'Registro actualizado');
            } else {
                const { error } = await supabase.from('debts').insert([{
                    user_id: user?.id,
                    client: name.trim(),
                    value: val,
                    paid: 0,
                    due_date: dateStr,
                    debt_type: viewMode,
                    created_date: new Date().toISOString()
                }]);
                if (error) throw error;
            }

            setModalVisible(false);
            resetForm();
            loadData();
        } catch (e) {
            Alert.alert('Error', 'No se pudo guardar el registro');
        }
    };

    const resetForm = () => {
        setName(''); setAmount(''); setDueDate(new Date());
        setIsEditing(false); setEditId(null);
    };

    const handleEditStart = (item: DebtItem) => {
        setName(item.client);
        setAmount(item.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
        setDueDate(new Date(item.due_date + 'T12:00:00')); // T12 to avoid timezone issues
        setEditId(item.id);
        setIsEditing(true);
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        const confirmDelete = Platform.OS === 'web' 
            ? window.confirm('¿Estás seguro de eliminar este registro?')
            : true;

        if (Platform.OS === 'web' && !confirmDelete) return;

        const performDelete = async () => {
            await supabase.from('debts').delete().eq('id', id);
            loadData();
        };

        if (Platform.OS === 'web') {
            performDelete();
        } else {
            Alert.alert('Eliminar', '¿Estás seguro de eliminar este registro?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: performDelete}
            ]);
        }
    };

    const handlePayment = async () => {
        if (!selectedDebt) return;
        
        const isFixed = selectedDebt.debt_type === 'fixed';
        const pVal = isFixed ? selectedDebt.value : parseFloat(payAmount.replace(/\./g, ''));
        
        if (isNaN(pVal) || pVal <= 0) {
            Alert.alert('Error', 'Monto no válido');
            return;
        }

        const actualPay = isFixed ? pVal : Math.min(pVal, selectedDebt.value - selectedDebt.paid);

        try {
            // 1. Actualizar deuda
            const { error: debtError } = await supabase
                .from('debts')
                .update({ paid: selectedDebt.paid + actualPay })
                .eq('id', selectedDebt.id);

            if (debtError) throw debtError;

            // 2. Registrar transacción
            await supabase.from('transactions').insert([{
                user_id: user?.id,
                amount: actualPay,
                type: 'expense',
                category: isFixed ? 'Gasto Fijo' : 'Deudas',
                description: isFixed ? `Pago: ${selectedDebt.client}` : `Abono: ${selectedDebt.client}`,
                account: selectedAccount,
                date: new Date().toISOString()
            }]);

            setPayModalVisible(false);
            setPayAmount('');
            setSelectedDebt(null);
            loadData();
        } catch (e) {
            Alert.alert('Error', 'No se pudo registrar el pago');
        }
    };

    const handleDebtAction = (item: DebtItem) => {
        if (item.paid >= item.value) {
            Alert.alert('Pagada', 'Esta deuda ya ha sido saldada completamente.');
            return;
        }
        setSelectedDebt(item);
        setPayAmount('');
        setSelectedAccount('Efectivo');
        setPayModalVisible(true);
    };

    const handleFixedAction = async (item: DebtItem) => {
        const isPaidNow = item.paid >= item.value;
        
        if (!isPaidNow) {
            setSelectedDebt(item);
            setSelectedAccount('Efectivo');
            setPayModalVisible(true);
        } else {
            // Lógica de Reinicio Mensual
            Alert.alert('Pagar de nuevo', '¿Quieres marcar este gasto para el próximo mes?', [
                { text: 'Cancelar' },
                { text: 'Reiniciar', onPress: async () => {
                    const nextDate = new Date(item.due_date);
                    nextDate.setMonth(nextDate.getMonth() + 1);
                    await supabase.from('debts').update({
                        paid: 0,
                        due_date: nextDate.toISOString().split('T')[0]
                    }).eq('id', item.id);
                    loadData();
                }}
            ]);
        }
    };

    const handleSkipFixed = async (item: DebtItem) => {
        const confirmSkip = Platform.OS === 'web' 
            ? window.confirm(`¿Quieres omitir el pago de "${item.client}" este mes?`)
            : true;

        if (Platform.OS === 'web' && !confirmSkip) return;

        const performSkip = async () => {
           await supabase.from('debts').update({ paid: item.value }).eq('id', item.id);
           loadData();
        };

        if (Platform.OS === 'web') {
            performSkip();
        } else {
            Alert.alert('Omitir Pago', `¿Quieres omitir el pago de "${item.client}" este mes? Se marcará como pagado pero NO se descontará de tus cuentas.`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Omitir', onPress: performSkip}
            ]);
        }
    };

    // Calculations
    const currentList = debts.filter(d => d.debt_type === viewMode);
    const totalValue = currentList.reduce((s, d) => s + d.value, 0);
    const totalPaid = currentList.reduce((s, d) => s + (d.paid || 0), 0);
    const totalPending = totalValue - totalPaid;
    const progressPct = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.bg }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back-ios" size={20} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {viewMode === 'debt' ? 'Mis Deudas' : 'Gastos Fijos'}
                </Text>
                <TouchableOpacity style={styles.addBtnHeader} onPress={() => setModalVisible(true)}>
                    <MaterialIcons name="add" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Pestañas (Selector de modo) */}
            <View style={styles.tabBar}>
                <TouchableOpacity 
                    onPress={() => setViewMode('debt')}
                    style={[styles.tab, viewMode === 'debt' && { borderBottomColor: colors.accent, borderBottomWidth: 3 }]}
                >
                    <Text style={[styles.tabText, { color: viewMode === 'debt' ? colors.text : colors.sub }]}>Deudas</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setViewMode('fixed')}
                    style={[styles.tab, viewMode === 'fixed' && { borderBottomColor: colors.accent, borderBottomWidth: 3 }]}
                >
                    <Text style={[styles.tabText, { color: viewMode === 'fixed' ? colors.text : colors.sub }]}>Gastos Fijos</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                {/* ── SECCIÓN DE RESUMEN (Gráfico o Barra) ── */}
                {viewMode === 'fixed' ? (
                    <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
                        <View style={styles.chartWrap}>
                            <Svg width={140} height={140} viewBox="0 0 100 100">
                                <Circle cx="50" cy="50" r="45" stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth="8" fill="none" />
                                <Circle 
                                    cx="50" cy="50" r="45" stroke={colors.accent} strokeWidth="8" 
                                    fill="none" strokeDasharray={`${progressPct * 2.82} 282`}
                                    strokeLinecap="round" transform="rotate(-90 50 50)"
                                />
                                <View style={styles.chartLabel}>
                                    <Text style={[styles.chartPct, { color: colors.text }]}>{Math.round(progressPct)}%</Text>
                                    <Text style={[styles.chartSub, { color: colors.sub }]}>Cubierto</Text>
                                </View>
                            </Svg>
                        </View>
                        <Text style={[styles.summaryTitle, { color: colors.text }]}>Progreso Mensual</Text>
                        <Text style={[styles.summaryDetail, { color: colors.sub }]}>
                            Has pagado {fmt(totalPaid)} de {fmt(totalValue)}
                        </Text>
                    </View>
                ) : (
                    <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
                        <Text style={[styles.summaryHeaderLabel, { color: colors.text }]}>Total Deuda</Text>
                        
                        <View style={[styles.progressBarBase, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                            <View style={[styles.progressBarFill, { width: `${progressPct}%`, backgroundColor: colors.green }]} />
                        </View>

                        <View style={styles.summaryStatsRow}>
                            <View style={styles.statCol}>
                                <Text style={[styles.statLabel, { color: colors.sub }]}>Pagado</Text>
                                <Text style={[styles.statValue, { color: colors.green }]}>{fmt(totalPaid)}</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statCol}>
                                <Text style={[styles.statLabel, { color: colors.sub }]}>Pendiente</Text>
                                <Text style={[styles.statValue, { color: colors.red }]}>{fmt(totalPending)}</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* ── LISTADO ESTILO TIMELINE / CARDS ── */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {viewMode === 'debt' ? 'Próximos Pagos' : 'Tus Gastos Obligatorios'}
                </Text>

                {loading ? (
                    <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 20 }} />
                ) : currentList.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="receipt-outline" size={48} color={colors.sub} />
                        <Text style={[styles.emptyText, { color: colors.sub }]}>No hay registros aquí.</Text>
                    </View>
                ) : (
                    <View style={styles.timelineContainer}>
                        {viewMode === 'debt' && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                        
                        {currentList.map((item, index) => {
                            const date = new Date(item.due_date);
                            const day = date.getUTCDate().toString().padStart(2, '0');
                            const month = date.toLocaleString('es-CO', { month: 'short', timeZone: 'UTC' }).toUpperCase();
                            const itemPct = (item.paid / item.value) * 100;
                            const isPaid = item.paid >= item.value;
                            const isLate = new Date() > date && !isPaid;

                            return (
                                <View 
                                    key={item.id} 
                                    style={styles.itemWrapper} 
                                >
                                    {/* Fecha y Punto Timeline (solo deudas) */}
                                    {viewMode === 'debt' && (
                                        <View style={styles.timelineDateCol}>
                                            <Text style={[styles.dateDay, { color: colors.text }]}>{day}</Text>
                                            <Text style={[styles.dateMonth, { color: colors.sub }]}>{month}</Text>
                                            <View style={[styles.timelineDot, { backgroundColor: isPaid ? colors.green : isLate ? colors.red : colors.orange }]} />
                                        </View>
                                    )}

                                    {/* Card Contenido */}
                                    <View style={[styles.itemCard, { backgroundColor: colors.card, borderLeftWidth: viewMode === 'fixed' ? 4 : 0, borderLeftColor: isPaid ? colors.green : colors.accent, padding: 0 }]}>
                                        <TouchableOpacity 
                                            style={{ padding: 18 }}
                                            activeOpacity={0.7}
                                            onLongPress={() => handleDelete(item.id)}
                                            onPress={() => viewMode === 'debt' ? handleDebtAction(item) : handleFixedAction(item)}
                                        >
                                            <View style={styles.itemHeaderInner}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemLabel, { color: colors.sub }]}>
                                                        {viewMode === 'fixed' ? `Día de pago: ${day}` : `${Math.round(itemPct)}% completado`}
                                                    </Text>
                                                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>{item.client}</Text>
                                                </View>
                                                <Text style={[styles.itemAmount, { color: colors.text }]}>{fmt(item.value)}</Text>
                                            </View>

                                            {/* Barra progreso pequeña */}
                                            <View style={[styles.miniBarBase, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                                                <View style={[styles.miniBarFill, { width: `${itemPct}%`, backgroundColor: isPaid ? colors.green : isLate ? colors.red : colors.accent }]} />
                                            </View>
                                        </TouchableOpacity>

                                        <View style={[styles.itemFooter, { paddingHorizontal: 18, paddingBottom: 18 }]}>
                                            <View style={[styles.badge, { backgroundColor: isPaid ? colors.green + '15' : isLate ? colors.red + '15' : colors.orange + '15' }]}>
                                                <Text style={[styles.badgeText, { color: isPaid ? colors.green : isLate ? colors.red : colors.orange }]}>
                                                    {isPaid ? 'Pagado' : isLate ? 'Atrasado' : 'Pendiente'}
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                 {!isPaid && viewMode === 'fixed' && (
                                                     <TouchableOpacity 
                                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sub + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                                                        onPress={() => handleSkipFixed(item)}
                                                     >
                                                         <MaterialIcons name="skip-next" size={14} color={colors.sub} />
                                                         <Text style={{ fontSize: 10, fontWeight: '800', color: colors.sub }}>OMITIR</Text>
                                                     </TouchableOpacity>
                                                 )}
                                                 
                                                 <TouchableOpacity onPress={() => handleEditStart(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                                     <Ionicons name="pencil-outline" size={18} color={colors.sub} />
                                                 </TouchableOpacity>
                                                 
                                                 <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                                     <Ionicons name="trash-outline" size={18} color={colors.sub} />
                                                 </TouchableOpacity>

                                                 {viewMode === 'fixed' && (
                                                     <TouchableOpacity onPress={() => handleFixedAction(item)}>
                                                        <Ionicons name={isPaid ? "checkbox" : "square-outline"} size={22} color={isPaid ? colors.green : colors.sub} />
                                                     </TouchableOpacity>
                                                 )}
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
                
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* BOTÓN FLOTANTE (+) REMOVIDO POR SOLICITUD - USAR EL DEL HEADER */}

            {/* MODAL ADICIÓN */}
        <Modal visible={modalVisible} animationType="slide" transparent>
            <View style={{ flex: 1 }}>
                <ConditionalWrapper
                    condition={Platform.OS !== 'web'}
                    wrapper={children => (
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                            {children}
                        </TouchableWithoutFeedback>
                    )}
                >
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
                            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>
                                    {isEditing ? 'Editar Registro' : 'Nuevo Registro'}
                                </Text>
                                
                                {!isEditing && (
                                    <View style={styles.typeSelector}>
                                        <TouchableOpacity 
                                            style={[styles.typeBtn, viewMode === 'debt' && { backgroundColor: colors.accent }]}
                                            onPress={() => setViewMode('debt')}
                                        >
                                            <Text style={{ color: viewMode === 'debt' ? '#FFF' : colors.sub, fontWeight: '700' }}>Deuda</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.typeBtn, viewMode === 'fixed' && { backgroundColor: colors.accent }]}
                                            onPress={() => setViewMode('fixed')}
                                        >
                                            <Text style={{ color: viewMode === 'fixed' ? '#FFF' : colors.sub, fontWeight: '700' }}>Gasto Fijo</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <TextInput 
                                    style={[styles.input, { backgroundColor: isDark ? '#334155' : '#F1F5F9', color: colors.text }]}
                                    placeholder="Nombre (ej. Arriendo, Mamá)" placeholderTextColor={colors.sub}
                                    value={name} onChangeText={setName}
                                />
                                <TextInput 
                                    style={[styles.input, { backgroundColor: isDark ? '#334155' : '#F1F5F9', color: colors.text }]}
                                    placeholder="Monto ($)" placeholderTextColor={colors.sub}
                                    keyboardType="numeric" value={amount} onChangeText={t => setAmount(formatInput(t))}
                                />
                                
                                {Platform.OS === 'web' ? (
                                    <input
                                        type="date"
                                        style={{
                                            backgroundColor: isDark ? '#334155' : '#F1F5F9',
                                            color: colors.text,
                                            borderRadius: '12px',
                                            padding: '16px',
                                            fontSize: '16px',
                                            marginBottom: '15px',
                                            border: 'none',
                                            outline: 'none',
                                            width: '100%',
                                            fontFamily: 'inherit'
                                        }}
                                        value={dueDate.toISOString().split('T')[0]}
                                        onChange={(e) => setDueDate(new Date(e.target.value))}
                                    />
                                ) : (
                                    <>
                                        <TouchableOpacity 
                                            style={[styles.input, { backgroundColor: isDark ? '#334155' : '#F1F5F9', justifyContent: 'center' }]}
                                            onPress={() => setShowDatePicker(true)}
                                        >
                                            <Text style={{ color: colors.text }}>
                                                {viewMode === 'debt' ? 'Fecha Vencimiento: ' : 'Día de Cobro: '}
                                                {dueDate.toLocaleDateString('es-CO')}
                                            </Text>
                                        </TouchableOpacity>

                                        {showDatePicker && (
                                            <DateTimePicker
                                                value={dueDate} mode="date" display="default"
                                                onChange={(e, d) => {
                                                    setShowDatePicker(false);
                                                    if (d) setDueDate(d);
                                                }}
                                            />
                                        )}
                                    </>
                                )}

                                <View style={styles.modalBtns}>
                                    <TouchableOpacity style={[styles.btnAction, { backgroundColor: colors.border }]} onPress={() => setModalVisible(false)}>
                                        <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.btnAction, { backgroundColor: colors.accent }]} onPress={handleSave}>
                                        <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </ConditionalWrapper>
            </View>
        </Modal>

            {/* MODAL PAGO (RECORDAR TRANSACCIÓN) */}
            <Modal visible={payModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1 }}>
                    <ConditionalWrapper
                        condition={Platform.OS !== 'web'}
                        wrapper={children => (
                            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                                {children}
                            </TouchableWithoutFeedback>
                        )}
                    >
                        <View style={styles.modalOverlay}>
                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
                                <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                                        {selectedDebt?.debt_type === 'fixed' ? 'Pagar Gasto Fijo' : 'Registrar Abono'}
                                    </Text>
                                    <Text style={[styles.modalHint, { color: colors.sub }]}>
                                        {selectedDebt?.client} - Pendiente: {fmt(selectedDebt ? selectedDebt.value - selectedDebt.paid : 0)}
                                    </Text>

                                    {selectedDebt?.debt_type !== 'fixed' && (
                                        <TextInput 
                                            style={[styles.input, { backgroundColor: isDark ? '#334155' : '#F1F5F9', color: colors.text }]}
                                            placeholder="¿Cuánto vas a pagar?" placeholderTextColor={colors.sub}
                                            keyboardType="numeric" value={payAmount} onChangeText={t => setPayAmount(formatInput(t))}
                                            autoFocus
                                        />
                                    )}

                                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.sub, marginBottom: 10, marginTop: 10 }}>PAGAR DESDE:</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                                        {accounts.map(acc => (
                                            <TouchableOpacity 
                                                key={acc} 
                                                onPress={() => setSelectedAccount(acc)}
                                                style={{ 
                                                    paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, 
                                                    borderWidth: 2, borderColor: selectedAccount === acc ? colors.accent : colors.border,
                                                    backgroundColor: selectedAccount === acc ? colors.accent + '10' : 'transparent'
                                                }}
                                            >
                                                <Text style={{ fontWeight: '700', color: selectedAccount === acc ? colors.accent : colors.sub }}>{acc}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity style={[styles.btnAction, { backgroundColor: colors.border }]} onPress={() => setPayModalVisible(false)}>
                                            <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.btnAction, { backgroundColor: colors.accent }]} onPress={handlePayment}>
                                            <Text style={{ color: '#FFF', fontWeight: '700' }}>Confirmar Pago</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </KeyboardAvoidingView>
                        </View>
                    </ConditionalWrapper>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
        paddingHorizontal: 20, paddingVertical: 15, paddingTop: Platform.OS === 'android' ? 50 : 15 
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    addBtnHeader: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
    
    // Tabs
    tabBar: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
    tabText: { fontWeight: '700', fontSize: 16 },

    scroll: { paddingHorizontal: 20 },

    // Summary Card
    summaryCard: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 24, marginBottom: 25, alignItems: 'center' },
    summaryHeaderLabel: { fontSize: 22, fontWeight: '900', marginBottom: 20, width: '100%', textAlign: 'left' },
    progressBarBase: { height: 12, width: '100%', borderRadius: 6, marginBottom: 20, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 6 },
    summaryStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    statCol: { flex: 1 },
    statLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
    statValue: { fontSize: 20, fontWeight: '800' },
    statDivider: { width: 1, height: 30, backgroundColor: 'rgba(128,128,128,0.2)', marginHorizontal: 20 },

    chartWrap: { position: 'relative', marginBottom: 15 },
    chartLabel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
    chartPct: { fontSize: 24, fontWeight: '900' },
    chartSub: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    summaryTitle: { fontSize: 18, fontWeight: '800', marginBottom: 5 },
    summaryDetail: { fontSize: 13, fontWeight: '600' },

    sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },

    // Timeline Items
    timelineContainer: { position: 'relative' },
    timelineLine: { position: 'absolute', left: 24, top: 0, bottom: 0, width: 2 },
    itemWrapper: { flexDirection: 'row', marginBottom: 25, gap: 15 },
    timelineDateCol: { width: 50, alignItems: 'center', position: 'relative' },
    dateDay: { fontSize: 20, fontWeight: '900' },
    dateMonth: { fontSize: 11, fontWeight: '700' },
    timelineDot: { width: 14, height: 14, borderRadius: 7, position: 'absolute', right: 0, top: 8, zIndex: 10, borderWidth: 3, borderColor: '#FFF' },
    
    itemCard: { flex: 1, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    itemHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    itemLabel: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
    itemTitle: { fontSize: 16, fontWeight: '700' },
    itemAmount: { fontSize: 16, fontWeight: '800' },
    miniBarBase: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
    miniBarFill: { height: '100%', borderRadius: 3 },
    itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 11, fontWeight: '800' },

    emptyState: { alignItems: 'center', marginTop: 40 },
    emptyText: { marginTop: 10, fontWeight: '600' },

    fab: { 
        position: 'absolute', bottom: 30, right: 30, width: 64, height: 64, 
        borderRadius: 32, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
        shadowColor: '#6366F1', shadowOpacity: 0.4, shadowRadius: 10, elevation: 5
    },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 50 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
    modalHint: { fontSize: 14, marginBottom: 20 },
    typeSelector: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    typeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(128,128,128,0.2)' },
    input: { borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 15 },
    modalBtns: { flexDirection: 'row', gap: 15, marginTop: 10 },
    btnAction: { flex: 1, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
});
