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
    const [regularDebts, setRegularDebts] = useState<any[]>([]);
    const [loanItems, setLoanItems] = useState<{ id: string; name: string; monthlyPayment: number; isPaidThisMonth?: boolean }[]>([]);
    const [importedItems, setImportedItems] = useState<Set<string>>(new Set());
    const [savingsGoal, setSavingsGoal] = useState(0);
    const [savingsReal, setSavingsReal] = useState(0);
    const [investGoal, setInvestGoal] = useState(0);
    const [investReal, setInvestReal] = useState(0);
    const [customCategories, setCustomCategories] = useState<{ name: string; icon: string; color: string }[]>([]);

    const [historicalIncome, setHistoricalIncome] = useState(0);
    const [historicalAverages, setHistoricalAverages] = useState<Record<string, number>>({});

    // Budget Wizard (Cambio 3)
    const [budgetWizardVisible, setBudgetWizardVisible] = useState(false);
    const [wizardStep, setWizardStep] = useState<'income' | 'adjust' | 'surplus'>('income');
    const [confirmedIncome, setConfirmedIncome] = useState(0);
    const [incomeInput, setIncomeInput] = useState('');
    const [categoryLimits, setCategoryLimits] = useState<Record<string, string>>({});
    const [surplusAllocation, setSurplusAllocation] = useState<'savings' | 'invest' | 'split' | 'buffer' | null>(null);

    // Modals
    const [wizardVisible, setWizardVisible] = useState(false);
    const [wizardTab, setWizardTab] = useState<'fixed' | 'debts' | 'loans' | 'custom'>('fixed');
    const [selectedFixed, setSelectedFixed] = useState<Set<string>>(new Set());
    const [selectedDebts, setSelectedDebts] = useState<Set<string>>(new Set());
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
    }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            await syncDown(user.id);
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

            // Savings/Invest goals migration & load
            const today = new Date();
            const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            const { data: goalsData } = await supabase.from('budget_goals').select('*').eq('user_id', user.id).eq('month', currentMonthStr);
            
            let sGoal = 0, iGoal = 0;
            let needsMigration = false;
            
            if (goalsData && goalsData.length > 0) {
                const sRow = goalsData.find((g: any) => g.type === 'savings');
                const iRow = goalsData.find((g: any) => g.type === 'invest');
                if (sRow) sGoal = sRow.amount;
                if (iRow) iGoal = iRow.amount;
            } else {
                needsMigration = true;
            }

            const sgRaw = await AsyncStorage.getItem(`@savings_goal_${user.id}`);
            const igRaw = await AsyncStorage.getItem(`@invest_goal_${user.id}`);
            
            if (needsMigration) {
                if (sgRaw && sGoal === 0) sGoal = parseFloat(sgRaw);
                if (igRaw && iGoal === 0) iGoal = parseFloat(igRaw);
                const upserts = [];
                if (sGoal > 0) upserts.push({ user_id: user.id, type: 'savings', amount: sGoal, month: currentMonthStr });
                if (iGoal > 0) upserts.push({ user_id: user.id, type: 'invest', amount: iGoal, month: currentMonthStr });
                if (upserts.length > 0) await supabase.from('budget_goals').upsert(upserts);
                await AsyncStorage.removeItem(`@savings_goal_${user.id}`);
                await AsyncStorage.removeItem(`@invest_goal_${user.id}`);
            }

            setSavingsGoal(sGoal);
            setInvestGoal(iGoal);

            const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);

            const historyStartDate = new Date(today.getFullYear(), today.getMonth() - 3, 1);
            historyStartDate.setHours(0, 0, 0, 0);

            const importedKey = `@budget_imported_${user.id}_${today.getFullYear()}_${today.getMonth()}`;
            const importedRaw = await AsyncStorage.getItem(importedKey);
            if (importedRaw) setImportedItems(new Set(JSON.parse(importedRaw)));

            const [budgetRes, txRes, histTxRes, debtsRes] = await Promise.all([
                supabase.from('budgets').select('*').eq('user_id', user.id),
                supabase.from('transactions').select('category, amount, type, account, date').eq('user_id', user.id).gte('date', startDate.toISOString()),
                supabase.from('transactions').select('category, amount, type, account, date').eq('user_id', user.id).gte('date', historyStartDate.toISOString()).lt('date', startDate.toISOString()),
                supabase.from('debts').select('*').eq('user_id', user.id),
            ]);

            setBudgets(budgetRes.data || []);

            // Calcular ingresos y promedios históricos
            const histTxs = histTxRes.data || [];
            const incomeByMonth: Record<string, number> = {};
            const expensesByCatByMonth: Record<string, Record<string, number>> = {};

            histTxs.forEach(tx => {
                const d = new Date(tx.date);
                const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
                const amt = Number(tx.amount || 0);
                if (tx.type === 'income') {
                    incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + amt;
                } else if (tx.type === 'expense') {
                    const cat = tx.category || 'Otros';
                    if (!expensesByCatByMonth[cat]) expensesByCatByMonth[cat] = {};
                    expensesByCatByMonth[cat][monthKey] = (expensesByCatByMonth[cat][monthKey] || 0) + amt;
                }
            });

            const incomeVals = Object.values(incomeByMonth).sort((a, b) => a - b);
            if (incomeVals.length > 0) {
                const mid = Math.floor(incomeVals.length / 2);
                setHistoricalIncome(incomeVals.length % 2 !== 0 ? incomeVals[mid] : (incomeVals[mid - 1] + incomeVals[mid]) / 2);
            } else {
                setHistoricalIncome(0);
            }

            const avgs: Record<string, number> = {};
            Object.keys(expensesByCatByMonth).forEach(cat => {
                const vals = Object.values(expensesByCatByMonth[cat]);
                const sum = vals.reduce((s, v) => s + v, 0);
                avgs[cat] = sum / 3; // Promedio de 3 meses
            });
            setHistoricalAverages(avgs);

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

            // Fixed debts for import (ALL — paid and unpaid)
            const allDebts = debtsRes.data || [];
            const fixed = allDebts.filter((d: any) => d.debt_type === 'fixed');
            setFixedDebts(fixed);

            // Regular debts for import
            const regDebts = allDebts.filter((d: any) => d.debt_type === 'debt');
            setRegularDebts(regDebts);

            // Loan installments for import
            const loans = allDebts
                .filter((d: any) => d.debt_type === 'loan_owe')
                .map((d: any) => {
                    const meta = parseLoanMeta(d.client);
                    if (!meta) return null;
                    const r = getMonthlyRate(meta.interestRate, meta.rateType);
                    const monthly = buildLoanMonthlyPayment(meta.disbursed, r, meta.termMonths, meta.amortizationMethod, meta.paidInstallments || []);
                    if (monthly <= 0) return null;
                    
                    const nextDate = new Date(d.due_date + 'T12:00:00');
                    const isPaidThisMonth = nextDate.getFullYear() > today.getFullYear() || 
                                            (nextDate.getFullYear() === today.getFullYear() && nextDate.getMonth() > today.getMonth());

                    return { id: d.id, name: meta.name, monthlyPayment: monthly, isPaidThisMonth, dueDate: d.due_date };
                })
                .filter(Boolean) as any[];
            setLoanItems(loans);

        } catch (e) { console.error(e); }
    };



    // ── Save / Delete budget ──────────────────────────────────
    const handleSaveBudget = async () => {
        const typedVal = parseInputToNumber(limitAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0) return;
        await supabase.from('budgets').upsert(
            [{ user_id: user?.id, category: editingBudget?.name || editingBudget?.category, monthly_limit: val }],
            { onConflict: 'user_id,category' }
        );
        setLimitAmount(''); setLimitModalVisible(false); loadData();
    };

    const handleDelete = async (budget: any) => {
        const msg = `¿Quitar el límite para "${budget.category}"?`;
        
        const removeImportedData = async () => {
            const today = new Date();
            const importedKey = `@budget_imported_${user?.id}_${today.getFullYear()}_${today.getMonth()}`;
            const newSet = new Set(importedItems);
            if (budget.category === 'Gastos Fijos') fixedDebts.forEach(d => newSet.delete(d.id));
            if (budget.category === 'Deudas') regularDebts.forEach(d => newSet.delete(d.id));
            if (budget.category === 'Préstamos') loanItems.forEach(d => newSet.delete(d.id));
            await AsyncStorage.setItem(importedKey, JSON.stringify(Array.from(newSet)));
            setImportedItems(newSet);
        };

        if (Platform.OS === 'web') {
            if (window.confirm(msg)) { 
                await supabase.from('budgets').delete().eq('id', budget.id); 
                await removeImportedData();
                loadData(); 
            }
            return;
        }
        Alert.alert('Eliminar', msg, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: async () => { 
                await supabase.from('budgets').delete().eq('id', budget.id); 
                await removeImportedData();
                loadData(); 
            } }
        ]);
    };

    const openLimitModal = (catObj: any, existing?: any) => {
        setEditingBudget(catObj);
        if (existing) {
            const base = existing.monthly_limit;
            setLimitAmount(formatInputDisplay(String(Math.round(convertCurrency(base, currency, rates))), currency));
        } else {
            setLimitAmount('');
        }
        setLimitModalVisible(true);
    };

    // ── Import Wizard ─────────────────────────────────────────
    const handleImportSelected = async () => {
        if (!user?.id) return;
        const upserts: any[] = [];

        // Import fixed debts → group into 'Gastos Fijos'
        selectedFixed.forEach(id => {
            const debt = fixedDebts.find(d => d.id === id);
            if (!debt) return;
            const existing = budgets.find(b => b.category === 'Gastos Fijos');
            upserts.push({
                user_id: user.id,
                category: 'Gastos Fijos',
                monthly_limit: (existing?.monthly_limit || 0) + debt.value,
            });
        });

        // Import regular debts → group into 'Deudas'
        selectedDebts.forEach(id => {
            const debt = regularDebts.find(d => d.id === id);
            if (!debt) return;
            const pending = Math.max(0, debt.value - (debt.paid || 0));
            const existing = budgets.find(b => b.category === 'Deudas');
            upserts.push({
                user_id: user.id,
                category: 'Deudas',
                monthly_limit: (existing?.monthly_limit || 0) + pending,
            });
        });

        // Import loan installments → group into 'Préstamos'
        selectedLoans.forEach(id => {
            const loan = loanItems.find(l => l.id === id);
            if (!loan) return;
            const existing = budgets.find(b => b.category === 'Préstamos');
            upserts.push({
                user_id: user.id,
                category: 'Préstamos',
                monthly_limit: (existing?.monthly_limit || 0) + loan.monthlyPayment,
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
            
            const today = new Date();
            const importedKey = `@budget_imported_${user.id}_${today.getFullYear()}_${today.getMonth()}`;
            const newSet = new Set(importedItems);
            selectedFixed.forEach(id => newSet.add(id));
            selectedDebts.forEach(id => newSet.add(id));
            selectedLoans.forEach(id => newSet.add(id));
            await AsyncStorage.setItem(importedKey, JSON.stringify(Array.from(newSet)));
            setImportedItems(newSet);
        }

        setWizardVisible(false);
        setSelectedFixed(new Set());
        setSelectedDebts(new Set());
        setSelectedLoans(new Set());
        setCustomCatName('');
        setCustomLimitAmount('');
        loadData();
    };

    // ── Savings / Invest goal (Supabase) ─────────────────────────────────
    const saveGoalToSupabase = async (type: 'savings' | 'invest', val: number) => {
        if (!user?.id) return;
        const today = new Date();
        const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        await supabase.from('budget_goals').upsert(
            [{ user_id: user.id, type, amount: val, month }],
            { onConflict: 'user_id,type,month' }
        );
    };

    const handleSaveSavingsGoal = async () => {
        const typedVal = parseInputToNumber(goalInput, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!isNaN(val) && val >= 0) {
            setSavingsGoal(val);
            await saveGoalToSupabase('savings', val);
        }
        setSavingsModalVisible(false); setGoalInput('');
    };

    const handleSaveInvestGoal = async () => {
        const typedVal = parseInputToNumber(goalInput, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!isNaN(val) && val >= 0) {
            setInvestGoal(val);
            await saveGoalToSupabase('invest', val);
        }
        setInvestModalVisible(false); setGoalInput('');
    };

    // ── Budget Wizard Logic (Cambio 3) ────────────────────────────────────
    const VARIABLE_CATEGORIES = DEFAULT_CATEGORIES.map(c => c.name);

    const computeSuggestedLimits = (income: number): Record<string, string> => {
        const available = Math.max(0, income - totalPending);
        const avgs: Record<string, number> = {};
        let totalAvg = 0;
        VARIABLE_CATEGORIES.forEach(cat => {
            avgs[cat] = historicalAverages[cat] || 0;
            totalAvg += avgs[cat];
        });
        customCategories.forEach(cat => {
            avgs[cat.name] = historicalAverages[cat.name] || 0;
            totalAvg += avgs[cat.name];
        });

        const limits: Record<string, string> = {};
        const deficit = totalAvg - available;
        const DISCRETIONARY = ['Otros', 'Entretenimiento', 'Ropa', 'Gimnasio'];
        const all = [...VARIABLE_CATEGORIES, ...customCategories.map(c => c.name)];

        if (deficit <= 0) {
            // There is surplus — suggest cutting 5-10% from highest discretionary
            all.forEach(cat => {
                const avg = avgs[cat] || 0;
                const isDisc = DISCRETIONARY.includes(cat);
                const cut = isDisc && avg > 0 ? 0.10 : 0;
                limits[cat] = formatInputDisplay(String(Math.round(convertCurrency(avg * (1 - cut), currency, rates))), currency);
            });
        } else {
            // Need to cut — adapt proportionally to fit available income
            if (available <= 0 || totalAvg <= 0) {
                all.forEach(cat => {
                    limits[cat] = formatInputDisplay("0", currency);
                });
            } else {
                const scale = available / totalAvg;
                all.forEach(cat => {
                    const avg = avgs[cat] || 0;
                    // Use Math.floor to guarantee we don't accidentally exceed by rounding up
                    limits[cat] = formatInputDisplay(String(Math.floor(convertCurrency(avg * scale, currency, rates))), currency);
                });
            }
        }
        return limits;
    };

    const openBudgetWizard = () => {
        setWizardStep('income');
        setSurplusAllocation(null);
        if (confirmedIncome > 0) {
            setIncomeInput(formatInputDisplay(String(Math.round(convertCurrency(confirmedIncome, currency, rates))), currency));
        } else if (historicalIncome > 0) {
            setConfirmedIncome(historicalIncome);
            setIncomeInput(formatInputDisplay(String(Math.round(convertCurrency(historicalIncome, currency, rates))), currency));
        } else {
            setConfirmedIncome(0);
            setIncomeInput('');
        }
        setBudgetWizardVisible(true);
    };

    const confirmIncome = () => {
        const typedVal = parseInputToNumber(incomeInput, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0) return;
        setConfirmedIncome(val);
        setCategoryLimits(computeSuggestedLimits(val));
        setWizardStep('adjust');
    };

    const applyBudgetWizard = async () => {
        if (!user?.id) return;
        const all = [...VARIABLE_CATEGORIES, ...customCategories.map(c => c.name)];
        for (const cat of all) {
            const raw = categoryLimits[cat];
            if (!raw) continue;
            const typedVal = parseInputToNumber(raw, currency);
            const val = convertToBase(typedVal, currency, rates);
            if (!isNaN(val) && val > 0) {
                await supabase.from('budgets').upsert(
                    [{ user_id: user.id, category: cat, monthly_limit: val }],
                    { onConflict: 'user_id,category' }
                );
            }
        }

        const surplusBase = confirmedIncome - totalPending - all.reduce((s, cat) => {
            const raw = categoryLimits[cat];
            if (!raw) return s;
            const typedVal = parseInputToNumber(raw, currency);
            return s + convertToBase(typedVal, currency, rates);
        }, 0);

        if (surplusBase > 0 && surplusAllocation && surplusAllocation !== 'buffer') {
            const half = surplusBase / 2;
            if (surplusAllocation === 'savings' || surplusAllocation === 'split') {
                const newSav = savingsGoal + (surplusAllocation === 'split' ? half : surplusBase);
                setSavingsGoal(newSav);
                await saveGoalToSupabase('savings', newSav);
            }
            if (surplusAllocation === 'invest' || surplusAllocation === 'split') {
                const newInv = investGoal + (surplusAllocation === 'split' ? half : surplusBase);
                setInvestGoal(newInv);
                await saveGoalToSupabase('invest', newInv);
            }
        }

        setBudgetWizardVisible(false);
        loadData();
    };

    // ── Derived values ────────────────────────────────────────
    const allCategories = useMemo(() => [
        ...DEFAULT_CATEGORIES,
        ...customCategories.filter(c => !DEFAULT_CATEGORIES.find(d => d.name === c.name)).map(c => ({ ...c })),
    ], [customCategories]);

    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const remainingDays = lastDay - today.getDate() + 1;
    const periodName = today.toLocaleString('es-CO', { month: 'long', year: 'numeric' });

    const totalSpendingBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
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

    // ── Commitments (Próximos Pagos) ──────────────────────────
    const commitments = useMemo(() => {
        const list: any[] = [];
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        fixedDebts.forEach(d => {
            const isPaid = d.paid >= d.value;
            list.push({ id: d.id, type: 'Fijo', name: d.client, amount: d.value, isPaid, date: d.due_date, typeColor: '#5C6BC0' });
        });
        
        regularDebts.forEach(d => {
            const dDate = new Date(d.due_date + 'T12:00:00');
            if (dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear) {
                const isPaid = d.paid >= d.value;
                const pending = Math.max(0, d.value - (d.paid || 0));
                list.push({ id: d.id, type: 'Deuda', name: d.client, amount: pending > 0 ? pending : d.value, isPaid, date: d.due_date, typeColor: '#E67E22' });
            }
        });
        
        loanItems.forEach(l => {
            list.push({ id: l.id, type: 'Préstamo', name: l.name, amount: l.monthlyPayment, isPaid: l.isPaidThisMonth, date: l.dueDate, typeColor: '#6366F1' });
        });
        
        return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [fixedDebts, regularDebts, loanItems, today]);

    const totalPending = commitments.filter(c => !c.isPaid).reduce((s, c) => s + c.amount, 0);

    const renderCommitments = () => {
        if (commitments.length === 0) return null;
        return (
            <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Próximos Pagos</Text>
                
                <View style={[s.budgetCard, { backgroundColor: colors.card, padding: 0, overflow: 'hidden' }]}>
                    <View style={{ backgroundColor: colors.bg, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                            Total pendiente este mes: <Text style={{ color: colors.accent }}>{fmt(totalPending)}</Text>
                        </Text>
                    </View>
                    
                    {commitments.map((c, i) => {
                        const d = new Date(c.date + 'T12:00:00');
                        const diffTime = d.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        const isSoon = !c.isPaid && diffDays >= 0 && diffDays <= 5;
                        return (
                            <View key={c.id + c.type} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                                <View style={{ width: 40, alignItems: 'center' }}>
                                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{d.getUTCDate()}</Text>
                                    <Text style={{ color: colors.sub, fontSize: 10, textTransform: 'uppercase' }}>{d.toLocaleString('es-CO', { month: 'short' })}</Text>
                                </View>
                                <View style={{ flex: 1, paddingLeft: 12 }}>
                                    <Text style={{ color: colors.text, fontWeight: '600' }}>{c.name}</Text>
                                    <Text style={{ color: c.typeColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{c.type}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>{fmt(c.amount)}</Text>
                                    {c.isPaid ? (
                                        <View style={{ backgroundColor: '#10B98120', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>✓ PAGADO</Text>
                                        </View>
                                    ) : (
                                        <View style={{ backgroundColor: isSoon ? '#F59E0B20' : colors.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                            <Text style={{ color: isSoon ? '#F59E0B' : colors.sub, fontSize: 10, fontWeight: '800' }}>{isSoon ? 'VENCE PRONTO' : 'PENDIENTE'}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    };

    // ── Dynamic Hero Colors ──
    const hBg = isOverBudget ? (isDark ? '#450A0A' : '#FEF2F2') : colors.accent;
    const hTextMain = isOverBudget ? (isDark ? '#FECACA' : '#DC2626') : '#FFF';
    const hTextSub = isOverBudget ? (isDark ? '#FCA5A5' : '#EF4444') : 'rgba(255,255,255,0.75)';
    const hDiv = isOverBudget ? (isDark ? '#7F1D1D' : '#FECACA') : 'rgba(255,255,255,0.15)';
    const hBarBg = isOverBudget ? (isDark ? '#7F1D1D' : '#FEE2E2') : 'rgba(255,255,255,0.2)';
    const hBarFill = isOverBudget ? '#EF4444' : '#FFF';

    // ── Cambio 2: Tarjeta "Necesitas $X" ──
    const urgentCommitments = useMemo(() => {
        const now = new Date();
        return commitments.filter(c => {
            if (c.isPaid) return false;
            const d = new Date(c.date + 'T12:00:00');
            const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return diff >= 0 && diff <= 10;
        });
    }, [commitments]);

    const urgentTotal = urgentCommitments.reduce((s, c) => s + c.amount, 0);
    const urgentCovered = totalBalance >= urgentTotal;
    const cushion = totalBalance - urgentTotal;

    const firstUrgentDate = urgentCommitments.length > 0
        ? new Date(urgentCommitments[0].date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
        : '';

    const renderUrgentAlert = () => {
        if (urgentCommitments.length === 0) return null;
        return (
            <View style={[s.budgetCard, { backgroundColor: urgentCovered ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#450A0A' : '#FFF7ED'), marginTop: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <Text style={{ fontSize: 22 }}>{urgentCovered ? '✅' : '⚠️'}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: urgentCovered ? '#10B981' : '#F59E0B', fontSize: 14, fontWeight: '900', marginBottom: 4 }}>
                            {urgentCovered
                                ? `Tienes cubierto lo esencial, con ${fmt(cushion)} de colchón extra.`
                                : `Necesitas ${fmt(urgentTotal)} antes del ${firstUrgentDate}`
                            }
                        </Text>
                        {urgentCommitments.slice(0, 3).map((c, i) => (
                            <Text key={i} style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>
                                • {c.name} — {fmt(c.amount)} ({new Date(c.date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })})
                            </Text>
                        ))}
                        {urgentCommitments.length > 3 && (
                            <Text style={{ color: colors.sub, fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>
                                +{urgentCommitments.length - 3} más en los próximos 10 días
                            </Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

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
                <TouchableOpacity onPress={() => { setWizardTab('fixed'); setWizardVisible(true); }} style={[s.circleBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Ajustar Presupuesto button */}
            <TouchableOpacity onPress={openBudgetWizard} style={{ marginHorizontal: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 16, paddingVertical: 12, gap: 8, borderWidth: 1.5, borderColor: colors.accent + '40' }}>
                <MaterialIcons name="auto-fix-high" size={18} color={colors.accent} />
                <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>Configurar presupuesto del mes</Text>
            </TouchableOpacity>



            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* ── HERO BUBBLE ── */}
                <View style={[s.heroBubble, { backgroundColor: hBg }]}>
                    <View style={s.heroTop}>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.heroLabel, { color: hTextSub }]}>Dinero Disponible</Text>
                            <Text style={[s.heroBalance, { color: hTextMain }]}>{fmt(totalBalance)}</Text>
                            <View style={{ marginTop: 12 }}>
                                <View style={[s.heroBarBg, { backgroundColor: hBarBg }]}>
                                    <View style={[s.heroBarFill, { width: `${Math.min(100, spendPct)}%`, backgroundColor: hBarFill }]} />
                                </View>
                                <Text style={[s.heroHint, { color: hTextSub }]}>
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
                                    <Text style={[s.legendTxt, { color: hTextSub }]}>Gastos</Text>
                                </View>
                                <View style={s.legendRow}>
                                    <View style={[s.legendDot, { backgroundColor: '#10B981' }]} />
                                    <Text style={[s.legendTxt, { color: hTextSub }]}>Ahorro</Text>
                                </View>
                                <View style={s.legendRow}>
                                    <View style={[s.legendDot, { backgroundColor: '#F59E0B' }]} />
                                    <Text style={[s.legendTxt, { color: hTextSub }]}>Inversión</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                    {/* Mini stats row */}
                    <View style={[s.heroStatsRow, { borderTopColor: hDiv }]}>
                        <View style={s.heroStat}>
                            <Text style={[s.heroStatLab, { color: hTextSub }]}>PRESUPUESTADO</Text>
                            <Text style={[s.heroStatVal, { color: hTextMain }]}>{fmt(totalPlanned)}</Text>
                        </View>
                        <View style={[s.heroStatDivider, { backgroundColor: hDiv }]} />
                        <View style={s.heroStat}>
                            <Text style={[s.heroStatLab, { color: hTextSub }]}>GASTADO</Text>
                            <Text style={[s.heroStatVal, { color: hTextMain }]}>{fmt(totalSpent)}</Text>
                        </View>
                        <View style={[s.heroStatDivider, { backgroundColor: hDiv }]} />
                        <View style={s.heroStat}>
                            <Text style={[s.heroStatLab, { color: hTextSub }]}>DIARIO</Text>
                            <Text style={[s.heroStatVal, { color: hTextMain }]}>{fmt(dailySafe)}</Text>
                        </View>
                    </View>
                </View>

                {renderUrgentAlert()}
                {renderCommitments()}

                {/* Variables Section Header */}
                {(budgets.some(b => !['Gastos Fijos','Préstamos','Deudas'].includes(b.category)) || Object.keys(spending).some(k => !['Gastos Fijos','Préstamos','Deudas'].includes(k))) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 4, paddingHorizontal: 4 }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Gastos Variables</Text>
                    </View>
                )}

                {allCategories.map(cat => {
                    const budget = budgets.find(b => b.category === cat.name);
                    const spent = spending[cat.name] || 0;
                    if (!budget && spent === 0) return null;
                    const limit = budget?.monthly_limit || 0;
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



                {/* ── METAS DE AHORRO E INVERSIÓN (Cambio 4) ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4, paddingHorizontal: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}>Metas del Mes</Text>
                </View>

                <TouchableOpacity style={[s.budgetCard, { backgroundColor: colors.card }]} onPress={() => { setGoalInput(savingsGoal > 0 ? formatInputDisplay(String(Math.round(convertCurrency(savingsGoal, currency, rates))), currency) : ''); setSavingsModalVisible(true); }}>
                    <View style={s.cardTop}>
                        <View style={[s.iconBox, { backgroundColor: '#10B98118' }]}>
                            <MaterialIcons name="savings" size={20} color="#10B981" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.catName, { color: colors.text }]}>Meta de Ahorro</Text>
                            {savingsGoal > 0 ? (
                                <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>
                                    Vas en <Text style={{ color: '#10B981', fontWeight: '800' }}>{fmt(savingsReal)}</Text> de <Text style={{ fontWeight: '700' }}>{fmt(savingsGoal)}</Text> de tu meta
                                </Text>
                            ) : (
                                <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>Sin meta definida este mes</Text>
                            )}
                        </View>
                        <Text style={{ color: savingsGoal > 0 ? '#10B981' : colors.sub, fontWeight: '900', fontSize: 16 }}>
                            {savingsGoal > 0 ? `${Math.round((savingsReal / savingsGoal) * 100)}%` : '-'}
                        </Text>
                    </View>
                    {savingsGoal > 0 ? (
                        <View style={{ marginTop: 14 }}>
                            <View style={[s.barBg, { backgroundColor: colors.bg }]}>
                                <View style={[s.barFill, { width: `${Math.min(100, (savingsReal / savingsGoal) * 100)}%`, backgroundColor: '#10B981' }]} />
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800' }}>
                                    {savingsReal >= savingsGoal ? '🎉 META ALCANZADA' : `${fmt(Math.max(0, savingsGoal - savingsReal))} faltante`}
                                </Text>
                                <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{remainingDays} días rest.</Text>
                            </View>
                        </View>
                    ) : (
                        <View style={s.addPlaceholder}>
                            <Ionicons name="add-circle-outline" size={15} color="#10B981" />
                            <Text style={[s.addTxt, { color: '#10B981' }]}>Definir meta de ahorro mensual</Text>
                        </View>
                    )}
                </TouchableOpacity>



                <TouchableOpacity style={[s.budgetCard, { backgroundColor: colors.card }]} onPress={() => { setGoalInput(investGoal > 0 ? formatInputDisplay(String(Math.round(convertCurrency(investGoal, currency, rates))), currency) : ''); setInvestModalVisible(true); }}>
                    <View style={s.cardTop}>
                        <View style={[s.iconBox, { backgroundColor: '#F59E0B18' }]}>
                            <MaterialIcons name="trending-up" size={20} color="#F59E0B" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[s.catName, { color: colors.text }]}>Meta de Inversión</Text>
                            {investGoal > 0 ? (
                                <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>
                                    Vas en <Text style={{ color: '#F59E0B', fontWeight: '800' }}>{fmt(investReal)}</Text> de <Text style={{ fontWeight: '700' }}>{fmt(investGoal)}</Text> de tu meta
                                </Text>
                            ) : (
                                <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>Sin meta definida este mes</Text>
                            )}
                        </View>
                        <Text style={{ color: investGoal > 0 ? '#F59E0B' : colors.sub, fontWeight: '900', fontSize: 16 }}>
                            {investGoal > 0 ? `${Math.round((investReal / investGoal) * 100)}%` : '-'}
                        </Text>
                    </View>
                    {investGoal > 0 ? (
                        <View style={{ marginTop: 14 }}>
                            <View style={[s.barBg, { backgroundColor: colors.bg }]}>
                                <View style={[s.barFill, { width: `${Math.min(100, (investReal / investGoal) * 100)}%`, backgroundColor: '#F59E0B' }]} />
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>
                                    {investReal >= investGoal ? '🎉 META ALCANZADA' : `${fmt(Math.max(0, investGoal - investReal))} faltante`}
                                </Text>
                                <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>{remainingDays} días rest.</Text>
                            </View>
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
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                        <View style={[s.wizardBox, { backgroundColor: colors.card, height: '92%' }]}>
                            {/* Wizard Header */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <Text style={[s.wizardTitle, { color: colors.text }]}>¿Qué vas a presupuestar?</Text>
                                <TouchableOpacity onPress={() => setWizardVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>

                            {/* Tab selector */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                                <View style={[s.wizardTabs, { backgroundColor: colors.bg }]}>
                                    {([
                                        { key: 'fixed', label: '📋 Fijos' },
                                        { key: 'debts', label: '💳 Deudas' },
                                        { key: 'loans', label: '🏦 Préstamos' },
                                        { key: 'custom', label: '✏️ Manual' },
                                    ] as const).map(t => (
                                        <TouchableOpacity key={t.key} onPress={() => setWizardTab(t.key)} style={[s.wizardTab, wizardTab === t.key && { backgroundColor: colors.accent }]}>
                                            <Text style={[s.wizardTabTxt, { color: wizardTab === t.key ? '#FFF' : colors.sub }]}>{t.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                {wizardTab === 'fixed' && (
                                    <View style={{ paddingTop: 8 }}>
                                        {fixedDebts.length === 0 ? (
                                            <Text style={[s.emptyWiz, { color: colors.sub }]}>No tienes gastos fijos.{"\n"}Puedes crearlos en Deudas → Fijos.</Text>
                                        ) : fixedDebts.map(debt => {
                                            const isPaid = debt.paid >= debt.value;
                                            const isImported = importedItems.has(debt.id);
                                            const checked = selectedFixed.has(debt.id);
                                            return (
                                                <TouchableOpacity key={debt.id} disabled={isImported} style={[s.wizardItem, { borderColor: checked ? colors.accent : colors.border, opacity: isImported ? 0.6 : 1 }]} onPress={() => {
                                                    const newSet = new Set(selectedFixed);
                                                    checked ? newSet.delete(debt.id) : newSet.add(debt.id);
                                                    setSelectedFixed(newSet);
                                                }}>
                                                    <View style={[s.checkbox, { borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : 'transparent', opacity: isImported ? 0 : 1 }]}>
                                                        {checked && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{debt.client}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12 }}>Día {new Date(debt.due_date + 'T12:00:00').getUTCDate()} · {fmt(debt.value)}</Text>
                                                    </View>
                                                    {isImported 
                                                        ? <View style={{ backgroundColor: colors.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.accent, fontSize: 10, fontWeight: '900' }}>IMPORTADO</Text></View>
                                                        : isPaid
                                                            ? <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>✅ PAGADO</Text></View>
                                                            : <View style={{ backgroundColor: '#F59E0B20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '900' }}>PENDIENTE</Text></View>
                                                    }
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                {wizardTab === 'debts' && (
                                    <View style={{ paddingTop: 8 }}>
                                        {regularDebts.length === 0 ? (
                                            <Text style={[s.emptyWiz, { color: colors.sub }]}>No tienes deudas registradas.{"\n"}Puedes crearlas en Deudas → Deudas.</Text>
                                        ) : regularDebts.map(debt => {
                                            const isPaid = debt.paid >= debt.value;
                                            const isImported = importedItems.has(debt.id);
                                            const pending = Math.max(0, debt.value - (debt.paid || 0));
                                            const checked = selectedDebts.has(debt.id);
                                            return (
                                                <TouchableOpacity key={debt.id} disabled={isImported} style={[s.wizardItem, { borderColor: checked ? colors.accent : colors.border, opacity: isImported ? 0.6 : 1 }]} onPress={() => {
                                                    const newSet = new Set(selectedDebts);
                                                    checked ? newSet.delete(debt.id) : newSet.add(debt.id);
                                                    setSelectedDebts(newSet);
                                                }}>
                                                    <View style={[s.checkbox, { borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : 'transparent', opacity: isImported ? 0 : 1 }]}>
                                                        {checked && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{debt.client}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12 }}>Pendiente: {fmt(pending)}</Text>
                                                    </View>
                                                    {isImported 
                                                        ? <View style={{ backgroundColor: colors.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.accent, fontSize: 10, fontWeight: '900' }}>IMPORTADO</Text></View>
                                                        : isPaid
                                                            ? <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>✅ PAGADA</Text></View>
                                                            : <Text style={{ color: colors.text, fontWeight: '800' }}>{fmt(debt.value)}</Text>
                                                    }
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
                                            const isImported = importedItems.has(loan.id);
                                            const disabled = isImported || loan.isPaidThisMonth;
                                            const checked = selectedLoans.has(loan.id);
                                            return (
                                                <TouchableOpacity key={loan.id} disabled={disabled} style={[s.wizardItem, { borderColor: checked ? colors.accent : colors.border, opacity: disabled ? 0.6 : 1 }]} onPress={() => {
                                                    const newSet = new Set(selectedLoans);
                                                    checked ? newSet.delete(loan.id) : newSet.add(loan.id);
                                                    setSelectedLoans(newSet);
                                                }}>
                                                    <View style={[s.checkbox, { borderColor: checked ? colors.accent : colors.border, backgroundColor: checked ? colors.accent : 'transparent', opacity: disabled ? 0 : 1 }]}>
                                                        {checked && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{loan.name}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12 }}>Cuota mensual</Text>
                                                    </View>
                                                    {isImported 
                                                        ? <View style={{ backgroundColor: colors.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.accent, fontSize: 10, fontWeight: '900' }}>IMPORTADO</Text></View>
                                                        : loan.isPaidThisMonth
                                                            ? <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>✅ PAGADO</Text></View>
                                                            : <Text style={{ color: colors.text, fontWeight: '800' }}>{fmt(loan.monthlyPayment)}</Text>
                                                    }
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
                                    {wizardTab === 'custom'
                                        ? 'Agregar Categoría'
                                        : wizardTab === 'fixed'
                                            ? `Importar ${selectedFixed.size} seleccionados`
                                            : wizardTab === 'debts'
                                                ? `Importar ${selectedDebts.size} seleccionados`
                                                : `Importar ${selectedLoans.size} seleccionados`}
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
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                        <View style={[s.limitBox, { backgroundColor: colors.card, height: '92%' }]}>
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
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                        <View style={[s.limitBox, { backgroundColor: colors.card, height: '92%' }]}>
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
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                        <View style={[s.limitBox, { backgroundColor: colors.card, height: '92%' }]}>
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

            {/* ══════════════════════════════════════
                MODAL: Budget Wizard (Cambio 3)
            ══════════════════════════════════════ */}
            <Modal visible={budgetWizardVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', flex: 1, justifyContent: 'flex-end' }}>
                        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '92%' }}>

                            {/* Wizard Header */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 12 }}>
                                <View>
                                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>Configurar Presupuesto</Text>
                                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                                        {wizardStep === 'income' ? 'Paso 1 de 3 · Ingreso del mes' : wizardStep === 'adjust' ? 'Paso 2 de 3 · Ajustar límites' : 'Paso 3 de 3 · Destinar excedente'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setBudgetWizardVisible(false)} style={[s.circleBtn, { backgroundColor: colors.bg }]}>
                                    <Ionicons name="close" size={20} color={colors.sub} />
                                </TouchableOpacity>
                            </View>

                            {/* Step indicator */}
                            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, marginBottom: 20 }}>
                                {(['income', 'adjust', 'surplus'] as const).map((step, i) => (
                                    <View key={step} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: (wizardStep === 'income' ? i <= 0 : wizardStep === 'adjust' ? i <= 1 : i <= 2) ? colors.accent : colors.border }} />
                                ))}
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>

                                {/* ── STEP 1: Ingreso ── */}
                                {wizardStep === 'income' && (
                                    <View>
                                        {historicalIncome > 0 ? (
                                            <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 18, marginBottom: 20 }}>
                                                <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>SEGÚN TUS ÚLTIMOS 3 MESES</Text>
                                                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>
                                                    Tu ingreso mensual estimado es:
                                                </Text>
                                                <Text style={{ color: colors.accent, fontSize: 28, fontWeight: '900', marginVertical: 8 }}>
                                                    {fmt(historicalIncome)}
                                                </Text>
                                                <Text style={{ color: colors.sub, fontSize: 12 }}>¿Es correcto este monto para {periodName}?</Text>
                                            </View>
                                        ) : (
                                            <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 18, marginBottom: 20 }}>
                                                <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700', marginBottom: 6 }}>
                                                    ⚠️ No tenemos suficiente historial de ingresos.
                                                </Text>
                                                <Text style={{ color: colors.sub, fontSize: 13 }}>Ingresa tu ingreso esperado para este mes:</Text>
                                            </View>
                                        )}

                                        <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 }}>
                                            {historicalIncome > 0 ? 'AJUSTAR INGRESO (OPCIONAL)' : 'INGRESO ESPERADO ESTE MES'}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 24, borderWidth: 1.5, borderColor: colors.accent + '50' }}>
                                            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', marginRight: 8 }}>{getCurrencyInfo(currency).symbol}</Text>
                                            <TextInput
                                                style={{ flex: 1, color: colors.text, fontSize: 26, fontWeight: '900', paddingVertical: 12 }}
                                                value={incomeInput}
                                                onChangeText={t => setIncomeInput(formatInputDisplay(t, currency))}
                                                placeholder="0"
                                                placeholderTextColor={colors.sub + '40'}
                                                keyboardType="decimal-pad"
                                            />
                                        </View>

                                        {/* Compromisos de referencia */}
                                        {totalPending > 0 && (
                                            <View style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 14, marginBottom: 20 }}>
                                                <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 }}>COMPROMISOS FIJOS ESTE MES (SOLO LECTURA)</Text>
                                                {commitments.filter(c => !c.isPaid).map((c, i) => (
                                                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                        <Text style={{ color: colors.sub, fontSize: 12 }}>{c.name} <Text style={{ color: c.typeColor, fontWeight: '700' }}>· {c.type}</Text></Text>
                                                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{fmt(c.amount)}</Text>
                                                    </View>
                                                ))}
                                                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>Total compromisos</Text>
                                                    <Text style={{ color: colors.accent, fontWeight: '900', fontSize: 13 }}>{fmt(totalPending)}</Text>
                                                </View>
                                            </View>
                                        )}

                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.bg }]} onPress={() => setBudgetWizardVisible(false)}>
                                                <Text style={{ color: colors.text, fontWeight: '800' }}>Cancelar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.accent, opacity: incomeInput ? 1 : 0.4 }]} onPress={confirmIncome}>
                                                <Text style={{ color: '#FFF', fontWeight: '900' }}>Siguiente →</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* ── STEP 2: Ajustar categorías variables ── */}
                                {wizardStep === 'adjust' && (() => {
                                    const available = confirmedIncome - totalPending;
                                    const allCats = [...DEFAULT_CATEGORIES.map(c => c.name), ...customCategories.map(c => c.name)];
                                    const plannedTotal = allCats.reduce((s, cat) => {
                                        const raw = categoryLimits[cat];
                                        if (!raw) return s;
                                        const v = convertToBase(parseInputToNumber(raw, currency), currency, rates);
                                        return s + (isNaN(v) ? 0 : v);
                                    }, 0);
                                    const plannedOver = plannedTotal > available;
                                    const deficit = confirmedIncome - totalPending - plannedTotal;

                                    return (
                                        <View>
                                            {/* Header card */}
                                            <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 16, marginBottom: 16 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Text style={{ color: colors.sub, fontSize: 12 }}>Ingreso confirmado</Text>
                                                    <Text style={{ color: colors.text, fontWeight: '700' }}>{fmt(confirmedIncome)}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Text style={{ color: colors.sub, fontSize: 12 }}>Compromisos fijos</Text>
                                                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>− {fmt(totalPending)}</Text>
                                                </View>
                                                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Disponible para variables</Text>
                                                    <Text style={{ color: available >= 0 ? colors.accent : '#EF4444', fontWeight: '900' }}>{fmt(available)}</Text>
                                                </View>
                                            </View>

                                            {/* Deficit warning */}
                                            {plannedOver && (
                                                <View style={{ backgroundColor: isDark ? '#450A0A' : '#FFF7ED', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                                                    <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 13, marginBottom: 4 }}>
                                                        ⚠️ Total planeado supera el disponible
                                                    </Text>
                                                    <Text style={{ color: colors.sub, fontSize: 12 }}>
                                                        Necesitas recortar {fmt(Math.abs(deficit))} en alguna categoría.
                                                    </Text>
                                                </View>
                                            )}

                                            <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 12 }}>
                                                TU PROMEDIO vs. SUGERIDO (últimos 3 meses)
                                            </Text>

                                            {allCats.map(cat => {
                                                const avg = historicalAverages[cat] || 0;
                                                const catInfo = DEFAULT_CATEGORIES.find(d => d.name === cat) || customCategories.find(c => c.name === cat);
                                                const val = categoryLimits[cat] || '';
                                                const numVal = convertToBase(parseInputToNumber(val, currency), currency, rates);
                                                const isCut = !isNaN(numVal) && avg > 0 && numVal < avg;
                                                return (
                                                    <View key={cat} style={{ backgroundColor: colors.bg, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                            {catInfo && 'icon' in catInfo && (
                                                                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: (catInfo as any).color + '20', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
                                                                    <MaterialIcons name={(catInfo as any).icon as any} size={14} color={(catInfo as any).color} />
                                                                </View>
                                                            )}
                                                            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{cat}</Text>
                                                            {avg > 0 && <Text style={{ color: colors.sub, fontSize: 11 }}>prom. {fmt(avg)}</Text>}
                                                            {isCut && <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '800', marginLeft: 6 }}>▼ ahorro</Text>}
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: plannedOver && (!isNaN(numVal) && numVal > 0) ? '#EF444440' : colors.border }}>
                                                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginRight: 4 }}>{getCurrencyInfo(currency).symbol}</Text>
                                                            <TextInput
                                                                style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '800', paddingVertical: 10 }}
                                                                value={val}
                                                                onChangeText={t => setCategoryLimits(prev => ({ ...prev, [cat]: formatInputDisplay(t, currency) }))}
                                                                placeholder="0"
                                                                placeholderTextColor={colors.sub + '40'}
                                                                keyboardType="decimal-pad"
                                                            />
                                                        </View>
                                                    </View>
                                                );
                                            })}

                                            {/* Total vs Available */}
                                            <View style={{ backgroundColor: plannedOver ? (isDark ? '#450A0A' : '#FEF2F2') : (isDark ? '#064E3B' : '#ECFDF5'), borderRadius: 14, padding: 14, marginVertical: 12 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Total planeado</Text>
                                                    <Text style={{ color: plannedOver ? '#EF4444' : '#10B981', fontWeight: '900' }}>{fmt(plannedTotal)}</Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                                    <Text style={{ color: colors.sub, fontSize: 12 }}>{plannedOver ? 'Excedido en' : 'Margen libre'}</Text>
                                                    <Text style={{ color: plannedOver ? '#EF4444' : '#10B981', fontSize: 12, fontWeight: '700' }}>{fmt(Math.abs(deficit))}</Text>
                                                </View>
                                            </View>

                                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                                <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.bg }]} onPress={() => setWizardStep('income')}>
                                                    <Text style={{ color: colors.text, fontWeight: '800' }}>← Atrás</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[s.mBtn, { backgroundColor: plannedOver ? '#F59E0B' : colors.accent }]}
                                                    onPress={() => { if (deficit > 0) { setWizardStep('surplus'); } else { applyBudgetWizard(); } }}
                                                >
                                                    <Text style={{ color: '#FFF', fontWeight: '900' }}>{deficit > 0 ? 'Confirmar →' : 'Aplicar ✓'}</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {plannedOver && (
                                                <Text style={{ color: '#F59E0B', fontSize: 11, textAlign: 'center', marginTop: 8, fontWeight: '600' }}>
                                                    Se aplicará con advertencia — revisá las categorías antes de confirmar.
                                                </Text>
                                            )}
                                        </View>
                                    );
                                })()}

                                {/* ── STEP 3: Asignar excedente ── */}
                                {wizardStep === 'surplus' && (() => {
                                    const allCats = [...DEFAULT_CATEGORIES.map(c => c.name), ...customCategories.map(c => c.name)];
                                    const surplusBase = confirmedIncome - totalPending - allCats.reduce((s, cat) => {
                                        const raw = categoryLimits[cat];
                                        if (!raw) return s;
                                        const v = convertToBase(parseInputToNumber(raw, currency), currency, rates);
                                        return s + (isNaN(v) ? 0 : v);
                                    }, 0);
                                    return (
                                        <View>
                                            <View style={{ backgroundColor: colors.bg, borderRadius: 18, padding: 18, marginBottom: 20 }}>
                                                <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 }}>EXCEDENTE LIBERADO ESTE MES</Text>
                                                <Text style={{ color: '#10B981', fontSize: 32, fontWeight: '900', marginBottom: 4 }}>{fmt(Math.max(0, surplusBase))}</Text>
                                                <Text style={{ color: colors.sub, fontSize: 13 }}>¿A dónde lo mandamos?</Text>
                                            </View>

                                            {([
                                                { key: 'savings', label: 'Ahorro', icon: 'savings', color: '#10B981', desc: 'Sumar a tu meta de ahorro mensual' },
                                                { key: 'invest', label: 'Inversión', icon: 'trending-up', color: '#F59E0B', desc: 'Sumar a tu meta de inversión mensual' },
                                                { key: 'split', label: 'Dividir entre ambos', icon: 'call-split', color: '#6366F1', desc: `${fmt(surplusBase / 2)} a Ahorro + ${fmt(surplusBase / 2)} a Inversión` },
                                                { key: 'buffer', label: 'Dejarlo como colchón', icon: 'shield', color: '#64748B', desc: 'Sin meta asignada, queda disponible' },
                                            ] as const).map(opt => (
                                                <TouchableOpacity
                                                    key={opt.key}
                                                    onPress={() => setSurplusAllocation(opt.key)}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: surplusAllocation === opt.key ? opt.color + '20' : colors.bg, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: surplusAllocation === opt.key ? opt.color : 'transparent' }}
                                                >
                                                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: opt.color + '20', justifyContent: 'center', alignItems: 'center' }}>
                                                        <MaterialIcons name={opt.icon as any} size={22} color={opt.color} />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{opt.label}</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12, marginTop: 2 }}>{opt.desc}</Text>
                                                    </View>
                                                    {surplusAllocation === opt.key && <Ionicons name="checkmark-circle" size={22} color={opt.color} />}
                                                </TouchableOpacity>
                                            ))}

                                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                                                <TouchableOpacity style={[s.mBtn, { backgroundColor: colors.bg }]} onPress={() => setWizardStep('adjust')}>
                                                    <Text style={{ color: colors.text, fontWeight: '800' }}>← Atrás</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[s.mBtn, { backgroundColor: colors.accent, opacity: surplusAllocation ? 1 : 0.4 }]}
                                                    onPress={applyBudgetWizard}
                                                >
                                                    <Text style={{ color: '#FFF', fontWeight: '900' }}>Confirmar y Aplicar ✓</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })()}

                            </ScrollView>
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
