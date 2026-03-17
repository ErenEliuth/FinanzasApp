import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

export default function GoalsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark';
    const colors = {
        bg: isDark ? '#0F172A' : '#F4F6FF',
        card: isDark ? '#1E293B' : '#FFFFFF',
        text: isDark ? '#F1F5F9' : '#1E293B',
        sub: isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#334155' : '#E2E8F0',
    };

    const [goals, setGoals] = useState<any[]>([]);
    const [totalAhorro, setTotalAhorro] = useState(0);

    // Modal para nueva meta
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalTarget, setNewGoalTarget] = useState('');
    const [newGoalImage, setNewGoalImage] = useState<string | null>(null);

    // Modal para abonar / retirar
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');

    const formatInput = (text: string) => {
        if (Platform.OS === 'web') return text.replace(/[^0-9]/g, '');
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
            const { data: goalsData, error: goalsError } = await supabase
                .from('goals')
                .select('*')
                .eq('user_id', user.id)
                .order('id', { ascending: false });

            if (goalsError) throw goalsError;
            setGoals(goalsData || []);

            const { data: txData, error: txError } = await supabase
                .from('transactions')
                .select('amount')
                .eq('user_id', user.id)
                .eq('category', 'Ahorro');

            if (txError) throw txError;

            const total = txData?.reduce((s, tx) => s + tx.amount, 0) || 0;
            setTotalAhorro(total);
        } catch (e) {
            console.error('Error cargando metas de Supabase:', e);
        }
    };

    const assignedAhorro = goals.reduce((sum, g) => sum + g.current_amount, 0);
    const availableAhorro = Math.max(0, totalAhorro - assignedAhorro);

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setNewGoalImage(result.assets[0].uri);
        }
    };

    const handleCreateGoal = async () => {
        const val = parseFloat(newGoalTarget.replace(/\./g, '').replace(',', '.'));
        if (!newGoalName.trim() || isNaN(val) || val <= 0) return;

        try {
            const { error } = await supabase
                .from('goals')
                .insert([
                    {
                        user_id: user?.id,
                        name: newGoalName.trim(),
                        target_amount: val,
                        current_amount: 0,
                        image_uri: newGoalImage,
                    }
                ]);

            if (error) throw error;

            setNewGoalName('');
            setNewGoalTarget('');
            setNewGoalImage(null);
            setAddModalVisible(false);
            Keyboard.dismiss();
            loadData();
        } catch (e) {
            console.error('Error creando meta en Supabase:', e);
        }
    };

    const handleAddMoney = async () => {
        if (!selectedGoal) return;
        const val = parseFloat(payAmount.replace(/\./g, '').replace(',', '.'));
        if (isNaN(val) || val <= 0) return;

        if (val > availableAhorro) {
            if (Platform.OS === 'web') {
                window.alert('No tienes suficiente Ahorro Disponible para asignar esta cantidad.');
            } else {
                Alert.alert('Saldo insuficiente', 'No tienes suficiente Ahorro Disponible para asignar esta cantidad.');
            }
            return;
        }

        const remainingNeeded = selectedGoal.target_amount - selectedGoal.current_amount;
        const actualAddition = Math.min(val, remainingNeeded);

        try {
            const { error } = await supabase
                .from('goals')
                .update({ current_amount: selectedGoal.current_amount + actualAddition })
                .eq('id', selectedGoal.id);

            if (error) throw error;

            setPayAmount('');
            setPayModalVisible(false);
            setSelectedGoal(null);
            Keyboard.dismiss();
            loadData();
        } catch (e) {
            console.error('Error agregando dinero a la meta en Supabase:', e);
        }
    };

    const handleWithdrawMoney = async () => {
        if (!selectedGoal) return;
        const val = parseFloat(withdrawAmount.replace(/\./g, '').replace(',', '.'));
        if (isNaN(val) || val <= 0) return;

        if (val > selectedGoal.current_amount) {
            if (Platform.OS === 'web') {
                window.alert('No puedes retirar más de lo que has acumulado en esta meta.');
            } else {
                Alert.alert('Saldo insuficiente', 'No puedes retirar más de lo que has acumulado en esta meta.');
            }
            return;
        }

        try {
            const { error } = await supabase
                .from('goals')
                .update({ current_amount: selectedGoal.current_amount - val })
                .eq('id', selectedGoal.id);

            if (error) throw error;

            setWithdrawAmount('');
            setWithdrawModalVisible(false);
            setSelectedGoal(null);
            Keyboard.dismiss();
            loadData();
        } catch (e) {
            console.error('Error retirando dinero de la meta:', e);
        }
    };

    const handleDelete = (goal: any) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Estás seguro de que quieres eliminar la meta "${goal.name}"? Los fondos volverán a tu Ahorro Disponible.`)) {
                (async () => {
                    try {
                        const { error } = await supabase.from('goals').delete().eq('id', goal.id);
                        if (error) throw error;
                        loadData();
                    } catch (e) {
                        console.error('Error eliminando meta en Supabase:', e);
                    }
                })();
            }
            return;
        }
        Alert.alert(
            'Eliminar meta',
            `¿Estás seguro de que quieres eliminar la meta "${goal.name}"? Los fondos volverán a tu Ahorro Disponible.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('goals')
                                .delete()
                                .eq('id', goal.id);

                            if (error) throw error;
                            loadData();
                        } catch (e) {
                            console.error('Error eliminando meta en Supabase:', e);
                        }
                    },
                },
            ]
        );
    };

    const fmt = (n: number) =>
        isHidden
            ? '****'
            : new Intl.NumberFormat('es-CO', {
                style: 'currency', currency: 'COP', minimumFractionDigits: 0
              }).format(n);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Mis Metas</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
                    <MaterialIcons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── Tarjeta de Resumen de Ahorro ── */}
                <View style={[styles.summaryCard, isDark && { backgroundColor: '#1E293B', shadowColor: '#000' }]}>
                    {/* Fila 1: Total */}
                    <View style={styles.summaryTopRow}>
                        <Ionicons name="wallet-outline" size={20} color="#6366F1" />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[styles.summaryTopLabel, { color: colors.sub }]}>Bolsa Total de Ahorro</Text>
                            <Text style={[styles.summaryTotalAmount, { color: '#6366F1' }]}>{fmt(totalAhorro)}</Text>
                        </View>
                    </View>

                    <View style={[styles.separator, { backgroundColor: colors.border }]} />

                    {/* Fila 2: Asignado vs Disponible */}
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryCol}>
                            <Text style={[styles.summaryLabel, { color: colors.sub }]}>Asignado a Metas</Text>
                            <Text style={[styles.summaryAmountSmall, { color: colors.text }]}>{fmt(assignedAhorro)}</Text>
                        </View>
                        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                        <View style={[styles.summaryCol, { alignItems: 'flex-end' }]}>
                            <Text style={[styles.summaryLabel, { color: colors.sub }]}>Disponible para asignar</Text>
                            <Text style={[styles.summaryAmountSmall, { color: '#10B981' }]}>{fmt(availableAhorro)}</Text>
                        </View>
                    </View>

                    <Text style={[styles.summaryHint, { color: colors.sub }]}>
                        💡 El ahorro disponible es lo que aún no has repartido entre tus metas.
                    </Text>
                </View>

                {goals.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="flag-outline" size={60} color="#6366F1" />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>¿Qué quieres lograr?</Text>
                        <Text style={styles.emptyText}>Un auto, un viaje, una casa... Crea una meta y usa tus ahorros para alcanzarla.</Text>
                    </View>
                ) : (
                    goals.map((goal) => {
                        const pctStr = Math.min(100, (goal.current_amount / goal.target_amount) * 100).toFixed(0);
                        const pct = parseFloat(pctStr);
                        const isCompleted = pct >= 100;

                        return (
                            <View key={goal.id} style={[styles.card, isDark && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, isCompleted && styles.cardCompleted]}>
                                {/* Imagen Header */}
                                <View style={styles.cardImageContainer}>
                                    {goal.image_uri ? (
                                        <Image source={{ uri: goal.image_uri as string }} style={styles.cardImage} />
                                    ) : (
                                        <View style={[styles.cardImagePlaceholder, isDark && { backgroundColor: '#334155' }]}>
                                            <Ionicons name="image-outline" size={32} color={isDark ? '#64748B' : '#94A3B8'} />
                                        </View>
                                    )}
                                    {isCompleted && (
                                        <View style={styles.completedBadgeWrap}>
                                            <MaterialIcons name="emoji-events" size={16} color="#F59E0B" />
                                            <Text style={styles.completedBadgeText}>¡Meta Cumplida!</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.cardBody}>
                                    <View style={styles.cardTopRow}>
                                        <Text style={[styles.cardTitle, { color: colors.text }]}>{goal.name}</Text>
                                        <TouchableOpacity onPress={() => handleDelete(goal)}>
                                            <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Progression */}
                                    <View style={styles.progressRow}>
                                        <View style={[styles.progressBg, isDark && { backgroundColor: '#334155' }]}>
                                            <View
                                                style={[
                                                    styles.progressFill,
                                                    isCompleted && { backgroundColor: '#10B981' },
                                                    { width: `${pct}%` as any },
                                                ]}
                                            />
                                        </View>
                                        <Text style={[styles.progressPct, { color: colors.sub }]}>{pctStr}%</Text>
                                    </View>

                                    <View style={styles.amountsRow}>
                                        <View>
                                            <Text style={[styles.amountLabel, { color: colors.sub }]}>Llevas</Text>
                                            <Text style={[styles.amountVal, { color: isCompleted ? '#10B981' : '#6366F1' }]}>
                                                {fmt(goal.current_amount)}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.amountLabel, { color: colors.sub }]}>Meta</Text>
                                            <Text style={[styles.amountVal, { color: colors.text }]}>{fmt(goal.target_amount)}</Text>
                                        </View>
                                    </View>

                                    {/* Action Buttons */}
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        {!isCompleted && (
                                            <TouchableOpacity
                                                style={[styles.addMoneyBtn, { flex: 1 }]}
                                                onPress={() => {
                                                    setSelectedGoal(goal);
                                                    setPayModalVisible(true);
                                                }}
                                            >
                                                <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                                                <Text style={styles.addMoneyText}>Asignar</Text>
                                            </TouchableOpacity>
                                        )}
                                        {goal.current_amount > 0 && (
                                            <TouchableOpacity
                                                style={[styles.addMoneyBtn, { flex: 1, backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
                                                onPress={() => {
                                                    setSelectedGoal(goal);
                                                    setWithdrawModalVisible(true);
                                                }}
                                            >
                                                <Ionicons name="remove-circle-outline" size={18} color={isDark ? '#F1F5F9' : '#475569'} />
                                                <Text style={[styles.addMoneyText, { color: isDark ? '#F1F5F9' : '#475569' }]}>Retirar</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </View>
                        );
                    })
                )}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Modal para CREAR META */}
            <Modal visible={addModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                            <TouchableWithoutFeedback>
                                <View style={styles.modalSheet}>
                                    <View style={styles.modalHeader}>
                                        <View style={styles.modalIcon}>
                                            <Ionicons name="flag" size={22} color="#6366F1" />
                                        </View>
                                        <Text style={styles.modalTitle}>Crear Meta</Text>
                                    </View>

                                    {/* Image Picker */}
                                    <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                                        {newGoalImage ? (
                                            <Image source={{ uri: newGoalImage as string }} style={styles.imagePreview} />
                                        ) : (
                                            <>
                                                <Ionicons name="camera-outline" size={24} color="#64748B" />
                                                <Text style={styles.imagePickerText}>Añadir una foto inspiradora</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>

                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="Nombre de la meta (ej: Viaje a Japón)"
                                        placeholderTextColor="#94A3B8"
                                        value={newGoalName}
                                        onChangeText={setNewGoalName}
                                    />
                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="Valor a alcanzar"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="decimal-pad"
                                        value={newGoalTarget}
                                        onChangeText={(text) => setNewGoalTarget(formatInput(text))}
                                    />

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity
                                            style={styles.modalBtnCancel}
                                            onPress={() => {
                                                setAddModalVisible(false);
                                                setNewGoalName('');
                                                setNewGoalTarget('');
                                                setNewGoalImage(null);
                                            }}
                                        >
                                            <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleCreateGoal}>
                                            <Text style={styles.modalBtnConfirmText}>Crear</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Modal para ASIGNAR AHORRO */}
            <Modal visible={payModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                            <TouchableWithoutFeedback>
                                <View style={styles.modalSheet}>
                                    <Text style={styles.modalTitle}>Asignar a {selectedGoal?.name}</Text>
                                    <Text style={styles.modalSubtitle}>
                                        Ahorro Disponible: {fmt(availableAhorro)}
                                    </Text>

                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="Monto a sumar"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="decimal-pad"
                                        value={payAmount}
                                        onChangeText={(text) => setPayAmount(formatInput(text))}
                                        autoFocus
                                    />

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity
                                            style={styles.modalBtnCancel}
                                            onPress={() => {
                                                setPayModalVisible(false);
                                                setPayAmount('');
                                            }}
                                        >
                                            <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleAddMoney}>
                                            <Text style={styles.modalBtnConfirmText}>Transferir</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Modal para RETIRAR AHORRO */}
            <Modal visible={withdrawModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                            <TouchableWithoutFeedback>
                                <View style={styles.modalSheet}>
                                    <Text style={styles.modalTitle}>Retirar de {selectedGoal?.name}</Text>
                                    <Text style={styles.modalSubtitle}>
                                        Saldo en la meta: {fmt(selectedGoal?.current_amount || 0)}
                                    </Text>

                                    <TextInput
                                        style={styles.modalInput}
                                        placeholder="Monto a retirar"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="decimal-pad"
                                        value={withdrawAmount}
                                        onChangeText={(text) => setWithdrawAmount(formatInput(text))}
                                        autoFocus
                                    />

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity
                                            style={styles.modalBtnCancel}
                                            onPress={() => {
                                                setWithdrawModalVisible(false);
                                                setWithdrawAmount('');
                                            }}
                                        >
                                            <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: '#EF4444' }]} onPress={handleWithdrawMoney}>
                                            <Text style={styles.modalBtnConfirmText}>Retirar</Text>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 50 : 20,
        paddingBottom: 16,
    },
    backBtn: { width: 40, height: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
    addBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#6366F1',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    scrollContent: { padding: 20 },

    // ── Summary Card ──
    summaryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    summaryTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    summaryTopLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
    summaryTotalAmount: { fontSize: 28, fontWeight: '900', color: '#6366F1', marginTop: 2 },
    separator: { height: 1, backgroundColor: '#E2E8F0', marginBottom: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    summaryCol: { flex: 1 },
    summaryDivider: { width: 1, backgroundColor: '#E2E8F0', marginHorizontal: 12 },
    summaryLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
    summaryAmountSmall: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
    summaryHint: { fontSize: 11, color: '#94A3B8', lineHeight: 18 },

    // ── Empty state ──
    emptyState: { alignItems: 'center', paddingVertical: 40, marginHorizontal: 20 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginTop: 16 },
    emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 22 },

    // ── Card ──
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        marginBottom: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
    },
    cardCompleted: {
        borderWidth: 2,
        borderColor: '#10B981',
    },
    cardImageContainer: {
        width: '100%',
        height: 140,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardImage: { width: '100%', height: '100%' },
    cardImagePlaceholder: { opacity: 0.5, alignItems: 'center' },
    completedBadgeWrap: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    completedBadgeText: { fontSize: 12, fontWeight: '800', color: '#F59E0B' },

    cardBody: { padding: 20 },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    cardTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B' },

    // Progress
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    progressBg: { flex: 1, height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#6366F1', borderRadius: 5 },
    progressPct: { fontSize: 13, fontWeight: '700', color: '#64748B', width: 40, textAlign: 'right' },

    // Amounts
    amountsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    amountLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
    amountVal: { fontSize: 16, fontWeight: '800', color: '#1E293B' },

    addMoneyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6366F1',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    addMoneyText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    modalIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(99,102,241,0.1)', justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
    modalSubtitle: { fontSize: 14, color: '#64748B', marginBottom: 16 },

    imagePickerBtn: {
        height: 120,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        overflow: 'hidden',
    },
    imagePreview: { width: '100%', height: '100%' },
    imagePickerText: { color: '#64748B', fontSize: 14, marginTop: 8, fontWeight: '500' },

    modalInput: { backgroundColor: '#F4F6FF', borderRadius: 14, padding: 16, fontSize: 16, color: '#1E293B', marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
    modalBtnCancel: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    modalBtnCancelText: { color: '#64748B', fontWeight: '700', fontSize: 16 },
    modalBtnConfirm: { flex: 1, backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    modalBtnConfirmText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
