import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as NotificationsUtils from '@/utils/notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { THEMES, ThemeName } from '@/constants/Themes';
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
    Switch,
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
    const { user, theme, setThemeConfig, currency, setCurrencyConfig, rates, setRatesConfig, syncRates, isHidden, toggleHiddenMode, logout } = useAuth();
    const isFocused = useIsFocused();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [lockEnabled, setLockEnabled] = useState(false);
    const [lockMethod, setLockMethod] = useState<'pin' | 'biometric'>('pin');
    const [lockPin, setLockPin] = useState('');
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [tempPin, setTempPin] = useState('');
    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [ratesModalVisible, setRatesModalVisible] = useState(false);
    const [statsModalVisible, setStatsModalVisible] = useState(false);
    const [weeklyModalVisible, setWeeklyModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [tempRates, setTempRates] = useState<Record<string, number>>({ ...rates });
    const [showTimer, setShowTimer] = useState(false);
    const [tempH, setTempH] = useState('');
    const [tempM, setTempM] = useState('');

    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDays, setActiveDays] = useState<Map<string, number>>(new Map());
    const [newName, setNewName] = useState(user?.user_metadata?.name || '');
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [weeklySpending, setWeeklySpending] = useState(0);
    const [weeklySummaryData, setWeeklySummaryData] = useState<[string, number][]>([]);
    const [reminders, setReminders] = useState(false);
    const [reminderTime, setReminderTime] = useState(new Date(0, 0, 0, 20, 30));

    useEffect(() => { loadLockSettings(); }, [isFocused]);
    useEffect(() => { if (isFocused) loadData(); }, [isFocused]);
    useEffect(() => {
        AsyncStorage.getItem(`@avatar_${user?.id}`).then(uri => { if (uri) setAvatarUri(uri); });
        loadReminders();
    }, [user]);

    const loadLockSettings = async () => {
        const enabled = await AsyncStorage.getItem('@lock_enabled');
        const method = await AsyncStorage.getItem('@lock_method') || 'pin';
        const pin = await AsyncStorage.getItem('@lock_pin') || '';
        setLockEnabled(enabled === 'true');
        setLockMethod(method as any);
        setLockPin(pin);
    };

    const loadReminders = async () => {
        const val = await AsyncStorage.getItem('user_reminders');
        setReminders(val === 'true');
        const h = await AsyncStorage.getItem('user_reminders_h');
        const m = await AsyncStorage.getItem('user_reminders_m');
        if (h && m) {
            const d = new Date(); d.setHours(parseInt(h)); d.setMinutes(parseInt(m));
            setReminderTime(d);
        }
    };

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

    const toggleLock = async (val: boolean) => {
        if (val && !lockPin) { setPinModalVisible(true); return; }
        setLockEnabled(val);
        await AsyncStorage.setItem('@lock_enabled', val ? 'true' : 'false');
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

    const toggleReminders = async () => {
        const newVal = !reminders; setReminders(newVal);
        await AsyncStorage.setItem('user_reminders', newVal ? 'true' : 'false');
    };

    const saveNewPin = async () => {
        if (tempPin.length !== 4) return;
        setLockPin(tempPin);
        await AsyncStorage.setItem('@lock_pin', tempPin);
        setPinModalVisible(false);
        setTempPin('');
    };

    const saveManualTime = async () => {
        let h = parseInt(tempH); let m = parseInt(tempM);
        const newDate = new Date(); newDate.setHours(h); newDate.setMinutes(m);
        setReminderTime(newDate); setShowTimer(false);
        await AsyncStorage.setItem('user_reminders_h', h.toString());
        await AsyncStorage.setItem('user_reminders_m', m.toString());
    };

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const initials = displayName.slice(0, 2).toUpperCase();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
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

                <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>AJUSTES</Text>
                <View style={[styles.profileCard, { backgroundColor: colorsNav.card, paddingVertical: 10 }]}>
                    <TouchableOpacity style={styles.listItem} onPress={() => setCurrencyModalVisible(true)}>
                        <View style={[styles.listIcon, { backgroundColor: colorsNav.accent + '15' }]}><MaterialIcons name="payments" size={20} color={colorsNav.accent} /></View>
                        <View style={{ flex: 1 }}><Text style={[styles.listTitle, { color: colorsNav.text }]}>Moneda</Text><Text style={[styles.listSub, { color: colorsNav.sub }]}>{currency}</Text></View>
                        <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                    </TouchableOpacity>
                    <View style={styles.listItem}>
                        <View style={[styles.listIcon, { backgroundColor: '#FFD70015' }]}><MaterialIcons name="notifications" size={20} color="#DAA520" /></View>
                        <View style={{ flex: 1 }}><Text style={[styles.listTitle, { color: colorsNav.text }]}>Avisos</Text></View>
                        <Switch onValueChange={toggleReminders} value={reminders} trackColor={{ true: colorsNav.accent }} />
                    </View>
                    <View style={styles.listItem}>
                        <View style={[styles.listIcon, { backgroundColor: '#EF444415' }]}><MaterialIcons name="security" size={20} color="#EF4444" /></View>
                        <View style={{ flex: 1 }}><Text style={[styles.listTitle, { color: colorsNav.text }]}>Bloqueo (PIN)</Text></View>
                        <Switch onValueChange={toggleLock} value={lockEnabled} trackColor={{ true: '#EF4444' }} />
                    </View>
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modals */}
            <Modal visible={themeModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, width: '90%' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 0 }]}>Tema</Text>
                            <TouchableOpacity onPress={() => setThemeModalVisible(false)}><Ionicons name="close" size={24} color={colorsNav.sub} /></TouchableOpacity>
                        </View>
                        <View style={styles.themeGrid}>
                            {[
                                { label: 'Original', light: 'light', dark: 'dark', color: '#4A7C59' },
                                { label: 'Lavanda', light: 'lavender', dark: 'lavender_dark', color: '#7C5DBA' },
                                { label: 'Océano', light: 'ocean', dark: 'ocean_dark', color: '#008080' },
                                { label: 'Nieve', light: 'snow', dark: 'dark', color: '#64748B' },
                            ].map((group) => (
                                <View key={group.label} style={styles.themeGroup}>
                                    <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.text, marginBottom: 8 }}>{group.label}</Text>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <TouchableOpacity style={[styles.themeOption, theme === group.light && { borderColor: group.color, borderWidth: 2 }]} onPress={() => { setThemeConfig(group.light as any); setThemeModalVisible(false); }}>
                                            <View style={[styles.colorIndicator, { backgroundColor: group.color }]} /><Text style={{ fontSize: 10, color: colorsNav.text }}>Claro</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.themeOption, { backgroundColor: '#1E293B' }, theme === group.dark && { borderColor: group.color, borderWidth: 2 }]} onPress={() => { setThemeConfig(group.dark as any); setThemeModalVisible(false); }}>
                                            <View style={[styles.colorIndicator, { backgroundColor: group.color }]} /><Text style={{ fontSize: 10, color: '#FFF' }}>Oscuro</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={statsModalVisible} animationType="slide">
                <SafeAreaView style={{ flex: 1, backgroundColor: colorsNav.bg }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setStatsModalVisible(false)}><MaterialIcons name="close" size={28} color={colorsNav.text} /></TouchableOpacity>
                        <Text style={[styles.modalHeaderTitle, { color: colorsNav.text }]}>Estadísticas</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <CategoryStatistics transactions={transactions} colorsNav={colorsNav} isHidden={isHidden} currency={currency} rates={rates} />
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            {/* Modal Resumen Semanal */}
            <Modal visible={weeklyModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, width: '100%' }]}>
                        <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 0 }]}>Análisis Semanal</Text>
                            <TouchableOpacity onPress={() => setWeeklyModalVisible(false)}><MaterialIcons name="close" size={24} color={colorsNav.sub} /></TouchableOpacity>
                        </View>
                        
                        <View style={{ alignItems: 'center', marginVertical: 20 }}>
                            <Text style={{ fontSize: 12, color: colorsNav.sub, fontWeight: '700' }}>TOTAL GASTADO</Text>
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
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Moneda</Text>
                        {CURRENCIES.map(curr => (
                            <TouchableOpacity key={curr.code} style={styles.listItem} onPress={() => { setCurrencyConfig(curr.code); setCurrencyModalVisible(false); }}>
                                <Text style={{ color: colorsNav.text }}>{curr.name} ({curr.code})</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => { setCurrencyModalVisible(false); setRatesModalVisible(true); }}>
                            <Text style={{ color: colorsNav.accent, fontWeight: '700' }}>Configurar Tasas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setCurrencyModalVisible(false)}><Text style={{ color: colorsNav.sub }}>Cerrar</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={pinModalVisible} animationType="fade" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: '85%', backgroundColor: colorsNav.card, borderRadius: 32, padding: 30, alignItems: 'center' }}>
                         <Text style={{ fontSize: 20, fontWeight: '900', color: colorsNav.text, marginBottom: 10 }}>Nuevo PIN</Text>
                         <TextInput 
                             style={{ width: '100%', height: 60, borderRadius: 16, backgroundColor: isDark ? '#1A1A2E' : '#F5EDE0', textAlign: 'center', fontSize: 24, letterSpacing: 10, fontWeight: '900', color: colorsNav.text }}
                             keyboardType="numeric" maxLength={4} secureTextEntry value={tempPin} onChangeText={setTempPin} autoFocus
                         />
                         <View style={{ flexDirection: 'row', gap: 15, marginTop: 30 }}>
                             <TouchableOpacity onPress={() => setPinModalVisible(false)}><Text style={{ color: colorsNav.sub }}>Cancelar</Text></TouchableOpacity>
                             <TouchableOpacity onPress={saveNewPin}><Text style={{ color: colorsNav.accent, fontWeight: '800' }}>Guardar</Text></TouchableOpacity>
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
    optionsGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    optBtn: { flex: 1, padding: 18, borderRadius: 24, gap: 4 },
    optIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    optTitle: { fontSize: 15, fontWeight: '800' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalBox: { borderRadius: 32, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
    listItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
    listIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    listTitle: { fontSize: 15, fontWeight: '700' },
    listSub: { fontSize: 12, marginTop: 2 },
    sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginLeft: 6, marginBottom: 12, opacity: 0.8 },
    themeGrid: { gap: 20 },
    themeGroup: { gap: 4 },
    themeOption: { flex: 1, height: 50, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderColor: '#DDD' },
    colorIndicator: { width: 10, height: 10, borderRadius: 5 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    modalHeaderTitle: { fontSize: 18, fontWeight: '800' },
});
