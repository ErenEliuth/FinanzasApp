import { useAuth } from '@/utils/auth';
import { getLocalISOString } from '@/utils/dateUtils';
import { SYNC_KEYS } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, convertToBase, formatInputDisplay, parseInputToNumber } from '@/utils/currency';
import {
    ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Modal, Platform,
    SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
    TouchableWithoutFeedback, View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const { width } = Dimensions.get('window');

// ── Math: Monthly rate from any rate type ────────────────────
const getMonthlyRate = (rate: number, type: string): number => {
    const v = rate / 100;
    if (type === 'EA') return Math.pow(1 + v, 1 / 12) - 1;
    if (type === 'EM' || type === 'MV') return v;
    if (type === 'NMV') return v / 12;
    return v;
};

// ── Loan Types ───────────────────────────────────────────────
type ExtraPaymentRecord = { date: string; amount: number; interestSaved: number; monthsReduced: number; };
type LoanMeta = {
    isFinancialLoan: true; name: string; entity: string; loanType: string;
    disbursed: number; interestRate: number; rateType: string; termMonths: number;
    disbursementDate: string; firstPaymentDate: string; paymentDay: number;
    amortizationMethod: string; receiveAccount: string;
    extraPayments: ExtraPaymentRecord[]; paidInstallments: number[];
};
type Installment = {
    number: number; dueDate: string; principal: number; interest: number;
    total: number; endingBalance: number; extraPaid: number;
    status: 'paid' | 'pending' | 'upcoming' | 'overdue';
};

// ── Amortization Engine ──────────────────────────────────────
const buildSchedule = (
    disbursed: number, r: number, termMonths: number, method: string,
    firstPaymentDate: string, extras: ExtraPaymentRecord[], paidList: number[]
): Installment[] => {
    if (!disbursed || disbursed <= 0 || termMonths <= 0) return [];
    const table: Installment[] = [];
    let balance = disbursed;
    const isFixed = method.toLowerCase().includes('fija') || method.toLowerCase().includes('franc');
    const isCapital = method.toLowerCase().includes('capital fijo') || (!isFixed && method.toLowerCase().includes('fijo'));
    const isInterestOnly = method.toLowerCase().includes('interes');
    const A = isFixed && r > 0 ? (disbursed * r) / (1 - Math.pow(1 + r, -termMonths)) : isFixed ? disbursed / termMonths : 0;
    const capitalChunk = disbursed / termMonths;
    const firstDate = new Date(firstPaymentDate + 'T12:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (let m = 1; balance > 0.5 && m <= Math.max(termMonths * 2, 360); m++) {
        const dueDate = new Date(firstDate);
        dueDate.setMonth(firstDate.getMonth() + (m - 1));
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const interest = Math.round(balance * r * 100) / 100;
        let principal = 0;
        if (isFixed) {
            const scheduled = Math.min(A, balance + interest);
            principal = Math.max(0, scheduled - interest);
        } else if (isCapital) {
            principal = Math.min(capitalChunk, balance);
        } else if (isInterestOnly) {
            principal = m >= termMonths ? balance : 0;
        } else {
            principal = Math.min(capitalChunk, balance);
        }
        principal = Math.round(Math.min(principal, balance) * 100) / 100;
        const total = Math.round((principal + interest) * 100) / 100;
        balance = Math.round((balance - principal) * 100) / 100;
        let extraPaid = 0;
        extras.forEach(ep => {
            if (!ep.date) return;
            const epD = new Date(ep.date + 'T12:00:00');
            const prevMonth = new Date(dueDate); prevMonth.setMonth(dueDate.getMonth() - 1);
            if (epD >= prevMonth && epD < dueDate && balance > 0) {
                const actual = Math.min(ep.amount, balance);
                balance = Math.round((balance - actual) * 100) / 100;
                extraPaid += actual;
            }
        });
        const isPaid = paidList.includes(m);
        let status: Installment['status'] = isPaid ? 'paid' : 'pending';
        if (!isPaid) {
            const dueLocal = new Date(dueDateStr + 'T12:00:00'); dueLocal.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dueLocal.getTime() - today.getTime()) / 86400000);
            if (dueLocal < today) status = 'overdue';
            else if (diffDays <= 7) status = 'upcoming';
        }
        table.push({ number: m, dueDate: dueDateStr, principal, interest, total, endingBalance: Math.max(0, balance), extraPaid: Math.round(extraPaid * 100) / 100, status });
    }
    return table;
};

const parseLoanMeta = (client: string): LoanMeta | null => {
    try {
        if (client && client.startsWith('{')) {
            const p = JSON.parse(client);
            if (p && p.isFinancialLoan) return p as LoanMeta;
        }
    } catch (e) {}
    return null;
};

// ── Types ────────────────────────────────────────────────────
type DebtItem = {
    id: string; client: string; value: number; paid: number;
    due_date: string; debt_type: 'debt' | 'fixed' | 'loan_owe';
    status?: string; created_date?: string;
};

