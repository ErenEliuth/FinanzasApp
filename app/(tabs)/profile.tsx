import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as NotificationsUtils from '@/utils/notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { THEMES, ThemeName } from '@/constants/Themes';
import { useThemeColors } from '@/hooks/useThemeColors';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MagicAuraButton } from '@/components/MagicAuraButton';
import {
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    KeyboardAvoidingView,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Switch,
} from 'react-native';

const MONTH_NAMES_FULL = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtCOP = (n: number, isHidden: boolean) =>
    isHidden
        ? '****'
        : new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', minimumFractionDigits: 0
          }).format(n);



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
                    <Text style={[mSt.subtitle, { color: colorsNav.sub }]}>
                        Actividad financiera
                    </Text>
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

// ─── Estadísticas de Categorías ────────────────────────────────────────────────
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

function CategoryStatistics({ transactions, colorsNav, isHidden }: { transactions: any[]; colorsNav: any; isHidden: boolean }) {
    const today = new Date();
    const currMonth = today.getMonth();
    const currYear = today.getFullYear();
    const lastMonthDate = new Date(currYear, currMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastYear = lastMonthDate.getFullYear();

    const thisMonthExpenses = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });
    const lastMonthTotal = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    }).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const thisMonthTotal = thisMonthExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const categoryTotals: Record<string, number> = {};
    thisMonthExpenses.forEach(t => {
        const cat = t.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount || 0);
    });

    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(...sortedCats.map(c => c[1]), 1);
    const diff = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
    const isHigher = thisMonthTotal > lastMonthTotal;

    return (
        <View style={{ gap: 24 }}>
            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text }]}>Análisis del Mes</Text>
                <View style={statStyle.compRow}>
                    <View>
                        <Text style={[statStyle.compLab, { color: colorsNav.sub }]}>Gasto Total</Text>
                        <Text style={[statStyle.compVal, { color: colorsNav.text }]}>{fmtCOP(thisMonthTotal, isHidden)}</Text>
                    </View>
                    {lastMonthTotal > 0 && (
                        <View style={[statStyle.compBadge, { backgroundColor: isHigher ? '#FFEBEE' : '#E8F5E9' }]}>
                            <MaterialIcons name={isHigher ? 'trending-up' : 'trending-down'} size={14} color={isHigher ? '#EF4444' : '#4A7C59'} />
                            <Text style={[statStyle.compBadgeTxt, { color: isHigher ? '#EF4444' : '#4A7C59' }]}>
                                {Math.abs(diff).toFixed(0)}% vs mes pasado
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 20 }]}>Gastos por Categoría</Text>
                {sortedCats.length === 0 ? (
                        <Text style={{ color: colorsNav.sub, textAlign: 'center' }}>No hay gastos este mes</Text>
                ) : (
                    sortedCats.map(([cat, val]) => {
                        const info = CAT_INFO[cat] || CAT_INFO['Otros'];
                        return (
                            <View key={cat} style={statStyle.barRow}>
                                <View style={[statStyle.barIcon, { backgroundColor: info.bg }]}>
                                    <MaterialIcons name={info.icon} size={18} color={info.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={statStyle.barHeaders}>
                                        <Text style={[statStyle.barLabel, { color: colorsNav.text }]}>{cat}</Text>
                                        <Text style={[statStyle.barAmount, { color: colorsNav.text }]}>{fmtCOP(val, isHidden)}</Text>
                                    </View>
                                    <View style={[statStyle.barTrack, { backgroundColor: colorsNav.bg }]}>
                                        <View style={[statStyle.barFill, { width: `${(val / maxVal) * 100}%`, backgroundColor: info.color }]} />
                                    </View>
                                </View>
                            </View>
                        );
                    })
                )}
            </View>
        </View>
    );
}

const statStyle = StyleSheet.create({
    card: { borderRadius: 24, padding: 24 },
    title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    compRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    compLab: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
    compVal: { fontSize: 24, fontWeight: '900' },
    compBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    compBadgeTxt: { fontSize: 11, fontWeight: '800' },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    barIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    barHeaders: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    barLabel: { fontSize: 14, fontWeight: '700' },
    barAmount: { fontSize: 14, fontWeight: '800' },
    barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
});

