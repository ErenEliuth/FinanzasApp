import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { PieChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

const CAT_COLORS: Record<string, string> = {
    'Comida':          '#F43F5E',
    'Transporte':      '#6366F1',
    'Hogar':           '#F97316',
    'Salud':           '#10B981',
    'Educación':       '#3B82F6',
    'Entretenimiento': '#EC4899',
    'Deudas':          '#EF4444',
    'Gasto Fijo':      '#F59E0B',
    'Ropa':            '#8B5CF6',
    'Recibos':         '#64748B',
    'Gimnasio':        '#14B8A6',
};
const FALLBACK_COLORS = ['#6366F1','#10B981','#F59E0B','#EC4899','#3B82F6','#F97316','#8B5CF6','#14B8A6'];

export default function HistoryScreen() {
    const isFocused = useIsFocused();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark' || ['purple', 'blue', 'pink'].includes(theme);

    const colors = {
        bg: isDark ? '#0F172A' : '#F4F6FF',
        card: isDark ? '#1E293B' : '#FFFFFF',
        text: isDark ? '#F1F5F9' : '#1E293B',
        sub: isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#334155' : '#F1F5F9',
    };

    const [transactions, setTransactions] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [showChart, setShowChart] = useState(false);

    useEffect(() => {
        if (isFocused) loadData();
    }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('transactions')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .order('id', { ascending: false });

            if (error) throw error;
            setTransactions(data || []);
        } catch (e) {
            console.error('Error cargando historial:', e);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleDelete = (tx: any) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Quieres eliminar "${tx.description}"?`)) {
                (async () => {
                    const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
                    if (!error) setTransactions(prev => prev.filter(t => t.id !== tx.id));
                })();
            }
            return;
        }
        Alert.alert(
            'Eliminar transacción',
            `¿Quieres eliminar "${tx.description}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
                        if (!error) setTransactions(prev => prev.filter(t => t.id !== tx.id));
                    },
                },
            ]
        );
    };

    // Totales
    const today = new Date();
    const currMonth = today.getMonth();
    const currYear = today.getFullYear();

    const totalIngresos = transactions.filter(t => t.type === 'income' && t.category !== 'Transferencia').reduce((s, t) => s + t.amount, 0);
    const totalGastos = transactions.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia').reduce((s, t) => s + t.amount, 0);
    const totalAhorro = transactions.filter(t => t.category === 'Ahorro').reduce((s, t) => s + t.amount, 0);

    // Datos para el gráfico de torta (gastos del mes actual por categoría)
    const monthExpenses = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });
    const catTotals: Record<string, number> = {};
    monthExpenses.forEach(t => {
        const c = t.category || 'Otros';
        catTotals[c] = (catTotals[c] || 0) + t.amount;
    });
    const pieData = Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount], i) => ({
            name,
            amount,
            color: CAT_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
            legendFontColor: isDark ? '#94A3B8' : '#64748B',
            legendFontSize: 12,
        }));

    const fmt = (n: number) =>
        isHidden
            ? '****'
            : new Intl.NumberFormat('es-CO', {
                style: 'currency', currency: 'COP', minimumFractionDigits: 0
              }).format(n);

    const fmtDate = (iso: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        const day = d.getDate().toString().padStart(2, '0');
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const month = months[d.getMonth()];
        return `${day} ${month}`;
    };

    const getIcon = (tx: any) => {
        if (tx.category === 'Ahorro') return 'wallet';
        if (tx.type === 'income') return 'trending-up';
        return 'trending-down';
    };

    const getIconColor = (tx: any) =>
        tx.category === 'Ahorro' ? (isDark ? '#A5B4FC' : '#6366F1') :
            tx.type === 'income' ? '#10B981' : '#EF4444';

    const getIconBg = (tx: any) =>
        tx.category === 'Ahorro' ? 'rgba(99,102,241,0.12)' :
            tx.type === 'income' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';

    const getLabel = (tx: any) =>
        tx.category === 'Ahorro' ? 'Ahorro' :
            tx.type === 'income' ? 'Ingreso' : 'Gasto';

    const getBadgeBg = (tx: any) =>
        tx.category === 'Ahorro' ? 'rgba(99,102,241,0.12)' :
            tx.type === 'income' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';



    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.bg }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Historial</Text>
                    <Text style={[styles.headerSub, { color: colors.sub }]}>{transactions.length} transacciones</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                        style={[styles.chartToggleBtn, { backgroundColor: showChart ? '#6366F1' : (isDark ? '#334155' : '#E0E7FF') }]}
                        onPress={() => setShowChart(!showChart)}
                    >
                        <Ionicons name="pie-chart" size={16} color={showChart ? '#FFF' : '#6366F1'} />
                        <Text style={[styles.chartToggleText, { color: showChart ? '#FFF' : '#6366F1' }]}>
                            {showChart ? 'Ocultar' : 'Gráfico'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Summary cards */}
            <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                    <MaterialIcons name="trending-up" size={15} color="#10B981" />
                    <Text style={styles.summaryLabel}>Ingresos</Text>
                    <Text style={[styles.summaryValue, { color: '#10B981' }]}>{fmt(totalIngresos)}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <MaterialIcons name="trending-down" size={15} color="#EF4444" />
                    <Text style={styles.summaryLabel}>Gastos</Text>
                    <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{fmt(totalGastos)}</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
                    <Ionicons name="wallet" size={15} color="#6366F1" />
                    <Text style={styles.summaryLabel}>Ahorro</Text>
                    <Text style={[styles.summaryValue, { color: '#6366F1' }]}>{fmt(totalAhorro)}</Text>
                </View>
            </View>

            {/* Gráfico de torta */}
            {showChart && pieData.length > 0 && (
                <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
                    <Text style={[styles.chartTitle, { color: colors.text }]}>Gastos este mes por categoría</Text>
                    <PieChart
                        data={pieData}
                        width={screenWidth - 32}
                        height={180}
                        chartConfig={{
                            color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
                            backgroundColor: 'transparent',
                            backgroundGradientFrom: 'transparent',
                            backgroundGradientTo: 'transparent',
                        }}
                        accessor="amount"
                        backgroundColor="transparent"
                        paddingLeft="10"
                        absolute={false}
                    />
                </View>
            )}
            {showChart && pieData.length === 0 && (
                <View style={[styles.chartCard, { backgroundColor: colors.card, alignItems: 'center', paddingVertical: 24 }]}>
                    <Ionicons name="pie-chart-outline" size={36} color={colors.sub} />
                    <Text style={[styles.chartEmptyText, { color: colors.sub }]}>Sin gastos registrados este mes</Text>
                </View>
            )}

            {/* Lista de transacciones */}
            <ScrollView
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
            >
                {transactions.length === 0 ? (
                    <View style={styles.emptyWrap}>
                        <MaterialIcons name="receipt-long" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyTitle}>Sin transacciones</Text>
                        <Text style={styles.emptySub}>Tus movimientos aparecerán aquí</Text>
                    </View>
                ) : (
                    transactions.map(tx => (
                        <TouchableOpacity
                            key={tx.id}
                            style={[styles.txCard, { backgroundColor: colors.card }]}
                            onLongPress={() => handleDelete(tx)}
                            activeOpacity={0.8}
                        >
                            {/* Icono */}
                            <View style={[styles.txIconCircle, { backgroundColor: getIconBg(tx) }]}>
                                {tx.category === 'Ahorro'
                                    ? <Ionicons name="wallet" size={18} color={getIconColor(tx)} />
                                    : <MaterialIcons name={getIcon(tx) as any} size={18} color={getIconColor(tx)} />
                                }
                            </View>

                            {/* Info */}
                            <View style={styles.txInfo}>
                                <Text style={[styles.txDesc, { color: colors.text }]} numberOfLines={1}>
                                    {tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description}
                                </Text>
                                <View style={styles.txMeta}>
                                    <View style={[styles.catBadge, { backgroundColor: colors.border }]}>
                                        <Text style={[styles.catText, { color: colors.sub }]} numberOfLines={1}>{tx.category}</Text>
                                    </View>
                                    {tx.account && tx.account !== 'Ahorro' && (
                                        <View style={[styles.accBadge, { borderColor: colors.border, borderWidth: 1 }]}>
                                            <Text style={[styles.accDate, { color: colors.sub }]} numberOfLines={1}>{tx.account}</Text>
                                        </View>
                                    )}
                                    <Text style={[styles.txDate, { color: colors.sub }]}>{fmtDate(tx.date)}</Text>
                                </View>
                            </View>

                            {/* Monto y tipo */}
                            <View style={styles.txRight}>
                                <Text style={[
                                    styles.txAmount,
                                    { color: getIconColor(tx) }
                                ]}>
                                    {tx.category === 'Ahorro' ? '' : (tx.type === 'income' ? '+' : '-')}{fmt(tx.amount)}
                                </Text>
                                <View style={[styles.typePill, { backgroundColor: getBadgeBg(tx) }]}>
                                    <Text style={[styles.typeLabel, { color: getIconColor(tx) }]}>
                                        {getLabel(tx)}
                                    </Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
                <Text style={styles.swipeHint}>💡 Mantén presionada una transacción para eliminarla</Text>
                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 50 : 20,
        paddingBottom: 12,
    },
    headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
    chartToggleBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 12,
    },
    chartToggleText: { fontSize: 12, fontWeight: '700' },
    chartCard: {
        marginHorizontal: 16, marginBottom: 12,
        borderRadius: 20, padding: 16,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    chartTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    chartEmptyText: { fontSize: 13, marginTop: 8, fontWeight: '500' },

    summaryRow: {
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 20, marginBottom: 16,
    },
    summaryCard: {
        flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 4,
    },
    summaryLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3 },
    summaryValue: { fontSize: 13, fontWeight: '800' },

    listContent: { paddingHorizontal: 20 },

    emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#94A3B8' },
    emptySub: { fontSize: 14, color: '#CBD5E1' },

    txCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 18, padding: 14, marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    },
    txIconCircle: {
        width: 42, height: 42, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    txInfo: { flex: 1, gap: 5 },
    txDesc: { fontSize: 15, fontWeight: '700' },
    txMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    catText: { fontSize: 11, fontWeight: '600' },
    txDate: { fontSize: 11 },

    txRight: { alignItems: 'flex-end', gap: 5 },
    txAmount: { fontSize: 15, fontWeight: '800' },
    typePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    typeLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },

    swipeHint: { textAlign: 'center', fontSize: 11, color: '#CBD5E1', marginTop: 12 },
    accBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
    accDate: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
});
