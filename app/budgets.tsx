import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
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

const CATEGORIES = [
    { name: 'Comida',          icon: 'restaurant',     color: '#F43F5E' },
    { name: 'Transporte',      icon: 'directions-car', color: '#6366F1' },
    { name: 'Hogar',           icon: 'home',           color: '#F97316' },
    { name: 'Salud',           icon: 'medical-services', color: '#10B981' },
    { name: 'Educación',       icon: 'school',         color: '#3B82F6' },
    { name: 'Entretenimiento', icon: 'sports-esports', color: '#EC4899' },
    { name: 'Ropa',            icon: 'checkroom',      color: '#8B5CF6' },
    { name: 'Recibos',         icon: 'receipt',        color: '#64748B' },
    { name: 'Gimnasio',        icon: 'fitness-center', color: '#14B8A6' },
    { name: 'Otros',           icon: 'more-horiz',     color: '#94A3B8' },
];

export default function BudgetsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark';

    const colors = {
        bg:     isDark ? '#0F172A' : '#F4F6FF',
        card:   isDark ? '#1E293B' : '#FFFFFF',
        text:   isDark ? '#F1F5F9' : '#1E293B',
        sub:    isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#334155' : '#E2E8F0',
        input:  isDark ? '#334155' : '#F1F5F9',
    };

    const [budgets, setBudgets] = useState<any[]>([]);
    const [spending, setSpending] = useState<Record<string, number>>({});
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedCat, setSelectedCat] = useState(CATEGORIES[0]);
    const [limitAmount, setLimitAmount] = useState('');

    useEffect(() => {
        if (isFocused) loadData();
    }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            // Cargar presupuestos
            const { data: budgetData, error: bErr } = await supabase
                .from('budgets')
                .select('*')
                .eq('user_id', user.id);
            if (bErr) throw bErr;
            setBudgets(budgetData || []);

            // Cargar gastos del mes actual por categoría
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
            const { data: txData, error: tErr } = await supabase
                .from('transactions')
                .select('category, amount')
                .eq('user_id', user.id)
                .eq('type', 'expense')
                .neq('category', 'Ahorro')
                .gte('date', startOfMonth);
            if (tErr) throw tErr;

            const totals: Record<string, number> = {};
            txData?.forEach(tx => {
                const cat = tx.category || 'Otros';
                totals[cat] = (totals[cat] || 0) + tx.amount;
            });
            setSpending(totals);
        } catch (e) {
            console.error('Error cargando presupuestos:', e);
        }
    };

    const fmt = (n: number) =>
        isHidden
            ? '****'
            : new Intl.NumberFormat('es-CO', {
                style: 'currency', currency: 'COP', minimumFractionDigits: 0
              }).format(n);

    const formatInput = (text: string) => {
        if (Platform.OS === 'web') return text.replace(/[^0-9]/g, '');
        const numeric = text.replace(/\D/g, '');
        if (!numeric) return '';
        return numeric.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const handleSaveBudget = async () => {
        const val = parseFloat(limitAmount.replace(/\./g, '').replace(',', '.'));
        if (isNaN(val) || val <= 0) return;

        try {
            // Upsert: actualiza si existe, crea si no
            const { error } = await supabase
                .from('budgets')
                .upsert(
                    [{
                        user_id: user?.id,
                        category: selectedCat.name,
                        monthly_limit: val,
                    }],
                    { onConflict: 'user_id,category' }
                );
            if (error) throw error;
            setLimitAmount('');
            setModalVisible(false);
            Keyboard.dismiss();
            loadData();
        } catch (e) {
            console.error('Error guardando presupuesto:', e);
            Alert.alert('Error', 'No se pudo guardar. Asegúrate de tener la tabla "budgets" creada en Supabase.');
        }
    };

    const handleDelete = async (budget: any) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Quitar el límite para "${budget.category}"?`)) {
                await supabase.from('budgets').delete().eq('id', budget.id);
                loadData();
            }
            return;
        }
        Alert.alert('Eliminar presupuesto', `¿Quitar el límite para "${budget.category}"?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive', onPress: async () => {
                    await supabase.from('budgets').delete().eq('id', budget.id);
                    loadData();
                }
            }
        ]);
    };

    const openModal = (cat: typeof CATEGORIES[0], existing?: any) => {
        setSelectedCat(cat);
        setLimitAmount(existing ? String(existing.monthly_limit).replace(/\./g, '') : '');
        setModalVisible(true);
    };

    // Mes actual en texto
    const monthName = new Date().toLocaleString('es-CO', { month: 'long', year: 'numeric' });

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialIcons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Presupuestos</Text>
                    <Text style={[styles.headerSub, { color: colors.sub }]}>{monthName}</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Info Banner */}
            <View style={[styles.infoBanner, { backgroundColor: '#6366F110' }]}>
                <Ionicons name="information-circle-outline" size={16} color="#6366F1" />
                <Text style={[styles.infoText, { color: colors.sub }]}>
                    Define un límite mensual por categoría. La app te avisará cuando te estés pasando.
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {CATEGORIES.map(cat => {
                    const budget = budgets.find(b => b.category === cat.name);
                    const spent = spending[cat.name] || 0;
                    const limit = budget?.monthly_limit || 0;
                    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
                    const isOver = limit > 0 && spent > limit;
                    const isNear = limit > 0 && pct >= 80 && !isOver;
                    const barColor = isOver ? '#EF4444' : isNear ? '#F59E0B' : cat.color;

                    return (
                        <View key={cat.name} style={[styles.card, { backgroundColor: colors.card, borderColor: isOver ? '#EF444430' : colors.border }]}>
                            <View style={styles.cardTop}>
                                {/* Icono */}
                                <View style={[styles.catIcon, { backgroundColor: cat.color + '20' }]}>
                                    <MaterialIcons name={cat.icon as any} size={22} color={cat.color} />
                                </View>

                                {/* Info */}
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.catName, { color: colors.text }]}>{cat.name}</Text>
                                    {budget ? (
                                        <Text style={[styles.catSub, { color: isOver ? '#EF4444' : isNear ? '#F59E0B' : colors.sub }]}>
                                            {fmt(spent)} / {fmt(limit)}
                                            {isOver ? ' ⚠️ Límite superado' : isNear ? ' 🔶 Cerca del límite' : ''}
                                        </Text>
                                    ) : (
                                        <Text style={[styles.catSub, { color: colors.sub }]}>
                                            {spent > 0 ? `Gastado: ${fmt(spent)} · Sin límite` : 'Sin límite definido'}
                                        </Text>
                                    )}
                                </View>

                                {/* Botón editar/añadir */}
                                <TouchableOpacity
                                    style={[styles.editBtn, { backgroundColor: budget ? colors.border : cat.color + '20' }]}
                                    onPress={() => openModal(cat, budget)}
                                >
                                    <MaterialIcons
                                        name={budget ? 'edit' : 'add'}
                                        size={18}
                                        color={budget ? colors.sub : cat.color}
                                    />
                                </TouchableOpacity>

                                {/* Botón eliminar (si hay budget) */}
                                {budget && (
                                    <TouchableOpacity
                                        style={[styles.editBtn, { backgroundColor: '#EF444415', marginLeft: 6 }]}
                                        onPress={() => handleDelete(budget)}
                                    >
                                        <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Barra de progreso */}
                            {budget && (
                                <View style={[styles.barBg, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                                    <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                                </View>
                            )}
                        </View>
                    );
                })}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modal para editar/crear presupuesto */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
                            <TouchableWithoutFeedback>
                                <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                                    {/* Cabecera del modal */}
                                    <View style={styles.modalHeader}>
                                        <View style={[styles.modalIconWrap, { backgroundColor: selectedCat.color + '20' }]}>
                                            <MaterialIcons name={selectedCat.icon as any} size={24} color={selectedCat.color} />
                                        </View>
                                        <View>
                                            <Text style={[styles.modalTitle, { color: colors.text }]}>Límite para {selectedCat.name}</Text>
                                            <Text style={[styles.modalSub, { color: colors.sub }]}>Monto máximo mensual</Text>
                                        </View>
                                    </View>

                                    <TextInput
                                        style={[styles.modalInput, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                                        placeholder="Ej: 500.000"
                                        placeholderTextColor="#94A3B8"
                                        keyboardType="decimal-pad"
                                        value={limitAmount}
                                        onChangeText={t => setLimitAmount(formatInput(t))}
                                        autoFocus
                                        returnKeyType="done"
                                        onSubmitEditing={handleSaveBudget}
                                    />

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity
                                            style={[styles.modalBtn, { backgroundColor: colors.border }]}
                                            onPress={() => { setModalVisible(false); setLimitAmount(''); }}
                                        >
                                            <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.modalBtn, { backgroundColor: selectedCat.color }]}
                                            onPress={handleSaveBudget}
                                        >
                                            <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>
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
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 50 : 20,
        paddingBottom: 12,
    },
    backBtn: { width: 40, justifyContent: 'center' },
    headerTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
    headerSub: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize', marginTop: 1 },

    infoBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        marginHorizontal: 20, marginBottom: 12,
        borderRadius: 12, padding: 12,
    },
    infoText: { flex: 1, fontSize: 12, lineHeight: 17 },

    scroll: { paddingHorizontal: 20 },

    card: {
        borderRadius: 18, padding: 16, marginBottom: 12,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        borderWidth: 1,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    catIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    catName: { fontSize: 15, fontWeight: '700' },
    catSub: { fontSize: 12, marginTop: 2, fontWeight: '500' },
    editBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

    barBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
    barFill: { height: '100%', borderRadius: 4 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    modalIconWrap: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    modalSub: { fontSize: 13, marginTop: 2 },
    modalInput: {
        borderWidth: 1.5, borderRadius: 14, padding: 16,
        fontSize: 20, fontWeight: '700', marginBottom: 20, textAlign: 'center',
    },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
});