// ─── Pantalla principal ────────────────────────────────────────────────────────
export default function ProfileScreen() {
    const router = useRouter();
    const { user, logout, theme, isHidden, toggleTheme, setThemeConfig } = useAuth();
    const isFocused = useIsFocused();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [lockEnabled, setLockEnabled] = useState(false);
    const [lockMethod, setLockMethod] = useState<'pin' | 'biometric'>('pin');
    const [lockPin, setLockPin] = useState('');
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [tempPin, setTempPin] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [showGeminiCnf, setShowGeminiCnf] = useState(false);
    const [tempGemini, setTempGemini] = useState('');

    useEffect(() => {
        loadLockSettings();
    }, [isFocused]);

    const loadLockSettings = async () => {
        try {
            const enabled = await AsyncStorage.getItem('@lock_enabled');
            const method = await AsyncStorage.getItem('@lock_method') || 'pin';
            const pin = await AsyncStorage.getItem('@lock_pin') || '';
            const gKey = await AsyncStorage.getItem('@gemini_key') || '';
            setLockEnabled(enabled === 'true');
            setLockMethod(method as any);
            setLockPin(pin);
            setGeminiKey(gKey);
            setTempGemini(gKey);
        } catch (e) {}
    };

    const saveGeminiAPI = async () => {
        await AsyncStorage.setItem('@gemini_key', tempGemini.trim());
        setGeminiKey(tempGemini.trim());
        setShowGeminiCnf(false);
        Alert.alert("¡Cerebro Conectado!", "La llave de Inteligencia Artificial se ha guardado de forma segura en tu dispositivo.");
    };

    const toggleLock = async (val: boolean) => {
        if (val && !lockPin) {
            Alert.alert("Configuración Requerida", "Primero debes establecer un PIN de seguridad.");
            setPinModalVisible(true);
            return;
        }
        setLockEnabled(val);
        await AsyncStorage.setItem('@lock_enabled', val ? 'true' : 'false');
    };

    const toggleLockMethod = async () => {
        const next = lockMethod === 'pin' ? 'biometric' : 'pin';
        if (next === 'biometric') {
             const hasHardware = await LocalAuthentication.hasHardwareAsync();
             const isEnrolled = await LocalAuthentication.isEnrolledAsync();
             if (!hasHardware || !isEnrolled) {
                 Alert.alert("No Disponible", "Tu dispositivo no soporta biometría o no tiene huellas registradas.");
                 return;
             }
        }
        setLockMethod(next);
        await AsyncStorage.setItem('@lock_method', next);
    };

    const saveNewPin = async () => {
        if (tempPin.length !== 4) {
            Alert.alert("Error", "El PIN debe tener exactamente 4 números.");
            return;
        }
        setLockPin(tempPin);
        await AsyncStorage.setItem('@lock_pin', tempPin);
        setPinModalVisible(false);
        setTempPin('');
        Alert.alert("Éxito", "Tu PIN de Sanctuary ha sido actualizado.");
    };

    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDays, setActiveDays] = useState<Map<string, number>>(new Map());
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [statsModalVisible, setStatsModalVisible] = useState(false);
    const [weeklyModalVisible, setWeeklyModalVisible] = useState(false);
    const [newName, setNewName] = useState(user?.user_metadata?.name || '');
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    
    const [weeklySpending, setWeeklySpending] = useState(0);
    const [weeklyTopCat, setWeeklyTopCat] = useState('');
    const [weeklyTopAmt, setWeeklyTopAmt] = useState(0);
    const [weeklySummaryData, setWeeklySummaryData] = useState<[string, number][]>([]);
    const [reminders, setReminders] = useState(false);
    const [reminderTime, setReminderTime] = useState(new Date(0, 0, 0, 20, 30));
    const [showTimer, setShowTimer] = useState(false);

    useEffect(() => { if (isFocused) loadData(); }, [isFocused]);

    useEffect(() => {
        AsyncStorage.getItem(`@avatar_${user?.id}`).then(uri => { if (uri) setAvatarUri(uri); });
        loadReminders();
    }, [user]);

    const loadReminders = async () => {
        const val = await AsyncStorage.getItem('user_reminders');
        setReminders(val === 'true');
        
        const h = await AsyncStorage.getItem('user_reminders_h');
        const m = await AsyncStorage.getItem('user_reminders_m');
        if (h && m) {
            const d = new Date();
            d.setHours(parseInt(h));
            d.setMinutes(parseInt(m));
            setReminderTime(d);
        }
    };

    const onTimeChange = async (event: any, selectedDate?: Date) => {
        setShowTimer(false);
        if (selectedDate) {
            setReminderTime(selectedDate);
            const h = selectedDate.getHours();
            const m = selectedDate.getMinutes();
            await AsyncStorage.setItem('user_reminders_h', h.toString());
            await AsyncStorage.setItem('user_reminders_m', m.toString());
            
            if (reminders) {
                await NotificationsUtils.scheduleDailyReminder(h, m);
                Alert.alert("✅ Hora actualizada", `Te avisaremos a las ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
            }
        }
    };

    const [tempH, setTempH] = useState('');
    const [tempM, setTempM] = useState('');

    const openTimer = () => {
        setTempH(reminderTime.getHours().toString().padStart(2, '0'));
        setTempM(reminderTime.getMinutes().toString().padStart(2, '0'));
        setShowTimer(true);
    };

    const saveManualTime = async () => {
        let h = parseInt(tempH);
        let m = parseInt(tempM);
        
        if (isNaN(h) || h < 0 || h > 23) h = 20;
        if (isNaN(m) || m < 0 || m > 59) m = 30;

        const newDate = new Date();
        newDate.setHours(h);
        newDate.setMinutes(m);
        
        setReminderTime(newDate);
        setShowTimer(false);
        
        await AsyncStorage.setItem('user_reminders_h', h.toString());
        await AsyncStorage.setItem('user_reminders_m', m.toString());

        if (reminders) {
            await NotificationsUtils.scheduleDailyReminder(h, m);
            Alert.alert("✅ Hora guardada", `Aviso configurado para las ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        }
    };

    const toggleReminders = async () => {
        const newVal = !reminders;
        setReminders(newVal);
        await AsyncStorage.setItem('user_reminders', newVal ? 'true' : 'false');

        if (newVal) {
            const granted = await NotificationsUtils.registerForPushNotificationsAsync();
            if (granted) {
                const h = reminderTime.getHours();
                const m = reminderTime.getMinutes();
                await NotificationsUtils.scheduleDailyReminder(h, m);
                Alert.alert("✅ Recordatorio activado", `Te avisaremos a las ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
            } else {
                setReminders(false);
                await AsyncStorage.setItem('user_reminders', 'false');
                Alert.alert("⚠️ Permiso denegado", "Necesitas activar las notificaciones en ajustes.");
            }
        } else {
            await NotificationsUtils.cancelReminders();
            Alert.alert("🔕 Recordatorios desactivados", "Ya no recibirás avisos.");
        }
    };

    const loadData = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id);
            if (error) throw error;
            const txs = data || [];
            setTransactions(txs);
            
            const map = new Map<string, number>();
            txs.forEach(tx => {
                const k = toKey(new Date(tx.date));
                map.set(k, (map.get(k) ?? 0) + 1);
            });
            setActiveDays(map);

            // Calcular resumen semanal (últimos 7 días)
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekTxs = txs.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && new Date(t.date) >= weekAgo);
            
            const totalWeek = weekTxs.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
            setWeeklySpending(totalWeek);

            const catMap: Record<string, number> = {};
            weekTxs.forEach(t => {
                const c = t.category || 'Otros';
                catMap[c] = (catMap[c] || 0) + Math.abs(t.amount || 0);
            });
            const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
            setWeeklySummaryData(sorted);
            if (sorted[0]) {
                setWeeklyTopCat(sorted[0][0]);
                setWeeklyTopAmt(sorted[0][1]);
            } else {
                setWeeklyTopCat('');
                setWeeklyTopAmt(0);
            }

        } catch (e) { console.error(e); }
    };

    const handleUpdateName = async () => {
        if (!newName.trim() || !user) return;
        try {
            await supabase.auth.updateUser({ data: { name: newName.trim() } });
            setEditModalVisible(false);
            if (Platform.OS === 'web') window.alert('Éxito: Nombre actualizado.');
            else Alert.alert('¡Éxito!', 'Nombre actualizado.');
        } catch (e: any) {
            if (Platform.OS === 'web') window.alert('Error: ' + e.message);
            else Alert.alert('Error', e.message);
        }
    };

    const handleLogout = async () => {
        if (Platform.OS === 'web') {
            if (window.confirm('¿Cerrar sesión?')) { await logout(); router.replace('/login'); }
            return;
        }
        Alert.alert('Cerrar Sesión', '¿Estás seguro?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
        ]);
    };

    const handlePickAvatar = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
        });
        if (!result.canceled && result.assets[0]) {
            const tempUri = result.assets[0].uri;
            try {
                const fileName = `avatar_${user?.id}_${Date.now()}.jpg`;
                const docDir = (FileSystem as any).documentDirectory;
                const permanentUri = docDir ? `${docDir}${fileName}` : tempUri;
                if (docDir) {
                    await (FileSystem as any).copyAsync({ from: tempUri, to: permanentUri });
                }
                setAvatarUri(permanentUri);
                await AsyncStorage.setItem(`@avatar_${user?.id}`, permanentUri);
            } catch (e) {
                setAvatarUri(tempUri);
                await AsyncStorage.setItem(`@avatar_${user?.id}`, tempUri);
            }
        }
    };

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const initials = displayName.slice(0, 2).toUpperCase();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Perfil</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity style={[styles.themeBtn, { backgroundColor: isDark ? colorsNav.card : (theme === 'lavender' ? '#EBE7F5' : (theme === 'ocean' ? '#E0F2F3' : '#F5EDE0')) }]} onPress={toggleTheme}>
                            <Ionicons 
                                name={theme === 'snow' ? 'contrast' : (theme === 'light' ? 'sunny' : (theme === 'dark' ? 'moon' : (theme === 'lavender' ? 'sparkles' : 'water')))} 
                                size={20} 
                                color={colorsNav.accent} 
                            />
                        </TouchableOpacity>
                        <MagicAuraButton />
                    </View>
                </View>

                {/* ── Perfil Card ── */}
                <View style={[styles.profileCard, { backgroundColor: colorsNav.card }]}>
                    <View style={styles.profileTop}>
                        <TouchableOpacity style={[styles.avatar, { backgroundColor: colorsNav.accent }]} onPress={handlePickAvatar}>
                            {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} /> : <Text style={styles.avatarTxt}>{initials}</Text>}
                            <View style={[styles.camBtn, { backgroundColor: colorsNav.accent }]}>
                                <MaterialIcons name="camera-alt" size={12} color="#FFF" />
                            </View>
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <TouchableOpacity onPress={() => setEditModalVisible(true)} style={styles.nameRow}>
                                <Text style={[styles.name, { color: colorsNav.text }]}>{displayName}</Text>
                                <MaterialIcons name="edit" size={14} color={colorsNav.sub} />
                            </TouchableOpacity>
                            <Text style={[styles.email, { color: colorsNav.sub }]}>{user?.email}</Text>
                        </View>
                    </View>

                    <View style={styles.actionRow}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colorsNav.bg }]} onPress={() => setStatsModalVisible(true)}>
                            <MaterialIcons name="bar-chart" size={18} color={colorsNav.accent} />
                            <Text style={[styles.actionBtnTxt, { color: colorsNav.text }]}>Estadísticas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colorsNav.bg }]} onPress={handleLogout}>
                            <MaterialIcons name="exit-to-app" size={18} color="#EF4444" />
                            <Text style={[styles.actionBtnTxt, { color: '#EF4444' }]}>Salir</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Configuración ── */}
                <View style={{ marginTop: 8 }}>
                    <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>CONFIGURACIÓN</Text>
                    
                    <View 
                        style={[styles.listItem, { backgroundColor: colorsNav.card }]} 
                    >
                        <View style={[styles.listIcon, { backgroundColor: reminders ? '#E3F0FF' : (isDark ? '#3A3A52' : '#F1F5F9') }]}>
                            <Ionicons name="notifications" size={20} color={reminders ? '#3B82F6' : colorsNav.sub} />
                        </View>
                        <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={[styles.listTitle, { color: colorsNav.text }]} numberOfLines={1}>Recordatorio Diario</Text>
                            <Text style={[styles.listSub, { color: colorsNav.sub }]}>
                                {reminders ? `Activado: ${reminderTime.getHours().toString().padStart(2, '0')}:${reminderTime.getMinutes().toString().padStart(2, '0')}` : 'Desactivado'}
                            </Text>
                        </View>
                        
                        {reminders && (
                            <TouchableOpacity 
                                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: isDark ? '#2A2A42' : '#F1F5F9', marginRight: 6 }}
                                onPress={openTimer}
                            >
                                <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 11 }}>Editar Hora</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity onPress={toggleReminders} style={{ padding: 4 }}>
                             <Ionicons name={reminders ? "toggle" : "toggle-outline"} size={32} color={reminders ? colorsNav.accent : colorsNav.sub} />
                        </TouchableOpacity>
                    </View>

                    {showTimer && (
                        <Modal visible={showTimer} transparent animationType="fade">
                            <View style={styles.overlay}>
                                <View style={[styles.modalBox, { backgroundColor: colorsNav.card, width: '85%', maxWidth: 300, alignSelf: 'center' }]}>
                                    <Text style={[styles.modalTitle, { color: colorsNav.text, textAlign: 'center' }]}>Elegir Hora</Text>
                                    
                                    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 25 }}>
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ fontSize: 10, fontWeight: '800', color: colorsNav.sub, marginBottom: 5 }}>HORA</Text>
                                            <TextInput 
                                                style={[styles.timeInput, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, textAlign: 'center' }]}
                                                value={tempH}
                                                onChangeText={setTempH}
                                                keyboardType="number-pad"
                                                maxLength={2}
                                            />
                                        </View>
                                        <Text style={{ fontSize: 24, fontWeight: '900', color: colorsNav.sub, marginTop: 15 }}>:</Text>
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ fontSize: 10, fontWeight: '800', color: colorsNav.sub, marginBottom: 5 }}>MIN</Text>
                                            <TextInput 
                                                style={[styles.timeInput, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, textAlign: 'center' }]}
                                                value={tempM}
                                                onChangeText={setTempM}
                                                keyboardType="number-pad"
                                                maxLength={2}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg, flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' }]} onPress={() => setShowTimer(false)}>
                                            <Text style={[styles.mBtnTxt, { color: colorsNav.text }]}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent, flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' }]} onPress={saveManualTime}>
                                            <Text style={[styles.mBtnTxt, { color: '#FFF' }]}>Listo</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>
                    )}

                </View>

                {/* ── Configuración de IA ── */}
                <View style={{ marginTop: 12 }}>
                    <View style={[styles.listItem, { backgroundColor: colorsNav.card, flexDirection: 'column', alignItems: 'flex-start', padding: 14 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                            <View style={[styles.listIcon, { backgroundColor: geminiKey ? '#E8F5E9' : '#FFF0E0' }]}>
                                <MaterialIcons name="psychology" size={20} color={geminiKey ? '#4A7C59' : '#F59E0B'} />
                            </View>
                            <View style={{ flex: 1, paddingHorizontal: 8 }}>
                                <Text style={[styles.listTitle, { color: colorsNav.text }]} numberOfLines={1}>Cerebro IA (Santy)</Text>
                                <Text style={[styles.listSub, { color: colorsNav.sub }]}>
                                    {geminiKey ? 'Conectado (Llave Local Segura)' : 'Desconectado'}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: isDark ? '#2A2A42' : '#F1F5F9' }}
                                onPress={() => setShowGeminiCnf(true)}
                            >
                                <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 11 }}>Configurar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {showGeminiCnf && (
                        <Modal visible={showGeminiCnf} transparent animationType="fade">
                            <View style={styles.overlay}>
                                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalBox, { backgroundColor: colorsNav.card, width: '90%', maxWidth: 400, alignSelf: 'center', padding: 24 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                                        <MaterialIcons name="lock" size={16} color="#4CAF50" />
                                        <Text style={[styles.modalTitle, { color: colorsNav.text, margin: 0 }]}>Conectar Gemini</Text>
                                    </View>
                                    <Text style={{ color: colorsNav.sub, fontSize: 13, marginBottom: 20, lineHeight: 20 }}>
                                        Pega aquí tu llave API de Google AI Studio.{"\n"}
                                        <Text style={{ fontWeight: 'bold' }}>Se guardará únicamente en local</Text> dentro de la memoria temporal de tu celular. Nunca se enviará ni se subirá al código de GitHub. Seguro al 100%.
                                    </Text>
                                    
                                    <TextInput
                                        style={[{ backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, borderWidth: 1, height: 48, borderRadius: 12, paddingHorizontal: 16 }]}
                                        placeholder="AIzaSy..."
                                        placeholderTextColor={colorsNav.sub}
                                        value={tempGemini}
                                        onChangeText={setTempGemini}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                    
                                    <View style={[styles.modalBtns, { marginTop: 24, flexDirection: 'row', gap: 12 }]}>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg, flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' }]} onPress={() => setShowGeminiCnf(false)}>
                                            <Text style={[styles.mBtnTxt, { color: colorsNav.text }]}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent, flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' }]} onPress={saveGeminiAPI}>
                                            <Text style={[styles.mBtnTxt, { color: '#FFF' }]}>Guardar Segura</Text>
                                        </TouchableOpacity>
                                    </View>
                                </KeyboardAvoidingView>
                            </View>
                        </Modal>
                    )}
                </View>

                {/* ── Heatmap ── */}
                <MonthHeatmap activeDays={activeDays} colorsNav={colorsNav} />

                {/* ── Quick Options & Weekly Summary ── */}
                <View style={styles.optionsGrid}>
                    <TouchableOpacity style={[styles.optBtn, { backgroundColor: colorsNav.card }]} onPress={() => router.push('/budgets' as any)}>
                        <View style={[styles.optIcon, { backgroundColor: '#E0F7FA' }]}>
                            <MaterialIcons name="pie-chart" size={24} color="#00BCD4" />
                        </View>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Presupuestos</Text>
                        <Text style={[styles.optSub, { color: colorsNav.sub }]}>Control Mensual</Text>
                    </TouchableOpacity>

                    {/* Resumen Semanal Card Interactive */}
                    <TouchableOpacity 
                        style={[styles.optBtn, { backgroundColor: colorsNav.card, borderColor: '#EF444420', borderWidth: 1 }]}
                        onPress={() => setWeeklyModalVisible(true)}
                    >
                        <View style={[styles.optIcon, { backgroundColor: '#FFF0F0' }]}>
                            <MaterialIcons name="calendar-today" size={24} color="#EF4444" />
                        </View>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Resumen Semanal</Text>
                        <View style={{ marginTop: 2 }}>
                            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13 }}>{fmtCOP(weeklySpending, isHidden)}</Text>
                            {weeklyTopCat ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF444430' }} />
                                    <Text style={{ fontSize: 9, color: colorsNav.sub, fontWeight: '700' }} numberOfLines={1}>
                                        Top: {weeklyTopCat}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                </View>
                
                {/* ── Seguridad ── */}
                <View style={[styles.profileCard, { backgroundColor: colorsNav.card, marginTop: 16 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFD54F20', justifyContent: 'center', alignItems: 'center' }}>
                            <MaterialIcons name="security" size={24} color="#FFD54F" />
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: colorsNav.text }}>Seguridad</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '800', color: colorsNav.text }}>Sanctuary Lock</Text>
                            <Text style={{ fontSize: 12, color: colorsNav.sub, marginTop: 2 }}>Protege la app con PIN o Biometría</Text>
                        </View>
                        <Switch 
                            value={lockEnabled} 
                            onValueChange={toggleLock}
                            trackColor={{ false: '#767577', true: colorsNav.accent }}
                            thumbColor={lockEnabled ? '#FFF' : '#f4f3f4'}
                        />
                    </View>

                    {lockEnabled && (
                        <>
                            <View style={{ height: 1, backgroundColor: colorsNav.border, marginVertical: 16 }} />
                            <TouchableOpacity style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={() => setPinModalVisible(true)}>
                                <View>
                                    <Text style={{ fontSize: 15, fontWeight: '800', color: colorsNav.text }}>Configurar PIN</Text>
                                    <Text style={{ fontSize: 12, color: colorsNav.sub, marginTop: 2 }}>
                                        {lockPin ? 'Actualizar código actual' : 'Establecer código secreto'}
                                    </Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                            </TouchableOpacity>

                            <View style={{ height: 1, backgroundColor: colorsNav.border, marginVertical: 16 }} />
                            <TouchableOpacity style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={toggleLockMethod}>
                                <View>
                                    <Text style={{ fontSize: 15, fontWeight: '800', color: colorsNav.text }}>Método de Entrada</Text>
                                    <Text style={{ fontSize: 12, color: colorsNav.sub, marginTop: 2 }}>
                                        Actual: {lockMethod === 'biometric' ? 'Huella / FaceID' : 'Solo PIN'}
                                    </Text>
                                </View>
                                <MaterialIcons name="sync" size={20} color={colorsNav.accent} />
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Modal Editar Nombre */}
            <Modal visible={editModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Editar Nombre</Text>
                        <TextInput style={[styles.modalInput, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]}
                            value={newName} onChangeText={setNewName} autoFocus />
                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => setEditModalVisible(false)}>
                                <Text style={[styles.mBtnTxt, { color: colorsNav.text }]}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleUpdateName}>
                                <Text style={[styles.mBtnTxt, { color: '#FFF' }]}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal Estadísticas Generales */}
            <Modal visible={statsModalVisible} animationType="slide">
                <SafeAreaView style={{ flex: 1, backgroundColor: colorsNav.bg }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setStatsModalVisible(false)}>
                            <MaterialIcons name="close" size={28} color={colorsNav.text} />
                        </TouchableOpacity>
                        <Text style={[styles.modalHeaderTitle, { color: colorsNav.text }]}>Mis Estadísticas</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <CategoryStatistics transactions={transactions} colorsNav={colorsNav} isHidden={isHidden} />
                        <View style={{ height: 50 }} />
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            {/* Modal Resumen Semanal Interactivo */}
            <Modal visible={weeklyModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                    <View style={[styles.weeklyBottomModal, { backgroundColor: colorsNav.card }]}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeaderInner}>
                            <Text style={[styles.weeklyModalTitle, { color: colorsNav.text }]}>Análisis Semanal</Text>
                            <TouchableOpacity onPress={() => setWeeklyModalVisible(false)}>
                                <MaterialIcons name="close" size={24} color={colorsNav.sub} />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.weeklyHero}>
                            <Text style={styles.weeklyHeroLabel}>Total Gastado (7 días)</Text>
                            <Text style={[styles.weeklyHeroAmt, { color: '#EF4444' }]}>{fmtCOP(weeklySpending, isHidden)}</Text>
                            <Text style={[styles.weeklyHeroSub, { color: colorsNav.sub }]}>Últimas transacciones registradas</Text>
                        </View>

                        {weeklyTopCat ? (
                            <View style={[styles.insightCard, { backgroundColor: '#FF8A6515' }]}>
                                <MaterialIcons name="warning" size={20} color="#FF8A65" />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.insightTitle, { color: colorsNav.text }]}>Aviso de Control</Text>
                                    <Text style={[styles.insightText, { color: colorsNav.sub }]}>
                                        Tu mayor gasto ha sido en <Text style={{ fontWeight: '800', color: colorsNav.text }}>{weeklyTopCat}</Text> por {fmtCOP(weeklyTopAmt, isHidden)}. ¡Ojo ahí!
                                    </Text>
                                </View>
                            </View>
                        ) : null}

                        <Text style={[styles.catLabel, { color: colorsNav.text }]}>DESGLOSE POR CATEGORÍA</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300 }}>
                            {weeklySummaryData.map(([cat, amt]) => {
                                const info = CAT_INFO[cat] || CAT_INFO['Otros'];
                                return (
                                    <View key={cat} style={styles.weekCatRow}>
                                        <View style={[styles.weekCatIcon, { backgroundColor: info.bg }]}>
                                            <MaterialIcons name={info.icon} size={18} color={info.color} />
                                        </View>
                                        <Text style={[styles.weekCatName, { color: colorsNav.text }]}>{cat}</Text>
                                        <Text style={[styles.weekCatAmt, { color: colorsNav.text }]}>{fmtCOP(amt, isHidden)}</Text>
                                    </View>
                                );
                            })}
                            {weeklySummaryData.length === 0 && (
                                <Text style={{ color: colorsNav.sub, textAlign: 'center', marginVertical: 20 }}>No hay gastos en la última semana.</Text>
                            )}
                        </ScrollView>

                        <TouchableOpacity style={[styles.closeModalBtn, { backgroundColor: colorsNav.accent }]} onPress={() => setWeeklyModalVisible(false)}>
                            <Text style={styles.closeModalBtnTxt}>Entendido</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modal para configurar PIN */}
            <Modal visible={pinModalVisible} animationType="fade" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: '85%', backgroundColor: colorsNav.card, borderRadius: 32, padding: 30, alignItems: 'center' }}>
                         <Text style={{ fontSize: 20, fontWeight: '900', color: colorsNav.text, marginBottom: 10 }}>Nuevo PIN</Text>
                         <Text style={{ fontSize: 14, color: colorsNav.sub, textAlign: 'center', marginBottom: 30 }}>Escribe 4 números que no olvides, Eliuth.</Text>
                         
                         <TextInput 
                             style={{ width: '100%', height: 60, borderRadius: 16, backgroundColor: isDark ? '#1A1A2E' : '#F5EDE0', textAlign: 'center', fontSize: 24, letterSpacing: 10, fontWeight: '900', color: colorsNav.text }}
                             keyboardType="numeric"
                             maxLength={4}
                             secureTextEntry
                             value={tempPin}
                             onChangeText={setTempPin}
                             placeholder="0000"
                             placeholderTextColor={colorsNav.sub}
                             autoFocus
                         />

                         <View style={{ flexDirection: 'row', gap: 15, marginTop: 30 }}>
                             <TouchableOpacity style={{ padding: 15, flex: 1, alignItems: 'center' }} onPress={() => setPinModalVisible(false)}>
                                 <Text style={{ color: colorsNav.sub, fontWeight: '700' }}>Cancelar</Text>
                             </TouchableOpacity>
                             <TouchableOpacity style={{ padding: 15, flex: 1, backgroundColor: colorsNav.accent, borderRadius: 16, alignItems: 'center' }} onPress={saveNewPin}>
                                 <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
                             </TouchableOpacity>
                         </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 50 : 20, marginBottom: 20 },
    headerTitle: { fontSize: 28, fontWeight: '800' },
    themeBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 20 },

    profileCard: { borderRadius: 28, padding: 24, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
    profileTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    avatar: { width: 64, height: 64, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    avatarImg: { width: 64, height: 64, borderRadius: 24 },
    avatarTxt: { color: '#FFF', fontSize: 24, fontWeight: '800' },
    camBtn: { position: 'absolute', bottom: -4, right: -4, width: 24, height: 24, borderRadius: 12, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: 20, fontWeight: '800' },
    email: { fontSize: 13, marginTop: 2, opacity: 0.7 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 16 },
    actionBtnTxt: { fontSize: 13, fontWeight: '800' },

    optionsGrid: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    optBtn: { flex: 1, padding: 18, borderRadius: 24, gap: 4, justifyContent: 'flex-start' },
    optIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    optTitle: { fontSize: 13, fontWeight: '800' },
    optSub: { fontSize: 11, fontWeight: '600', opacity: 0.6 },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalBox: { borderRadius: 32, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
    modalInput: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, marginBottom: 24 },
    modalBtns: { flexDirection: 'row', gap: 12 },
    mBtn: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
    mBtnTxt: { fontWeight: '800' },

    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 10 },
    modalHeaderTitle: { fontSize: 18, fontWeight: '800' },

    // Weekly Modal
    weeklyBottomModal: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 40 },
    modalHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#E0D8CC', alignSelf: 'center', marginBottom: 20 },
    modalHeaderInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    weeklyModalTitle: { fontSize: 20, fontWeight: '800' },
    weeklyHero: { alignItems: 'center', marginBottom: 24 },
    weeklyHeroLabel: { fontSize: 12, fontWeight: '700', color: '#8B8680', letterSpacing: 1 },
    weeklyHeroAmt: { fontSize: 36, fontWeight: '900', marginVertical: 4 },
    weeklyHeroSub: { fontSize: 12 },
    insightCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 20, marginBottom: 20 },
    insightTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
    insightText: { fontSize: 13, lineHeight: 18 },
    catLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 16 },
    weekCatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    weekCatIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    weekCatName: { flex: 1, fontSize: 14, fontWeight: '700' },
    weekCatAmt: { fontSize: 14, fontWeight: '800' },
    closeModalBtn: { padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 24 },
    closeModalBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 16 },

    sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginLeft: 6, marginBottom: 12, opacity: 0.8 },
    listItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 24, gap: 14 },
    listIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    listTitle: { fontSize: 15, fontWeight: '700' },
    listSub: { fontSize: 12, marginTop: 2 },
    timeInput: { width: 60, height: 60, borderRadius: 16, borderWidth: 1, fontSize: 24, fontWeight: '900' },
});