export default function DebtsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, currency, rates, isHidden } = useAuth();
    const colors = useThemeColors();
    const isDark = colors.isDark;
    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    const [viewMode, setViewMode] = useState<'debt' | 'fixed' | 'loan_owe'>('debt');
    const [debts, setDebts] = useState<DebtItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // Debt/Fixed form
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

    // Loan creation form (3-step)
    const [loanModalVisible, setLoanModalVisible] = useState(false);
    const [loanStep, setLoanStep] = useState(1);
    const [loanName, setLoanName] = useState('');
    const [loanEntity, setLoanEntity] = useState('Bancolombia');
    const [loanType, setLoanType] = useState('Libre inversión');
    const [loanAmount, setLoanAmount] = useState('');
    const [loanRate, setLoanRate] = useState('1.5');
    const [loanRateType, setLoanRateType] = useState('EM');
    const [loanTerm, setLoanTerm] = useState('12');
    const [loanDisbursementDate, setLoanDisbursementDate] = useState(new Date());
    const [loanFirstPaymentDate, setLoanFirstPaymentDate] = useState(new Date());
    const [loanAmortization, setLoanAmortization] = useState('Cuota fija (Sistema francés)');
    const [loanReceiveAccount, setLoanReceiveAccount] = useState('Efectivo');
    const [showDisbursementPicker, setShowDisbursementPicker] = useState(false);
    const [showFirstPaymentPicker, setShowFirstPaymentPicker] = useState(false);

    // Loan detail modal
    const [loanDetailsModalVisible, setLoanDetailsModalVisible] = useState(false);
    const [selectedLoanItem, setSelectedLoanItem] = useState<DebtItem | null>(null);
    const [extraPaymentAmount, setExtraPaymentAmount] = useState('');
    const [simulatorAmount, setSimulatorAmount] = useState('');
    const [showSimulatorResults, setShowSimulatorResults] = useState(false);
    const [showEarlyPayoff, setShowEarlyPayoff] = useState(false);
    const [showPaySchedule, setShowPaySchedule] = useState(false);
    const [selectedPayAccount, setSelectedPayAccount] = useState('Efectivo');

    const scrollRef = useRef<any>(null);

    useEffect(() => {
        if (isFocused) { loadData(); loadAccounts(); scrollRef.current?.scrollTo({ y: 0, animated: false }); }
    }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.from('debts').select('*').eq('user_id', user.id);
            if (error) throw error;
            const today = new Date(); const currM = today.getMonth(); const currY = today.getFullYear();
            const synced = await Promise.all((data || []).map(async (item) => {
                if (item.debt_type === 'fixed') {
                    const itemDate = new Date(item.due_date + 'T12:00:00');
                    if (itemDate.getMonth() !== currM || itemDate.getFullYear() !== currY) {
                        const newD = new Date(currY, currM, itemDate.getDate()).toISOString().split('T')[0];
                        await supabase.from('debts').update({ paid: 0, due_date: newD }).eq('id', item.id);
                        return { ...item, paid: 0, due_date: newD };
                    }
                }
                return item;
            }));
            const sorted = (synced || []).sort((a, b) => {
                const isPaidA = a.paid >= a.value; const isPaidB = b.paid >= b.value;
                if (isPaidA !== isPaidB) return isPaidA ? 1 : -1;
                return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            });
            setDebts(sorted);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const loadAccounts = async () => {
        if (!user?.id) return;
        try {
            const stored = await AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(user.id));
            if (stored) setAccounts(['Efectivo', ...JSON.parse(stored)]);
            else setAccounts(['Efectivo']);
        } catch (e) { }
    };

    const resetForm = () => { setName(''); setAmount(''); setDueDate(new Date()); setSelectedDay(new Date().getDate().toString()); setIsEditing(false); setEditId(null); };
    const resetLoanForm = () => { setLoanName(''); setLoanEntity('Bancolombia'); setLoanType('Libre inversión'); setLoanAmount(''); setLoanRate('1.5'); setLoanRateType('EM'); setLoanTerm('12'); setLoanDisbursementDate(new Date()); setLoanFirstPaymentDate(new Date()); setLoanAmortization('Cuota fija (Sistema francés)'); setLoanReceiveAccount('Efectivo'); setLoanStep(1); };

    const handleSave = async () => {
        const typedVal = parseInputToNumber(amount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!name.trim() || isNaN(val) || val <= 0) { Alert.alert('Error', 'Completa todos los campos'); return; }
        let dateStr = '';
        if (viewMode === 'fixed') {
            const day = parseInt(selectedDay, 10);
            if (isNaN(day) || day < 1 || day > 31) { Alert.alert('Error', 'Ingresa un día válido (1-31)'); return; }
            const today = new Date();
            dateStr = new Date(today.getFullYear(), today.getMonth(), day).toISOString().split('T')[0];
            if (day < today.getDate() && !isEditing) { setPendingItem({ val, dateStr }); setConfirmMonthModal(true); return; }
        } else { dateStr = dueDate.toISOString().split('T')[0]; }
        await executeSave(val, dateStr, 0);
    };

    const executeSave = async (val: number, dateStr: string, initialPaid: number) => {
        try {
            if (isEditing && editId) {
                await supabase.from('debts').update({ client: name.trim(), value: val, due_date: dateStr }).eq('id', editId);
            } else {
                await supabase.from('debts').insert([{ user_id: user?.id, client: name.trim(), value: val, paid: initialPaid, due_date: dateStr, debt_type: viewMode, created_date: getLocalISOString() }]);
            }
            setModalVisible(false); setConfirmMonthModal(false); setPendingItem(null); resetForm(); loadData();
        } catch (e) { console.error(e); }
    };

    const handleEditStart = (item: DebtItem) => {
        setName(item.client);
        setAmount(formatInputDisplay(String(convertCurrency(item.value, currency, rates)), currency));
        const d = new Date(item.due_date + 'T12:00:00');
        setDueDate(d); setSelectedDay(d.getDate().toString());
        setEditId(item.id); setIsEditing(true); setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        const msg = '¿Estás seguro de eliminar este registro?';
        if (Platform.OS === 'web') { if (window.confirm(msg)) { await supabase.from('debts').delete().eq('id', id); loadData(); } return; }
        Alert.alert('Eliminar', msg, [{ text: 'Cancelar' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { await supabase.from('debts').delete().eq('id', id); loadData(); } }]);
    };

    const handleSkipFixed = async (item: DebtItem) => {
        const msg = `¿Omitir pago de "${item.client}" este mes?`;
        if (Platform.OS === 'web') { if (window.confirm(msg)) { await supabase.from('debts').update({ paid: item.value }).eq('id', item.id); loadData(); } return; }
        Alert.alert('Omitir Pago', msg, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Omitir', onPress: async () => { await supabase.from('debts').update({ paid: item.value }).eq('id', item.id); loadData(); } }]);
    };

    const handlePayment = async () => {
        if (!selectedDebt) return;
        const isFixed = selectedDebt.debt_type === 'fixed';
        const typedPay = parseInputToNumber(payAmount, currency);
        const pVal = isFixed ? selectedDebt.value : convertToBase(typedPay, currency, rates);
        if (isNaN(pVal) || pVal <= 0) return;
        const actualPay = isFixed ? pVal : Math.min(pVal, selectedDebt.value - selectedDebt.paid);
        try {
            const { data: txs } = await supabase.from('transactions').select('amount, type').eq('user_id', user?.id).eq('account', selectedAccount);
            if (txs) {
                const balance = txs.reduce((acc, curr) => curr.type === 'income' ? acc + curr.amount : acc - curr.amount, 0);
                if (balance < actualPay) { Alert.alert('Saldo Insuficiente', `Disponible: ${fmt(balance)}\nRequerido: ${fmt(actualPay)}`); return; }
            }
            await supabase.from('debts').update({ paid: selectedDebt.paid + actualPay }).eq('id', selectedDebt.id);
            await supabase.from('transactions').insert([{ user_id: user?.id, amount: actualPay, type: 'expense', category: isFixed ? 'Gasto Fijo' : 'Deudas', description: isFixed ? `Pago: ${selectedDebt.client}` : `Abono: ${selectedDebt.client}`, account: selectedAccount, date: getLocalISOString() }]);
            setPayModalVisible(false); setPayAmount(''); setSelectedDebt(null); loadData();
        } catch (e) { console.error(e); }
    };

    // ── Loan: Create ─────────────────────────────────────────
    const handleSaveLoan = async () => {
        const typedVal = parseInputToNumber(loanAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!loanName.trim() || isNaN(val) || val <= 0) { Alert.alert('Error', 'Completa el nombre y el monto.'); return; }
        const rate = parseFloat(loanRate.replace(',', '.'));
        if (isNaN(rate) || rate < 0) { Alert.alert('Error', 'Ingresa una tasa válida.'); return; }
        const term = parseInt(loanTerm, 10);
        if (isNaN(term) || term <= 0) { Alert.alert('Error', 'Ingresa un plazo válido.'); return; }
        const firstPaymentStr = loanFirstPaymentDate.toISOString().split('T')[0];
        const disbursementStr = loanDisbursementDate.toISOString().split('T')[0];
        const meta: LoanMeta = { isFinancialLoan: true, name: loanName.trim(), entity: loanEntity, loanType, disbursed: val, interestRate: rate, rateType: loanRateType, termMonths: term, disbursementDate: disbursementStr, firstPaymentDate: firstPaymentStr, paymentDay: loanFirstPaymentDate.getDate(), amortizationMethod: loanAmortization, receiveAccount: loanReceiveAccount, extraPayments: [], paidInstallments: [] };
        setIsProcessing(true);
        try {
            const { error } = await supabase.from('debts').insert([{ user_id: user?.id, client: JSON.stringify(meta), value: val, paid: 0, due_date: firstPaymentStr, debt_type: 'loan_owe', created_date: disbursementStr }]);
            if (error) throw error;
            await supabase.from('transactions').insert([{ user_id: user?.id, amount: val, type: 'income', category: 'Préstamos', description: `Desembolso: ${loanName.trim()}`, account: loanReceiveAccount, date: disbursementStr + 'T12:00:00.000Z' }]);
            setLoanModalVisible(false); resetLoanForm(); loadData();
            Alert.alert('Préstamo Registrado ✅', `El dinero fue añadido a "${loanReceiveAccount}".`);
        } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo registrar.'); } finally { setIsProcessing(false); }
    };

    // ── Loan: Pay installment ─────────────────────────────────
    const handlePayInstallment = (inst: Installment) => {
        if (!selectedLoanItem) return;
        const meta = parseLoanMeta(selectedLoanItem.client);
        if (!meta) return;
        Alert.alert(`Pagar Cuota #${inst.number}`, `¿Confirmar pago de ${fmt(inst.total)} desde "${selectedPayAccount}"?\n\nFecha: ${inst.dueDate}`,
            [{ text: 'Cancelar', style: 'cancel' }, {
                text: 'Confirmar', onPress: async () => {
                    setIsProcessing(true);
                    try {
                        const newPaid = [...meta.paidInstallments, inst.number];
                        const r = getMonthlyRate(meta.interestRate, meta.rateType);
                        const schedule = buildSchedule(meta.disbursed, r, meta.termMonths, meta.amortizationMethod, meta.firstPaymentDate, meta.extraPayments, newPaid);
                        const nextPending = schedule.find(s => !newPaid.includes(s.number));
                        const newDueDate = nextPending ? nextPending.dueDate : inst.dueDate;
                        const updatedMeta = { ...meta, paidInstallments: newPaid };
                        await supabase.from('debts').update({ client: JSON.stringify(updatedMeta), paid: selectedLoanItem.paid + inst.total, due_date: newDueDate }).eq('id', selectedLoanItem.id);
                        await supabase.from('transactions').insert([{ user_id: user?.id, amount: inst.total, type: 'expense', category: 'Préstamos', description: `Cuota #${inst.number}: ${meta.name}`, account: selectedPayAccount, date: getLocalISOString() }]);
                        setLoanDetailsModalVisible(false); loadData();
                        Alert.alert('✅ Cuota Pagada', `Cuota #${inst.number} registrada.`);
                    } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo registrar.'); } finally { setIsProcessing(false); }
                }
            }]
        );
    };

    // ── Loan: Extra payment ───────────────────────────────────
    const handleExtraPayment = (customAmount?: number) => {
        if (!selectedLoanItem) return;
        const meta = parseLoanMeta(selectedLoanItem.client);
        if (!meta) return;
        const sv = customAmount ?? parseInputToNumber(extraPaymentAmount, currency);
        const val = customAmount ?? convertToBase(sv, currency, rates);
        if (isNaN(val) || val <= 0) { Alert.alert('Error', 'Ingresa un monto válido.'); return; }
        const r = getMonthlyRate(meta.interestRate, meta.rateType);
        const baseSchedule = buildSchedule(meta.disbursed, r, meta.termMonths, meta.amortizationMethod, meta.firstPaymentDate, meta.extraPayments, meta.paidInstallments);
        const simExtra: ExtraPaymentRecord = { date: getLocalISOString().split('T')[0], amount: val, interestSaved: 0, monthsReduced: 0 };
        const simSchedule = buildSchedule(meta.disbursed, r, meta.termMonths, meta.amortizationMethod, meta.firstPaymentDate, [...meta.extraPayments, simExtra], meta.paidInstallments);
        const interestSaved = Math.max(0, baseSchedule.reduce((s, i) => s + i.interest, 0) - simSchedule.reduce((s, i) => s + i.interest, 0));
        const monthsReduced = Math.max(0, baseSchedule.length - simSchedule.length);
        const finalExtra: ExtraPaymentRecord = { ...simExtra, interestSaved, monthsReduced };
        Alert.alert('Abonar a Capital', `Abono: ${fmt(val)}\n\n💰 Ahorras: ${fmt(interestSaved)} en intereses\n📅 Reduces: ${monthsReduced} mes(es)\n\nSe descontará de "${selectedPayAccount}".`,
            [{ text: 'Cancelar', style: 'cancel' }, {
                text: 'Confirmar', onPress: async () => {
                    setIsProcessing(true);
                    try {
                        const updatedMeta = { ...meta, extraPayments: [...meta.extraPayments, finalExtra] };
                        await supabase.from('debts').update({ client: JSON.stringify(updatedMeta), paid: selectedLoanItem.paid + val }).eq('id', selectedLoanItem.id);
                        await supabase.from('transactions').insert([{ user_id: user?.id, amount: val, type: 'expense', category: 'Préstamos', description: `Abono a capital: ${meta.name}`, account: selectedPayAccount, date: getLocalISOString() }]);
                        setExtraPaymentAmount(''); setLoanDetailsModalVisible(false); loadData();
                        Alert.alert('🎉 Abono Registrado', `Ahorraste ${fmt(interestSaved)} y redujiste ${monthsReduced} cuota(s).`);
                    } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo registrar.'); } finally { setIsProcessing(false); }
                }
            }]
        );
    };

    // ── List & calculations ───────────────────────────────────
    const currentList = debts.filter(d => d.debt_type === viewMode);
    const totalValue = currentList.reduce((s, d) => s + d.value, 0);
    const totalPaid = currentList.reduce((s, d) => s + (d.paid || 0), 0);
    const progressPct = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0;

    // ── Loan detail computed ───────────────────────────────────
    const selectedLoanMeta = selectedLoanItem ? parseLoanMeta(selectedLoanItem.client) : null;
    const loanMonthlyRate = selectedLoanMeta ? getMonthlyRate(selectedLoanMeta.interestRate, selectedLoanMeta.rateType) : 0;

    const loanSchedule = useMemo(() => {
        if (!selectedLoanMeta) return [];
        return buildSchedule(selectedLoanMeta.disbursed, loanMonthlyRate, selectedLoanMeta.termMonths, selectedLoanMeta.amortizationMethod, selectedLoanMeta.firstPaymentDate, selectedLoanMeta.extraPayments, selectedLoanMeta.paidInstallments);
    }, [selectedLoanItem]);

    const loanInterestPaid = loanSchedule.filter(i => i.status === 'paid').reduce((s, i) => s + i.interest, 0);
    const loanPrincipalPaid = loanSchedule.filter(i => i.status === 'paid').reduce((s, i) => s + i.principal, 0);
    const loanTotalInterest = loanSchedule.reduce((s, i) => s + i.interest, 0);
    const loanInterestRemaining = loanTotalInterest - loanInterestPaid;
    const loanCapitalRemaining = selectedLoanMeta ? Math.max(0, selectedLoanMeta.disbursed - loanPrincipalPaid) : 0;
    const nextPendingInstallment = loanSchedule.find(i => i.status !== 'paid');
    const loanRemainingMonths = loanSchedule.filter(i => i.status !== 'paid').length;

    const simulatorResult = useMemo(() => {
        if (!selectedLoanMeta || !simulatorAmount) return null;
        const sv = parseInputToNumber(simulatorAmount, currency);
        const simVal = convertToBase(sv, currency, rates);
        if (isNaN(simVal) || simVal <= 0) return null;
        const simExtra: ExtraPaymentRecord = { date: getLocalISOString().split('T')[0], amount: simVal, interestSaved: 0, monthsReduced: 0 };
        const base = buildSchedule(selectedLoanMeta.disbursed, loanMonthlyRate, selectedLoanMeta.termMonths, selectedLoanMeta.amortizationMethod, selectedLoanMeta.firstPaymentDate, selectedLoanMeta.extraPayments, selectedLoanMeta.paidInstallments);
        const sim = buildSchedule(selectedLoanMeta.disbursed, loanMonthlyRate, selectedLoanMeta.termMonths, selectedLoanMeta.amortizationMethod, selectedLoanMeta.firstPaymentDate, [...selectedLoanMeta.extraPayments, simExtra], selectedLoanMeta.paidInstallments);
        return { interestSaved: Math.max(0, base.reduce((s, i) => s + i.interest, 0) - sim.reduce((s, i) => s + i.interest, 0)), monthsReduced: Math.max(0, base.length - sim.length), newFinalDate: sim.length > 0 ? sim[sim.length - 1].dueDate : '' };
    }, [simulatorAmount, selectedLoanItem]);

    const smartSuggestions = useMemo(() => {
        if (!selectedLoanMeta) return [];
        return [50000, 100000, 200000, 500000].map(baseAmt => {
            const a = convertCurrency(baseAmt, currency, rates);
            const simExtra: ExtraPaymentRecord = { date: getLocalISOString().split('T')[0], amount: a, interestSaved: 0, monthsReduced: 0 };
            const base = buildSchedule(selectedLoanMeta.disbursed, loanMonthlyRate, selectedLoanMeta.termMonths, selectedLoanMeta.amortizationMethod, selectedLoanMeta.firstPaymentDate, selectedLoanMeta.extraPayments, selectedLoanMeta.paidInstallments);
            const sim = buildSchedule(selectedLoanMeta.disbursed, loanMonthlyRate, selectedLoanMeta.termMonths, selectedLoanMeta.amortizationMethod, selectedLoanMeta.firstPaymentDate, [...selectedLoanMeta.extraPayments, simExtra], selectedLoanMeta.paidInstallments);
            return { amount: a, interestSaved: Math.max(0, base.reduce((s, i) => s + i.interest, 0) - sim.reduce((s, i) => s + i.interest, 0)), monthsReduced: Math.max(0, base.length - sim.length) };
        }).filter(s => s.interestSaved > 100 || s.monthsReduced > 0);
    }, [selectedLoanItem]);

    const loanHealthScore = (() => {
        if (!selectedLoanMeta || !nextPendingInstallment) return { label: 'Excelente', color: '#10B981', emoji: '🟢' };
        const ratio = nextPendingInstallment.total / Math.max(selectedLoanMeta.disbursed, 1);
        if (ratio < 0.05) return { label: 'Excelente', color: '#10B981', emoji: '🟢' };
        if (ratio < 0.12) return { label: 'Moderada', color: '#F59E0B', emoji: '🟡' };
        return { label: 'Riesgo alto', color: '#EF4444', emoji: '🔴' };
    })();

    const getStatusBadge = (item: DebtItem) => {
        if (item.debt_type !== 'loan_owe') {
            const isPaid = item.paid >= item.value;
            return { label: isPaid ? 'PAGO' : 'PEND.', bg: isPaid ? (isDark ? 'rgba(16,185,129,0.18)' : '#E8F5E9') : (isDark ? 'rgba(245,158,11,0.18)' : '#FFF3E0'), color: isPaid ? (isDark ? '#34D399' : colors.accent) : (isDark ? '#FBBF24' : '#E67E22') };
        }
        if (item.paid >= item.value) return { label: 'SALDADO', bg: isDark ? 'rgba(16,185,129,0.18)' : '#E8F5E9', color: isDark ? '#34D399' : colors.accent };
        const nextDue = new Date(item.due_date + 'T12:00:00');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((nextDue.getTime() - today.getTime()) / 86400000);
        if (diff < 0) return { label: 'VENCIDA', bg: isDark ? 'rgba(239,68,68,0.18)' : '#FFE8E8', color: '#EF4444' };
        if (diff <= 7) return { label: 'POR VENCER', bg: isDark ? 'rgba(245,158,11,0.18)' : '#FFF3E0', color: '#F59E0B' };
        return { label: 'AL DÍA', bg: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF', color: '#6366F1' };
    };

    const loanEntities = ['Nequi', 'Bancolombia', 'Davivienda', 'Banco de Bogotá', 'Nu (Nubank)', 'Itaú', 'Scotiabank', 'Efectivo', 'Otro'];
    const loanTypes = ['Libre inversión', 'Vehículo', 'Vivienda', 'Educación', 'Personal', 'Otro'];
    const rateTypes = ['EA', 'EM', 'MV', 'NMV', 'Otra'];
    const amortizationMethods = ['Cuota fija (Sistema francés)', 'Capital fijo', 'Solo intereses', 'Otro'];

    const heroTitle = viewMode === 'debt' ? 'Total Pendiente' : viewMode === 'fixed' ? 'Total del Mes' : 'Capital Pendiente';
    const heroMsg = viewMode === 'loan_owe' ? `Prestado: ${fmt(totalValue)}  ·  Pagado: ${fmt(totalPaid)}` : `Has cubierto ${fmt(totalPaid)} hasta hoy.${totalValue > totalPaid ? ` Faltan ${fmt(totalValue - totalPaid)}` : ''}`;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {viewMode === 'debt' ? 'Deudas' : viewMode === 'fixed' ? 'Gastos Fijos' : 'Préstamos'}
                </Text>
                <TouchableOpacity onPress={() => { if (viewMode === 'loan_owe') { resetLoanForm(); setLoanModalVisible(true); } else { resetForm(); setModalVisible(true); } }} style={[styles.circleBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="add" size={26} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Selector de Modo - 3 Tabs */}
            <View style={styles.selectorCont}>
                <View style={[styles.selectorBg, { backgroundColor: colors.card }]}>
                    <TouchableOpacity onPress={() => setViewMode('debt')} style={[styles.selBtn, viewMode === 'debt' && { backgroundColor: colors.accent }]}>
                        <Text style={[styles.selTxt, { color: viewMode === 'debt' ? '#FFF' : colors.sub }]}>Deudas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setViewMode('fixed')} style={[styles.selBtn, viewMode === 'fixed' && { backgroundColor: colors.accent }]}>
                        <Text style={[styles.selTxt, { color: viewMode === 'fixed' ? '#FFF' : colors.sub }]}>Fijos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setViewMode('loan_owe')} style={[styles.selBtn, viewMode === 'loan_owe' && { backgroundColor: colors.accent }]}>
                        <Text style={[styles.selTxt, { color: viewMode === 'loan_owe' ? '#FFF' : colors.sub }]}>Préstamos</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Hero Card */}
                <View style={[styles.heroCard, { backgroundColor: colors.accent }]}>
                    <View style={styles.heroRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.heroLab}>{heroTitle}</Text>
                            <Text style={styles.heroVal}>{fmt(totalValue - totalPaid)}</Text>
                            {viewMode === 'loan_owe' && (
                                <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                                    <View><Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>TOTAL</Text><Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>{fmt(totalValue)}</Text></View>
                                    <View><Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>PAGADO</Text><Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>{fmt(totalPaid)}</Text></View>
                                    <View><Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>PRÉSTAMOS</Text><Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>{currentList.length}</Text></View>
                                </View>
                            )}
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
                    <View style={styles.heroFooter}><Text style={styles.heroMsg}>{heroMsg}</Text></View>
                </View>

                {/* Loan Financial Health Panel */}
                {viewMode === 'loan_owe' && currentList.length > 0 && (
                    <View style={[styles.heroCard, { backgroundColor: colors.card, marginTop: -8, marginBottom: 16 }]}>
                        <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '800', marginBottom: 10, letterSpacing: 1 }}>INDICADORES DE CARTERA</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            {[{ label: 'Total Prestado', value: fmt(totalValue) }, { label: 'Ya Pagado', value: fmt(totalPaid) }, { label: 'Pendiente', value: fmt(totalValue - totalPaid) }].map(m => (
                                <View key={m.label} style={{ alignItems: 'center' }}>
                                    <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{m.label}</Text>
                                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 }}>{m.value}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* List */}
                {loading ? (
                    <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
                ) : currentList.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name={viewMode === 'loan_owe' ? 'business-outline' : 'leaf-outline'} size={64} color={colors.sub + '40'} />
                        <Text style={[styles.emptyTxt, { color: colors.sub }]}>
                            {viewMode === 'loan_owe' ? 'No tienes préstamos activos.\nToca + para registrar uno.' : 'Todo está en orden por aquí.'}
                        </Text>
                    </View>
                ) : (
                    currentList.map(item => {
                        const meta = parseLoanMeta(item.client);
                        const isPaid = item.paid >= item.value;
                        const pct = item.value > 0 ? Math.min(100, (item.paid / item.value) * 100) : 0;
                        const status = getStatusBadge(item);

                        if (viewMode === 'loan_owe' && meta) {
                            const r = getMonthlyRate(meta.interestRate, meta.rateType);
                            const sched = buildSchedule(meta.disbursed, r, meta.termMonths, meta.amortizationMethod, meta.firstPaymentDate, meta.extraPayments, meta.paidInstallments);
                            const nextInst = sched.find(s => s.status !== 'paid');
                            const remaining = sched.filter(s => s.status !== 'paid').length;
                            return (
                                <TouchableOpacity key={item.id} style={[styles.itemCard, { backgroundColor: colors.card }]}
                                    onPress={() => { setSelectedLoanItem(item); setShowSimulatorResults(false); setExtraPaymentAmount(''); setSimulatorAmount(''); setSelectedPayAccount(accounts[0] || 'Efectivo'); setShowPaySchedule(false); setShowEarlyPayoff(false); setLoanDetailsModalVisible(true); }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                                            <MaterialIcons name="account-balance" size={24} color={colors.accent} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.itemName, { color: colors.text }]}>{meta.name}</Text>
                                            <Text style={[styles.itemSub, { color: colors.sub }]}>{meta.entity} · {meta.loanType}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.totalVal, { color: colors.text }]}>{fmt(item.value)}</Text>
                                            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}><Text style={[styles.statusTxt, { color: status.color }]}>{status.label}</Text></View>
                                        </View>
                                    </View>
                                    <View style={{ marginTop: 12, gap: 4 }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                            <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>PROGRESO · {Math.round(pct)}%</Text>
                                            <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{remaining > 0 ? `${remaining} cuota(s) restantes` : '✅ Saldado'}</Text>
                                        </View>
                                        <View style={[styles.pBarBg, { backgroundColor: colors.bg, height: 6 }]}>
                                            <View style={[styles.pBarFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
                                        </View>
                                    </View>
                                    {nextInst && (
                                        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent + '12', borderRadius: 10, padding: 8 }}>
                                            <MaterialIcons name="event" size={14} color={colors.accent} />
                                            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700', flex: 1 }}>Próxima: {fmt(nextInst.total)} · {nextInst.dueDate}</Text>
                                            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800' }}>ℹ️</Text>
                                        </View>
                                    )}
                                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                                        <View style={{ backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                                            <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{meta.interestRate}% {meta.rateType} · {meta.amortizationMethod.split(' ')[0]}</Text>
                                        </View>
                                        <TouchableOpacity style={[styles.miniBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)' }]} onPress={() => handleDelete(item.id)}>
                                            <Ionicons name="trash" size={16} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            );
                        }

                        // Regular debt / fixed
                        const date = new Date(item.due_date);
                        const dayStr = date.getUTCDate().toString().padStart(2, '0');
                        const monthStr = date.toLocaleString('es-CO', { month: 'short', timeZone: 'UTC' }).toUpperCase();
                        return (
                            <TouchableOpacity key={item.id} style={[styles.itemCard, { backgroundColor: colors.card }]}
                                onPress={() => { setSelectedDebt(item); setPayModalVisible(true); }}
                                onLongPress={() => handleEditStart(item)}>
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
                                        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}><Text style={[styles.statusTxt, { color: status.color }]}>{status.label}</Text></View>
                                    </View>
                                </View>
                                <View style={styles.progressArea}>
                                    <View style={[styles.pBarBg, { backgroundColor: colors.bg }]}>
                                        <View style={[styles.pBarFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
                                    </View>
                                </View>
                                <View style={styles.cardActions}>
                                    {!isPaid && viewMode === 'fixed' && (
                                        <TouchableOpacity style={[styles.skipBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)' }]} onPress={() => handleSkipFixed(item)}>
                                            <Ionicons name="play-forward" size={14} color={colors.sub} />
                                            <Text style={styles.skipTxt}>OMITIR</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={[styles.miniBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)' }]} onPress={() => handleEditStart(item)}>
                                        <Ionicons name="pencil" size={16} color={colors.sub} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.miniBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)' }]} onPress={() => handleDelete(item.id)}>
                                        <Ionicons name="trash" size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
                <View style={{ height: 120 }} />
            </ScrollView>

            {/* ── Modal Crear/Editar Deuda/Fijo ── */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setModalVisible(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                            <View style={styles.mHeader}>
                                <Text style={[styles.mTitle, { color: colors.text }]}>{isEditing ? 'Editar' : 'Nueva'} {viewMode === 'debt' ? 'Deuda' : 'Gasto'}</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={colors.sub} /></TouchableOpacity>
                            </View>
                            <View style={styles.mField}>
                                <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE</Text>
                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={name} onChangeText={setName} placeholder="Ej. Arriendo, Crédito" placeholderTextColor={colors.sub + '60'} />
                            </View>
                            <View style={styles.mField}>
                                <Text style={[styles.mLabel, { color: colors.sub }]}>MONTO</Text>
                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={amount} onChangeText={t => setAmount(formatInputDisplay(t, currency))} placeholder="$ 0" placeholderTextColor={colors.sub + '60'} keyboardType="decimal-pad" />
                            </View>
                            {viewMode === 'debt' ? (
                                Platform.OS === 'web' ? (
                                    <View style={styles.mField}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA LÍMITE</Text>
                                        <View style={{ borderBottomWidth: 2, borderBottomColor: colors.border }}>
                                            {React.createElement('input', { type: 'date', value: dueDate.toISOString().split('T')[0], onChange: (e: any) => { const d = new Date(e.target.value + 'T12:00:00'); if (!isNaN(d.getTime())) setDueDate(d); }, style: { background: 'transparent', border: 'none', color: isDark ? '#F5F0E8' : '#2D2D2D', fontSize: '18px', fontWeight: '700', padding: '12px 0', width: '100%', outline: 'none', fontFamily: 'inherit' } })}
                                        </View>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.mField} onPress={() => setShowDatePicker(true)}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA LÍMITE</Text>
                                        <View style={[styles.mInput, { borderBottomColor: colors.border, justifyContent: 'center' }]}><Text style={{ color: colors.text, fontSize: 16 }}>{dueDate.toLocaleDateString('es-CO')}</Text></View>
                                    </TouchableOpacity>
                                )
                            ) : (
                                <View style={styles.mField}>
                                    <Text style={[styles.mLabel, { color: colors.sub }]}>DÍA DE PAGO (1 - 31)</Text>
                                    <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={selectedDay} onChangeText={setSelectedDay} placeholder="Ej. 15" placeholderTextColor={colors.sub + '60'} keyboardType="number-pad" maxLength={2} />
                                </View>
                            )}
                            {Platform.OS === 'ios' && showDatePicker && (
                                <View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 10, marginVertical: 10 }}>
                                    <DateTimePicker value={dueDate} mode="date" display="spinner" themeVariant={isDark ? 'dark' : 'light'} onChange={(e, d) => { if (d) setDueDate(d); }} />
                                    <TouchableOpacity style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setShowDatePicker(false)}><Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text></TouchableOpacity>
                                </View>
                            )}
                            {Platform.OS === 'android' && showDatePicker && (<DateTimePicker value={dueDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if (d) setDueDate(d); }} />)}
                            <TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: colors.accent }]} onPress={handleSave}><Text style={styles.mBtnText}>{isEditing ? 'Actualizar' : 'Registrar'}</Text></TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ── Modal Confirmar Mes ── */}
            <Modal visible={confirmMonthModal} animationType="fade" transparent>
                <View style={[styles.overlayCenter, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card, paddingVertical: 32 }]}>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}><Ionicons name="calendar" size={32} color={colors.accent} /></View>
                        <Text style={[styles.miniTitle, { color: colors.text, marginBottom: 8 }]}>¿Cuándo inicia este gasto?</Text>
                        <Text style={[styles.miniSub, { color: colors.sub, marginBottom: 32, paddingHorizontal: 10 }]}>El día elegido ya pasó este mes. ¿Deseas que empiece ahora o el próximo mes?</Text>
                        <View style={styles.miniActions}>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.bg, height: 56 }]} onPress={() => executeSave(pendingItem?.val || 0, pendingItem?.dateStr || '', 0)}><Text style={{ color: colors.text, fontWeight: '800' }}>Este Mes</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.accent, height: 56 }]} onPress={() => executeSave(pendingItem?.val || 0, pendingItem?.dateStr || '', pendingItem?.val || 0)}><Text style={{ color: '#FFF', fontWeight: '800' }}>Próximo Mes</Text></TouchableOpacity>
                        </View>
                        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setConfirmMonthModal(false)}><Text style={{ color: colors.sub, fontWeight: '700', fontSize: 13 }}>Cancelar registro</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Modal Pago Deuda/Fijo ── */}
            <Modal visible={payModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.miniTitle, { color: colors.text }]}>{selectedDebt?.client}</Text>
                        <Text style={[styles.miniSub, { color: colors.sub }]}>Pendiente: {fmt(selectedDebt ? selectedDebt.value - selectedDebt.paid : 0)}</Text>
                        {selectedDebt?.debt_type === 'debt' && (<TextInput style={[styles.miniInput, { color: colors.text, borderBottomColor: colors.border }]} value={payAmount} onChangeText={t => setPayAmount(formatInputDisplay(t, currency))} placeholder="Monto a pagar" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus />)}
                        <View style={styles.accountRow}>
                            {accounts.map(acc => (<TouchableOpacity key={acc} onPress={() => setSelectedAccount(acc)} style={[styles.accBtn, { borderColor: colors.border }, selectedAccount === acc && { backgroundColor: colors.accent, borderColor: colors.accent }]}><Text style={[styles.accTxt, { color: selectedAccount === acc ? '#FFF' : colors.sub }]}>{acc}</Text></TouchableOpacity>))}
                        </View>
                        <View style={styles.miniActions}>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}><Text style={{ color: colors.text, fontWeight: '800' }}>Cerrar</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtnB, { backgroundColor: colors.accent }]} onPress={handlePayment}><Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── Modal Crear Préstamo (3 pasos) ── */}
            <Modal visible={loanModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setLoanModalVisible(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxHeight: '95%' }}>
                        <View style={[styles.modalBox, { backgroundColor: colors.card, maxHeight: '95%' }]}>
                            <View style={styles.mHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.mTitle, { color: colors.text, fontSize: 18 }]}>
                                        {loanStep === 1 ? '📋 Información General' : loanStep === 2 ? '💰 Información Financiera' : '⚙️ Amortización y Cuenta'}
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                                        {[1, 2, 3].map(s => <View key={s} style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: loanStep >= s ? colors.accent : colors.border }} />)}
                                    </View>
                                </View>
                                <TouchableOpacity onPress={() => setLoanModalVisible(false)} style={{ marginLeft: 12 }}><Ionicons name="close" size={24} color={colors.sub} /></TouchableOpacity>
                            </View>
                            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                {loanStep === 1 && (
                                    <>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE DEL PRÉSTAMO</Text>
                                            <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={loanName} onChangeText={setLoanName} placeholder="Ej. Crédito Libre Inversión" placeholderTextColor={colors.sub + '60'} />
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>ENTIDAD FINANCIERA</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                                                {loanEntities.map(e => (<TouchableOpacity key={e} onPress={() => setLoanEntity(e)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: loanEntity === e ? colors.accent : colors.bg, borderWidth: 1, borderColor: loanEntity === e ? colors.accent : colors.border }}><Text style={{ color: loanEntity === e ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{e}</Text></TouchableOpacity>))}
                                            </ScrollView>
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>TIPO DE PRÉSTAMO</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                {loanTypes.map(t => (<TouchableOpacity key={t} onPress={() => setLoanType(t)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: loanType === t ? colors.accent : colors.bg, borderWidth: 1, borderColor: loanType === t ? colors.accent : colors.border }}><Text style={{ color: loanType === t ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{t}</Text></TouchableOpacity>))}
                                            </View>
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>MONTO DESEMBOLSADO</Text>
                                            <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={loanAmount} onChangeText={t => setLoanAmount(formatInputDisplay(t, currency))} placeholder="$ 0" placeholderTextColor={colors.sub + '60'} keyboardType="decimal-pad" />
                                        </View>
                                    </>
                                )}
                                {loanStep === 2 && (
                                    <>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>TASA DE INTERÉS</Text>
                                            <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={loanRate} onChangeText={setLoanRate} placeholder="Ej. 1.5" placeholderTextColor={colors.sub + '60'} keyboardType="decimal-pad" />
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>TIPO DE TASA</Text>
                                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                                {rateTypes.map(rt => (<TouchableOpacity key={rt} onPress={() => setLoanRateType(rt)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: loanRateType === rt ? colors.accent : colors.bg, borderWidth: 1, borderColor: loanRateType === rt ? colors.accent : colors.border }}><Text style={{ color: loanRateType === rt ? '#FFF' : colors.sub, fontWeight: '800', fontSize: 13 }}>{rt}</Text></TouchableOpacity>))}
                                            </View>
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>PLAZO (MESES)</Text>
                                            <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} value={loanTerm} onChangeText={setLoanTerm} placeholder="Ej. 24" placeholderTextColor={colors.sub + '60'} keyboardType="number-pad" />
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA DE DESEMBOLSO</Text>
                                            {Platform.OS === 'web' ? (
                                                <View style={{ borderBottomWidth: 2, borderBottomColor: colors.border }}>{React.createElement('input', { type: 'date', value: loanDisbursementDate.toISOString().split('T')[0], onChange: (e: any) => { const d = new Date(e.target.value + 'T12:00:00'); if (!isNaN(d.getTime())) setLoanDisbursementDate(d); }, style: { background: 'transparent', border: 'none', color: isDark ? '#F5F0E8' : '#2D2D2D', fontSize: '18px', fontWeight: '700', padding: '12px 0', width: '100%', outline: 'none', fontFamily: 'inherit' } })}</View>
                                            ) : (
                                                <TouchableOpacity onPress={() => setShowDisbursementPicker(true)}><View style={[styles.mInput, { borderBottomColor: colors.border, justifyContent: 'center' }]}><Text style={{ color: colors.text, fontSize: 16 }}>{loanDisbursementDate.toLocaleDateString('es-CO')}</Text></View></TouchableOpacity>
                                            )}
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA PRIMER PAGO</Text>
                                            {Platform.OS === 'web' ? (
                                                <View style={{ borderBottomWidth: 2, borderBottomColor: colors.border }}>{React.createElement('input', { type: 'date', value: loanFirstPaymentDate.toISOString().split('T')[0], onChange: (e: any) => { const d = new Date(e.target.value + 'T12:00:00'); if (!isNaN(d.getTime())) setLoanFirstPaymentDate(d); }, style: { background: 'transparent', border: 'none', color: isDark ? '#F5F0E8' : '#2D2D2D', fontSize: '18px', fontWeight: '700', padding: '12px 0', width: '100%', outline: 'none', fontFamily: 'inherit' } })}</View>
                                            ) : (
                                                <TouchableOpacity onPress={() => setShowFirstPaymentPicker(true)}><View style={[styles.mInput, { borderBottomColor: colors.border, justifyContent: 'center' }]}><Text style={{ color: colors.text, fontSize: 16 }}>{loanFirstPaymentDate.toLocaleDateString('es-CO')}</Text></View></TouchableOpacity>
                                            )}
                                        </View>
                                        {showDisbursementPicker && Platform.OS === 'ios' && (<View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 10, marginVertical: 10 }}><DateTimePicker value={loanDisbursementDate} mode="date" display="spinner" themeVariant={isDark ? 'dark' : 'light'} onChange={(e, d) => { if (d) setLoanDisbursementDate(d); }} /><TouchableOpacity style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setShowDisbursementPicker(false)}><Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text></TouchableOpacity></View>)}
                                        {showDisbursementPicker && Platform.OS === 'android' && (<DateTimePicker value={loanDisbursementDate} mode="date" display="default" onChange={(e, d) => { setShowDisbursementPicker(false); if (d) setLoanDisbursementDate(d); }} />)}
                                        {showFirstPaymentPicker && Platform.OS === 'ios' && (<View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 10, marginVertical: 10 }}><DateTimePicker value={loanFirstPaymentDate} mode="date" display="spinner" themeVariant={isDark ? 'dark' : 'light'} onChange={(e, d) => { if (d) setLoanFirstPaymentDate(d); }} /><TouchableOpacity style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 14, alignItems: 'center', marginTop: 10 }} onPress={() => setShowFirstPaymentPicker(false)}><Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text></TouchableOpacity></View>)}
                                        {showFirstPaymentPicker && Platform.OS === 'android' && (<DateTimePicker value={loanFirstPaymentDate} mode="date" display="default" onChange={(e, d) => { setShowFirstPaymentPicker(false); if (d) setLoanFirstPaymentDate(d); }} />)}
                                    </>
                                )}
                                {loanStep === 3 && (
                                    <>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>MÉTODO DE AMORTIZACIÓN</Text>
                                            {amortizationMethods.map(m => (
                                                <TouchableOpacity key={m} onPress={() => setLoanAmortization(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border + '30' }}>
                                                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: loanAmortization === m ? colors.accent : colors.border, backgroundColor: loanAmortization === m ? colors.accent : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                                                        {loanAmortization === m && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
                                                    </View>
                                                    <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{m}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View style={styles.mField}>
                                            <Text style={[styles.mLabel, { color: colors.sub }]}>¿EN QUÉ CUENTA RECIBISTE EL DINERO?</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                                {accounts.map(acc => (<TouchableOpacity key={acc} onPress={() => setLoanReceiveAccount(acc)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: loanReceiveAccount === acc ? colors.accent : colors.bg, borderWidth: 1, borderColor: loanReceiveAccount === acc ? colors.accent : colors.border }}><Text style={{ color: loanReceiveAccount === acc ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{acc}</Text></TouchableOpacity>))}
                                            </View>
                                            <View style={{ backgroundColor: colors.accent + '12', padding: 12, borderRadius: 12, marginTop: 12 }}>
                                                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>
                                                    💡 Se registrará un ingreso en "{loanReceiveAccount}" para que el dinero quede disponible para usar.
                                                </Text>
                                            </View>
                                        </View>
                                    </>
                                )}
                                <View style={{ height: 20 }} />
                            </ScrollView>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                {loanStep > 1 && (<TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: colors.bg, flex: 1 }]} onPress={() => setLoanStep(s => s - 1)}><Text style={[styles.mBtnText, { color: colors.text }]}>← Atrás</Text></TouchableOpacity>)}
                                {loanStep < 3 ? (
                                    <TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: colors.accent, flex: 1 }]} onPress={() => setLoanStep(s => s + 1)}><Text style={styles.mBtnText}>Siguiente →</Text></TouchableOpacity>
                                ) : (
                                    <TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: colors.accent, flex: 1, opacity: isProcessing ? 0.6 : 1 }]} onPress={handleSaveLoan} disabled={isProcessing}><Text style={styles.mBtnText}>{isProcessing ? 'Registrando...' : '✅ Registrar Préstamo'}</Text></TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ── Modal Detalle de Préstamo ── */}
            <Modal visible={loanDetailsModalVisible} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
                    <TouchableWithoutFeedback onPress={() => setLoanDetailsModalVisible(false)}><View style={StyleSheet.absoluteFill} /></TouchableWithoutFeedback>
                    <View style={[styles.modalBox, { backgroundColor: colors.card, maxHeight: '95%', paddingBottom: 16 }]}>
                        {selectedLoanMeta ? (
                            <>
                                <View style={[styles.mHeader, { marginBottom: 8 }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.mTitle, { color: colors.text, fontSize: 20 }]} numberOfLines={1}>{selectedLoanMeta.name}</Text>
                                        <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{selectedLoanMeta.entity} · {selectedLoanMeta.loanType} · {selectedLoanMeta.interestRate}% {selectedLoanMeta.rateType}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => setLoanDetailsModalVisible(false)} style={{ marginLeft: 12 }}><Ionicons name="close-circle" size={28} color={colors.sub} /></TouchableOpacity>
                                </View>

                                {/* Health */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, backgroundColor: colors.bg, borderRadius: 14, padding: 10 }}>
                                    <Text style={{ fontSize: 20 }}>{loanHealthScore.emoji}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: loanHealthScore.color, fontWeight: '800', fontSize: 13 }}>Salud: {loanHealthScore.label}</Text>
                                        {nextPendingInstallment && <Text style={{ color: colors.sub, fontSize: 11 }}>Cuota mensual: {fmt(nextPendingInstallment.total)}</Text>}
                                    </View>
                                    {nextPendingInstallment && <Text style={{ color: colors.sub, fontSize: 11 }}>{loanRemainingMonths} mes(es) restantes</Text>}
                                </View>

                                {/* Progress */}
                                <View style={{ marginBottom: 14 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Text style={{ color: colors.sub, fontSize: 11 }}>{fmt(selectedLoanItem?.paid || 0)} pagado</Text>
                                        <Text style={{ color: colors.sub, fontSize: 11 }}>{fmt(loanCapitalRemaining)} pendiente · {Math.round(selectedLoanItem ? (selectedLoanItem.paid / selectedLoanItem.value) * 100 : 0)}%</Text>
                                    </View>
                                    <View style={[styles.pBarBg, { backgroundColor: colors.bg, height: 10 }]}>
                                        <View style={[styles.pBarFill, { width: `${Math.min(100, selectedLoanItem ? (selectedLoanItem.paid / selectedLoanItem.value) * 100 : 0)}%`, backgroundColor: colors.accent }]} />
                                    </View>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                    {/* Resumen */}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                                        {[
                                            { label: 'PRESTADO', value: fmt(selectedLoanMeta.disbursed), color: colors.text },
                                            { label: 'CAPITAL PEND.', value: fmt(loanCapitalRemaining), color: '#EF4444' },
                                            { label: 'INTERÉS PAGADO', value: fmt(loanInterestPaid), color: '#10B981' },
                                            { label: 'INTERÉS RESTANTE', value: fmt(loanInterestRemaining), color: '#F59E0B' },
                                        ].map(m => (
                                            <View key={m.label} style={{ width: '47%', backgroundColor: colors.bg, borderRadius: 14, padding: 12 }}>
                                                <Text style={{ color: colors.sub, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{m.label}</Text>
                                                <Text style={{ color: m.color, fontSize: 15, fontWeight: '900', marginTop: 4 }}>{m.value}</Text>
                                            </View>
                                        ))}
                                    </View>

                                    {/* Account selector */}
                                    <View style={{ marginBottom: 14 }}>
                                        <Text style={[styles.mLabel, { color: colors.sub, marginBottom: 8 }]}>CUENTA DE PAGO</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                            {accounts.map(acc => (<TouchableOpacity key={acc} onPress={() => setSelectedPayAccount(acc)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: selectedPayAccount === acc ? colors.accent : colors.bg, borderWidth: 1, borderColor: selectedPayAccount === acc ? colors.accent : colors.border }}><Text style={{ color: selectedPayAccount === acc ? '#FFF' : colors.sub, fontWeight: '700', fontSize: 12 }}>{acc}</Text></TouchableOpacity>))}
                                        </ScrollView>
                                    </View>

                                    {/* Abonar a Capital */}
                                    <View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 16, marginBottom: 14 }}>
                                        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 10 }}>💰 Abonar a Capital</Text>
                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.accent, textAlign: 'center', fontSize: 26 }]} value={extraPaymentAmount} onChangeText={t => setExtraPaymentAmount(formatInputDisplay(t, currency))} placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" />
                                        <TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: '#10B981', marginTop: 10, opacity: !extraPaymentAmount ? 0.5 : 1 }]} onPress={() => handleExtraPayment()} disabled={!extraPaymentAmount || isProcessing}>
                                            <Text style={styles.mBtnText}>{isProcessing ? 'Procesando...' : 'Confirmar Abono'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Abono Inteligente */}
                                    {smartSuggestions.length > 0 && (
                                        <View style={{ marginBottom: 14 }}>
                                            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 10 }}>🧠 Abono Inteligente</Text>
                                            {smartSuggestions.map((s, i) => (
                                                <TouchableOpacity key={i} onPress={() => handleExtraPayment(s.amount)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, borderRadius: 14, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#10B981' }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: colors.text, fontWeight: '800' }}>Abona {fmt(s.amount)}</Text>
                                                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '700' }}>Ahorra {fmt(s.interestSaved)} · {s.monthsReduced} mes(es) menos</Text>
                                                    </View>
                                                    <MaterialIcons name="chevron-right" size={20} color={colors.sub} />
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}

                                    {/* Simulador */}
                                    <View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 16, marginBottom: 14 }}>
                                        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 10 }}>🔬 Simular Abono</Text>
                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: '#6366F1', textAlign: 'center', fontSize: 22 }]} value={simulatorAmount} onChangeText={t => { setSimulatorAmount(formatInputDisplay(t, currency)); setShowSimulatorResults(false); }} placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" />
                                        <TouchableOpacity style={[styles.mBtnPrimary, { backgroundColor: '#6366F1', marginTop: 10 }]} onPress={() => setShowSimulatorResults(true)}>
                                            <Text style={styles.mBtnText}>Simular (Sin Aplicar)</Text>
                                        </TouchableOpacity>
                                        {showSimulatorResults && simulatorResult && (
                                            <View style={{ marginTop: 12, backgroundColor: '#6366F110', borderRadius: 14, padding: 14 }}>
                                                <Text style={{ color: '#6366F1', fontWeight: '800', fontSize: 13, marginBottom: 8 }}>Resultado de la Simulación</Text>
                                                <Text style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>💰 Ahorro en intereses: <Text style={{ fontWeight: '900', color: '#10B981' }}>{fmt(simulatorResult.interestSaved)}</Text></Text>
                                                <Text style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>📅 Meses reducidos: <Text style={{ fontWeight: '900', color: '#6366F1' }}>{simulatorResult.monthsReduced}</Text></Text>
                                                <Text style={{ color: colors.text, fontSize: 13 }}>🗓️ Nueva fecha final: <Text style={{ fontWeight: '900' }}>{simulatorResult.newFinalDate}</Text></Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Liquidación Anticipada */}
                                    <View style={{ backgroundColor: '#EF444410', borderRadius: 20, padding: 16, marginBottom: 14 }}>
                                        <TouchableOpacity onPress={() => setShowEarlyPayoff(!showEarlyPayoff)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 15 }}>⚡ ¿Qué pasa si pago todo hoy?</Text>
                                            <Ionicons name={showEarlyPayoff ? 'chevron-up' : 'chevron-down'} size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                        {showEarlyPayoff && (
                                            <View style={{ marginTop: 12, gap: 8 }}>
                                                <Text style={{ color: colors.text, fontSize: 13 }}>Capital restante: <Text style={{ fontWeight: '900', color: '#EF4444' }}>{fmt(loanCapitalRemaining)}</Text></Text>
                                                <Text style={{ color: colors.text, fontSize: 13 }}>Intereses que te ahorras: <Text style={{ fontWeight: '900', color: '#10B981' }}>{fmt(loanInterestRemaining)}</Text></Text>
                                                <View style={{ backgroundColor: '#EF444420', borderRadius: 12, padding: 14, marginTop: 8, alignItems: 'center' }}>
                                                    <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 18 }}>Paga HOY: {fmt(loanCapitalRemaining)}</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 11, marginTop: 4, textAlign: 'center' }}>Y terminas de pagar el préstamo completamente</Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    {/* Historial de Abonos */}
                                    {selectedLoanMeta.extraPayments.length > 0 && (
                                        <View style={{ marginBottom: 14 }}>
                                            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 10 }}>📋 Historial de Abonos</Text>
                                            {selectedLoanMeta.extraPayments.map((ep, i) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 12, padding: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#10B981' }}>
                                                    <View>
                                                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{fmt(ep.amount)}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 11, marginTop: 2 }}>{ep.date}</Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 12 }}>Ahorró {fmt(ep.interestSaved)}</Text>
                                                        <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 12 }}>-{ep.monthsReduced} mes(es)</Text>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    {/* Cronograma de Cuotas */}
                                    <View style={{ marginBottom: 20 }}>
                                        <TouchableOpacity onPress={() => setShowPaySchedule(!showPaySchedule)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15 }}>📅 Cronograma de Cuotas ({loanSchedule.length})</Text>
                                            <Ionicons name={showPaySchedule ? 'chevron-up' : 'chevron-down'} size={20} color={colors.sub} />
                                        </TouchableOpacity>
                                        {showPaySchedule && loanSchedule.map(inst => {
                                            const statusColor = inst.status === 'paid' ? '#10B981' : inst.status === 'overdue' ? '#EF4444' : inst.status === 'upcoming' ? '#F59E0B' : colors.sub;
                                            const isNext = nextPendingInstallment?.number === inst.number;
                                            return (
                                                <View key={inst.number} style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: statusColor }}>
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ color: colors.text, fontWeight: '800' }}>Cuota #{inst.number} · {inst.dueDate}</Text>
                                                            <Text style={{ color: colors.sub, fontSize: 11, marginTop: 2 }}>Cap: {fmt(inst.principal)} · Int: {fmt(inst.interest)}</Text>
                                                            {inst.extraPaid > 0 && <Text style={{ color: '#10B981', fontSize: 11 }}>Extra: {fmt(inst.extraPaid)}</Text>}
                                                        </View>
                                                        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                                                            <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15 }}>{fmt(inst.total)}</Text>
                                                            <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>
                                                                {inst.status === 'paid' ? '✅ PAGADA' : inst.status === 'overdue' ? '⚠️ VENCIDA' : inst.status === 'upcoming' ? '⏰ POR VENCER' : '○ PENDIENTE'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    {isNext && (
                                                        <TouchableOpacity onPress={() => handlePayInstallment(inst)} disabled={isProcessing} style={{ backgroundColor: colors.accent, borderRadius: 10, padding: 10, marginTop: 8, alignItems: 'center', opacity: isProcessing ? 0.6 : 1 }}>
                                                            <Text style={{ color: '#FFF', fontWeight: '800' }}>Registrar Pago</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                </ScrollView>
                            </>
                        ) : (
                            <ActivityIndicator color={colors.accent} />
                        )}
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
    selTxt: { fontSize: 12, fontWeight: '800' },
    scroll: { paddingHorizontal: 24, paddingBottom: 150 },
    heroCard: { borderRadius: 32, padding: 24, marginBottom: 24, elevation: 6, shadowColor: '#3A3A5230', shadowOpacity: 0.2, shadowRadius: 15 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    heroLab: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700', marginBottom: 4 },
    heroVal: { color: '#FFF', fontSize: 28, fontWeight: '900' },
    chartMini: { width: 70, height: 70, justifyContent: 'center', alignItems: 'center' },
    heroFooter: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    heroMsg: { color: '#FFF', fontSize: 13, fontWeight: '600', opacity: 0.9 },
    empty: { alignItems: 'center', marginTop: 60, opacity: 0.6 },
    emptyTxt: { marginTop: 16, fontWeight: '700', fontSize: 15, textAlign: 'center', paddingHorizontal: 30 },
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
    miniBtn: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    skipTxt: { fontSize: 10, fontWeight: '900', color: '#8B8680' },
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
