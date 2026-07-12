import { useAuth } from '@/utils/auth';
import { syncUp } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
// Eliminado: MagicAuraButton
import { formatCurrency, getCurrencyInfo, convertCurrency, convertToBase, CURRENCIES, formatInputDisplay, parseInputToNumber } from '@/utils/currency';
import { getLocalISOString } from '@/utils/dateUtils';
import React, { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  Alert,
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
  useColorScheme
} from 'react-native';

// ─── Categorías fijas por defecto ───────────────────────────────────────────
const DEFAULT_INCOME_CATS = ['Sueldo', 'Pago', 'Nómina'];
const DEFAULT_EXPENSE_CATS = ['Comida', 'Transporte', 'Salud', 'Hogar'];

// Sugeridas para cuando el usuario quiere crear nuevas
const SUGGESTED_EXTRAS = [
  { label: 'Recibos', icon: 'receipt', type: 'expense' },
  { label: 'Gimnasio', icon: 'fitness-center', type: 'expense' },
  { label: 'Entretenimiento', icon: 'movie', type: 'expense' },
  { label: 'Ropa', icon: 'checkroom', type: 'expense' },
  { label: 'Educación', icon: 'school', type: 'expense' },
  { label: 'Venta', icon: 'attach-money', type: 'income' },
  { label: 'Regalo', icon: 'card-giftcard', type: 'income' },
  { label: 'Inversión', icon: 'trending-up', type: 'income' },
];

import { SYNC_KEYS } from '@/utils/sync';

type TxType = 'income' | 'expense' | 'ahorro' | 'transfer';

