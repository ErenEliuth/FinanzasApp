import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
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
};

const CARD_COLORS = ['#1E293B', '#6366F1', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];

export default function CardsScreen() {
    const isFocused = useIsFocused();
    const router = useRouter();
    const { user, theme, isHidden } = useAuth();
    const isDark = theme === 'dark';

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

    // Payment modal state
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [accounts, setAccounts] = useState<string[]>(['Efectivo']);
    const [selectedAccount, setSelectedAccount] = useState('Efectivo');

    const colors = {
        bg: isDark ? '#0F172A' : '#F4F6FF',
        card: isDark ? '#1E293B' : '#FFFFFF',
        text: isDark ? '#F1F5F9' : '#1E293B',
        sub: isDark ? '#94A3B8' : '#64748B',
        border: isDark ? '#334155' : '#E2E8F0',
    };

    const formatInput = (text: string) => {
        if (Platform.OS === 'web') return text.replace(/[^0-9]/g, '');
        const numericValue = text.replace(/\D/g, '');
        if (!numericValue) return '';
        return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const fmt = (n: number) =>
        isHidden
            ? '****'
            : new Intl.NumberFormat('es-CO', {
                style: 'currency', currency: 'COP', minimumFractionDigits: 0
              }).format(n);

    const loadData = async () => {
        try {
            // Load cards configuration from AsyncStorage
            const storedCards = await AsyncStorage.getItem(`@cards_${user?.id}`);
            const parsedCards: CreditCard[] = storedCards ? JSON.parse(storedCards) : [];
            setCards(parsedCards);

            // Load extra accounts to pay from
            const storedAccounts = await AsyncStorage.getItem('@custom_accounts');
            if (storedAccounts) setAccounts(['Efectivo', ...JSON.parse(storedAccounts)]);
            else setAccounts(['Efectivo']);

            // Filter out the actual card accounts to avoid a card paying itself
            const extra = storedAccounts ? JSON.parse(storedAccounts) : [];
            const nonCardAccounts = ['Efectivo', ...extra].filter(
                acc => !parsedCards.some((c: CreditCard) => c.name === acc)
            );
            setAccounts(nonCardAccounts);

            // Load balances perfectly by querying transactions where account === card.name
            if (parsedCards.length > 0) {
                const { data: txs, error } = await supabase
                    .from('transactions')
                    .select('amount, type, account')
                    .eq('user_id', user?.id)
                    .in('account', parsedCards.map((c: CreditCard) => c.name));

                if (error) throw error;

                const balances: Record<string, number> = {};
                parsedCards.forEach(c => balances[c.name] = 0);

                // If type === 'expense' with a card, the debt increases.
                // If type === 'transfer' towards a card, the debt decreases.
                // If type === 'income' to a card (payment), the debt decreases.
                txs?.forEach(tx => {
                    const amt = Number(tx.amount || 0);
                    if (tx.type === 'expense') {
                        balances[tx.account] += amt; // Spends increase debt
                    } else if (tx.type === 'income' || tx.type === 'transfer') {
                        balances[tx.account] -= amt; // Payments decrease debt
                    }
                });

                // Prevent negative debt visually if overpaid
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

    const handleAddCard = async () => {
        Keyboard.dismiss();
        const limit = parseFloat(newLimit.replace(/\./g, ''));
        const cut = parseInt(newCutDay, 10);
        const due = parseInt(newDueDay, 10);

        if (!newName.trim() || isNaN(limit) || limit <= 0 || isNaN(cut) || isNaN(due)) {
            if (Platform.OS === 'web') {
                window.alert('Por favor llena todos los campos correctamente.');
            } else {
                Alert.alert('Error', 'Por favor llena todos los campos correctamente.');
            }
            return;
        }
        if (cut < 1 || cut > 31 || due < 1 || due > 31) {
            if (Platform.OS === 'web') {
                window.alert('Los días deben estar entre 1 y 31.');
            } else {
                Alert.alert('Día Inválido', 'Los días deben estar entre 1 y 31.');
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
        };

        const updatedCards = [...cards, newCard];
        setCards(updatedCards);
        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updatedCards));

        // Add this card to global custom accounts so user can select it when buying something
        try {
            const storedParams = await AsyncStorage.getItem('@custom_accounts');
            const customAccounts = storedParams ? JSON.parse(storedParams) : [];
            if (!customAccounts.includes(newCard.name)) {
                await AsyncStorage.setItem('@custom_accounts', JSON.stringify([...customAccounts, newCard.name]));
            }
        } catch (e) { }

        setAddModalVisible(false);
        setNewName(''); setNewLimit(''); setNewCutDay(''); setNewDueDay(''); setNewBrand('visa');
        loadData();
    };

    const handleDeleteCard = async (card: CreditCard) => {
        if (Platform.OS === 'web') {
            if (window.confirm(`¿Estás seguro de eliminar la tarjeta ${card.name}? No podrás recuperarla, pero tus transacciones se mantendrán.`)) {
                const updated = cards.filter(c => c.id !== card.id);
                setCards(updated);
                await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
                try {
                    const storedParams = await AsyncStorage.getItem('@custom_accounts');
                    const customAccounts = storedParams ? JSON.parse(storedParams) : [];
                    const filteredAccounts = customAccounts.filter((a: string) => a !== card.name);
                    await AsyncStorage.setItem('@custom_accounts', JSON.stringify(filteredAccounts));
                } catch(e) {}
                loadData();
            }
            return;
        }
        Alert.alert(
            'Eliminar Tarjeta',
            `¿Estás seguro de eliminar la tarjeta ${card.name}? No podrás recuperarla, pero tus transacciones se mantendrán.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        const updated = cards.filter(c => c.id !== card.id);
                        setCards(updated);
                        await AsyncStorage.setItem(`@cards_${user?.id}`, JSON.stringify(updated));
                        
                        // Optionally remove from custom accounts
                        try {
                            const storedParams = await AsyncStorage.getItem('@custom_accounts');
                            const customAccounts = storedParams ? JSON.parse(storedParams) : [];
                            const filteredAccounts = customAccounts.filter((a: string) => a !== card.name);
                            await AsyncStorage.setItem('@custom_accounts', JSON.stringify(filteredAccounts));
                        } catch(e) {}

                        loadData();
                    }
                }
            ]
        );
    };

    const handlePayCard = async () => {
        if (!selectedCard) return;
        const pay = parseFloat(payAmount.replace(/\./g, ''));
        if (isNaN(pay) || pay <= 0) return;

        const debt = cardBalances[selectedCard.name] || 0;
        const actualPay = Math.min(pay, debt);

        try {
            // Un pago de tarjeta de crédito es una SALIDA desde la cuenta de ahorros (o Efectivo)
            // Hacia la tarjeta de crédito. Registramos como tipo "transfer" pero aquí para que la app sepa
            // que fue un gasto desde la cuenta bancaria principal, se puede registrar un Expense.
            
            // To be accurate for balance: Effectivo goes down (-= actualPay). Credit card balance goes up (payment decreases debt).
            // Let's create an expense from SelectedAccount. And ALSO an income to the Credit Card.
            
            const { error: txError1 } = await supabase.from('transactions').insert([{
                user_id: user?.id,
                amount: actualPay,
                type: 'expense',
                category: 'Pago de Tarjeta',
                description: `Pago a ${selectedCard.name}`,
                account: selectedAccount,
                date: new Date().toISOString()
            }]);

            const { error: txError2 } = await supabase.from('transactions').insert([{
                user_id: user?.id,
                amount: actualPay,
                type: 'income',
                category: 'Pago Recibido',
                description: `Abono desde ${selectedAccount}`,
                account: selectedCard.name,
                date: new Date().toISOString()
            }]);

            if (txError1 || txError2) throw new Error('Error guardando transacciones');

            setPayAmount('');
            setPayModalVisible(false);
            setSelectedCard(null);
            loadData();
        } catch (e) {
            console.error('Payment error', e); 
        }
    };

    const getDaysLeft = (targetDay: number) => {
        const today = new Date();
        const currentM = today.getMonth();
        const currentY = today.getFullYear();
        let targetDate = new Date(currentY, currentM, targetDay);
        
        if (today.getDate() > targetDay) {
            // Already passed this month, moves to next month
            targetDate = new Date(currentY, currentM + 1, targetDay);
        }
        
        const diffTime = targetDate.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Tarjetas de Crédito</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
                    <MaterialIcons name="add" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {cards.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="card-outline" size={64} color={colors.sub} style={{ opacity: 0.5, marginBottom: 16 }} />
                        <Text style={[styles.emptyTitle, { color: colors.text }]}>Sin Tarjetas</Text>
                        <Text style={[styles.emptySubtitle, { color: colors.sub }]}>
                            Mantén el control exacto de tus límites, fechas de corte y pagos de tus tarjetas de crédito agregándolas aquí.
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
                            <TouchableOpacity 
                                key={card.id} 
                                style={[styles.cardWrapper, { shadowColor: card.color }]}
                                activeOpacity={0.9}
                                onLongPress={() => handleDeleteCard(card)}
                            >
                                <View style={[styles.cardFace, { backgroundColor: card.color }]}>
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardBank}>{card.name}</Text>
                                        <Ionicons 
                                            name={card.brand === 'visa' ? 'logo-venmo' : card.brand === 'mastercard' ? 'logo-usd' : card.brand === 'amex' ? 'cube' : 'card'} 
                                            size={20} 
                                            color="rgba(255,255,255,0.6)" 
                                        />
                                    </View>
                                    
                                    <View style={styles.cardBody}>
                                        <Text style={styles.cardLabel}>Deuda Actual</Text>
                                        <Text style={styles.cardDebt}>{fmt(debt)}</Text>
                                    </View>
                                    
                                    <View style={styles.cardFooter}>
                                        <View>
                                            <Text style={styles.cardLabel}>Cupo Disponible</Text>
                                            <Text style={styles.cardLimit}>{fmt(available)}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.cardLabel}>Corte: {card.cutDay}</Text>
                                            <Text style={styles.cardSmallText}>Paga el {card.dueDay}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Reminders & Actions */}
                                <View style={[styles.cardActionsRow, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderTopWidth: 0 }]}>
                                    <View style={styles.notificationArea}>
                                        {isWarningPay ? (
                                            <View style={styles.alertNotice}>
                                                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                                                <Text style={styles.alertNoticeText}>¡Paga en {daysToPay} días!</Text>
                                            </View>
                                        ) : debt > 0 ? (
                                            <View style={styles.infoNotice}>
                                                <Ionicons name="information-circle" size={16} color="#6366F1" />
                                                <Text style={[styles.infoNoticeText, { color: colors.sub }]}>Al corte en {daysToCut} días</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.infoNotice}>
                                                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                                                <Text style={[styles.infoNoticeText, { color: '#10B981' }]}>Sin deuda</Text>
                                            </View>
                                        )}
                                    </View>
                                    
                                    <TouchableOpacity 
                                        style={[styles.payBtn, debt === 0 && { opacity: 0.5 }]} 
                                        disabled={debt === 0}
                                        onPress={() => { setSelectedCard(card); setPayModalVisible(true); }}
                                    >
                                        <Text style={styles.payBtnText}>Pagar</Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ADDCARD MODAL */}
            <Modal visible={addModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
                        <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva Tarjeta de Crédito</Text>
                                    
                                    <TextInput style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                                        placeholder="Nombre (ej. Visa Bancolombia)" placeholderTextColor={colors.sub}
                                        value={newName} onChangeText={setNewName} />

                                    <TextInput style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                                        placeholder="Cupo Total Máximo ($)" placeholderTextColor={colors.sub}
                                        keyboardType="decimal-pad" value={newLimit} onChangeText={(text) => setNewLimit(formatInput(text))} />

                                    <View style={{ flexDirection: 'row', gap: 12 }}>
                                        <TextInput style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border, flex: 1 }]}
                                            placeholder="Día de Corte (1-31)" placeholderTextColor={colors.sub}
                                            keyboardType="number-pad" value={newCutDay} onChangeText={setNewCutDay} />
                                        <TextInput style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border, flex: 1 }]}
                                            placeholder="Día de Pago Máx." placeholderTextColor={colors.sub}
                                            keyboardType="number-pad" value={newDueDay} onChangeText={setNewDueDay} />
                                    </View>

                                    <Text style={[styles.labelSection, { color: colors.sub }]}>COLOR DE TARJETA</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                        {CARD_COLORS.map(c => (
                                            <TouchableOpacity 
                                                key={c} 
                                                style={[styles.colorCircle, { backgroundColor: c }, newColor === c && styles.colorCircleActive]} 
                                                onPress={() => setNewColor(c)} 
                                            />
                                        ))}
                                    </ScrollView>

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: colors.bg }]} onPress={() => setAddModalVisible(false)}>
                                            <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleAddCard}>
                                            <Text style={styles.modalBtnConfirmText}>Crear Tarjeta</Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* PAY MODAL */}
            <Modal visible={payModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}>
                            <TouchableWithoutFeedback>
                                <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                                    <Text style={[styles.modalTitle, { color: colors.text }]}>Pagar {selectedCard?.name}</Text>
                                    <Text style={[styles.modalHint, { color: colors.sub }]}>Deuda total actual: {fmt(cardBalances[selectedCard?.name || ''] || 0)}</Text>

                                    <TextInput style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                                        placeholder="Valor a pagar" placeholderTextColor={colors.sub}
                                        keyboardType="decimal-pad" value={payAmount} onChangeText={(text) => setPayAmount(formatInput(text))}
                                        autoFocus />

                                    <Text style={[styles.labelSection, { color: colors.sub, marginTop: 10 }]}>MÉTODO DE PAGO (CAUSA LA SALIDA)</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                                        {accounts.map(acc => (
                                            <TouchableOpacity 
                                                key={acc} 
                                                style={[
                                                    styles.accPill, 
                                                    { borderColor: colors.border },
                                                    selectedAccount === acc && { borderColor: '#6366F1', backgroundColor: 'rgba(99, 102, 241, 0.1)' }
                                                ]}
                                                onPress={() => setSelectedAccount(acc)}
                                            >
                                                <Text style={{ fontWeight: '600', color: selectedAccount === acc ? '#6366F1' : colors.text }}>
                                                    {acc}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <View style={styles.modalBtns}>
                                        <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: colors.bg }]} onPress={() => setPayModalVisible(false)}>
                                            <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.modalBtnConfirm} onPress={handlePayCard}>
                                            <Text style={styles.modalBtnConfirmText}>Confirmar Pago</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingTop: Platform.OS === 'android' ? 50 : 60 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
    headerTitle: { fontSize: 28, fontWeight: '800' },
    addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
    
    scrollContent: { padding: 20, paddingBottom: 100 },
    
    emptyState: { alignItems: 'center', marginTop: 100, paddingHorizontal: 20 },
    emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

    cardWrapper: { marginBottom: 24 },
    cardFace: {
        borderRadius: 20, padding: 24, paddingBottom: 20,
        height: 200, justifyContent: 'space-between',
        shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardBank: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
    cardBody: {},
    cardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
    cardDebt: { color: '#FFF', fontSize: 32, fontWeight: '800' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    cardLimit: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    cardSmallText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

    cardActionsRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
        marginTop: -10, paddingTop: 20 
    },
    notificationArea: { flex: 1 },
    alertNotice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    alertNoticeText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
    infoNotice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoNoticeText: { fontWeight: '600', fontSize: 13 },
    payBtn: { backgroundColor: '#64748B', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 12 },
    payBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: height * 0.9 },
    modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
    modalHint: { fontSize: 14, marginBottom: 24 },
    modalInput: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, marginBottom: 12 },
    
    labelSection: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12, marginLeft: 4 },
    colorCircle: { width: 44, height: 44, borderRadius: 22, marginRight: 12, borderWidth: 3, borderColor: 'transparent' },
    colorCircleActive: { borderColor: '#FFF' },
    
    accPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },

    modalBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
    modalBtnCancel: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
    modalBtnCancelText: { fontWeight: '700', fontSize: 16 },
    modalBtnConfirm: { flex: 1, backgroundColor: '#6366F1', padding: 16, borderRadius: 16, alignItems: 'center' },
    modalBtnConfirmText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
});
