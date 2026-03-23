import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

const STORAGE_KEY = 'user_custom_categories_v2';
const ACCOUNT_STORAGE_KEY = '@custom_accounts';
type TxType = 'income' | 'expense' | 'ahorro' | 'transfer';

export default function AddTransactionScreen() {
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
  const [savingsModalVisible, setSavingsModalVisible] = useState(false);
  const [incomeToSave, setIncomeToSave] = useState(0);
  const [savingsSuggestion, setSavingsSuggestion] = useState(0);
  const [savingsMessage, setSavingsMessage] = useState('');
  const [savingsPercentage, setSavingsPercentage] = useState(15);

  const router = useRouter();
  const { user, theme } = useAuth();
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#0F172A' : '#F8FAFF',
    card: isDark ? '#1E293B' : '#FFFFFF',
    text: isDark ? '#F1F5F9' : '#1E293B',
    sub: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#334155' : '#E2E8F0',
    input: isDark ? '#1E293B' : '#F1F5F9',
  };

  const typeColor =
    type === 'income' ? '#10B981' :
      type === 'ahorro' ? '#6366F1' :
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
  }, []);

  const persistCustomCategories = async (cats: string[]) => {
    setCustomCategories(cats);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cats));
  };

  const persistCustomAccounts = async (accs: string[]) => {
    setAccount(accs[accs.length - 1] || 'Efectivo');
    setCustomAccounts(accs);
    await AsyncStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(accs));
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

  const formatInput = (text: string) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('es-CO').format(parseInt(clean, 10));
  };

  const handleAmountChange = (text: string) => {
    setAmount(formatInput(text));
  };

  const handleSave = async () => {
    const parsed = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) return;

    // ── INCOME SMART SUGGESTION ──
    if (type === 'income') {
      const calculateSmartSaving = async () => {
        try {
          const today = new Date();
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

          // Fetch Month Stats
          const { data: txData } = await supabase
            .from('transactions')
            .select('type, amount, category')
            .eq('user_id', user?.id)
            .gte('date', startOfMonth);

          const monthInc = (txData?.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0) || 0) + parsed;
          const monthExp = txData?.filter(t => t.type === 'expense' && t.category !== 'Ahorro').reduce((s, t) => s + t.amount, 0) || 0;

          // Fetch Debts
          const { data: debtData } = await supabase
            .from('debts')
            .select('value, paid')
            .eq('user_id', user?.id);
          
          const totalDebt = debtData?.reduce((s, d) => s + (d.value - (d.paid || 0)), 0) || 0;

          // Logic
          let pct = 15;
          let msg = "Es un buen momento para separar una parte.";

          const debtToIncome = totalDebt / (monthInc || 1);
          const surplusRatio = (monthInc - monthExp) / (monthInc || 1);

          if (debtToIncome > 1.2) {
            pct = 5;
            msg = "Tus deudas son altas este mes. Sugerimos un ahorro pequeño del 5% para priorizar tus pagos.";
          } else if (surplusRatio > 0.4) {
            pct = 20;
            msg = "¡Vas muy bien! Tus gastos están bajo control, podrías ahorrar un 20% sin problemas.";
          } else if (surplusRatio < 0.1) {
            pct = 10;
            msg = "Este mes tu presupuesto está algo ajustado. Ahorra un 10% para no descuidar tu fondo.";
          } else {
            pct = 15;
            msg = "Basado en tus finanzas de este mes, un 15% es lo ideal para mantener tu equilibrio.";
          }

          setIncomeToSave(parsed);
          setSavingsPercentage(pct);
          setSavingsSuggestion(Math.round(parsed * (pct / 100)));
          setSavingsMessage(msg);
          setSavingsModalVisible(true);
        } catch (e) {
          // Fallback simple si falla el fetch
          setIncomeToSave(parsed);
          setSavingsPercentage(15);
          setSavingsSuggestion(Math.round(parsed * 0.15));
          setSavingsMessage("Conserva el hábito y separa un poco para el futuro.");
          setSavingsModalVisible(true);
        }
      };

      calculateSmartSaving();
      return;
    }

    // ── TRANSFER ──
    if (type === 'transfer') {
      if (!destAccount || destAccount === account) {
        Alert.alert('Error', 'Selecciona una cuenta de destino diferente.');
        return;
      }
      const desc = description.trim() || `Transferencia ${account} → ${destAccount}`;
      try {
        // Salida de la cuenta origen
        await supabase.from('transactions').insert([{
          user_id: user?.id,
          type: 'expense',
          amount: parsed,
          description: desc,
          category: 'Transferencia',
          account: account,
          date: new Date().toISOString(),
        }]);
        // Entrada a la cuenta destino
        await supabase.from('transactions').insert([{
          user_id: user?.id,
          type: 'income',
          amount: parsed,
          description: desc,
          category: 'Transferencia',
          account: destAccount,
          date: new Date().toISOString(),
        }]);
        setAmount(''); setDescription(''); setDestAccount('');
        router.push('/(tabs)');
      } catch (e) { console.error('Error transfiriendo:', e); }
      return;
    }

    // ── NORMAL (Expense / Ahorro) ──
    const dbType = 'expense';
    const dbCategory = type === 'ahorro' ? 'Ahorro' : (category || 'General');
    const desc = description.trim() || dbCategory;

    try {
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id,
        type: dbType,
        amount: parsed,
        description: desc,
        category: dbCategory,
        account: type === 'ahorro' ? 'Ahorro' : account,
        date: new Date().toISOString(),
      }]);
      if (error) throw error;
      setAmount('');
      setDescription('');
      setCategory('');
      router.push('/(tabs)');
    } catch (e) {
      console.error('Error guardando transacción:', e);
    }
  };

  const confirmSaveWithSavings = async (shouldSave15: boolean) => {
    const parsed = incomeToSave;
    const savings = savingsSuggestion;
    const desc = description.trim() || (category || 'Sueldo');

    try {
      // 1. Guardar el Ingreso
      await supabase.from('transactions').insert([{
        user_id: user?.id,
        type: 'income',
        amount: parsed,
        description: desc,
        category: category || 'Sueldo',
        account: account,
        date: new Date().toISOString(),
      }]);

      // 2. Guardar el Ahorro si se aceptó
      if (shouldSave15) {
        await supabase.from('transactions').insert([{
          user_id: user?.id,
          type: 'expense', 
          amount: savings,
          description: `Ahorro (${savingsPercentage}%) de: ${desc}`,
          category: 'Ahorro',
          account: account,
          date: new Date().toISOString(),
        }]);
      }

      setSavingsModalVisible(false);
      setAmount('');
      setDescription('');
      setCategory('');
      router.push('/(tabs)');
    } catch (e) {
      console.error('Error guardando con ahorro:', e);
      Alert.alert('Error', 'No se pudo guardar la transacción.');
    }
  };

  const allCategories = type === 'income'
    ? [...DEFAULT_INCOME_CATS, ...customCategories]
    : type === 'expense'
      ? [...DEFAULT_EXPENSE_CATS, ...customCategories]
      : [];

  return (
    <TouchableWithoutFeedback onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

            <Text style={[styles.title, { color: colors.text }]}>Nueva Transacción</Text>

            {/* ── Selector de Tipo: Ingreso / Gasto / Ahorro ─────────────── */}
            <View style={[styles.typeSelector, { backgroundColor: colors.card }]}>
              {/* Ingreso */}
              <TouchableOpacity
                style={[styles.typeBtn, type === 'income' && { backgroundColor: '#10B981' }]}
                onPress={() => { setType('income'); setDescription(''); }}
              >
                <MaterialIcons name="trending-up" size={15} color={type === 'income' ? '#FFF' : '#94A3B8'} />
                <Text style={[styles.typeBtnText, type === 'income' && styles.typeBtnActive]}>Ingreso</Text>
              </TouchableOpacity>

              {/* Gasto */}
              <TouchableOpacity
                style={[styles.typeBtn, type === 'expense' && { backgroundColor: '#EF4444' }]}
                onPress={() => { setType('expense'); setDescription(''); }}
              >
                <MaterialIcons name="trending-down" size={15} color={type === 'expense' ? '#FFF' : '#94A3B8'} />
                <Text style={[styles.typeBtnText, type === 'expense' && styles.typeBtnActive]}>Gasto</Text>
              </TouchableOpacity>

              {/* Ahorro */}
              <TouchableOpacity
                style={[styles.typeBtn, type === 'ahorro' && { backgroundColor: '#6366F1' }]}
                onPress={() => { setType('ahorro'); setDescription('Ahorro'); }}
              >
                <Ionicons name="wallet" size={15} color={type === 'ahorro' ? '#FFF' : '#94A3B8'} />
                <Text style={[styles.typeBtnText, type === 'ahorro' && styles.typeBtnActive]}>Ahorro</Text>
              </TouchableOpacity>

              {/* Transferencia */}
              <TouchableOpacity
                style={[styles.typeBtn, type === 'transfer' && { backgroundColor: '#F59E0B' }]}
                onPress={() => { setType('transfer'); setDescription(''); }}
              >
                <MaterialIcons name="swap-horiz" size={15} color={type === 'transfer' ? '#FFF' : '#94A3B8'} />
                <Text style={[styles.typeBtnText, type === 'transfer' && styles.typeBtnActive]}>Mover</Text>
              </TouchableOpacity>
            </View>

            {/* ── Monto ─────────────────────────────────────────────────── */}
            <View style={[styles.amountCard, { backgroundColor: typeColor }]}>
              <Text style={styles.currSign}>$</Text>
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

            {/* ── Formulario ────────────────────────────────────────────── */}
            <View style={[styles.form, { backgroundColor: colors.card }]}>
              {/* Descripción */}
              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: typeColor + '18' }]}>
                  <MaterialIcons name="edit" size={20} color={typeColor} />
                </View>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={
                    type === 'ahorro' ? 'Nombre del ahorro (ej. Viaje)' :
                      type === 'income' ? 'Descripción (ej. Sueldo)' :
                        'Descripción (ej. Supermercado)'
                  }
                  placeholderTextColor="#94A3B8"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>

              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionLabel, { color: colors.sub }]}>Bancos y Efectivo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {['Efectivo', ...customAccounts.filter(a => !cardNames.includes(a))].map(acc => (
                  <TouchableOpacity
                    key={acc}
                    style={[
                      styles.catChip,
                      { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
                      account === acc && { backgroundColor: typeColor },
                    ]}
                    onPress={() => setAccount(acc)}
                    onLongPress={() => customAccounts.includes(acc) && handleDeleteCustomAccount(acc)}
                  >
                    <Text style={[
                      styles.catText,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                      account === acc && { color: '#FFF' },
                    ]}>
                      {acc}
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Botón + Nueva Cuenta */}
                <TouchableOpacity style={styles.catAddBtn} onPress={() => setAccountModalVisible(true)}>
                  <MaterialIcons name="add" size={15} color="#6366F1" />
                  <Text style={styles.catAddText}>Banco</Text>
                </TouchableOpacity>
              </ScrollView>

              {cardNames.length > 0 && (
                <>
                  <View style={[styles.separator, { backgroundColor: colors.border, marginTop: 12 }]} />
                  <Text style={[styles.sectionLabel, { color: colors.sub }]}>Tarjetas de Crédito</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    {cardNames.map(name => (
                      <TouchableOpacity
                        key={name}
                        style={[
                          styles.catChip,
                          { backgroundColor: isDark ? '#334155' : '#F1F5F9', borderColor: '#6366F120', borderWidth: 1 },
                          account === name && { backgroundColor: '#6366F1', borderColor: '#6366F1' },
                        ]}
                        onPress={() => setAccount(name)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialIcons name="credit-card" size={14} color={account === name ? '#FFF' : '#6366F1'} />
                          <Text style={[
                            styles.catText,
                            { color: isDark ? '#94A3B8' : '#64748B' },
                            account === name && { color: '#FFF' },
                          ]}>
                            {name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Cuenta destino (solo aplica para Transferencias) */}
              {type === 'transfer' && (
                <>
                  <View style={[styles.separator, { backgroundColor: colors.border }]} />
                  <Text style={[styles.sectionLabel, { color: colors.sub }]}>¿A dónde va el dinero?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    {[
                      'Efectivo',
                      ...customAccounts.filter(a => a !== account && !cardNames.includes(a)),
                      ...cardNames.filter(a => a !== account)
                    ].map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[
                          styles.catChip,
                          { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
                          destAccount === acc && { backgroundColor: '#F59E0B' },
                        ]}
                        onPress={() => setDestAccount(acc)}
                      >
                        <Text style={[
                          styles.catText,
                          { color: isDark ? '#94A3B8' : '#64748B' },
                          destAccount === acc && { color: '#FFF' },
                        ]}>
                          {acc}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Categorías (no aplica para Ahorro ni Transfer) */}
              {type !== 'ahorro' && type !== 'transfer' && (
                <>
                  <View style={[styles.separator, { backgroundColor: colors.border }]} />
                  <Text style={[styles.sectionLabel, { color: colors.sub }]}>Categoría</Text>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    {allCategories.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.catChip,
                          { backgroundColor: isDark ? '#334155' : '#F1F5F9' },
                          category === cat && { backgroundColor: typeColor },
                        ]}
                        onPress={() => setCategory(cat)}
                        onLongPress={() => customCategories.includes(cat) && handleDeleteCustomCategory(cat)}
                      >
                        <Text style={[
                          styles.catText,
                          { color: isDark ? '#94A3B8' : '#64748B' },
                          category === cat && { color: '#FFF' },
                        ]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    {/* Botón + Nueva */}
                    <TouchableOpacity style={styles.catAddBtn} onPress={() => setModalVisible(true)}>
                      <MaterialIcons name="add" size={15} color="#6366F1" />
                      <Text style={styles.catAddText}>Nueva</Text>
                    </TouchableOpacity>
                  </ScrollView>

                  {customCategories.length > 0 && (
                    <Text style={styles.hintText}>💡 Mantén presionada una categoría tuya para eliminarla</Text>
                  )}
                </>
              )}

              {/* Info box de Ahorro */}
              {type === 'ahorro' && (
                <View style={[styles.ahorroBox, { backgroundColor: '#6366F1' + '12' }]}>
                  <Ionicons name="information-circle" size={18} color="#6366F1" />
                  <Text style={styles.ahorroText}>
                    Este monto se restará de tu Dinero Activo y se sumará a tu Ahorro.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Botón Guardar ──────────────────────────────────────── */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: typeColor }, (!amount) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!amount}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={styles.saveBtnText}>
                {type === 'income' ? 'Guardar Ingreso' :
                  type === 'ahorro' ? 'Guardar Ahorro' : 'Guardar Gasto'}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Modal de nueva categoría ─────────────────────────────── */}
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
            >
              <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva categoría</Text>
                <Text style={[styles.modalSub, { color: colors.sub }]}>Elige una sugerencia o escribe la tuya</Text>

                {/* Sugeridas */}
                <Text style={[styles.modalSectionLabel, { color: colors.sub }]}>Sugeridas</Text>
                <View style={styles.suggestionsWrap}>
                  {SUGGESTED_EXTRAS
                    .filter(s =>
                      s.type === type &&
                      !customCategories.includes(s.label) &&
                      !DEFAULT_INCOME_CATS.includes(s.label) &&
                      !DEFAULT_EXPENSE_CATS.includes(s.label)
                    )
                    .map(s => (
                      <TouchableOpacity
                        key={s.label}
                        style={styles.suggestionChip}
                        onPress={() => { setCategory(s.label); setModalVisible(false); }}
                      >
                        <MaterialIcons name={s.icon as any} size={15} color="#6366F1" />
                        <Text style={styles.suggestionText}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                </View>

                {/* Crear nueva */}
                <Text style={[styles.modalSectionLabel, { color: colors.sub, marginTop: 18 }]}>Crear y guardar</Text>
                <View style={[styles.modalInputWrap, { borderColor: colors.border, backgroundColor: colors.input }]}>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text }]}
                    value={newCategoryName}
                    onChangeText={setNewCategoryName}
                    placeholder="Ej: Netflix, Mascota, Ropa..."
                    placeholderTextColor="#94A3B8"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleAddCustomCategory}
                  />
                </View>

                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.border }]}
                    onPress={() => { setModalVisible(false); setNewCategoryName(''); }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: '#6366F1' }]}
                    onPress={handleAddCustomCategory}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* ── Modal de nueva cuenta (banco) ─────────────────────────── */}
        <Modal visible={accountModalVisible} transparent animationType="slide" onRequestClose={() => setAccountModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 20}
            >
              <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Nuevo Banco / Cuenta</Text>
                <Text style={[styles.modalSub, { color: colors.sub }]}>Escribe el nombre del banco o cuenta</Text>

                <View style={[styles.modalInputWrap, { borderColor: colors.border, backgroundColor: colors.input }]}>
                  <TextInput
                    style={[styles.modalInput, { color: colors.text }]}
                    value={newAccountName}
                    onChangeText={setNewAccountName}
                    placeholder="Ej: Bancolombia, Nequi, Daviplata..."
                    placeholderTextColor="#94A3B8"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleAddCustomAccount}
                  />
                </View>

                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.border }]}
                    onPress={() => { setAccountModalVisible(false); setNewAccountName(''); }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: '#6366F1' }]}
                    onPress={handleAddCustomAccount}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* ── Modal Sugerencia Ahorro Inteligente ─────────────────── */}
        <Modal visible={savingsModalVisible} transparent animationType="fade">
          <View style={[styles.modalOverlay, { justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }]}>
            <View style={[styles.savingsSuggestionCard, { backgroundColor: colors.card }]}>
              <View style={styles.savingsIconWrap}>
                <MaterialIcons name="auto-awesome" size={32} color="#6366F1" />
              </View>
              
              <Text style={[styles.savingsTitle, { color: colors.text }]}>Sugerencia Inteligente</Text>
              <Text style={[styles.savingsSub, { color: colors.sub }]}>
                {savingsMessage}
              </Text>

              <View style={styles.savingsAmountPill}>
                <Text style={{fontSize: 12, color: colors.sub, fontWeight: '700', marginBottom: 2}}>Ahorro sugerido ({savingsPercentage}%)</Text>
                <Text style={styles.savingsAmountText}>
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(savingsSuggestion)}
                </Text>
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.border }]}
                  onPress={() => confirmSaveWithSavings(false)}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Solo guardar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#6366F1' }]}
                  onPress={() => confirmSaveWithSavings(true)}
                >
                  <Text style={{ color: '#FFF', fontWeight: '800' }}>Sí, ahorrar</Text>
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
  scroll: { padding: 20, paddingTop: Platform.OS === 'android' ? 50 : 20 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 20 },

  typeSelector: {
    flexDirection: 'row', borderRadius: 16, padding: 5, marginBottom: 20, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 12, borderRadius: 13, gap: 5,
  },
  typeBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  typeBtnActive: { color: '#FFF' },

  amountCard: {
    borderRadius: 20, padding: 20, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', marginBottom: 16,
  },
  currSign: { color: '#FFF', fontSize: 24, fontWeight: '800', marginRight: 4 },
  amountInput: { color: '#FFF', fontSize: 36, fontWeight: '800', minWidth: 100, textAlign: 'center' },

  form: {
    borderRadius: 20, padding: 16, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  inputIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  textInput: { flex: 1, fontSize: 16 },
  separator: { height: 1, marginVertical: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },

  catRow: { gap: 8, paddingBottom: 6 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  catText: { fontSize: 13, fontWeight: '600' },
  catAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(99,102,241,0.1)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#6366F1',
  },
  catAddText: { fontSize: 13, fontWeight: '700', color: '#6366F1' },
  hintText: { fontSize: 11, color: '#94A3B8', marginTop: 8 },

  ahorroBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 12, padding: 12, gap: 8, marginTop: 8,
  },
  ahorroText: { flex: 1, fontSize: 13, color: '#64748B', lineHeight: 18 },

  saveBtn: {
    borderRadius: 16, height: 56,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 14, marginBottom: 18 },
  modalSectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  suggestionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(99,102,241,0.1)', paddingVertical: 8,
    paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)',
  },
  suggestionText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  modalInputWrap: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 50, justifyContent: 'center', marginBottom: 20 },
  modalInput: { fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  // Savings Suggestion Styles
  savingsSuggestionCard: {
    marginHorizontal: 30,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  savingsIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: 'rgba(99,102,241,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  savingsTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  savingsSub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  savingsAmountPill: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    marginBottom: 24,
  },
  savingsAmountText: {
    color: '#10B981',
    fontSize: 24,
    fontWeight: '900',
  },
});

