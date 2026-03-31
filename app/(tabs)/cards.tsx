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
};

const CARD_COLORS = ['#2D5A3D', '#4A7C59', '#1E293B', '#8B5CF6', '#F59E0B', '#EF4444'];

export default function CardsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, currency, rates, isHidden } = useAuth();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [cards, setCards] = useState<CreditCard[]>([]);
    const [cardBalances, setCardBalances] = useState<Record<string, number>>({});
    const [cardTransactions, setCardTransactions] = useState<Record<string, any[]>>({});
    
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [newLimit, setNewLimit] = useState('');
    const [newCutDay, setNewCutDay] = useState('');
    const [newDueDay, setNewDueDay] = useState('');
    const [newBrand, setNewBrand] = useState<'visa' | 'mastercard' | 'amex' | 'other'>('visa');
    const [newColor, setNewColor] = useState(CARD_COLORS[0]);

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
        };

        const updated = [...cards, newCard];
        setCards(updated);
        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
        
        const storedParams = await AsyncStorage.getItem('@custom_accounts');
        const customAccounts = storedParams ? JSON.parse(storedParams) : [];
        if (!customAccounts.includes(newCard.name)) {
            await AsyncStorage.setItem('@custom_accounts', JSON.stringify([...customAccounts, newCard.name]));
        }

        setAddModalVisible(false);
        setNewName(''); setNewLimit(''); setNewCutDay(''); setNewDueDay('');
        loadData();
    };

    const handleDeleteCard = (card: CreditCard) => {
        Alert.alert('Eliminar Tarjeta', `¿Eliminar ${card.name}?`, [
            { text: 'No' },
            { text: 'Sí', style: 'destructive', onPress: async () => {
                const updated = cards.filter(c => c.id !== card.id);
                setCards(updated);
                await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
                loadData();
            }}
        ]);
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

            {/* Selector de Tarjetas */}
            <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                    {cards.map(c => (
                        <TouchableOpacity key={c.id} style={[styles.tab, activeTab === c.id && { backgroundColor: c.color }]} onPress={() => setActiveTab(c.id)}>
                            <Text style={[styles.tabTxt, { color: activeTab === c.id ? '#FFF' : colorsNav.sub }]}>{c.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {currentCard ? (
                    <View style={{ gap: 20 }}>
                        {/* Visa/Mastercard Design Card */}
                        <TouchableOpacity 
                            style={[styles.cardFace, { backgroundColor: currentCard.color }]}
                            onLongPress={() => handleDeleteCard(currentCard)}
                            activeOpacity={0.9}
                        >
                            <View style={styles.cardInfo}>
                                <Text style={styles.cardBank}>{currentCard.name.toUpperCase()}</Text>
                                <Text style={styles.cardBrand}>{currentCard.brand.toUpperCase()}</Text>
                            </View>
                            <View>
                                <Text style={styles.cardLabel}>DEUDA ACTUAL</Text>
                                <Text style={styles.cardDebt}>{fmt(cardBalances[currentCard.name] || 0)}</Text>
                            </View>
                            <View style={styles.cardRow}>
                                <View>
                                    <Text style={styles.cardLabel}>DISPONIBLE</Text>
                                    <Text style={styles.cardLimit}>{fmt(currentCard.limit - (cardBalances[currentCard.name] || 0))}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <View style={{ flexDirection: 'row', gap: 15 }}>
                                        <View>
                                            <Text style={styles.cardLabel}>CORTE</Text>
                                            <Text style={styles.cardSmallTxt}>Día {currentCard.cutDay}</Text>
                                        </View>
                                        <View>
                                            <Text style={styles.cardLabel}>PAGO</Text>
                                            <Text style={styles.cardSmallTxt}>Día {currentCard.dueDay}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* Instructional Message */}
                        <View style={[styles.infoBox, { backgroundColor: colorsNav.accent + '15' }]}>
                            <MaterialIcons name="info-outline" size={20} color={colorsNav.accent} />
                            <Text style={[styles.infoTxt, { color: colorsNav.accent }]}>
                                Para que una compra con esta tarjeta se refleje aquí, ve al menú de <Text style={{ fontWeight: '800' }}>Gastos</Text> y selecciónala como cuenta de pago.
                            </Text>
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
                            (cardTransactions[currentCard.name] || []).map(tx => (
                                <View key={tx.id} style={[styles.txRow, { borderBottomColor: colorsNav.border }]}>
                                    <View style={[styles.txIcon, { backgroundColor: tx.type === 'expense' ? '#EF444415' : '#4CAF5015' }]}>
                                        <MaterialIcons name={tx.type === 'expense' ? 'remove' : 'add'} size={18} color={tx.type === 'expense' ? '#EF4444' : '#4CAF50'} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.txName, { color: colorsNav.text }]}>{tx.description || tx.category}</Text>
                                        <Text style={[styles.txDate, { color: colorsNav.sub }]}>{new Date(tx.date).toLocaleDateString()}</Text>
                                    </View>
                                    <Text style={[styles.txAmt, { color: tx.type === 'expense' ? '#EF4444' : '#4CAF50' }]}>
                                        {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount)}
                                    </Text>
                                </View>
                            ))
                        )}
                    </View>
                ) : (
                    <View style={styles.empty}>
                        <MaterialIcons name="credit-card-off" size={60} color={colorsNav.sub} style={{ opacity: 0.3 }} />
                        <Text style={[styles.emptyTxt, { color: colorsNav.sub }]}>Agrega una tarjeta para comenzar</Text>
                    </View>
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            <Modal visible={addModalVisible} transparent animationType="slide">
                <View style={styles.overlay}>
                    <View style={[styles.modal, { backgroundColor: colorsNav.card }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nueva Tarjeta</Text>
                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Nombre" placeholderTextColor={colorsNav.sub} value={newName} onChangeText={setNewName} />
                        <TextInput style={[styles.input, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Límite" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newLimit} onChangeText={handleLimitChange} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput style={[styles.input, { flex: 1, backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Día Corte" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newCutDay} onChangeText={setNewCutDay} />
                            <TextInput style={[styles.input, { flex: 1, backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]} placeholder="Día Pago" placeholderTextColor={colorsNav.sub} keyboardType="numeric" value={newDueDay} onChangeText={setNewDueDay} />
                        </View>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => setAddModalVisible(false)}><Text style={{ color: colorsNav.text }}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleAddCard}><Text style={{ color: '#FFF', fontWeight: '800' }}>Crear</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
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

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50 },
    headerTitle: { fontSize: 28, fontWeight: '900' },
    headerSub: { fontSize: 13, marginTop: 2 },
    addBtn: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    tabScroll: { paddingHorizontal: 20, gap: 10, marginBottom: 10 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
    tabTxt: { fontWeight: '800', fontSize: 13 },
    scroll: { padding: 20 },
    cardFace: { borderRadius: 28, padding: 24, height: 210, justifyContent: 'space-between', elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 15 },
    cardInfo: { flexDirection: 'row', justifyContent: 'space-between' },
    cardBank: { color: '#FFF', fontWeight: '900', letterSpacing: 1 },
    cardBrand: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', fontSize: 11 },
    cardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    cardDebt: { color: '#FFF', fontSize: 32, fontWeight: '900' },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    cardLimit: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    cardSmallTxt: { color: '#FFF', fontSize: 14, fontWeight: '800' },
    infoBox: { flexDirection: 'row', gap: 12, padding: 18, borderRadius: 20, alignItems: 'center' },
    infoTxt: { flex: 1, fontSize: 13, lineHeight: 18 },
    payBtnLarge: { flexDirection: 'row', gap: 10, padding: 20, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    payBtnTxtLarge: { color: '#FFF', fontWeight: '900', fontSize: 14 },
    secTitle: { fontSize: 14, fontWeight: '900', marginTop: 10 },
    txRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1 },
    txIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    txName: { fontSize: 14, fontWeight: '700' },
    txDate: { fontSize: 11, marginTop: 2 },
    txAmt: { fontSize: 15, fontWeight: '800' },
    emptyMovements: { padding: 40, alignItems: 'center' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modal: { borderRadius: 32, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
    input: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
    modalFooter: { flexDirection: 'row', gap: 12, marginTop: 10 },
    mBtn: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
    accPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#DDD' },
    empty: { padding: 80, alignItems: 'center', gap: 20 },
    emptyTxt: { fontWeight: '700', fontSize: 16 },
});
