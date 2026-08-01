import { useAuth } from '@/utils/auth';
import { getLocalISOString } from '@/utils/dateUtils';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, getCurrencyInfo, convertCurrency, convertToBase, formatInputDisplay, parseInputToNumber } from '@/utils/currency';
import { calculateFirstPaymentMonth, getAmountDueForMonth, getCleanDescription, getCurrentInstallmentNumber } from '@/utils/billing';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import * as Haptics from 'expo-haptics';
import {
    Alert,
    Animated,
    Dimensions,
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

const { width } = Dimensions.get('window');

type CreditCard = {
    id: string;
    name: string;
    brand: 'visa' | 'mastercard' | 'amex' | 'other';
    limit: number;
    cutDay: number;
    dueDay: number;
    color: string;
    interestRate: number; // Tasa E.A. %
};

const CARD_COLORS = ['#84CC16', '#18181B', '#FAFAFA', '#6366F1', '#EC4899', '#EF4444', '#0F172A'];

const getTextColorForBg = (bgColor: string) => {
    if (!bgColor) return '#FFFFFF';
    const hex = bgColor.replace('#', '');
    if (hex.length !== 6) return '#FFFFFF';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 180) ? '#18181B' : '#FFFFFF';
};

export default function CardsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, currency, rates, isHidden, cards, customAccounts, refreshConfig } = useAuth();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const now = new Date();
    const [cardBalances, setCardBalances] = useState<Record<string, number>>({});
    const [cardTransactions, setCardTransactions] = useState<Record<string, any[]>>({});
    
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLimit, setNewLimit] = useState('');
    const [newCutDay, setNewCutDay] = useState('');
    const [newDueDay, setNewDueDay] = useState('');
    const [newBrand, setNewBrand] = useState<'visa' | 'mastercard' | 'amex' | 'other'>('visa');
    const [newColor, setNewColor] = useState(CARD_COLORS[0]);
    const [newInterest, setNewInterest] = useState('28');
    const [newInitialBalance, setNewInitialBalance] = useState('');
    const [newInitialDate, setNewInitialDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });
    const [hasInitialBalance, setHasInitialBalance] = useState(false);

    // Edit Card State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
    const [editName, setEditName] = useState('');
    const [editLimit, setEditLimit] = useState('');
    const [editCutDay, setEditCutDay] = useState('');
    const [editDueDay, setEditDueDay] = useState('');
    const [editBrand, setEditBrand] = useState<'visa' | 'mastercard' | 'amex' | 'other'>('visa');
    const [editColor, setEditColor] = useState(CARD_COLORS[0]);
    const [editInterest, setEditInterest] = useState('28');

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<'home' | 'wallet' | 'progress'>('home');
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [txFilter, setTxFilter] = useState<'all' | 'expense' | 'income'>('all');

    // Simulator State
    const [simModalVisible, setSimModalVisible] = useState(false);
    const [simAmount, setSimAmount] = useState('');
    const [simInstallments, setSimInstallments] = useState('1');

    // Flip Animation State
    const flipAnim = useRef(new Animated.Value(0)).current;
    const [isFlipped, setIsFlipped] = useState(false);
    
    const handleFlip = () => {
        Animated.timing(flipAnim, {
            toValue: isFlipped ? 0 : 180,
            duration: 400,
            useNativeDriver: true,
        }).start();
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsFlipped(!isFlipped);
    };

    const frontStyle = {
        transform: [{ rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] }) }],
        backfaceVisibility: 'hidden' as const,
    };
    
    const backStyle = {
        transform: [{ rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] }) }],
        backfaceVisibility: 'hidden' as const,
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
    };

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    const loadData = async () => {
        if (!user?.id || cards.length === 0) return;
        try {
            if (!activeTab && cards.length > 0) setActiveTab(cards[0].id);

            const { data: txs } = await supabase
                .from('transactions')
                .select('*')
                .eq('user_id', user.id)
                .in('account', cards.map(c => c.name))
                .order('date', { ascending: false });

            const balances: Record<string, number> = {};
            const txGroups: Record<string, any[]> = {};
            cards.forEach(c => {
                balances[c.name] = 0;
                txGroups[c.name] = [];
            });

            txs?.forEach(tx => {
                const amt = Number(tx.amount || 0);
                txGroups[tx.account]?.push(tx);
                if (tx.type === 'expense') balances[tx.account] += amt;
                else if (tx.type === 'income' || tx.type === 'transfer') balances[tx.account] -= amt;
            });

            Object.keys(balances).forEach(k => { if (balances[k] < 0) balances[k] = 0; });
            setCardBalances(balances);
            setCardTransactions(txGroups);
        } catch (e) { console.error(e); }
    };

    const calculateNextPayment = (card: CreditCard) => {
        const txs = cardTransactions[card.name] || [];
        const today = new Date();
        let targetMonth = today.getMonth();
        let targetYear = today.getFullYear();
        
        if (today.getDate() > card.dueDay) {
            targetMonth++;
            if (targetMonth > 11) {
                targetMonth = 0;
                targetYear++;
            }
        }
        
        let total = 0;
        txs.forEach(tx => {
            total += getAmountDueForMonth(tx, card, targetMonth, targetYear);
        });
        
        return Math.max(0, total);
    };

    const getShoppingAdvice = (card: CreditCard) => {
        const today = new Date().getDate();
        const cut = card.cutDay;
        
        // Si el día de corte es mayor que el actual, falta para el corte
        // Si el día actual está cerca del corte (pocos días antes), es mal momento.
        // Si el día actual es justo después del corte, es el Día de Oro.
        
        let diff = cut - today;
        if (diff < 0) diff += 30; // Ajustar si ya pasó el corte este mes

        if (diff === 0 || diff >= 28) {
            return { 
                type: 'gold', 
                title: '🟡 DÍA DE ORO', 
                msg: 'Acabas de cerrar ciclo. ¡Compra hoy y tendrás aproximadamente 45 días para pagar!',
                color: colorsNav.isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
                borderColor: '#F59E0B',
                textColor: colorsNav.isDark ? '#FBBF24' : '#B45309'
            };
        }
        if (diff <= 3) {
            return { 
                type: 'warn', 
                title: '🔴 ALERTA DE CORTE', 
                msg: 'Falta muy poco para el corte. Las compras se facturarán en pocos días. ¡Evita gastos grandes!',
                color: colorsNav.isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                borderColor: '#EF4444',
                textColor: colorsNav.isDark ? '#FCA5A5' : '#B91C1C'
            };
        }
        return { 
            type: 'info', 
            title: '🟢 CICLO NORMAL', 
            msg: `Faltan ${diff} días para tu cierre de ciclo. Compra con tranquilidad.`,
            color: colorsNav.isDark ? 'rgba(34, 197, 94, 0.12)' : '#F0FDF4',
            borderColor: '#22C55E',
            textColor: colorsNav.isDark ? '#86EFAC' : '#15803D'
        };
    };

    const getDaysUntil = (targetDay: number): number => {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        // If target day is still this month
        if (targetDay >= currentDay) {
            return targetDay - currentDay;
        }
        // Target day has passed this month, so count to next month's occurrence
        const nextOccurrence = new Date(currentYear, currentMonth + 1, targetDay);
        const diffTime = nextOccurrence.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };


    const scrollRef = useRef<any>(null);

    useEffect(() => { 
        if (isFocused) {
            loadData(); 
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        } 
    }, [isFocused, cards.length]);

    // Reset flip when card changes
    useEffect(() => {
        if (selectedCardId && isFlipped) {
            flipAnim.setValue(0);
            setIsFlipped(false);
        }
    }, [selectedCardId]);

    const handleLimitChange = (text: string) => {
        setNewLimit(formatInputDisplay(text, currency));
    };

    const openEditCard = (card: CreditCard) => {
        setEditingCard(card);
        setEditName(card.name);
        setEditLimit(formatInputDisplay(convertCurrency(card.limit, currency, rates).toString(), currency));
        setEditCutDay(card.cutDay.toString());
        setEditDueDay(card.dueDay.toString());
        setEditBrand(card.brand);
        setEditColor(card.color);
        setEditInterest(card.interestRate.toString());
        setEditModalVisible(true);
    };

    const handleEditCard = async () => {
        if (!editingCard) return;
        const typedLim = parseInputToNumber(editLimit, currency);
        const limit = convertToBase(typedLim, currency, rates);
        const cut = parseInt(editCutDay, 10);
        const due = parseInt(editDueDay, 10);
        if (!editName.trim() || isNaN(limit) || isNaN(cut) || isNaN(due)) {
            Alert.alert('Error', 'Completa todos los campos correctamente.');
            return;
        }
        const updatedCard: CreditCard = {
            ...editingCard,
            name: editName.trim(),
            brand: editBrand,
            limit,
            cutDay: cut,
            dueDay: due,
            color: editColor,
            interestRate: parseFloat(editInterest) || 0,
        };
        // If name changed, update transactions account reference
        if (editingCard.name !== updatedCard.name) {
            try {
                await supabase.from('transactions')
                    .update({ account: updatedCard.name })
                    .eq('user_id', user?.id)
                    .eq('account', editingCard.name);
                // Update custom accounts list
                const storedAccs = await AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(user?.id ?? ''));
                if (storedAccs) {
                    const parsedAccs = JSON.parse(storedAccs);
                    const idx = parsedAccs.indexOf(editingCard.name);
                    if (idx !== -1) { parsedAccs[idx] = updatedCard.name; }
                    else if (!parsedAccs.includes(updatedCard.name)) parsedAccs.push(updatedCard.name);
                    await AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(user?.id ?? ''), JSON.stringify(parsedAccs));
                }
            } catch (e) { console.error('Error updating transactions account:', e); }
        }
        const updated = cards.map(c => c.id === editingCard.id ? updatedCard : c);
        await AsyncStorage.setItem(SYNC_KEYS.CARDS(user?.id ?? ''), JSON.stringify(updated));
        await syncUp(user?.id ?? '');
        await refreshConfig();
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditModalVisible(false);
        setEditingCard(null);
        loadData();
    };

    const handleAddCard = async () => {
        const typedLim = parseInputToNumber(newLimit, currency);
        const limit = convertToBase(typedLim, currency, rates);
        const cut = parseInt(newCutDay, 10);
        const due = parseInt(newDueDay, 10);

        if (!newName.trim() || isNaN(limit) || isNaN(cut) || isNaN(due)) {
            Alert.alert('Error', 'Completa todos los campos correctamente.');
            return;
        }

        // Validate initial balance date format if provided
        if (hasInitialBalance && newInitialBalance) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(newInitialDate)) {
                Alert.alert('Error', 'La fecha del saldo inicial debe tener el formato AAAA-MM-DD.');
                return;
            }
        }

        const newCard: CreditCard = {
            id: Date.now().toString(),
            name: newName.trim(),
            brand: newBrand,
            limit,
            cutDay: cut,
            dueDay: due,
            color: newColor,
            interestRate: parseFloat(newInterest) || 0,
        };

        const updated = [...cards, newCard];
        await AsyncStorage.setItem(SYNC_KEYS.CARDS(user?.id ?? ''), JSON.stringify(updated));
        
        const storedParams = await AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(user?.id ?? ''));
        const currentCustomAccounts = storedParams ? JSON.parse(storedParams) : [];
        if (!currentCustomAccounts.includes(newCard.name)) {
            await AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(user?.id ?? ''), JSON.stringify([...currentCustomAccounts, newCard.name]));
        }

        // Insert initial balance as a historical expense transaction
        if (hasInitialBalance && newInitialBalance) {
            const typedInitial = parseInputToNumber(newInitialBalance, currency);
            const initialAmt = convertToBase(typedInitial, currency, rates);
            if (!isNaN(initialAmt) && initialAmt > 0) {
                try {
                    await supabase.from('transactions').insert([{
                        user_id: user?.id,
                        amount: initialAmt,
                        type: 'expense',
                        category: 'Tarjetas',
                        description: 'Saldo inicial (deuda preexistente)',
                        account: newCard.name,
                        date: newInitialDate,
                    }]);
                } catch (e) {
                    console.error('Error inserting initial balance:', e);
                }
            }
        }

        await syncUp(user?.id ?? '');
        await refreshConfig();

        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setAddModalVisible(false);
        setNewName(''); setNewLimit(''); setNewCutDay(''); setNewDueDay('');
        setNewInitialBalance(''); setHasInitialBalance(false);
        const d = new Date();
        setNewInitialDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        loadData();
    };

    const getDaysUntil = (day: number) => {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        let target = new Date(currentYear, currentMonth, day);
        if (target < today) {
            target = new Date(currentYear, currentMonth + 1, day);
        }
        const diffTime = target.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const getUtilization = (limit: number, balance: number) => {
        if (limit === 0) return 0;
        return (balance / limit) * 100;
    };

    const handleDeleteCard = (card: CreditCard) => {
        const executeDelete = async () => {
            try {
                // Borrar transacciones de la tarjeta
                await supabase.from('transactions').delete().eq('user_id', user?.id).eq('account', card.name);

                // Quitar de cuentas personalizadas
                const storedAccs = await AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(user?.id ?? ''));
                if (storedAccs) {
                    const parsedAccs = JSON.parse(storedAccs);
                    const updatedAccs = parsedAccs.filter((a: string) => a !== card.name);
                    await AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(user?.id ?? ''), JSON.stringify(updatedAccs));
                }

                // Borrar la tarjeta
                const updated = cards.filter(c => c.id !== card.id);
                await AsyncStorage.setItem(SYNC_KEYS.CARDS(user?.id ?? ''), JSON.stringify(updated));
                
                await syncUp(user?.id ?? '');
                await refreshConfig();
                loadData();
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
                console.error('Error deleting card:', error);
                Alert.alert('Error', 'No se pudo eliminar la tarjeta por completo.');
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`¿Estás seguro de que quieres eliminar la tarjeta ${card.name}?`)) {
                executeDelete();
            }
        } else {
            Alert.alert('Eliminar Tarjeta', `¿Eliminar ${card.name}?`, [
                { text: 'No', style: 'cancel' },
                { text: 'Sí', style: 'destructive', onPress: executeDelete }
            ]);
        }
    };

    const handlePayCard = async () => {
        if (!selectedCard) return;
        const typedPay = parseInputToNumber(payAmount, currency);
        const payVal = convertToBase(typedPay, currency, rates);
        if (isNaN(payVal) || payVal <= 0) return;

        try {
            const { data: txs, error: txErr } = await supabase
                .from('transactions')
                .select('amount, type')
                .eq('user_id', user?.id)
                .eq('account', selectedAccount);
            
            if (!txErr && txs) {
                const balance = txs.reduce((acc, curr) => curr.type === 'income' ? acc + curr.amount : acc - curr.amount, 0);
                if (balance < payVal) {
                    Alert.alert('Saldo Insuficiente', `No tienes fondos suficientes en "${selectedAccount}".\n\nDisponible: ${fmt(balance)}\nRequerido: ${fmt(payVal)}`);
                    return;
                }
            }

            await supabase.from('transactions').insert([
                { user_id: user?.id, amount: payVal, type: 'expense', category: 'Tarjetas', description: `Pago a ${selectedCard.name}`, account: selectedAccount, date: getLocalISOString() },
                { user_id: user?.id, amount: payVal, type: 'income', category: 'Tarjetas', description: `Abono desde ${selectedAccount}`, account: selectedCard.name, date: getLocalISOString() }
            ]);
            setPayModalVisible(false); setPayAmount(''); loadData();
        } catch (e) { console.error(e); }
    };

    const currentCard = cards.find(c => c.id === activeTab);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            {/* VISTA DE LISTADO PRINCIPAL */}
            {!selectedCardId ? (
                <View style={{ flex: 1 }}>
                    <View style={styles.header}>
                        <TouchableOpacity 
                            style={[styles.backBtn, { backgroundColor: isDark ? colorsNav.card : '#F8F5F0', borderColor: colorsNav.border }]} 
                            onPress={() => router.replace('/')}
                        >
                            <Ionicons name="chevron-back" size={24} color={colorsNav.text} />
                        </TouchableOpacity>
                        <View style={{ flex: 1, marginLeft: 15 }}>
                            <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Mis Tarjetas</Text>
                            <Text style={[styles.headerSub, { color: colorsNav.sub }]}>Selecciona una tarjeta para ver detalles</Text>
                        </View>
                        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colorsNav.accent }]} onPress={() => setAddModalVisible(true)}>
                            <MaterialIcons name="add" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.listScroll} showsVerticalScrollIndicator={false}>
                        {cards.length > 0 ? (
                            <View style={styles.cardVerticalStack}>
                                {cards.map(c => {
                                    const debt = cardBalances[c.name] || 0;
                                    const isLight = getTextColorForBg(c.color) === '#18181B';
                                    const textColor = isLight ? '#18181B' : '#FFFFFF';
                                    const subTextColor = isLight ? 'rgba(24, 24, 27, 0.6)' : 'rgba(255, 255, 255, 0.6)';
                                    const utilization = getUtilization(c.limit, debt);
                                    
                                    return (
                                        <TouchableOpacity 
                                            key={c.id} 
                                            activeOpacity={0.9} 
                                            style={[styles.stackedCardWrapper, { shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }]}
                                            onPress={() => {
                                                setSelectedCardId(c.id);
                                                setActiveTab(c.id);
                                                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                            }}
                                        >
                                            <View style={[styles.cardFacePremium, { backgroundColor: c.color, borderWidth: utilization > 70 ? 2 : (isLight ? 1 : 0), borderColor: utilization > 70 ? '#EF4444' : 'rgba(0,0,0,0.08)' }]}>
                                                {utilization > 70 && (
                                                    <View style={{ position: 'absolute', top: 14, right: 14, backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900' }}>ALTO USO</Text>
                                                    </View>
                                                )}
                                                <View style={styles.cardTop}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <MaterialIcons name="contactless" size={22} color={textColor} style={{ opacity: 0.8 }} />
                                                    </View>
                                                    <Text style={[styles.cardBrandText, { color: textColor, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.5 }]}>
                                                        {c.brand.toUpperCase()}
                                                    </Text>
                                                </View>

                                                <View style={{ marginVertical: 4 }}>
                                                    <Text style={[styles.cardBalanceLabel, { color: subTextColor }]}>CUPO DISPONIBLE</Text>
                                                    <Text style={[styles.cardBalanceAmount, { color: textColor, fontSize: 24 }]}>{fmt(c.limit - debt)}</Text>
                                                </View>

                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Text style={[styles.cardNumberText, { color: subTextColor, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1 }]}>
                                                        •••• {c.id.slice(-4)}
                                                    </Text>
                                                    <View style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                                                        <Text style={{ color: textColor, fontSize: 10, fontWeight: '700' }}>Uso: {utilization.toFixed(0)}%</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : (
                            <View style={styles.empty}>
                                <MaterialIcons name="credit-card-off" size={60} color={colorsNav.sub} style={{ opacity: 0.3 }} />
                                <Text style={[styles.emptyTxt, { color: colorsNav.sub }]}>Agrega una tarjeta para comenzar</Text>
                                <TouchableOpacity style={[styles.addBtnLarge, { backgroundColor: colorsNav.accent, marginTop: 15, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 }]} onPress={() => setAddModalVisible(true)}>
                                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Agregar Tarjeta</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </View>
            ) : (
                /* VISTA DE DETALLE DE TARJETA */
                currentCard ? (() => {
                    const debt = cardBalances[currentCard.name] || 0;
                    const utilization = getUtilization(currentCard.limit, debt);
                    const isLight = getTextColorForBg(currentCard.color) === '#18181B';
                    const textColor = isLight ? '#18181B' : '#FFFFFF';
                    const subTextColor = isLight ? 'rgba(24, 24, 27, 0.6)' : 'rgba(255, 255, 255, 0.6)';
                    
                    const activeTxs = cardTransactions[currentCard.name] || [];
                    const filteredTxs = activeTxs.filter(tx => {
                        if (txFilter === 'expense') return tx.type === 'expense';
                        if (txFilter === 'income') return tx.type === 'income' || tx.type === 'transfer';
                        return true;
                    });
                    const groupedTxs = groupTransactions(filteredTxs);
                    const hasTransactions = filteredTxs.length > 0;

                    // Calculate upcoming payments
                    const nextPaymentAmt = calculateNextPayment(currentCard);

                    const renderUnifiedDetail = () => {
                        // ── Calcular saldo por ciclo de facturación ──
                        const now2 = new Date();
                        const currentMonthD = now2.getMonth();
                        const currentYearD = now2.getFullYear();

                        let currentCycleAmount = 0; // Lo que se debe pagar ESTE mes
                        let futureCycleAmount = 0;   // Comprometido en meses futuros

                        activeTxs.forEach(tx => {
                            if (tx.type !== 'expense') return;
                            const txDate = new Date(tx.date + (tx.date.includes('T') ? '' : 'T12:00:00'));
                            const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);

                            const getFirstPay = () => {
                                const day = txDate.getDate();
                                const month = txDate.getMonth();
                                const year = txDate.getFullYear();
                                let cutMonth = month; let cutYear = year;
                                if (day > currentCard.cutDay) {
                                    cutMonth = month + 1;
                                    if (cutMonth > 11) { cutMonth = 0; cutYear = year + 1; }
                                }
                                const cutDate = new Date(cutYear, cutMonth, currentCard.cutDay);
                                let dueDate = new Date(cutDate.getFullYear(), cutDate.getMonth(), currentCard.dueDay);
                                if (dueDate <= cutDate) {
                                    dueDate = new Date(cutDate.getFullYear(), cutDate.getMonth() + 1, currentCard.dueDay);
                                }
                                return { month: dueDate.getMonth(), year: dueDate.getFullYear() };
                            };

                            const { month: firstPayMonth, year: firstPayYear } = getFirstPay();
                            const installments = match ? parseInt(match[1], 10) : 1;
                            const ea = match ? (parseFloat(match[2] || '0') / 100) : 0;
                            let monthlyAmt = tx.amount;
                            if (installments > 1) {
                                if (ea > 0) {
                                    const mv = Math.pow(1 + ea, 1/12) - 1;
                                    monthlyAmt = (tx.amount * mv) / (1 - Math.pow(1 + mv, -installments));
                                } else {
                                    monthlyAmt = tx.amount / installments;
                                }
                            }

                            const monthsDiff = (currentYearD - firstPayYear) * 12 + (currentMonthD - firstPayMonth);
                            if (monthsDiff === 0) {
                                currentCycleAmount += monthlyAmt;
                            } else if (monthsDiff < 0 && Math.abs(monthsDiff) < installments) {
                                // Futura cuota — todavía no vence
                                futureCycleAmount += monthlyAmt * installments;
                            } else if (monthsDiff > 0 && monthsDiff < installments) {
                                currentCycleAmount += monthlyAmt;
                            }
                        });

                        // Restar pagos realizados
                        const paymentsThisMonth = activeTxs
                            .filter(tx => tx.type === 'income' || tx.type === 'transfer')
                            .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
                        currentCycleAmount = Math.max(0, currentCycleAmount - paymentsThisMonth);
                        const hasDueThisMonth = currentCycleAmount > 0;

                        // ── Cuotas Activas ──
                        const installmentTxs = activeTxs.filter(tx =>
                            tx.type === 'expense' && tx.description?.includes('[CUOTAS:')
                        );
                        const activeInstallments = installmentTxs.filter(tx => {
                            const match = tx.description?.match(/\[CUOTAS:(\d+)/);
                            if (!match) return false;
                            const total = parseInt(match[1], 10);
                            const txDate = new Date(tx.date);
                            const { month: sm, year: sy } = calculateFirstPaymentMonth(txDate, currentCard.cutDay, currentCard.dueDay);
                            const monthsDiff = (now.getFullYear() - sy) * 12 + (now.getMonth() - sm);
                            return monthsDiff < total;
                        });

                        return (
                            <View style={{ flex: 1 }}>
                                {/* Header */}
                                <View style={styles.header}>
                                    <TouchableOpacity
                                        style={[styles.backBtn, { backgroundColor: isDark ? colorsNav.card : '#F8F5F0', borderColor: colorsNav.border }]}
                                        onPress={() => setSelectedCardId(null)}
                                    >
                                        <Ionicons name="chevron-back" size={24} color={colorsNav.text} />
                                    </TouchableOpacity>
                                    <View style={{ flex: 1, marginLeft: 15 }}>
                                        <Text style={[styles.headerTitle, { color: colorsNav.text }]}>{currentCard.name}</Text>
                                        <Text style={[styles.headerSub, { color: colorsNav.sub }]}>Detalles de Tarjeta</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.quickActionIcon, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}
                                        onPress={() => openEditCard(currentCard)}
                                    >
                                        <MaterialIcons name="edit" size={20} color={colorsNav.text} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

                                    {/* ── Tarjeta Visual ── */}
                                    <TouchableOpacity activeOpacity={0.9} onPress={handleFlip} style={[styles.cardWrapperDetail, { shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, marginBottom: 20 }]}>
                                        <Animated.View style={[styles.cardFacePremiumDetail, { backgroundColor: currentCard.color }, frontStyle]}>
                                            <View style={styles.cardTop}>
                                                <MaterialIcons name="contactless" size={28} color={textColor} style={{ opacity: 0.8 }} />
                                                <Text style={{ color: textColor, fontSize: 17, fontWeight: '900', fontStyle: 'italic' }}>
                                                    {currentCard.brand.toUpperCase()}
                                                </Text>
                                            </View>
                                            <View style={{ marginVertical: 14 }}>
                                                <Text style={{ color: subTextColor, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }}>CUPO DISPONIBLE</Text>
                                                <Text style={{ color: textColor, fontSize: 30, fontWeight: '900' }}>{fmt(currentCard.limit - debt)}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={{ color: subTextColor, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1, fontSize: 13 }}>
                                                    •••• {currentCard.id.slice(-4)}
                                                </Text>
                                                <View style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                                                    <Text style={{ color: textColor, fontSize: 10, fontWeight: '700' }}>{utilization.toFixed(0)}% Usado</Text>
                                                </View>
                                            </View>
                                        </Animated.View>

                                        <Animated.View style={[styles.cardFacePremiumDetail, { backgroundColor: currentCard.color }, backStyle]}>
                                            <View style={{ width: '120%', height: 40, backgroundColor: 'rgba(0,0,0,0.8)', alignSelf: 'center', marginTop: 10, marginLeft: -24 }} />
                                            <View style={{ flexDirection: 'row', marginTop: 20, alignItems: 'center' }}>
                                                <View style={{ flex: 1, height: 30, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 10 }}>
                                                    <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '900', color: '#000', fontStyle: 'italic' }}>CVV 123</Text>
                                                </View>
                                            </View>
                                            <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <View>
                                                    <Text style={{ color: subTextColor, fontSize: 10, fontWeight: '800' }}>TASA E.A.</Text>
                                                    <Text style={{ color: textColor, fontSize: 16, fontWeight: '900' }}>{currentCard.interestRate}%</Text>
                                                </View>
                                                <View>
                                                    <Text style={{ color: subTextColor, fontSize: 10, fontWeight: '800' }}>CORTE / PAGO</Text>
                                                    <Text style={{ color: textColor, fontSize: 16, fontWeight: '900' }}>Día {currentCard.cutDay} / Día {currentCard.dueDay}</Text>
                                                </View>
                                            </View>
                                        </Animated.View>
                                    </TouchableOpacity>

                                    {/* ── Resumen de Pago del Ciclo ── */}
                                    <View style={{ backgroundColor: colorsNav.card, borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colorsNav.border }}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                            <View>
                                                <Text style={{ color: colorsNav.sub, fontSize: 12, fontWeight: '600' }}>Saldo Total</Text>
                                                <Text style={{ color: colorsNav.text, fontSize: 28, fontWeight: '900', marginTop: 2 }}>{fmt(debt)}</Text>
                                            </View>
                                            {hasDueThisMonth ? (
                                                <View style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#EF444430', alignItems: 'center' }}>
                                                    <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '800' }}>PAGO ESTE MES</Text>
                                                    <Text style={{ color: '#EF4444', fontSize: 17, fontWeight: '900', marginTop: 2 }}>{fmt(currentCycleAmount)}</Text>
                                                </View>
                                            ) : (
                                                <View style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#22C55E30', alignItems: 'center' }}>
                                                    <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '800' }}>ESTE MES</Text>
                                                    <Text style={{ color: '#22C55E', fontSize: 17, fontWeight: '900', marginTop: 2 }}>$0</Text>
                                                </View>
                                            )}
                                        </View>

                                        {/* Barra de uso de límite */}
                                        <View style={{ marginBottom: 12 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600' }}>Uso del límite</Text>
                                                <Text style={{ color: colorsNav.text, fontSize: 11, fontWeight: '800' }}>{fmt(debt)} / {fmt(currentCard.limit)}</Text>
                                            </View>
                                            <View style={{ height: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                                                <View style={{
                                                    height: '100%',
                                                    width: `${Math.min(utilization, 100)}%`,
                                                    backgroundColor: utilization > 85 ? '#EF4444' : utilization > 60 ? '#F59E0B' : '#3B82F6',
                                                    borderRadius: 4
                                                }} />
                                            </View>
                                        </View>

                                        {/* Acciones rápidas */}
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                            <TouchableOpacity
                                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colorsNav.accent, borderRadius: 12, paddingVertical: 11 }}
                                                onPress={() => { setSelectedCard(currentCard); setPayModalVisible(true); }}
                                            >
                                                <MaterialIcons name="payment" size={16} color="#FFF" />
                                                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>Registrar Pago</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={{ paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', borderRadius: 12, paddingVertical: 11, borderWidth: 1, borderColor: '#EF444430' }}
                                                onPress={() => handleDeleteCard(currentCard)}
                                            >
                                                <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* ── Días al Corte y al Pago ── */}
                                    {(() => {
                                        const daysUntilCut = getDaysUntil(currentCard.cutDay);
                                        const daysUntilDue = getDaysUntil(currentCard.dueDay);
                                        const cutColor = daysUntilCut <= 3 ? '#EF4444' : daysUntilCut <= 7 ? '#F59E0B' : '#22C55E';
                                        const dueColor = daysUntilDue <= 3 ? '#EF4444' : daysUntilDue <= 7 ? '#F59E0B' : '#3B82F6';
                                        return (
                                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                                                <View style={{ flex: 1, backgroundColor: isDark ? `${cutColor}18` : `${cutColor}12`, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${cutColor}40`, alignItems: 'center' }}>
                                                    <MaterialIcons name="content-cut" size={18} color={cutColor} />
                                                    <Text style={{ color: cutColor, fontWeight: '900', fontSize: 26, marginTop: 4 }}>{daysUntilCut}</Text>
                                                    <Text style={{ color: cutColor, fontSize: 10, fontWeight: '700' }}>días al corte</Text>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 2 }}>Día {currentCard.cutDay} de cada mes</Text>
                                                </View>
                                                <View style={{ flex: 1, backgroundColor: isDark ? `${dueColor}18` : `${dueColor}12`, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${dueColor}40`, alignItems: 'center' }}>
                                                    <MaterialIcons name="credit-card" size={18} color={dueColor} />
                                                    <Text style={{ color: dueColor, fontWeight: '900', fontSize: 26, marginTop: 4 }}>{daysUntilDue}</Text>
                                                    <Text style={{ color: dueColor, fontSize: 10, fontWeight: '700' }}>días al pago</Text>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 2 }}>Día {currentCard.dueDay} de cada mes</Text>
                                                </View>
                                            </View>
                                        );
                                    })()}

                                    {/* ── Estado del Ciclo ── */}
                                    {(() => {
                                        const advice = getShoppingAdvice(currentCard);
                                        return (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: advice.color, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: advice.borderColor, marginBottom: 20 }}>
                                                <Text style={{ fontSize: 20, marginRight: 10 }}>{advice.title.split(' ')[0]}</Text>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: advice.textColor, fontWeight: '900', fontSize: 13 }}>{advice.title.replace(/[^\w\s]/g, '').trim()}</Text>
                                                    <Text style={{ color: advice.textColor, opacity: 0.85, fontSize: 11, marginTop: 2 }}>{advice.msg}</Text>
                                                </View>
                                            </View>
                                        );
                                    })()}

                                    {/* ── Cuotas Activas ── */}
                                    {activeInstallments.length > 0 && (
                                        <View style={{ marginBottom: 20 }}>
                                            <Text style={{ fontSize: 16, fontWeight: '900', color: colorsNav.text, marginBottom: 12 }}>Cuotas Activas</Text>
                                            {activeInstallments.map(tx => {
                                                const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
                                                const total = match ? parseInt(match[1], 10) : 1;
                                                const ea = match ? (parseFloat(match[2] || '0') / 100) : 0;
                                                const mv = ea > 0 ? Math.pow(1 + ea, 1/12) - 1 : 0;
                                                const monthlyAmt = mv > 0
                                                    ? (tx.amount * mv) / (1 - Math.pow(1 + mv, -total))
                                                    : tx.amount / total;
                                                const txDate = new Date(tx.date);
                                                const { month: sm, year: sy } = calculateFirstPaymentMonth(txDate, currentCard.cutDay, currentCard.dueDay);
                                                const firstPayDate = new Date(sy, sm, currentCard.dueDay);
                                                const monthsElapsed = Math.max(0, (now.getFullYear() - sy) * 12 + (now.getMonth() - sm));
                                                const paidCount = Math.min(total, monthsElapsed + (monthsElapsed >= 0 ? 1 : 0));
                                                const remaining = total - Math.min(total, Math.max(0, monthsElapsed));
                                                const progress = Math.min(total, Math.max(0, monthsElapsed)) / total;
                                                const cleanDesc = getCleanDescription(tx.description);
                                                const isFirstPayFuture = now < firstPayDate;

                                                return (
                                                    <View key={tx.id} style={{ backgroundColor: colorsNav.card, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: isFirstPayFuture ? '#3B82F620' : colorsNav.border }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                                            <View style={{ flex: 1, marginRight: 10 }}>
                                                                <Text style={{ color: colorsNav.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{cleanDesc}</Text>
                                                                <Text style={{ color: colorsNav.sub, fontSize: 11, marginTop: 2 }}>
                                                                    {fmt(monthlyAmt)}/mes
                                                                    {isFirstPayFuture ? ` • Primer cobro: ${firstPayDate.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })}` : ''}
                                                                </Text>
                                                            </View>
                                                            {isFirstPayFuture ? (
                                                                <View style={{ backgroundColor: '#3B82F620', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                                                    <Text style={{ color: '#3B82F6', fontSize: 10, fontWeight: '800' }}>PRÓXIMO MES</Text>
                                                                </View>
                                                            ) : (
                                                                <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 13 }}>{Math.min(total, Math.max(0, monthsElapsed))}/{total}</Text>
                                                            )}
                                                        </View>
                                                        <View style={{ height: 5, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                                            <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: colorsNav.accent, borderRadius: 3 }} />
                                                        </View>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                                            <Text style={{ color: colorsNav.sub, fontSize: 10 }}>{Math.min(total, Math.max(0, monthsElapsed))} pagadas</Text>
                                                            <Text style={{ color: colorsNav.sub, fontSize: 10 }}>{remaining} restantes · {fmt(monthlyAmt * remaining)} total</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}

                                    {/* ── Movimientos Recientes ── */}
                                    {activeTxs.length > 0 && (
                                        <View>
                                            <Text style={{ fontSize: 16, fontWeight: '900', color: colorsNav.text, marginBottom: 12 }}>Movimientos</Text>
                                            {Object.entries(groupTransactions(activeTxs)).map(([groupName, txsGroup]) => {
                                                if (txsGroup.length === 0) return null;
                                                return (
                                                    <View key={groupName} style={{ marginBottom: 8 }}>
                                                        <Text style={{ fontSize: 11, fontWeight: '800', color: colorsNav.sub, marginBottom: 8 }}>{groupName}</Text>
                                                        {txsGroup.map(tx => {
                                                            const cleanDesc = getCleanDescription(tx.description);
                                                            const catIcon = getCategoryIcon(tx.category);
                                                            const hasInst = tx.description?.includes('[CUOTAS:');
                                                            let instInfo = '';
                                                            if (hasInst) {
                                                                const m = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
                                                                const tot = m ? parseInt(m[1], 10) : 1;
                                                                const ea2 = m ? (parseFloat(m[2] || '0') / 100) : 0;
                                                                const mv2 = ea2 > 0 ? Math.pow(1 + ea2, 1/12) - 1 : 0;
                                                                const monthly2 = mv2 > 0 ? (tx.amount * mv2) / (1 - Math.pow(1 + mv2, -tot)) : tx.amount / tot;
                                                                instInfo = ` · ${tot} cuotas · ${fmt(monthly2)}/mes`;
                                                            }
                                                            return (
                                                                <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                                                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                                                        <Ionicons name={catIcon as any} size={18} color={colorsNav.sub} />
                                                                    </View>
                                                                    <View style={{ flex: 1 }}>
                                                                        <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{cleanDesc}</Text>
                                                                        <Text style={{ color: colorsNav.sub, fontSize: 11, marginTop: 1 }}>
                                                                            {new Date(tx.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}{instInfo}
                                                                        </Text>
                                                                    </View>
                                                                    <Text style={{ color: tx.type === 'income' ? '#22C55E' : colorsNav.text, fontWeight: '800', fontSize: 13 }}>
                                                                        {tx.type === 'income' ? '-' : '+'}{fmt(tx.amount)}
                                                                    </Text>
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}

                                    {activeTxs.length === 0 && (
                                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                                            <MaterialIcons name="credit-card-off" size={48} color={colorsNav.sub} style={{ opacity: 0.3 }} />
                                            <Text style={{ color: colorsNav.sub, marginTop: 12, fontWeight: '600' }}>Sin movimientos en esta tarjeta</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </View>
                        );
                    };

                    return renderUnifiedDetail();
                }) () : null
            )}

            {/* ─── Edit Card Modal ─── */}
            <Modal visible={editModalVisible} transparent animationType="fade">
                <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}>
                    <View style={styles.overlay}>
                        <TouchableWithoutFeedback>
                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modal, { backgroundColor: colorsNav.card }]}>
                                <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Editar Tarjeta</Text>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>NOMBRE DE LA TARJETA</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Ej: NuBank Platinum" placeholderTextColor={colorsNav.sub} value={editName} onChangeText={setEditName} />
                                    </View>
                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>LÍMITE DE CRÉDITO</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={editLimit} onChangeText={t => setEditLimit(formatInputDisplay(t, currency))} />
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 15, marginBottom: 20 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>DÍA CORTE</Text>
                                            <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="1-31" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={editCutDay} onChangeText={setEditCutDay} maxLength={2} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>DÍA PAGO</Text>
                                            <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="1-31" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={editDueDay} onChangeText={setEditDueDay} maxLength={2} />
                                        </View>
                                    </View>
                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>INTERÉS ANUAL (E.A. %)</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Ej: 28" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={editInterest} onChangeText={setEditInterest} />
                                    </View>
                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>MARCA Y COLOR</Text>
                                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                            {(['visa', 'mastercard', 'amex'] as const).map(b => (
                                                <TouchableOpacity key={b} style={[styles.brandBtn, { borderColor: editBrand === b ? colorsNav.accent : colorsNav.border, backgroundColor: editBrand === b ? colorsNav.accent + '10' : 'transparent' }]} onPress={() => setEditBrand(b)}>
                                                    <Text style={{ fontSize: 10, fontWeight: '800', color: editBrand === b ? colorsNav.accent : colorsNav.sub }}>{b.toUpperCase()}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                            {CARD_COLORS.map(c => (
                                                <TouchableOpacity key={c} onPress={() => setEditColor(c)} style={[styles.colorDot, { backgroundColor: c }, editColor === c && { borderWidth: 3, borderColor: colorsNav.text }]} />
                                            ))}
                                        </View>
                                    </View>
                                    {/* Danger Zone */}
                                    <View style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2', borderRadius: 16, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#EF444430' }}>
                                        <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 12, marginBottom: 10 }}>ZONA DE PELIGRO</Text>
                                        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => { setEditModalVisible(false); setTimeout(() => handleDeleteCard(editingCard!), 300); }}>
                                            <MaterialIcons name="delete-forever" size={20} color="#EF4444" />
                                            <Text style={{ color: '#EF4444', fontWeight: '700' }}>Eliminar esta tarjeta</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={[styles.modalFooter, { marginTop: 20 }]}>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg, borderWidth: 1, borderColor: colorsNav.border }]} onPress={() => setEditModalVisible(false)}>
                                            <Text style={{ color: colorsNav.text, fontWeight: '700' }}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleEditCard}>
                                            <Text style={{ color: '#FFF', fontWeight: '900' }}>Guardar Cambios</Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </KeyboardAvoidingView>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <Modal visible={addModalVisible} transparent animationType="fade">
                <TouchableWithoutFeedback onPress={() => setAddModalVisible(false)}>
                    <View style={styles.overlay}>
                        <TouchableWithoutFeedback>
                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modal, { backgroundColor: colorsNav.card }]}>
                                <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nueva Tarjeta de Crédito</Text>
                                
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>NOMBRE DE LA TARJETA</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Ej: NuBank Platinum" placeholderTextColor={colorsNav.sub} value={newName} onChangeText={setNewName} />
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>LÍMITE DE CRÉDITO</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={newLimit} onChangeText={handleLimitChange} />
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 15, marginBottom: 20 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>DÍA CORTE</Text>
                                            <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="1 - 31" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={newCutDay} onChangeText={setNewCutDay} maxLength={2} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>DÍA PAGO</Text>
                                            <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="1 - 31" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={newDueDay} onChangeText={setNewDueDay} maxLength={2} />
                                        </View>
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>INTERÉS ANUAL (E.A. %)</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Ej: 28" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={newInterest} onChangeText={setNewInterest} />
                                    </View>

                                    {/* Saldo Inicial / Deuda Preexistente */}
                                    <View style={[styles.inputGroup, { backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : '#EEF2FF', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: isDark ? 'rgba(99,102,241,0.25)' : '#C7D2FE' }]}>
                                        <TouchableOpacity
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasInitialBalance ? 16 : 0 }}
                                            onPress={() => setHasInitialBalance(!hasInitialBalance)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: isDark ? '#A5B4FC' : '#4338CA', fontWeight: '900', fontSize: 13 }}>¿Ya tienes deuda en esta tarjeta?</Text>
                                                <Text style={{ color: isDark ? 'rgba(165,180,252,0.7)' : '#6366F1', fontSize: 11, marginTop: 2 }}>Registra el saldo que ya debes</Text>
                                            </View>
                                            <View style={[{ width: 44, height: 26, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 3 }, { backgroundColor: hasInitialBalance ? '#6366F1' : (isDark ? 'rgba(255,255,255,0.15)' : '#D1D5DB') }]}>
                                                <View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }, hasInitialBalance ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} />
                                            </View>
                                        </TouchableOpacity>

                                        {hasInitialBalance && (
                                            <View style={{ gap: 12 }}>
                                                <View>
                                                    <Text style={[styles.inputLabel, { color: isDark ? '#A5B4FC' : '#4338CA', marginBottom: 8 }]}>MONTO DE DEUDA ACTUAL</Text>
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: isDark ? 'rgba(99,102,241,0.4)' : '#A5B4FC' }]}
                                                        placeholder="$ 0"
                                                        placeholderTextColor={colorsNav.sub}
                                                        keyboardType="decimal-pad"
                                                        value={newInitialBalance}
                                                        onChangeText={t => setNewInitialBalance(formatInputDisplay(t, currency))}
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={[styles.inputLabel, { color: isDark ? '#A5B4FC' : '#4338CA', marginBottom: 8 }]}>FECHA DEL SALDO (AAAA-MM-DD)</Text>
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: isDark ? 'rgba(99,102,241,0.4)' : '#A5B4FC' }]}
                                                        placeholder="2025-01-15"
                                                        placeholderTextColor={colorsNav.sub}
                                                        value={newInitialDate}
                                                        onChangeText={setNewInitialDate}
                                                        maxLength={10}
                                                    />
                                                    <Text style={{ color: isDark ? 'rgba(165,180,252,0.6)' : '#6366F1', fontSize: 10, marginTop: 6, marginLeft: 4 }}>💡 Puedes poner la fecha del último corte para que el historial sea preciso</Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>MARCA Y COLOR</Text>
                                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                            {(['visa', 'mastercard', 'amex'] as const).map(b => (
                                                <TouchableOpacity 
                                                    key={b} 
                                                    style={[styles.brandBtn, { borderColor: newBrand === b ? colorsNav.accent : colorsNav.border, backgroundColor: newBrand === b ? colorsNav.accent + '10' : 'transparent' }]}
                                                    onPress={() => setNewBrand(b)}
                                                >
                                                    <Text style={{ fontSize: 10, fontWeight: '800', color: newBrand === b ? colorsNav.accent : colorsNav.sub }}>{b.toUpperCase()}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                                            {CARD_COLORS.map(c => (
                                                <TouchableOpacity key={c} onPress={() => setNewColor(c)} style={[styles.colorDot, { backgroundColor: c }, newColor === c && { borderWidth: 3, borderColor: colorsNav.text }]} />
                                            ))}
                                        </View>
                                    </View>

                                    <View style={[styles.modalFooter, { marginTop: 20 }]}>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg, borderWidth: 1, borderColor: colorsNav.border }]} onPress={() => setAddModalVisible(false)}>
                                            <Text style={{ color: colorsNav.text, fontWeight: '700' }}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleAddCard}>
                                            <Text style={{ color: '#FFF', fontWeight: '900' }}>Crear Tarjeta</Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </KeyboardAvoidingView>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <Modal visible={payModalVisible} transparent animationType="slide">
                <View style={[styles.overlay, { justifyContent: 'flex-end' }]}>
                    <View style={[styles.modal, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, width: '100%' }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Registrar Pago</Text>
                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, fontSize: 24, padding: 20 }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={payAmount} onChangeText={t => setPayAmount(formatInputDisplay(t, currency))} autoFocus />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.sub, marginVertical: 10 }}>¿DESDE QUÉ CUENTA?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                            {['Efectivo', ...customAccounts].filter(acc => !cards.some(c => c.name === acc)).map(acc => (
                                <TouchableOpacity key={acc} style={[styles.accPill, { borderColor: colorsNav.border }, selectedAccount === acc && { backgroundColor: colorsNav.accent, borderColor: colorsNav.accent }]} onPress={() => setSelectedAccount(acc)}>
                                    <Text style={{ color: selectedAccount === acc ? '#FFF' : colorsNav.sub, fontWeight: '700' }}>{acc}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => setPayModalVisible(false)}><Text style={{ color: colorsNav.text }}>Cerrar</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handlePayCard}><Text style={{ color: '#FFF', fontWeight: '800' }}>Confirmar Pago</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// Global utility for colors
function shadeColor(color: string, percent: number) {
    let R = parseInt(color.substring(1,3),16);
    let G = parseInt(color.substring(3,5),16);
    let B = parseInt(color.substring(5,7),16);
    R = parseInt(String(R * (100 + percent) / 100));
    G = parseInt(String(G * (100 + percent) / 100));
    B = parseInt(String(B * (100 + percent) / 100));
    R = (R<255)?R:255;  G = (G<255)?G:255;  B = (B<255)?B:255;
    const r = ((R.toString(16).length===1)?"0"+R.toString(16):R.toString(16));
    const g = ((G.toString(16).length===1)?"0"+G.toString(16):G.toString(16));
    const b = ((B.toString(16).length===1)?"0"+B.toString(16):B.toString(16));
    return "#"+r+g+b;
}

const groupTransactions = (txs: any[]) => {
    const groups: Record<string, any[]> = {
        'HOY': [],
        'AYER': [],
        'ESTA SEMANA': [],
        'ANTES': []
    };
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    txs.forEach(tx => {
        const txDate = new Date(tx.date);
        txDate.setHours(0,0,0,0);
        
        if (txDate.getTime() === today.getTime()) {
            groups['HOY'].push(tx);
        } else if (txDate.getTime() === yesterday.getTime()) {
            groups['AYER'].push(tx);
        } else if (txDate >= oneWeekAgo) {
            groups['ESTA SEMANA'].push(tx);
        } else {
            groups['ANTES'].push(tx);
        }
    });
    
    return groups;
};

const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('comida') || cat.includes('restaurante') || cat.includes('cafe')) return 'fast-food';
    if (cat.includes('transporte') || cat.includes('uber') || cat.includes('taxi') || cat.includes('gasolina')) return 'car';
    if (cat.includes('salud') || cat.includes('medico') || cat.includes('farmacia')) return 'medical';
    if (cat.includes('hogar') || cat.includes('casa') || cat.includes('arriendo')) return 'home';
    if (cat.includes('suscripcion') || cat.includes('netflix') || cat.includes('spotify')) return 'play-circle-outline';
    if (cat.includes('entretenimiento') || cat.includes('cine') || cat.includes('bar')) return 'game-controller';
    if (cat.includes('ropa') || cat.includes('shopping') || cat.includes('compras')) return 'shirt';
    if (cat.includes('servicio') || cat.includes('agua') || cat.includes('luz') || cat.includes('recibo')) return 'document-text';
    if (cat.includes('tarjeta') || cat.includes('pago')) return 'card';
    return 'pricetag';
};

