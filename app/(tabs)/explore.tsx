import { useAuth } from '@/utils/auth';
import { syncUp } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
// Eliminado: MagicAuraButton
import { formatCurrency, getCurrencyInfo, convertCurrency, convertToBase, CURRENCIES } from '@/utils/currency';
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
  View
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

const STORAGE_KEY = '@user_custom_categories_v2';
const ACCOUNT_STORAGE_KEY = '@custom_accounts';
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
  const [customAccounts, setCustomAccounts] = useState<string[]>([]);
  const [cardNames, setCardNames] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (isFocused) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isFocused]);

  // ─── Sugerencia Inteligente de Ahorro ───
  const [showAiModal, setShowAiModal] = useState(false);
  const [suggestedAmount, setSuggestedAmount] = useState(0);
  const [suggestedPct, setSuggestedPct] = useState(0);
  const [incomeJustSaved, setIncomeJustSaved] = useState(0);
  const router = useRouter();
  const { user, currency, rates, isHidden } = useAuth();
  const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);
  const colorsNav = useThemeColors();

  const typeColor =
    type === 'income' ? colorsNav.accent :
      type === 'ahorro' ? '#8B5CF6' :
        type === 'transfer' ? '#F59E0B' : '#EF4444';

  // Cargar datos guardados
  useEffect(() => {
    const loadData = async () => {
      try {
        const [rawCats, rawAccs, rawCards] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(ACCOUNT_STORAGE_KEY),
          AsyncStorage.getItem(`@cards_${user?.id}`)
        ]);
        if (rawCats) setCustomCategories(JSON.parse(rawCats));
        if (rawAccs) setCustomAccounts(JSON.parse(rawAccs));
        if (rawCards) setCardNames(JSON.parse(rawCards).map((c: any) => c.name));
      } catch (e) {
        console.error('Error al cargar datos persistidos:', e);
      }
    };
    loadData();
  }, [user]);

  const persistCustomCategories = async (cats: string[]) => {
    setCustomCategories(cats);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
    if (user?.id) syncUp(user.id);
  };

  const persistCustomAccounts = async (accs: string[]) => {
    setAccount(accs[accs.length - 1] || 'Efectivo');
    setCustomAccounts(accs);
    await AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accs));
    if (user?.id) syncUp(user.id);
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
          const updated = customAccounts.filter(a => a !== acc);
          await persistCustomAccounts(updated);
          if (account === acc) setAccount('Efectivo');
        })();
      }
      return;
    }
    Alert.alert('Eliminar', `¿Quitar la cuenta "${acc}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const updated = customAccounts.filter(a => a !== acc);
          await persistCustomAccounts(updated);
          if (account === acc) setAccount('Efectivo');
        }
      }
    ]);
  };

  const handleAmountChange = (text: string) => {
    if (!text) { setAmount(''); return; }

    if (currency === 'COP') {
      const clean = text.replace(/\D/g, '');
      if (!clean) { setAmount(''); return; }
      setAmount(new Intl.NumberFormat('es-CO').format(parseInt(clean, 10)));
    } else {
      let normalized = text;
      const hasDot = text.includes('.');
      if (!hasDot) {
        normalized = text.replace(/,(\d{0,2})$/, '.$1');
        normalized = normalized.replace(/,/g, '');
      } else {
        normalized = text.replace(/,/g, '');
      }

      const parts = normalized.split('.');
      if (parts.length > 2) return;

      const integerRaw = parts[0].replace(/\D/g, '');
      if (!integerRaw && normalized.startsWith('.')) {
        setAmount('0.' + (parts[1] || '').slice(0, 2));
        return;
      }

      const integerFormatted = integerRaw
        ? new Intl.NumberFormat('en-US').format(parseInt(integerRaw, 10))
        : '';

      if (parts.length === 2) {
        setAmount(`${integerFormatted}.${parts[1].slice(0, 2)}`);
      } else if (normalized.endsWith('.')) {
        setAmount(`${integerFormatted}.`);
      } else {
        setAmount(integerFormatted);
      }
    }
  };

  const handleSave = async () => {
    let cleanStr = amount;
    if (currency === 'COP') {
        cleanStr = amount.replace(/\./g, '').replace(',', '.');
    } else {
        cleanStr = amount.replace(/,/g, '');
    }
    const typedVal = parseFloat(cleanStr);
    const parsed = convertToBase(typedVal, currency, rates);
    if (isNaN(parsed) || parsed <= 0 || isSaving) return;

    setIsSaving(true);

    if (type !== 'income') {
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

    if (type === 'transfer') {
      if (!destAccount || destAccount === account) {
        Alert.alert('Error', 'Selecciona una cuenta de destino diferente.');
        setIsSaving(false);
        return;
      }
      const desc = description.trim() || `Transferencia ${account} → ${destAccount}`;
      try {
        await supabase.from('transactions').insert([{
          user_id: user?.id, type: 'expense', amount: parsed, description: desc, category: 'Transferencia', account: account, date: new Date().toISOString(),
        }]);
        await supabase.from('transactions').insert([{
          user_id: user?.id, type: 'income', amount: parsed, description: desc, category: 'Transferencia', account: destAccount, date: new Date().toISOString(),
        }]);
        setAmount(''); setDescription(''); setDestAccount('');
        if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
      } catch (e) { 
        console.error('Error transfiriendo:', e); 
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const dbType = type === 'income' ? 'income' : 'expense';
    const dbCategory = type === 'ahorro' ? 'Ahorro' : (category || (type === 'income' ? 'Ingreso' : 'General'));
    const desc = description.trim() || dbCategory;

    try {
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: dbType, amount: parsed, description: desc, category: dbCategory, account: type === 'ahorro' ? 'Ahorro' : account, date: new Date().toISOString(),
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
          const healthPct = totalActive > 0 ? (realMoney / (totalActive + totalAhorro)) * 100 : 0;

          const pct = healthPct >= 70 ? 20 : healthPct >= 40 ? 15 : 10;
          const suggest = Math.round(parsed * (pct / 100));

          setSuggestedAmount(suggest);
          setSuggestedPct(pct);
          setIncomeJustSaved(parsed);
          setShowAiModal(true);
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
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: 'expense', amount: suggestedAmount, description: 'Ahorro Sugerido Sanctuary', category: 'Ahorro', account: account, date: new Date().toISOString(),
      }]);
      if (error) throw error;
      setShowAiModal(false);
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    } catch (e) {
      console.error('Error guardando ahorro sugerido:', e);
      Alert.alert('Error', 'No se pudo guardar el ahorro.');
    } finally {
      setIsSaving(false);
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
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colorsNav.card }]}>
                  <Ionicons name="close" size={24} color={colorsNav.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Selector de Tipo */}
            <View style={[styles.typeList, { backgroundColor: colorsNav.card }]}>
              {[
                { id: 'income', label: 'Ingreso', icon: 'trending-up', c: colorsNav.accent },
                { id: 'expense', label: 'Gasto', icon: 'trending-down', c: '#EF4444' },
                { id: 'ahorro', label: 'Ahorro', icon: 'wallet', c: '#8B5CF6' },
                { id: 'transfer', label: 'Mover', icon: 'swap-horiz', c: '#F59E0B' },
              ].map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeItem, type === t.id && { backgroundColor: t.c + '15', borderColor: t.c }]}
                  onPress={() => { setType(t.id as TxType); setDescription(t.id === 'ahorro' ? 'Ahorro' : ''); }}
                >
                  <MaterialIcons name={t.icon as any} size={18} color={type === t.id ? t.c : colorsNav.sub} />
                  <Text style={[styles.typeItemText, { color: type === t.id ? t.c : colorsNav.sub }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Monto */}
            <View style={[styles.amountCard, { backgroundColor: typeColor }]}>
              <Text style={styles.currSign}>{CURRENCIES.find(c => c.code === currency)?.symbol || '$'}</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            {/* Formulario */}
            <View style={[styles.form, { backgroundColor: colorsNav.card }]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colorsNav.sub }]}>Descripción</Text>
                <View style={[styles.inputContainer, { backgroundColor: colorsNav.bg }]}>
                  <TextInput
                    style={[styles.textInput, { color: colorsNav.text }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Ej. Supermercado, Nómina..."
                    placeholderTextColor={colorsNav.sub + '80'}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Cuenta</Text>
                  <TouchableOpacity onPress={() => setAccountModalVisible(true)}>
                    <MaterialIcons name="add-circle" size={24} color={colorsNav.accent} />
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {['Efectivo', ...customAccounts.filter(a => !cardNames.includes(a))].map(acc => (
                    <TouchableOpacity
                      key={acc}
                      style={[styles.chip, { backgroundColor: colorsNav.bg }, account === acc && { backgroundColor: colorsNav.accent }]}
                      onPress={() => setAccount(acc)}
                      onLongPress={() => customAccounts.includes(acc) && handleDeleteCustomAccount(acc)}
                    >
                      <Text style={[styles.chipText, { color: colorsNav.sub }, account === acc && { color: '#FFF' }]}>{acc}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {cardNames.length > 0 && type !== 'ahorro' && type !== 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Tarjetas de Crédito</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {cardNames.map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[styles.chip, { backgroundColor: colorsNav.bg, borderColor: colorsNav.accent + '40', borderWidth: 1 }, account === acc && { backgroundColor: colorsNav.accent, borderColor: colorsNav.accent }]}
                        onPress={() => setAccount(acc)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialIcons name="credit-card" size={14} color={account === acc ? '#FFF' : colorsNav.accent} />
                          <Text style={[styles.chipText, { color: colorsNav.sub }, account === acc && { color: '#FFF' }]}>{acc}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {type !== 'ahorro' && type !== 'transfer' && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Categoría</Text>
                    <TouchableOpacity onPress={() => setModalVisible(true)}>
                      <MaterialIcons name="add-circle" size={24} color={colorsNav.accent} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {allCategories.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.chip, { backgroundColor: colorsNav.bg }, category === cat && { backgroundColor: typeColor }]}
                        onPress={() => setCategory(cat)}
                        onLongPress={() => customCategories.includes(cat) && handleDeleteCustomCategory(cat)}
                      >
                        <Text style={[styles.chipText, { color: colorsNav.sub }, category === cat && { color: '#FFF' }]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {type === 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colorsNav.text, marginBottom: 12 }]}>Destino</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {['Efectivo', ...customAccounts.filter(a => !cardNames.includes(a))].filter(a => a !== account).map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[styles.chip, { backgroundColor: colorsNav.bg }, destAccount === acc && { backgroundColor: typeColor }]}
                        onPress={() => setDestAccount(acc)}
                      >
                        <Text style={[styles.chipText, { color: colorsNav.sub }, destAccount === acc && { color: '#FFF' }]}>{acc}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
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
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: Platform.OS === 'android' ? 20 : 0 },
  title: { fontSize: 24, fontWeight: '900' },
  closeBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },

  typeList: { flexDirection: 'row', padding: 6, borderRadius: 20, marginBottom: 20, justifyContent: 'space-between' },
  typeItem: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'transparent' },
  typeItemText: { fontSize: 11, fontWeight: '800' },

  amountCard: { borderRadius: 28, padding: 32, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15 },
  currSign: { color: '#FFF', fontSize: 28, fontWeight: '800', marginRight: 6 },
  amountInput: { color: '#FFF', fontSize: 42, fontWeight: '900', minWidth: 150, textAlign: 'center' },

  form: { borderRadius: 32, padding: 24, gap: 24, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 13, fontWeight: '800', marginLeft: 4 },
  inputContainer: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  textInput: { fontSize: 16, fontWeight: '600' },

  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  chipRow: { gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  chipText: { fontSize: 13, fontWeight: '800' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 20, borderRadius: 24, marginTop: 32, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15 },
  saveBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900' },

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
