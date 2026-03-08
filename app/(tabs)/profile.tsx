import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

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
const CAT_ICONS: Record<string, any> = {
    'Hogar': { icon: 'home', color: '#F97316' },
    'Transporte': { icon: 'directions-car', color: '#6366F1' },
    'Comida': { icon: 'restaurant', color: '#F43F5E' },
    'Servicios': { icon: 'build', color: '#8B5CF6' },
    'Salud': { icon: 'medical-services', color: '#10B981' },
    'Educación': { icon: 'school', color: '#3B82F6' },
    'Entretenimiento': { icon: 'sports-esports', color: '#EC4899' },
    'Otros': { icon: 'more-horiz', color: '#94A3B8' },
};

function CategoryStatistics({ transactions, isDark, colors }: { transactions: any[]; isDark: boolean; colors: any }) {
    const today = new Date();
    const currMonth = today.getMonth();
    const currYear = today.getFullYear();

    const lastMonthDate = new Date(currYear, currMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastYear = lastMonthDate.getFullYear();

    // Gastos de este mes
    const thisMonthExpenses = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });

    // Gastos del mes pasado
    const lastMonthExpenses = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    });

    const thisMonthTotal = thisMonthExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const lastMonthTotal = lastMonthExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    // Desglose por categoría (mes actual)
    const categoryTotals: Record<string, number> = {};
    thisMonthExpenses.forEach(t => {
        const cat = t.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount || 0);
    });

    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    if (thisMonthExpenses.length === 0 && lastMonthExpenses.length === 0) {
        return (
            <View style={[statStyle.card, { backgroundColor: colors.card, marginTop: 16 }]}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 8 }}>Análisis Mensual</Text>
                <Text style={{ color: colors.sub }}>Aún no hay suficientes datos para generar un análisis comparativo.</Text>
            </View>
        );
    }

    const highestCat = sortedCats[0] ? sortedCats[0][0] : null;
    const highestVal = sortedCats[0] ? sortedCats[0][1] : 0;
    const maxVal = Math.max(...sortedCats.map(c => c[1]), 1);

    // Comparación porcentual
    const diff = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
    const isHigher = thisMonthTotal > lastMonthTotal;

    return (
        <View style={{ gap: 24, paddingBottom: 40 }}>
            {/* ── Comparativa Mensual ── */}
            <View>
                <Text style={[statStyle.sectionLabel, { color: colors.text }]}>RESUMEN COMPARATIVO</Text>
                <View style={statStyle.dividerSmall} />

                <View style={[statStyle.compareCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={statStyle.compareRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={[statStyle.compareLabel, { color: colors.sub }]}>Mes Anterior</Text>
                            <Text style={[statStyle.compareVal, { color: colors.text }]}>{fmtCOP(lastMonthTotal)}</Text>
                        </View>
                        <View style={statStyle.compareDivider} />
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={[statStyle.compareLabel, { color: colors.sub }]}>Mes Actual</Text>
                            <Text style={[statStyle.compareVal, { color: '#6366F1' }]}>{fmtCOP(thisMonthTotal)}</Text>
                        </View>
                    </View>

                    {lastMonthTotal > 0 && (
                        <View style={[statStyle.diffBadge, { backgroundColor: isHigher ? '#FEF2F2' : '#F0FDF4' }]}>
                            <MaterialIcons
                                name={isHigher ? 'trending-up' : 'trending-down'}
                                size={16}
                                color={isHigher ? '#EF4444' : '#10B981'}
                            />
                            <Text style={[statStyle.diffText, { color: isHigher ? '#EF4444' : '#10B981' }]}>
                                {isHigher ? 'Gastaste un' : 'Ahorraste un'} {Math.abs(diff).toFixed(1)}% comparado al mes pasado
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* ── Categoría Más Costosa ── */}
            {highestCat && (
                <View style={[statStyle.insightCard, { backgroundColor: (CAT_ICONS[highestCat]?.color || '#94A3B8') + '15' }]}>
                    <View style={[statStyle.insightIcon, { backgroundColor: CAT_ICONS[highestCat]?.color || '#94A3B8' }]}>
                        <MaterialIcons name={CAT_ICONS[highestCat]?.icon || 'stars'} size={24} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[statStyle.insightTitle, { color: colors.text }]}>Mayor Gasto</Text>
                        <Text style={[statStyle.insightDesc, { color: colors.sub }]}>
                            Tu mayor gasto este mes es en <Text style={{ fontWeight: '800', color: colors.text }}>{highestCat}</Text> con {fmtCOP(highestVal)}.
                        </Text>
                    </View>
                </View>
            )}

            {/* ── Desglose por Categoría ── */}
            <View>
                <Text style={[statStyle.sectionLabel, { color: colors.text }]}>GASTO POR CATEGORÍA</Text>
                <View style={statStyle.dividerSmall} />

                <View style={{ marginTop: 10, gap: 16 }}>
                    {sortedCats.map(([cat, val]) => {
                        const info = CAT_ICONS[cat] || CAT_ICONS['Otros'];
                        const widthPct = (val / maxVal) * 100;
                        return (
                            <View key={cat} style={statStyle.hBarRow}>
                                <View style={[statStyle.hBarIcon, { backgroundColor: info.color }]}>
                                    <MaterialIcons name={info.icon} size={18} color="#FFF" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={[statStyle.hBarLabel, { color: colors.text }]}>{cat}</Text>
                                        <Text style={[statStyle.hBarVal, { color: colors.text }]}>{fmtCOP(val)}</Text>
                                    </View>
                                    <View style={[statStyle.barBg, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                                        <View style={[statStyle.barFill, { width: `${widthPct}%`, backgroundColor: info.color }]} />
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </View>
        </View>
    );
}

const statStyle = StyleSheet.create({
    sectionLabel: { fontSize: 16, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
    dividerSmall: { width: 30, height: 3, backgroundColor: '#6366F1', borderRadius: 2, marginBottom: 12 },

    compareCard: { borderRadius: 20, padding: 20, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    compareRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    compareLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
    compareVal: { fontSize: 20, fontWeight: '800' },
    compareDivider: { width: 1, height: 40, backgroundColor: '#E2E8F0', marginHorizontal: 15 },
    diffBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 12 },
    diffText: { fontSize: 12, fontWeight: '700' },

    insightCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 24 },
    insightIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    insightTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
    insightDesc: { fontSize: 13, lineHeight: 18 },

    hBarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hBarIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    hBarLabel: { fontSize: 14, fontWeight: '700' },
    hBarVal: { fontSize: 14, fontWeight: '800' },
    barBg: { height: 10, borderRadius: 5, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 5 },

    card: { borderRadius: 22, padding: 18, marginBottom: 16 },
});

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
                <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
                    <View style={[styles.modalHeader, { backgroundColor: colors.bg }]}>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setStatsModalVisible(false)}>
                            <Ionicons name="close" size={28} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitleCentral, { color: colors.text }]}>Mis Estadísticas</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: colors.bg }}>
                        <CategoryStatistics transactions={transactions} isDark={isDark} colors={colors} />
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
