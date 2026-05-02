import { useAuth } from '@/utils/auth';
import { THEMES, ThemeName } from '@/constants/Themes';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, CURRENCIES } from '@/utils/currency';
import { uploadImage } from '@/utils/storage';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
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

const toKey = (d: Date) => {
    // Usamos componentes locales para asegurar consistencia
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (n: number, currency: string, rates: Record<string, number>, isHidden: boolean) => 
    formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

function MonthHeatmap({ activeDays, colorsNav, onDayPress, reminders }: {
    activeDays: Map<string, number>;
    colorsNav: any;
    onDayPress: (date: Date) => void;
    reminders: any[];
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
        const d = new Date(k + 'T12:00:00');
        return d.getMonth() === month && d.getFullYear() === year;
    }).length;

    return (
        <View style={[mSt.card, { backgroundColor: colorsNav.card }]}>
            <View style={mSt.header}>
                <View>
                    <Text style={[mSt.monthName, { color: colorsNav.text }]}>
                        {MONTH_NAMES_FULL[month]} {year}
                    </Text>
                    <Text style={[mSt.subtitle, { color: colorsNav.sub }]}>Tu agenda financiera</Text>
                </View>
                <View style={[mSt.pill, { backgroundColor: colorsNav.accent + '20' }]}>
                    <Text style={[mSt.pillTxt, { color: colorsNav.accent }]}>{totalActive} días activos</Text>
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
                        const dateObj = new Date(year, month, day);
                        const k = toKey(dateObj);
                        const count = activeDays.get(k) ?? 0;
                        const isToday = k === todayKey;
                        const isFuture = dateObj > today;
                        const hasReminder = reminders.some(r => r.due_day === day);

                        let bgColor = colorsNav.bg;
                        if (isFuture) bgColor = 'transparent';
                        else if (count > 0) bgColor = colorsNav.accent;

                        return (
                            <TouchableOpacity 
                                key={col} 
                                style={mSt.cell}
                                onPress={() => onDayPress(dateObj)}
                            >
                                <View style={[
                                    mSt.dayCircle,
                                    { backgroundColor: bgColor },
                                    isToday && { borderWidth: 2, borderColor: colorsNav.accent },
                                    hasReminder && { borderBottomWidth: 3, borderBottomColor: colorsNav.accent }
                                ]}>
                                    <Text style={[
                                        mSt.dayNum,
                                        { color: count > 0 ? '#FFF' : colorsNav.text },
                                        isFuture && { color: colorsNav.sub + (count > 0 ? '' : '50') },
                                        isToday && { fontWeight: '900' }
                                    ]}>
                                        {day}
                                    </Text>
                                    {hasReminder && (
                                        <View style={[mSt.reminderDot, { backgroundColor: count > 0 ? '#FFF' : colorsNav.accent }]} />
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const mSt = StyleSheet.create({
    card: { borderRadius: 24, padding: 16, marginBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    monthName: { fontSize: 16, fontWeight: '800' },
    subtitle: { fontSize: 11, marginTop: 2 },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    pillTxt: { fontSize: 10, fontWeight: '800' },
    weekRow: { flexDirection: 'row', marginBottom: 6 },
    dayHeader: { flex: 1, alignItems: 'center' },
    dayHeaderTxt: { fontSize: 10, fontWeight: '700', opacity: 0.6 },
    cell: { flex: 1, alignItems: 'center' },
    dayCircle: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    dayNum: { fontSize: 11, fontWeight: '600' },
    reminderDot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2 },
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
    
    // Gastos del mes
    const thisMonthExpenses = transactions.filter(t => {
        const normalizedDate = t.date.includes('T') ? t.date : `${t.date}T12:00:00`;
        const d = new Date(normalizedDate);
        return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });
    
    // Ingresos del mes
    const thisMonthIncome = transactions.filter(t => {
        const normalizedDate = t.date.includes('T') ? t.date : `${t.date}T12:00:00`;
        const d = new Date(normalizedDate);
        return t.type === 'income' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });

    const thisMonthExpTotal = thisMonthExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const thisMonthIncTotal = thisMonthIncome.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const categoryTotals: Record<string, number> = {};
    thisMonthExpenses.forEach(t => {
        const cat = t.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount || 0);
    });
    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(...sortedCats.map(c => c[1]), 1);

    const chartLabels: string[] = [];
    const chartExpData: number[] = [];
    const chartIncData: number[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(currYear, currMonth - i, 1);
        chartLabels.push(MONTH_NAMES[d.getMonth()]);
        
        const mExp = transactions.filter(t => {
            const normalizedDate = t.date.includes('T') ? t.date : `${t.date}T12:00:00`;
            const td = new Date(normalizedDate);
            return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
        
        const mInc = transactions.filter(t => {
            const normalizedDate = t.date.includes('T') ? t.date : `${t.date}T12:00:00`;
            const td = new Date(normalizedDate);
            return t.type === 'income' && t.category !== 'Transferencia' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

        chartExpData.push(mExp);
        chartIncData.push(mInc);
    }

    return (
        <View style={{ gap: 24 }}>
            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 15 }]}>Comparativa Ingresos vs Gastos</Text>
                <LineChart
                    data={{ 
                        labels: chartLabels, 
                        datasets: [
                            { data: chartIncData, color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, strokeWidth: 3 }, // Verde para ingresos
                            { data: chartExpData, color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`, strokeWidth: 3 } // Rojo para gastos
                        ],
                        legend: ["Ingresos", "Gastos"]
                    }}
                    width={Dimensions.get('window').width - 70}
                    height={200}
                    chartConfig={{
                        backgroundColor: colorsNav.card,
                        backgroundGradientFrom: colorsNav.card,
                        backgroundGradientTo: colorsNav.card,
                        decimalPlaces: 0,
                        color: (opacity = 1) => colorsNav.accent,
                        labelColor: (opacity = 1) => colorsNav.sub,
                        style: { borderRadius: 16 },
                        propsForDots: { r: "4", strokeWidth: "2", stroke: colorsNav.card }
                    }}
                    bezier
                    style={{ marginVertical: 8, borderRadius: 16, marginLeft: -15 }}
                />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[statStyle.card, { backgroundColor: colorsNav.card, flex: 1 }]}>
                    <Text style={[statStyle.title, { color: colorsNav.text, fontSize: 14 }]}>Ingresos Mes</Text>
                    <Text style={[statStyle.compVal, { color: '#10B981', fontSize: 20 }]}>{fmt(thisMonthIncTotal, currency, rates, isHidden)}</Text>
                </View>
                <View style={[statStyle.card, { backgroundColor: colorsNav.card, flex: 1 }]}>
                    <Text style={[statStyle.title, { color: colorsNav.text, fontSize: 14 }]}>Gastos Mes</Text>
                    <Text style={[statStyle.compVal, { color: '#EF4444', fontSize: 20 }]}>{fmt(thisMonthExpTotal, currency, rates, isHidden)}</Text>
                </View>
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
    const { user, theme, setThemeConfig, currency, setCurrencyConfig, rates, ratesUpdatedAt, syncRates, isHidden, logout } = useAuth();
    const isFocused = useIsFocused();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [statsModalVisible, setStatsModalVisible] = useState(false);
    const [weeklyModalVisible, setWeeklyModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [isSyncingRates, setIsSyncingRates] = useState(false);
    const [smartSavingsEnabled, setSmartSavingsEnabled] = useState<boolean | null>(null);

    const [libraryModalVisible, setLibraryModalVisible] = useState(false);
    const [selectedArticle, setSelectedArticle] = useState<any>(null);

    const [dayDetailModalVisible, setDayDetailModalVisible] = useState(false);
    const [addReminderModalVisible, setAddReminderModalVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [reminders, setReminders] = useState<any[]>([]);
    const [newReminderTitle, setNewReminderTitle] = useState('');
    const [newReminderAmount, setNewReminderAmount] = useState('');

    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDays, setActiveDays] = useState<Map<string, number>>(new Map());
    const [newName, setNewName] = useState(user?.user_metadata?.name || '');
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [weeklySpending, setWeeklySpending] = useState(0);
    const [weeklyIncome, setWeeklyIncome] = useState(0);
    const [weeklySummaryData, setWeeklySummaryData] = useState<[string, number][]>([]);

    const scrollRef = useRef<any>(null);

    useEffect(() => { 
        if (isFocused) {
            loadData(); 
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
    }, [isFocused]);
    useEffect(() => {
        const url = user?.user_metadata?.avatar_url;
        if (url) setAvatarUri(url);
    }, [user]);

    const loadData = async () => {
        if (!user) return;
        const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id);
        const txs = data || [];
        setTransactions(txs);
        const map = new Map<string, number>();
        txs.forEach(tx => {
            // Normalizamos a las 12:00:00 para evitar desajustes de zona horaria
            const normalizedDate = tx.date.includes('T') ? tx.date : `${tx.date}T12:00:00`;
            const k = toKey(new Date(normalizedDate));
            map.set(k, (map.get(k) ?? 0) + 1);
        });
        setActiveDays(map);
        const weekAgo = new Date(); 
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0,0,0,0);

        const weekTxs = txs.filter(t => {
            const normalizedDate = t.date.includes('T') ? t.date : `${t.date}T12:00:00`;
            const d = new Date(normalizedDate);
            return d >= weekAgo;
        });

        const wExpenses = weekTxs.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia');
        const wIncome = weekTxs.filter(t => t.type === 'income' && t.category !== 'Transferencia');

        setWeeklySpending(wExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0));
        setWeeklyIncome(wIncome.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0));

        const catMap: Record<string, number> = {};
        wExpenses.forEach(t => { catMap[t.category || 'Otros'] = (catMap[t.category || 'Otros'] || 0) + Math.abs(t.amount || 0); });
        setWeeklySummaryData(Object.entries(catMap).sort((a, b) => b[1] - a[1]));

        // Fetch reminders and fixed expenses
        const [remRes, fixedRes] = await Promise.all([
            supabase.from('reminders').select('*').eq('user_id', user.id),
            supabase.from('debts').select('*').eq('user_id', user.id).eq('debt_type', 'fixed')
        ]);

        const remData = remRes.data || [];
        const fixedData = (fixedRes.data || []).map(f => ({
            ...f,
            is_fixed_expense: true,
            title: f.client,
            amount: f.value,
            due_day: new Date(f.due_date + 'T12:00:00').getDate(),
            is_paid: f.paid >= f.value
        }));

        // Fetch smart savings state
        const rawPref = await AsyncStorage.getItem(SYNC_KEYS.SMART_SAVINGS(user.id));
        setSmartSavingsEnabled(rawPref === 'enabled');

        setReminders([...remData, ...fixedData]);
    };

    const handleAddReminder = async () => {
        if (!newReminderTitle.trim() || !user) return;
        const amount = parseFloat(newReminderAmount.replace(/\D/g, '')) || 0;
        const day = selectedDate ? selectedDate.getDate() : new Date().getDate();
        
        const { error } = await supabase.from('reminders').insert([{
            user_id: user.id,
            title: newReminderTitle.trim(),
            amount: amount,
            due_day: day
        }]);

        if (!error) {
            setAddReminderModalVisible(false);
            setNewReminderTitle('');
            setNewReminderAmount('');
            loadData();
        }
    };

    const handleDeleteReminder = async (id: string) => {
        const { error } = await supabase.from('reminders').delete().eq('id', id);
        if (!error) loadData();
    };

    const handleDayPress = (date: Date) => {
        setSelectedDate(date);
        setDayDetailModalVisible(true);
    };

    const getDayTransactions = (date: Date | null) => {
        if (!date) return [];
        const key = toKey(date);
        return transactions.filter(t => {
            const normalizedDate = t.date.includes('T') ? t.date : `${t.date}T12:00:00`;
            return toKey(new Date(normalizedDate)) === key && t.category !== 'Transferencia';
        });
    };

    const handleTogglePaid = async (reminder: any) => {
        if (reminder.is_fixed_expense) {
            const newValue = reminder.is_paid ? 0 : reminder.amount;
            const { error } = await supabase.from('debts').update({ paid: newValue }).eq('id', reminder.id);
            if (!error) loadData();
            return;
        }
        const { error } = await supabase.from('reminders').update({ is_paid: !reminder.is_paid }).eq('id', reminder.id);
        if (!error) loadData();
    };

    const getDayReminders = (date: Date | null) => {
        if (!date) return [];
        const day = date.getDate();
        const key = toKey(date);
        return reminders.filter(r => {
            if (r.due_day === day) return true;
            if (r.due_date) {
                const normalized = r.due_date.includes('T') ? r.due_date : `${r.due_date}T12:00:00`;
                if (toKey(new Date(normalized)) === key) return true;
            }
            return false;
        });
    };

    const handleUpdateName = async () => {
        if (!newName.trim()) return;
        await supabase.auth.updateUser({ data: { name: newName.trim() } });
        setEditModalVisible(false);
    };

    const handleLogout = async () => { await logout(); router.replace('/login'); };

    const handlePickAvatar = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ 
            mediaTypes: ['images'], 
            allowsEditing: true, 
            aspect: [1, 1], 
            quality: 0.5 
        });
        
        if (!result.canceled && result.assets[0] && user) {
            const sourceUri = result.assets[0].uri;
            setAvatarUri(sourceUri); // Feedback inmediato
            
            try {
                const fileName = `avatar_${user.id}_${Date.now()}.jpg`;
                const publicUrl = await uploadImage(sourceUri, 'avatars', fileName);
                
                if (publicUrl) {
                    setAvatarUri(publicUrl);
                    await supabase.auth.updateUser({ 
                        data: { avatar_url: publicUrl } 
                    });
                }
            } catch (e) {
                console.error("Error subiendo avatar:", e);
                Alert.alert("Error", "No se pudo sincronizar la imagen de perfil.");
            }
        }
    };
    const toggleSmartSavings = async () => {
        if (!user?.id) return;
        const newState = !smartSavingsEnabled;
        setSmartSavingsEnabled(newState);
        await AsyncStorage.setItem(SYNC_KEYS.SMART_SAVINGS(user.id), newState ? 'enabled' : 'disabled');
        await syncUp(user.id);
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

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={[styles.sectionTitle, { color: colorsNav.sub, marginTop: 0, marginBottom: 0 }]}>TU ACTIVIDAD</Text>
                </View>
                <MonthHeatmap activeDays={activeDays} colorsNav={colorsNav} reminders={reminders} onDayPress={handleDayPress} />

                
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

                {/* 📚 BIBLIOTECA DE SANTY */}
                <Text style={[styles.sectionTitle, { color: colorsNav.sub, marginTop: 24 }]}>BIBLIOTECA DE SANTY</Text>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
                >
                    {[
                        {
                            id: 'emergency',
                            title: 'Tu Escudo de Choque',
                            sub: 'Fondo de emergencia por niveles',
                            icon: 'security',
                            color: '#10B981',
                            time: '2 min',
                            content: `El error más común es creer que el fondo de emergencia DEBE ser de 3 a 6 meses de sueldo desde el día 1. ¡Eso desmotiva a cualquiera!\n\nSanty recomienda el método de los **Niveles de Seguridad**:\n\n🛡️ **Nivel 1: El Escudo de Choque ($500.000 COP)**\nEsta es tu primera meta. Sirve para emergencias inmediatas: un neumático pinchado, un medicamento costoso o un electrodoméstico que falló. Es una cifra lograble que te da paz mental inmediata.\n\n🏠 **Nivel 2: Un Mes de Vida**\nUna vez tengas tu Nivel 1, apunta a cubrir un mes de tus gastos básicos. Esto te da libertad si hay un retraso en un pago.\n\n🛋️ **Nivel 3: El Colchón Pro (3 Meses)**\nAquí es donde la mayoría se queda. Es seguridad real ante una pérdida de empleo.\n\n🚀 **Nivel 4: Libertad Total (6 Meses+)**\nCuando llegas aquí, ya no le temes a los imprevistos financieros.\n\n**Recuerda:** Lo importante no es cuánto ahorras hoy, sino el hábito de proteger tu futuro.`
                        },
                        {
                            id: 'compound',
                            title: 'La Magia del Tiempo',
                            sub: 'El interés compuesto explicado',
                            icon: 'auto-fix-high',
                            color: '#8B5CF6',
                            time: '1 min',
                            content: `Albert Einstein llamó al interés compuesto "la octava maravilla del mundo".\n\nNo necesitas ser un genio de las finanzas para usarlo. Solo necesitas **tiempo**. Cuando inviertes, tu dinero genera ganancias. En lugar de gastarlas, las dejas ahí para que esas ganancias generen *más* ganancias.\n\nCon el paso de los años, esa pequeña semilla se convierte en un bosque. Por eso, el mejor momento para empezar fue ayer, y el segundo mejor momento es **hoy**.`
                        },
                        {
                            id: 'invest_vs_save',
                            title: '¿Ahorrar o Invertir?',
                            sub: 'Cuándo dar el gran paso',
                            icon: 'trending-up',
                            color: '#3B82F6',
                            time: '1 min',
                            content: `Mucha gente confunde estos términos, pero son muy diferentes:\n\n💰 **Ahorrar**: Es guardar dinero para el futuro (seguridad). Se hace en cuentas de fácil acceso.\n\n📈 **Invertir**: Es poner a trabajar tu dinero para que crezca (patrimonio). Implica riesgos pero genera riqueza.\n\n**¿La regla de oro de Santy?** No inviertas dinero que vas a necesitar en los próximos 12 meses. Primero construye tu nivel 1 de seguridad, y luego deja que el excedente busque rentabilidad.`
                        }
                    ].map(article => (
                        <TouchableOpacity 
                            key={article.id} 
                            style={[styles.libraryCard, { backgroundColor: colorsNav.card }]}
                            onPress={() => { setSelectedArticle(article); setLibraryModalVisible(true); }}
                        >
                            <View style={[styles.libraryIcon, { backgroundColor: article.color + '15' }]}>
                                <MaterialIcons name={article.icon as any} size={24} color={article.color} />
                            </View>
                            <Text style={[styles.libraryTag, { color: colorsNav.sub }]}>{article.time} lectura</Text>
                            <Text style={[styles.libraryTitle, { color: colorsNav.text }]}>{article.title}</Text>
                            <Text style={[styles.librarySub, { color: colorsNav.sub }]} numberOfLines={1}>{article.sub}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={[styles.sectionTitle, { color: colorsNav.sub, marginTop: 24 }]}>AJUSTES DE LA APP</Text>
                <View style={[styles.profileCard, { backgroundColor: colorsNav.card, paddingVertical: 10 }]}>
                    <TouchableOpacity style={styles.listItem} onPress={() => setCurrencyModalVisible(true)}>
                        <View style={[styles.listIcon, { backgroundColor: colorsNav.accent + '15' }]}><MaterialIcons name="payments" size={20} color={colorsNav.accent} /></View>
                        <View style={{ flex: 1 }}><Text style={[styles.listTitle, { color: colorsNav.text }]}>Moneda</Text><Text style={[styles.listSub, { color: colorsNav.sub }]}>{currency}</Text></View>
                        <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                    </TouchableOpacity>

                    <View style={[styles.listItem, { borderTopWidth: 1, borderTopColor: colorsNav.bg }]}>
                        <View style={[styles.listIcon, { backgroundColor: '#8B5CF615' }]}><MaterialIcons name="auto-awesome" size={20} color="#8B5CF6" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.listTitle, { color: colorsNav.text }]}>Ahorro Inteligente</Text>
                            <Text style={[styles.listSub, { color: colorsNav.sub }]}>Sugerencias automáticas</Text>
                        </View>
                        <TouchableOpacity 
                            onPress={toggleSmartSavings}
                            style={{ 
                                width: 44, 
                                height: 24, 
                                borderRadius: 12, 
                                backgroundColor: smartSavingsEnabled ? '#8B5CF6' : colorsNav.bg,
                                justifyContent: 'center',
                                paddingHorizontal: 3,
                                borderWidth: 1,
                                borderColor: smartSavingsEnabled ? '#8B5CF6' : colorsNav.border
                            }}
                        >
                            <View style={{ 
                                width: 18, 
                                height: 18, 
                                borderRadius: 9, 
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
                                { label: 'Lavanda', light: 'lavender' as ThemeName, dark: 'lavender_dark' as ThemeName, lightColor: '#7C5DBA', darkColor: '#9D7FE0', lightBg: '#F8F7FF', darkBg: '#1A1625' },
                                { label: 'Océano', light: 'ocean' as ThemeName, dark: 'ocean_dark' as ThemeName, lightColor: '#008080', darkColor: '#26A69A', lightBg: '#F0F9FA', darkBg: '#0A1A1A' },
                                { label: 'Rosa', light: 'rose' as ThemeName, dark: 'rose_dark' as ThemeName, lightColor: '#E05C6E', darkColor: '#E07080', lightBg: '#FFF5F5', darkBg: '#1A0E0E' },
                                { label: 'Ámbar', light: 'amber' as ThemeName, dark: 'amber_dark' as ThemeName, lightColor: '#D97706', darkColor: '#F59E0B', lightBg: '#FFFBF0', darkBg: '#1A1400' },
                                { label: 'Índigo', light: 'slate' as ThemeName, dark: 'midnight' as ThemeName, lightColor: '#3B5BDB', darkColor: '#818CF8', lightBg: '#F5F7FA', darkBg: '#0D0D1A' },
                                { label: 'Nieve', light: 'snow' as ThemeName, dark: 'dark' as ThemeName, lightColor: '#64748B', darkColor: '#A09B8C', lightBg: '#FFFFFF', darkBg: '#1A1A2E' },
                            ].map((group) => {
                                const isLightActive = theme === group.light;
                                const isDarkActive = theme === group.dark;
                                return (
                                    <View key={group.label} style={styles.themeRow}>
                                        <View style={styles.themeRowLabel}>
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
                        <View style={{ flexDirection: 'row', gap: 12, marginVertical: 20 }}>
                            <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#EF444410', padding: 16, borderRadius: 20 }}>
                                <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '800' }}>GASTOS 7 DÍAS</Text>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: '#EF4444' }}>{fmt(weeklySpending, currency, rates, isHidden)}</Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#10B98110', padding: 16, borderRadius: 20 }}>
                                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '800' }}>INGRESOS 7 DÍAS</Text>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: '#10B981' }}>{fmt(weeklyIncome, currency, rates, isHidden)}</Text>
                            </View>
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
                        {/* Title row with refresh button */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 0 }]}>Moneda Principal</Text>
                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: isSyncingRates ? colorsNav.border : colorsNav.accent + '15' }}
                                disabled={isSyncingRates}
                                onPress={async () => {
                                    setIsSyncingRates(true);
                                    await syncRates();
                                    setIsSyncingRates(false);
                                }}
                            >
                                <MaterialIcons name="sync" size={14} color={isSyncingRates ? colorsNav.sub : colorsNav.accent} />
                                <Text style={{ color: isSyncingRates ? colorsNav.sub : colorsNav.accent, fontSize: 11, fontWeight: '800' }}>
                                    {isSyncingRates ? 'Actualizando...' : 'Actualizar'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Last updated label */}
                        {ratesUpdatedAt && (
                            <Text style={{ color: colorsNav.sub, fontSize: 10, fontWeight: '600', marginBottom: 16 }}>
                                Tasas al: {new Date(ratesUpdatedAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}

                        {/* Currency list with live rates */}
                        {CURRENCIES.map(curr => {
                            const isActive = currency === curr.code;
                            const rate = curr.code === 'COP' ? null : rates[curr.code];
                            return (
                                <TouchableOpacity
                                    key={curr.code}
                                    style={[styles.listItem, isActive && { backgroundColor: colorsNav.accent + '12', borderRadius: 14, marginHorizontal: -4, paddingHorizontal: 12 }]}
                                    onPress={() => { setCurrencyConfig(curr.code); setCurrencyModalVisible(false); }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 15 }}>
                                            {curr.symbol} {curr.name}
                                        </Text>
                                        {rate && (
                                            <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                                                1 {curr.code} = {new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(rate)} COP
                                            </Text>
                                        )}
                                    </View>
                                    {isActive && <MaterialIcons name="check-circle" size={20} color={colorsNav.accent} />}
                                </TouchableOpacity>
                            );
                        })}

                        <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setCurrencyModalVisible(false)}>
                            <Text style={{ color: colorsNav.sub, fontWeight: '700' }}>Cerrar</Text>
                        </TouchableOpacity>
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

            {/* MODAL DE LECTURA DE BIBLIOTECA */}
            <Modal visible={libraryModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={[styles.readerSheet, { backgroundColor: colorsNav.bg }]}>
                        <View style={styles.sheetHandle} />
                        {selectedArticle && (
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={[styles.libraryIcon, { backgroundColor: selectedArticle.color + '15', width: 44, height: 44 }]}>
                                        <MaterialIcons name={selectedArticle.icon as any} size={24} color={selectedArticle.color} />
                                    </View>
                                    <TouchableOpacity style={styles.closeCircle} onPress={() => setLibraryModalVisible(false)}>
                                        <Ionicons name="close" size={22} color={colorsNav.text} />
                                    </TouchableOpacity>
                                </View>
                                
                                <Text style={[styles.readerTitle, { color: colorsNav.text }]}>{selectedArticle.title}</Text>
                                <Text style={[styles.readerSub, { color: colorsNav.sub }]}>Por Santy · {selectedArticle.time} de lectura</Text>
                                
                                <View style={[styles.readerContent, { backgroundColor: colorsNav.card }]}>
                                    <Text style={[styles.readerText, { color: colorsNav.text }]}>
                                        {selectedArticle.content}
                                    </Text>
                                </View>

                                <TouchableOpacity 
                                    style={[styles.readerActionBtn, { backgroundColor: colorsNav.accent }]}
                                    onPress={() => setLibraryModalVisible(false)}
                                >
                                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Entendido, gracias Santy</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* MODAL DETALLE DEL DÍA */}
            <Modal visible={dayDetailModalVisible} animationType="fade" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <View>
                                <Text style={[styles.modalTitle, { marginBottom: 0, color: colorsNav.text }]}>
                                    {selectedDate ? `${selectedDate.getDate()} de ${MONTH_NAMES_FULL[selectedDate.getMonth()]}` : ''}
                                </Text>
                                <Text style={{ color: colorsNav.sub, fontSize: 12 }}>Detalle de la jornada</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDayDetailModalVisible(false)} style={styles.closeCircle}>
                                <Ionicons name="close" size={24} color={colorsNav.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                            <View style={{ flex: 1, backgroundColor: '#10B98115', padding: 12, borderRadius: 16 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981' }}>INGRESOS</Text>
                                <Text style={{ fontSize: 16, fontWeight: '900', color: '#10B981' }}>
                                    {fmt(getDayTransactions(selectedDate).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), currency, rates, isHidden)}
                                </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: '#EF444415', padding: 12, borderRadius: 16 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#EF4444' }}>GASTOS</Text>
                                <Text style={{ fontSize: 16, fontWeight: '900', color: '#EF4444' }}>
                                    {fmt(getDayTransactions(selectedDate).filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0), currency, rates, isHidden)}
                                </Text>
                            </View>
                        </View>

                        <Text style={{ fontSize: 11, fontWeight: '800', color: colorsNav.sub, marginBottom: 10 }}>MOVIMIENTOS</Text>
                        <ScrollView style={{ maxHeight: 200 }}>
                            {getDayTransactions(selectedDate).length === 0 ? (
                                <Text style={{ color: colorsNav.sub, fontStyle: 'italic', fontSize: 13, paddingVertical: 10 }}>Sin movimientos registrados.</Text>
                            ) : (
                                getDayTransactions(selectedDate).map((t, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colorsNav.bg }}>
                                        <Text style={{ color: colorsNav.text, fontWeight: '600' }}>{t.category}</Text>
                                        <Text style={{ color: t.type === 'income' ? '#10B981' : '#EF4444', fontWeight: '800' }}>
                                            {t.type === 'income' ? '+' : '-'}{fmt(Math.abs(t.amount), currency, rates, isHidden)}
                                        </Text>
                                    </View>
                                ))
                            )}
                        </ScrollView>

                        <Text style={{ fontSize: 11, fontWeight: '800', color: colorsNav.sub, marginTop: 20, marginBottom: 10 }}>COMPROMISOS / FACTURAS</Text>
                        <ScrollView style={{ maxHeight: 150 }}>
                            {getDayReminders(selectedDate).length === 0 ? (
                                <Text style={{ color: colorsNav.sub, fontStyle: 'italic', fontSize: 13, paddingVertical: 10 }}>No hay facturas para este día.</Text>
                            ) : (
                                getDayReminders(selectedDate).map((r, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, backgroundColor: colorsNav.bg, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8, opacity: r.is_paid ? 0.6 : 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                                            <TouchableOpacity onPress={() => handleTogglePaid(r)}>
                                                <Ionicons name={r.is_paid ? "checkbox" : "square-outline"} size={22} color={r.is_paid ? "#10B981" : colorsNav.sub} />
                                            </TouchableOpacity>
                                            <View>
                                                <Text style={{ color: colorsNav.text, fontWeight: '800', textDecorationLine: r.is_paid ? 'line-through' : 'none' }}>{r.title}</Text>
                                                <Text style={{ color: colorsNav.sub, fontSize: 12 }}>{fmt(r.amount, currency, rates, isHidden)}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity onPress={() => {
                                            if (r.is_fixed_expense) {
                                                router.push('/(tabs)/debts');
                                                setDayDetailModalVisible(false);
                                            } else {
                                                handleDeleteReminder(r.id);
                                            }
                                        }}>
                                            <MaterialIcons name={r.is_fixed_expense ? "arrow-forward" : "delete-outline"} size={20} color={r.is_fixed_expense ? colorsNav.accent : "#EF4444"} />
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>

                        <TouchableOpacity 
                            style={{ backgroundColor: colorsNav.accent, paddingVertical: 14, borderRadius: 16, alignItems: 'center', marginTop: 20 }}
                            onPress={() => setDayDetailModalVisible(false)}
                        >
                            <Text style={{ color: '#FFF', fontWeight: '800' }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MODAL NUEVO RECORDATORIO */}
            <Modal visible={addReminderModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nuevo Compromiso</Text>
                            <TouchableOpacity onPress={() => setAddReminderModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colorsNav.sub} />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={{ fontSize: 12, color: colorsNav.sub, marginBottom: 8 }}>TÍTULO (Ej. Arriendo)</Text>
                        <TextInput 
                            style={{ backgroundColor: colorsNav.bg, borderRadius: 12, padding: 15, color: colorsNav.text, marginBottom: 15 }}
                            value={newReminderTitle}
                            onChangeText={setNewReminderTitle}
                            placeholder="Nombre del compromiso"
                        />
                        
                        <Text style={{ fontSize: 12, color: colorsNav.sub, marginBottom: 8 }}>VALOR ESTIMADO</Text>
                        <TextInput 
                            style={{ backgroundColor: colorsNav.bg, borderRadius: 12, padding: 15, color: colorsNav.text, marginBottom: 20 }}
                            value={newReminderAmount}
                            onChangeText={setNewReminderAmount}
                            keyboardType="numeric"
                            placeholder="$ 0"
                        />

                        <Text style={{ fontSize: 12, color: colorsNav.sub, marginBottom: 15 }}>
                            Se repetirá todos los meses el día {selectedDate ? selectedDate.getDate() : 'seleccionado'}.
                        </Text>

                        <TouchableOpacity 
                            style={{ backgroundColor: colorsNav.accent, paddingVertical: 18, borderRadius: 18, alignItems: 'center' }}
                            onPress={handleAddReminder}
                        >
                            <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar Compromiso</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, marginBottom: 10 },
    headerTitle: { fontSize: 24, fontWeight: '800' },
    themeBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 100 },
    profileCard: { borderRadius: 28, padding: 20, marginBottom: 12, elevation: 2 },
    profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    avatar: { width: 56, height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    avatarImg: { width: 56, height: 56, borderRadius: 20 },
    avatarTxt: { color: '#FFF', fontSize: 20, fontWeight: '800' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: 18, fontWeight: '800' },
    email: { fontSize: 12, marginTop: 1, opacity: 0.7 },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14 },
    optionsGrid: { flexWrap: 'wrap', flexDirection: 'row', gap: 12, marginBottom: 12 },
    optBtn: { flex: 1, padding: 14, borderRadius: 20, gap: 2 },
    optIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    optTitle: { fontSize: 14, fontWeight: '800' },
    budgetFullBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, elevation: 1 },
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
    // Library Styles
    libraryCard: { width: 220, padding: 20, borderRadius: 28, marginRight: 12, elevation: 1 },
    libraryIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    libraryTag: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
    libraryTitle: { fontSize: 15, fontWeight: '900', marginBottom: 4 },
    librarySub: { fontSize: 11, fontWeight: '600' },
    readerSheet: { borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 24, paddingTop: 16, height: '85%', width: '100%' },
    readerTitle: { fontSize: 26, fontWeight: '900', marginTop: 24, marginBottom: 8 },
    readerSub: { fontSize: 13, fontWeight: '700', marginBottom: 24 },
    readerContent: { padding: 24, borderRadius: 24, marginBottom: 24 },
    readerText: { fontSize: 15, lineHeight: 24, fontWeight: '600' },
    readerActionBtn: { paddingVertical: 18, borderRadius: 18, alignItems: 'center' },
});
