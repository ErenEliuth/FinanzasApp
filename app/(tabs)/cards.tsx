import { useAuth } from '@/utils/auth';
import { syncUp } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, getCurrencyInfo, convertCurrency, convertToBase } from '@/utils/currency';
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
    const { user, currency, rates, isHidden } = useAuth();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [cards, setCards] = useState<CreditCard[]>([]);
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
    const [newInterest, setNewInterest] = useState('28'); // Default E.A. en Colombia ~28-35%

    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [accounts, setAccounts] = useState<string[]>(['Efectivo']);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    const [activeTab, setActiveTab] = useState<string | null>(null);

    const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

    const loadData = async () => {
        if (!user) return;
        try {
            const storedCards = await AsyncStorage.getItem(`@cards_${user.id}`);
            const parsedCards: CreditCard[] = storedCards ? JSON.parse(storedCards) : [];
            setCards(parsedCards);
            if (parsedCards.length > 0 && !activeTab) setActiveTab(parsedCards[0].id);

            const storedAccounts = await AsyncStorage.getItem('@custom_accounts');
            const extra = storedAccounts ? JSON.parse(storedAccounts) : [];
            setAccounts(['Efectivo', ...extra].filter(acc => !parsedCards.some(c => c.name === acc)));

            if (parsedCards.length > 0) {
                const { data: txs } = await supabase
                    .from('transactions')
                    .select('*')
                    .eq('user_id', user.id)
                    .in('account', parsedCards.map(c => c.name))
                    .order('date', { ascending: false });

                const balances: Record<string, number> = {};
                const txGroups: Record<string, any[]> = {};
                parsedCards.forEach(c => {
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
            }
        } catch (e) { console.error(e); }
    };

    const calculateNextPayment = (card: CreditCard) => {
        const txs = cardTransactions[card.name] || [];
        let total = 0;
        
        txs.forEach(tx => {
            if (tx.type === 'expense') {
                const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
                if (match) {
                    const cuotas = parseInt(match[1], 10);
                    const ea = parseFloat(match[2] || '0') / 100;
                    if (ea > 0 && cuotas > 1) {
                        const mv = Math.pow(1 + ea, 1/12) - 1;
                        const p = tx.amount;
                        const cuota = (p * mv) / (1 - Math.pow(1 + mv, -cuotas));
                        total += cuota;
                    } else {
                        total += tx.amount / cuotas;
                    }
                } else {
                    total += tx.amount;
                }
            } else if (tx.type === 'income' || tx.type === 'transfer') {
                total -= tx.amount;
            }
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

    const getMonthlyProjection = (card: CreditCard) => {
        const txs = cardTransactions[card.name] || [];
        const months = Array(12).fill(0);

        txs.forEach(tx => {
            const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
            if (match && tx.type === 'expense') {
                const n = parseInt(match[1], 10);
                const ea = parseFloat(match[2] || '0') / 100;
                const txDate = new Date(tx.date);
                
                let monthlyAmt = tx.amount / n;
                if (ea > 0) {
                    const mv = Math.pow(1 + ea, 1/12) - 1;
                    monthlyAmt = (tx.amount * mv) / (1 - Math.pow(1 + mv, -n));
                }

                for (let i = 0; i < n; i++) {
                    const payDate = new Date(txDate.getFullYear(), txDate.getMonth() + i + 1, 1);
                    const monthsDiff = (payDate.getFullYear() - now.getFullYear()) * 12 + (payDate.getMonth() - now.getMonth());
                    
                    if (monthsDiff >= 0 && monthsDiff < 12) {
                        months[monthsDiff] += monthlyAmt;
                    }
                }
            } else if (tx.type === 'expense' && !match) {
                // Compras a 1 cuota caen en el mes 0 (próximo pago)
                months[0] += tx.amount;
            }
        });

        return months;
    };

    const scrollRef = useRef<any>(null);

    useEffect(() => { 
        if (isFocused) {
            loadData(); 
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        } 
    }, [isFocused]);

    const handleLimitChange = (text: string) => {
        const clean = text.replace(/\D/g, '');
        if (!clean) { setNewLimit(''); return; }
        const info = getCurrencyInfo(currency);
        setNewLimit(new Intl.NumberFormat(info.locale).format(parseInt(clean, 10)));
    };

    const handleAddCard = async () => {
        let cleanLim = newLimit.replace(/\D/g, '');
        const limit = convertToBase(parseFloat(cleanLim), currency, rates);
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
        setCards(updated);
        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
        
        const storedParams = await AsyncStorage.getItem('@custom_accounts');
        const customAccounts = storedParams ? JSON.parse(storedParams) : [];
        if (!customAccounts.includes(newCard.name)) {
            await AsyncStorage.setItem('@custom_accounts', JSON.stringify([...customAccounts, newCard.name]));
        }

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
            const updated = cards.filter(c => c.id !== card.id);
            setCards(updated);
            await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
            loadData();
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        let cleanPay = payAmount.replace(/\D/g, '');
        const payVal = convertToBase(parseFloat(cleanPay), currency, rates);
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
                <View>
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

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {currentCard ? (
                    <View style={{ gap: 24 }}>
                        {/* Indicador de Utilización */}
                        <View style={[styles.utilContainer, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                            <View style={styles.utilHeader}>
                                <Text style={[styles.utilTitle, { color: colorsNav.text }]}>Uso de Crédito</Text>
                                <Text style={[styles.utilPct, { color: getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0) > 80 ? '#EF4444' : colorsNav.accent }]}>
                                    {getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0).toFixed(1)}%
                                </Text>
                            </View>
                            <View style={styles.utilBarBG}>
                                <LinearGradient
                                    colors={getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0) > 80 ? ['#EF4444', '#DC2626'] : [colorsNav.accent, shadeColor(colorsNav.accent, -20)]}
                                    style={[styles.utilBarFill, { width: `${Math.min(getUtilization(currentCard.limit, cardBalances[currentCard.name] || 0), 100)}%` }]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                />
                            </View>
                            <View style={styles.utilLabels}>
                                <Text style={{ color: colorsNav.sub, fontSize: 11 }}>Usado: {fmt(cardBalances[currentCard.name] || 0)}</Text>
                                <Text style={{ color: colorsNav.sub, fontSize: 11 }}>Límite: {fmt(currentCard.limit)}</Text>
                            </View>
                        </View>

                        {/* Instructional Message */}
                        <View style={[styles.infoBox, { backgroundColor: colorsNav.accent + '15' }]}>
                            <MaterialIcons name="info-outline" size={20} color={colorsNav.accent} />
                            <Text style={[styles.infoTxt, { color: colorsNav.accent }]}>
                                Para que una compra con esta tarjeta se refleje aquí, ve al menú de <Text style={{ fontWeight: '800' }}>Gastos</Text> y selecciónala como cuenta de pago.
                            </Text>
                        </View>

                        {/* Día de Oro Advice */}
                        {(() => {
                            const advice = getShoppingAdvice(currentCard);
                            return (
                                <View style={[styles.adviceBox, { 
                                    backgroundColor: advice.type === 'gold' ? '#F59E0B20' : advice.type === 'warn' ? '#EF444415' : colorsNav.card,
                                    borderColor: advice.type === 'gold' ? '#F59E0B60' : advice.type === 'warn' ? '#EF444460' : colorsNav.border
                                }]}>
                                    <MaterialIcons 
                                        name={advice.type === 'gold' ? 'stars' : advice.type === 'warn' ? 'warning' : 'info'} 
                                        size={20} 
                                        color={advice.type === 'gold' ? '#F59E0B' : advice.type === 'warn' ? '#EF4444' : colorsNav.sub} 
                                    />
                                    <Text style={[styles.adviceTxt, { color: advice.type === 'gold' ? '#B45309' : advice.type === 'warn' ? '#B91C1C' : colorsNav.text }]}>
                                        {advice.msg}
                                    </Text>
                                </View>
                            );
                        })()}

                        {/* Resumen de Pago Próximo */}
                        <View style={[styles.nextPayCard, { backgroundColor: colorsNav.card, borderColor: colorsNav.border }]}>
                            <View>
                                <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '700' }}>PRÓXIMO PAGO ESTIMADO</Text>
                                <Text style={{ color: colorsNav.text, fontSize: 24, fontWeight: '900', marginTop: 4 }}>{fmt(calculateNextPayment(currentCard))}</Text>
                            </View>
                            <View style={[styles.dateChip, { backgroundColor: colorsNav.accent + '15' }]}>
                                <MaterialIcons name="event" size={16} color={colorsNav.accent} />
                                <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 12 }}>Día {currentCard.dueDay}</Text>
                            </View>
                        </View>

                        {/* Actions */}
                        <TouchableOpacity 
                            style={[styles.payBtnLarge, { backgroundColor: colorsNav.accent }]} 
                            onPress={() => { setSelectedCard(currentCard); setPayModalVisible(true); }}
                        >
                            <MaterialIcons name="payment" size={20} color="#FFF" />
                            <Text style={styles.payBtnTxtLarge}>REGISTRAR ABONO / PAGO</Text>
                        </TouchableOpacity>

                        {/* Movements Section */}
                        <Text style={[styles.secTitle, { color: colorsNav.text }]}>MOVIMIENTOS RECIENTES</Text>
                        {(cardTransactions[currentCard.name] || []).length === 0 ? (
                            <View style={styles.emptyMovements}>
                                <Text style={{ color: colorsNav.sub }}>No hay movimientos registrados para esta tarjeta.</Text>
                            </View>
                        ) : (
                            (cardTransactions[currentCard.name] || []).map(tx => {
                                const match = tx.description?.match(/\[CUOTAS:(\d+)(?::RATE:([\d.]+))?\]/);
                                const cuotas = match ? parseInt(match[1], 10) : 1;
                                const ea = match ? parseFloat(match[2] || '0') / 100 : 0;
                                const cleanDesc = tx.description?.replace(/\[CUOTAS:\d+(?::RATE:[\d.]+)?\]\s*/, '') || tx.category;
                                
                                let cuotaVal = tx.amount / cuotas;
                                let totalReal = tx.amount;
                                
                                if (ea > 0 && cuotas > 1) {
                                    const mv = Math.pow(1 + ea, 1/12) - 1;
                                    cuotaVal = (tx.amount * mv) / (1 - Math.pow(1 + mv, -cuotas));
                                    totalReal = cuotaVal * cuotas;
                                }

                                return (
                                    <View key={tx.id} style={[styles.txRow, { borderBottomColor: colorsNav.border }]}>
                                        <View style={[styles.txIcon, { backgroundColor: tx.type === 'expense' ? '#EF444415' : '#4CAF5015' }]}>
                                            <MaterialIcons name={tx.type === 'expense' ? 'credit-card' : 'account-balance-wallet'} size={18} color={tx.type === 'expense' ? '#EF4444' : '#4CAF50'} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.txName, { color: colorsNav.text }]}>{cleanDesc}</Text>
                                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                                <Text style={[styles.txDate, { color: colorsNav.sub }]}>{new Date(tx.date).toLocaleDateString()}</Text>
                                                {cuotas > 1 && (
                                                    <View style={[styles.cuotaBadge, { backgroundColor: ea > 0 ? '#EF444410' : 'rgba(0,0,0,0.05)' }]}>
                                                        <Text style={[styles.cuotaBadgeTxt, { color: ea > 0 ? '#EF4444' : '#666' }]}>{cuotas} cuotas {ea > 0 ? `@ ${(ea*100).toFixed(1)}%` : '(Sin interés)'}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.txAmt, { color: tx.type === 'expense' ? colorsNav.text : '#4CAF50' }]}>
                                                {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount)}
                                            </Text>
                                            {cuotas > 1 && (
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ fontSize: 10, color: colorsNav.accent, fontWeight: '800' }}>{fmt(cuotaVal)} / mes</Text>
                                                    {ea > 0 && <Text style={{ fontSize: 9, color: '#EF4444', fontWeight: '700' }}>Total: {fmt(totalReal)}</Text>}
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        {/* Proyección de Libertad */}
                        <Text style={[styles.secTitle, { color: colorsNav.text, marginTop: 30 }]}>MAPA DE LIBERTAD (12 MESES)</Text>
                        <Text style={{ color: colorsNav.sub, fontSize: 12, marginBottom: 15 }}>Proyección de cargos mensuales fijos por cuotas.</Text>
                        
                        <View style={styles.projectionCont}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {getMonthlyProjection(currentCard).map((val, idx) => {
                                    const monthDate = new Date();
                                    monthDate.setMonth(now.getMonth() + idx);
                                    const mName = monthDate.toLocaleString('es-CO', { month: 'short' }).toUpperCase();
                                    
                                    // Altura máxima de la barra 100px
                                    const maxVal = Math.max(...getMonthlyProjection(currentCard), 1);
                                    const barHeight = (val / maxVal) * 80;

                                    return (
                                        <View key={idx} style={styles.projectionItem}>
                                            <View style={styles.barContainer}>
                                                <View style={[styles.barFill, { height: barHeight, backgroundColor: colorsNav.accent }]} />
                                            </View>
                                            <Text style={styles.barVal}>{val > 0 ? (val > 1000000 ? (val/1000000).toFixed(1)+'M' : (val/1000).toFixed(0)+'k') : '0'}</Text>
                                            <Text style={styles.barMonth}>{mName}</Text>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        </View>
                        <TouchableOpacity 
                            style={[styles.deleteBtn, { borderColor: '#EF4444' }]} 
                            onPress={() => handleDeleteCard(currentCard)}
                        >
                            <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                            <Text style={[styles.deleteBtnTxt, { color: '#EF4444' }]}>ELIMINAR ESTA TARJETA</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.empty}>
                        <MaterialIcons name="credit-card-off" size={60} color={colorsNav.sub} style={{ opacity: 0.3 }} />
                        <Text style={[styles.emptyTxt, { color: colorsNav.sub }]}>Agrega una tarjeta para comenzar</Text>
                    </View>
                )}
                <View style={{ height: 100 }} />
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
                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border, fontSize: 24, padding: 20 }]} placeholder="$ 0" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={payAmount} onChangeText={t => setPayAmount(t)} autoFocus />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colorsNav.sub, marginVertical: 10 }}>¿DESDE QUÉ CUENTA?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                            {accounts.map(acc => (
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
    addBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    
    // Carousel
    carouselContainer: { paddingHorizontal: 20, gap: 16, height: 240, alignItems: 'center' },
    cardWrapper: { width: width * 0.85, height: 210, borderRadius: 28, overflow: 'hidden' },
    activeCard: { transform: [{ scale: 1.02 }], elevation: 8, shadowColor: '#000', shadowOpacity: 0.2 },
    cardFacePremium: { flex: 1, padding: 24, justifyContent: 'space-between' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardBankName: { color: '#FFF', fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },
    cardBrandName: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontSize: 10, marginTop: 2 },

    scroll: { padding: 20, paddingBottom: 150 },
    
    // Utilization
    utilContainer: { padding: 20, borderRadius: 28, borderWidth: 1, gap: 12 },
    utilHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    utilTitle: { fontSize: 14, fontWeight: '800' },
    utilPct: { fontSize: 14, fontWeight: '900' },
    utilBarBG: { height: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden' },
    utilBarFill: { height: '100%', borderRadius: 4 },
    utilLabels: { flexDirection: 'row', justifyContent: 'space-between' },

    nextPayCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderRadius: 28, borderWidth: 1 },
    dateChip: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },

    infoBox: { flexDirection: 'row', gap: 12, padding: 18, borderRadius: 24, alignItems: 'center' },
    infoTxt: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
    payBtnLarge: { flexDirection: 'row', gap: 10, padding: 18, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    payBtnTxtLarge: { color: '#FFF', fontWeight: '900', fontSize: 15 },
    secTitle: { fontSize: 18, fontWeight: '900', marginTop: 15, letterSpacing: -0.3 },
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1 },
    txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    txName: { fontSize: 14, fontWeight: '800' },
    txDate: { fontSize: 11, marginTop: 2, fontWeight: '600' },
    cuotaBadge: { backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
    cuotaBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#666' },
    txAmt: { fontSize: 15, fontWeight: '900' },
    emptyMovements: { padding: 40, alignItems: 'center', gap: 10 },

    adviceBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
    adviceTxt: { fontSize: 13, fontWeight: '800', flex: 1 },

    projectionCont: { backgroundColor: 'rgba(0,0,0,0.02)', padding: 20, borderRadius: 28, marginBottom: 30 },
    projectionItem: { alignItems: 'center', width: 45, marginRight: 15 },
    barContainer: { height: 80, width: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: '100%', borderRadius: 6 },
    barVal: { fontSize: 10, fontWeight: '900', color: '#666', marginTop: 8 },
    barMonth: { fontSize: 9, fontWeight: '800', color: '#999', marginTop: 4 },

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
    deleteBtn: { flexDirection: 'row', gap: 8, padding: 16, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginTop: 30, borderStyle: 'dashed' },
    deleteBtnTxt: { fontWeight: '800', fontSize: 13 },
    accPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
    empty: { padding: 80, alignItems: 'center', gap: 20 },
    emptyTxt: { fontWeight: '800', fontSize: 18, textAlign: 'center' },
});
