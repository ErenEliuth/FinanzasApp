import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { syncUp, syncDown, SYNC_KEYS } from '@/utils/sync';
import {
    Alert,
    Animated,
    Dimensions,
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
import Svg, { Circle, Path, G } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatCurrency, convertCurrency, convertToBase, getCurrencyInfo, formatInputDisplay, parseInputToNumber } from '@/utils/currency';

const { width } = Dimensions.get('window');

// ── Loan math (copy of debts.tsx helpers) ────────────────────
const getMonthlyRate = (rate: number, type: string): number => {
    const v = rate / 100;
    if (type === 'EA') return Math.pow(1 + v, 1 / 12) - 1;
    if (type === 'EM' || type === 'MV') return v;
    if (type === 'NMV') return v / 12;
    return v;
};

const buildLoanMonthlyPayment = (disbursed: number, r: number, termMonths: number, method: string, paidList: number[]): number => {
    if (!disbursed || disbursed <= 0 || termMonths <= 0) return 0;
    let balance = disbursed;
    const isFixed = method.toLowerCase().includes('fija') || method.toLowerCase().includes('franc');
    const isCapital = method.toLowerCase().includes('capital fijo') || (!isFixed && method.toLowerCase().includes('fijo'));
    const A = isFixed && r > 0 ? (disbursed * r) / (1 - Math.pow(1 + r, -termMonths)) : isFixed ? disbursed / termMonths : 0;
    const capitalChunk = disbursed / termMonths;
    // Simulate to find next unpaid installment amount
    for (let m = 1; balance > 0.5 && m <= termMonths; m++) {
        const interest = Math.round(balance * r * 100) / 100;
        let principal = 0;
        if (isFixed) principal = Math.max(0, Math.min(A, balance + interest) - interest);
        else if (isCapital) principal = Math.min(capitalChunk, balance);
        else principal = Math.min(capitalChunk, balance);
        principal = Math.round(Math.min(principal, balance) * 100) / 100;
        const total = Math.round((principal + interest) * 100) / 100;
        balance = Math.round((balance - principal) * 100) / 100;
        if (!paidList.includes(m)) return total;
    }
    return 0;
};

const parseLoanMeta = (client: string): any | null => {
    try {
        if (client && client.startsWith('{')) {
            const p = JSON.parse(client);
            if (p && p.isFinancialLoan) return p;
        }
    } catch (e) {}
    return null;
};

// ── Categories ───────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
    { name: 'Comida',          icon: 'restaurant',      color: '#E67E22' },
    { name: 'Transporte',      icon: 'directions-car',  color: '#34495E' },
    { name: 'Hogar',           icon: 'home',            color: '#4CAF50' },
    { name: 'Salud',           icon: 'medical-services', color: '#16A085' },
    { name: 'Educación',       icon: 'school',          color: '#2980B9' },
    { name: 'Entretenimiento', icon: 'sports-esports',  color: '#8E44AD' },
    { name: 'Ropa',            icon: 'checkroom',       color: '#D35400' },
    { name: 'Recibos',         icon: 'receipt',         color: '#7F8C8D' },
    { name: 'Gimnasio',        icon: 'fitness-center',  color: '#27AE60' },
    { name: 'Otros',           icon: 'more-horiz',      color: '#95A5A6' },
    { name: 'Gastos Fijos',    icon: 'repeat',          color: '#5C6BC0' },
    { name: 'Préstamos',       icon: 'account-balance', color: '#6366F1' },
];

const ALL_CATEGORY_ICONS: { icon: string; color: string }[] = [
    { icon: 'restaurant',      color: '#E67E22' }, { icon: 'directions-car', color: '#34495E' },
    { icon: 'home',            color: '#4CAF50' }, { icon: 'medical-services', color: '#16A085' },
    { icon: 'school',          color: '#2980B9' }, { icon: 'sports-esports', color: '#8E44AD' },
    { icon: 'checkroom',       color: '#D35400' }, { icon: 'receipt',        color: '#7F8C8D' },
    { icon: 'fitness-center',  color: '#27AE60' }, { icon: 'more-horiz',     color: '#95A5A6' },
    { icon: 'local-grocery-store', color: '#F39C12' }, { icon: 'pets',       color: '#E91E63' },
    { icon: 'flight',          color: '#00BCD4' }, { icon: 'coffee',         color: '#795548' },
    { icon: 'music-note',      color: '#9C27B0' }, { icon: 'phone-android', color: '#607D8B' },
    { icon: 'local-gas-station', color: '#FF5722' }, { icon: 'child-care',  color: '#F48FB1' },
];

// ── Donut Chart ───────────────────────────────────────────────
function DonutChart({ segments, size = 120 }: { segments: { value: number; color: string }[]; size?: number }) {
    const R = size / 2 - 12;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * R;
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total <= 0) {
        return (
            <Svg width={size} height={size}>
                <Circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={18} />
            </Svg>
        );
    }
    let offset = 0;
    const paths = segments
        .filter(s => s.value > 0)
        .map((seg, i) => {
            const pct = seg.value / total;
            const dash = circumference * pct - 2;
            const gap = circumference - dash;
            const startOffset = circumference - offset * circumference / total;
            offset += seg.value;
            return (
                <Circle
                    key={i}
                    cx={cx} cy={cy} r={R}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={18}
                    strokeDasharray={`${Math.max(0, dash)} ${Math.max(0, gap + 2)}`}
                    strokeDashoffset={startOffset}
                    strokeLinecap="butt"
                    transform={`rotate(-90 ${cx} ${cy})`}
                />
            );
        });

    return (
        <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={18} />
            {paths}
        </Svg>
    );
}

