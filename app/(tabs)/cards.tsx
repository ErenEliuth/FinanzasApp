import { useAuth } from '@/utils/auth';
import { syncUp } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ThemeName } from '@/constants/Themes';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, getCurrencyInfo, convertCurrency, convertToBase, CURRENCIES } from '@/utils/currency';
import {
    Alert,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

type CreditCard = {
    id: string;
    name: string;
    brand: 'visa' | 'mastercard' | 'amex' | 'other';
    limit: number;
    cutDay: number;
    dueDay: number;
    color: string;
    minPaymentPct: number;
    manualMinPayment?: number; // Valor manual ingresado por el usuario
};

const CARD_COLORS = ['#2D5A3D', '#4A7C59', '#1E293B', '#8B5CF6', '#F59E0B', '#EF4444'];



export default function CardsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, currency, rates, isHidden } = useAuth();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [cards, setCards] = useState<CreditCard[]>([]);
    const [cardBalances, setCardBalances] = useState<Record<string, number>>({});
    
    // Modal state for adding a card
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLimit, setNewLimit] = useState('');
    const [newCutDay, setNewCutDay] = useState('');
    const [newDueDay, setNewDueDay] = useState('');
    const [newBrand, setNewBrand] = useState<'visa' | 'mastercard' | 'amex' | 'other'>('visa');
    const [newColor, setNewColor] = useState(CARD_COLORS[0]);
    const [newMinPct, setNewMinPct] = useState('10'); // Default 10%

    // Payment modal state
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [accounts, setAccounts] = useState<string[]>(['Efectivo']);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    // Manual min payment modal
    const [minModalVisible, setMinModalVisible] = useState(false);
    const [selectedCardForMin, setSelectedCardForMin] = useState<CreditCard | null>(null);
    const [manualMinAmount, setManualMinAmount] = useState('');

    const formatInput = (text: string) => {
        const clean = text.replace(/\D/g, '');
        if (!clean) return '';
        const info = getCurrencyInfo(currency);
        return new Intl.NumberFormat(info.locale).format(parseInt(clean, 10));
    };

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    const loadData = async () => {
        try {
            const storedCards = await AsyncStorage.getItem(`@cards_${user?.id}`);
            const parsedCards: CreditCard[] = storedCards ? JSON.parse(storedCards) : [];
            setCards(parsedCards);

            const storedAccounts = await AsyncStorage.getItem('@custom_accounts');
            const extra = storedAccounts ? JSON.parse(storedAccounts) : [];
            const nonCardAccounts = ['Efectivo', ...extra].filter(
                acc => !parsedCards.some((c: CreditCard) => c.name === acc)
            );
            setAccounts(nonCardAccounts);

            if (parsedCards.length > 0) {
                const { data: txs, error } = await supabase
                    .from('transactions')
                    .select('amount, type, account')
                    .eq('user_id', user?.id)
                    .in('account', parsedCards.map((c: CreditCard) => c.name));

                if (error) throw error;

                const balances: Record<string, number> = {};
                parsedCards.forEach(c => balances[c.name] = 0);

                txs?.forEach(tx => {
                    const amt = Number(tx.amount || 0);
                    if (tx.type === 'expense') {
                        balances[tx.account] += amt;
                    } else if (tx.type === 'income' || tx.type === 'transfer') {
                        balances[tx.account] -= amt;
                    }
                });

                Object.keys(balances).forEach(k => {
                    if (balances[k] < 0) balances[k] = 0;
                });

                setCardBalances(balances);
            }
        } catch (e) {
            console.error('Error loading cards:', e);
        }
    };

    useEffect(() => {
        if (isFocused) loadData();
    }, [isFocused]);


    const handleLimitChange = (text: string) => {
        if (!text) { setNewLimit(''); return; }
        if (currency === 'COP') {
            const clean = text.replace(/\D/g, '');
            if (!clean) { setNewLimit(''); return; }
            setNewLimit(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
        } else {
            let raw = text.replace(/,/g, '');
            let clean = raw.replace(/[^0-9.]/g, '');
            const parts = clean.split('.');
            if (parts.length > 2) return;
            const integerPart = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : (clean.startsWith('.') ? '0' : '');
            if (parts.length === 2) setNewLimit(`${integerPart}.${parts[1].slice(0, 2)}`);
            else if (clean.endsWith('.')) setNewLimit(`${integerPart}.`);
            else setNewLimit(integerPart);
        }
    };

    const handlePayAmountChange = (text: string) => {
        if (!text) { setPayAmount(''); return; }
        if (currency === 'COP') {
            const clean = text.replace(/\D/g, '');
            if (!clean) { setPayAmount(''); return; }
            setPayAmount(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
        } else {
            let raw = text.replace(/,/g, '');
            let clean = raw.replace(/[^0-9.]/g, '');
            const parts = clean.split('.');
            if (parts.length > 2) return;
            const integerPart = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : (clean.startsWith('.') ? '0' : '');
            if (parts.length === 2) setPayAmount(`${integerPart}.${parts[1].slice(0, 2)}`);
            else if (clean.endsWith('.')) setPayAmount(`${integerPart}.`);
            else setPayAmount(integerPart);
        }
    };

    const handleManualMinChange = (text: string) => {
        if (!text) { setManualMinAmount(''); return; }
        if (currency === 'COP') {
            const clean = text.replace(/\D/g, '');
            if (!clean) { setManualMinAmount(''); return; }
            setManualMinAmount(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
        } else {
            let raw = text.replace(/,/g, '');
            let clean = raw.replace(/[^0-9.]/g, '');
            const parts = clean.split('.');
            if (parts.length > 2) return;
            const integerPart = parts[0] ? new Intl.NumberFormat('en-US').format(parseInt(parts[0], 10)) : (clean.startsWith('.') ? '0' : '');
            if (parts.length === 2) setManualMinAmount(`${integerPart}.${parts[1].slice(0, 2)}`);
            else if (clean.endsWith('.')) setManualMinAmount(`${integerPart}.`);
            else setManualMinAmount(integerPart);
        }
    };
    const handleAddCard = async () => {
        Keyboard.dismiss();
        let cleanLim = newLimit;
        if (currency === 'COP') {
            cleanLim = newLimit.replace(/\./g, '').replace(',', '.');
        } else {
            cleanLim = newLimit.replace(/,/g, '');
        }
        const limit = convertToBase(parseFloat(cleanLim), currency, rates);
        const cut = parseInt(newCutDay, 10);
        const due = parseInt(newDueDay, 10);
        const minPct = parseFloat(newMinPct) || 10;

        if (!newName.trim() || isNaN(limit) || limit <= 0 || isNaN(cut) || isNaN(due)) {
            if (Platform.OS === 'web') {
                window.alert('Por favor llena todos los campos correctamente.');
            } else {
                Alert.alert('Error', 'Por favor llena todos los campos correctamente.');
            }
            return;
        }

        const newCard: CreditCard = {
            id: Date.now().toString(),
            name: newName.trim(),
            brand: newBrand,
            limit,
            cutDay: cut,
            dueDay: due,
            color: newColor,
            minPaymentPct: minPct,
        };

        const updatedCards = [...cards, newCard];
        setCards(updatedCards);
        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updatedCards));
        if (user?.id) syncUp(user.id);

        try {
            const storedParams = await AsyncStorage.getItem('@custom_accounts');
            const customAccounts = storedParams ? JSON.parse(storedParams) : [];
            if (!customAccounts.includes(newCard.name)) {
                await AsyncStorage.setItem('@custom_accounts', JSON.stringify([...customAccounts, newCard.name]));
                if (user?.id) syncUp(user.id);
            }
        } catch (e) { }

        setAddModalVisible(false);
        setNewName(''); setNewLimit(''); setNewCutDay(''); setNewDueDay(''); setNewBrand('visa'); setNewMinPct('10');
        loadData();
    };

    const handleDeleteCard = async (card: CreditCard) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Estás seguro de eliminar la tarjeta ${card.name}? No podrás recuperarla, pero tus transacciones se mantendrán.`)) {
                const updated = cards.filter(c => c.id !== card.id);
                setCards(updated);
                await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
                if (user?.id) syncUp(user.id);
                loadData();
            }
            return;
        }
        Alert.alert(
            'Eliminar Tarjeta',
            `¿Estás seguro de eliminar la tarjeta ${card.name}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        const updated = cards.filter(c => c.id !== card.id);
                        setCards(updated);
                        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
                        if (user?.id) syncUp(user.id);
                        loadData();
                    }
                }
            ]
        );
    };

    const handlePayCard = async () => {
        if (!selectedCard) return;
        let cleanPay = payAmount;
        if (currency === 'COP') {
            cleanPay = payAmount.replace(/\./g, '').replace(',', '.');
        } else {
            cleanPay = payAmount.replace(/,/g, '');
        }
        const pay = convertToBase(parseFloat(cleanPay), currency, rates);
        if (isNaN(pay) || pay <= 0) return;

        const debt = cardBalances[selectedCard.name] || 0;
        const actualPay = Math.min(pay, debt);

        try {
            await supabase.from('transactions').insert([{
                user_id: user?.id,
                amount: actualPay,
                type: 'expense',
                category: 'Pago de Tarjeta',
                description: `Pago a ${selectedCard.name}`,
                account: selectedAccount,
                date: new Date().toISOString()
            }]);

            await supabase.from('transactions').insert([{
                user_id: user?.id,
                amount: actualPay,
                type: 'income',
                category: 'Pago Recibido',
                description: `Abono desde ${selectedAccount}`,
                account: selectedCard.name,
                date: new Date().toISOString()
            }]);

            setPayAmount('');
            setPayModalVisible(false);
            setSelectedCard(null);
            loadData();
        } catch (e) {
            console.error('Payment error', e); 
        }
    };

    const handleSaveManualMin = async () => {
        if (!selectedCardForMin) return;
        let cleanMin = manualMinAmount;
        if (currency === 'COP') {
            cleanMin = manualMinAmount.replace(/\./g, '').replace(',', '.');
        } else {
            cleanMin = manualMinAmount.replace(/,/g, '');
        }
        const val = convertToBase(parseFloat(cleanMin), currency, rates) || 0;
        
        const updated = cards.map(c => 
            c.id === selectedCardForMin.id ? { ...c, manualMinPayment: val } : c
        );
        setCards(updated);
        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
        if (user?.id) syncUp(user.id);
        
        setMinModalVisible(false);
        setManualMinAmount('');
        setSelectedCardForMin(null);
        loadData();
    };

    const getDaysLeft = (targetDay: number) => {
        const today = new Date();
        const currentM = today.getMonth();
        const currentY = today.getFullYear();
        let targetDate = new Date(currentY, currentM, targetDay);
        
        if (today.getDate() > targetDay) {
            targetDate = new Date(currentY, currentM + 1, targetDay);
        }
        
        const diffTime = targetDate.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            {/* ── Header Sanctuary ─────────────────────────────────────── */}
            <View style={styles.header}>
                <View>
                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Cuentas</Text>
                    <Text style={[styles.headerSub, { color: colorsNav.sub }]}>Control de tarjetas de crédito</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colorsNav.accent }]} onPress={() => setAddModalVisible(true)}>
                    <MaterialIcons name="add" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {cards.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialIcons name="account-balance-wallet" size={64} color={isDark ? '#3A3A52' : '#E0D8CC'} style={{ opacity: 0.6, marginBottom: 16 }} />
                        <Text style={[styles.emptyTitle, { color: colorsNav.text }]}>Sin Tarjetas Agregadas</Text>
                        <Text style={[styles.emptySubtitle, { color: colorsNav.sub }]}>
                            Mantén el control exacto de tus límites, fechas de corte y pagos agregando tus tarjetas aquí.
                        </Text>
                    </View>
                ) : (
                    cards.map(card => {
                        const debt = cardBalances[card.name] || 0;
                        const available = card.limit - debt;
                        const daysToCut = getDaysLeft(card.cutDay);
                        const daysToPay = getDaysLeft(card.dueDay);
                        const isWarningPay = daysToPay <= 3 && debt > 0;

                        return (
                            <View key={card.id} style={styles.cardContainer}>
                                <TouchableOpacity 
                                    style={[styles.cardFace, { backgroundColor: card.color }]}
                                    activeOpacity={0.9}
                                    onLongPress={() => handleDeleteCard(card)}
                                >
                                    <View style={styles.cardHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <MaterialIcons name="credit-card" size={18} color="rgba(255,255,255,0.7)" />
                                            <Text style={styles.cardBank}>{card.name.toUpperCase()}</Text>
                                        </View>
                                        <Text style={styles.cardBrand}>{card.brand.toUpperCase()}</Text>
                                    </View>
                                    
                                    <TouchableOpacity 
                                        style={styles.cardBody}
                                        onPress={() => {
                                            setSelectedCardForMin(card);
                                            setManualMinAmount(card.manualMinPayment ? card.manualMinPayment.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : '');
                                            setMinModalVisible(true);
                                        }}
                                    >
                                        <Text style={styles.cardLabel}>DEUDA ACTUAL</Text>
                                        <Text style={styles.cardDebt}>{fmt(debt)}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                                            <Text style={styles.cardLabel}>PAGO MÍNIMO {card.manualMinPayment ? 'MES' : `(${card.minPaymentPct || 10}%)`}</Text>
                                            <MaterialIcons name="edit" size={12} color="rgba(255,255,255,0.5)" />
                                        </View>
                                        <Text style={[styles.cardLimit, { fontSize: 22 }]}>
                                            {fmt(card.manualMinPayment || Math.round(debt * ((card.minPaymentPct || 10) / 100)))}
                                        </Text>
                                    </TouchableOpacity>
                                    
                                    <View style={styles.cardFooter}>
                                        <View>
                                            <Text style={styles.cardLabel}>DISPONIBLE</Text>
                                            <Text style={styles.cardLimit}>{fmt(available)}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.cardLabel}>FECHA PAGO</Text>
                                            <Text style={styles.cardSmallText}>Día {card.dueDay}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>

                                {/* Reminders & Actions */}
                                <View style={[styles.cardBelow, { backgroundColor: isDark ? colorsNav.card : '#FFF', borderColor: colorsNav.border }]}>
                                    <View style={styles.notificationArea}>
                                        {isWarningPay ? (
                                            <View style={styles.alertNotice}>
                                                <MaterialIcons name="error-outline" size={16} color="#EF4444" />
                                                <Text style={styles.alertNoticeText}>Pagar en {daysToPay} días</Text>
                                            </View>
                                        ) : debt > 0 ? (
                                            <View style={styles.infoNotice}>
                                                <MaterialIcons name="event" size={16} color={colorsNav.sub} />
                                                <Text style={[styles.infoNoticeText, { color: colorsNav.sub }]}>Corte en {daysToCut} días</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.infoNotice}>
                                                <MaterialIcons name="check-circle-outline" size={16} color="#4A7C59" />
                                                <Text style={[styles.infoNoticeText, { color: '#4A7C59' }]}>Sin deuda</Text>
                                            </View>
                                        )}
                                    </View>
                                    
                                    <TouchableOpacity 
                                        style={[styles.payBtn, { backgroundColor: colorsNav.accent }, debt === 0 && { opacity: 0.3 }]} 
                                        disabled={debt === 0}
                                        onPress={() => { setSelectedCard(card); setPayAmount(''); setPayModalVisible(true); }}
                                    >
                                        <Text style={styles.payBtnText}>PAGAR</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* ADDCARD MODAL */}
            <Modal visible={addModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', alignItems: 'center' }} pointerEvents="box-none">
                        <View style={[styles.modalSheet, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nueva Tarjeta de Crédito</Text>
                            <Text style={[styles.modalSub, { color: colorsNav.sub }]}>Configura los límites y fechas de tu tarjeta</Text>
                            
                            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border }]}
                                placeholder="Nombre de la tarjeta" placeholderTextColor={colorsNav.sub}
                                value={newName} onChangeText={setNewName} />

                            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border }]}
                                placeholder="Cupo Total ($)" placeholderTextColor={colorsNav.sub}
                                keyboardType="decimal-pad" value={newLimit} onChangeText={(text) => setNewLimit(formatInput(text))} />

                            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
                                <View style={{ flex: 1, marginRight: 6 }}>
                                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border, width: '100%' }]}
                                        placeholder="Día Corte" placeholderTextColor={colorsNav.sub}
                                        keyboardType="number-pad" value={newCutDay} onChangeText={setNewCutDay} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 6 }}>
                                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border, width: '100%' }]}
                                        placeholder="Día Pago" placeholderTextColor={colorsNav.sub}
                                        keyboardType="number-pad" value={newDueDay} onChangeText={setNewDueDay} />
                                </View>
                            </View>

                            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border }]}
                                placeholder="Pago Mínimo (%) Ej: 10" placeholderTextColor={colorsNav.sub}
                                keyboardType="number-pad" value={newMinPct} onChangeText={setNewMinPct} />

                            <Text style={[styles.labelSection, { color: colorsNav.sub }]}>COLOR DEL PLÁSTICO</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                {CARD_COLORS.map(c => (
                                    <TouchableOpacity 
                                        key={c} 
                                        style={[styles.colorCircle, { backgroundColor: c }, newColor === c && { borderColor: isDark ? '#FFF' : '#2D5A3D', borderWidth: 3 }]} 
                                        onPress={() => setNewColor(c)} 
                                    />
                                ))}
                            </ScrollView>

                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]} onPress={() => setAddModalVisible(false)}>
                                    <Text style={[styles.modalBtnCancelText, { color: colorsNav.text }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: colorsNav.accent }]} onPress={handleAddCard}>
                                    <Text style={styles.modalBtnConfirmText}>Crear Tarjeta</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* PAY MODAL */}
            <Modal visible={payModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', alignItems: 'center' }} pointerEvents="box-none">
                        <View style={[styles.modalSheet, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Pagar {selectedCard?.name}</Text>
                            <Text style={[styles.modalSub, { color: colorsNav.sub }]}>Deuda actual: {fmt(cardBalances[selectedCard?.name || ''] || 0)}</Text>

                            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border, fontSize: 24, fontWeight: '800' }]}
                                placeholder="$ 0" placeholderTextColor={colorsNav.sub}
                                keyboardType="decimal-pad" value={payAmount} onChangeText={(text) => setPayAmount(formatInput(text))}
                                autoFocus />

                            <Text style={[styles.labelSection, { color: colorsNav.sub, marginTop: 10 }]}>¿DESDE DÓNDE PAGAS?</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                                {accounts.map(acc => (
                                    <TouchableOpacity 
                                        key={acc} 
                                        style={[
                                            styles.accPill, 
                                            { borderColor: colorsNav.border, backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2' },
                                            selectedAccount === acc && { borderColor: colorsNav.accent, backgroundColor: isDark ? '#4A7C5930' : '#E8F5E9' }
                                        ]}
                                        onPress={() => setSelectedAccount(acc)}
                                    >
                                        <Text style={{ fontWeight: '700', color: selectedAccount === acc ? colorsNav.accent : colorsNav.sub }}>
                                            {acc}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]} onPress={() => setPayModalVisible(false)}>
                                    <Text style={[styles.modalBtnCancelText, { color: colorsNav.text }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: colorsNav.accent }]} onPress={handlePayCard}>
                                    <Text style={styles.modalBtnConfirmText}>Confirmar Pago</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
            {/* MANUAL MIN MODAL */}
            <Modal visible={minModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', alignItems: 'center' }} pointerEvents="box-none">
                        <View style={[styles.modalSheet, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Pago Mínimo del Mes</Text>
                            <Text style={[styles.modalSub, { color: colorsNav.sub }]}>Ingresa el valor que aparece en tu extracto para {selectedCardForMin?.name}</Text>
                            
                            <TextInput style={[styles.modalInput, { backgroundColor: isDark ? colorsNav.cardBg : '#F9F6F2', color: colorsNav.text, borderColor: colorsNav.border, fontSize: 24, fontWeight: '800' }]}
                                placeholder="$ 0" placeholderTextColor={colorsNav.sub}
                                keyboardType="decimal-pad" value={manualMinAmount} onChangeText={handleManualMinChange}
                                autoFocus />

                            <View style={styles.modalBtns}>
                                <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]} onPress={() => setMinModalVisible(false)}>
                                    <Text style={[styles.modalBtnCancelText, { color: colorsNav.text }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: colorsNav.accent }]} onPress={handleSaveManualMin}>
                                    <Text style={styles.modalBtnConfirmText}>Guardar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
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
        marginBottom: 10 
    },
    headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    headerSub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
    addBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8 },
    
    scrollContent: { padding: 20, paddingBottom: 120 },
    
    emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 30 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

    cardContainer: { marginBottom: 20 },
    cardFace: {
        borderRadius: 24, padding: 24,
        height: 190, justifyContent: 'space-between',
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 8,
        zIndex: 2
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBank: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
    cardBrand: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800' },
    cardBody: {},
    cardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
    cardDebt: { color: '#FFF', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    cardLimit: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    cardSmallText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

    cardBelow: {
        marginTop: -20, paddingTop: 34, padding: 18,
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderWidth: 1, borderTopWidth: 0,
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, elevation: 1
    },
    notificationArea: { flex: 1 },
    alertNotice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    alertNoticeText: { color: '#EF4444', fontWeight: '800', fontSize: 13 },
    infoNotice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoNoticeText: { fontWeight: '700', fontSize: 13 },
    payBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
    payBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modalSheet: { borderRadius: 28, padding: 24, width: '100%', maxWidth: 450 },
    modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
    modalSub: { fontSize: 14, marginBottom: 20, fontWeight: '500' },
    modalInput: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, marginBottom: 12 },
    
    labelSection: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 14, marginTop: 14 },
    colorCircle: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
    
    accPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2 },

    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
    modalBtnCancel: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
    modalBtnCancelText: { fontWeight: '700', fontSize: 15 },
    modalBtnConfirm: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
    modalBtnConfirmText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
});
