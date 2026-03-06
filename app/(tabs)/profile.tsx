import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';

const MONTH_NAMES_FULL = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtCOP = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

function MonthHeatmap({ activeDays, isDark, theme, colors }: {
    activeDays: Map<string, number>;
    isDark: boolean;
    theme: string;
    colors: any;
}) {
    const today = new Date();
    const todayKey = toKey(today);
    const month = today.getMonth();
    const year = today.getFullYear();

    // Días del mes
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Día de la semana del 1ro (0=Dom → ajustamos a Lun=0)
    const firstWeekDay = new Date(year, month, 1).getDay();
    const startOffset = (firstWeekDay === 0 ? 6 : firstWeekDay - 1); // Lun-based

    // Construir celdas: prefix vacíos + días reales
    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Completar última fila con nulos
    while (cells.length % 7 !== 0) cells.push(null);

    // Racha actual
    const streak = (() => {
        let s = 0;
        const t = new Date(today);
        while (activeDays.has(toKey(t))) { s++; t.setDate(t.getDate() - 1); }
        return s;
    })();

    const totalActive = [...activeDays.keys()].filter(k => {
        const d = new Date(k);
        return d.getMonth() === month && d.getFullYear() === year;
    }).length;

    return (
        <View style={[mSt.card, { backgroundColor: colors.card }]}>
            {/* Cabecera */}
            <View style={mSt.header}>
                <View>
                    <Text style={[mSt.monthName, { color: colors.text }]}>
                        {MONTH_NAMES_FULL[month]} {year}
                    </Text>
                    <Text style={[mSt.subtitle, { color: colors.sub }]}>
                        Actividad financiera
                    </Text>
                </View>
                <View style={{ gap: 6, alignItems: 'flex-end' }}>
                    <View style={mSt.pill}>
                        <Text style={mSt.pillTxt}>✅ {totalActive} días</Text>
                    </View>
                    {streak > 0 && (
                        <View style={[mSt.pill, { backgroundColor: 'rgba(124,58,237,0.1)' }]}>
                            <Text style={[mSt.pillTxt, { color: '#7C3AED' }]}>🔥 {streak} racha</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Encabezados de días */}
            <View style={mSt.weekRow}>
                {DAY_HEADERS.map(d => (
                    <View key={d} style={mSt.dayHeader}>
                        <Text style={[mSt.dayHeaderTxt, { color: colors.sub }]}>{d}</Text>
                    </View>
                ))}
            </View>

            {/* Cuadrícula */}
            {Array.from({ length: cells.length / 7 }, (_, row) => (
                <View key={row} style={mSt.weekRow}>
                    {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                        if (day === null) return <View key={col} style={mSt.cell} />;
                        const k = toKey(new Date(year, month, day));
                        const count = activeDays.get(k) ?? 0;
                        const isToday = k === todayKey;
                        const isFuture = new Date(year, month, day) > today;

                        const bgColor = isFuture
                            ? 'transparent'
                            : count > 0
                                ? '#22C55E'
                                : ['dark', 'purple', 'blue', 'pink'].includes(theme) ? colors.bg : '#EEF2F7';

                        return (
                            <View key={col} style={mSt.cell}>
                                <View style={[
                                    mSt.dayCircle,
                                    { backgroundColor: bgColor },
                                    isToday && {
                                        borderWidth: 2,
                                        borderColor: '#7C3AED',
                                        backgroundColor: count > 0 ? '#22C55E' : 'transparent',
                                    },
                                ]}>
                                    <Text style={[
                                        mSt.dayNum,
                                        isFuture && { color: ['dark', 'purple', 'blue', 'pink'].includes(theme) ? colors.sub : '#D1D5DB' },
                                        !isFuture && count === 0 && { color: colors.text },
                                        !isFuture && count > 0 && { color: '#FFF' },
                                        isToday && { color: colors.sub, fontWeight: '800' },
                                        isToday && count > 0 && { color: '#FFF' },
                                    ]}>
                                        {day}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ))}

            {/* Leyenda */}
            <View style={mSt.legend}>
                <View style={[mSt.legendDot, { backgroundColor: ['dark', 'purple', 'blue', 'pink'].includes(theme) ? colors.bg : '#EEF2F7' }]} />
                <Text style={[mSt.legendTxt, { color: colors.sub }]}>Sin actividad</Text>
                <View style={[mSt.legendDot, { backgroundColor: '#22C55E' }]} />
                <Text style={[mSt.legendTxt, { color: colors.sub }]}>Con actividad</Text>
                <View style={[mSt.legendDot, { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#7C3AED' }]} />
                <Text style={[mSt.legendTxt, { color: colors.sub }]}>Hoy</Text>
            </View>
        </View>
    );
}

const mSt = StyleSheet.create({
    card: {
        borderRadius: 22, padding: 18, marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
    monthName: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { fontSize: 12, marginTop: 2 },
    pill: { backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    pillTxt: { fontSize: 11, fontWeight: '700', color: '#16A34A' },

    weekRow: { flexDirection: 'row', marginBottom: 4 },
    dayHeader: { flex: 1, alignItems: 'center', marginBottom: 6 },
    dayHeaderTxt: { fontSize: 11, fontWeight: '700' },

    cell: { flex: 1, alignItems: 'center', marginBottom: 4 },
    dayCircle: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    dayNum: { fontSize: 13, fontWeight: '600' },

    legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' },
    legendDot: { width: 12, height: 12, borderRadius: 4 },
    legendTxt: { fontSize: 11 },
});

// ─── Estadísticas de Categorías ────────────────────────────────────────────────
function CategoryStatistics({ transactions, isDark, colors }: { transactions: any[]; isDark: boolean; colors: any }) {
    const expenses = transactions.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Ahorros');

    const categoryTotals: Record<string, number> = {};
    expenses.forEach(t => {
        const cat = t.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(Math.abs(t.amount));
    });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);

    if (labels.length === 0) {
        return (
            <View style={[mSt.card, { backgroundColor: colors.card, marginTop: 16 }]}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 8 }}>Estadísticas</Text>
                <Text style={{ color: colors.sub }}>Aún no hay gastos registrados para mostrar gráficos.</Text>
            </View>
        );
    }

    const screenWidth = Dimensions.get('window').width - 68;

    // Omitimos o reducimos textos muy largos de las etiquetas (max 6 caracteres)
    const shortLabels = labels.map(l => l.length > 6 ? l.substring(0, 6) + '..' : l);

    const chartConfig = {
        backgroundGradientFrom: colors.card,
        backgroundGradientTo: colors.card,
        color: (opacity = 1) => isDark ? `rgba(99, 102, 241, ${opacity})` : `rgba(79, 70, 229, ${opacity})`,
        labelColor: (opacity = 1) => isDark ? `rgba(241, 245, 249, ${opacity})` : `rgba(30, 41, 59, ${opacity})`,
        strokeWidth: 2,
        barPercentage: 0.6,
        useShadowColorFromDataset: false,
        propsForLabels: { fontSize: 10 },
        decimalPlaces: 0,
    };

    const pieColors = ['#F87171', '#60A5FA', '#34D399', '#FBBF24', '#A78BFA', '#F472B6', '#38BDF8'];
    const pieData = labels.map((label, index) => ({
        name: label,
        population: data[index],
        color: pieColors[index % pieColors.length],
        legendFontColor: colors.text,
        legendFontSize: 11
    }));

    return (
        <View style={[mSt.card, { backgroundColor: colors.card, marginTop: 16 }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 16, letterSpacing: -0.5 }}>Estadísticas de Gastos</Text>

            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.sub, marginBottom: 10 }}>1. Gráfico de Barras</Text>
            <BarChart
                data={{ labels: shortLabels, datasets: [{ data }] }}
                width={screenWidth}
                height={220}
                yAxisLabel="$"
                yAxisSuffix=""
                chartConfig={chartConfig}
                verticalLabelRotation={0}
                style={{ borderRadius: 16, marginBottom: 24, marginLeft: -10 }}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.sub, marginBottom: 10 }}>2. Gráfico Circular (Pie)</Text>
            <PieChart
                data={pieData}
                width={screenWidth}
                height={200}
                chartConfig={chartConfig}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"0"}
                center={[0, 0]}
                style={{ borderRadius: 16, marginBottom: 24 }}
            />

            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.sub, marginBottom: 10 }}>3. Gráfico de Líneas</Text>
            <LineChart
                data={{ labels: shortLabels, datasets: [{ data }] }}
                width={screenWidth}
                height={220}
                yAxisLabel="$"
                yAxisSuffix=""
                chartConfig={chartConfig}
                bezier
                style={{ borderRadius: 16, marginBottom: 6, marginLeft: -10 }}
            />
        </View>
    );
}

