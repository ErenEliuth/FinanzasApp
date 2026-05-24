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
  const [categoryThresholds, setCategoryThresholds] = useState<Record<string, number>>({});
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [installments, setInstallments] = useState('1');
  const [interestRate, setInterestRate] = useState('0');
  
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (isFocused) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      setAmount('');
      setDescription('');
      setCategory('');
      setDestAccount('');
      setInstallments('1');
    }
  }, [isFocused]);

  // ─── Sugerencia Inteligente de Ahorro ───
  const [showAiModal, setShowAiModal] = useState(false);
  const [suggestedAmount, setSuggestedAmount] = useState(0);
  const [suggestedPct, setSuggestedPct] = useState(0);
  const [incomeJustSaved, setIncomeJustSaved] = useState(0);
  const [smartSavingsPref, setSmartSavingsPref] = useState<'enabled' | 'disabled' | 'unset'>('unset');
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);
  const [showHealthAlert, setShowHealthAlert] = useState(false);
  const [healthData, setHealthData] = useState<{
    healthPct: number;
    emergencyFund: { id: number; name: string; current: number; target: number } | null;
    expenseAmount: number;
    suggestedRedirect: number;
    suggestedPct?: number;
    message: string;
  } | null>(null);
  const [redirectAmount, setRedirectAmount] = useState('');
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
        const [rawCats, rawPref, rawThresholds] = await Promise.all([
          AsyncStorage.getItem(SYNC_KEYS.CATEGORIES(user.id)),
          AsyncStorage.getItem(SYNC_KEYS.SMART_SAVINGS(user.id)),
          AsyncStorage.getItem(SYNC_KEYS.CATEGORY_THRESHOLDS(user.id))
        ]);
        if (rawCats) setCustomCategories(JSON.parse(rawCats));
        if (rawPref) setSmartSavingsPref(rawPref as any);
        if (rawThresholds) setCategoryThresholds(JSON.parse(rawThresholds));
      } catch (e) {
        console.error('Error al cargar datos persistidos:', e);
      }
    };
    loadData();
  }, [user]);

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

    try {
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: dbType, amount: parsed, description: desc, category: dbCategory, account: account, date: getLocalISOString(),
      }]);
      if (error) throw error;

      if (type === 'income') {
        try {
          const { data: allTx } = await supabase.from('transactions').select('amount, type, category').eq('user_id', user?.id);
          const { data: allDebts } = await supabase.from('debts').select('value, paid').eq('user_id', user?.id);
          
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

          const pct = healthPct >= 70 ? 20 : healthPct >= 40 ? 15 : 10;
          const suggest = Math.round(parsed * (pct / 100));

          setSuggestedAmount(suggest);
          setSuggestedPct(pct);
          setIncomeJustSaved(parsed);
          
          // Si no hay preferencia, preguntar
          if (smartSavingsPref === 'unset') {
            setShowPreferenceModal(true);
          } else if (smartSavingsPref === 'enabled') {
            setShowAiModal(true);
          } else {
            router.back();
          }

          setIsSaving(false);
          return;
        } catch (e) { console.error('Error calculando sugerencia:', e); }
      }

      if (type === 'expense') {
        try {
          const { data: allTx } = await supabase.from('transactions').select('amount, type, category, account').eq('user_id', user?.id);
          const { data: allDebts } = await supabase.from('debts').select('value, paid, debt_type').eq('user_id', user?.id);
          
          let accs: Record<string, number> = {};
          let savTotal = 0;
          allTx?.forEach(tx => {
            const amount = Number(tx.amount) || 0;
            if (tx.type === 'income') {
              const acc = tx.account || 'Efectivo';
              if (!accs[acc]) accs[acc] = 0;
              if (tx.category === 'Ahorro') {
                if (tx.account === 'Ahorro') savTotal += amount;
                else savTotal -= amount;
              }
              accs[acc] += amount;
            } else {
              if (tx.category === 'Ahorro') savTotal += amount;
              const acc = !tx.account ? 'Efectivo' : tx.account;
              if (!accs[acc]) accs[acc] = 0;
              accs[acc] -= amount;
            }
          });

          const validAccNames = ['Efectivo', ...(customAccounts || [])];
          const cardNamesForFilter = (cards || []).map(c => c?.name || '');
          const activeMoney = Object.entries(accs)
            .filter(([accName]) => validAccNames.includes(accName) && !cardNamesForFilter.includes(accName) && accName !== 'Ahorro')
            .reduce((sum, [_, amt]) => sum + Number(amt), 0);
          
          // Investment is hard to fetch perfectly here without loading goals fully, but let's approximate or just use savTotal
          const currentAhorro = savTotal;
          const currentInvestment = 0; // we skip investment for now to simplify, or assume 0
          
          const debtTotal = allDebts?.filter(d => d.debt_type !== 'loan').reduce((sum, d) => sum + (d.value - d.paid), 0) || 0;
          const realMoney = activeMoney - debtTotal;
          const assetsTotal = activeMoney + currentAhorro + currentInvestment;
          
          const rawHealthPct = assetsTotal > 0 ? Math.max(0, Math.min(100, Math.round((realMoney / assetsTotal) * 100))) : 0;
          const healthPct = isNaN(rawHealthPct) ? 0 : rawHealthPct;
          
          // Buscar Fondo
          const { data: goalsData } = await supabase.from('goals').select('id, name, current_amount, target_amount').eq('user_id', user?.id);
          const storedInterests = await AsyncStorage.getItem(SYNC_KEYS.GOALS_INTEREST(user.id!));
          const iMap = storedInterests ? JSON.parse(storedInterests) : {};
          const efGoal = goalsData?.find(g => iMap[g.id]?.is_emergency_fund);
          
          let shouldShowAlert = false;
          let message = '';
          
          const limitToUse = categoryThresholds[dbCategory] ?? 0;
          if (parsed > limitToUse) {
              shouldShowAlert = true;
              message = categoryThresholds[dbCategory] === undefined
                  ? `Aún no has definido un límite para "${dbCategory}". Te recomendamos configurarlo ahora usando el botón superior.`
                  : `Este gasto de ${fmt(parsed)} supera tu límite de ${fmt(categoryThresholds[dbCategory])} para "${dbCategory}".`;
          }
          
          if (shouldShowAlert) {
              const basePct = healthPct >= 70 ? 30 : healthPct >= 40 ? 20 : 10;
              setHealthData({
                  healthPct,
                  emergencyFund: efGoal ? {
                      id: efGoal.id, name: efGoal.name, current: efGoal.current_amount, target: efGoal.target_amount
                  } : null,
                  expenseAmount: parsed,
                  suggestedRedirect: Math.round(parsed * (basePct / 100)),
                  suggestedPct: basePct,
                  message
              });
              setShowHealthAlert(true);
              setIsSaving(false);
              return;
          }
        } catch(e) { console.error('Error evaluando salud financiera:', e); }
      }

      setAmount(''); setDescription(''); setCategory('');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    } catch (e) { 
      console.error('Error guardando transacción:', e); 
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptExpense = () => {
      setShowHealthAlert(false);
      setAmount(''); setDescription(''); setCategory('');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
  };

  const handleRedirectToFund = async () => {
      if (!healthData?.emergencyFund) {
          setShowHealthAlert(false);
          router.push('/goals');
          return;
      }
      const val = parseInputToNumber(redirectAmount, currency);
      const p = convertToBase(val, currency, rates);
      if (isNaN(p) || p <= 0) return;
      
      setIsSaving(true);
      try {
          const { error } = await supabase.from('transactions').insert([{
              user_id: user?.id,
              type: 'expense',
              amount: p,
              description: `Aporte a fondo: ${healthData.emergencyFund.name}`,
              category: 'Ahorro',
              account: account,
              date: getLocalISOString()
          }]);
          if (error) throw error;
          
          await supabase.from('goals').update({ current_amount: healthData.emergencyFund.current + p }).eq('id', healthData.emergencyFund.id);
          setShowHealthAlert(false);
          setAmount(''); setDescription(''); setCategory('');
          if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
      } catch(e) {
          console.error('Error redireccionando al fondo:', e);
          Alert.alert('Error', 'No se pudo guardar la redirección de fondos.');
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveSavingSuggestion = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: 'expense', amount: suggestedAmount, description: 'Ahorro Sugerido Sanctuary', category: 'Ahorro', account: account, date: getLocalISOString(),
      }]);
      if (error) throw error;
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
                    onPress={() => { setType(t.id as TxType); setDescription(t.id === 'ahorro' ? 'Ahorro' : ''); }}
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
                  <TouchableOpacity style={styles.addChip} onPress={() => setAccountModalVisible(true)}>
                    <MaterialIcons name="add" size={20} color={colorsNav.sub} />
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {cards.length > 0 && type !== 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.sub }]}>Tarjetas y Cuentas Nu</Text>
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
                    <TouchableOpacity style={styles.addChip} onPress={() => setModalVisible(true)}>
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
                <View style={[styles.section, { backgroundColor: colorsNav.card, padding: 20, borderRadius: 24, marginTop: 10 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.sectionTitle, { color: colorsNav.text, marginLeft: 0 }]}>Número de Cuotas</Text>
                        <View style={{ backgroundColor: colorsNav.accent + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 12 }}>{installments} {parseInt(installments, 10) === 1 ? 'Cuota' : 'Cuotas'}</Text>
                        </View>
                    </View>
                    
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
                        {['1', '2', '3', '6', '12', '24', '36'].map(num => (
                            <TouchableOpacity 
                                key={num} 
                                style={[styles.instChip, { backgroundColor: installments === num ? colorsNav.accent : colorsNav.bg, borderColor: colorsNav.border }]} 
                                onPress={() => setInstallments(num)}
                            >
                                <Text style={{ color: installments === num ? '#FFF' : colorsNav.text, fontWeight: '800' }}>{num}</Text>
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
                            <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colorsNav.border + '50' }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <Text style={{ color: colorsNav.sub, fontSize: 12, fontWeight: '600' }}>Tasa interés (E.A. %)</Text>
                                    <TextInput 
                                        style={{ color: colorsNav.text, fontWeight: '800', textAlign: 'right', minWidth: 40 }}
                                        value={interestRate}
                                        onChangeText={setInterestRate}
                                        keyboardType="numeric"
                                    />
                                </View>
                                
                                <View style={{ gap: 4 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: colorsNav.sub, fontSize: 12 }}>Pago mensual:</Text>
                                        <Text style={{ color: colorsNav.text, fontWeight: '800' }}>{fmt(cuota)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: colorsNav.sub, fontSize: 12 }}>Total a pagar (con intereses):</Text>
                                        <Text style={{ color: colorsNav.accent, fontWeight: '900' }}>{fmt(totalReal)}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                        <Text style={{ color: colorsNav.sub, fontSize: 12 }}>Intereses totales:</Text>
                                        <Text style={{ color: '#EF4444', fontWeight: '800' }}>{fmt(totalReal - p)}</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    })()}
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
                  ¡Excelente ingreso! Para mantener tu salud financiera, te recomendamos ahorrar un {suggestedPct}% de este ingreso:
                </Text>

                <View style={[styles.suggestionPill, { backgroundColor: colorsNav.accent }]}>
                  <Text style={[styles.suggestionAmt, { color: '#FFF' }]}>{fmt(suggestedAmount)}</Text>
                  <Text style={[styles.suggestionLab, { color: 'rgba(255,255,255,0.8)' }]}>AHORRO RECOMENDADO</Text>
                </View>

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.bg }]} onPress={() => { setShowAiModal(false); router.replace('/(tabs)'); }}>
                    <Text style={{ color: colorsNav.text }}>Ahora no</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colorsNav.accent }]} onPress={handleSaveSavingSuggestion} disabled={isSaving}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>{isSaving ? 'Guardando...' : 'Ahorrar Ahora'}</Text>
                  </TouchableOpacity>
                </View>
             </View>
          </View>
        </Modal>

        <Modal visible={showHealthAlert} transparent animationType="slide">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderColor: colorsNav.border, borderWidth: 1, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 }]}>
                
                {/* Header del Modal */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="warning" size={28} color="#F59E0B" />
                        <Text style={[styles.modalTitle, { color: colorsNav.text, fontSize: 20 }]}>Límite Superado</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowThresholdsModal(true)} style={{ padding: 6, backgroundColor: colorsNav.bg, borderRadius: 8 }}>
                        <Ionicons name="settings-outline" size={24} color={colorsNav.sub} />
                    </TouchableOpacity>
                </View>
                
                <Text style={[styles.modalSub, { color: colorsNav.sub, fontSize: 15, lineHeight: 22 }]}>
                  {healthData?.message}
                </Text>

                {healthData?.emergencyFund ? (
                    <View style={{ marginTop: 15, backgroundColor: colorsNav.bg, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colorsNav.border + '50' }}>
                        <Text style={{ color: colorsNav.text, fontWeight: '800', marginBottom: 12, fontSize: 12, letterSpacing: 0.5, textAlign: 'center' }}>TU FONDO DE EMERGENCIA</Text>
                        
                        {/* Barra de Progreso */}
                        <View style={{ height: 8, backgroundColor: colorsNav.border, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                            <View style={{ height: '100%', backgroundColor: '#10B981', width: `${Math.min(100, (healthData.emergencyFund.current / healthData.emergencyFund.target) * 100)}%` }} />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text style={{ color: colorsNav.sub, fontSize: 12, fontWeight: '600' }}>{fmt(healthData.emergencyFund.current)} ahorrados</Text>
                            <Text style={{ color: colorsNav.sub, fontSize: 12 }}>Meta: {fmt(healthData.emergencyFund.target)}</Text>
                        </View>

                        <Text style={{ color: colorsNav.text, fontWeight: '700', marginBottom: 12, fontSize: 14, textAlign: 'center' }}>Sugerimos destinar el <Text style={{ color: colorsNav.accent, fontWeight: '900' }}>{healthData.suggestedPct}%</Text> al fondo:</Text>
                        
                        <TextInput
                            style={[styles.modalInput, { backgroundColor: colorsNav.card, color: colorsNav.text, borderColor: colorsNav.border, textAlign: 'center', fontSize: 24, fontWeight: '900', paddingVertical: 12 }]}
                            value={redirectAmount}
                            onChangeText={t => setRedirectAmount(formatInputDisplay(t, currency))}
                            placeholder={formatCurrency(healthData.suggestedRedirect, currency, false)}
                            placeholderTextColor={colorsNav.sub + '50'}
                            keyboardType="decimal-pad"
                        />
                    </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 }}>
                  <TouchableOpacity 
                    style={[styles.mBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colorsNav.border, flex: 1, paddingVertical: 14 }]} 
                    onPress={handleAcceptExpense} disabled={isSaving}
                  >
                    <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>Continuar</Text>
                  </TouchableOpacity>

                  {healthData?.emergencyFund ? (
                      <TouchableOpacity 
                        style={[styles.mBtn, { backgroundColor: colorsNav.accent, flex: 1, paddingVertical: 14 }]} 
                        onPress={() => {
                            if (!redirectAmount) {
                                setRedirectAmount(formatCurrency(healthData.suggestedRedirect, currency, false).replace(/[^0-9.,]/g, ''));
                            }
                            handleRedirectToFund();
                        }} disabled={isSaving}
                      >
                        <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14, textAlign: 'center' }}>
                            {isSaving ? '...' : 'Ahorrar'}
                        </Text>
                      </TouchableOpacity>
                  ) : null}
                </View>
             </View>
          </View>
        </Modal>

        <Modal visible={showThresholdsModal} transparent animationType="slide">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colorsNav.bg, maxHeight: '85%', padding: 24 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[styles.modalTitle, { color: colorsNav.text, fontSize: 22 }]}>Tus Límites</Text>
                    <TouchableOpacity onPress={() => setShowThresholdsModal(false)} style={{ padding: 4 }}>
                        <Ionicons name="close" size={24} color={colorsNav.sub} />
                    </TouchableOpacity>
                </View>
                <Text style={{ color: colorsNav.sub, fontSize: 14, marginBottom: 20, lineHeight: 20 }}>Define un monto máximo para tus gastos. El primer gasto en una categoría sin límite activará la alerta para recordarte configurarlo.</Text>
                
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    {[...DEFAULT_EXPENSE_CATS, ...customCategories].map(cat => (
                        <View key={cat} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colorsNav.card, padding: 14, borderRadius: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 }}>
                            <Text style={{ color: colorsNav.text, fontWeight: '700', flex: 1, fontSize: 15 }}>{cat}</Text>
                            <TextInput
                                style={{ color: colorsNav.accent, backgroundColor: colorsNav.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 110, textAlign: 'right', fontWeight: '900', fontSize: 15 }}
                                placeholder="$ 0 (Avisar)"
                                placeholderTextColor={colorsNav.sub + '80'}
                                keyboardType="decimal-pad"
                                value={categoryThresholds[cat] ? formatCurrency(categoryThresholds[cat], currency, false).replace(/[^0-9.,]/g, '') : ''}
                                onChangeText={(val) => {
                                    const num = parseInputToNumber(val, currency);
                                    if (num > 0) {
                                        setCategoryThresholds(prev => ({ ...prev, [cat]: num }));
                                    } else {
                                        setCategoryThresholds(prev => {
                                            const next = { ...prev };
                                            delete next[cat];
                                            return next;
                                        });
                                    }
                                }}
                            />
                        </View>
                    ))}
                </ScrollView>

                <TouchableOpacity 
                    style={[styles.mBtn, { backgroundColor: colorsNav.text, marginTop: 16, paddingVertical: 16 }]} 
                    onPress={async () => {
                        if (user?.id) {
                            await AsyncStorage.setItem(SYNC_KEYS.CATEGORY_THRESHOLDS(user.id), JSON.stringify(categoryThresholds));
                            syncUp(user.id);
                        }
                        setShowThresholdsModal(false);
                    }}
                >
                    <Text style={{ color: colorsNav.bg, fontWeight: '900', textAlign: 'center', fontSize: 16 }}>Guardar Cambios</Text>
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
