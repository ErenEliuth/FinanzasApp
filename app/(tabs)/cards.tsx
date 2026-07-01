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

                    const renderHomeTab = () => (
                        <View style={{ flex: 1 }}>
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
                            </View>

                            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                                {(() => {
                                    const advice = getShoppingAdvice(currentCard);
                                    return (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: advice.color, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: advice.borderColor, marginBottom: 10 }}>
                                            <Text style={{ fontSize: 20, marginRight: 10 }}>{advice.title.split(' ')[0]}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: advice.textColor, fontWeight: '900', fontSize: 13 }}>{advice.title.replace(/[^A-Za-z0-9 ]/g, '').trim()}</Text>
                                                <Text style={{ color: advice.textColor, opacity: 0.8, fontSize: 11, marginTop: 2 }}>{advice.msg}</Text>
                                            </View>
                                        </View>
                                    );
                                })()}
                                <TouchableOpacity activeOpacity={0.9} onPress={handleFlip} style={[styles.cardWrapperDetail, { shadowColor: '#000', shadowOpacity: isDark ? 0.5 : 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 6 } }]}>
                                    <Animated.View style={[styles.cardFacePremiumDetail, { backgroundColor: currentCard.color }, frontStyle]}>
                                        <View style={styles.cardTop}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <MaterialIcons name="contactless" size={28} color={textColor} style={{ opacity: 0.8 }} />
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Text style={[styles.cardBrandText, { color: textColor, fontSize: 18, fontWeight: '900', fontStyle: 'italic' }]}>
                                                    {currentCard.brand.toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ marginVertical: 14 }}>
                                            <Text style={[styles.cardBalanceLabel, { color: subTextColor, fontSize: 10, letterSpacing: 1.5 }]}>Limit Card</Text>
                                            <Text style={[styles.cardBalanceAmount, { color: textColor, fontSize: 30, fontWeight: '900' }]}>{fmt(currentCard.limit)}</Text>
                                        </View>
                                        <View style={styles.footer}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                <Text style={[styles.cardNumberText, { color: subTextColor, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1 }]}>
                                                    •••• {currentCard.id.slice(-4)}
                                                </Text>
                                                <View style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                                                    <Text style={{ color: textColor, fontSize: 10, fontWeight: '700' }}>{utilization.toFixed(0)}% Used</Text>
                                                </View>
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

                                {/* Quick Actions */}
                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10, marginBottom: 20 }}>
                                    <TouchableOpacity style={{ alignItems: 'center', gap: 8 }} onPress={() => { setSelectedCard(currentCard); setPayModalVisible(true); }}>
                                        <View style={[styles.quickActionIcon, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                                            <MaterialIcons name="payment" size={24} color={colorsNav.text} />
                                        </View>
                                        <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '700' }}>Pagar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={{ alignItems: 'center', gap: 8 }} onPress={() => { setSelectedCard(currentCard); setSimModalVisible(true); }}>
                                        <View style={[styles.quickActionIcon, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                                            <MaterialIcons name="calculate" size={24} color={colorsNav.text} />
                                        </View>
                                        <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '700' }}>Simular</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={{ alignItems: 'center', gap: 8 }} onPress={() => openEditCard(currentCard)}>
                                        <View style={[styles.quickActionIcon, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                                            <MaterialIcons name="edit" size={24} color={colorsNav.text} />
                                        </View>
                                        <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '700' }}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={{ alignItems: 'center', gap: 8 }} onPress={() => handleDeleteCard(currentCard)}>
                                        <View style={[styles.quickActionIcon, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2', borderColor: '#EF444430' }]}>
                                            <MaterialIcons name="delete-outline" size={24} color="#EF4444" />
                                        </View>
                                        <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Countdown Chips */}
                                {(() => {
                                    const daysUntilCut = getDaysUntil(currentCard.cutDay);
                                    const daysUntilDue = getDaysUntil(currentCard.dueDay);
                                    const cutColor = daysUntilCut <= 3 ? '#EF4444' : daysUntilCut <= 7 ? '#F59E0B' : '#22C55E';
                                    const dueColor = daysUntilDue <= 3 ? '#EF4444' : daysUntilDue <= 7 ? '#F59E0B' : '#3B82F6';
                                    return (
                                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                            <View style={{ flex: 1, backgroundColor: isDark ? `${cutColor}18` : `${cutColor}15`, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${cutColor}40`, alignItems: 'center' }}>
                                                <MaterialIcons name="content-cut" size={18} color={cutColor} />
                                                <Text style={{ color: cutColor, fontWeight: '900', fontSize: 22, marginTop: 4 }}>{daysUntilCut}</Text>
                                                <Text style={{ color: cutColor, fontSize: 10, fontWeight: '700', opacity: 0.8 }}>días al corte</Text>
                                                <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 2 }}>Día {currentCard.cutDay}</Text>
                                            </View>
                                            <View style={{ flex: 1, backgroundColor: isDark ? `${dueColor}18` : `${dueColor}15`, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: `${dueColor}40`, alignItems: 'center' }}>
                                                <MaterialIcons name="credit-card" size={18} color={dueColor} />
                                                <Text style={{ color: dueColor, fontWeight: '900', fontSize: 22, marginTop: 4 }}>{daysUntilDue}</Text>
                                                <Text style={{ color: dueColor, fontSize: 10, fontWeight: '700', opacity: 0.8 }}>días al pago</Text>
                                                <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 2 }}>Día {currentCard.dueDay}</Text>
                                            </View>
                                        </View>
                                    );
                                })()}

                                {/* Cuotas Activas */}
                                {(() => {
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
                                    if (activeInstallments.length === 0) return null;
                                    return (
                                        <View style={{ marginBottom: 20 }}>
                                            <Text style={{ fontSize: 18, fontWeight: '900', color: colorsNav.text, marginBottom: 12 }}>Cuotas Activas</Text>
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
                                                const paidCount = Math.max(0, Math.min(total, (now.getFullYear() - sy) * 12 + (now.getMonth() - sm) + 1));
                                                const remaining = total - paidCount;
                                                const progress = paidCount / total;
                                                const cleanDesc = getCleanDescription(tx.description);
                                                const isLast = remaining === 1;
                                                return (
                                                    <View key={tx.id} style={{ backgroundColor: colorsNav.card, borderRadius: 20, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: isLast ? '#F59E0B40' : colorsNav.border }}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                                            <View style={{ flex: 1, marginRight: 10 }}>
                                                                <Text style={{ color: colorsNav.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{cleanDesc}</Text>
                                                                <Text style={{ color: colorsNav.sub, fontSize: 11, marginTop: 2 }}>
                                                                    {new Date(tx.date).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })} • {fmt(monthlyAmt)}/mes
                                                                </Text>
                                                            </View>
                                                            {isLast
                                                                ? <View style={{ backgroundColor: '#F59E0B20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B50' }}><Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '900' }}>✅ ÚLTIMO</Text></View>
                                                                : <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 14 }}>{paidCount}/{total}</Text>
                                                            }
                                                        </View>
                                                        <View style={{ height: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                                            <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: isLast ? '#F59E0B' : colorsNav.accent, borderRadius: 3 }} />
                                                        </View>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                                                            <Text style={{ color: colorsNav.sub, fontSize: 10 }}>{paidCount} pagadas</Text>
                                                            <Text style={{ color: colorsNav.sub, fontSize: 10 }}>{remaining} restantes • {fmt(monthlyAmt * remaining)} total</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })()}

                                {/* Payment Next */}
                                <Text style={{ fontSize: 18, fontWeight: '900', color: colorsNav.text, marginBottom: 15 }}>Próximos Pagos</Text>
                                {activeTxs.slice(0, 5).map(tx => {
                                    const cleanDesc = getCleanDescription(tx.description);
                                    let displayAmt = tx.amount;
                                    let subtitle = 'Vence día ' + currentCard.dueDay;
                                    const hasInstallments = tx.description?.includes('[CUOTAS:');
                                    if (hasInstallments) {
                                        const totalMatch = tx.description?.match(/\[CUOTAS:(\d+)/);
                                        const total = totalMatch ? parseInt(totalMatch[1], 10) : 1;
                                        const currentIdx = getCurrentInstallmentNumber(tx, currentCard, now.getMonth() + 1, now.getFullYear());
                                        displayAmt = tx.amount / total;
                                        subtitle = `Cuota ${currentIdx} de ${total}`;
                                    }
                                    return (
                                        <View key={tx.id} style={[styles.txItem, { backgroundColor: colorsNav.card, borderColor: colorsNav.border, marginBottom: 8 }]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: colorsNav.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{cleanDesc}</Text>
                                                <Text style={{ color: colorsNav.sub, fontSize: 11, marginTop: 4 }}>{subtitle}</Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 14 }}>{fmt(displayAmt)}</Text>
                                                <TouchableOpacity onPress={() => { setSelectedCard(currentCard); setPayAmount(displayAmt.toString()); setPayModalVisible(true); }}>
                                                    <Text style={{ color: '#3B82F6', fontWeight: '800', fontSize: 12, marginTop: 4 }}>Pagar ahora</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    );

                    const renderWalletTab = () => (
                        <View style={{ flex: 1 }}>
                            <View style={styles.header}>
                                <TouchableOpacity 
                                    style={[styles.backBtn, { backgroundColor: isDark ? colorsNav.card : '#F8F5F0', borderColor: colorsNav.border }]} 
                                    onPress={() => setSelectedCardId(null)}
                                >
                                    <Ionicons name="chevron-back" size={24} color={colorsNav.text} />
                                </TouchableOpacity>
                                <View style={{ flex: 1, marginLeft: 15 }}>
                                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>{currentCard.name}</Text>
                                    <Text style={[styles.headerSub, { color: colorsNav.sub }]}>Billetera y Límites</Text>
                                </View>
                            </View>

                            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                                {/* Debt breakdown */}
                                {(() => {
                                    const installmentTxs = activeTxs.filter(tx => tx.type === 'expense' && tx.description?.includes('[CUOTAS:'));
                                    let cuotaDebt = 0;
                                    installmentTxs.forEach(tx => {
                                        const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
                                        const total = match ? parseInt(match[1], 10) : 1;
                                        const ea = match ? (parseFloat(match[2] || '0') / 100) : 0;
                                        const mv = ea > 0 ? Math.pow(1 + ea, 1/12) - 1 : 0;
                                        const monthlyAmt = mv > 0 ? (tx.amount * mv) / (1 - Math.pow(1 + mv, -total)) : tx.amount / total;
                                        const txDate = new Date(tx.date);
                                        const { month: sm, year: sy } = calculateFirstPaymentMonth(txDate, currentCard.cutDay, currentCard.dueDay);
                                        const paidCount = Math.max(0, Math.min(total, (now.getFullYear() - sy) * 12 + (now.getMonth() - sm) + 1));
                                        const remaining = total - paidCount;
                                        cuotaDebt += monthlyAmt * remaining;
                                    });
                                    const freeDebt = Math.max(0, debt - cuotaDebt);
                                    return (
                                        <View style={[styles.walletCard, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                                            <Text style={{ color: colorsNav.sub, fontSize: 13, fontWeight: '700' }}>Saldo Total</Text>
                                            <Text style={{ color: colorsNav.text, fontSize: 32, fontWeight: '900', marginVertical: 8 }}>{fmt(debt)}</Text>
                                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : '#EEF2FF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#6366F130' }}>
                                                    <MaterialIcons name="repeat" size={16} color="#6366F1" />
                                                    <Text style={{ color: '#6366F1', fontWeight: '900', fontSize: 16, marginTop: 6 }}>{fmt(cuotaDebt)}</Text>
                                                    <Text style={{ color: '#6366F1', fontSize: 10, fontWeight: '700', opacity: 0.8, marginTop: 2 }}>En cuotas</Text>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 1 }}>Comprometido</Text>
                                                </View>
                                                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F59E0B30' }}>
                                                    <MaterialIcons name="shopping-bag" size={16} color="#F59E0B" />
                                                    <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 16, marginTop: 6 }}>{fmt(freeDebt)}</Text>
                                                    <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '700', opacity: 0.8, marginTop: 2 }}>Corriente</Text>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 1 }}>Este ciclo</Text>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                                                <View style={[styles.walletSubCard, { borderColor: colorsNav.border, flex: 1, backgroundColor: isDark ? 'rgba(59,130,246,0.1)' : '#EFF6FF' }]}>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600' }}>Pago Mínimo</Text>
                                                    <Text style={{ color: colorsNav.text, fontSize: 16, fontWeight: '800', marginTop: 4 }}>{fmt(nextPaymentAmt)}</Text>
                                                </View>
                                                <View style={[styles.walletSubCard, { borderColor: colorsNav.border, flex: 1 }]}>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600' }}>Pago Total</Text>
                                                    <Text style={{ color: colorsNav.text, fontSize: 16, fontWeight: '800', marginTop: 4 }}>{fmt(debt)}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })()}

                                <View style={[styles.walletCard, { backgroundColor: colorsNav.card, borderColor: colorsNav.border, marginTop: 15 }]}>
                                    <Text style={{ color: colorsNav.text, fontSize: 16, fontWeight: '900', marginBottom: 15 }}>Límite de Tarjeta</Text>
                                    
                                    <View style={[styles.utilBarBG, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', height: 12, borderRadius: 6 }]}>
                                        <View style={[styles.utilBarFill, { width: `${Math.min(utilization, 100)}%`, backgroundColor: '#3B82F6', borderRadius: 6 }]} />
                                    </View>
                                    
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                                        <Text style={{ color: colorsNav.sub, fontSize: 12, fontWeight: '600' }}>Uso actual</Text>
                                        <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '800' }}>{fmt(debt)} / {fmt(currentCard.limit)}</Text>
                                    </View>
                                </View>

                                <Text style={{ fontSize: 18, fontWeight: '900', color: colorsNav.text, marginTop: 25, marginBottom: 10 }}>Movimientos</Text>
                                {(() => {
                                    const subKeywords = ['netflix', 'spotify', 'amazon', 'hbo', 'disney', 'gym', 'apple', 'google', 'youtube'];
                                    const subs = filteredTxs.filter(tx => subKeywords.some(k => tx.description.toLowerCase().includes(k)) && tx.type === 'expense');
                                    // Remove duplicates by description
                                    const uniqueSubs = Array.from(new Map(subs.map(item => [getCleanDescription(item.description).toLowerCase(), item])).values());
                                    if (uniqueSubs.length === 0) return null;
                                    return (
                                        <View style={{ marginBottom: 20 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '800', color: colorsNav.sub, marginBottom: 10 }}>Suscripciones Detectadas</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                                                {uniqueSubs.map(sub => (
                                                    <View key={sub.id} style={{ backgroundColor: colorsNav.card, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colorsNav.border, width: 140 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                                                            <MaterialIcons name="autorenew" size={16} color={colorsNav.sub} />
                                                            <Text style={{ color: colorsNav.text, fontWeight: '800', fontSize: 12, flex: 1 }} numberOfLines={1}>{getCleanDescription(sub.description)}</Text>
                                                        </View>
                                                        <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 16 }}>{fmt(sub.amount)}</Text>
                                                    </View>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    );
                                })()}
                                
                                {hasTransactions ? (
                                    Object.entries(groupedTxs).map(([groupName, txsGroup]) => {
                                        if (txsGroup.length === 0) return null;
                                        return (
                                            <View key={groupName} style={{ gap: 8, marginTop: 4 }}>
                                                <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.sub, marginLeft: 6, marginBottom: 4 }}>{groupName}</Text>
                                                {txsGroup.map(tx => {
                                                    const cleanDesc = getCleanDescription(tx.description);
                                                    const catIcon = getCategoryIcon(tx.category);
                                                    const hasInst = tx.description?.includes('[CUOTAS:');
                                                    let instProgress = null;
                                                    if (hasInst) {
                                                        const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
                                                        const total = match ? parseInt(match[1], 10) : 1;
                                                        const ea = match ? (parseFloat(match[2] || '0') / 100) : 0;
                                                        const mv = ea > 0 ? Math.pow(1 + ea, 1/12) - 1 : 0;
                                                        const monthly = mv > 0 ? (tx.amount * mv) / (1 - Math.pow(1 + mv, -total)) : tx.amount / total;
                                                        const txDate = new Date(tx.date);
                                                        const { month: sm, year: sy } = calculateFirstPaymentMonth(txDate, currentCard.cutDay, currentCard.dueDay);
                                                        const paid = Math.max(0, Math.min(total, (now.getFullYear() - sy) * 12 + (now.getMonth() - sm) + 1));
                                                        instProgress = { total, paid, monthly };
                                                    }
                                                    return (
                                                        <View key={tx.id} style={[styles.txItem, { backgroundColor: colorsNav.card, borderColor: colorsNav.border, borderWidth: 0, paddingVertical: 12, flexDirection: 'column', alignItems: 'flex-start' }]}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                                                                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                                                                    <Ionicons name={catIcon as any} size={20} color={colorsNav.text} />
                                                                </View>
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ color: colorsNav.text, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>{cleanDesc}</Text>
                                                                    <Text style={{ color: colorsNav.sub, fontSize: 11, marginTop: 2 }}>
                                                                        {new Date(tx.date).toLocaleDateString('es-CO')}
                                                                        {instProgress ? ` • Cuota ${instProgress.paid}/${instProgress.total} • ${fmt(instProgress.monthly)}/mes` : ''}
                                                                    </Text>
                                                                </View>
                                                                <Text style={{ color: tx.type === 'income' ? colorsNav.accent : colorsNav.text, fontWeight: '900', fontSize: 14 }}>
                                                                    {tx.type === 'income' ? '-' : '+'}{fmt(tx.amount)}
                                                                </Text>
                                                            </View>
                                                            {instProgress && (
                                                                <View style={{ width: '100%', marginTop: 8, paddingLeft: 56 }}>
                                                                    <View style={{ height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                                                        <View style={{ height: '100%', width: `${(instProgress.paid / instProgress.total) * 100}%`, backgroundColor: colorsNav.accent, borderRadius: 2 }} />
                                                                    </View>
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={{ color: colorsNav.sub }}>Sin movimientos registrados.</Text>
                                )}
                            </ScrollView>
                        </View>
                    );

                    const renderAnalyticsTab = () => {
                        return (
                            <View style={{ flex: 1 }}>
                                <View style={styles.header}>
                                    <TouchableOpacity 
                                        style={[styles.backBtn, { backgroundColor: isDark ? colorsNav.card : '#F8F5F0', borderColor: colorsNav.border }]} 
                                        onPress={() => setSelectedCardId(null)}
                                    >
                                        <Ionicons name="chevron-back" size={24} color={colorsNav.text} />
                                    </TouchableOpacity>
                                    <View style={{ flex: 1, marginLeft: 15 }}>
                                        <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Analíticas</Text>
                                    </View>
                                    <TouchableOpacity style={[styles.addBtn, { backgroundColor: colorsNav.card, borderWidth: 1, borderColor: colorsNav.border }]}>
                                        <MaterialIcons name="more-horiz" size={24} color={colorsNav.text} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
                                    <Text style={{ color: colorsNav.sub, fontSize: 13, fontWeight: '600' }}>Gasto Total</Text>
                                    <Text style={{ color: colorsNav.text, fontSize: 32, fontWeight: '900', marginBottom: 20 }}>{fmt(debt)}</Text>
                                    
                                {(() => {
                                    // Monthly interest cost
                                    const ea = currentCard.interestRate / 100;
                                    const mv = ea > 0 ? Math.pow(1 + ea, 1/12) - 1 : 0;
                                    const monthlyInterest = debt * mv;
                                    // Free date projection
                                    const pmt = nextPaymentAmt > 0 ? nextPaymentAmt : (debt > 0 ? debt / 6 : 0);
                                    let monthsFree = 0;
                                    let remaining = debt;
                                    while (remaining > 0 && monthsFree < 120) { remaining -= pmt; monthsFree++; }
                                    const freeDate = new Date(now.getFullYear(), now.getMonth() + monthsFree, 1);
                                    const freeDateStr = debt <= 0 ? '¡Ya está libre!' : freeDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
                                    // Chart data
                                    const months = ['Hoy', 'Mes 2', 'Mes 3', 'Mes 4', 'Mes 5', 'Mes 6'];
                                    let current = debt;
                                    const proj = [];
                                    for (let i = 0; i < 6; i++) { proj.push(Math.max(0, current)); current = Math.max(0, current - pmt); }
                                    if (proj.every(v => v === 0)) proj[0] = 1;
                                    return (
                                        <View>
                                            {/* Monthly interest card */}
                                            {monthlyInterest > 0 && (
                                                <View style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#EF444430', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                                                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#EF444420', justifyContent: 'center', alignItems: 'center' }}>
                                                        <MaterialIcons name="trending-up" size={22} color="#EF4444" />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13 }}>Intereses este mes</Text>
                                                        <Text style={{ color: isDark ? '#FCA5A5' : '#B91C1C', fontSize: 22, fontWeight: '900', marginTop: 2 }}>{fmt(monthlyInterest)}</Text>
                                                        <Text style={{ color: isDark ? 'rgba(252,165,165,0.7)' : '#EF4444', fontSize: 11, marginTop: 2 }}>Tasa {currentCard.interestRate}% E.A. sobre {fmt(debt)} de deuda</Text>
                                                    </View>
                                                </View>
                                            )}
                                            {/* Free date projection */}
                                            <View style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : '#F0FDF4', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#22C55E30', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                                                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#22C55E20', justifyContent: 'center', alignItems: 'center' }}>
                                                    <MaterialIcons name="event-available" size={22} color="#22C55E" />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: '#22C55E', fontWeight: '900', fontSize: 13 }}>Tarjeta libre en</Text>
                                                    <Text style={{ color: isDark ? '#86EFAC' : '#15803D', fontSize: 18, fontWeight: '900', marginTop: 2 }}>{freeDateStr}</Text>
                                                    <Text style={{ color: isDark ? 'rgba(134,239,172,0.7)' : '#22C55E', fontSize: 11, marginTop: 2 }}>Pagando {fmt(pmt)}/mes sin nuevas compras</Text>
                                                </View>
                                            </View>
                                            {/* Projection chart */}
                                            <View style={{ alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', padding: 16, borderRadius: 24, borderWidth: 1, borderColor: colorsNav.border }}>
                                                <Text style={{ alignSelf: 'flex-start', color: colorsNav.sub, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>Proyección de Deuda (6 meses)</Text>
                                                <LineChart
                                                    data={{ labels: months, datasets: [{ data: proj }] }}
                                                    width={width - 72}
                                                    height={200}
                                                    chartConfig={{
                                                        backgroundColor: 'transparent',
                                                        backgroundGradientFromOpacity: 0,
                                                        backgroundGradientToOpacity: 0,
                                                        decimalPlaces: 0,
                                                        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                                                        labelColor: () => colorsNav.sub,
                                                        style: { borderRadius: 16 },
                                                        propsForDots: { r: '4', strokeWidth: '2', stroke: '#3B82F6' }
                                                    }}
                                                    bezier
                                                    style={{ marginVertical: 8, borderRadius: 16 }}
                                                />
                                            </View>
                                        </View>
                                    );
                                })()}
                                    
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 20 }}>
                                        <View style={{ flex: 1, alignItems: 'center' }}>
                                            <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600' }}>En Curso</Text>
                                            <Text style={{ color: colorsNav.text, fontSize: 14, fontWeight: '800', marginTop: 4 }}>{fmt(debt * 0.7)}</Text>
                                        </View>
                                        <View style={{ flex: 1, alignItems: 'center' }}>
                                            <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600' }}>Vencido</Text>
                                            <Text style={{ color: colorsNav.text, fontSize: 14, fontWeight: '800', marginTop: 4 }}>{fmt(0)}</Text>
                                        </View>
                                        <View style={{ flex: 1, alignItems: 'center' }}>
                                            <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600' }}>Total</Text>
                                            <Text style={{ color: colorsNav.text, fontSize: 14, fontWeight: '800', marginTop: 4 }}>{fmt(debt)}</Text>
                                        </View>
                                    </View>
                                </ScrollView>
                            </View>
                        );
                    };

                    return (
                        <View style={{ flex: 1 }}>
                            {detailTab === 'home' && renderHomeTab()}
                            {detailTab === 'wallet' && renderWalletTab()}
                            {detailTab === 'progress' && renderAnalyticsTab()}

                            {/* Floating Bottom Nav */}
                            <View style={[styles.floatingNav, { backgroundColor: isDark ? '#1C1C1E' : '#18181B' }]}>
                                <TouchableOpacity style={[styles.floatingNavItem, detailTab === 'home' && styles.floatingNavItemActive]} onPress={() => setDetailTab('home')}>
                                    <MaterialIcons name="credit-card" size={20} color={detailTab === 'home' ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                                    {detailTab === 'home' && <Text style={styles.floatingNavText}>Inicio</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.floatingNavItem, detailTab === 'wallet' && styles.floatingNavItemActive]} onPress={() => setDetailTab('wallet')}>
                                    <MaterialIcons name="account-balance-wallet" size={20} color={detailTab === 'wallet' ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                                    {detailTab === 'wallet' && <Text style={styles.floatingNavText}>Billetera</Text>}
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.floatingNavItem, detailTab === 'progress' && styles.floatingNavItemActive]} onPress={() => setDetailTab('progress')}>
                                    <MaterialIcons name="bar-chart" size={20} color={detailTab === 'progress' ? '#FFF' : 'rgba(255,255,255,0.4)'} />
                                    {detailTab === 'progress' && <Text style={styles.floatingNavText}>Progreso</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                })() : null
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
            <Modal visible={simModalVisible} transparent animationType="slide">
                <View style={[styles.overlay, { justifyContent: 'flex-end' }]}>
                    <View style={[styles.modal, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, width: '100%' }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Simulador de Cuotas</Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.sub, marginBottom: 10 }}>MONTO A SIMULAR</Text>
                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, fontSize: 24, padding: 20, marginBottom: 20 }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="decimal-pad" value={simAmount} onChangeText={t => setSimAmount(formatInputDisplay(t, currency))} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.sub, marginBottom: 10 }}>NÚMERO DE CUOTAS</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                            {['1', '6', '12', '24'].map(cuotas => (
                                <TouchableOpacity key={cuotas} style={[styles.accPill, { flex: 1, borderColor: colorsNav.border, alignItems: 'center' }, simInstallments === cuotas && { backgroundColor: colorsNav.accent, borderColor: colorsNav.accent }]} onPress={() => setSimInstallments(cuotas)}>
                                    <Text style={{ color: simInstallments === cuotas ? '#FFF' : colorsNav.sub, fontWeight: '700' }}>{cuotas}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {(() => {
                            const amt = convertToBase(parseInputToNumber(simAmount, currency), currency, rates);
                            const n = parseInt(simInstallments, 10) || 1;
                            const rateEA = selectedCard?.interestRate || 0;
                            const rateEM = Math.pow(1 + (rateEA / 100), 1 / 12) - 1; // Effective Monthly
                            let monthlyPay = 0;
                            let totalPay = 0;
                            if (amt > 0 && n > 0) {
                                if (n === 1 || rateEM === 0) {
                                    monthlyPay = amt / n;
                                    totalPay = amt;
                                } else {
                                    monthlyPay = amt * (rateEM * Math.pow(1 + rateEM, n)) / (Math.pow(1 + rateEM, n) - 1);
                                    totalPay = monthlyPay * n;
                                }
                            }
                            return (
                                <View style={{ backgroundColor: colorsNav.bg, padding: 20, borderRadius: 20, marginBottom: 20 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: colorsNav.sub, fontWeight: '700' }}>Cuota Mensual:</Text>
                                        <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 16 }}>{fmt(monthlyPay)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ color: colorsNav.sub, fontWeight: '700' }}>Total Intereses:</Text>
                                        <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 16 }}>{fmt(totalPay - amt)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: colorsNav.sub, fontWeight: '700' }}>Pago Total:</Text>
                                        <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 16 }}>{fmt(totalPay)}</Text>
                                    </View>
                                </View>
                            );
                        })()}
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent, width: '100%' }]} onPress={() => setSimModalVisible(false)}><Text style={{ color: '#FFF', fontWeight: '800' }}>Cerrar Simulador</Text></TouchableOpacity>
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
