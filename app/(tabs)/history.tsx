import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
// Eliminado: MagicAuraButton
import React, { useEffect, useRef, useState } from 'react';
import { ThemeName } from '@/constants/Themes';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency } from '@/utils/currency';
import {
    Alert,
    Dimensions,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { PieChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;





export default function HistoryScreen() {
    const isFocused = useIsFocused();
    const { user, theme, currency, rates, isHidden } = useAuth();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;
    const PIE_COLORS = [colorsNav.accent, '#8B5CF6', '#F59E0B', '#3B82F6', '#EF4444', '#00BCD4', '#E91E63'];

    const [transactions, setTransactions] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [showChart, setShowChart] = useState(false);
    const scrollRef = useRef<any>(null);

    useEffect(() => {
        if (isFocused) {
            loadData();
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
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
        const desc = tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description;
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Quieres eliminar "${desc}"?`)) {
                (async () => {
                    const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
                    if (!error) setTransactions(prev => prev.filter(t => t.id !== tx.id));
                })();
            }
            return;
        }
        Alert.alert(
            'Eliminar transacción',
            `¿Quieres eliminar "${desc}"?`,
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

    const totalIngresos = transactions.filter(t => t.type === 'income' && t.category !== 'Transferencia' && t.category !== 'Ahorro').reduce((s, t) => s + t.amount, 0);
    const totalGastos = transactions.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia').reduce((s, t) => s + t.amount, 0);
    const totalAhorro = transactions.filter(t => t.category === 'Ahorro').reduce((s, t) => s + t.amount, 0);

    // Datos para el gráfico
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
            color: PIE_COLORS[i % PIE_COLORS.length],
            legendFontColor: colorsNav.sub,
            legendFontSize: 12,
        }));

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    const getTxIconInfo = (tx: any) => {
        if (tx.type === 'income') {
            if (tx.category === 'Transferencia') return { icon: 'swap-horiz', bg: colorsNav.accent + '20', color: colorsNav.accent };
            return { icon: 'call-received', bg: colorsNav.accent + '20', color: colorsNav.accent };
        }
        if (tx.category === 'Ahorro') return { icon: 'savings', bg: '#F0E6FF', color: '#8B5CF6' };
        if (tx.category === 'Comida' || tx.category === 'Supermercado') return { icon: 'shopping-cart', bg: '#FFF0E0', color: '#F59E0B' };
        if (tx.category === 'Transporte') return { icon: 'directions-car', bg: '#E0F7FA', color: '#00BCD4' };
        if (tx.category === 'Salud') return { icon: 'favorite', bg: '#FCE4EC', color: '#E91E63' };
        if (tx.category === 'Hogar') return { icon: 'home', bg: '#E8F5E9', color: '#4CAF50' };
        if (tx.category === 'Transferencia') return { icon: 'swap-horiz', bg: '#E3F0FF', color: '#3B82F6' };
        return { icon: 'bolt', bg: '#FFF8E1', color: '#FF9800' };
    };

    const formatTxDate = (tx: any) => {
        const dateStr = tx.date;
        if (!dateStr) return '';
        
        const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
        const txDate = new Date(normalized);
        const timeSource = tx.created_at ? new Date(tx.created_at) : txDate;

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const isToday = txDate.toDateString() === today.toDateString();
        const isYesterday = txDate.toDateString() === yesterday.toDateString();

        const timeStr = timeSource.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

        if (isToday) return `HOY, ${timeStr}`;
        if (isYesterday) return `AYER, ${timeStr}`;
        return `${txDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).toUpperCase()}, ${timeStr}`;
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            {/* ── Header ────────────────────────────────────────────────── */}
            <View style={styles.header}>
                <View>
                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Historial</Text>
                    <Text style={[styles.headerSub, { color: colorsNav.sub }]}>{transactions.length} transacciones registradas</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TouchableOpacity
                        style={[styles.chartToggleBtn, { backgroundColor: showChart ? colorsNav.accent : (isDark ? '#3A3A52' : '#F5EDE0') }]}
                        onPress={() => setShowChart(!showChart)}
                    >
                        <Ionicons name="pie-chart" size={16} color={showChart ? '#FFF' : colorsNav.accent} />
                        <Text style={[styles.chartToggleText, { color: showChart ? '#FFF' : colorsNav.accent }]}>
                            {showChart ? 'Ver Lista' : 'Gráfico'}
                        </Text>
                    </TouchableOpacity>
{/* Eliminado: MagicAuraButton */}
                </View>
            </View>

            {/* ── Resumen Rápido Sanctuary ──────────────────────────────── */}
            {!showChart && (
                <View style={styles.summaryRow}>
                    <View style={[styles.summaryCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                        <View style={[styles.miniIcon, { backgroundColor: '#E3F0FF' }]}>
                            <MaterialIcons name="call-received" size={12} color="#3B82F6" />
                        </View>
                        <Text style={[styles.summaryLabel, { color: colorsNav.sub }]}>INGRESOS</Text>
                        <Text style={[styles.summaryValue, { color: colorsNav.text }]}>{fmt(totalIngresos)}</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                        <View style={[styles.miniIcon, { backgroundColor: '#FFEBEE' }]}>
                            <MaterialIcons name="call-made" size={12} color="#EF4444" />
                        </View>
                        <Text style={[styles.summaryLabel, { color: colorsNav.sub }]}>GASTOS</Text>
                        <Text style={[styles.summaryValue, { color: colorsNav.text }]}>{fmt(totalGastos)}</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                        <View style={[styles.miniIcon, { backgroundColor: '#F0E6FF' }]}>
                            <MaterialIcons name="savings" size={12} color="#8B5CF6" />
                        </View>
                        <Text style={[styles.summaryLabel, { color: colorsNav.sub }]}>AHORRO</Text>
                        <Text style={[styles.summaryValue, { color: colorsNav.text }]}>{fmt(totalAhorro)}</Text>
                    </View>
                </View>
            )}

            {/* ── Gráfico de Gastos ────────────────────────────────────── */}
            {showChart && (
                <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
                    {pieData.length > 0 ? (
                        <View style={[styles.chartCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                            <Text style={[styles.chartTitle, { color: colorsNav.text }]}>Distribución de Gastos (Mes Actual)</Text>
                            <PieChart
                                data={pieData}
                                width={screenWidth - 40}
                                height={220}
                                chartConfig={{
                                    color: (opacity = 1) => `${colorsNav.accent}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
                                }}
                                accessor="amount"
                                backgroundColor="transparent"
                                paddingLeft="15"
                                absolute={false}
                            />
                        </View>
                    ) : (
                        <View style={[styles.chartCard, { backgroundColor: isDark ? colorsNav.card : '#FFF', alignItems: 'center', paddingVertical: 40 }]}>
                            <Ionicons name="pie-chart-outline" size={48} color={colorsNav.sub} />
                            <Text style={[styles.chartEmptyText, { color: colorsNav.sub }]}>No hay gastos registrados este mes</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            {/* ── Lista de Transacciones ────────────────────────────────── */}
            {!showChart && (
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colorsNav.accent} />}
                >
                    {transactions.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <MaterialIcons name="receipt-long" size={60} color={isDark ? '#3A3A52' : '#E0D8CC'} />
                            <Text style={[styles.emptyTitle, { color: colorsNav.text }]}>Sin movimientos</Text>
                            <Text style={[styles.emptySub, { color: colorsNav.sub }]}>Tus transacciones aparecerán aquí</Text>
                        </View>
                    ) : (
                        transactions.map(tx => {
                            const iconInfo = getTxIconInfo(tx);
                            return (
                                <TouchableOpacity
                                    key={tx.id}
                                    style={[styles.txCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}
                                    onLongPress={() => handleDelete(tx)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.txIcon, { backgroundColor: isDark ? colorsNav.cardBg : iconInfo.bg }]}>
                                        <MaterialIcons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
                                    </View>

                                    <View style={styles.txInfo}>
                                        <Text style={[styles.txTitle, { color: colorsNav.text }]} numberOfLines={1}>
                                            {tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description}
                                        </Text>
                                        <View style={styles.txMeta}>
                                            <Text style={[styles.txSub, { color: colorsNav.sub }]}>{formatTxDate(tx)}</Text>
                                            <View style={styles.dot} />
                                            <Text style={[styles.txSub, { color: colorsNav.sub }]} numberOfLines={1}>{tx.category}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.txRight}>
                                        <Text style={[
                                            styles.txAmount,
                                            tx.category === 'Ahorro' ? { color: '#8B5CF6' } : (tx.type === 'income' ? { color: colorsNav.accent } : { color: '#EF4444' })
                                        ]}>
                                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                                        </Text>
                                        {(tx.account && tx.account !== 'Ahorro') && (
                                            <Text style={[styles.accText, { color: colorsNav.sub }]}>{tx.account}</Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}
                    <Text style={[styles.swipeHint, { color: colorsNav.sub }]}>💡 Mantén presionada una transacción para eliminarla</Text>
                    <View style={{ height: 120 }} />
                </ScrollView>
            )}
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
        paddingBottom: 20,
    },
    headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    headerSub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
    chartToggleBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 14,
    },
    chartToggleText: { fontSize: 13, fontWeight: '700' },

    summaryRow: {
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 20, marginBottom: 20,
    },
    summaryCard: {
        flex: 1, borderRadius: 18, padding: 14, gap: 6,
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
    },
    miniIcon: {
        width: 24, height: 24, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    },
    summaryLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    summaryValue: { fontSize: 13, fontWeight: '800' },

    listContent: { paddingHorizontal: 20 },
    chartCard: {
        marginHorizontal: 20, borderRadius: 24, padding: 20, marginTop: 10,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, elevation: 3,
    },
    chartTitle: { fontSize: 16, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
    chartEmptyText: { fontSize: 14, marginTop: 12, fontWeight: '600' },

    emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800' },
    emptySub: { fontSize: 14, textAlign: 'center' },

    txCard: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: 20, padding: 14, marginBottom: 10,
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 2,
    },
    txIcon: {
        width: 44, height: 44, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
    },
    txInfo: { flex: 1, marginLeft: 14 },
    txTitle: { fontSize: 15, fontWeight: '700' },
    txMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    txSub: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' },

    txRight: { alignItems: 'flex-end' },
    txAmount: { fontSize: 15, fontWeight: '800' },
    accText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 4, letterSpacing: 0.5 },

    swipeHint: { textAlign: 'center', fontSize: 12, marginTop: 24, fontWeight: '500' },
});
