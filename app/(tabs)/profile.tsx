import { useAuth } from '@/utils/auth';
import { THEMES, ThemeName } from '@/constants/Themes';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, CURRENCIES } from '@/utils/currency';
import {
    Alert,
    Dimensions,
    Image,
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

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmt = (n: number, currency: string, rates: Record<string, number>, isHidden: boolean) => 
    formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

function MonthHeatmap({ activeDays, colorsNav }: {
    activeDays: Map<string, number>;
    colorsNav: any;
}) {
    const today = new Date();
    const todayKey = toKey(today);
    const month = today.getMonth();
    const year = today.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const startOffset = (firstWeekDay === 0 ? 6 : firstWeekDay - 1); 

    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const totalActive = [...activeDays.keys()].filter(k => {
        const d = new Date(k);
        return d.getMonth() === month && d.getFullYear() === year;
    }).length;

    return (
        <View style={[mSt.card, { backgroundColor: colorsNav.card }]}>
            <View style={mSt.header}>
                <View>
                    <Text style={[mSt.monthName, { color: colorsNav.text }]}>
                        {MONTH_NAMES_FULL[month]} {year}
                    </Text>
                    <Text style={[mSt.subtitle, { color: colorsNav.sub }]}>Actividad financiera</Text>
                </View>
                <View style={[mSt.pill, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={[mSt.pillTxt, { color: '#4A7C59' }]}>{totalActive} días activos</Text>
                </View>
            </View>
            <View style={mSt.weekRow}>
                {DAY_HEADERS.map((d, i) => (
                    <View key={i} style={mSt.dayHeader}>
                        <Text style={[mSt.dayHeaderTxt, { color: colorsNav.sub }]}>{d}</Text>
                    </View>
                ))}
            </View>
            {Array.from({ length: cells.length / 7 }, (_, row) => (
                <View key={row} style={mSt.weekRow}>
                    {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                        if (day === null) return <View key={col} style={mSt.cell} />;
                        const k = toKey(new Date(year, month, day));
                        const count = activeDays.get(k) ?? 0;
                        const isToday = k === todayKey;
                        const isFuture = new Date(year, month, day) > today;
                        let bgColor = colorsNav.bg;
                        if (isFuture) bgColor = 'transparent';
                        else if (count > 0) bgColor = '#4A7C59';
                        return (
                            <View key={col} style={mSt.cell}>
                                <View style={[
                                    mSt.dayCircle,
                                    { backgroundColor: bgColor },
                                    isToday && { borderWidth: 2, borderColor: colorsNav.accent },
                                ]}>
                                    <Text style={[
                                        mSt.dayNum,
                                        { color: count > 0 ? '#FFF' : colorsNav.text },
                                        isFuture && { color: colorsNav.sub + '50' },
                                        isToday && { fontWeight: '900' }
                                    ]}>
                                        {day}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const mSt = StyleSheet.create({
    card: { borderRadius: 24, padding: 20, marginBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    monthName: { fontSize: 18, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 2 },
    pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    pillTxt: { fontSize: 11, fontWeight: '800' },
    weekRow: { flexDirection: 'row', marginBottom: 8 },
    dayHeader: { flex: 1, alignItems: 'center' },
    dayHeaderTxt: { fontSize: 11, fontWeight: '700', opacity: 0.6 },
    cell: { flex: 1, alignItems: 'center' },
    dayCircle: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    dayNum: { fontSize: 12, fontWeight: '600' },
});

const CAT_INFO: Record<string, any> = {
    'Hogar': { icon: 'home', color: '#4CAF50', bg: '#E8F5E9' },
    'Transporte': { icon: 'directions-car', color: '#00BCD4', bg: '#E0F7FA' },
    'Comida': { icon: 'restaurant', color: '#F59E0B', bg: '#FFF0E0' },
    'Supermercado': { icon: 'shopping-cart', color: '#F59E0B', bg: '#FFF0E0' },
    'Salud': { icon: 'favorite', color: '#E91E63', bg: '#FCE4EC' },
    'Educación': { icon: 'school', color: '#3B82F6', bg: '#E3F0FF' },
    'Entretenimiento': { icon: 'sports-esports', color: '#EC4899', bg: '#FDF2F8' },
    'Otros': { icon: 'more-horiz', color: '#94A3B8', bg: '#F1F5F9' },
};

import { LineChart } from 'react-native-chart-kit';

function CategoryStatistics({ transactions, colorsNav, isHidden, currency, rates }: { 
    transactions: any[]; 
    colorsNav: any; 
    isHidden: boolean; 
    currency: string;
    rates: Record<string, number>;
}) {
    const today = new Date();
    const currMonth = today.getMonth();
    const currYear = today.getFullYear();
    const thisMonthExpenses = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });
    const thisMonthTotal = thisMonthExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const categoryTotals: Record<string, number> = {};
    thisMonthExpenses.forEach(t => {
        const cat = t.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount || 0);
    });
    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(...sortedCats.map(c => c[1]), 1);

    const chartLabels: string[] = [];
    const chartData: number[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(currYear, currMonth - i, 1);
        chartLabels.push(MONTH_NAMES[d.getMonth()]);
        const monthTotal = transactions.filter(t => {
            const td = new Date(t.date);
            return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
        chartData.push(monthTotal);
    }

    return (
        <View style={{ gap: 24 }}>
            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 15 }]}>Histórico (6 meses)</Text>
                <LineChart
                    data={{ labels: chartLabels, datasets: [{ data: chartData }] }}
                    width={Dimensions.get('window').width - 70}
                    height={180}
                    yAxisLabel="$"
                    chartConfig={{
                        backgroundColor: colorsNav.card,
                        backgroundGradientFrom: colorsNav.card,
                        backgroundGradientTo: colorsNav.card,
                        decimalPlaces: 0,
                        color: (opacity = 1) => colorsNav.accent,
                        labelColor: (opacity = 1) => colorsNav.sub,
                        style: { borderRadius: 16 },
                        propsForDots: { r: "5", strokeWidth: "2", stroke: colorsNav.accent }
                    }}
                    bezier
                    style={{ marginVertical: 8, borderRadius: 16, marginLeft: -15 }}
                />
            </View>
            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text }]}>Gasto Total este Mes</Text>
                <Text style={[statStyle.compVal, { color: colorsNav.text, fontSize: 32 }]}>{fmt(thisMonthTotal, currency, rates, isHidden)}</Text>
            </View>
            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 20 }]}>Gastos por Categoría</Text>
                {sortedCats.map(([cat, val]) => {
                    const info = CAT_INFO[cat] || CAT_INFO['Otros'];
                    return (
                        <View key={cat} style={statStyle.barRow}>
                            <View style={[statStyle.barIcon, { backgroundColor: info.bg }]}>
                                <MaterialIcons name={info.icon} size={18} color={info.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={statStyle.barHeaders}>
                                    <Text style={[statStyle.barLabel, { color: colorsNav.text }]}>{cat}</Text>
                                    <Text style={[statStyle.barAmount, { color: colorsNav.text }]}>{fmt(val, currency, rates, isHidden)}</Text>
                                </View>
                                <View style={[statStyle.barTrack, { backgroundColor: colorsNav.bg }]}>
                                    <View style={[statStyle.barFill, { width: `${(val / maxVal) * 100}%`, backgroundColor: info.color }]} />
                                </View>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const statStyle = StyleSheet.create({
    card: { borderRadius: 24, padding: 24 },
    title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    compVal: { fontSize: 24, fontWeight: '900' },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    barIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    barHeaders: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    barLabel: { fontSize: 14, fontWeight: '700' },
    barAmount: { fontSize: 14, fontWeight: '800' },
    barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
});

export default function ProfileScreen() {
    const router = useRouter();
    const { user, theme, setThemeConfig, currency, setCurrencyConfig, rates, isHidden, logout } = useAuth();
    const isFocused = useIsFocused();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [statsModalVisible, setStatsModalVisible] = useState(false);
    const [weeklyModalVisible, setWeeklyModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);

    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDays, setActiveDays] = useState<Map<string, number>>(new Map());
    const [newName, setNewName] = useState(user?.user_metadata?.name || '');
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [weeklySpending, setWeeklySpending] = useState(0);
    const [weeklySummaryData, setWeeklySummaryData] = useState<[string, number][]>([]);

    const scrollRef = useRef<any>(null);

    useEffect(() => { 
        if (isFocused) {
            loadData(); 
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
    }, [isFocused]);
    useEffect(() => {
        AsyncStorage.getItem(`@avatar_${user?.id}`).then(uri => { if (uri) setAvatarUri(uri); });
    }, [user]);

    const loadData = async () => {
        if (!user) return;
        const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id);
        const txs = data || [];
        setTransactions(txs);
        const map = new Map<string, number>();
        txs.forEach(tx => {
            const k = toKey(new Date(tx.date));
            map.set(k, (map.get(k) ?? 0) + 1);
        });
        setActiveDays(map);
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const weekTxs = txs.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && new Date(t.date) >= weekAgo);
        setWeeklySpending(weekTxs.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0));
        const catMap: Record<string, number> = {};
        weekTxs.forEach(t => { catMap[t.category || 'Otros'] = (catMap[t.category || 'Otros'] || 0) + Math.abs(t.amount || 0); });
        setWeeklySummaryData(Object.entries(catMap).sort((a, b) => b[1] - a[1]));
    };

    const handleUpdateName = async () => {
        if (!newName.trim()) return;
        await supabase.auth.updateUser({ data: { name: newName.trim() } });
        setEditModalVisible(false);
    };

    const handleLogout = async () => { await logout(); router.replace('/login'); };

    const handlePickAvatar = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
        if (!result.canceled && result.assets[0]) {
            setAvatarUri(result.assets[0].uri);
            await AsyncStorage.setItem(`@avatar_${user?.id}`, result.assets[0].uri);
        }
    };

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const initials = displayName.slice(0, 2).toUpperCase();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Perfil</Text>
                    <TouchableOpacity style={[styles.themeBtn, { backgroundColor: colorsNav.card }]} onPress={() => setThemeModalVisible(true)}>
                        <Ionicons name="color-palette" size={22} color={colorsNav.accent} />
                    </TouchableOpacity>
                </View>

                <View style={[styles.profileCard, { backgroundColor: colorsNav.card }]}>
                    <View style={styles.profileTop}>
                        <TouchableOpacity style={[styles.avatar, { backgroundColor: colorsNav.accent }]} onPress={handlePickAvatar}>
                            {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} /> : <Text style={styles.avatarTxt}>{initials}</Text>}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <View style={styles.nameRow}>
                                <Text style={[styles.name, { color: colorsNav.text }]}>{displayName}</Text>
                                <TouchableOpacity onPress={() => setEditModalVisible(true)}><MaterialIcons name="edit" size={16} color={colorsNav.sub} /></TouchableOpacity>
                            </View>
                            <Text style={[styles.email, { color: colorsNav.sub }]}>{user?.email}</Text>
                        </View>
                    </View>
                    <View style={styles.actionRow}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]} onPress={handleLogout}>
                            <MaterialIcons name="logout" size={18} color="#EF4444" /><Text style={{ color: '#EF4444', fontWeight: '800' }}>Salir</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.optionsGrid}>
                    <TouchableOpacity style={[styles.optBtn, { backgroundColor: '#FF8A6520' }]} onPress={() => setWeeklyModalVisible(true)}>
                        <View style={[styles.optIcon, { backgroundColor: '#FF8A65' }]}><MaterialIcons name="auto-graph" size={20} color="#FFF" /></View>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Semanal</Text>
                        <Text style={{ fontSize: 11, color: colorsNav.sub }}>Gasto últimos 7 días</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.optBtn, { backgroundColor: colorsNav.accent + '20' }]} onPress={() => setStatsModalVisible(true)}>
                        <View style={[styles.optIcon, { backgroundColor: colorsNav.accent }]}><MaterialIcons name="analytics" size={20} color="#FFF" /></View>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Estadísticas</Text>
                        <Text style={{ fontSize: 11, color: colorsNav.sub }}>Análisis de consumos</Text>
                    </TouchableOpacity>
                </View>

                <MonthHeatmap activeDays={activeDays} colorsNav={colorsNav} />
                
                {/* Botón de Presupuestos abajo del calendario */}
                <TouchableOpacity 
                    style={[styles.budgetFullBtn, { backgroundColor: colorsNav.card }]} 
                    onPress={() => router.push('/budgets')}
                >
                    <View style={[styles.optIcon, { backgroundColor: '#3B82F6', marginBottom: 0 }]}>
                        <MaterialIcons name="savings" size={20} color="#FFF" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Presupuestos</Text>
                        <Text style={{ fontSize: 11, color: colorsNav.sub }}>Controla tus límites de gasto</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { color: colorsNav.sub, marginTop: 24 }]}>AJUSTES DE LA APP</Text>
                <View style={[styles.profileCard, { backgroundColor: colorsNav.card, paddingVertical: 10 }]}>
                    <TouchableOpacity style={styles.listItem} onPress={() => setCurrencyModalVisible(true)}>
                        <View style={[styles.listIcon, { backgroundColor: colorsNav.accent + '15' }]}><MaterialIcons name="payments" size={20} color={colorsNav.accent} /></View>
                        <View style={{ flex: 1 }}><Text style={[styles.listTitle, { color: colorsNav.text }]}>Moneda</Text><Text style={[styles.listSub, { color: colorsNav.sub }]}>{currency}</Text></View>
                        <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                    </TouchableOpacity>
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modals */}
            <Modal visible={themeModalVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={[styles.themeSheet, { backgroundColor: colorsNav.card }]}>
                        <View style={styles.sheetHandle} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <View>
                                <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 2 }]}>Personaliza tu app</Text>
                                <Text style={{ fontSize: 12, color: colorsNav.sub }}>Elige el estilo que más te guste</Text>
                            </View>
                            <TouchableOpacity style={[styles.closeCircle, { backgroundColor: isDark ? '#333' : '#F1F1F1' }]} onPress={() => setThemeModalVisible(false)}>
                                <Ionicons name="close" size={20} color={colorsNav.text} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {[
                                { label: 'Sanctuary', light: 'light' as ThemeName, dark: 'dark' as ThemeName, lightColor: '#4A7C59', darkColor: '#2D5A3D', lightBg: '#FFF8F0', darkBg: '#1A1A2E' },
                                { label: 'Lavanda',  light: 'lavender' as ThemeName, dark: 'lavender_dark' as ThemeName, lightColor: '#7C5DBA', darkColor: '#9D7FE0', lightBg: '#F8F7FF', darkBg: '#1A1625' },
                                { label: 'Océano',  light: 'ocean' as ThemeName, dark: 'ocean_dark' as ThemeName, lightColor: '#008080', darkColor: '#26A69A', lightBg: '#F0F9FA', darkBg: '#0A1A1A' },
                                { label: 'Rosa',  light: 'rose' as ThemeName, dark: 'rose_dark' as ThemeName, lightColor: '#E05C6E', darkColor: '#E07080', lightBg: '#FFF5F5', darkBg: '#1A0E0E' },
                                { label: 'Ámbar',  light: 'amber' as ThemeName, dark: 'amber_dark' as ThemeName, lightColor: '#D97706', darkColor: '#F59E0B', lightBg: '#FFFBF0', darkBg: '#1A1400' },
                                { label: 'Índigo',  light: 'slate' as ThemeName, dark: 'midnight' as ThemeName, lightColor: '#3B5BDB', darkColor: '#818CF8', lightBg: '#F5F7FA', darkBg: '#0D0D1A' },
                                { label: 'Nieve',  light: 'snow' as ThemeName, dark: 'dark' as ThemeName, lightColor: '#64748B', darkColor: '#A09B8C', lightBg: '#FFFFFF', darkBg: '#1A1A2E' },
                            ].map((group) => {
                                const isLightActive = theme === group.light;
                                const isDarkActive = theme === group.dark;
                                return (
                                    <View key={group.label} style={styles.themeRow}>
                                        <View style={styles.themeRowLabel}>
                                            <Text style={styles.themeEmoji}>{group.emoji}</Text>
                                            <Text style={[styles.themeGroupName, { color: colorsNav.text }]}>{group.label}</Text>
                                        </View>
                                        <View style={styles.themeSwatchRow}>
                                            <TouchableOpacity
                                                style={[styles.swatch, { backgroundColor: group.lightBg }, isLightActive && [styles.swatchActive, { borderColor: group.lightColor }]]}
                                                onPress={() => { setThemeConfig(group.light); setThemeModalVisible(false); }}
                                            >
                                                <View style={[styles.swatchDot, { backgroundColor: group.lightColor }]} />
                                                <Text style={[styles.swatchLabel, { color: group.lightColor }]}>Claro</Text>
                                                {isLightActive && <View style={[styles.swatchCheck, { backgroundColor: group.lightColor }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.swatch, { backgroundColor: group.darkBg }, isDarkActive && [styles.swatchActive, { borderColor: group.darkColor }]]}
                                                onPress={() => { setThemeConfig(group.dark); setThemeModalVisible(false); }}
                                            >
                                                <View style={[styles.swatchDot, { backgroundColor: group.darkColor }]} />
                                                <Text style={[styles.swatchLabel, { color: group.darkColor }]}>Oscuro</Text>
                                                {isDarkActive && <View style={[styles.swatchCheck, { backgroundColor: group.darkColor }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}
                            <View style={{ height: 30 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={statsModalVisible} animationType="slide">
                <SafeAreaView style={{ flex: 1, backgroundColor: colorsNav.bg }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setStatsModalVisible(false)}><MaterialIcons name="close" size={28} color={colorsNav.text} /></TouchableOpacity>
                        <Text style={[styles.modalHeaderTitle, { color: colorsNav.text }]}>Análisis de Gastos</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <CategoryStatistics transactions={transactions} colorsNav={colorsNav} isHidden={isHidden} currency={currency} rates={rates} />
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            <Modal visible={weeklyModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, width: '100%' }]}>
                        <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 0 }]}>Gasto Semanal</Text>
                            <TouchableOpacity onPress={() => setWeeklyModalVisible(false)}><MaterialIcons name="close" size={24} color={colorsNav.sub} /></TouchableOpacity>
                        </View>
                        <View style={{ alignItems: 'center', marginVertical: 20 }}>
                            <Text style={{ fontSize: 12, color: colorsNav.sub, fontWeight: '700' }}>TOTAL ÚLTIMOS 7 DÍAS</Text>
                            <Text style={{ fontSize: 36, fontWeight: '900', color: '#EF4444' }}>{fmt(weeklySpending, currency, rates, isHidden)}</Text>
                        </View>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {weeklySummaryData.map(([cat, amt]) => {
                                const info = CAT_INFO[cat] || CAT_INFO['Otros'];
                                return (
                                    <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 }}>
                                        <View style={[mSt.dayCircle, { backgroundColor: info.bg, width: 36, height: 36 }]}><MaterialIcons name={info.icon} size={18} color={info.color} /></View>
                                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colorsNav.text }}>{cat}</Text>
                                        <Text style={{ fontSize: 14, fontWeight: '800', color: colorsNav.text }}>{fmt(amt, currency, rates, isHidden)}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <TouchableOpacity style={{ padding: 18, backgroundColor: colorsNav.accent, borderRadius: 18, alignItems: 'center', marginTop: 20 }} onPress={() => setWeeklyModalVisible(false)}>
                            <Text style={{ color: '#FFF', fontWeight: '800' }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={currencyModalVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32 }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Moneda Principal</Text>
                        {CURRENCIES.map(curr => (
                            <TouchableOpacity key={curr.code} style={styles.listItem} onPress={() => { setCurrencyConfig(curr.code); setCurrencyModalVisible(false); }}>
                                <Text style={{ color: colorsNav.text, fontWeight: '700' }}>{curr.name} ({curr.code})</Text>
                                {currency === curr.code && <MaterialIcons name="check" size={20} color={colorsNav.accent} />}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setCurrencyModalVisible(false)}><Text style={{ color: colorsNav.sub }}>Cerrar</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={editModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Editar Nombre</Text>
                        <TextInput style={{ borderWidth: 1, borderColor: colorsNav.border, borderRadius: 12, padding: 16, color: colorsNav.text, marginBottom: 20 }} value={newName} onChangeText={setNewName} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colorsNav.bg, alignItems: 'center' }} onPress={() => setEditModalVisible(false)}><Text style={{ color: colorsNav.text }}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colorsNav.accent, alignItems: 'center' }} onPress={handleUpdateName}><Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 50, marginBottom: 20 },
    headerTitle: { fontSize: 28, fontWeight: '800' },
    themeBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 20 },
    profileCard: { borderRadius: 28, padding: 24, marginBottom: 16, elevation: 2 },
    profileTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    avatar: { width: 64, height: 64, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    avatarImg: { width: 64, height: 64, borderRadius: 24 },
    avatarTxt: { color: '#FFF', fontSize: 24, fontWeight: '800' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: 20, fontWeight: '800' },
    email: { fontSize: 13, marginTop: 2, opacity: 0.7 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 16 },
    optionsGrid: { flexWrap: 'wrap', flexDirection: 'row', gap: 16, marginBottom: 16 },
    optBtn: { flex: 1, padding: 18, borderRadius: 24, gap: 4 },
    optIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    optTitle: { fontSize: 15, fontWeight: '800' },
    budgetFullBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, elevation: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalBox: { borderRadius: 32, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
    listItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, justifyContent: 'space-between' },
    listIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    listTitle: { fontSize: 15, fontWeight: '700' },
    listSub: { fontSize: 12, marginTop: 2 },
    sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginLeft: 6, marginBottom: 12, opacity: 0.8 },
    themeSheet: { borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 28, paddingTop: 16, maxHeight: '85%' },
    sheetHandle: { width: 40, height: 4, backgroundColor: '#CCC', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
    closeCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    themeRow: { marginBottom: 20 },
    themeRowLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    themeEmoji: { fontSize: 18 },
    themeGroupName: { fontSize: 14, fontWeight: '800' },
    themeSwatchRow: { flexDirection: 'row', gap: 12 },
    swatch: { flex: 1, height: 72, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center', gap: 4, position: 'relative' },
    swatchActive: { borderWidth: 2.5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    swatchDot: { width: 22, height: 22, borderRadius: 11 },
    swatchLabel: { fontSize: 11, fontWeight: '800' },
    swatchCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    modalHeaderTitle: { fontSize: 18, fontWeight: '800' },
});