export default function AddTransactionScreen() {
  const isFocused = useIsFocused();
  const [type, setType] = useState<TxType>('income');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('Efectivo');
  const [destAccount, setDestAccount] = useState('');
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [installments, setInstallments] = useState('1');
  const [interestRate, setInterestRate] = useState('0');
  const [selectedCardAvailable, setSelectedCardAvailable] = useState<number | null>(null);
  const [txDate, setTxDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [selectedCardLimit, setSelectedCardLimit] = useState<number | null>(null);
  
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (isFocused) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setAmount('');
      setDescription('');
      setCategory('');
      setDestAccount('');
      setInstallments('1');
      const d = new Date();
      setTxDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
  }, [isFocused]);

  // ─── Sugerencia Inteligente de Ahorro ───
  const [showAiModal, setShowAiModal] = useState(false);
  const [suggestedAmount, setSuggestedAmount] = useState(0);
  const [suggestedPct, setSuggestedPct] = useState(0);
  const [aiIncomeMessage, setAiIncomeMessage] = useState('');
  const [incomeJustSaved, setIncomeJustSaved] = useState(0);
  const [availableGoals, setAvailableGoals] = useState<{id: number; name: string; current_amount: number; target_amount: number}[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<number | null>(null);
  const [smartSavingsPref, setSmartSavingsPref] = useState<'enabled' | 'disabled' | 'unset'>('unset');
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);

  const router = useRouter();
  const { user, currency, rates, isHidden, cards, customAccounts, refreshConfig } = useAuth();
  const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);
  const colorsNav = useThemeColors();

  const typeColor =
    type === 'income' ? colorsNav.accent :
      type === 'ahorro' ? '#8B5CF6' :
        type === 'transfer' ? '#F59E0B' : '#EF4444';

  // Cargar datos guardados
  useEffect(() => {
    if (!user?.id) return;
    const loadData = async () => {
      try {
        const [rawCats, rawPref] = await Promise.all([
          AsyncStorage.getItem(SYNC_KEYS.CATEGORIES(user.id)),
          AsyncStorage.getItem(SYNC_KEYS.SMART_SAVINGS(user.id)),
        ]);
        if (rawCats) setCustomCategories(JSON.parse(rawCats));
        if (rawPref) setSmartSavingsPref(rawPref as any);
      } catch (e) {
        console.error('Error al cargar datos persistidos:', e);
      }
    };
    loadData();
  }, [user]);

  useEffect(() => {
    if (!user?.id || !isFocused) return;
    const cardNames = cards.map(c => c.name);
    if (!cardNames.includes(account)) {
      setSelectedCardAvailable(null);
      setSelectedCardLimit(null);
      return;
    }
    
    const fetchCardBalance = async () => {
      try {
        const { data: txs } = await supabase
          .from('transactions')
          .select('amount, type')
          .eq('user_id', user.id)
          .eq('account', account);
          
        const matchingCard = cards.find(c => c.name === account);
        if (matchingCard) {
          let debt = 0;
          txs?.forEach(tx => {
            const amt = Number(tx.amount || 0);
            if (tx.type === 'expense') debt += amt;
            else if (tx.type === 'income' || tx.type === 'transfer') debt -= amt;
          });
          if (debt < 0) debt = 0;
          setSelectedCardAvailable(matchingCard.limit - debt);
          setSelectedCardLimit(matchingCard.limit);
        }
      } catch (e) {
        console.error('Error fetching card balance for chip:', e);
      }
    };
    
    fetchCardBalance();
  }, [account, isFocused, cards, user]);

  const persistCustomCategories = async (cats: string[]) => {
    if (!user?.id) return;
    setCustomCategories(cats);
    await AsyncStorage.setItem(SYNC_KEYS.CATEGORIES(user.id), JSON.stringify(cats));
    syncUp(user.id);
  };

  const persistCustomAccounts = async (accs: string[]) => {
    if (!user?.id) return;
    setAccount(accs[accs.length - 1] || 'Efectivo');
    await AsyncStorage.setItem(SYNC_KEYS.ACCOUNTS(user.id), JSON.stringify(accs));
    await syncUp(user.id);
    await refreshConfig();
  };

  const handleAddCustomCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const all = [...DEFAULT_INCOME_CATS, ...DEFAULT_EXPENSE_CATS, ...customCategories];
    if (all.includes(trimmed)) {
      Alert.alert('Ya existe', 'Esa categoría ya está en tu lista.');
      return;
    }
    const updated = [...customCategories, trimmed];
    await persistCustomCategories(updated);
    setCategory(trimmed);
    setNewCategoryName('');
    setModalVisible(false);
  };

  const handleDeleteCustomCategory = (cat: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Quitar la categoría "${cat}"?`)) {
        (async () => {
          const updated = customCategories.filter(c => c !== cat);
          await persistCustomCategories(updated);
          if (category === cat) setCategory('');
        })();
      }
      return;
    }
    Alert.alert('Eliminar', `¿Quitar la categoría "${cat}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const updated = customCategories.filter(c => c !== cat);
          await persistCustomCategories(updated);
          if (category === cat) setCategory('');
        }
      }
    ]);
  };

  const handleAddCustomAccount = async () => {
    const trimmed = newAccountName.trim();
    if (!trimmed) return;
    const all = ['Efectivo', ...customAccounts];
    if (all.includes(trimmed)) {
      Alert.alert('Ya existe', 'Esa cuenta ya está en tu lista.');
      return;
    }
    const updated = [...customAccounts, trimmed];
    await persistCustomAccounts(updated);
    setAccount(trimmed);
    setNewAccountName('');
    setAccountModalVisible(false);
  };

  const handleDeleteCustomAccount = (acc: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Quitar la cuenta "${acc}"?`)) {
        (async () => {
          try {
            await supabase.from('transactions').delete().eq('user_id', user?.id).eq('account', acc);
            const updated = customAccounts.filter(a => a !== acc);
            await persistCustomAccounts(updated);
            if (account === acc) setAccount('Efectivo');
          } catch (error) {
            console.error('Error deleting account transactions:', error);
          }
        })();
      }
      return;
    }
    Alert.alert('Eliminar', `¿Quitar la cuenta "${acc}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('transactions').delete().eq('user_id', user?.id).eq('account', acc);
            const updated = customAccounts.filter(a => a !== acc);
            await persistCustomAccounts(updated);
            if (account === acc) setAccount('Efectivo');
          } catch (error) {
            console.error('Error deleting account transactions:', error);
            Alert.alert('Error', 'No se pudieron eliminar los movimientos de la cuenta.');
          }
        }
      }
    ]);
  };

  const handleAmountChange = (text: string) => {
    setAmount(formatInputDisplay(text, currency));
  };

  const handleSave = async () => {
    const typedVal = parseInputToNumber(amount, currency);
    const parsed = convertToBase(typedVal, currency, rates);
    if (isNaN(parsed) || parsed <= 0 || isSaving) return;

    setIsSaving(true);

    // Bloque de transferencia — primero, antes de la validación de saldo
    if (type === 'transfer') {
      if (!destAccount || destAccount === account) {
        Alert.alert('Error', 'Selecciona una cuenta de destino diferente.');
        setIsSaving(false);
        return;
      }
      try {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('amount, type')
          .eq('user_id', user?.id)
          .eq('account', account);
        
        if (!txErr && txs) {
          const balance = txs.reduce((acc, curr) => {
            return curr.type === 'income' ? acc + curr.amount : acc - curr.amount;
          }, 0);

          if (balance < parsed) {
            Alert.alert(
              'Saldo Insuficiente',
              `No tienes fondos suficientes en "${account}".\n\nDisponible: ${fmt(balance)}\nRequerido: ${fmt(parsed)}`
            );
            setIsSaving(false);
            return;
          }
        }
      } catch (e) { console.error('Error validando saldo en transferencia:', e); }

      const desc = description.trim() || `Transferencia ${account} → ${destAccount}`;
      try {
        const { error: err1 } = await supabase.from('transactions').insert([{
          user_id: user?.id,
          type: 'expense',
          amount: parsed,
          description: desc,
          category: 'Transferencia',
          account: account,
          date: getLocalISOString(),
        }]);
        if (err1) throw new Error(err1.message);

        const { error: err2 } = await supabase.from('transactions').insert([{
          user_id: user?.id,
          type: 'income',
          amount: parsed,
          description: desc,
          category: 'Transferencia',
          account: destAccount,
          date: getLocalISOString(),
        }]);
        if (err2) throw new Error(err2.message);

        setAmount(''); setDescription(''); setDestAccount('');
        if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
      } catch (e: any) {
        console.error('Error transfiriendo:', e);
        Alert.alert('Error al transferir', e?.message || 'No se pudo guardar la transferencia. Intenta nuevamente.');
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const cardNames = cards.map(c => c.name);

    // Validación de saldo de tarjeta de crédito
    if (type === 'expense' && cardNames.includes(account)) {
      try {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('amount, type')
          .eq('user_id', user?.id)
          .eq('account', account);
        
        if (!txErr && txs) {
          let currentDebt = 0;
          txs.forEach(tx => {
            const amt = Number(tx.amount || 0);
            if (tx.type === 'expense') currentDebt += amt;
            else if (tx.type === 'income' || tx.type === 'transfer') currentDebt -= amt;
          });
          if (currentDebt < 0) currentDebt = 0;

          const selectedCard = cards.find(c => c.name === account);
          if (selectedCard) {
            const totalRequiredDebt = currentDebt + parsed;
            if (totalRequiredDebt > selectedCard.limit) {
              const available = selectedCard.limit - currentDebt;
              Alert.alert(
                'Límite de Crédito Superado',
                `⚠️ Límite de crédito insuficiente en "${account}".\n\nDisponible: ${fmt(available)}\nIntentas usar: ${fmt(parsed)}`
              );
              setIsSaving(false);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Error validando límite de tarjeta de crédito:', e);
      }
    }

    // Validación de saldo solo para gastos normales (no transferencias)
    if (type !== 'income' && !cardNames.includes(account)) {
      try {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('amount, type')
          .eq('user_id', user?.id)
          .eq('account', account);
        
        if (!txErr && txs) {
          const balance = txs.reduce((acc, curr) => {
            return curr.type === 'income' ? acc + curr.amount : acc - curr.amount;
          }, 0);

          if (balance < parsed) {
            Alert.alert(
              'Saldo Insuficiente',
              `No tienes fondos suficientes en "${account}".\n\nDisponible: ${fmt(balance)}\nRequerido: ${fmt(parsed)}`
            );
            setIsSaving(false);
            return;
          }
        }
      } catch (e) { console.error('Error validando saldo:', e); }
    }

    const dbType = type === 'income' ? 'income' : 'expense';
    const dbCategory = type === 'ahorro' ? 'Ahorro' : (category || (type === 'income' ? 'Ingreso' : 'General'));
    
    // Formatear descripción con info de cuotas si aplica
    let finalDescription = description.trim() || dbCategory;
    const isCreditCard = cardNames.includes(account);
    const instNum = parseInt(installments, 10);
    const rate = parseFloat(interestRate) || 0;
    
    if (type === 'expense' && isCreditCard && instNum > 1) {
        finalDescription = `[CUOTAS:${instNum}:RATE:${rate}] ${finalDescription}`;
    }

    const desc = finalDescription;

    // Validate and use the custom date if provided
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const finalDate = dateRegex.test(txDate) ? txDate : getLocalISOString().split('T')[0];

    try {
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: dbType, amount: parsed, description: desc, category: dbCategory, account: account, date: finalDate,
      }]);
      if (error) throw error;

      if (type === 'income') {
        try {
          const { data: allTx } = await supabase.from('transactions').select('amount, type, category').eq('user_id', user?.id);
          const { data: allDebts } = await supabase.from('debts').select('value, paid').eq('user_id', user?.id);
          const { data: goalsData } = await supabase.from('goals').select('id, name, current_amount, target_amount').eq('user_id', user?.id);
          const storedInterests = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user?.id ?? ''));
          const iMap = storedInterests ? JSON.parse(storedInterests) : {};
          const efGoal = goalsData?.find(g => iMap[g.id]?.is_emergency_fund);
          
          let totalActive = 0, totalAhorro = 0;
          allTx?.forEach(t => {
            if (t.type === 'income') totalActive += t.amount;
            else {
              if (t.category === 'Ahorro') totalAhorro += t.amount;
              totalActive -= t.amount;
            }
          });
          const debtTotal = allDebts?.reduce((sum, d) => sum + (d.value - d.paid), 0) || 0;
          const realMoney = (totalActive + totalAhorro) - debtTotal;
          const healthPct = (totalActive + totalAhorro) > 0 ? (realMoney / (totalActive + totalAhorro)) * 100 : 0;
          const fundStatus = efGoal && efGoal.target_amount > 0 ? (efGoal.current_amount / efGoal.target_amount) : 0;

          const pct = healthPct >= 70 ? 20 : healthPct >= 40 ? 15 : 10;
          const suggest = Math.round(parsed * (pct / 100));

          let msg = "";
          if (fundStatus < 0.5) {
              msg = `¡Buen ingreso! Por cómo va el mes y viendo que tu fondo de emergencia está bajo, te sugerimos destinar el ${pct}% de este ingreso al fondo. Así estarás más protegido ante imprevistos, pero mantendrás liquidez suficiente para tus gastos. ¡No te quedes sin efectivo para sobrevivir!`;
          } else if (debtTotal > totalActive * 0.5) {
              msg = `¡Ingreso registrado! Notamos que tienes algunas deudas. Destinar el ${pct}% de este dinero a cubrirlas o a tus ahorros te dará mucha más tranquilidad, conservando el resto para tus gastos necesarios del mes.`;
          } else {
              msg = `¡Excelente! Tus finanzas se ven estables. Te recomendamos guardar al menos el ${pct}% de este ingreso para seguir construyendo tu patrimonio, dejándote el resto libre para disfrutar o cubrir tus gastos normales.`;
          }

          setAiIncomeMessage(msg);
          setSuggestedAmount(suggest);
          setSuggestedPct(pct);
          setIncomeJustSaved(parsed);
          
          if (goalsData) {
             setAvailableGoals(goalsData);
             if (efGoal) setSelectedGoalId(efGoal.id);
             else if (goalsData.length > 0) setSelectedGoalId(goalsData[0].id);
          }
          
          if (smartSavingsPref !== 'disabled') {
              setShowAiModal(true);
          } else {
              if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
          }
          setIsSaving(false);
          return;
        } catch (e) { console.error('Error calculando sugerencia:', e); }
      }



      setAmount(''); setDescription(''); setCategory('');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    } catch (e) { 
      console.error('Error guardando transacción:', e); 
    } finally {
      setIsSaving(false);
    }
  };



  const handleSaveSavingSuggestion = async () => {
    setIsSaving(true);
    try {
      let desc = 'Ahorro Sugerido Sanctuary';
      const goal = availableGoals.find(g => g.id === selectedGoalId);
      if (goal) desc = `Aporte a fondo: ${goal.name}`;

      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: 'expense', amount: suggestedAmount, description: desc, category: 'Ahorro', account: account, date: getLocalISOString(),
      }]);
      if (error) throw error;
      
      if (goal) {
          await supabase.from('goals').update({ current_amount: goal.current_amount + suggestedAmount }).eq('id', goal.id);
      }
      
      setShowAiModal(false);
      router.replace('/(tabs)');
    } catch (e) {
      console.error('Error guardando ahorro sugerido:', e);
      Alert.alert('Error', 'No se pudo guardar el ahorro.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartSavingsPref = async (enabled: boolean) => {
    if (!user?.id) return;
    const val = enabled ? 'enabled' : 'disabled';
    setSmartSavingsPref(val);
    await AsyncStorage.setItem(SYNC_KEYS.SMART_SAVINGS(user.id), val);
    await syncUp(user.id);
    setShowPreferenceModal(false);
    if (enabled) {
      setShowAiModal(true);
    } else {
      router.back();
    }
  };

  const allCategories = type === 'income'
    ? [...DEFAULT_INCOME_CATS, ...customCategories]
    : type === 'expense'
      ? [...DEFAULT_EXPENSE_CATS, ...customCategories]
      : [];

  return (
    <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
      <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

            <View style={styles.header}>
              <Text style={[styles.title, { color: colorsNav.text }]}>Nueva Transacción</Text>
              <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colorsNav.sub} />
              </TouchableOpacity>
            </View>

            {/* Selector de Tipo (Pills Minimalistas) */}
            <View style={styles.typeListWrap}>
              <View style={[styles.typeList, { backgroundColor: colorsNav.border + '50' }]}>
                {[
                  { id: 'income', label: 'Ingreso', c: colorsNav.accent },
                  { id: 'expense', label: 'Gasto', c: '#EF4444' },
                  { id: 'ahorro', label: 'Ahorro', c: '#8B5CF6' },
                  { id: 'transfer', label: 'Mover', c: '#F59E0B' },
                ].map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.typeItem, type === t.id && { backgroundColor: colorsNav.card, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 }]}
                    onPress={() => {
                      const newType = t.id as TxType;
                      setType(newType);
                      setDescription(newType === 'ahorro' ? 'Ahorro' : '');
                      if (newType !== 'expense' && cards.some(c => c.name === account)) {
                        setAccount('Efectivo');
                      }
                    }}
                  >
                    <Text style={[styles.typeItemText, { color: type === t.id ? t.c : colorsNav.sub }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Monto (Gigante y Transparente) */}
            <View style={styles.amountCard}>
              <Text style={[styles.currSign, { color: typeColor }]}>{CURRENCIES.find(c => c.code === currency)?.symbol || '$'}</Text>
              <TextInput
                style={[styles.amountInput, { color: typeColor }]}
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0"
                placeholderTextColor={colorsNav.sub}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            {/* Formulario (Sin Caja Blanca, Flotante Sobre Fondo) */}
            <View style={styles.form}>
              <View style={[styles.inputContainer, { borderBottomColor: colorsNav.border }]}>
                <TextInput
                  style={[styles.textInput, { color: colorsNav.text }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Descripción (opcional)"
                  placeholderTextColor={colorsNav.sub}
                />
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>Cuenta</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {['Efectivo', ...customAccounts.filter(a => !cards.map(c => c.name).includes(a))].map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[styles.chip, { backgroundColor: account === acc ? typeColor : colorsNav.card }]}
                        onPress={() => {
                            setAccount(acc);
                            setInterestRate('');
                        }}
                        onLongPress={() => customAccounts.includes(acc) && handleDeleteCustomAccount(acc)}
                      >
                      <Text style={[styles.chipText, { color: account === acc ? '#FFF' : colorsNav.text }]}>{acc}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.addChip, { borderColor: colorsNav.border }]} onPress={() => setAccountModalVisible(true)}>
                    <MaterialIcons name="add" size={20} color={colorsNav.sub} />
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {cards.length > 0 && type === 'expense' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>Tarjeta de Crédito</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {cards.map(c => (
                        <TouchableOpacity
                          key={c.name}
                          style={[styles.chip, { backgroundColor: account === c.name ? typeColor : colorsNav.card }]}
                          onPress={() => {
                            setAccount(c.name);
                            setInterestRate(c.interestRate?.toString() || '28');
                          }}
                        >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialIcons name="credit-card" size={14} color={account === c.name ? '#FFF' : colorsNav.text} />
                          <Text style={[styles.chipText, { color: account === c.name ? '#FFF' : colorsNav.text }]}>{c.name}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {selectedCardAvailable !== null && selectedCardLimit !== null && (
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  gap: 6, 
                  backgroundColor: colorsNav.card, 
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                  marginTop: -5,
                  marginBottom: 10,
                  marginLeft: 15
                }}>
                  <Ionicons name="card-outline" size={14} color={colorsNav.accent} />
                  <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '700' }}>
                    Disponible: <Text style={{ color: colorsNav.accent }}>{fmt(selectedCardAvailable)}</Text> de {fmt(selectedCardLimit)}
                  </Text>
                </View>
              )}

              {type !== 'ahorro' && type !== 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>Categoría</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {allCategories.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.chip, { backgroundColor: category === cat ? typeColor : colorsNav.card }]}
                        onPress={() => setCategory(cat)}
                        onLongPress={() => customCategories.includes(cat) && handleDeleteCustomCategory(cat)}
                      >
                        <Text style={[styles.chipText, { color: category === cat ? '#FFF' : colorsNav.text }]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={[styles.addChip, { borderColor: colorsNav.border }]} onPress={() => setModalVisible(true)}>
                      <MaterialIcons name="add" size={20} color={colorsNav.sub} />
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}

              {type === 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>Destino</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {['Efectivo', ...customAccounts.filter(a => !cards.map(c => c.name).includes(a))].filter(a => a !== account).map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[styles.chip, { backgroundColor: destAccount === acc ? typeColor : colorsNav.card }]}
                        onPress={() => setDestAccount(acc)}
                      >
                        <Text style={[styles.chipText, { color: destAccount === acc ? '#FFF' : colorsNav.text }]}>{acc}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
              </View>
              )}

              {/* Selector de Cuotas para Tarjetas */}
              {type === 'expense' && cards.map(c => c.name).includes(account) && (
                <View style={[styles.section, { backgroundColor: colorsNav.card, padding: 18, borderRadius: 24, marginTop: 10, borderWidth: 1, borderColor: colorsNav.border }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.sectionTitle, { color: colorsNav.text, marginLeft: 0, textTransform: 'uppercase', fontSize: 12 }]}>Financiación</Text>
                        <View style={{ backgroundColor: colorsNav.accent + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 11 }}>{installments} {parseInt(installments, 10) === 1 ? 'Cuota' : 'Cuotas'}</Text>
                        </View>
                    </View>
                    
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
                        {['1', '2', '3', '6', '12', '24', '36'].map(num => (
                            <TouchableOpacity 
                                key={num} 
                                style={[styles.instChip, { 
                                    backgroundColor: installments === num ? colorsNav.accent : colorsNav.bg, 
                                    borderColor: colorsNav.border,
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10
                                }]} 
                                onPress={() => setInstallments(num)}
                            >
                                <Text style={{ color: installments === num ? '#FFF' : colorsNav.text, fontWeight: '800', fontSize: 13 }}>{num}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {parseInt(installments, 10) > 1 && (() => {
                        const typedVal = parseInputToNumber(amount, currency) || 0;
                        const p = convertToBase(typedVal, currency, rates);
                        
                        const ea = parseFloat(interestRate) / 100;
                        const mv = Math.pow(1 + ea, 1/12) - 1;
                        const n = parseInt(installments, 10);
                        
                        // Fórmula cuota fija (amortización francesa)
                        const cuota = mv > 0 ? (p * mv) / (1 - Math.pow(1 + mv, -n)) : p / n;
                        const totalReal = cuota * n;

                        return (
                            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colorsNav.border + '50' }}>
                                <View style={{ 
                                    flexDirection: 'row', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    backgroundColor: colorsNav.bg, 
                                    paddingHorizontal: 12, 
                                    paddingVertical: 8, 
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: colorsNav.border,
                                    marginBottom: 12
                                }}>
                                    <View>
                                        <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '800' }}>Tasa de Interés</Text>
                                        <Text style={{ color: colorsNav.sub, fontSize: 10 }}>Efectiva Anual (E.A. %)</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colorsNav.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colorsNav.border }}>
                                        <TextInput 
                                            style={{ color: colorsNav.text, fontWeight: '900', textAlign: 'right', fontSize: 14, minWidth: 35, padding: 0 }}
                                            value={interestRate}
                                            onChangeText={setInterestRate}
                                            keyboardType="decimal-pad"
                                            selectTextOnFocus
                                        />
                                        <Text style={{ color: colorsNav.text, fontWeight: '900', fontSize: 14, marginLeft: 2 }}>%</Text>
                                    </View>
                                </View>
                                
                                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                                    <View style={{ flex: 1, backgroundColor: colorsNav.bg, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colorsNav.border }}>
                                        <Text style={{ color: colorsNav.sub, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Cuota Mensual</Text>
                                        <Text style={{ color: colorsNav.text, fontSize: 14, fontWeight: '900' }}>{fmt(cuota)}</Text>
                                    </View>
                                    <View style={{ flex: 1, backgroundColor: colorsNav.bg, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colorsNav.border }}>
                                        <Text style={{ color: colorsNav.sub, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 }}>Intereses Totales</Text>
                                        <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '900' }}>{fmt(totalReal - p)}</Text>
                                    </View>
                                </View>
                                <View style={{ backgroundColor: colorsNav.accent + '10', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colorsNav.accent + '25', alignItems: 'center' }}>
                                    <Text style={{ color: colorsNav.sub, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 1 }}>Total Estimado a Pagar</Text>
                                    <Text style={{ color: colorsNav.accent, fontSize: 16, fontWeight: '900' }}>{fmt(totalReal)}</Text>
                                </View>
                            </View>
                        );
                    })()}

                    {/* Fecha de Compra — Compactado como una pequeña fila simple */}
                    <View style={{ 
                        flexDirection: 'row', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginTop: 12, 
                        paddingTop: 12, 
                        borderTopWidth: 1, 
                        borderTopColor: colorsNav.border + '50' 
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MaterialIcons name="event" size={15} color={colorsNav.accent} />
                            <Text style={{ color: colorsNav.text, fontSize: 12, fontWeight: '800' }}>Fecha de Compra</Text>
                        </View>
                        <View style={{ 
                            borderWidth: 1, 
                            borderRadius: 10, 
                            paddingHorizontal: 12, 
                            paddingVertical: 6, 
                            backgroundColor: colorsNav.bg, 
                            borderColor: colorsNav.border 
                        }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colorsNav.text }}>{txDate}</Text>
                        </View>
                    </View>
                </View>
              )}

              {/* Fecha para otros tipos de transacción (colapsable) */}
              {!(type === 'expense' && cards.map(c => c.name).includes(account)) && (
                <View style={[styles.section, { marginTop: 5 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>Fecha</Text>
                        <View style={{ borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, borderColor: colorsNav.border, backgroundColor: colorsNav.card, minWidth: 130, alignItems: 'center' }}>
                            <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 14 }}>{txDate}</Text>
                        </View>
                    </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: typeColor }, (!amount || isSaving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!amount || isSaving}
            >
              <Text style={styles.saveBtnText}>{isSaving ? 'Guardando...' : 'Guardar Movimiento'}</Text>
              <Ionicons name={isSaving ? "hourglass-outline" : "arrow-forward"} size={20} color="#FFF" />
            </TouchableOpacity>

            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <Modal visible={modalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>
                <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nueva Categoría</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]}
                  value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Ej. Suscripciones"
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => setModalVisible(false)}>
                    <Text style={{ color: colorsNav.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleAddCustomCategory}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
             </View>
          </View>
        </Modal>

        <Modal visible={accountModalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>
                <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nueva Cuenta</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colorsNav.bg, color: colorsNav.text, borderColor: colorsNav.border }]}
                  value={newAccountName} onChangeText={setNewAccountName} placeholder="Ej. Bancolombia"
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => setAccountModalVisible(false)}>
                    <Text style={{ color: colorsNav.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleAddCustomAccount}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
             </View>
          </View>
        </Modal>

        <Modal visible={showPreferenceModal} transparent animationType="fade">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colorsNav.card, alignItems: 'center' }]}>
                <View style={[styles.aiIcon, { backgroundColor: '#8B5CF620' }]}>
                  <MaterialIcons name="auto-awesome" size= {32} color="#8B5CF6" />
                </View>
                <Text style={[styles.modalTitle, { color: colorsNav.text }]}>¿Activar Ahorro Inteligente?</Text>
                <Text style={[styles.modalSub, { color: colorsNav.sub, textAlign: 'center' }]}>
                  Podemos sugerirte cuánto ahorrar automáticamente cada vez que recibas dinero para ayudarte a cumplir tus metas.
                </Text>

                <View style={styles.modalBtns}>
                  <TouchableOpacity 
                    style={[styles.mBtn, { backgroundColor: colorsNav.bg, borderWidth: 1, borderColor: colorsNav.border }]} 
                    onPress={() => handleSmartSavingsPref(false)}
                  >
                    <Text style={{ color: colorsNav.text, fontWeight: '700' }}>No, gracias</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.mBtn, { backgroundColor: '#8B5CF6' }]} 
                    onPress={() => handleSmartSavingsPref(true)}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '900' }}>Sí, activar</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 10, color: colorsNav.sub, marginTop: 10 }}>Puedes cambiar esto luego en Ahorros.</Text>
             </View>
          </View>
        </Modal>

        <Modal visible={showAiModal} transparent animationType="slide">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colorsNav.card, alignItems: 'center' }]}>
                <View style={[styles.aiIcon, { backgroundColor: colorsNav.accent + '20' }]}>
                  <MaterialIcons name="auto-awesome" size= {32} color={colorsNav.accent} />
                </View>
                <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Sugerencia Sanctuary</Text>
                <Text style={[styles.modalSub, { color: colorsNav.sub, textAlign: 'center' }]}>
                  {aiIncomeMessage || `¡Excelente ingreso! Para mantener tu salud financiera, te recomendamos ahorrar un ${suggestedPct}% de este ingreso:`}
                </Text>

                <View style={[styles.suggestionPill, { backgroundColor: colorsNav.accent, marginBottom: availableGoals.length > 0 ? 10 : 20 }]}>
                  <Text style={[styles.suggestionAmt, { color: '#FFF' }]}>{fmt(suggestedAmount)}</Text>
                  <Text style={[styles.suggestionLab, { color: 'rgba(255,255,255,0.8)' }]}>AHORRO RECOMENDADO</Text>
                </View>

                {availableGoals.length > 0 && (
                  <View style={{ width: '100%', marginBottom: 20 }}>
                    <Text style={{ color: colorsNav.sub, fontSize: 12, marginBottom: 8, textAlign: 'center', fontWeight: '700' }}>DESTINO DEL AHORRO:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 10 }}>
                      {availableGoals.map(g => (
                        <TouchableOpacity
                          key={g.id}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 12,
                            backgroundColor: selectedGoalId === g.id ? colorsNav.accent : colorsNav.bg,
                            borderWidth: 1,
                            borderColor: selectedGoalId === g.id ? colorsNav.accent : colorsNav.border,
                          }}
                          onPress={() => setSelectedGoalId(g.id)}
                        >
                          <Text style={{ color: selectedGoalId === g.id ? '#FFF' : colorsNav.text, fontWeight: '700', fontSize: 13 }}>
                            {g.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => { setShowAiModal(false); router.replace('/(tabs)'); }}>
                    <Text style={{ color: colorsNav.text }}>Ahora no</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleSaveSavingSuggestion} disabled={isSaving}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>{isSaving ? 'Guardando...' : 'Ahorrar Ahora'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => { setShowAiModal(false); handleSmartSavingsPref(false); }} style={{ marginTop: 16 }}>
                    <Text style={{ fontSize: 13, color: colorsNav.sub, textDecorationLine: 'underline', fontWeight: '600' }}>No volver a mostrar estos consejos</Text>
                </TouchableOpacity>
             </View>
          </View>
        </Modal>


      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: Platform.OS === 'android' ? 20 : 0 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },

  typeListWrap: { alignItems: 'center', marginBottom: 30 },
  typeList: { flexDirection: 'row', padding: 4, borderRadius: 100, width: '100%', justifyContent: 'space-between' },
  typeItem: { flex: 1, paddingVertical: 10, borderRadius: 100, alignItems: 'center', backgroundColor: 'transparent' },
  typeItemText: { fontSize: 13, fontWeight: '800' },

  amountCard: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 40, marginTop: 10 },
  currSign: { fontSize: 52, fontWeight: '900', marginRight: 4, marginTop: Platform.OS === 'android' ? -8 : 0 },
  amountInput: { fontSize: 64, fontWeight: '900', minWidth: '40%', textAlign: 'center', padding: 0 },

  form: { gap: 32 },
  inputContainer: { borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 4 },
  textInput: { fontSize: 18, fontWeight: '600' },

  section: { gap: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginLeft: 4, textTransform: 'uppercase', letterSpacing: 1 },
  chipRow: { gap: 10, paddingRight: 20 },
  chip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100 },
  chipText: { fontSize: 14, fontWeight: '700' },
  addChip: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  instChip: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20, borderRadius: 100, marginTop: 40, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width:0, height:4 } },
  saveBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalBox: { borderRadius: 32, padding: 32, gap: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalSub: { fontSize: 14, lineHeight: 20 },
  modalInput: { borderWidth: 1, borderRadius: 16, padding: 18, fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 10 },
  mBtn: { flex: 1, padding: 18, borderRadius: 18, alignItems: 'center' },

  aiIcon: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  suggestionPill: { padding: 24, borderRadius: 28, alignItems: 'center', width: '100%', elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 15, marginVertical: 12 },
  suggestionAmt: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  suggestionLab: { fontSize: 13, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
});