// ─── Pantalla principal ────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const { user, logout, theme, toggleTheme } = useAuth();
    const router = useRouter();
    const isFocused = useIsFocused();
    const isDark = theme === 'dark';

    const getColors = (t: string) => {
        switch (t) {
            case 'pink': return { bg: '#FDF2F8', card: '#FBCFE8', text: '#831843', sub: '#DB2777', border: '#F9A8D4' };
            case 'purple': return { bg: '#F5F3FF', card: '#ddd6fe', text: '#4C1D95', sub: '#7C3AED', border: '#C4B5FD' };
            case 'blue': return { bg: '#EFF6FF', card: '#bfdbfe', text: '#1E3A8A', sub: '#3B82F6', border: '#93C5FD' };
            case 'dark': return { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155' };
            default: return { bg: '#F4F6FF', card: '#FFFFFF', text: '#1E293B', sub: '#64748B', border: '#E2E8F0' };
        }
    };
    const colors = getColors(theme);
    const whiteColors = { bg: '#FFFFFF', card: '#FFFFFF', text: '#1E293B', sub: '#64748B', border: '#E2E8F0' };

    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDays, setActiveDays] = useState<Map<string, number>>(new Map());
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [statsModalVisible, setStatsModalVisible] = useState(false);
    const [newName, setNewName] = useState(user?.user_metadata?.name || '');

    useEffect(() => { if (isFocused) loadData(); }, [isFocused]);

    const loadData = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('transactions').select('*').eq('user_id', user.id);
            if (error) throw error;
            const txs = data || [];
            setTransactions(txs);
            const map = new Map<string, number>();
            txs.forEach(tx => {
                const k = toKey(new Date(tx.date));
                map.set(k, (map.get(k) ?? 0) + 1);
            });
            setActiveDays(map);
        } catch (e) { console.error(e); }
    };

    const handleUpdateName = async () => {
        if (!newName.trim() || !user) return;
        try {
            await supabase.auth.updateUser({ data: { name: newName.trim() } });
            setEditModalVisible(false);
            Alert.alert('¡Éxito!', 'Nombre actualizado.');
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    const handleLogout = () => {
        Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
        ]);
    };

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const email = user?.email || '';
    const initials = displayName.slice(0, 2).toUpperCase();

    // Resumen rápido
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense' && t.category !== 'Ahorro').reduce((s, t) => s + t.amount, 0);
    const savings = transactions.filter(t => t.category === 'Ahorro').reduce((s, t) => s + t.amount, 0);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* ── Perfil ── */}
                <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <TouchableOpacity style={styles.avatar} onPress={() => setEditModalVisible(true)}>
                            <Text style={styles.avatarText}>{initials}</Text>
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <TouchableOpacity onPress={() => setEditModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
                                <MaterialIcons name="edit" size={14} color={colors.sub} />
                            </TouchableOpacity>
                            <Text style={[styles.email, { color: colors.sub }]}>{email}</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.themeBtn, { backgroundColor: isDark ? '#334155' : theme === 'purple' ? '#C4B5FD' : theme === 'blue' ? '#93C5FD' : theme === 'pink' ? '#F9A8D4' : '#F1F5F9' }]}
                            onPress={toggleTheme}
                        >
                            <Ionicons name={theme === 'dark' ? 'moon' : theme === 'purple' ? 'color-palette' : theme === 'blue' ? 'water' : theme === 'pink' ? 'flower' : 'sunny'} size={18} color={theme === 'purple' ? '#4C1D95' : theme === 'blue' ? '#1E3A8A' : theme === 'pink' ? '#831843' : '#6366F1'} />
                        </TouchableOpacity>
                    </View>

                    {/* Stats rápidos */}
                    <View style={styles.statsRow}>
                        {[
                            { label: 'Ingresos', value: fmtCOP(income), color: '#10B981' },
                            { label: 'Gastos', value: fmtCOP(expense), color: '#EF4444' },
                            { label: 'Ahorro', value: fmtCOP(savings), color: '#6366F1' },
                        ].map(s => (
                            <View key={s.label} style={[styles.statBox, { backgroundColor: isDark ? '#334155' : '#F8FAFF' }]}>
                                <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
                                <Text style={[styles.statLabel, { color: colors.sub }]}>{s.label}</Text>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                        <MaterialIcons name="logout" size={15} color="#EF4444" />
                        <Text style={styles.logoutText}>Cerrar Sesión</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Heatmap del mes actual ── */}
                <MonthHeatmap activeDays={activeDays} isDark={isDark} theme={theme} colors={colors} />

                {/* ── Botón de Estadísticas ── */}
                <TouchableOpacity
                    style={[styles.statsBtn, { backgroundColor: isDark ? '#334155' : '#E0E7FF' }]}
                    onPress={() => setStatsModalVisible(true)}
                >
                    <Ionicons name="pie-chart" size={20} color="#6366F1" />
                    <Text style={styles.statsBtnText}>Ver Estadísticas de Gastos</Text>
                </TouchableOpacity>

                <View style={{ height: 110 }} />
            </ScrollView>

            {/* Modal editar nombre */}
            <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>Editar nombre</Text>
                        <TextInput
                            style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                            value={newName}
                            onChangeText={setNewName}
                            placeholder="Tu nombre"
                            placeholderTextColor={colors.sub}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.border }]} onPress={() => setEditModalVisible(false)}>
                                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#6366F1' }]} onPress={handleUpdateName}>
                                <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal de Estadísticas */}
            <Modal visible={statsModalVisible} animationType="slide" onRequestClose={() => setStatsModalVisible(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setStatsModalVisible(false)}>
                            <Ionicons name="close" size={28} color="#1E293B" />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitleCentral, { color: '#1E293B' }]}>Mis Estadísticas</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 16 }}>
                        <CategoryStatistics transactions={transactions} isDark={false} colors={whiteColors} />
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 16, paddingTop: Platform.OS === 'android' ? 48 : 16 },

    profileCard: {
        borderRadius: 22, padding: 18, marginBottom: 16,
        shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    },
    avatar: {
        width: 54, height: 54, borderRadius: 27, backgroundColor: '#6366F1',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { color: '#FFF', fontSize: 20, fontWeight: '800' },
    name: { fontSize: 18, fontWeight: '800' },
    email: { fontSize: 13, marginTop: 2 },
    themeBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

    statsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
    statBox: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 3 },
    statVal: { fontSize: 12, fontWeight: '800' },
    statLabel: { fontSize: 10, fontWeight: '600' },

    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 14, alignSelf: 'flex-start',
        paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10,
        backgroundColor: 'rgba(239,68,68,0.08)',
    },
    logoutText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },

    statsBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 8, paddingVertical: 14, borderRadius: 16,
    },
    statsBtnText: { color: '#6366F1', fontWeight: '800', fontSize: 15 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalBox: { width: '100%', borderRadius: 24, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
    modalInput: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 20 },
    modalBtn: { flex: 1, height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 40 : 16, paddingBottom: 16 },
    closeBtn: { padding: 4 },
    modalTitleCentral: { fontSize: 18, fontWeight: '800' },
});