// ── Main Screen ───────────────────────────────────────────────
export default function BudgetsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, isHidden, currency, rates } = useAuth();
    const colors = useThemeColors();
    const isDark = colors.isDark;
    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    // ── State ─────────────────────────────────────────────────
    const [budgets, setBudgets] = useState<any[]>([]);
    const [spending, setSpending] = useState<Record<string, number>>({});
    const [totalBalance, setTotalBalance] = useState(0);
    const [fixedDebts, setFixedDebts] = useState<any[]>([]);
    const [loanItems, setLoanItems] = useState<{ id: string; name: string; monthlyPayment: number }[]>([]);
    const [savingsGoal, setSavingsGoal] = useState(0);
    const [savingsReal, setSavingsReal] = useState(0);
    const [investGoal, setInvestGoal] = useState(0);
    const [investReal, setInvestReal] = useState(0);
    const [period, setPeriod] = useState<'monthly' | 'biweekly'>('monthly');
    const [customCategories, setCustomCategories] = useState<{ name: string; icon: string; color: string }[]>([]);

    // Modals
    const [wizardVisible, setWizardVisible] = useState(false);
    const [wizardTab, setWizardTab] = useState<'fixed' | 'loans' | 'custom'>('fixed');
    const [selectedFixed, setSelectedFixed] = useState<Set<string>>(new Set());
    const [selectedLoans, setSelectedLoans] = useState<Set<string>>(new Set());
    const [customCatName, setCustomCatName] = useState('');
    const [customCatIcon, setCustomCatIcon] = useState(ALL_CATEGORY_ICONS[0]);
    const [customLimitAmount, setCustomLimitAmount] = useState('');

    const [limitModalVisible, setLimitModalVisible] = useState(false);
    const [editingBudget, setEditingBudget] = useState<any>(null);
    const [limitAmount, setLimitAmount] = useState('');

    const [savingsModalVisible, setSavingsModalVisible] = useState(false);
    const [investModalVisible, setInvestModalVisible] = useState(false);
    const [goalInput, setGoalInput] = useState('');

    // ── Load Data ─────────────────────────────────────────────
    useEffect(() => {
        if (isFocused && user?.id) loadData();
    }, [isFocused, period]);

    const loadData = async () => {
        if (!user) return;
        try {
            await syncDown(user.id);
            const periodRaw = await AsyncStorage.getItem(SYNC_KEYS.BUDGET_PERIOD(user.id));
            if (periodRaw) setPeriod(periodRaw as any);
            const customCatsRaw = await AsyncStorage.getItem(SYNC_KEYS.CATEGORIES(user.id));
            if (customCatsRaw) {
                const parsed = JSON.parse(customCatsRaw);
                if (Array.isArray(parsed)) {
                    if (typeof parsed[0] === 'string') {
                        setCustomCategories(parsed.map((n: string) => ({ name: n, icon: 'label', color: '#94A3B8' })));
                    } else {
                        setCustomCategories(parsed);
                    }
                }
            }

            // Savings/Invest goals
            const sgRaw = await AsyncStorage.getItem(`@savings_goal_${user.id}`);
            const igRaw = await AsyncStorage.getItem(`@invest_goal_${user.id}`);
            if (sgRaw) setSavingsGoal(parseFloat(sgRaw));
            if (igRaw) setInvestGoal(parseFloat(igRaw));

            const today = new Date();
            let startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            if (period === 'biweekly') {
                startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() > 15 ? 16 : 1);
            }
            startDate.setHours(0, 0, 0, 0);

            const [budgetRes, txRes, debtsRes] = await Promise.all([
                supabase.from('budgets').select('*').eq('user_id', user.id),
                supabase.from('transactions').select('category, amount, type, account').eq('user_id', user.id).gte('date', startDate.toISOString()),
                supabase.from('debts').select('*').eq('user_id', user.id),
            ]);

            setBudgets(budgetRes.data || []);

            // Balance from transactions
            const allTxs = txRes.data || [];
            let bal = 0;
            allTxs.forEach(tx => {
                const amt = Number(tx.amount || 0);
                bal += tx.type === 'income' ? amt : -amt;
            });
            setTotalBalance(bal);

            // Spending by category
            const totals: Record<string, number> = {};
            allTxs.filter(tx => tx.type === 'expense').forEach(tx => {
                const cat = tx.category || 'Otros';
                totals[cat] = (totals[cat] || 0) + Number(tx.amount || 0);
            });
            setSpending(totals);

            // Real savings / invest
            const savReal = allTxs.filter(tx => tx.type === 'income' && tx.category === 'Ahorro').reduce((s, t) => s + Number(t.amount || 0), 0);
            const invReal = allTxs.filter(tx => tx.type === 'expense' && tx.category === 'Inversión').reduce((s, t) => s + Number(t.amount || 0), 0);
            setSavingsReal(savReal);
            setInvestReal(invReal);

            // Fixed debts for import
            const allDebts = debtsRes.data || [];
            const fixed = allDebts.filter((d: any) => d.debt_type === 'fixed' && d.paid < d.value);
            setFixedDebts(fixed);

            // Loan installments for import
            const loans = allDebts
                .filter((d: any) => d.debt_type === 'loan_owe')
                .map((d: any) => {
                    const meta = parseLoanMeta(d.client);
                    if (!meta) return null;
                    const r = getMonthlyRate(meta.interestRate, meta.rateType);
                    const monthly = buildLoanMonthlyPayment(meta.disbursed, r, meta.termMonths, meta.amortizationMethod, meta.paidInstallments || []);
                    if (monthly <= 0) return null;
                    return { id: d.id, name: meta.name, monthlyPayment: monthly };
                })
                .filter(Boolean) as any[];
            setLoanItems(loans);

        } catch (e) { console.error(e); }
    };

    const togglePeriod = async (p: 'monthly' | 'biweekly') => {
        if (!user?.id) return;
        setPeriod(p);
        await AsyncStorage.setItem(SYNC_KEYS.BUDGET_PERIOD(user.id), p);
        await syncUp(user.id);
    };

    // ── Save / Delete budget ──────────────────────────────────
    const handleSaveBudget = async () => {
        const typedVal = parseInputToNumber(limitAmount, currency);
        let val = convertToBase(typedVal, currency, rates);
        if (period === 'biweekly') val = val * 2;
        if (isNaN(val) || val <= 0) return;
        await supabase.from('budgets').upsert(
            [{ user_id: user?.id, category: editingBudget?.name || editingBudget?.category, monthly_limit: val }],
            { onConflict: 'user_id,category' }
        );
        setLimitAmount(''); setLimitModalVisible(false); loadData();
    };

    const handleDelete = async (budget: any) => {
        const msg = `¿Quitar el límite para "${budget.category}"?`;
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) { await supabase.from('budgets').delete().eq('id', budget.id); loadData(); }
            return;
        }
        Alert.alert('Eliminar', msg, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: async () => { await supabase.from('budgets').delete().eq('id', budget.id); loadData(); } }
        ]);
    };

    const openLimitModal = (catObj: any, existing?: any) => {
        setEditingBudget(catObj);
        if (existing) {
            let base = existing.monthly_limit;
            if (period === 'biweekly') base /= 2;
            setLimitAmount(String(Math.round(convertCurrency(base, currency, rates))));
        } else {
            setLimitAmount('');
        }
        setLimitModalVisible(true);
    };

    // ── Import Wizard ─────────────────────────────────────────
    const handleImportSelected = async () => {
        if (!user?.id) return;
        const upserts: any[] = [];

        // Import fixed debts
        selectedFixed.forEach(id => {
            const debt = fixedDebts.find(d => d.id === id);
            if (!debt) return;
            const existing = budgets.find(b => b.category === 'Gastos Fijos');
            const addAmt = debt.value;
            upserts.push({
                user_id: user.id,
                category: 'Gastos Fijos',
                monthly_limit: (existing?.monthly_limit || 0) + addAmt,
            });
        });

        // Import loan installments
        selectedLoans.forEach(id => {
            const loan = loanItems.find(l => l.id === id);
            if (!loan) return;
            const existing = budgets.find(b => b.category === 'Préstamos');
            const addAmt = loan.monthlyPayment;
            upserts.push({
                user_id: user.id,
                category: 'Préstamos',
                monthly_limit: (existing?.monthly_limit || 0) + addAmt,
            });
        });

        // Custom category
        if (wizardTab === 'custom' && customCatName.trim()) {
            const typedVal = parseInputToNumber(customLimitAmount, currency);
            const val = convertToBase(typedVal, currency, rates);
            if (!isNaN(val) && val > 0) {
                upserts.push({ user_id: user.id, category: customCatName.trim(), monthly_limit: val });
                // Save custom category
                const currentCats = customCategories.filter(c => c.name !== customCatName.trim());
                const updated = [...currentCats, { name: customCatName.trim(), icon: customCatIcon.icon, color: customCatIcon.color }];
                await AsyncStorage.setItem(SYNC_KEYS.CATEGORIES(user.id), JSON.stringify(updated));
                setCustomCategories(updated);
                await syncUp(user.id);
            }
        }

        if (upserts.length > 0) {
            for (const u of upserts) {
                await supabase.from('budgets').upsert([u], { onConflict: 'user_id,category' });
            }
        }

        setWizardVisible(false);
        setSelectedFixed(new Set());
        setSelectedLoans(new Set());
        setCustomCatName('');
        setCustomLimitAmount('');
        loadData();
    };

    // ── Savings / Invest goal ─────────────────────────────────
    const handleSaveSavingsGoal = async () => {
        const typedVal = parseInputToNumber(goalInput, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!isNaN(val) && val >= 0) {
            setSavingsGoal(val);
            await AsyncStorage.setItem(`@savings_goal_${user?.id}`, String(val));
        }
        setSavingsModalVisible(false); setGoalInput('');
    };

    const handleSaveInvestGoal = async () => {
        const typedVal = parseInputToNumber(goalInput, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!isNaN(val) && val >= 0) {
            setInvestGoal(val);
            await AsyncStorage.setItem(`@invest_goal_${user?.id}`, String(val));
        }
        setInvestModalVisible(false); setGoalInput('');
    };

    // ── Derived values ────────────────────────────────────────
    const allCategories = useMemo(() => [
        ...DEFAULT_CATEGORIES,
        ...customCategories.filter(c => !DEFAULT_CATEGORIES.find(d => d.name === c.name)).map(c => ({ ...c })),
    ], [customCategories]);

    const today = new Date();
    let remainingDays = 0, periodName = '';
    if (period === 'monthly') {
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        remainingDays = lastDay - today.getDate() + 1;
        periodName = today.toLocaleString('es-CO', { month: 'long', year: 'numeric' });
    } else {
        const cur = today.getDate();
        if (cur <= 15) {
            remainingDays = 15 - cur + 1;
            periodName = `1ra Quincena · ${today.toLocaleString('es-CO', { month: 'long' })}`;
        } else {
            const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            remainingDays = last - cur + 1;
            periodName = `2da Quincena · ${today.toLocaleString('es-CO', { month: 'long' })}`;
        }
    }

    const totalSpendingBudget = budgets.reduce((s, b) => s + (period === 'biweekly' ? b.monthly_limit / 2 : b.monthly_limit), 0);
    const totalPlanned = totalSpendingBudget + savingsGoal + investGoal;
    const totalSpent = budgets.reduce((s, b) => s + (spending[b.category] || 0), 0);
    const totalRemaining = Math.max(0, totalSpendingBudget - totalSpent);
    const dailySafe = remainingDays > 0 ? totalRemaining / remainingDays : 0;
    const surplus = totalBalance - totalPlanned;
    const isOverBudget = totalPlanned > totalBalance;

    const donutSegments = [
        { value: totalSpendingBudget, color: isDark ? '#818CF8' : '#6366F1' },
        { value: savingsGoal, color: '#10B981' },
        { value: investGoal, color: '#F59E0B' },
    ];

    const spendPct = totalBalance > 0 ? Math.min(100, (totalPlanned / totalBalance) * 100) : 0;

    // ── Render ────────────────────────────────────────────────
    return (
        <SafeAreaView style={[s.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={[s.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center' }}>
                    <Text style={[s.headerTitle, { color: colors.text }]}>Presupuesto</Text>
                    <Text style={[s.headerSub, { color: colors.sub }]}>{periodName}</Text>
                </View>
                <TouchableOpacity onPress={() => { setWizardTab('custom'); setWizardVisible(true); }} style={[s.circleBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Period Switcher */}
            <View style={[s.tabRow, { backgroundColor: colors.card }]}>
                {(['monthly', 'biweekly'] as const).map(p => (
                    <TouchableOpacity key={p} onPress={() => togglePeriod(p)} style={[s.tab, period === p && { backgroundColor: colors.accent }]}>
                        <Text style={[s.tabTxt, { color: period === p ? '#FFF' : colors.sub }]}>{p === 'monthly' ? 'Mensual' : 'Quincenal'}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* ── HERO BUBBLE ── */}
                <View style={[s.heroBubble, { backgroundColor: isOverBudget ? '#EF444420' : colors.accent }]}>
                    <View style={s.heroTop}>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.heroLabel, { color: isOverBudget ? '#EF4444' : 'rgba(255,255,255,0.75)' }]}>Dinero Disponible</Text>
                            <Text style={[s.heroBalance, { color: isOverBudget ? '#EF4444' : '#FFF' }]}>{fmt(totalBalance)}</Text>
                            <View style={{ marginTop: 12 }}>
                                <View style={s.heroBarBg}>
                                    <View style={[s.heroBarFill, { width: `${Math.min(100, spendPct)}%`, backgroundColor: isOverBudget ? '#EF4444' : '#FFF' }]} />
                                </View>
                                <Text style={[s.heroHint, { color: isOverBudget ? '#EF4444' : 'rgba(255,255,255,0.85)' }]}>
                                    {isOverBudget
                                        ? `⚠️ Estás planeando gastar ${fmt(Math.abs(surplus))} más de lo que tienes`
                                        : totalPlanned > 0
                                            ? `✅ Te sobran ${fmt(surplus)} sin presupuestar`
                                            : 'Agrega ítems a tu presupuesto para comenzar'}
                                </Text>
                            </View>
                        </View>
                        <View style={{ alignItems: 'center', paddingLeft: 16 }}>
                            <DonutChart segments={donutSegments} size={110} />
                            <View style={{ marginTop: 8, gap: 4 }}>
                                <View style={s.legendRow}>
                                    <View style={[s.legendDot, { backgroundColor: isDark ? '#818CF8' : '#6366F1' }]} />
                                    <Text style={s.legendTxt}>Gastos</Text>
                                </View>
                                <View style={s.legendRow}>
                                    <View style={[s.legendDot, { backgroundColor: '#10B981' }]} />
                                    <Text style={s.legendTxt}>Ahorro</Text>
                                </View>
                                <View style={s.legendRow}>
                                    <View style={[s.legendDot, { backgroundColor: '#F59E0B' }]} />
                                    <Text style={s.legendTxt}>Inversión</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                    {/* Mini stats row */}
                    <View style={s.heroStatsRow}>
                        <View style={s.heroStat}>
                            <Text style={s.heroStatLab}>PRESUPUESTADO</Text>
                            <Text style={[s.heroStatVal, { color: isOverBudget ? '#EF4444' : '#FFF' }]}>{fmt(totalPlanned)}</Text>
                        </View>
                        <View style={[s.heroStatDivider]} />
                        <View style={s.heroStat}>
                            <Text style={s.heroStatLab}>GASTADO</Text>
                            <Text style={s.heroStatVal}>{fmt(totalSpent)}</Text>
                        </View>
                        <View style={s.heroStatDivider} />
                        <View style={s.heroStat}>
                            <Text style={s.heroStatLab}>DIARIO</Text>
                            <Text style={s.heroStatVal}>{fmt(dailySafe)}</Text>
                        </View>
                    </View>
                </View>

                {/* ── IMPORT BUTTON ── */}
                <TouchableOpacity style={[s.importBtn, { backgroundColor: colors.card, borderColor: colors.accent + '40', borderWidth: 1 }]} onPress={() => { setWizardTab('fixed'); setWizardVisible(true); }}>
                    <Ionicons name="flash" size={18} color={colors.accent} />
                    <Text style={[s.importTxt, { color: colors.accent }]}>Importar gastos fijos o cuotas de préstamos</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </TouchableOpacity>

                {/* ── SECTION: GASTOS ── */}
                <View style={s.sectionHeader}>
                    <View style={[s.sectionIconBox, { backgroundColor: (isDark ? '#818CF8' : '#6366F1') + '20' }]}>
                        <MaterialIcons name="receipt-long" size={18} color={isDark ? '#818CF8' : '#6366F1'} />
                    </View>
                    <Text style={[s.sectionTitle, { color: colors.text }]}>Gastos</Text>
                    <Text style={[s.sectionTotal, { color: colors.sub }]}>{fmt(totalSpendingBudget)}</Text>
                </View>

                {allCategories.map(cat => {
                    const budget = budgets.find(b => b.category === cat.name);
                    const spent = spending[cat.name] || 0;
                    if (!budget && spent === 0) return null;
                    let limit = budget?.monthly_limit || 0;
                    if (period === 'biweekly') limit = limit / 2;
                    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                    const isOver = limit > 0 && spent > limit;
                    const isNear = limit > 0 && pct >= 85 && !isOver;
                    const statusColor = isOver ? '#EF4444' : isNear ? '#F59E0B' : cat.color;
                    const catInfo = DEFAULT_CATEGORIES.find(d => d.name === cat.name) || cat;

                    return (
                        <TouchableOpacity
                            key={cat.name}
                            style={[s.budgetCard, { backgroundColor: colors.card }, isOver && { borderColor: '#EF444440', borderWidth: 1.5 }]}
                            onPress={() => openLimitModal(catInfo, budget)}
                        >
                            <View style={s.cardTop}>
                                <View style={[s.iconBox, { backgroundColor: catInfo.color + '18' }]}>
                                    <MaterialIcons name={catInfo.icon as any} size={20} color={catInfo.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={[s.catName, { color: colors.text }]}>{cat.name}</Text>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[s.spentNum, { color: isOver ? '#EF4444' : colors.text }]}>{fmt(spent)}</Text>
                                            {limit > 0 && <Text style={[s.limitSub, { color: colors.sub }]}>de {fmt(limit)}</Text>}
                                        </View>
                                    </View>
                                </View>
                            </View>
                            {limit > 0 ? (
                                <View style={{ marginTop: 12 }}>
                                    <View style={[s.barBg, { backgroundColor: colors.bg }]}>
                                        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                        <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>
                                            {isOver ? '🔴 EXCEDIDO' : isNear ? '⚠️ CASI AL LÍMITE' : `${pct.toFixed(0)}% usado`}
                                        </Text>
                                        <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{remainingDays} días rest.</Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={s.addPlaceholder}>
                                    <Ionicons name="add-circle-outline" size={15} color={colors.accent} />
                                    <Text style={[s.addTxt, { color: colors.accent }]}>Definir límite</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* No spending categories → show prompt */}
                {budgets.length === 0 && Object.keys(spending).length === 0 && (
                    <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
                        <MaterialIcons name="bar-chart" size={40} color={colors.sub + '50'} />
                        <Text style={[s.emptyTxt, { color: colors.sub }]}>Todavía no tienes gastos ni límites definidos.{'\n'}Toca ＋ para agregar tu primer ítem.</Text>
                    </View>
                )}

                {/* ── SECTION: AHORRO ── */}
                <View style={s.sectionHeader}>
                    <View style={[s.sectionIconBox, { backgroundColor: '#10B98120' }]}>
                        <MaterialIcons name="savings" size={18} color="#10B981" />
                    </View>
                    <Text style={[s.sectionTitle, { color: colors.text }]}>Ahorro</Text>
                    <Text style={[s.sectionTotal, { color: '#10B981' }]}>{fmt(savingsGoal)}</Text>
                </View>

                <TouchableOpacity style={[s.budgetCard, { backgroundColor: colors.card }]} onPress={() => { setGoalInput(savingsGoal > 0 ? String(Math.round(convertCurrency(savingsGoal, currency, rates))) : ''); setSavingsModalVisible(true); }}>
                    <View style={s.cardTop}>
                        <View style={[s.iconBox, { backgroundColor: '#10B98118' }]}>
                            <MaterialIcons name="savings" size={20} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={[s.catName, { color: colors.text }]}>Meta de Ahorro</Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[s.spentNum, { color: colors.text }]}>{fmt(savingsReal)}</Text>
                                    {savingsGoal > 0 && <Text style={[s.limitSub, { color: colors.sub }]}>meta {fmt(savingsGoal)}</Text>}
                                </View>
                            </View>
                        </View>
                    </View>
                    {savingsGoal > 0 ? (
                        <View style={{ marginTop: 12 }}>
                            <View style={[s.barBg, { backgroundColor: colors.bg }]}>
                                <View style={[s.barFill, { width: `${Math.min(100, (savingsReal / savingsGoal) * 100)}%`, backgroundColor: '#10B981' }]} />
                            </View>
                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800', marginTop: 6 }}>
                                {Math.round((savingsReal / savingsGoal) * 100)}% de la meta · {fmt(Math.max(0, savingsGoal - savingsReal))} faltante
                            </Text>
                        </View>
                    ) : (
                        <View style={s.addPlaceholder}>
                            <Ionicons name="add-circle-outline" size={15} color="#10B981" />
                            <Text style={[s.addTxt, { color: '#10B981' }]}>Definir meta de ahorro mensual</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* ── SECTION: INVERSIÓN ── */}
                <View style={s.sectionHeader}>
                    <View style={[s.sectionIconBox, { backgroundColor: '#F59E0B20' }]}>
                        <MaterialIcons name="trending-up" size={18} color="#F59E0B" />
                    </View>
                    <Text style={[s.sectionTitle, { color: colors.text }]}>Inversión</Text>
                    <Text style={[s.sectionTotal, { color: '#F59E0B' }]}>{fmt(investGoal)}</Text>
                </View>

                <TouchableOpacity style={[s.budgetCard, { backgroundColor: colors.card }]} onPress={() => { setGoalInput(investGoal > 0 ? String(Math.round(convertCurrency(investGoal, currency, rates))) : ''); setInvestModalVisible(true); }}>
                    <View style={s.cardTop}>
                        <View style={[s.iconBox, { backgroundColor: '#F59E0B18' }]}>
                            <MaterialIcons name="trending-up" size={20} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={[s.catName, { color: colors.text }]}>Meta de Inversión</Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[s.spentNum, { color: colors.text }]}>{fmt(investReal)}</Text>
                                    {investGoal > 0 && <Text style={[s.limitSub, { color: colors.sub }]}>meta {fmt(investGoal)}</Text>}
                                </View>
                            </View>
                        </View>
                    </View>
                    {investGoal > 0 ? (
                        <View style={{ marginTop: 12 }}>
                            <View style={[s.barBg, { backgroundColor: colors.bg }]}>
                                <View style={[s.barFill, { width: `${Math.min(100, (investReal / investGoal) * 100)}%`, backgroundColor: '#F59E0B' }]} />
                            </View>
                            <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800', marginTop: 6 }}>
                                {Math.round((investReal / investGoal) * 100)}% de la meta · {fmt(Math.max(0, investGoal - investReal))} faltante
                            </Text>
                        </View>
                    ) : (
                        <View style={s.addPlaceholder}>
                            <Ionicons name="add-circle-outline" size={15} color="#F59E0B" />
                            <Text style={[s.addTxt, { color: '#F59E0B' }]}>Definir meta de inversión mensual</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* ══════════════════════════════════════
                MODAL: Wizard de importación
            ══════════════════════════════════════ */}
            <Modal visible={wizardVisible} animationType="slide" transparent>
                <View style={s.overlayFull}>
                    <TouchableWithoutFeedback onPress={() => setWizardVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[s.wizardBox, { backgroundColor: colors.card }]}>
                            {/* Wizard Header */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <Text style={[s.wizardTitle, { color: colors.text }]}>¿Qué vas a presupuestar?</Text>
                                <TouchableOpacity onPress={() => setWizardVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>

                            {/* Tab selector */}
                            <View style={[s.wizardTabs, { backgroundColor: colors.bg }]}>
                                {([
                                    { key: 'fixed', label: '📋 Gastos Fijos' },
                                    { key: 'loans', label: '🏦 Préstamos' },
                                    { key: 'custom', label: '✏️ Manual' },
                                ] as const).map(t => (
                                    <TouchableOpacity key={t.key} onPress={() => setWizardTab(t.key)} style={[s.wizardTab, wizardTab === t.key && { backgroundColor: colors.accent }]}>
                                        <Text style={[s.wizardTabTxt, { color: wizardTab === t.key ? '#FFF' : colors.sub }]}>{t.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                {wizardTab === 'fixed' && (
                                    <View style={{ paddingTop: 8 }}>
                                        {fixedDebts.length === 0 ? (
                                            <Text style={[s.emptyWiz, { color: colors.sub }]}>No tienes gastos fijos activos.{'\n'}Puedes crearlos en la sección de Deudas.</Text>
                                        ) : fixedDebts.map(debt => {
                                            const checked = selectedFixed.has(debt.id);
                                            return (
                                                <TouchableOpacity key={debt.id} style={[s.wizardItem, { borderColor: checked ? colors.accent : colors.border }]} onPress={() => {
                                                    const newSet = new Set(selectedFixed);
                                                    checked ? newSet.delete(debt.id) : newSet.add(debt.id);
                                                    setSelectedFixed(newSet);
                                                }}>
                                                    <View style={[s.checkbox, { borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : 'transparent' }]}>
                                                        {checked && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[{ color: colors.text, fontWeight: '700', fontSize: 14 }]}>{debt.client}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12 }}>Vence día {new Date(debt.due_date + 'T12:00:00').getUTCDate()}</Text>
                                                    </View>
                                                    <Text style={{ color: colors.text, fontWeight: '800' }}>{fmt(debt.value)}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                {wizardTab === 'loans' && (
                                    <View style={{ paddingTop: 8 }}>
                                        {loanItems.length === 0 ? (
                                            <Text style={[s.emptyWiz, { color: colors.sub }]}>No tienes préstamos activos con cuotas pendientes.</Text>
                                        ) : loanItems.map(loan => {
                                            const checked = selectedLoans.has(loan.id);
                                            return (
                                                <TouchableOpacity key={loan.id} style={[s.wizardItem, { borderColor: checked ? colors.accent : colors.border }]} onPress={() => {
                                                    const newSet = new Set(selectedLoans);
                                                    checked ? newSet.delete(loan.id) : newSet.add(loan.id);
                                                    setSelectedLoans(newSet);
                                                }}>
                                                    <View style={[s.checkbox, { borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : 'transparent' }]}>
                                                        {checked && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{loan.name}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12 }}>Cuota mensual</Text>
                                                    </View>
                                                    <Text style={{ color: colors.text, fontWeight: '800' }}>{fmt(loan.monthlyPayment)}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                {wizardTab === 'custom' && (
                                    <View style={{ paddingTop: 12 }}>
                                        <Text style={[s.wizardLabel, { color: colors.sub }]}>NOMBRE DE LA CATEGORÍA</Text>
                                        <TextInput
                                            style={[s.wizardInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
                                            value={customCatName}
                                            onChangeText={setCustomCatName}
                                            placeholder="Ej: Transporte, Mascotas..."
                                            placeholderTextColor={colors.sub + '70'}
                                        />
                                        <Text style={[s.wizardLabel, { color: colors.sub, marginTop: 14 }]}>ÍCONO Y COLOR</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                                            {ALL_CATEGORY_ICONS.map((ic, i) => (
                                                <TouchableOpacity key={i} onPress={() => setCustomCatIcon(ic)} style={[s.iconPicker, { backgroundColor: ic.color + '20', borderColor: customCatIcon.icon === ic.icon ? ic.color : 'transparent', borderWidth: 2 }]}>
                                                    <MaterialIcons name={ic.icon as any} size={20} color={ic.color} />
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                        <Text style={[s.wizardLabel, { color: colors.sub, marginTop: 14 }]}>LÍMITE MENSUAL</Text>
                                        <TextInput
                                            style={[s.wizardInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
                                            value={customLimitAmount}
                                            onChangeText={t => setCustomLimitAmount(formatInputDisplay(t, currency))}
                                            placeholder={`${getCurrencyInfo(currency).symbol} 0`}
                                            placeholderTextColor={colors.sub + '70'}
                                            keyboardType="decimal-pad"
                                        />
                                    </View>
                                )}
                            </ScrollView>

                            {/* Action Button */}
                            <TouchableOpacity style={[s.wizardBtn, { backgroundColor: colors.accent }]} onPress={handleImportSelected}>
                                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 15 }}>
                                    {wizardTab === 'custom' ? 'Agregar Categoría' : `Importar ${wizardTab === 'fixed' ? selectedFixed.size : selectedLoans.size} seleccionados`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                MODAL: Editar Límite de Categoría
            ══════════════════════════════════════ */}
            <Modal visible={limitModalVisible} transparent animationType="slide">
                <View style={s.overlayFull}>
                    <TouchableWithoutFeedback onPress={() => setLimitModalVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[s.limitBox, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                                <View style={[s.iconBox, { backgroundColor: (editingBudget?.color || colors.accent) + '18', width: 52, height: 52, borderRadius: 16 }]}>
                                    <MaterialIcons name={(editingBudget?.icon || 'label') as any} size={26} color={editingBudget?.color || colors.accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[{ color: colors.text, fontSize: 18, fontWeight: '900' }]}>{editingBudget?.name || editingBudget?.category}</Text>
                                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600' }}>Fijar límite máximo de gasto</Text>
                                </View>
                                <TouchableOpacity onPress={() => setLimitModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 8 }}>
                                <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900' }}>{getCurrencyInfo(currency).symbol}</Text>
                                <TextInput
                                    style={{ color: colors.text, fontSize: 42, fontWeight: '900', minWidth: 140, textAlign: 'center' }}
                                    value={limitAmount}
                                    onChangeText={t => setLimitAmount(formatInputDisplay(t, currency))}
                                    placeholder="0"
                                    placeholderTextColor={colors.sub + '40'}
                                    keyboardType="decimal-pad"
                                    autoFocus
                                />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.bg }]} onPress={() => setLimitModalVisible(false)}>
                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Cerrar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.accent }]} onPress={handleSaveBudget}>
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
                                </TouchableOpacity>
                            </View>
                            {budgets.find(b => b.category === (editingBudget?.name || editingBudget?.category)) && (
                                <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => { setLimitModalVisible(false); handleDelete(budgets.find(b => b.category === (editingBudget?.name || editingBudget?.category))); }}>
                                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '800' }}>Eliminar este presupuesto</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                MODAL: Meta de Ahorro
            ══════════════════════════════════════ */}
            <Modal visible={savingsModalVisible} transparent animationType="slide">
                <View style={s.overlayFull}>
                    <TouchableWithoutFeedback onPress={() => setSavingsModalVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[s.limitBox, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                                <View style={[s.iconBox, { backgroundColor: '#10B98118', width: 52, height: 52, borderRadius: 16 }]}>
                                    <MaterialIcons name="savings" size={26} color="#10B981" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Meta de Ahorro</Text>
                                    <Text style={{ color: colors.sub, fontSize: 12 }}>¿Cuánto quieres ahorrar este mes?</Text>
                                </View>
                                <TouchableOpacity onPress={() => setSavingsModalVisible(false)}><Ionicons name="close" size={24} color={colors.sub} /></TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 8 }}>
                                <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900' }}>{getCurrencyInfo(currency).symbol}</Text>
                                <TextInput style={{ color: colors.text, fontSize: 42, fontWeight: '900', minWidth: 140, textAlign: 'center' }} value={goalInput} onChangeText={t => setGoalInput(formatInputDisplay(t, currency))} placeholder="0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.bg }]} onPress={() => setSavingsModalVisible(false)}><Text style={{ color: colors.text, fontWeight: '800' }}>Cerrar</Text></TouchableOpacity>
                                <TouchableOpacity style={[s.mBtn, { backgroundColor: '#10B981' }]} onPress={handleSaveSavingsGoal}><Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text></TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ══════════════════════════════════════
                MODAL: Meta de Inversión
            ══════════════════════════════════════ */}
            <Modal visible={investModalVisible} transparent animationType="slide">
                <View style={s.overlayFull}>
                    <TouchableWithoutFeedback onPress={() => setInvestModalVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[s.limitBox, { backgroundColor: colors.card }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                                <View style={[s.iconBox, { backgroundColor: '#F59E0B18', width: 52, height: 52, borderRadius: 16 }]}>
                                    <MaterialIcons name="trending-up" size={26} color="#F59E0B" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Meta de Inversión</Text>
                                    <Text style={{ color: colors.sub, fontSize: 12 }}>¿Cuánto quieres invertir este mes?</Text>
                                </View>
                                <TouchableOpacity onPress={() => setInvestModalVisible(false)}><Ionicons name="close" size={24} color={colors.sub} /></TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32, gap: 8 }}>
                                <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900' }}>{getCurrencyInfo(currency).symbol}</Text>
                                <TextInput style={{ color: colors.text, fontSize: 42, fontWeight: '900', minWidth: 140, textAlign: 'center' }} value={goalInput} onChangeText={t => setGoalInput(formatInputDisplay(t, currency))} placeholder="0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12 }}>
                                <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.bg }]} onPress={() => setInvestModalVisible(false)}><Text style={{ color: colors.text, fontWeight: '800' }}>Cerrar</Text></TouchableOpacity>
                                <TouchableOpacity style={[s.mBtn, { backgroundColor: '#F59E0B' }]} onPress={handleSaveInvestGoal}><Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text></TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 12 },
    headerTitle: { fontSize: 20, fontWeight: '900' },
    headerSub: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize', opacity: 0.6 },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

    tabRow: { flexDirection: 'row', marginHorizontal: 24, marginBottom: 20, borderRadius: 16, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    tabTxt: { fontSize: 13, fontWeight: '800' },

    scroll: { paddingHorizontal: 20, paddingBottom: 100 },

    // Hero bubble
    heroBubble: { borderRadius: 28, padding: 22, marginBottom: 16, elevation: 6, shadowColor: '#6366F1', shadowOpacity: 0.25, shadowRadius: 16 },
    heroTop: { flexDirection: 'row', marginBottom: 16 },
    heroLabel: { fontSize: 12, fontWeight: '700' },
    heroBalance: { fontSize: 30, fontWeight: '900', marginTop: 2 },
    heroBarBg: { height: 7, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden', marginTop: 10 },
    heroBarFill: { height: '100%', borderRadius: 4 },
    heroHint: { fontSize: 11, fontWeight: '600', marginTop: 8, lineHeight: 16 },
    heroStatsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 14 },
    heroStat: { alignItems: 'center' },
    heroStatLab: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    heroStatVal: { color: '#FFF', fontSize: 14, fontWeight: '900', marginTop: 2 },
    heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 7, height: 7, borderRadius: 4 },
    legendTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700' },

    // Import Button
    importBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 14, marginBottom: 20 },
    importTxt: { flex: 1, fontSize: 13, fontWeight: '700' },

    // Section Header
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 },
    sectionIconBox: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { flex: 1, fontSize: 16, fontWeight: '900' },
    sectionTotal: { fontSize: 15, fontWeight: '800' },

    // Budget Cards
    budgetCard: { borderRadius: 22, padding: 18, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    catName: { fontSize: 15, fontWeight: '800' },
    spentNum: { fontSize: 15, fontWeight: '900' },
    limitSub: { fontSize: 10, fontWeight: '600', marginTop: 1 },
    barBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    addPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
    addTxt: { fontSize: 12, fontWeight: '800' },

    // Empty
    emptyCard: { borderRadius: 22, padding: 32, alignItems: 'center', marginBottom: 16 },
    emptyTxt: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 12 },

    // Modals
    overlayFull: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    wizardBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 28, paddingBottom: 40 },
    wizardTitle: { fontSize: 18, fontWeight: '900' },
    wizardTabs: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 16, gap: 4 },
    wizardTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    wizardTabTxt: { fontSize: 11, fontWeight: '800' },
    wizardItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    wizardLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
    wizardInput: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 16, fontWeight: '700', marginBottom: 4 },
    iconPicker: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    emptyWiz: { textAlign: 'center', fontSize: 13, lineHeight: 20, paddingVertical: 24, paddingHorizontal: 12 },
    wizardBtn: { paddingVertical: 18, borderRadius: 20, alignItems: 'center', marginTop: 20 },

    limitBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingBottom: 50 },
    mBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
});