const utilstyles = StyleSheet.create({
    label: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
    debtAmount: { color: '#FFF', fontSize: 26, fontWeight: '900' },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    smallLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700' },
    availableAmt: { color: '#FFF', fontSize: 14, fontWeight: '800' },
    chip: { backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    chipText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
});

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'android' ? 50 : 20 },
    headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
    headerSub: { fontSize: 13, marginTop: 2, fontWeight: '500' },
    backBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    addBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    
    // Carousel
    carouselContainer: { paddingHorizontal: 20, gap: 16, height: 240, alignItems: 'center' },
    cardWrapper: { width: width * 0.85, height: 210, borderRadius: 28, overflow: 'hidden' },
    activeCard: { transform: [{ scale: 1.02 }], elevation: 8, shadowColor: '#000', shadowOpacity: 0.2 },
    cardFacePremium: { flex: 1, padding: 24, justifyContent: 'space-between', borderRadius: 28 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardBankName: { color: '#FFF', fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },
    cardBrandName: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontSize: 10, marginTop: 2 },
    
    scroll: { padding: 20, gap: 20 },
    
    // Dashboard Compacto
    dashboardCard: { padding: 24, borderRadius: 28, borderWidth: 1, gap: 16 },
    dashboardRow: { flexDirection: 'row', alignItems: 'center' },
    dashboardLabel: { fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
    dashboardVal: { fontSize: 18, fontWeight: '900' },
    divider: { height: 1, opacity: 0.1, marginVertical: 4 },
 
    utilBarBG: { height: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden' },
    utilBarFill: { height: '100%', borderRadius: 4 },
 
    payBtnLarge: { flexDirection: 'row', gap: 10, padding: 18, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    payBtnTxtLarge: { color: '#FFF', fontWeight: '900', fontSize: 15 },
    
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modal: { borderRadius: 32, padding: 24, maxHeight: '90%' },
    modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 20, letterSpacing: -0.5 },
    inputGroup: { marginBottom: 18 },
    inputLabel: { fontSize: 10, fontWeight: '800', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
    input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, fontWeight: '600' },
    brandBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
    colorDot: { width: 34, height: 34, borderRadius: 17 },
    modalFooter: { flexDirection: 'row', gap: 12 },
    mBtn: { flex: 1, padding: 18, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    accPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
    empty: { padding: 80, alignItems: 'center', gap: 20 },
    emptyTxt: { fontWeight: '800', fontSize: 18, textAlign: 'center' },
    txItem: { flexDirection: 'row', padding: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center', gap: 12, marginTop: 4 },
 
    // Metrics
    metricsContainer: { flexDirection: 'row', padding: 18, borderRadius: 24, borderWidth: 1, justifyContent: 'space-between', alignItems: 'center' },
    metricItem: { flex: 1, alignItems: 'center' },
    metricVal: { fontSize: 17, fontWeight: '900' },
    metricLbl: { fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
    metricDivider: { width: 1, height: 32 },
    
    // Actions
    actionCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    actionText: { fontSize: 12, fontWeight: '700', marginTop: 8 },

    // New Styles for Redesign
    listScroll: { padding: 20 },
    cardVerticalStack: { gap: 18, paddingBottom: 40 },
    stackedCardWrapper: { width: '100%', height: 180, borderRadius: 28, overflow: 'hidden' },
    cardHolderName: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    cardNameText: { fontSize: 14, fontWeight: '700', marginTop: 1 },
    cardBrandText: { fontSize: 14, fontWeight: '900' },
    cardBalanceLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
    cardBalanceAmount: { fontSize: 24, fontWeight: '900' },
    cardNumberText: { fontSize: 15, fontWeight: '700' },
    addBtnLarge: { alignSelf: 'center' },
    
    cardWrapperDetail: { width: '100%', height: 200, borderRadius: 28, overflow: 'hidden', marginBottom: 10 },
    cardFacePremiumDetail: { flex: 1, padding: 24, justifyContent: 'space-between', borderRadius: 28 },
    smallLabelDetail: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 3 },
    payCardBtn: { flexDirection: 'row', gap: 10, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flex: 1 },
    healthAdvisorCard: { padding: 20, borderRadius: 24, borderWidth: 1, gap: 12 },
    mainCardBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },

    quickActionBtn: { alignItems: 'center', gap: 8, padding: 12, borderRadius: 20, borderWidth: 1, flex: 1 },
    quickActionIcon: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginBottom: 4 },
    quickActionText: { fontSize: 11, fontWeight: '700' },
    walletCard: { padding: 24, borderRadius: 28, borderWidth: 1, gap: 4 },
    walletSubCard: { padding: 16, borderRadius: 20, borderWidth: 1, flex: 1 },
    floatingNav: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', padding: 8, borderRadius: 40, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, gap: 8 },
    floatingNavItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 30, gap: 8 },
    floatingNavItemActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
    floatingNavText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});
