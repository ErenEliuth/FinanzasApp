import { useAuth } from '@/utils/auth';
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
import * as Haptics from 'expo-haptics';
import {
    Alert,
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

const CARD_COLORS = ['#2D5A3D', '#4A7C59', '#1E293B', '#8B5CF6', '#F59E0B', '#EF4444'];

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

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    const [activeTab, setActiveTab] = useState<string | null>(null);

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

        if (diff === 0 || diff >= 28) return { type: 'gold', msg: '¡DÍA DE ORO! Tienes 45 días para pagar si compras hoy.' };
        if (diff <= 3) return { type: 'warn', msg: 'MAL MOMENTO: El corte es pronto. Pagarás esto en pocos días.' };
        return { type: 'info', msg: `Faltan ${diff} días para tu cierre de ciclo. Compra con calma.` };
    };



    const scrollRef = useRef<any>(null);

    useEffect(() => { 
        if (isFocused) {
            loadData(); 
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        } 
    }, [isFocused]);

    const handleLimitChange = (text: string) => {
        setNewLimit(formatInputDisplay(text, currency));
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
        await AsyncStorage.setItem(SYNC_KEYS.CARDS(user.id), JSON.stringify(updated));
        
        const storedParams = await AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(user.id));
        const currentCustomAccounts = storedParams ? JSON.parse(storedParams) : [];
        if (!currentCustomAccounts.includes(newCard.name)) {
            await AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(user.id), JSON.stringify([...currentCustomAccounts, newCard.name]));
        }

        await syncUp(user.id);
        await refreshConfig();

        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setAddModalVisible(false);
        setNewName(''); setNewLimit(''); setNewCutDay(''); setNewDueDay('');
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
                const storedAccs = await AsyncStorage.getItem(SYNC_KEYS.ACCOUNTS(user.id));
                if (storedAccs) {
                    const parsedAccs = JSON.parse(storedAccs);
                    const updatedAccs = parsedAccs.filter((a: string) => a !== card.name);
                    await AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(user.id), JSON.stringify(updatedAccs));
                }

                // Borrar la tarjeta
                const updated = cards.filter(c => c.id !== card.id);
                await AsyncStorage.setItem(SYNC_KEYS.CARDS(user.id), JSON.stringify(updated));
                
                await syncUp(user.id);
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
                { user_id: user?.id, amount: payVal, type: 'expense', category: 'Tarjetas', description: `Pago a ${selectedCard.name}`, account: selectedAccount, date: new Date().toISOString() },
                { user_id: user?.id, amount: payVal, type: 'income', category: 'Tarjetas', description: `Abono desde ${selectedAccount}`, account: selectedCard.name, date: new Date().toISOString() }
            ]);
            setPayModalVisible(false); setPayAmount(''); loadData();
        } catch (e) { console.error(e); }
    };

    const currentCard = cards.find(c => c.id === activeTab);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            <View style={styles.header}>
                <TouchableOpacity 
                    style={[styles.backBtn, { backgroundColor: isDark ? colorsNav.card : '#F8F5F0', borderColor: colorsNav.border }]} 
                    onPress={() => router.replace('/')}
                >
                    <Ionicons name="chevron-back" size={24} color={colorsNav.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Mis Tarjetas</Text>
                    <Text style={[styles.headerSub, { color: colorsNav.sub }]}>Gestiona tu crédito santuario</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colorsNav.accent }]} onPress={() => setAddModalVisible(true)}>
                    <MaterialIcons name="add" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Carousel de Tarjetas */}
            {cards.length > 0 ? (
                <View style={{ height: 260 }}>
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false} 
                        snapToInterval={width * 0.85 + 16}
                        decelerationRate="fast"
                        contentContainerStyle={styles.carouselContainer}
                    >
                        {cards.map(c => {
                            const debt = cardBalances[c.name] || 0;
                            const utilization = getUtilization(c.limit, debt);
                            const daysToPay = getDaysUntil(c.dueDay);
                            
                            return (
                                <TouchableOpacity 
                                    key={c.id} 
                                    activeOpacity={0.9}
                                    style={[styles.cardWrapper, activeTab === c.id && styles.activeCard]}
                                    onPress={() => {
                                        setActiveTab(c.id);
                                        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }}
                                    onLongPress={() => handleDeleteCard(c)}
                                >
                                    <LinearGradient
                                        colors={[c.color, shadeColor(c.color, -30)]}
                                        style={styles.cardFacePremium}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <View style={styles.cardTop}>
                                            <View>
                                                <Text style={styles.cardBankName}>{c.name.toUpperCase()}</Text>
                                                <Text style={styles.cardBrandName}>{c.brand.toUpperCase()}</Text>
                                            </View>
                                            <MaterialIcons name="contactless" size={24} color="rgba(255,255,255,0.7)" />
                                        </View>
                                        
                                        <View>
                                            <Text style={utilstyles.label}>SALDO AL CORTE</Text>
                                            <Text style={utilstyles.debtAmount}>{fmt(debt)}</Text>
                                        </View>

                                        <View style={utilstyles.footer}>
                                            <View>
                                                <Text style={utilstyles.smallLabel}>DISPONIBLE</Text>
                                                <Text style={utilstyles.availableAmt}>{fmt(c.limit - debt)}</Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={utilstyles.smallLabel}>PAGO MES</Text>
                                                <Text style={utilstyles.availableAmt}>{fmt(calculateNextPayment(c))}</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            ) : null}

            <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 150 }]} showsVerticalScrollIndicator={false}>
                {currentCard ? (
                    <View style={{ gap: 24 }}>
                        {/* Dashboard Compacto */}
                        <View style={[styles.dashboardCard, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                            {/* Uso de Crédito */}
                            <View style={styles.dashboardRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.dashboardLabel, { color: colorsNav.sub }]}>USO DE CRÉDITO</Text>
                                    <View style={styles.utilBarBG}>
                                        <LinearGradient
                                            colors={getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0) > 80 ? ['#EF4444', '#DC2626'] : [colorsNav.accent, shadeColor(colorsNav.accent, -20)]}
                                            style={[styles.utilBarFill, { width: `${Math.min(getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0), 100)}%` }]}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        />
                                    </View>
                                </View>
                                <Text style={[styles.dashboardVal, { marginLeft: 15, color: getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0) > 80 ? '#EF4444' : colorsNav.text }]}>
                                    {getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0).toFixed(0)}%
                                </Text>
                            </View>

                            <View style={[styles.divider, { backgroundColor: colorsNav.border }]} />

                            {/* Pago y Días */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <View>
                                    <Text style={[styles.dashboardLabel, { color: colorsNav.sub }]}>PAGO ESTIMADO</Text>
                                    <Text style={[styles.dashboardVal, { color: colorsNav.text }]}>{fmt(calculateNextPayment(currentCard))}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.dashboardLabel, { color: colorsNav.sub }]}>FALTAN</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <MaterialIcons name="timer" size={16} color={getDaysUntil(currentCard.dueDay) < 5 ? '#EF4444' : colorsNav.accent} />
                                        <Text style={[styles.dashboardVal, { color: getDaysUntil(currentCard.dueDay) < 5 ? '#EF4444' : colorsNav.text }]}>
                                            {getDaysUntil(currentCard.dueDay)} días
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>



                        {/* Actions */}
                        <TouchableOpacity 
                            style={[styles.payBtnLarge, { backgroundColor: colorsNav.accent }]} 
                            onPress={() => { setSelectedCard(currentCard); setPayModalVisible(true); }}
                        >
                            <MaterialIcons name="payment" size={20} color="#FFF" />
                            <Text style={styles.payBtnTxtLarge}>REGISTRAR PAGO</Text>
                        </TouchableOpacity>

                        {/* Desglose de Compras */}
                        <View style={{ gap: 12 }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: colorsNav.text, marginLeft: 5 }}>COMPRAS POR CUOTAS</Text>
                            {(cardTransactions[currentCard.name] || [])
                                .filter(tx => tx.type === 'expense' && tx.description?.includes('[CUOTAS:'))
                                .map(tx => {
                                    const currentIdx = getCurrentInstallmentNumber(tx, currentCard, now.getMonth() + 1, now.getFullYear());
                                    const totalMatch = tx.description?.match(/\[CUOTAS:(\d+)/);
                                    const total = totalMatch ? parseInt(totalMatch[1], 10) : 1;
                                    
                                    return (
                                        <View key={tx.id} style={[styles.txItem, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: colorsNav.text, fontWeight: '800', fontSize: 13 }}>{getCleanDescription(tx.description)}</Text>
                                                <Text style={{ color: colorsNav.sub, fontSize: 10, marginTop: 2 }}>
                                                    {new Date(tx.date).toLocaleDateString('es-CO')} • Cuota {currentIdx || 'Fin.'}/{total}
                                                </Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={{ color: colorsNav.text, fontWeight: '900' }}>{fmt(tx.amount / total)}</Text>
                                                <Text style={{ color: colorsNav.sub, fontSize: 9 }}>Restante: {fmt(tx.amount - (tx.amount/total * (currentIdx || total)))}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                        </View>

                        <TouchableOpacity 
                            style={{ alignSelf: 'center', marginTop: 10, marginBottom: 40 }}
                            onPress={() => handleDeleteCard(currentCard)}
                        >
                            <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' }}>Eliminar Tarjeta</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.empty}>
                        <MaterialIcons name="credit-card-off" size={60} color={colorsNav.sub} style={{ opacity: 0.3 }} />
                        <Text style={[styles.emptyTxt, { color: colorsNav.sub }]}>Agrega una tarjeta para comenzar</Text>
                    </View>
                )}
            </ScrollView>

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
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newLimit} onChangeText={handleLimitChange} />
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 15, marginBottom: 20 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>DÍA CORTE</Text>
                                            <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="1 - 31" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newCutDay} onChangeText={setNewCutDay} maxLength={2} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>DÍA PAGO</Text>
                                            <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="1 - 31" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newDueDay} onChangeText={setNewDueDay} maxLength={2} />
                                        </View>
                                    </View>

                                    <View style={styles.inputGroup}>
                                        <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>INTERÉS ANUAL (E.A. %)</Text>
                                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Ej: 28" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newInterest} onChangeText={setNewInterest} />
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
                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, fontSize: 24, padding: 20 }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={payAmount} onChangeText={t => setPayAmount(formatInputDisplay(t, currency))} autoFocus />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.sub, marginVertical: 10 }}>¿DESDE QUÉ CUENTA?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                            {['Efectivo', ...customAccounts].filter(acc => !cards.some(c => c.name === acc)).map(acc => (
                                <TouchableOpacity key={acc} style={[styles.accPill, selectedAccount === acc && { backgroundColor: colorsNav.accent, borderColor: colorsNav.accent }]} onPress={() => setSelectedAccount(acc)}>
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
    cardFacePremium: { flex: 1, padding: 24, justifyContent: 'space-between' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardBankName: { color: '#FFF', fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },
    cardBrandName: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontSize: 10, marginTop: 2 },
    
    scroll: { padding: 20 },
    
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
    txItem: { flexDirection: 'row', padding: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
});
