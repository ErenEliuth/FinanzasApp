import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ThemeName } from '@/constants/Themes';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, getCurrencyInfo, convertToBase, CURRENCIES } from '@/utils/currency';
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

const { width } = Dimensions.get('window');

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
    const { user, theme, currency, rates, isHidden } = useAuth();
    const colors = useThemeColors();
    const isDark = colors.isDark;

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);


    const [viewMode, setViewMode] = useState<'debt' | 'fixed'>('debt');
    const [debts, setDebts] = useState<DebtItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [dueDate, setDueDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(new Date().getDate().toString());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [confirmMonthModal, setConfirmMonthModal] = useState(false);
    const [pendingItem, setPendingItem] = useState<{ val: number; dateStr: string } | null>(null);
    const [selectedDebt, setSelectedDebt] = useState<DebtItem | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [accounts, setAccounts] = useState<string[]>(['Efectivo']);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    useEffect(() => { if (isFocused) { loadData(); loadAccounts(); } }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.from('debts').select('*').eq('user_id', user.id);
            if (error) throw error;
            
            const today = new Date();
            const currM = today.getMonth();
            const currY = today.getFullYear();

            // Sincronizar gastos fijos con el mes actual
            const synced = await Promise.all((data || []).map(async (item) => {
                if (item.debt_type === 'fixed') {
                    const itemDate = new Date(item.due_date + 'T12:00:00');
                    if (itemDate.getMonth() !== currM || itemDate.getFullYear() !== currY) {
                        // Es de un mes pasado, reiniciar a pendiente para el mes actual
                        const newD = new Date(currY, currM, itemDate.getDate()).toISOString().split('T')[0];
                        await supabase.from('debts').update({ paid: 0, due_date: newD }).eq('id', item.id);
                        return { ...item, paid: 0, due_date: newD };
                    }
                }
                return item;
            }));

            const sorted = (synced || []).sort((a, b) => {
                const isPaidA = a.paid >= a.value;
                const isPaidB = b.paid >= b.value;
                if (isPaidA !== isPaidB) return isPaidA ? 1 : -1;
                return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            });
            setDebts(sorted);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const loadAccounts = async () => {
        try {
            const stored = await AsyncStorage.getItem('@custom_accounts');
            if (stored) setAccounts(['Efectivo', ...JSON.parse(stored)]);
            else setAccounts(['Efectivo']);
        } catch (e) { }
    };

    const handleAmountChange = (text: string) => {
        if (currency === 'COP') {
            const clean = text.replace(/\D/g, '');
            if (!clean) setAmount('');
            else setAmount(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
        } else {
            const filtered = text.replace(/[^0-9.,]/g, '');
            const dots = (filtered.match(/[.,]/g) || []).length;
            if (dots <= 1) setAmount(filtered);
        }
    };

    const handlePayAmountChange = (text: string) => {
        if (currency === 'COP') {
            const clean = text.replace(/\D/g, '');
            if (!clean) setPayAmount('');
            else setPayAmount(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
        } else {
            const filtered = text.replace(/[^0-9.,]/g, '');
            const dots = (filtered.match(/[.,]/g) || []).length;
            if (dots <= 1) setPayAmount(filtered);
        }
    };


    const handleSave = async () => {
        let cleanStr = amount;
        if (currency === 'COP') {
            cleanStr = amount.replace(/\./g, '').replace(',', '.');
        } else {
            cleanStr = amount.replace(/,/g, '');
        }
        const typedVal = parseFloat(cleanStr);
        const val = convertToBase(typedVal, currency, rates);
        if (!name.trim() || isNaN(val) || val <= 0) {
            if (Platform.OS === 'web') window.alert('Completa todos los campos');
            else Alert.alert('Error', 'Completa todos los campos');
            return;
        }

        let dateStr = '';
        if (viewMode === 'fixed') {
            const day = parseInt(selectedDay, 10);
            if (isNaN(day) || day < 1 || day > 31) {
                if (Platform.OS === 'web') window.alert('Día inválido (1-31)');
                else Alert.alert('Error', 'Ingresa un día válido (1-31)');
                return;
            }
            const today = new Date();
            dateStr = new Date(today.getFullYear(), today.getMonth(), day).toISOString().split('T')[0];

            if (day < today.getDate() && !isEditing) {
                setPendingItem({ val, dateStr });
                setConfirmMonthModal(true);
                return;
            }
        } else {
            dateStr = dueDate.toISOString().split('T')[0];
        }

        await executeSave(val, dateStr, 0);
    };

    const executeSave = async (val: number, dateStr: string, initialPaid: number) => {
        try {
            if (isEditing && editId) {
                await supabase.from('debts').update({ client: name.trim(), value: val, due_date: dateStr }).eq('id', editId);
            } else {
                await supabase.from('debts').insert([{ user_id: user?.id, client: name.trim(), value: val, paid: initialPaid, due_date: dateStr, debt_type: viewMode, created_date: new Date().toISOString() }]);
            }
            setModalVisible(false); setConfirmMonthModal(false); setPendingItem(null); resetForm(); loadData();
        } catch (e) { console.error(e); }
    };

    const resetForm = () => { setName(''); setAmount(''); setDueDate(new Date()); setSelectedDay(new Date().getDate().toString()); setIsEditing(false); setEditId(null); };

    const handleEditStart = (item: DebtItem) => {
        setName(item.client);
        setAmount(item.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."));
        const d = new Date(item.due_date + 'T12:00:00');
        setDueDate(d);
        setSelectedDay(d.getDate().toString());
        setEditId(item.id); setIsEditing(true); setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        const msg = '¿Estás seguro de eliminar este registro?';
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) { await supabase.from('debts').delete().eq('id', id); loadData(); }
            return;
        }
        Alert.alert('Eliminar', msg, [{ text: 'Cancelar' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await supabase.from('debts').delete().eq('id', id); loadData(); } }]);
    };

    const handleSkipFixed = async (item: DebtItem) => {
        const msg = `¿Quieres omitir el pago de "${item.client}" este mes? Se marcará como pagado pero NO se descontará de tus cuentas.`;
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) { await supabase.from('debts').update({ paid: item.value }).eq('id', item.id); loadData(); }
            return;
        }
        Alert.alert('Omitir Pago', msg, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Omitir', onPress: async () => { await supabase.from('debts').update({ paid: item.value }).eq('id', item.id); loadData(); } }
        ]);
    };

    const handlePayment = async () => {
        if (!selectedDebt) return;
        const isFixed = selectedDebt.debt_type === 'fixed';
        const pVal = isFixed ? selectedDebt.value : parseFloat(payAmount.replace(/\./g, ''));
        if (isNaN(pVal) || pVal <= 0) return;
        const actualPay = isFixed ? pVal : Math.min(pVal, selectedDebt.value - selectedDebt.paid);
        try {
            await supabase.from('debts').update({ paid: selectedDebt.paid + actualPay }).eq('id', selectedDebt.id);
            await supabase.from('transactions').insert([{ user_id: user?.id, amount: actualPay, type: 'expense', category: isFixed ? 'Gasto Fijo' : 'Deudas', description: isFixed ? `Pago: ${selectedDebt.client}` : `Abono: ${selectedDebt.client}`, account: selectedAccount, date: new Date().toISOString() }]);
            setPayModalVisible(false); setPayAmount(''); setSelectedDebt(null); loadData();
        } catch (e) { console.error(e); }
    };

    const currentList = debts.filter(d => d.debt_type === viewMode);
    
    const totalValue = currentList.reduce((s, d) => s + d.value, 0);
    const totalPaid = currentList.reduce((s, d) => s + (d.paid || 0), 0);
    const progressPct = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {viewMode === 'debt' ? 'Deudas' : 'Gastos Fijos'}
                </Text>
                <TouchableOpacity onPress={() => (resetForm(), setModalVisible(true))} style={[styles.circleBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="add" size={26} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Selector de Modo */}
            <View style={styles.selectorCont}>
                <View style={[styles.selectorBg, { backgroundColor: colors.card }]}>
                    <TouchableOpacity onPress={() => setViewMode('debt')} style={[styles.selBtn, viewMode === 'debt' && { backgroundColor: colors.accent }]}>
                        <Text style={[styles.selTxt, { color: viewMode === 'debt' ? '#FFF' : colors.sub }]}>Deudas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setViewMode('fixed')} style={[styles.selBtn, viewMode === 'fixed' && { backgroundColor: colors.accent }]}>
                        <Text style={[styles.selTxt, { color: viewMode === 'fixed' ? '#FFF' : colors.sub }]}>Gastos Fijos</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Resumen */}
                <View style={[styles.heroCard, { backgroundColor: colors.accent }]}>
                    <View style={styles.heroRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.heroLab}>Total {viewMode === 'debt' ? 'Pendiente' : 'del Mes'}</Text>
                            <Text style={styles.heroVal}>{fmt(totalValue - totalPaid)}</Text>
                        </View>
                        <View style={styles.chartMini}>
                            <Svg width={70} height={70} viewBox="0 0 100 100">
                                <Circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.2)" strokeWidth="10" fill="none" />
                                <Circle cx="50" cy="50" r="45" stroke="#FFF" strokeWidth="10" fill="none" strokeDasharray={`${progressPct * 2.82} 282`} strokeLinecap="round" transform="rotate(-90 50 50)" />
                                <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '900' }}>{Math.round(progressPct)}%</Text>
                                </View>
                            </Svg>
                        </View>
                    </View>
                    <View style={styles.heroFooter}>
                        <Text style={styles.heroMsg}>Has cubierto {fmt(totalPaid)} hasta hoy. {totalValue > totalPaid && `Faltan ${fmt(totalValue - totalPaid)}`}</Text>
                    </View>
                </View>

                {/* Listado */}
                {loading ? (
                    <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
                ) : currentList.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="leaf-outline" size={64} color={colors.sub + '40'} />
                        <Text style={[styles.emptyTxt, { color: colors.sub }]}>Todo está en orden por aquí.</Text>
                    </View>
                ) : (
                    currentList.map(item => {
                        const isPaid = item.paid >= item.value;
                        const pct = (item.paid / item.value) * 100;
                        const date = new Date(item.due_date);
                        const dayStr = date.getUTCDate().toString().padStart(2, '0');
                        const monthStr = date.toLocaleString('es-CO', { month: 'short', timeZone: 'UTC' }).toUpperCase();

                        return (
                            <TouchableOpacity 
                                key={item.id} 
                                style={[styles.itemCard, { backgroundColor: colors.card }]}
                                onPress={() => { setSelectedDebt(item); setPayModalVisible(true); }}
                                onLongPress={() => handleEditStart(item)}
                            >
                                <View style={styles.cardInfo}>
                                    <View style={[styles.dateBox, { backgroundColor: colors.bg }]}>
                                        <Text style={[styles.dateD, { color: colors.text }]}>{dayStr}</Text>
                                        <Text style={[styles.dateM, { color: colors.sub }]}>{monthStr}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemName, { color: colors.text }]}>{item.client}</Text>
                                        <Text style={[styles.itemSub, { color: colors.sub }]}>{isPaid ? 'Completado' : `Saldo: ${fmt(item.value - item.paid)}`}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[styles.totalVal, { color: colors.text }]}>{fmt(item.value)}</Text>
                                        <View style={[styles.statusBadge, { backgroundColor: isPaid ? '#E8F5E9' : '#FFF3E0' }]}>
                                            <Text style={[styles.statusTxt, { color: isPaid ? '#4A7C59' : '#E67E22' }]}>{isPaid ? 'PAGO' : 'PEND.'}</Text>
                                        </View>
                                    </View>
                                </View>
                                
                                <View style={styles.progressArea}>
                                    <View style={[styles.pBarBg, { backgroundColor: colors.bg }]}>
                                        <View style={[styles.pBarFill, { width: `${pct}%`, backgroundColor: isPaid ? '#4A7C59' : colors.accent }]} />
                                    </View>
                                </View>

                                <View style={styles.cardActions}>
                                    {!isPaid && viewMode === 'fixed' && (
                                        <TouchableOpacity 
                                            style={styles.skipBtn} 
                                            onPress={() => handleSkipFixed(item)}
                                        >
                                            <Ionicons name="play-forward" size={14} color={colors.sub} />
                                            <Text style={styles.skipTxt}>OMITIR</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={styles.miniBtn} onPress={() => handleEditStart(item)}>
                                        <Ionicons name="pencil" size={16} color={colors.sub} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.miniBtn} onPress={() => handleDelete(item.id)}>
                                        <Ionicons name="trash" size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modal Creación/Edición */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                            <View style={styles.mHeader}>
                                <Text style={[styles.mTitle, { color: colors.text }]}>{isEditing ? 'Editar' : 'Nueva'} {viewMode === 'debt' ? 'Deuda' : 'Gasto'}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.mField}>
                                <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE</Text>
                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={name} onChangeText={setName} placeholder="Ej. Arriendo, Crédito Bancolombia" placeholderTextColor={colors.sub + '60'} />
                            </View>

                            <View style={styles.mField}>
                                <Text style={[styles.mLabel, { color: colors.sub }]}>MONTO</Text>
                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={amount} onChangeText={handleAmountChange} placeholder="$ 0" placeholderTextColor={colors.sub + '60'} keyboardType="decimal-pad" />
                            </View>

                             {viewMode === 'debt' ? (
                                Platform.OS === 'web' ? (
                                    <View style={styles.mField}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA LÍMITE</Text>
                                        <View style={{ borderBottomWidth: 2, borderBottomColor: colors.border }}>
                                            {React.createElement('input', {
                                                type: 'date',
                                                value: dueDate.toISOString().split('T')[0],
                                                onChange: (e: any) => {
                                                    const d = new Date(e.target.value + 'T12:00:00');
                                                    if (!isNaN(d.getTime())) setDueDate(d);
                                                },
                                                style: {
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: isDark ? '#F5F0E8' : '#2D2D2D',
                                                    fontSize: '18px',
                                                    fontWeight: '700',
                                                    padding: '12px 0',
                                                    width: '100%',
                                                    outline: 'none',
                                                    fontFamily: 'inherit',
                                                }
                                            })}
                                        </View>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.mField} onPress={() => setShowDatePicker(true)}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA LÍMITE</Text>
                                        <View style={[styles.mInput, { borderBottomColor: colors.border, justifyContent: 'center' }]}>
                                            <Text style={{ color: colors.text, fontSize: 16 }}>{dueDate.toLocaleDateString('es-CO')}</Text>
                                        </View>
                                    </TouchableOpacity>
                                )
                            ) : (
                                <View style={styles.mField}>
                                    <Text style={[styles.mLabel, { color: colors.sub }]}>DÍA DE PAGO (1 - 31)</Text>
                                    <TextInput 
                                        style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                        value={selectedDay} 
                                        onChangeText={setSelectedDay}
                                        placeholder="Ej. 15"
                                        placeholderTextColor={colors.sub + '60'}
                                        keyboardType="number-pad"
                                        maxLength={2}
                                    />
                                </View>
                            )}

                            {Platform.OS === 'ios' && showDatePicker && (
                                <View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 10, marginVertical: 10 }}>
                                    <DateTimePicker 
                                        value={dueDate} 
                                        mode="date" 
                                        display="spinner"
                                        themeVariant={isDark ? "dark" : "light"}
                                        onChange={(e, d) => { if (d) setDueDate(d); }} 
                                    />
                                    <TouchableOpacity style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setShowDatePicker(false)}>
                                        <Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar Fecha</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {Platform.OS === 'android' && showDatePicker && (
                                <DateTimePicker 
                                    value={dueDate} 
                                    mode="date" 
                                    display="default" 
                                    onChange={(e, d) => { 
                                        setShowDatePicker(false); 
                                        if (d) setDueDate(d); 
                                    }} 
                                />
                            )}

                            <TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: colors.accent }]} onPress={handleSave}>
                                <Text style={styles.mBtnText}>{isEditing ? 'Actualizar' : 'Registrar'}</Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Modal Confirmación Mes Inicia (Gasto Fijo) */}
            <Modal visible={confirmMonthModal} animationType="fade" transparent>
                <View style={[styles.overlayCenter, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card, paddingVertical: 32 }]}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <Ionicons name="calendar" size={32} color={colors.accent} />
                        </View>
                        <Text style={[styles.miniTitle, { color: colors.text, marginBottom: 8 }]}>¿Cuándo inicia este gasto?</Text>
                        <Text style={[styles.miniSub, { color: colors.sub, marginBottom: 32, paddingHorizontal: 10 }]}>El día elegido ya pasó este mes. ¿Deseas que empiece ahora o el próximo mes?</Text>
                        
                        <View style={styles.miniActions}>
                            <TouchableOpacity 
                                style={[styles.mBtnB, { backgroundColor: colors.bg, height: 56 }]} 
                                onPress={() => executeSave(pendingItem?.val || 0, pendingItem?.dateStr || '', 0)}
                            >
                                <Text style={{ color: colors.text, fontWeight: '800' }}>Este Mes</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.mBtnB, { backgroundColor: colors.accent, height: 56 }]} 
                                onPress={() => executeSave(pendingItem?.val || 0, pendingItem?.dateStr || '', pendingItem?.val || 0)}
                            >
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Próximo Mes</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setConfirmMonthModal(false)}>
                            <Text style={{ color: colors.sub, fontWeight: '700', fontSize: 13 }}>Cancelar registro</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>



            {/* Modal Pago */}
            <Modal visible={payModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.miniTitle, { color: colors.text }]}>{selectedDebt?.client}</Text>
                        <Text style={[styles.miniSub, { color: colors.sub }]}>Pendiente: {fmt(selectedDebt ? selectedDebt.value - selectedDebt.paid : 0)}</Text>
                        
                        {selectedDebt?.debt_type === 'debt' && (
                            <TextInput 
                                style={[styles.miniInput, { color: colors.text, borderBottomColor: colors.border }]}
                                value={payAmount} onChangeText={handlePayAmountChange}
                                placeholder="Monto a pagar" placeholderTextColor={colors.sub + '40'}
                                keyboardType="decimal-pad" autoFocus
                            />
                        )}

                        <View style={styles.accountRow}>
                            {accounts.map(acc => (
                                <TouchableOpacity key={acc} onPress={() => setSelectedAccount(acc)} style={[styles.accBtn, { borderColor: colors.border }, selectedAccount === acc && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                                    <Text style={[styles.accTxt, { color: selectedAccount === acc ? '#FFF' : colors.sub }]}>{acc}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.miniActions}>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                <Text style={{ color: colors.text, fontWeight: '800' }}>Cerrar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.accent }]} onPress={handlePayment}>
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text>
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 20 },
    headerTitle: { fontSize: 22, fontWeight: '900' },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

    selectorCont: { paddingHorizontal: 24, marginBottom: 24 },
    selectorBg: { flexDirection: 'row', borderRadius: 20, padding: 6 },
    selBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
    selTxt: { fontSize: 14, fontWeight: '800' },

    scroll: { paddingHorizontal: 24 },
    heroCard: { borderRadius: 32, padding: 24, marginBottom: 24, elevation: 6, shadowColor: '#4A7C59', shadowOpacity: 0.2, shadowRadius: 15 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    heroLab: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700', marginBottom: 4 },
    heroVal: { color: '#FFF', fontSize: 28, fontWeight: '900' },
    chartMini: { width: 70, height: 70, justifyContent: 'center', alignItems: 'center' },
    heroFooter: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    heroMsg: { color: '#FFF', fontSize: 13, fontWeight: '600', opacity: 0.9 },

    empty: { alignItems: 'center', marginTop: 60, opacity: 0.6 },
    emptyTxt: { marginTop: 16, fontWeight: '700', fontSize: 15 },

    itemCard: { borderRadius: 28, padding: 20, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
    cardInfo: { flexDirection: 'row', gap: 14, alignItems: 'center' },
    dateBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    dateD: { fontSize: 16, fontWeight: '900' },
    dateM: { fontSize: 9, fontWeight: '800' },
    itemName: { fontSize: 16, fontWeight: '800' },
    itemSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    totalVal: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusTxt: { fontSize: 10, fontWeight: '900' },

    progressArea: { marginTop: 16 },
    pBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
    pBarFill: { height: '100%', borderRadius: 4 },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12, alignItems: 'center' },
    miniBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' },
    skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    skipTxt: { fontSize: 10, fontWeight: '900', color: '#8B8680' },

    // Modales
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingBottom: 48 },
    mHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
    mTitle: { fontSize: 22, fontWeight: '900' },
    mField: { marginBottom: 24 },
    mLabel: { fontSize: 11, fontWeight: '800', marginBottom: 10, letterSpacing: 1 },
    mInput: { fontSize: 18, fontWeight: '700', paddingVertical: 12, borderBottomWidth: 2 },
    mBtnPrimary: { height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    mBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

    overlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    miniModal: { borderRadius: 32, padding: 28 },
    miniTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
    miniSub: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 20 },
    miniInput: { fontSize: 24, fontWeight: '900', textAlign: 'center', paddingVertical: 12, borderBottomWidth: 2, marginBottom: 20 },
    accountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 },
    accBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
    accTxt: { fontSize: 12, fontWeight: '800' },
    miniActions: { flexDirection: 'row', gap: 12 },
    mBtnB: { flex: 1, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
});
