import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, convertToBase, formatInputDisplay, parseInputToNumber, getCurrencyInfo } from '@/utils/currency';
import { getLocalISOString, getLocalDateKey } from '@/utils/dateUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import {
    ActivityIndicator,
    Alert,
    Image,
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
import { uploadImage } from '@/utils/storage';
import { scheduleDailyReminder } from '@/utils/notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';

export default function GoalsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden, currency, rates, customAccounts } = useAuth();
    const colors = useThemeColors();
    const isDark = colors.isDark;

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    const [goals, setGoals] = useState<any[]>([]);
    const [totalAhorro, setTotalAhorro] = useState(0);

    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalTarget, setNewGoalTarget] = useState('');
    const [newGoalImage, setNewGoalImage] = useState<string | null>(null);
    const [newGoalPriority, setNewGoalPriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [newGoalInterest, setNewGoalInterest] = useState('');
    const [activeTab, setActiveTab] = useState<'metas' | 'cajitas' | 'retos'>('cajitas');
    const [challenges, setChallenges] = useState<any[]>([]);
    const [newGoalEndDate, setNewGoalEndDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [interestMap, setInterestMap] = useState<Record<string, any>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [breakdownVisible, setBreakdownVisible] = useState(false);

    // ── Emergency Fund / Health Analysis States ──
    const [isEmergencyFund, setIsEmergencyFund] = useState(false);
    const [cajitaType, setCajitaType] = useState<'standard' | 'emergency' | null>(null);
    const [emergencyStep, setEmergencyStep] = useState(1);
    const [wizardIncome, setWizardIncome] = useState('');
    const [wizardExpense, setWizardExpense] = useState('');
    const [wizardDebt, setWizardDebt] = useState('');
    const [isAnalyzingHealth, setIsAnalyzingHealth] = useState(false);
    const [customGoal, setCustomGoal] = useState('');
    const [levelUpModalVisible, setLevelUpModalVisible] = useState(false);
    const [goalForLevelUp, setGoalForLevelUp] = useState<any | null>(null);
    const [newLevelTarget, setNewLevelTarget] = useState('');
    const [newLevelNum, setNewLevelNum] = useState(2);

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');

    const [goalSelectorVisible, setGoalSelectorVisible] = useState(false);
    const [selectorAction, setSelectorAction] = useState<'pay' | 'withdraw'>('pay');
    
    const [optionsModalVisible, setOptionsModalVisible] = useState(false);
    const [goalForOptions, setGoalForOptions] = useState<any | null>(null);

    const openOptions = (goal: any) => {
        setGoalForOptions(goal);
        setOptionsModalVisible(true);
    };
    
    const [withdrawAccountModalVisible, setWithdrawAccountModalVisible] = useState(false);
    const [withdrawAccountAmount, setWithdrawAccountAmount] = useState('');
    const [selectedDestAccount, setSelectedDestAccount] = useState('Efectivo');
    const [selectedSourceAccount, setSelectedSourceAccount] = useState('Efectivo');
    const [accountBalances, setAccountBalances] = useState<Record<string, number>>({});

    const openSelector = (action: 'pay' | 'withdraw') => {
        setSelectorAction(action);
        setGoalSelectorVisible(true);
    };

    const handleSelectGoal = (goal: any) => {
        setSelectedGoal(goal);
        setGoalSelectorVisible(false);
        if (selectorAction === 'pay') setPayModalVisible(true);
        else setWithdrawModalVisible(true);
    };

    const formatInput = (text: string) => {
        return formatInputDisplay(text, currency);
    };

    const roundToCurrency = (val: number) => {
        if (currency === 'COP') {
            return Math.round(val / 50000) * 50000;
        } else if (currency === 'USD' || currency === 'EUR') {
            return Math.round(val / 10) * 10;
        } else if (currency === 'DOP') {
            return Math.round(val / 500) * 500;
        }
        return Math.round(val);
    };

    const getEmergencyFundRecommendation = (expenseVal: number) => {
        // Convert to COP to evaluate low/high expenses threshold
        const expenseCOP = convertToBase(expenseVal, currency, rates);
        
        let recCOP = 1000000;
        if (expenseCOP <= 1000000) {
            recCOP = 500000; // threshold example: 500,000 for low expenses
        } else {
            recCOP = 1000000; // threshold example: 1,000,000 for high expenses
        }

        // Convert back to user currency
        const recUser = convertCurrency(recCOP, currency, rates);
        return roundToCurrency(recUser);
    };

    const analyzeFinancialHealth = async () => {
        if (!user) return;
        setIsAnalyzingHealth(true);
        try {
            const { data: txs } = await supabase.from('transactions').select('amount, type, category, date').eq('user_id', user.id);
            const { data: debtsData } = await supabase.from('debts').select('value, paid, debt_type').eq('user_id', user.id);

            let activeDebts = 0;
            debtsData?.forEach(d => {
                if (d.debt_type !== 'loan' && d.value > d.paid) {
                    activeDebts += (d.value - d.paid);
                }
            });

            // representative monthly values (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            let monthlyIncome = 0;
            let monthlyExpense = 0;

            const recentTxs = txs?.filter(tx => {
                const txDate = new Date(tx.date);
                return txDate >= thirtyDaysAgo;
            }) || [];

            let incomeSum = 0;
            let expenseSum = 0;

            recentTxs.forEach(tx => {
                const amt = Number(tx.amount) || 0;
                if (tx.type === 'income' && tx.category !== 'Transferencia' && tx.category !== 'Ahorro') {
                    incomeSum += amt;
                } else if (tx.type === 'expense' && tx.category !== 'Transferencia' && tx.category !== 'Ahorro') {
                    expenseSum += amt;
                }
            });

            if (incomeSum > 0 || expenseSum > 0) {
                monthlyIncome = incomeSum;
                monthlyExpense = expenseSum;
            } else {
                // If last 30 days is empty, use overall average monthly values
                let overallIncome = 0;
                let overallExpense = 0;
                txs?.forEach(tx => {
                    const amt = Number(tx.amount) || 0;
                    if (tx.type === 'income' && tx.category !== 'Transferencia' && tx.category !== 'Ahorro') {
                        overallIncome += amt;
                    } else if (tx.type === 'expense' && tx.category !== 'Transferencia' && tx.category !== 'Ahorro') {
                        overallExpense += amt;
                    }
                });
                monthlyIncome = overallIncome || 2000000;
                monthlyExpense = overallExpense || 800000;
            }

            // Convert base values (COP) to user currency for display & editing
            const convertedIncome = convertCurrency(monthlyIncome, currency, rates);
            const convertedExpense = convertCurrency(monthlyExpense, currency, rates);
            const convertedDebts = convertCurrency(activeDebts, currency, rates);

            setWizardIncome(formatInput(convertedIncome.toString()));
            setWizardExpense(formatInput(convertedExpense.toString()));
            setWizardDebt(formatInput(convertedDebts.toString()));
            
            const rec = getEmergencyFundRecommendation(convertedExpense);
            setCustomGoal(formatInput(rec.toString()));
        } catch (e) {
            console.error("Error analyzing health:", e);
            const defInc = convertCurrency(2000000, currency, rates);
            const defExp = convertCurrency(800000, currency, rates);
            setWizardIncome(formatInput(defInc.toString()));
            setWizardExpense(formatInput(defExp.toString()));
            setWizardDebt("0");
            const rec = getEmergencyFundRecommendation(defExp);
            setCustomGoal(formatInput(rec.toString()));
        } finally {
            setIsAnalyzingHealth(false);
        }
    };

     useEffect(() => { if (isFocused) loadData(); }, [isFocused]);

    useEffect(() => {
        if (addModalVisible) {
            setIsEmergencyFund(false);
            setCajitaType(null);
            setEmergencyStep(1);
            setNewGoalName('');
            setNewGoalTarget('');
            setNewGoalImage(null);
            setNewGoalInterest('');
            setCustomGoal('');
        }
    }, [addModalVisible]);

    const loadData = async () => {
        if (!user) return;
        try {
            const stored = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id));
            const iMap = stored ? JSON.parse(stored) : {};
            setInterestMap(iMap);

            const { data: rawGoalsData } = await supabase.from('goals').select('*').eq('user_id', user.id).order('id', { ascending: false });
            
            const goalsData = await applyDailyInterests(rawGoalsData || [], iMap);
            setGoals(goalsData);
            
            const { data: txData } = await supabase.from('transactions').select('amount, type, account, category').eq('user_id', user.id);
            let totalAh = 0;
            let balances: Record<string, number> = {};
            txData?.forEach(tx => {
                if (tx.category === 'Ahorro') {
                    if (tx.type === 'expense') totalAh += tx.amount;
                    else if (tx.type === 'income') {
                        if (tx.account === 'Ahorro') totalAh += tx.amount; // Intereses
                        else totalAh -= tx.amount; // Retiro a cuenta
                    }
                } else {
                    const acc = tx.account || 'Efectivo';
                    if (!balances[acc]) balances[acc] = 0;
                    if (tx.type === 'income') balances[acc] += tx.amount;
                    else if (tx.type === 'expense') balances[acc] -= tx.amount;
                }
            });
            setTotalAhorro(totalAh);
            setAccountBalances(balances);

            // Cargar Retos desde Supabase o Local (Aquí usamos Supabase para consistencia si existe la tabla)
            try {
                const { data: challengesData } = await supabase.from('saving_challenges').select('*').eq('user_id', user.id).order('id', { ascending: false });
                if (challengesData) setChallenges(challengesData);
            } catch (e) {
                console.log("Tabla saving_challenges no encontrada en Supabase - omitiendo sync.");
            }
        } catch (e) { console.error(e); }
    };

    // Lock para evitar ejecuciones concurrentes de intereses
    const isApplyingInterestRef = React.useRef(false);

    const applyDailyInterests = async (goalsData: any[], currentMap?: any) => {
        if (!user) return goalsData;
        // Evitar ejecuciones simultáneas
        if (isApplyingInterestRef.current) return goalsData;
        isApplyingInterestRef.current = true;
        
        try {
            const interestData = currentMap || (JSON.parse(await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id)) || '{}'));
            if (!interestData || Object.keys(interestData).length === 0) {
                isApplyingInterestRef.current = false;
                return goalsData;
            }
            
            let updatedAny = false;
            let newTotalInterest = 0;
            const today = getLocalDateKey();

            // Verificar en la BD si ya se generaron rendimientos hoy
            const { data: existingInterest } = await supabase
                .from('transactions')
                .select('id')
                .eq('user_id', user.id)
                .eq('category', 'Ahorro')
                .like('description', 'Rendimientos cajita:%')
                .gte('date', `${today}T00:00:00`)
                .lte('date', `${today}T23:59:59`)
                .limit(1);

            if (existingInterest && existingInterest.length > 0) {
                // Ya se aplicaron intereses hoy, solo actualizar last_updated
                for (const goal of goalsData) {
                    const info = interestData[goal.id];
                    if (info && info.rate > 0) {
                        const lastUpdated = info.last_updated || '';
                        if (lastUpdated !== today) {
                            info.last_updated = today;
                            updatedAny = true;
                        }
                    }
                }
                if (updatedAny) {
                    setInterestMap(interestData);
                    await AsyncStorage.setItem(SYNC_KEYS.GOALS_INTEREST(user.id), JSON.stringify(interestData));
                }
                isApplyingInterestRef.current = false;
                return goalsData;
            }

            for (const goal of goalsData) {
                const info = interestData[goal.id];
                if (info && info.rate > 0) {
                    const lastUpdated = info.last_updated || today;
                    // Normalizar la fecha de last_updated (quitar Z si existe)
                    const cleanLastUpdated = lastUpdated.split('T')[0];
                    
                    if (cleanLastUpdated !== today) {
                        const daysDiff = Math.floor((new Date(today + 'T12:00:00').getTime() - new Date(cleanLastUpdated + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24));
                        if (daysDiff > 0 && goal.current_amount > 0) {
                            const dailyRate = (info.rate / 100) / 365;
                            const newAmount = goal.current_amount * Math.pow(1 + dailyRate, daysDiff);
                            const interest = newAmount - goal.current_amount;
                            if (interest > 0) {
                                await supabase.from('goals').update({ current_amount: goal.current_amount + interest }).eq('id', goal.id);
                                await supabase.from('transactions').insert([{
                                    user_id: user.id,
                                    amount: interest,
                                    type: 'income',
                                    category: 'Ahorro',
                                    description: `Rendimientos cajita: ${goal.name}`,
                                    account: 'Ahorro',
                                    date: getLocalISOString()
                                }]);
                                goal.current_amount += interest;
                                info.last_updated = today;
                                info.last_earned = interest;
                                info.total_earned = (info.total_earned || 0) + interest;
                                updatedAny = true;
                                newTotalInterest += interest;
                            }
                        } else if (daysDiff > 0) {
                            info.last_updated = today;
                            updatedAny = true;
                        }
                    }
                }
            }
            if (updatedAny) {
                setInterestMap(interestData);
                await AsyncStorage.setItem(SYNC_KEYS.GOALS_INTEREST(user.id), JSON.stringify(interestData));
                if (newTotalInterest > 0) {
                    Alert.alert('Rendimientos Generados', `Tus cajitas han generado ${fmt(newTotalInterest)} en intereses. 💸`);
                }
            } else if (!currentMap) {
                setInterestMap(interestData);
            }
            isApplyingInterestRef.current = false;
            return goalsData;
        } catch(e) {
            console.error('Error aplicando intereses:', e);
            isApplyingInterestRef.current = false;
            return goalsData;
        }
    };

    const metas = goals.filter(g => !interestMap[g.id]);
    const cajitas = goals.filter(g => !!interestMap[g.id]);

    const totalMetas = metas.reduce((sum, g) => sum + g.current_amount, 0);
    const totalCajitas = cajitas.reduce((sum, g) => sum + g.current_amount, 0);
    const totalEarnings = cajitas.reduce((sum, g) => sum + (interestMap[g.id]?.total_earned || 0), 0);

    const assignedAhorro = goals.reduce((sum, g) => sum + g.current_amount, 0);
    const availableAhorro = Math.max(0, totalAhorro - assignedAhorro);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8 });
        if (!result.canceled) setNewGoalImage(result.assets[0].uri);
    };

    const generateChallengeAmounts = (target: number, days: number) => {
        // Generar una progresión aritmética que sume al target
        // Sum = n/2 * (2a + (n-1)d)
        // Fijamos a = target / (days * 2) (empezar con la mitad del promedio)
        const n = days;
        const a = Math.floor(target / (n * 2));
        // d = (2 * Sum / n - 2a) / (n - 1)
        const d = Math.floor((2 * target / n - 2 * a) / (n - 1));
        
        let amounts = [];
        let currentSum = 0;
        for (let i = 0; i < n - 1; i++) {
            const val = a + i * d;
            amounts.push(val);
            currentSum += val;
        }
        amounts.push(target - currentSum); // El último ajusta el total
        return amounts;
    };

    const handleCreateGoal = async () => {
        let val = 1000000000; // Target muy alto para cajitas por defecto
        if (activeTab === 'metas' || activeTab === 'retos') {
            const typedVal = parseInputToNumber(newGoalTarget, currency);
            val = convertToBase(typedVal, currency, rates);
            if (isNaN(val) || val <= 0) return;
        } else if (activeTab === 'cajitas' && isEmergencyFund) {
            const typedVal = parseInputToNumber(customGoal, currency);
            val = convertToBase(typedVal, currency, rates);
            if (isNaN(val) || val <= 0) return;
        }
        
        const goalName = activeTab === 'cajitas' && isEmergencyFund 
            ? (newGoalName.trim() || 'Fondo de Emergencia') 
            : newGoalName.trim();

        if (!goalName && !isProcessing) return;
        setIsProcessing(true);
        try {
            if (activeTab === 'retos') {
                const today = new Date();
                today.setHours(0,0,0,0);
                const end = new Date(newGoalEndDate);
                end.setHours(0,0,0,0);
                
                const diffTime = end.getTime() - today.getTime();
                const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                
                const amounts = generateChallengeAmounts(val, days);
                const startDate = getLocalDateKey();
                
                const { data: newChallenge, error } = await supabase.from('saving_challenges').insert([{
                    user_id: user?.id,
                    name: goalName,
                    target_amount: val,
                    current_amount: 0,
                    start_date: startDate,
                    end_date: end.toISOString().split('T')[0],
                    daily_amounts: JSON.stringify(amounts),
                    completed_indices: JSON.stringify([]),
                    current_streak: 0,
                    last_payment_date: null,
                    created_at: getLocalISOString()
                }]).select();

                if (error) {
                    console.error("Supabase insert error:", error);
                    throw new Error(error.message || "Error al guardar en la nube. Revisa tu conexión.");
                }

                // Agendar notificación diaria para el reto
                if (Platform.OS !== 'web') {
                    await scheduleDailyReminder(8, 0, `🎯 Reto: ${goalName}`, `Hoy te toca ahorrar un valor de tu plan. ¡No te rindas!`);
                }

                setNewGoalName(''); setNewGoalTarget(''); setNewGoalEndDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); setAddModalVisible(false);
                loadData();
                return;
            }

            let finalImageUri = newGoalImage;
            
            // Subir a la nube si hay una imagen seleccionada
            if (newGoalImage && (newGoalImage.startsWith('file:') || newGoalImage.startsWith('blob:') || newGoalImage.startsWith('content:'))) {
                const fileName = `goal_${Date.now()}.jpg`;
                const uploadedUrl = await uploadImage(newGoalImage, 'savings_goals', `${user?.id}/${fileName}`);
                if (uploadedUrl) {
                    finalImageUri = uploadedUrl;
                }
            }

            const { data: newGoalData, error } = await supabase.from('goals').insert([{ 
                user_id: user?.id, 
                name: goalName, 
                target_amount: val, 
                current_amount: 0, 
                image_uri: finalImageUri,
                priority: newGoalPriority
            }]).select();
            
            if (error) throw error;

            if (newGoalData && newGoalData[0]) {
                const interestRateText = newGoalInterest || '10'; // default to 10% if empty
                const interestRate = parseFloat(interestRateText.replace(',', '.'));
                
                const saved = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id!));
                const interestData = saved ? JSON.parse(saved) : {};
                
                if (activeTab === 'cajitas' && isEmergencyFund) {
                    // Save rich emergency fund metadata
                    interestData[newGoalData[0].id] = { 
                        rate: !isNaN(interestRate) ? interestRate : 10, 
                        last_updated: getLocalDateKey(),
                        is_emergency_fund: true,
                        emergency_level: 1,
                        base_expenses: convertToBase(parseInputToNumber(wizardExpense, currency), currency, rates),
                        debts_amount: convertToBase(parseInputToNumber(wizardDebt, currency), currency, rates),
                        incomes_amount: convertToBase(parseInputToNumber(wizardIncome, currency), currency, rates),
                        recommended_amount: convertToBase(getEmergencyFundRecommendation(parseInputToNumber(wizardExpense, currency)), currency, rates)
                    };
                } else if (activeTab === 'cajitas') {
                    interestData[newGoalData[0].id] = { rate: !isNaN(interestRate) ? interestRate : 0, last_updated: getLocalDateKey() };
                }
                
                await AsyncStorage.setItem(SYNC_KEYS.GOALS_INTEREST(user.id!), JSON.stringify(interestData));
                await syncUp(user.id!);
            }
            
            setNewGoalName(''); setNewGoalTarget(''); setNewGoalImage(null); setNewGoalInterest(''); setAddModalVisible(false);
            loadData();
        } catch (e: any) { 
            console.error('Error al crear meta/cajita:', e); 
            const msg = e.message || 'Error al crear. Verifica tu conexión.';
            if (Platform.OS === 'web') window.alert('Error: ' + msg);
            else Alert.alert('Error', msg);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddMoney = async () => {
        if (!selectedGoal) return;
        const typedVal = parseInputToNumber(payAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0) return;
        
        const availableInAccount = accountBalances[selectedSourceAccount] || 0;
        if (val > availableInAccount) {
            Alert.alert('Saldo insuficiente', 'No tienes suficiente dinero en la cuenta seleccionada.');
            return;
        }
        
        const remainingNeeded = selectedGoal.target_amount - selectedGoal.current_amount;
        const actualAddition = Math.min(val, remainingNeeded);
        try {
            setIsProcessing(true);
            
            const { error } = await supabase.from('transactions').insert([{
                user_id: user?.id,
                type: 'expense',
                amount: actualAddition,
                description: `Aporte a ${activeTab === 'metas' ? 'meta' : 'cajita'}: ${selectedGoal.name}`,
                category: 'Ahorro',
                account: selectedSourceAccount,
                date: getLocalISOString()
            }]);
            if (error) throw error;

            await supabase.from('goals').update({ current_amount: selectedGoal.current_amount + actualAddition }).eq('id', selectedGoal.id);
            setPayAmount(''); setPayModalVisible(false); loadData();
        } catch (e: any) { 
            console.error(e);
            Alert.alert('Error', e?.message || 'No se pudo procesar el aporte.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleWithdrawMoney = async () => {
        if (!selectedGoal) return;
        const typedVal = parseInputToNumber(withdrawAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0 || val > selectedGoal.current_amount) return;
        try {
            setIsProcessing(true);
            
            const { error } = await supabase.from('transactions').insert([{
                user_id: user?.id,
                type: 'income',
                amount: val,
                description: `Retiro de ${activeTab === 'metas' ? 'meta' : 'cajita'}: ${selectedGoal.name}`,
                category: 'Ahorro',
                account: selectedDestAccount,
                date: getLocalISOString()
            }]);
            if (error) throw error;

            await supabase.from('goals').update({ current_amount: selectedGoal.current_amount - val }).eq('id', selectedGoal.id);
            setWithdrawAmount(''); setWithdrawModalVisible(false); loadData();
        } catch (e: any) { 
            console.error(e);
            Alert.alert('Error', e?.message || 'No se pudo procesar el retiro.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleWithdrawToAccount = async () => {
        const typedVal = parseInputToNumber(withdrawAccountAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0 || val > availableAhorro || isProcessing) return;
        
        setIsProcessing(true);
        try {
            const { error } = await supabase.from('transactions').insert([{
                user_id: user?.id,
                type: 'income',
                amount: val,
                description: 'Retiro de ahorros',
                category: 'Ahorro',
                account: selectedDestAccount,
                date: getLocalISOString()
            }]);
            
            if (error) throw error;
            
            setWithdrawAccountAmount('');
            setWithdrawAccountModalVisible(false);
            loadData();
            Alert.alert('Éxito', `Se han retirado ${fmt(val)} a ${selectedDestAccount}.`);
        } catch (error: any) {
            console.error(error);
            Alert.alert('Error', error.message || 'Error al crear meta. Verifica tu conexión.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDistributeSavings = async () => {
        if (availableAhorro <= 0 || goals.length === 0 || isProcessing) {
            if (!isProcessing) Alert.alert('Sanctuary', 'No hay ahorros disponibles para distribuir.');
            return;
        }
        
        setIsProcessing(true);

        const unfinishedGoals = goals.filter(g => g.current_amount < g.target_amount);
        if (unfinishedGoals.length === 0) {
            Alert.alert('Sanctuary', '¡Ya todas tus metas están cumplidas! 🎉');
            setIsProcessing(false);
            return;
        }

        const priorityWeights = { 'high': 3, 'medium': 2, 'low': 1 };
        const totalWeight = unfinishedGoals.reduce((sum, g) => sum + (priorityWeights[g.priority as keyof typeof priorityWeights] || 1), 0);
        
        try {
            const updates = unfinishedGoals.map(async (goal) => {
                const weight = priorityWeights[goal.priority as keyof typeof priorityWeights] || 1;
                const share = (weight / totalWeight) * availableAhorro;
                const needed = goal.target_amount - goal.current_amount;
                const finalAdd = Math.min(share, needed);
                
                if (finalAdd > 0) {
                    return supabase.from('goals').update({ current_amount: goal.current_amount + finalAdd }).eq('id', goal.id);
                }
            });

            await Promise.all(updates);
            Alert.alert('Sanctuary', 'Se han distribuido tus ahorros de forma inteligente por prioridad.');
            loadData();
        } catch (e) {
            console.error('Error al distribuir ahorros:', e);
            Alert.alert('Error', 'No se pudieron distribuir los ahorros.');
        } finally {
            setIsProcessing(false);
        }
    };



    const handleDelete = (goal: any) => {
        const msg = `¿Eliminar "${goal.name}"? Los fondos volverán al Ahorro Disponible.`;
        if (Platform.OS === 'web') {
            if (window.confirm(msg)) {
                supabase.from('goals').delete().eq('id', goal.id).then(() => loadData());
            }
            return;
        }
        Alert.alert('Eliminar meta', msg, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: () => supabase.from('goals').delete().eq('id', goal.id).then(() => loadData()) }
        ]);
    };

    // ── Level Up: escalado de meta del Fondo de Emergencia ──
    const handleLevelUp = async () => {
        if (!goalForLevelUp || !user) return;
        const typedVal = parseInputToNumber(newLevelTarget, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0) return;
        setIsProcessing(true);
        try {
            await supabase.from('goals').update({ target_amount: val }).eq('id', goalForLevelUp.id);
            const saved = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id!));
            const iData = saved ? JSON.parse(saved) : {};
            if (iData[goalForLevelUp.id]) {
                iData[goalForLevelUp.id].emergency_level = newLevelNum;
            }
            await AsyncStorage.setItem(SYNC_KEYS.GOALS_INTEREST(user.id!), JSON.stringify(iData));
            await syncUp(user.id!);
            setLevelUpModalVisible(false);
            setGoalForLevelUp(null);
            loadData();
            Alert.alert(
                '¡Nivel Subido! 🚀',
                `Tu Fondo de Emergencia ha escalado al Nivel ${newLevelNum}. ¡Sigue protegiendo tu futuro financiero!`
            );
        } catch (e: any) {
            Alert.alert('Error', e.message || 'No se pudo actualizar el nivel.');
        } finally {
            setIsProcessing(false);
        }
    };

    // const fmt = (n: number) => isHidden ? '****' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Ahorros</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(true)} style={[styles.circleBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="add" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                {/* TAB SELECTOR - NOW AT TOP */}
                <View style={{ paddingHorizontal: 0, marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', borderRadius: 20, padding: 6, backgroundColor: colors.card }}>
                        <TouchableOpacity onPress={() => setActiveTab('cajitas')} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: activeTab === 'cajitas' ? colors.accent : 'transparent' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === 'cajitas' ? '#FFF' : colors.sub }}>Cajitas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setActiveTab('metas')} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: activeTab === 'metas' ? colors.accent : 'transparent' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === 'metas' ? '#FFF' : colors.sub }}>Metas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setActiveTab('retos')} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: activeTab === 'retos' ? colors.accent : 'transparent' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: activeTab === 'retos' ? '#FFF' : colors.sub }}>Retos</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Headers ── */}
                {activeTab === 'cajitas' && (
                    <View style={{ marginBottom: 30, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 32, fontWeight: '900', color: colors.text }}>Mis Cajitas</Text>
                        <Text style={{ color: colors.sub, fontSize: 14, fontWeight: '600', marginTop: 4 }}>
                            Ahorra libremente y genera rendimientos diarios.
                        </Text>
                        <View style={{ marginTop: 16, backgroundColor: colors.accent + '15', padding: 16, borderRadius: 20 }}>
                            <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '800' }}>TOTAL AHORRADO EN CAJITAS</Text>
                            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 4 }}>{fmt(totalCajitas)}</Text>
                            {totalEarnings > 0 && (
                                <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800', marginTop: 4 }}>
                                    +{fmt(totalEarnings)} en intereses generados
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {activeTab === 'metas' && (
                    <View style={{ marginBottom: 30, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 32, fontWeight: '900', color: colors.text }}>Mis Metas</Text>
                        <Text style={{ color: colors.sub, fontSize: 14, fontWeight: '600', marginTop: 4 }}>
                            Dales un nombre y persigue tus sueños.
                        </Text>
                        <View style={{ marginTop: 16, backgroundColor: colors.accent + '15', padding: 16, borderRadius: 20 }}>
                            <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '800' }}>TOTAL AHORRADO EN METAS</Text>
                            <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 4 }}>{fmt(totalMetas)}</Text>
                        </View>
                    </View>
                )}

                {activeTab === 'retos' && (
                    <View style={{ marginBottom: 30, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: 32, fontWeight: '900', color: colors.text }}>Mis Retos</Text>
                        <Text style={{ color: colors.sub, fontSize: 14, fontWeight: '600', marginTop: 4 }}>
                            Alcanza tus objetivos paso a paso
                        </Text>
                    </View>
                )}

                {/* ── Lista de Metas/Cajitas ── */}
                {(activeTab === 'metas' || activeTab === 'cajitas') && (
                    goals.filter(g => activeTab === 'cajitas' ? !!interestMap[g.id] : !interestMap[g.id]).length === 0 ? (
                        <View style={styles.empty}>
                            <Ionicons name="leaf-outline" size={80} color={colors.accent + '40'} />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>Siembra tus sueños</Text>
                            <Text style={[styles.emptySub, { color: colors.sub }]}>
                                {activeTab === 'metas' ? 'Crea una meta y comienza a asignar tus ahorros.' : 'Crea una cajita para ganar intereses diarios.'}
                            </Text>
                        </View>
                    ) : (
                        goals.filter(g => activeTab === 'cajitas' ? !!interestMap[g.id] : !interestMap[g.id]).map(goal => {
                            const pct = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                            const isDone = pct >= 100;
                            const isEF = activeTab === 'cajitas' && interestMap[goal.id]?.is_emergency_fund;
                            const efLevel = interestMap[goal.id]?.emergency_level || 1;

                            // ── Premium Emergency Fund Card ──
                            if (isEF) {
                                const gradientsByLevel: [string, string, string][] = [
                                    ['#1A237E', '#1565C0', '#0D47A1'],
                                    ['#4A148C', '#7B1FA2', '#6A1B9A'],
                                    ['#B71C1C', '#C62828', '#BF360C'],
                                ];
                                const [gc1, gc2] = gradientsByLevel[Math.min(efLevel - 1, 2)];
                                const levelLabels = ['Escudo Inicial', 'Tranquilidad', 'Blindaje Total'];
                                const levelShields = ['🛡️', '🛡️🛡️', '🛡️🛡️🛡️'];
                                const nextLevelGrad = gradientsByLevel[Math.min(efLevel, 2)];

                                return (
                                    <TouchableOpacity
                                        key={goal.id}
                                        style={[styles.goalCard, { overflow: 'hidden' }]}
                                        onPress={() => openOptions(goal)}
                                        onLongPress={() => handleDelete(goal)}
                                        activeOpacity={0.92}
                                    >
                                        <LinearGradient
                                            colors={[gc1, gc2]}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={{ padding: 22 }}
                                        >
                                            {/* Header row */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                                                <View style={{ flex: 1, marginRight: 12 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                        <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                                                            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>NIVEL {efLevel}</Text>
                                                        </View>
                                                        <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                                                            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '800' }}>{interestMap[goal.id]?.rate}% E.A.</Text>
                                                        </View>
                                                    </View>
                                                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '900', lineHeight: 22 }} numberOfLines={1}>
                                                        {goal.name}
                                                    </Text>
                                                    <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', marginTop: 3 }}>
                                                        {levelLabels[Math.min(efLevel - 1, 2)]} {levelShields[Math.min(efLevel - 1, 2)]}
                                                    </Text>
                                                </View>
                                                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                                                    <Ionicons name="shield-checkmark" size={30} color="#FFF" />
                                                </View>
                                            </View>

                                            {/* Amount */}
                                            <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 }}>
                                                {fmt(goal.current_amount)}
                                            </Text>
                                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', marginTop: 2, marginBottom: 14 }}>
                                                de {fmt(goal.target_amount)} objetivo
                                            </Text>

                                            {/* Progress bar */}
                                            <View style={{ height: 7, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                                                <View style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: '#FFF', borderRadius: 4 }} />
                                            </View>

                                            {/* Footer row */}
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800' }}>
                                                    {Math.round(pct)}% completado
                                                </Text>
                                                {isDone ? (
                                                    <View style={{ backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>
                                                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>META ALCANZADA ✅</Text>
                                                    </View>
                                                ) : interestMap[goal.id]?.last_earned > 0 ? (
                                                    <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                                        <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '800' }}>+{fmt(interestMap[goal.id].last_earned)} hoy</Text>
                                                    </View>
                                                ) : null}
                                            </View>

                                            {/* Level Up button */}
                                            {isDone && efLevel < 3 && (
                                                <TouchableOpacity
                                                    style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 13, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}
                                                    onPress={() => {
                                                        setGoalForLevelUp(goal);
                                                        const nextLvl = efLevel + 1;
                                                        setNewLevelNum(nextLvl);
                                                        const expCOP = interestMap[goal.id]?.base_expenses || 800000;
                                                        const debtCOP = interestMap[goal.id]?.debts_amount || 0;
                                                        const expUser = convertCurrency(expCOP, currency, rates);
                                                        const debtUser = convertCurrency(debtCOP, currency, rates);
                                                        let nextTarget = 0;
                                                        if (nextLvl === 2) nextTarget = roundToCurrency(3 * expUser + debtUser);
                                                        else if (nextLvl === 3) nextTarget = roundToCurrency(6 * expUser + debtUser);
                                                        setNewLevelTarget(formatInput(nextTarget.toString()));
                                                        setLevelUpModalVisible(true);
                                                    }}
                                                >
                                                    <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '900' }}>Subir al Nivel {efLevel + 1} 🚀</Text>
                                                </TouchableOpacity>
                                            )}
                                            {isDone && efLevel >= 3 && (
                                                <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 13, borderRadius: 16, alignItems: 'center' }}>
                                                    <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900' }}>¡Blindaje Máximo Alcanzado! 🏆</Text>
                                                </View>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                );
                            }

                            // ── Cajita / Meta Card Estándar ──
                            return (
                                <TouchableOpacity 
                                    key={goal.id} 
                                    style={[styles.goalCard, { backgroundColor: colors.card }]}
                                    onPress={() => openOptions(goal)}
                                    onLongPress={() => handleDelete(goal)}
                                    activeOpacity={0.9}
                                >
                                    {activeTab === 'metas' && (
                                        <View style={styles.goalImgCont}>
                                            {goal.image_uri ? (
                                                <Image source={{ uri: goal.image_uri }} style={styles.goalImg} />
                                            ) : (
                                                <View style={[styles.goalImgPlaceholder, { backgroundColor: colors.bg }]}>
                                                    <Ionicons name="golf-outline" size={32} color={colors.accent + '60'} />
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {activeTab === 'cajitas' && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingBottom: 0 }}>
                                            <View style={[styles.iconBox, { backgroundColor: colors.accent + '15', width: 44, height: 44 }]}>
                                                <MaterialIcons name="account-balance" size={24} color={colors.accent} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.goalName, { color: colors.text, marginBottom: 0 }]} numberOfLines={1}>
                                                    {goal.name}
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <MaterialIcons name="trending-up" size={12} color="#10B981" />
                                                    <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '800' }}>{interestMap[goal.id]?.rate}% E.A.</Text>
                                                </View>
                                            </View>
                                        </View>
                                    )}

                                    <View style={[styles.goalBody, { paddingRight: 20, paddingTop: activeTab === 'cajitas' ? 12 : 16, paddingBottom: 20 }]}>
                                        {activeTab === 'metas' && (
                                            <>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                                                    <Text style={[styles.goalName, { color: colors.text, marginBottom: 0, flex: 1 }]} numberOfLines={1}>
                                                        {goal.name}
                                                    </Text>
                                                    <View style={[styles.prioBadge, { backgroundColor: goal.priority === 'high' ? '#EF444420' : goal.priority === 'medium' ? '#F59E0B20' : '#10B98120' }]}>
                                                        <Text style={[styles.prioBadgeText, { color: goal.priority === 'high' ? '#EF4444' : goal.priority === 'medium' ? '#F59E0B' : '#10B981' }]}>
                                                            {goal.priority === 'high' ? 'ALTA' : goal.priority === 'medium' ? 'MEDIA' : 'BAJA'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <View style={styles.goalStats}>
                                                    <View style={styles.goalProgressBg}>
                                                        <View style={[styles.goalProgressFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
                                                    </View>
                                                    <Text style={[styles.goalPct, { color: colors.accent }]}>{Math.round(pct)}%</Text>
                                                </View>
                                            </>
                                        )}

                                        <View style={styles.goalAmounts}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.amtLabel, { color: colors.sub }]}>
                                                    {activeTab === 'cajitas' ? 'SALDO TOTAL' : 'VALOR ASIGNADO'}
                                                </Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <Text style={[styles.amtVal, { color: colors.text, fontSize: activeTab === 'cajitas' ? 26 : 20, fontWeight: '900' }]}>
                                                        {fmt(goal.current_amount)}
                                                    </Text>
                                                    {activeTab === 'cajitas' && (interestMap[goal.id]?.last_earned > 0) && (
                                                        <View style={{ backgroundColor: '#10B98115', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '900' }}>+{fmt(interestMap[goal.id].last_earned)}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                {activeTab === 'cajitas' && (interestMap[goal.id]?.total_earned > 0) && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                                        <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '700' }}>Rendimientos totales:</Text>
                                                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '900' }}>+{fmt(interestMap[goal.id].total_earned)}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {activeTab === 'metas' && (
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={[styles.amtLabel, { color: colors.sub }]}>OBJETIVO</Text>
                                                    <Text style={[styles.amtVal, { color: colors.text }]}>{fmt(goal.target_amount)}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )
                )}

                {/* ── Retos de Ahorro ── */}
                {activeTab === 'retos' && (
                    <View style={{ gap: 16 }}>
                        {challenges.length === 0 ? (
                            <View style={styles.empty}>
                                <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.accent + '10', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
                                    <Ionicons name="trophy" size={60} color={colors.accent} />
                                </View>
                                <Text style={[styles.emptyTitle, { color: colors.text }]}>¿Listo para un desafío?</Text>
                                <Text style={[styles.emptySub, { color: colors.sub }]}>
                                    Crea un plan de ahorro con fecha límite y te diremos cuánto guardar cada día para lograrlo.
                                </Text>
                                <TouchableOpacity 
                                    style={[styles.mPrimaryBtn, { backgroundColor: colors.accent, marginTop: 32, paddingHorizontal: 40 }]}
                                    onPress={() => setAddModalVisible(true)}
                                >
                                    <Text style={styles.mPrimaryBtnTxt}>Empezar Nuevo Reto</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            challenges.map(challenge => {
                                const parseData = (val: any) => {
                                    if (!val) return [];
                                    if (typeof val === 'string') {
                                        try { return JSON.parse(val); } catch(e) { return []; }
                                    }
                                    return val;
                                };
                                const dailyAmounts = parseData(challenge.daily_amounts);
                                const completedIndices = parseData(challenge.completed_indices);
                                const totalDays = dailyAmounts.length || 1;
                                const pct = Math.min(100, (completedIndices.length / totalDays) * 100);
                                
                                return (
                                    <TouchableOpacity 
                                        key={challenge.id} 
                                        style={[styles.goalCard, { backgroundColor: colors.card, overflow: 'hidden' }]}
                                        onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } } as any)}
                                        activeOpacity={0.9}
                                    >
                                        <LinearGradient colors={[colors.accent, colors.accent + 'CC']} start={{x:0, y:0}} end={{x:1, y:0}} style={{ height: 4, width: '100%' }} />
                                        <View style={{ padding: 20 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <View>
                                                    <Text style={[styles.goalName, { color: colors.text, marginBottom: 2 }]}>{challenge.name}</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>{dailyAmounts.length} días de reto</Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: colors.accent, fontSize: 18, fontWeight: '900' }}>{Math.round(pct)}%</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '800' }}>COMPLETADO</Text>
                                                </View>
                                            </View>
                                            
                                            <View style={[styles.goalProgressBg, { height: 8, marginBottom: 16 }]}>
                                                <View style={[styles.goalProgressFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
                                            </View>
                                            
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <View>
                                                    <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '800' }}>RECAUDADO</Text>
                                                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{fmt(challenge.current_amount)}</Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '800' }}>OBJETIVO</Text>
                                                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{fmt(challenge.target_amount)}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            <Modal visible={addModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setAddModalVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                        <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                            <View style={styles.modalHeaderInner}>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>
                                    {activeTab === 'metas' ? 'Nueva Meta' : activeTab === 'cajitas' ? 'Nueva Cajita' : 'Nuevo Reto'}
                                </Text>
                                <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>
                            {activeTab === 'metas' && (
                                <View>
                                    <TouchableOpacity style={[styles.imgPick, { backgroundColor: colors.bg }]} onPress={pickImage}>
                                        {newGoalImage ? <Image source={{ uri: newGoalImage }} style={styles.imgPrev} /> : (
                                            <View style={{ alignItems: 'center' }}>
                                                <Ionicons name="camera" size={32} color={colors.accent} />
                                                <Text style={{ color: colors.sub, fontSize: 12, marginTop: 8 }}>Elegir foto inspiradora</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>

                                    <View style={styles.mInputCont}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE</Text>
                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                            placeholder="Ej. Mi primer auto" placeholderTextColor={colors.sub + '80'}
                                            value={newGoalName} onChangeText={setNewGoalName} />
                                    </View>

                                    <View style={styles.mInputCont}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>MONTO OBJETIVO</Text>
                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                            placeholder="$ 0" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                            value={newGoalTarget} onChangeText={t => setNewGoalTarget(formatInput(t))} />
                                    </View>

                                    <View style={styles.mInputCont}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>PRIORIDAD</Text>
                                        <View style={styles.priorityRow}>
                                            {[
                                                { id: 'low', label: 'Baja', c: '#8B8680' },
                                                { id: 'medium', label: 'Media', c: '#F59E0B' },
                                                { id: 'high', label: 'Alta', c: '#EF4444' }
                                            ].map(p => (
                                                <TouchableOpacity 
                                                    key={p.id}
                                                    style={[styles.prioItem, { borderColor: p.c }, newGoalPriority === p.id && { backgroundColor: p.c }]}
                                                    onPress={() => setNewGoalPriority(p.id as any)}
                                                >
                                                    <Text style={[styles.prioText, { color: p.c }, newGoalPriority === p.id && { color: '#FFF' }]}>{p.label}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <TouchableOpacity 
                                        style={[styles.mPrimaryBtn, { backgroundColor: colors.accent }, isProcessing && { opacity: 0.6 }]} 
                                        onPress={handleCreateGoal}
                                        disabled={isProcessing}
                                    >
                                        <Text style={styles.mPrimaryBtnTxt}>
                                            {isProcessing ? 'Guardando...' : 'Comenzar a ahorrar'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {activeTab === 'retos' && (
                                <View>
                                    <View style={styles.mInputCont}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE</Text>
                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                            placeholder="Ej. Reto 30 días" placeholderTextColor={colors.sub + '80'}
                                            value={newGoalName} onChangeText={setNewGoalName} />
                                    </View>

                                    <View style={styles.mInputCont}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>MONTO OBJETIVO</Text>
                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                            placeholder="$ 0" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                            value={newGoalTarget} onChangeText={t => setNewGoalTarget(formatInput(t))} />
                                    </View>

                                    <View style={styles.mInputCont}>
                                        <Text style={[styles.mLabel, { color: colors.sub }]}>FECHA LÍMITE</Text>
                                        {Platform.OS === 'web' ? (
                                            <input 
                                                type="date"
                                                value={newGoalEndDate.toISOString().split('T')[0]}
                                                onChange={(e) => {
                                                    const d = new Date(e.target.value);
                                                    if (!isNaN(d.getTime())) setNewGoalEndDate(d);
                                                }}
                                                style={{
                                                    backgroundColor: 'transparent',
                                                    color: colors.text,
                                                    border: 'none',
                                                    borderBottom: `1px solid ${colors.border}`,
                                                    fontSize: '18px',
                                                    fontWeight: '700',
                                                    padding: '10px 0',
                                                    width: '100%',
                                                    outline: 'none',
                                                    fontFamily: 'inherit'
                                                }}
                                            />
                                        ) : (
                                            <>
                                                <TouchableOpacity 
                                                    style={[styles.mInput, { borderBottomColor: colors.border, justifyContent: 'center' }]} 
                                                    onPress={() => setShowDatePicker(true)}
                                                >
                                                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
                                                        {newGoalEndDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                    </Text>
                                                </TouchableOpacity>
                                                {showDatePicker && (
                                                    <DateTimePicker
                                                        value={newGoalEndDate}
                                                        mode="date"
                                                        display="calendar"
                                                        minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
                                                        onChange={(event, date) => {
                                                            setShowDatePicker(false);
                                                            if (date) setNewGoalEndDate(date);
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </View>

                                    <TouchableOpacity 
                                        style={[styles.mPrimaryBtn, { backgroundColor: colors.accent }, isProcessing && { opacity: 0.6 }]} 
                                        onPress={handleCreateGoal}
                                        disabled={isProcessing}
                                    >
                                        <Text style={styles.mPrimaryBtnTxt}>
                                            {isProcessing ? 'Comenzando...' : 'Comenzar Reto'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            
                            {activeTab === 'cajitas' && (
                                <View>
                                    {cajitaType === null ? (
                                        <View style={{ gap: 16, marginVertical: 10 }}>
                                            <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
                                                Selecciona el tipo de Cajita que deseas crear:
                                            </Text>
                                            
                                            <TouchableOpacity 
                                                style={{ backgroundColor: colors.bg, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                                                onPress={() => {
                                                    setCajitaType('standard');
                                                    setIsEmergencyFund(false);
                                                }}
                                            >
                                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent + '15', justifyContent: 'center', alignItems: 'center' }}>
                                                    <MaterialIcons name="account-balance" size={24} color={colors.accent} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 }}>Cajita de Ahorro Común</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 11, lineHeight: 16 }}>Ahorra libremente para cualquier fin y gana rendimientos diarios sin plazos.</Text>
                                                </View>
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                style={{ backgroundColor: colors.accent + '08', padding: 18, borderRadius: 20, borderWidth: 2, borderColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                                                onPress={() => {
                                                    setCajitaType('emergency');
                                                    setIsEmergencyFund(true);
                                                    setEmergencyStep(1);
                                                }}
                                            >
                                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center' }}>
                                                    <MaterialIcons name="security" size={24} color={colors.accent} />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 }}>Fondo de Emergencia ✨</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 11, lineHeight: 16 }}>Analiza tu salud financiera y crea un escudo protector con recomendaciones dinámicas.</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    ) : cajitaType === 'standard' ? (
                                        <View>
                                            <View style={styles.mInputCont}>
                                                <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE DE LA CAJITA</Text>
                                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                    placeholder="Ej. Ahorro Emergencia" placeholderTextColor={colors.sub + '80'}
                                                    value={newGoalName} onChangeText={setNewGoalName} />
                                            </View>
                                            <View style={styles.mInputCont}>
                                                <Text style={[styles.mLabel, { color: colors.sub }]}>INTERÉS ANUAL ESPERADO (%) E.A. (Ej. Nubank 9)</Text>
                                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                    placeholder="0" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                                    value={newGoalInterest} onChangeText={setNewGoalInterest} />
                                            </View>
                                            
                                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                                <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 1, backgroundColor: colors.bg }]} onPress={() => setCajitaType(null)}>
                                                    <Text style={[styles.mPrimaryBtnTxt, { color: colors.text }]}>Atrás</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity 
                                                    style={[styles.mPrimaryBtn, { flex: 2, backgroundColor: colors.accent }, isProcessing && { opacity: 0.6 }]} 
                                                    onPress={handleCreateGoal}
                                                    disabled={isProcessing}
                                                >
                                                    <Text style={styles.mPrimaryBtnTxt}>
                                                        {isProcessing ? 'Guardando...' : 'Comenzar a ahorrar'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <View>
                                            {emergencyStep === 1 && (
                                                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                                                    <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.accent + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                                                        <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
                                                    </View>
                                                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 10 }}>Tu Escudo Contra Imprevistos</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 10 }}>
                                                        Un fondo de emergencia te protege ante gastos médicos, reparaciones del hogar o pérdida temporal de ingresos. Te permite afrontar imprevistos con absoluta tranquilidad, sin necesidad de endeudarte.
                                                    </Text>
                                                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                                                        <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 1, backgroundColor: colors.bg }]} onPress={() => setCajitaType(null)}>
                                                            <Text style={[styles.mPrimaryBtnTxt, { color: colors.text }]}>Atrás</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity 
                                                            style={[styles.mPrimaryBtn, { flex: 2, backgroundColor: colors.accent }]} 
                                                            onPress={() => {
                                                                setEmergencyStep(2);
                                                                analyzeFinancialHealth();
                                                            }}
                                                        >
                                                            <Text style={styles.mPrimaryBtnTxt}>Analizar Salud 📈</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}

                                            {emergencyStep === 2 && (
                                                <View>
                                                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 }}>Paso 2: Salud Financiera</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 12, marginBottom: 20 }}>Revisa y ajusta tus montos representativos en tu moneda ({currency}):</Text>
                                                    
                                                    {isAnalyzingHealth ? (
                                                        <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
                                                            <ActivityIndicator size="large" color={colors.accent} />
                                                            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Calculando salud financiera...</Text>
                                                        </View>
                                                    ) : (
                                                        <View style={{ gap: 14 }}>
                                                            <View style={styles.mInputCont}>
                                                                <Text style={[styles.mLabel, { color: colors.sub, fontSize: 10 }]}>INGRESOS MENSUALES ESTIMADOS</Text>
                                                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                                    keyboardType="decimal-pad" value={wizardIncome} onChangeText={t => setWizardIncome(formatInput(t))} />
                                                            </View>
                                                            <View style={styles.mInputCont}>
                                                                <Text style={[styles.mLabel, { color: colors.sub, fontSize: 10 }]}>GASTOS MENSUALES ESTIMADOS</Text>
                                                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                                    keyboardType="decimal-pad" value={wizardExpense} 
                                                                    onChangeText={t => {
                                                                        const clean = formatInput(t);
                                                                        setWizardExpense(clean);
                                                                        const parsed = parseInputToNumber(clean, currency);
                                                                        const rec = getEmergencyFundRecommendation(parsed);
                                                                        setCustomGoal(formatInput(rec.toString()));
                                                                    }} 
                                                                />
                                                            </View>
                                                            <View style={styles.mInputCont}>
                                                                <Text style={[styles.mLabel, { color: colors.sub, fontSize: 10 }]}>DEUDAS ACTIVAS TOTALES</Text>
                                                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                                    keyboardType="decimal-pad" value={wizardDebt} onChangeText={t => setWizardDebt(formatInput(t))} />
                                                            </View>

                                                            <View style={{ backgroundColor: colors.accent + '10', padding: 14, borderRadius: 16, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                                <Ionicons name="information-circle" size={20} color={colors.accent} />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>Recomendación Estimada</Text>
                                                                    <Text style={{ color: colors.sub, fontSize: 11, marginTop: 2 }}>
                                                                        Basado en tus gastos de {fmt(parseInputToNumber(wizardExpense, currency))}, sugerimos un Escudo Inicial de {fmt(getEmergencyFundRecommendation(parseInputToNumber(wizardExpense, currency)))}.
                                                                    </Text>
                                                                </View>
                                                            </View>

                                                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                                                <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 1, backgroundColor: colors.bg }]} onPress={() => setEmergencyStep(1)}>
                                                                    <Text style={[styles.mPrimaryBtnTxt, { color: colors.text }]}>Atrás</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 2, backgroundColor: colors.accent }]} onPress={() => setEmergencyStep(3)}>
                                                                    <Text style={styles.mPrimaryBtnTxt}>Siguiente 🛡️</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        </View>
                                                    )}
                                                </View>
                                            )}

                                            {emergencyStep === 3 && (() => {
                                                const parsedExpense = parseInputToNumber(wizardExpense, currency);
                                                const parsedDebt = parseInputToNumber(wizardDebt, currency);
                                                const recL1 = getEmergencyFundRecommendation(parsedExpense);
                                                const recL2 = roundToCurrency(3 * parsedExpense + parsedDebt);
                                                const recL3 = roundToCurrency(6 * parsedExpense + parsedDebt);
                                                
                                                return (
                                                    <View>
                                                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 }}>Paso 3: Metas Progresivas</Text>
                                                        <Text style={{ color: colors.sub, fontSize: 12, marginBottom: 16 }}>Tu escudo puede escalar a medida que ahorras. Elige el objetivo inicial:</Text>
                                                        
                                                        <View style={{ gap: 10, marginBottom: 20 }}>
                                                            <TouchableOpacity 
                                                                style={{ backgroundColor: colors.bg, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                                                onPress={() => setCustomGoal(formatInput(recL1.toString()))}
                                                            >
                                                                <View>
                                                                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Nivel 1: Escudo Inicial 🛡️</Text>
                                                                    <Text style={{ color: colors.sub, fontSize: 10 }}>Para emergencias menores inmediatas.</Text>
                                                                </View>
                                                                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '900' }}>{fmt(recL1)}</Text>
                                                            </TouchableOpacity>

                                                            <TouchableOpacity 
                                                                style={{ backgroundColor: colors.bg, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                                                onPress={() => setCustomGoal(formatInput(recL2.toString()))}
                                                            >
                                                                <View>
                                                                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Nivel 2: Tranquilidad 🛡️🛡️</Text>
                                                                    <Text style={{ color: colors.sub, fontSize: 10 }}>3 meses de gastos + deudas activas.</Text>
                                                                </View>
                                                                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '900' }}>{fmt(recL2)}</Text>
                                                            </TouchableOpacity>

                                                            <TouchableOpacity 
                                                                style={{ backgroundColor: colors.bg, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                                                onPress={() => setCustomGoal(formatInput(recL3.toString()))}
                                                            >
                                                                <View>
                                                                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Nivel 3: Blindaje Total 🛡️🛡️🛡️</Text>
                                                                    <Text style={{ color: colors.sub, fontSize: 10 }}>6 meses de gastos + deudas activas.</Text>
                                                                </View>
                                                                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '900' }}>{fmt(recL3)}</Text>
                                                            </TouchableOpacity>
                                                        </View>

                                                        <View style={styles.mInputCont}>
                                                            <Text style={[styles.mLabel, { color: colors.sub }]}>TU META INICIAL SELECCIONADA ({currency})</Text>
                                                            <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, fontSize: 24, fontWeight: '900', textAlign: 'center' }]} 
                                                                keyboardType="decimal-pad" value={customGoal} onChangeText={t => setCustomGoal(formatInput(t))} />
                                                        </View>

                                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                                            <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 1, backgroundColor: colors.bg }]} onPress={() => setEmergencyStep(2)}>
                                                                <Text style={[styles.mPrimaryBtnTxt, { color: colors.text }]}>Atrás</Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 2, backgroundColor: colors.accent }]} onPress={() => setEmergencyStep(4)}>
                                                                    <Text style={styles.mPrimaryBtnTxt}>Configurar ⚙️</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                );
                                            })()}

                                            {emergencyStep === 4 && (
                                                <View>
                                                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 }}>Paso 4: Detalles del Fondo</Text>
                                                    <Text style={{ color: colors.sub, fontSize: 12, marginBottom: 16 }}>Configura los rendimientos anuales y confirma tu fondo:</Text>

                                                    <View style={styles.mInputCont}>
                                                        <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE DEL FONDO</Text>
                                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                            placeholder="Ej. Mi Fondo de Emergencia" placeholderTextColor={colors.sub + '80'}
                                                            value={newGoalName} onChangeText={setNewGoalName} />
                                                    </View>

                                                    <View style={styles.mInputCont}>
                                                        <Text style={[styles.mLabel, { color: colors.sub }]}>INTERÉS ANUAL ESPERADO (%) E.A. (Ej. Nubank 13)</Text>
                                                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                                            placeholder="13" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                                            value={newGoalInterest} onChangeText={setNewGoalInterest} />
                                                    </View>

                                                    <View style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 16 }}>
                                                        <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '800', marginBottom: 6 }}>RESUMEN DE TU ESCUDO 🛡</Text>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Meta Inicial:</Text>
                                                            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>{fmt(parseInputToNumber(customGoal, currency))}</Text>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Interés Esperado:</Text>
                                                            <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>{newGoalInterest || '10'}% E.A.</Text>
                                                        </View>
                                                    </View>

                                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                                        <TouchableOpacity style={[styles.mPrimaryBtn, { flex: 1, backgroundColor: colors.bg }]} onPress={() => setEmergencyStep(3)}>
                                                            <Text style={[styles.mPrimaryBtnTxt, { color: colors.text }]}>Atrás</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity 
                                                            style={[styles.mPrimaryBtn, { flex: 2, backgroundColor: colors.accent }, isProcessing && { opacity: 0.6 }]} 
                                                            onPress={handleCreateGoal}
                                                            disabled={isProcessing}
                                                        >
                                                            <Text style={styles.mPrimaryBtnTxt}>
                                                                {isProcessing ? 'Creando...' : 'Crear Fondo 🛡️'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Modal Asignar */}
            <Modal visible={payModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.miniTitle, { color: colors.text }]}>Asignar Ahorro</Text>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={[styles.miniSub, { color: colors.sub }]}>Disponible: {fmt(accountBalances[selectedSourceAccount] || 0)}</Text>
                            <TouchableOpacity 
                                onPress={() => {
                                    const availableInAcc = accountBalances[selectedSourceAccount] || 0;
                                    const sourceAmount = Math.min(availableInAcc, selectedGoal.target_amount - selectedGoal.current_amount);
                                    const amountToUse = Math.max(0, sourceAmount);
                                    const val = convertCurrency(amountToUse, currency, rates);
                                    const info = getCurrencyInfo(currency);
                                    const cleanStr = info.hasDecimals ? val.toFixed(2) : Math.floor(val).toString();
                                    setPayAmount(formatInput(cleanStr));
                                }}
                                style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                            >
                                <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>USAR MÁXIMO</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 32, width: '100%', marginVertical: 10 }]} 
                            placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus
                            value={payAmount} onChangeText={t => setPayAmount(formatInput(t))} />

                        <View style={{ width: '100%', marginTop: 10 }}>
                            <Text style={[styles.mLabel, { color: colors.sub, marginBottom: 12 }]}>CUENTA DE ORIGEN</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {['Efectivo', ...(customAccounts || [])].map(acc => (
                                    <TouchableOpacity 
                                        key={acc}
                                        style={{ 
                                            paddingHorizontal: 16, 
                                            paddingVertical: 10, 
                                            borderRadius: 12, 
                                            backgroundColor: selectedSourceAccount === acc ? colors.accent : colors.bg,
                                            borderWidth: 1,
                                            borderColor: colors.border
                                        }}
                                        onPress={() => setSelectedSourceAccount(acc)}
                                    >
                                        <Text style={{ color: selectedSourceAccount === acc ? '#FFF' : colors.text, fontWeight: '700' }}>{acc}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={styles.miniBtns}>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                <Text style={{ color: colors.text }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.miniBtn, { backgroundColor: colors.accent }, (!payAmount || isProcessing) && { opacity: 0.6 }]} 
                                onPress={handleAddMoney}
                                disabled={!payAmount || isProcessing}
                            >
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal Retirar */}
            <Modal visible={withdrawModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.miniTitle, { color: colors.text }]}>Retirar Fondos</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={[styles.miniSub, { color: colors.sub }]}>Guardado: {fmt(selectedGoal?.current_amount || 0)}</Text>
                            <TouchableOpacity 
                                onPress={() => {
                                    const val = convertCurrency(selectedGoal?.current_amount || 0, currency, rates);
                                    const info = getCurrencyInfo(currency);
                                    const cleanStr = info.hasDecimals ? val.toFixed(2) : Math.floor(val).toString();
                                    setWithdrawAmount(formatInput(cleanStr));
                                }}
                                style={{ backgroundColor: '#EF444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                            >
                                <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>RETIRAR TODO</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 32, width: '100%', marginVertical: 10 }]} 
                            placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus
                            value={withdrawAmount} onChangeText={t => setWithdrawAmount(formatInput(t))} />

                        <View style={{ width: '100%', marginTop: 10 }}>
                            <Text style={[styles.mLabel, { color: colors.sub, marginBottom: 12 }]}>CUENTA DE DESTINO</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {['Efectivo', ...(customAccounts || [])].map(acc => (
                                    <TouchableOpacity 
                                        key={acc}
                                        style={{ 
                                            paddingHorizontal: 16, 
                                            paddingVertical: 10, 
                                            borderRadius: 12, 
                                            backgroundColor: selectedDestAccount === acc ? '#EF4444' : colors.bg,
                                            borderWidth: 1,
                                            borderColor: colors.border
                                        }}
                                        onPress={() => setSelectedDestAccount(acc)}
                                    >
                                        <Text style={{ color: selectedDestAccount === acc ? '#FFF' : colors.text, fontWeight: '700' }}>{acc}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={styles.miniBtns}>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: colors.bg }]} onPress={() => setWithdrawModalVisible(false)}>
                                <Text style={{ color: colors.text }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.miniBtn, { backgroundColor: '#EF4444' }, (!withdrawAmount || isProcessing) && { opacity: 0.6 }]} 
                                onPress={handleWithdrawMoney}
                                disabled={!withdrawAmount || isProcessing}
                            >
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Retirar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal Retirar a Cuenta */}
            <Modal visible={withdrawAccountModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.miniTitle, { color: colors.text }]}>Retirar a cuenta</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={[styles.miniSub, { color: colors.sub }]}>Disponible: {fmt(availableAhorro)}</Text>
                            <TouchableOpacity 
                                onPress={() => {
                                    const val = convertCurrency(availableAhorro, currency, rates);
                                    const info = getCurrencyInfo(currency);
                                    const cleanStr = info.hasDecimals ? val.toFixed(2) : Math.floor(val).toString();
                                    setWithdrawAccountAmount(formatInput(cleanStr));
                                }}
                                style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                            >
                                <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>USAR TODO</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 32, width: '100%', marginVertical: 10 }]} 
                            placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus
                            value={withdrawAccountAmount} onChangeText={t => setWithdrawAccountAmount(formatInput(t))} />

                        <View style={{ width: '100%', marginTop: 10 }}>
                            <Text style={[styles.mLabel, { color: colors.sub, marginBottom: 12 }]}>CUENTA DE DESTINO</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {['Efectivo', ...(customAccounts || [])].map(acc => (
                                    <TouchableOpacity 
                                        key={acc}
                                        style={{ 
                                            paddingHorizontal: 16, 
                                            paddingVertical: 10, 
                                            borderRadius: 12, 
                                            backgroundColor: selectedDestAccount === acc ? colors.accent : colors.bg,
                                            borderWidth: 1,
                                            borderColor: colors.border
                                        }}
                                        onPress={() => setSelectedDestAccount(acc)}
                                    >
                                        <Text style={{ color: selectedDestAccount === acc ? '#FFF' : colors.text, fontWeight: '700' }}>{acc}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={styles.miniBtns}>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: colors.bg }]} onPress={() => setWithdrawAccountModalVisible(false)}>
                                <Text style={{ color: colors.text }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.miniBtn, { backgroundColor: colors.accent }, (!withdrawAccountAmount || isProcessing) && { opacity: 0.6 }]} 
                                onPress={handleWithdrawToAccount}
                                disabled={!withdrawAccountAmount || isProcessing}
                            >
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {/* MODAL SELECCIONAR META */}
            <Modal visible={goalSelectorVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card, maxHeight: '80%' }]}>
                        <View style={styles.modalHeaderInner}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>
                                {selectorAction === 'pay' ? 'Asignar a...' : 'Retirar de...'}
                            </Text>
                            <TouchableOpacity onPress={() => setGoalSelectorVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {goals.filter(g => activeTab === 'cajitas' ? !!interestMap[g.id] : !interestMap[g.id]).map(goal => (
                                <TouchableOpacity 
                                    key={goal.id} 
                                    style={[styles.listItem, { backgroundColor: colors.bg, padding: 16, borderRadius: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                                    onPress={() => handleSelectGoal(goal)}
                                >
                                    <View>
                                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{goal.name}</Text>
                                        <Text style={{ color: colors.sub, fontSize: 12 }}>{fmt(goal.current_amount)} ahorrado</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={colors.accent} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* MODAL DE OPCIONES DE META */}
            <Modal visible={optionsModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setOptionsModalVisible(false)}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                        <View style={styles.modalHeaderInner}>
                            <View>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{goalForOptions?.name}</Text>
                                <Text style={[styles.miniSub, { color: colors.sub }]}>{fmt(goalForOptions?.current_amount || 0)} ahorrados</Text>
                            </View>
                            <TouchableOpacity onPress={() => setOptionsModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colors.sub} />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={{ gap: 12 }}>
                            <TouchableOpacity 
                                style={[styles.optionItem, { backgroundColor: colors.bg }]} 
                                onPress={() => {
                                    setOptionsModalVisible(false);
                                    setSelectedGoal(goalForOptions);
                                    setPayModalVisible(true);
                                }}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: colors.accent + '20' }]}>
                                    <Ionicons name="add" size={22} color={colors.accent} />
                                </View>
                                <View>
                                    <Text style={[styles.optionTitle, { color: colors.text }]}>Asignar dinero</Text>
                                    <Text style={[styles.optionSub, { color: colors.sub }]}>Mover saldo disponible a esta meta</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.optionItem, { backgroundColor: colors.bg }]} 
                                onPress={() => {
                                    setOptionsModalVisible(false);
                                    setSelectedGoal(goalForOptions);
                                    setWithdrawModalVisible(true);
                                }}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: '#EF444420' }]}>
                                    <Ionicons name="remove" size={22} color="#EF4444" />
                                </View>
                                <View>
                                    <Text style={[styles.optionTitle, { color: colors.text }]}>Retirar dinero</Text>
                                    <Text style={[styles.optionSub, { color: colors.sub }]}>Mover de esta meta a saldo disponible</Text>
                                </View>
                            </TouchableOpacity>

                            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />

                            {/* Level Up option — solo Fondos de Emergencia que alcanzaron la meta */}
                            {interestMap[goalForOptions?.id]?.is_emergency_fund &&
                             (goalForOptions?.current_amount >= goalForOptions?.target_amount) &&
                             (interestMap[goalForOptions?.id]?.emergency_level || 1) < 3 && (
                                <TouchableOpacity
                                    style={[styles.optionItem, { backgroundColor: colors.bg }]}
                                    onPress={() => {
                                        setOptionsModalVisible(false);
                                        const lvl = interestMap[goalForOptions.id]?.emergency_level || 1;
                                        const nextLvl = lvl + 1;
                                        setGoalForLevelUp(goalForOptions);
                                        setNewLevelNum(nextLvl);
                                        const expCOP = interestMap[goalForOptions.id]?.base_expenses || 800000;
                                        const debtCOP = interestMap[goalForOptions.id]?.debts_amount || 0;
                                        const expUser = convertCurrency(expCOP, currency, rates);
                                        const debtUser = convertCurrency(debtCOP, currency, rates);
                                        let nextTarget = 0;
                                        if (nextLvl === 2) nextTarget = roundToCurrency(3 * expUser + debtUser);
                                        else if (nextLvl === 3) nextTarget = roundToCurrency(6 * expUser + debtUser);
                                        setNewLevelTarget(formatInput(nextTarget.toString()));
                                        setLevelUpModalVisible(true);
                                    }}
                                >
                                    <View style={[styles.optionIcon, { backgroundColor: '#7B1FA220' }]}>
                                        <Ionicons name="rocket" size={20} color="#7B1FA2" />
                                    </View>
                                    <View>
                                        <Text style={[styles.optionTitle, { color: '#7B1FA2' }]}>Subir de Nivel 🚀</Text>
                                        <Text style={[styles.optionSub, { color: colors.sub }]}>Escalar tu fondo al siguiente nivel</Text>
                                    </View>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity 
                                style={[styles.optionItem, { backgroundColor: colors.bg }]} 
                                onPress={() => {
                                    setOptionsModalVisible(false);
                                    handleDelete(goalForOptions);
                                }}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: colors.sub + '15' }]}>
                                    <Ionicons name="trash-outline" size={20} color={colors.sub} />
                                </View>
                                <View>
                                    <Text style={[styles.optionTitle, { color: colors.sub }]}>Eliminar</Text>
                                    <Text style={[styles.optionSub, { color: colors.sub, opacity: 0.7 }]}>Borrar permanentemente</Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            {/* ── Modal Level Up: Escalar Fondo de Emergencia ── */}
            <Modal visible={levelUpModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card, width: '92%', paddingTop: 28 }]}>
                        <LinearGradient
                            colors={newLevelNum === 2 ? ['#4A148C', '#7B1FA2'] : ['#B71C1C', '#C62828']}
                            style={{ width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 4 }}
                        >
                            <Ionicons name="shield-checkmark" size={38} color="#FFF" />
                        </LinearGradient>

                        <Text style={[styles.miniTitle, { color: colors.text, textAlign: 'center', fontSize: 20 }]}>
                            ¡Meta Alcanzada! 🎉
                        </Text>
                        <Text style={{ color: colors.sub, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 4 }}>
                            Estás listo para escalar al{' '}
                            <Text style={{ fontWeight: '900', color: colors.text }}>
                                {newLevelNum === 2 ? 'Nivel 2: Tranquilidad 🛡️🛡️' : 'Nivel 3: Blindaje Total 🛡️🛡️🛡️'}
                            </Text>
                            . Ajusta la nueva meta si lo deseas:
                        </Text>

                        <View style={{ width: '100%', marginTop: 8, marginBottom: 4 }}>
                            <Text style={[styles.mLabel, { color: colors.sub, textAlign: 'center', marginBottom: 8 }]}>
                                NUEVA META ({currency})
                            </Text>
                            <TextInput
                                style={[styles.mInput, { color: colors.text, borderBottomColor: newLevelNum === 2 ? '#7B1FA2' : '#C62828', fontSize: 26, textAlign: 'center', width: '100%', fontWeight: '900' }]}
                                keyboardType="decimal-pad"
                                value={newLevelTarget}
                                onChangeText={t => setNewLevelTarget(formatInput(t))}
                            />
                        </View>

                        <View style={{ backgroundColor: (newLevelNum === 2 ? '#7B1FA2' : '#C62828') + '10', padding: 12, borderRadius: 12, width: '100%', marginBottom: 4 }}>
                            <Text style={{ color: colors.sub, fontSize: 11, textAlign: 'center', lineHeight: 17 }}>
                                {newLevelNum === 2
                                    ? '🛡️🛡️  Nivel 2 cubre 3 meses de gastos + tus deudas activas. Una red de seguridad sólida.'
                                    : '🛡️🛡️🛡️  Nivel 3 cubre 6 meses de gastos + deudas. Blindaje financiero total.'}
                            </Text>
                        </View>

                        <View style={[styles.miniBtns, { marginTop: 6 }]}>
                            <TouchableOpacity
                                style={[styles.miniBtn, { backgroundColor: colors.bg }]}
                                onPress={() => setLevelUpModalVisible(false)}
                            >
                                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.miniBtn, { backgroundColor: newLevelNum === 2 ? '#7B1FA2' : '#C62828' }, isProcessing && { opacity: 0.6 }]}
                                onPress={handleLevelUp}
                                disabled={isProcessing}
                            >
                                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14 }}>
                                    {isProcessing ? 'Subiendo...' : `Nivel ${newLevelNum} 🚀`}
                                </Text>
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 20 },
    headerTitle: { fontSize: 22, fontWeight: '800' },
    circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
    scroll: { padding: 20 },

    summaryBox: { borderRadius: 28, padding: 24, marginBottom: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15 },
    summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    summaryLabel: { fontSize: 13, fontWeight: '700' },
    summaryMainVal: { fontSize: 28, fontWeight: '900', marginTop: 2 },
    progressBar: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16 },
    progressFill: { height: '100%', borderRadius: 5 },
    summaryFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    footerLab: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
    footerVal: { fontSize: 15, fontWeight: '800' },

    empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 20, fontWeight: '800', marginTop: 20, marginBottom: 10 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, opacity: 0.8 },

    goalCard: { borderRadius: 24, marginBottom: 20, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20 },
    goalImgCont: { width: '100%', height: 120 },
    goalImg: { width: '100%', height: '100%' },
    goalImgPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    medal: { position: 'absolute', top: 12, left: 12, backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
    medalTxt: { color: '#FFF', fontSize: 10, fontWeight: '800' },
    delBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: '#FFF', width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    
    goalBody: { padding: 16, paddingRight: 50 },
    goalName: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    goalStats: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    goalProgressBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F0F0F0', overflow: 'hidden' },
    goalProgressFill: { height: '100%', borderRadius: 3 },
    goalPct: { fontSize: 12, fontWeight: '800', width: 35 },
    goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    amtLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
    amtVal: { fontSize: 14, fontWeight: '800' },
    cardActions: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 18 },
    actionBtnTxt: { color: '#FFF', fontSize: 14, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
    modalHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitle: { fontSize: 22, fontWeight: '900' },
    imgPick: { height: 140, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 24, overflow: 'hidden', borderStyle: 'dotted', borderWidth: 2, borderColor: '#D0D0D4' },
    imgPrev: { width: '100%', height: '100%' },
    mInputCont: { marginBottom: 20 },
    mLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    mInput: { fontSize: 18, fontWeight: '700', paddingVertical: 8, borderBottomWidth: 1 },
    mPrimaryBtn: { paddingVertical: 18, borderRadius: 20, alignItems: 'center', marginTop: 20 },
    mPrimaryBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '800' },

    overlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    miniModal: { borderRadius: 32, padding: 24, alignItems: 'center', gap: 16, width: '90%', alignSelf: 'center' },
    miniTitle: { fontSize: 20, fontWeight: '900' },
    miniSub: { fontSize: 14, fontWeight: '600', opacity: 0.6 },
    miniBtns: { flexDirection: 'row', gap: 12, marginTop: 10, width: '100%' },
    miniBtn: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
    distBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, elevation: 3 },
    distBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
    priorityRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    prioItem: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    prioText: { fontSize: 13, fontWeight: '800' },
    prioBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    prioBadgeText: { fontSize: 9, fontWeight: '900' },
    listItem: { flexDirection: 'row', alignItems: 'center' },
    optionItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20 },
    optionIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    optionTitle: { fontSize: 16, fontWeight: '800' },
    optionSub: { fontSize: 12, fontWeight: '600' },
});
