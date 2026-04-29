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
    const [activeTab, setActiveTab] = useState<'metas' | 'cajitas'>('metas');
    const [interestMap, setInterestMap] = useState<Record<string, any>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [breakdownVisible, setBreakdownVisible] = useState(false);

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');

    const [goalSelectorVisible, setGoalSelectorVisible] = useState(false);
    const [selectorAction, setSelectorAction] = useState<'pay' | 'withdraw'>('pay');

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

    useEffect(() => { if (isFocused) loadData(); }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            const stored = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id));
            const iMap = stored ? JSON.parse(stored) : {};
            setInterestMap(iMap);

            const { data: rawGoalsData } = await supabase.from('goals').select('*').eq('user_id', user.id).order('id', { ascending: false });
            
            const goalsData = await applyDailyInterests(rawGoalsData || [], iMap);
            setGoals(goalsData);
            
            const { data: txData } = await supabase.from('transactions').select('amount').eq('user_id', user.id).eq('category', 'Ahorro');
            const total = txData?.reduce((s, tx) => s + tx.amount, 0) || 0;
            setTotalAhorro(total);
        } catch (e) { console.error(e); }
    };

    const applyDailyInterests = async (goalsData: any[], currentMap?: any) => {
        if (!user) return goalsData;
        try {
            const interestData = currentMap || (JSON.parse(await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id)) || '{}'));
            if (!interestData || Object.keys(interestData).length === 0) return goalsData;
            
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
                                    date: new Date().toISOString()
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
            return goalsData;
        } catch(e) {
            return goalsData;
        }
    };

    const metas = goals.filter(g => !interestMap[g.id]?.rate);
    const cajitas = goals.filter(g => interestMap[g.id]?.rate > 0);

    const totalMetas = metas.reduce((sum, g) => sum + g.current_amount, 0);
    const totalCajitas = cajitas.reduce((sum, g) => sum + g.current_amount, 0);
    const totalEarnings = cajitas.reduce((sum, g) => sum + (interestMap[g.id]?.total_earned || 0), 0);

    const assignedAhorro = goals.reduce((sum, g) => sum + g.current_amount, 0);
    const availableAhorro = Math.max(0, totalAhorro - assignedAhorro);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8 });
        if (!result.canceled) setNewGoalImage(result.assets[0].uri);
    };

    const handleCreateGoal = async () => {
        let val = 1000000000; // Target muy alto para cajitas por defecto
        if (activeTab === 'metas') {
            const typedVal = parseInputToNumber(newGoalTarget, currency);
            val = convertToBase(typedVal, currency, rates);
            if (isNaN(val) || val <= 0) return;
        }
        
        if (!newGoalName.trim() || isProcessing) return;
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
                
                {/* TAB SELECTOR - NOW AT TOP */}
                <View style={{ paddingHorizontal: 0, marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', borderRadius: 20, padding: 6, backgroundColor: colors.card }}>
                        <TouchableOpacity onPress={() => setActiveTab('metas')} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: activeTab === 'metas' ? colors.accent : 'transparent' }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: activeTab === 'metas' ? '#FFF' : colors.sub }}>Metas de Ahorro</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setActiveTab('cajitas')} style={{ flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: activeTab === 'cajitas' ? colors.accent : 'transparent' }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: activeTab === 'cajitas' ? '#FFF' : colors.sub }}>Cajitas</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Resumen ── */}
                <View style={[styles.summaryBox, { backgroundColor: colors.card }]}>
                    <View style={styles.summaryHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#E0E7FF' }]}>
                            <Ionicons name="wallet" size={20} color="#6366F1" />
                        </View>
                        <View>
                            <Text style={[styles.summaryLabel, { color: colors.sub }]}>
                                {activeTab === 'metas' ? 'Total en Metas' : 'Total en Cajitas'}
                            </Text>
                            <Text style={[styles.summaryMainVal, { color: colors.text }]}>
                                {activeTab === 'metas' ? fmt(totalMetas) : (
                                    <Text>
                                        {fmt(totalCajitas - totalEarnings)}
                                        <Text style={{ color: '#10B981', fontSize: 16 }}> +{fmt(totalEarnings)}</Text>
                                    </Text>
                                )}
                            </Text>
                        </View>
                    </View>
                    <View style={[styles.progressBar, { backgroundColor: colors.bg }]}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, (assignedAhorro / (totalAhorro || 1)) * 100)}%`, backgroundColor: colors.accent }]} />
                    </View>

                    <View style={styles.summaryFooter}>
                        <View>
                            <Text style={[styles.footerLab, { color: colors.sub }]}>Bolsa Total</Text>
                            <Text style={[styles.footerVal, { color: colors.text }]}>{fmt(totalAhorro)}</Text>
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
                                        <Text style={styles.distBtnText}>{isProcessing ? '...' : 'Distribuir'}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                </View>


                {/* ── Lista de Metas/Cajitas ── */}
                {goals.filter(g => activeTab === 'cajitas' ? interestMap[g.id]?.rate > 0 : !interestMap[g.id]?.rate).length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="leaf-outline" size={80} color={colors.accent + '40'} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>Siembra tus sueños</Text>
                        <Text style={[styles.emptySub, { color: colors.sub }]}>
                            {activeTab === 'metas' ? 'Crea una meta y comienza a asignar tus ahorros.' : 'Crea una cajita para ganar intereses diarios.'}
                        </Text>
                    </View>
                ) : (
                    goals.filter(g => activeTab === 'cajitas' ? interestMap[g.id]?.rate > 0 : !interestMap[g.id]?.rate).map(goal => {
                        const pct = Math.min(100, (goal.current_amount / goal.target_amount) * 100);
                        const isDone = pct >= 100;
                        return (
                            <TouchableOpacity 
                                key={goal.id} 
                                style={[styles.goalCard, { backgroundColor: colors.card }]}
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
                                )}
                                {activeTab === 'cajitas' && (
                                    <View style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
                                        <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(goal)}>
                                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <View style={styles.goalBody}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                                        <Text style={[styles.goalName, { color: colors.text, marginBottom: 0, flex: 1 }]} numberOfLines={1}>
                                            {goal.name}
                                        </Text>
                                        {activeTab === 'metas' && (
                                            <View style={[styles.prioBadge, { backgroundColor: goal.priority === 'high' ? '#EF444420' : goal.priority === 'medium' ? '#F59E0B20' : '#10B98120' }]}>
                                                <Text style={[styles.prioBadgeText, { color: goal.priority === 'high' ? '#EF4444' : goal.priority === 'medium' ? '#F59E0B' : '#10B981' }]}>
                                                    {goal.priority === 'high' ? 'ALTA' : goal.priority === 'medium' ? 'MEDIA' : 'BAJA'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    
                                    {activeTab === 'metas' && (
                                        <View style={styles.goalStats}>
                                            <View style={styles.goalProgressBg}>
                                                <View style={[styles.goalProgressFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
                                            </View>
                                            <Text style={[styles.goalPct, { color: colors.accent }]}>{Math.round(pct)}%</Text>
                                        </View>
                                    )}

                                    <View style={styles.goalAmounts}>
                                        <View>
                                            <Text style={[styles.amtLabel, { color: colors.sub }]}>Valor Asignado</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Text style={[styles.amtVal, { color: colors.text, fontSize: 18 }]}>{fmt(goal.current_amount)}</Text>
                                                {activeTab === 'cajitas' && (interestMap[goal.id]?.last_earned > 0) && (
                                                    <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '800' }}>+{fmt(interestMap[goal.id].last_earned)}</Text>
                                                )}
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.amtLabel, { color: colors.sub }]}>{activeTab === 'cajitas' ? 'Interés' : 'Objetivo'}</Text>
                                            <Text style={[styles.amtVal, { color: colors.text }]}>
                                                {activeTab === 'cajitas' ? `${interestMap[goal.id]?.rate}% E.A.` : fmt(goal.target_amount)}
                                            </Text>
                                        </View>
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
                                <Text style={[styles.modalTitle, { color: colors.text }]}>{activeTab === 'metas' ? 'Nueva Meta' : 'Nueva Cajita'}</Text>
                                <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={colors.sub} />
                                </TouchableOpacity>
                            </View>
                            {activeTab === 'metas' && (
                                <TouchableOpacity style={[styles.imgPick, { backgroundColor: colors.bg }]} onPress={pickImage}>
                                    {newGoalImage ? <Image source={{ uri: newGoalImage }} style={styles.imgPrev} /> : (
                                        <View style={{ alignItems: 'center' }}>
                                            <Ionicons name="camera" size={32} color={colors.accent} />
                                            <Text style={{ color: colors.sub, fontSize: 12, marginTop: 8 }}>Elegir foto inspiradora</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            )}


                            <View style={styles.mInputCont}>
                                <Text style={[styles.mLabel, { color: colors.sub }]}>NOMBRE</Text>
                                <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                    placeholder={activeTab === 'metas' ? "Ej. Mi primer auto" : "Ej. Ahorro Emergencia"} placeholderTextColor={colors.sub + '80'}
                                    value={newGoalName} onChangeText={setNewGoalName} />
                            </View>

                            {activeTab === 'metas' && (
                                <View style={styles.mInputCont}>
                                    <Text style={[styles.mLabel, { color: colors.sub }]}>MONTO OBJETIVO</Text>
                                    <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                        placeholder="$ 0" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                        value={newGoalTarget} onChangeText={t => setNewGoalTarget(formatInput(t))} />
                                </View>
                            )}
                            
                            {activeTab === 'cajitas' && (
                                <View style={styles.mInputCont}>
                                    <Text style={[styles.mLabel, { color: colors.sub }]}>INTERÉS ANUAL ESPERADO (%) E.A. (Ej. Nubank 9)</Text>
                                    <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border }]} 
                                        placeholder="0" placeholderTextColor={colors.sub + '80'} keyboardType="decimal-pad"
                                        value={newGoalInterest} onChangeText={setNewGoalInterest} />
                                </View>
                            )}

                            {activeTab === 'metas' && (
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
                            )}

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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={[styles.miniSub, { color: colors.sub }]}>Disponible: {fmt(availableAhorro)}</Text>
                            <TouchableOpacity 
                                onPress={() => setPayAmount(formatInput(convertCurrency(availableAhorro, currency, rates).toString()))}
                                style={{ backgroundColor: colors.accent + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                            >
                                <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>USAR TODO</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 24, width: '100%' }]} 
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={[styles.miniSub, { color: colors.sub }]}>Guardado: {fmt(selectedGoal?.current_amount || 0)}</Text>
                            <TouchableOpacity 
                                onPress={() => setWithdrawAmount(formatInput(convertCurrency(selectedGoal?.current_amount || 0, currency, rates).toString()))}
                                style={{ backgroundColor: '#EF444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}
                            >
                                <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>RETIRAR TODO</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput style={[styles.mInput, { color: colors.text, borderBottomColor: colors.border, textAlign: 'center', fontSize: 24, width: '100%' }]} 
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
                            {goals.filter(g => activeTab === 'cajitas' ? interestMap[g.id]?.rate > 0 : !interestMap[g.id]?.rate).map(goal => (
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

            {/* BARRA DE ACCIONES FLOTANTE */}
            <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, flexDirection: 'row', gap: 12, backgroundColor: colors.card, padding: 10, borderRadius: 24, elevation: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12 }}>
                <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.accent, height: 48 }]} 
                    onPress={() => openSelector('pay')}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="add-circle" size={20} color="#FFF" />
                        <Text style={[styles.actionBtnTxt, { fontSize: 15 }]}>Asignar</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.bg, height: 48, borderWidth: 1, borderColor: colors.border }]} 
                    onPress={() => openSelector('withdraw')}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="remove-circle" size={20} color={colors.text} />
                        <Text style={[styles.actionBtnTxt, { color: colors.text, fontSize: 15 }]}>Retirar</Text>
                    </View>
                </TouchableOpacity>
            </View>
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
    
    goalBody: { padding: 16 },
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
});
