import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, convertToBase, formatInputDisplay, parseInputToNumber } from '@/utils/currency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import {
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

export default function GoalsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden, currency, rates } = useAuth();
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
    const [isProcessing, setIsProcessing] = useState(false);
    const [smartSavingsEnabled, setSmartSavingsEnabled] = useState<boolean | null>(null);

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');

    const formatInput = (text: string) => {
        return formatInputDisplay(text, currency);
    };

    useEffect(() => { if (isFocused) loadData(); }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            const { data: rawGoalsData } = await supabase.from('goals').select('*').eq('user_id', user.id).order('id', { ascending: false });
            
            const goalsData = await applyDailyInterests(rawGoalsData || []);
            setGoals(goalsData);
            
            const { data: txData } = await supabase.from('transactions').select('amount').eq('user_id', user.id).eq('category', 'Ahorro');
            const total = txData?.reduce((s, tx) => s + tx.amount, 0) || 0;
            setTotalAhorro(total);

            // Cargar estado de ahorro inteligente
            if (user?.id) {
                const rawPref = await AsyncStorage.getItem(SYNC_KEYS.SMART_SAVINGS(user.id));
                setSmartSavingsEnabled(rawPref === 'enabled');
            }
        } catch (e) { console.error(e); }
    };

    const applyDailyInterests = async (goalsData: any[]) => {
        if (!user) return goalsData;
        try {
            const stored = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id));
            if (!stored) return goalsData;
            
            const interestData = JSON.parse(stored);
            let updatedAny = false;
            let newTotalInterest = 0;
            const today = new Date().toISOString().split('T')[0];

            for (const goal of goalsData) {
                const info = interestData[goal.id];
                if (info && info.rate > 0) {
                    const lastUpdated = info.last_updated || today;
                    if (lastUpdated !== today) {
                        const daysDiff = Math.floor((new Date(today).getTime() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
                        if (daysDiff > 0 && goal.current_amount > 0) {
                            const dailyRate = (info.rate / 100) / 365;
                            const interest = goal.current_amount * dailyRate * daysDiff;
                            if (interest > 0) {
                                await supabase.from('goals').update({ current_amount: goal.current_amount + interest }).eq('id', goal.id);
                                await supabase.from('transactions').insert([{
                                    user_id: user.id,
                                    amount: interest,
                                    type: 'income',
                                    category: 'Ahorro',
                                    description: `Rendimientos cajita: ${goal.name}`,
                                    account: 'Ahorro',
                                    date: new Date().toISOString()
                                }]);
                                goal.current_amount += interest;
                                info.last_updated = today;
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
                await AsyncStorage.setItem(SYNC_KEYS.GOALS_INTEREST(user.id), JSON.stringify(interestData));
                if (newTotalInterest > 0) {
                    Alert.alert('Rendimientos Generados', `Tus cajitas han generado ${fmt(newTotalInterest)} en intereses. 💸`);
                }
            }
            return goalsData;
        } catch(e) {
            return goalsData;
        }
    };

    const assignedAhorro = goals.reduce((sum, g) => sum + g.current_amount, 0);
    const availableAhorro = Math.max(0, totalAhorro - assignedAhorro);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8 });
        if (!result.canceled) setNewGoalImage(result.assets[0].uri);
    };

    const handleCreateGoal = async () => {
        const typedVal = parseInputToNumber(newGoalTarget, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (!newGoalName.trim() || isNaN(val) || val <= 0 || isProcessing) return;
        setIsProcessing(true);
        try {
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
                name: newGoalName.trim(), 
                target_amount: val, 
                current_amount: 0, 
                image_uri: finalImageUri,
                priority: newGoalPriority
            }]).select();
            
            if (error) throw error;

            if (newGoalData && newGoalData[0] && newGoalInterest) {
                const interestRate = parseFloat(newGoalInterest.replace(',', '.'));
                if (!isNaN(interestRate) && interestRate > 0) {
                    const saved = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id!));
                    const interestData = saved ? JSON.parse(saved) : {};
                    interestData[newGoalData[0].id] = { rate: interestRate, last_updated: new Date().toISOString().split('T')[0] };
                    await AsyncStorage.setItem(SYNC_KEYS.GOALS_INTEREST(user.id!), JSON.stringify(interestData));
                    await syncUp(user.id!);
                }
            }
            
            setNewGoalName(''); setNewGoalTarget(''); setNewGoalImage(null); setNewGoalInterest(''); setAddModalVisible(false);
            loadData();
        } catch (e) { 
            console.error('Error al crear meta:', e); 
            if (Platform.OS === 'web') window.alert('Error al crear meta. Verifica tu conexión.');
            else Alert.alert('Error', 'No se pudo crear la meta.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddMoney = async () => {
        if (!selectedGoal) return;
        const typedVal = parseInputToNumber(payAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0) return;
        if (val > availableAhorro) {
            Alert.alert('Saldo insuficiente', 'No tienes suficiente Ahorro Disponible.');
            return;
        }
        const remainingNeeded = selectedGoal.target_amount - selectedGoal.current_amount;
        const actualAddition = Math.min(val, remainingNeeded);
        try {
            await supabase.from('goals').update({ current_amount: selectedGoal.current_amount + actualAddition }).eq('id', selectedGoal.id);
            setPayAmount(''); setPayModalVisible(false); loadData();
        } catch (e) { console.error(e); }
    };

    const handleWithdrawMoney = async () => {
        if (!selectedGoal) return;
        const typedVal = parseInputToNumber(withdrawAmount, currency);
        const val = convertToBase(typedVal, currency, rates);
        if (isNaN(val) || val <= 0 || val > selectedGoal.current_amount) return;
        try {
            await supabase.from('goals').update({ current_amount: selectedGoal.current_amount - val }).eq('id', selectedGoal.id);
            setWithdrawAmount(''); setWithdrawModalVisible(false); loadData();
        } catch (e) { console.error(e); }
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

    const toggleSmartSavings = async () => {
        if (!user?.id) return;
        const newState = !smartSavingsEnabled;
        setSmartSavingsEnabled(newState);
        await AsyncStorage.setItem(SYNC_KEYS.SMART_SAVINGS(user.id), newState ? 'enabled' : 'disabled');
        await syncUp(user.id);
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
                
                {/* ── Resumen ── */}
                <View style={[styles.summaryBox, { backgroundColor: colors.card }]}>
                    <View style={styles.summaryHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#E0E7FF' }]}>
                            <Ionicons name="wallet" size={20} color="#6366F1" />
                        </View>
                        <View>
                            <Text style={[styles.summaryLabel, { color: colors.sub }]}>Bolsa Total de Ahorro</Text>
                            <Text style={[styles.summaryMainVal, { color: colors.text }]}>{fmt(totalAhorro)}</Text>
                        </View>
                    </View>
                    <View style={[styles.progressBar, { backgroundColor: colors.bg }]}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, (assignedAhorro / (totalAhorro || 1)) * 100)}%`, backgroundColor: colors.accent }]} />
                    </View>
                    <View style={styles.summaryFooter}>
                        <View>
                            <Text style={[styles.footerLab, { color: colors.sub }]}>Asignado</Text>
                            <Text style={[styles.footerVal, { color: colors.text }]}>{fmt(assignedAhorro)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.footerLab, { color: colors.sub }]}>Disponible</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={[styles.footerVal, { color: '#10B981', fontWeight: '900' }]}>{fmt(availableAhorro)}</Text>
                                {availableAhorro > 0 && (
                                    <TouchableOpacity 
                                        style={[styles.distBtn, { backgroundColor: colors.accent }, isProcessing && { opacity: 0.6 }]} 
                                        onPress={handleDistributeSavings}
                                        disabled={isProcessing}
                                    >
                                        <Text style={styles.distBtnText}>{isProcessing ? 'Procesando...' : 'Distribuir'}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Ahorro Inteligente Toggle ── */}
                <View style={[styles.securityCard, { backgroundColor: colors.card, marginBottom: 16 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={[styles.iconBox, { backgroundColor: '#8B5CF620' }]}>
                                <MaterialIcons name="auto-awesome" size={20} color="#8B5CF6" />
                            </View>
                            <View>
                                <Text style={[styles.securityTitle, { color: colors.text, fontSize: 15 }]}>Ahorro Inteligente</Text>
                                <Text style={[styles.levelLabel, { color: colors.sub, textAlign: 'left', marginTop: 2 }]}>Sugerencias automáticas en ingresos</Text>
                            </View>
                        </View>
                        <TouchableOpacity 
                            onPress={toggleSmartSavings}
                            style={{ 
                                width: 50, 
                                height: 28, 
                                borderRadius: 14, 
                                backgroundColor: smartSavingsEnabled ? '#8B5CF6' : colors.bg,
                                justifyContent: 'center',
                                paddingHorizontal: 4,
                                borderWidth: 1,
                                borderColor: smartSavingsEnabled ? '#8B5CF6' : colors.border
                            }}
                        >
                            <View style={{ 
                                width: 20, 
                                height: 20, 
                                borderRadius: 10, 
                                backgroundColor: '#FFF',
                                alignSelf: smartSavingsEnabled ? 'flex-end' : 'flex-start',
                                elevation: 2,
                                shadowColor: '#000',
                                shadowOpacity: 0.2,
                                shadowRadius: 2
                            }} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* 🛡️ NIVELES DE SEGURIDAD SANTY */}
                <View style={[styles.securityCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text style={[styles.securityTitle, { color: colors.text }]}>Seguridad Financiera</Text>
                        <MaterialIcons name="verified-user" size={20} color={colors.accent} />
                    </View>
                    
                    <View style={styles.levelsRow}>
                        {[
                            { id: 1, label: 'Choque', val: 500000, icon: 'shield', color: '#10B981' },
                            { id: 2, label: '1 Mes', val: 2500000, icon: 'house', color: '#3B82F6' },
                            { id: 3, label: '3 Meses', val: 7500000, icon: 'pollen', color: '#8B5CF6' },
                            { id: 4, label: '6 Meses', val: 15000000, icon: 'fort', color: '#F59E0B' },
                        ].map((lvl) => {
                            const reached = totalAhorro >= lvl.val;
                            return (
                                <View key={lvl.id} style={{ alignItems: 'center', flex: 1 }}>
                                    <View style={[
                                        styles.levelCircle, 
                                        { backgroundColor: reached ? lvl.color : colors.bg, borderColor: reached ? lvl.color : colors.border }
                                    ]}>
                                        <MaterialIcons name={lvl.icon as any} size={20} color={reached ? '#FFF' : colors.sub + '40'} />
                                    </View>
                                    <Text style={[styles.levelLabel, { color: reached ? colors.text : colors.sub, fontWeight: reached ? '800' : '500' }]}>{lvl.label}</Text>
                                </View>
                            );
                        })}
                    </View>

                    <View style={[styles.securityAdvice, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.adviceText, { color: colors.text }]}>
                            {totalAhorro < 500000 
                                ? `💡 Santy: Tu primera meta es el Escudo de Choque (${fmt(500000)}). ¡Paso a paso!`
                                : totalAhorro < 2500000 
                                ? "🎉 ¡Bien! Tienes un Escudo de Choque. Próxima parada: 1 mes de gastos."
                                : totalAhorro < 7500000
                                ? "🚀 ¡Increíble! Ya tienes un mes de seguridad. Vamos por la Paz de los 3 meses."
                                : "👑 ¡Nivel Fortaleza! Estás en el top de seguridad financiera."
                            }
                        </Text>
                    </View>
                </View>

                {/* ── Lista de Metas ── */}
                {goals.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="leaf-outline" size={80} color={colors.accent + '40'} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>Siembra tus sueños</Text>
                        <Text style={[styles.emptySub, { color: colors.sub }]}>Crea una meta y comienza a asignar tus ahorros para verlos crecer.</Text>
                    </View>
                ) : (
                    goals.map(goal => {
                        const pct = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                        const isDone = pct >= 100;
                        return (
                            <TouchableOpacity 
                                key={goal.id} 
                                style={[styles.goalCard, { backgroundColor: colors.card }]}
                                onLongPress={() => handleDelete(goal)}
                                activeOpacity={0.9}
                            >
                                <View style={styles.goalImgCont}>
                                    {goal.image_uri ? (
                                        <Image source={{ uri: goal.image_uri }} style={styles.goalImg} />
                                    ) : (
                                        <View style={[styles.goalImgPlaceholder, { backgroundColor: colors.bg }]}>
                                            <Ionicons name="sparkles" size={32} color={colors.accent + '40'} />
                                        </View>
                                    )}
                                    {isDone && (
                                        <View style={styles.medal}>
                                            <MaterialIcons name="emoji-events" size={16} color="#FFF" />
                                            <Text style={styles.medalTxt}>¡Logrado!</Text>
                                        </View>
                                    )}
                                    <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(goal)}>
                                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                                
                                <View style={styles.goalBody}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                                        <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
                                        {goal.priority && (
                                            <View style={[styles.prioBadge, { backgroundColor: goal.priority === 'high' ? '#EF444420' : goal.priority === 'medium' ? '#F59E0B20' : '#8B868020' }]}>
                                                <Text style={[styles.prioBadgeText, { color: goal.priority === 'high' ? '#EF4444' : goal.priority === 'medium' ? '#D97706' : '#8B8680' }]}>
                                                    {goal.priority.toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.goalStats}>
                                        <View style={styles.goalProgressBg}>
                                            <View style={[styles.goalProgressFill, { width: `${pct}%`, backgroundColor: isDone ? '#10B981' : colors.accent }]} />
                                        </View>
                                        <Text style={[styles.goalPct, { color: isDone ? '#10B981' : colors.sub }]}>{pct.toFixed(0)}%</Text>
                                    </View>
                                    <View style={styles.goalAmounts}>
                                        <View>
                                            <Text style={[styles.amtLabel, { color: colors.sub }]}>Ahorrado</Text>
                                            <Text style={[styles.amtVal, { color: colors.text }]}>{fmt(goal.current_amount)}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.amtLabel, { color: colors.sub }]}>Objetivo</Text>
                                            <Text style={[styles.amtVal, { color: colors.text }]}>{fmt(goal.target_amount)}</Text>
                                        </View>
                                    </View>
                                    
                                    <View style={styles.cardActions}>
                                        {!isDone && (
                                            <TouchableOpacity 
                                                style={[styles.actionBtn, { backgroundColor: colors.accent }]} 
                                                onPress={() => { setSelectedGoal(goal); setPayModalVisible(true); }}
                                            >
                                                <Ionicons name="caret-up-circle" size={18} color="#FFF" />
                                                <Text style={styles.actionBtnTxt}>Asignar</Text>
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, { backgroundColor: colors.bg }]} 
                                            onPress={() => { setSelectedGoal(goal); setWithdrawModalVisible(true); }}
                                        >
                                            <Ionicons name="caret-down-circle" size={18} color={colors.text} />
                                            <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Retirar</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })
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
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva Meta</Text>
                                <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>
                            
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
                                <Text style={[styles.mLabel, { color: colors.sub }]}>INTERÉS ANUAL ESPERADO (%) E.A. (Ej. Nubank 9)</Text>
                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                    placeholder="0" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                    value={newGoalInterest} onChangeText={setNewGoalInterest} />
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
                                <Text style={styles.mPrimaryBtnTxt}>{isProcessing ? 'Guardando...' : 'Comenzar a ahorrar'}</Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Modal Asignar */}
            <Modal visible={payModalVisible} animationType="fade" transparent>
                <View style={styles.overlayCenter}>
                    <View style={[styles.miniModal, { backgroundColor: colors.card }]}>
                        <Text style={[styles.miniTitle, { color: colors.text }]}>Asignar Ahorro</Text>
                        <Text style={[styles.miniSub, { color: colors.sub }]}>Disponible: {fmt(availableAhorro)}</Text>
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 24 }]} 
                            placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus
                            value={payAmount} onChangeText={t => setPayAmount(formatInput(t))} />
                        <View style={styles.miniBtns}>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                <Text style={{ color: colors.text }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: colors.accent }]} onPress={handleAddMoney}>
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
                        <Text style={[styles.miniSub, { color: colors.sub }]}>Guardado: {fmt(selectedGoal?.current_amount || 0)}</Text>
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 24 }]} 
                            placeholder="$ 0" placeholderTextColor={colors.sub + '40'} keyboardType="decimal-pad" autoFocus
                            value={withdrawAmount} onChangeText={t => setWithdrawAmount(formatInput(t))} />
                        <View style={styles.miniBtns}>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: colors.bg }]} onPress={() => setWithdrawModalVisible(false)}>
                                <Text style={{ color: colors.text }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.miniBtn, { backgroundColor: '#EF4444' }]} onPress={handleWithdrawMoney}>
                                <Text style={{ color: '#FFF', fontWeight: '800' }}>Retirar</Text>
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

    goalCard: { borderRadius: 32, marginBottom: 24, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20 },
    goalImgCont: { width: '100%', height: 160 },
    goalImg: { width: '100%', height: '100%' },
    goalImgPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    medal: { position: 'absolute', top: 16, left: 16, backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
    medalTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
    delBtn: { position: 'absolute', top: 16, right: 16, backgroundColor: '#FFF', width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    
    goalBody: { padding: 20 },
    goalName: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
    goalStats: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    goalProgressBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F0F0F0', overflow: 'hidden' },
    goalProgressFill: { height: '100%', borderRadius: 4 },
    goalPct: { fontSize: 13, fontWeight: '800', width: 35 },
    goalAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    amtLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
    amtVal: { fontSize: 15, fontWeight: '800' },
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
    miniModal: { borderRadius: 32, padding: 32, alignItems: 'center', gap: 16 },
    miniTitle: { fontSize: 20, fontWeight: '900' },
    miniSub: { fontSize: 14, fontWeight: '600', opacity: 0.6 },
    miniBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
    miniBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    distBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, elevation: 3 },
    distBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
    priorityRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    prioItem: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    prioText: { fontSize: 13, fontWeight: '800' },
    prioBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    prioBadgeText: { fontSize: 9, fontWeight: '900' },
    
    // Security Levels Styles
    securityCard: { borderRadius: 28, padding: 20, marginBottom: 24 },
    securityTitle: { fontSize: 16, fontWeight: '800' },
    levelsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    levelCircle: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, marginBottom: 8 },
    levelLabel: { fontSize: 10, textAlign: 'center' },
    securityAdvice: { padding: 14, borderRadius: 16 },
    adviceText: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
});
