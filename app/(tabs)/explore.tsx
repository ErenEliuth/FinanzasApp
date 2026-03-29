import { useAuth } from '@/utils/auth';
import { syncUp } from '@/utils/sync';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
// Eliminado: MagicAuraButton
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
  // Eliminado: estados de sugerencia inteligente de ahorro

  const router = useRouter();
  const { user, theme } = useAuth();
  const isDark = theme === 'dark';

  // ── Zenly Palette ──
  const colors = isDark 
    ? {
        bg: '#1A1A2E',
        card: '#25253D',
        text: '#F5F0E8',
        sub: '#A09B8C',
        border: '#3A3A52',
        accent: '#4A7C59',
        lightAccent: '#4A7C5930',
        input: '#1A1A2E',
      }
    : {
        bg: '#FFF8F0',
        card: '#FFFFFF',
        text: '#2D2D2D',
        sub: '#8B8680',
        border: '#F0E8DC',
        accent: '#4A7C59',
        lightAccent: '#E8F5E9',
        input: '#F5EDE0',
      };

  const typeColor =
    type === 'income' ? '#4A7C59' :
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

    // ─── Validación de Saldo (Solo para Gasto / Ahorro / Transferencia) ──────────
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
              `No tienes fondos suficientes en "${account}".\n\nDisponible: ${fmtCOP(balance)}\nRequerido: ${fmtCOP(parsed)}`
            );
            return;
          }
        }
      } catch (e) { console.error('Error validando saldo:', e); }
    }

    if (type === 'transfer') {
      if (!destAccount || destAccount === account) {
        Alert.alert('Error', 'Selecciona una cuenta de destino diferente.');
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
      } catch (e) { console.error('Error transfiriendo:', e); }
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
      setAmount(''); setDescription(''); setCategory('');
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    } catch (e) { console.error('Error guardando transacción:', e); }
  };

// Eliminado: confirmSaveWithSavings

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

            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Nueva Transacción</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
{/* Eliminado: MagicAuraButton */}
                <TouchableOpacity onPress={() => router.back()} style={[styles.closeBtn, { backgroundColor: colors.card }]}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Selector de Tipo: Sanctuary Cards ─────────────── */}
            <View style={[styles.typeList, { backgroundColor: colors.card }]}>
              {[
                { id: 'income', label: 'Ingreso', icon: 'trending-up', c: '#4A7C59' },
                { id: 'expense', label: 'Gasto', icon: 'trending-down', c: '#EF4444' },
                { id: 'ahorro', label: 'Ahorro', icon: 'wallet', c: '#6366F1' },
                { id: 'transfer', label: 'Mover', icon: 'swap-horiz', c: '#F59E0B' },
              ].map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.typeItem, type === t.id && { backgroundColor: t.c + '15', borderColor: t.c }]}
                  onPress={() => { setType(t.id as TxType); setDescription(t.id === 'ahorro' ? 'Ahorro' : ''); }}
                >
                  <MaterialIcons name={t.icon as any} size={18} color={type === t.id ? t.c : colors.sub} />
                  <Text style={[styles.typeItemText, { color: type === t.id ? t.c : colors.sub }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
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

            {/* ── Formulario Zenly ────────────────────────────────────── */}
            <View style={[styles.form, { backgroundColor: colors.card }]}>
              {/* Descripción */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.sub }]}>Descripción</Text>
                <View style={[styles.inputContainer, { backgroundColor: colors.bg }]}>
                  <TextInput
                    style={[styles.textInput, { color: colors.text }]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Ej. Supermercado, Nómina..."
                    placeholderTextColor={colors.sub + '80'}
                  />
                </View>
              </View>

              {/* Cuentas */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Cuenta</Text>
                  <TouchableOpacity onPress={() => setAccountModalVisible(true)}>
                    <MaterialIcons name="add-circle" size={24} color={colors.accent} />
                  </TouchableOpacity>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {['Efectivo', ...customAccounts.filter(a => !cardNames.includes(a))].map(acc => (
                    <TouchableOpacity
                      key={acc}
                      style={[styles.chip, { backgroundColor: colors.bg }, account === acc && { backgroundColor: colors.accent }]}
                      onPress={() => setAccount(acc)}
                      onLongPress={() => customAccounts.includes(acc) && handleDeleteCustomAccount(acc)}
                    >
                      <Text style={[styles.chipText, { color: colors.sub }, account === acc && { color: '#FFF' }]}>{acc}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Tarjetas de Crédito (Solo para Ingreso o Gasto) */}
              {cardNames.length > 0 && type !== 'ahorro' && type !== 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Tarjetas de Crédito</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {cardNames.map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[styles.chip, { backgroundColor: colors.bg, borderColor: '#6366F140', borderWidth: 1 }, account === acc && { backgroundColor: '#6366F1', borderColor: '#6366F1' }]}
                        onPress={() => setAccount(acc)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialIcons name="credit-card" size={14} color={account === acc ? '#FFF' : '#6366F1'} />
                          <Text style={[styles.chipText, { color: colors.sub }, account === acc && { color: '#FFF' }]}>{acc}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Categoría */}
              {type !== 'ahorro' && type !== 'transfer' && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Categoría</Text>
                    <TouchableOpacity onPress={() => setModalVisible(true)}>
                      <MaterialIcons name="add-circle" size={24} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {allCategories.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.chip, { backgroundColor: colors.bg }, category === cat && { backgroundColor: typeColor }]}
                        onPress={() => setCategory(cat)}
                        onLongPress={() => customCategories.includes(cat) && handleDeleteCustomCategory(cat)}
                      >
                        <Text style={[styles.chipText, { color: colors.sub }, category === cat && { color: '#FFF' }]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Destino (Transferencia) */}
              {type === 'transfer' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Destino</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {['Efectivo', ...customAccounts.filter(a => !cardNames.includes(a))].filter(a => a !== account).map(acc => (
                      <TouchableOpacity
                        key={acc}
                        style={[styles.chip, { backgroundColor: colors.bg }, destAccount === acc && { backgroundColor: typeColor }]}
                        onPress={() => setDestAccount(acc)}
                      >
                        <Text style={[styles.chipText, { color: colors.sub }, destAccount === acc && { color: '#FFF' }]}>{acc}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {/* Nota: Las tarjetas se ocultan para Mover y Ahorro según petición del usuario */}
              </View>
              )}
            </View>

            {/* ── Botón Guardar ──────────────────────────────────────── */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: typeColor }, !amount && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!amount}
            >
              <Text style={styles.saveBtnText}>Guardar Movimiento</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>

            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Modales Sanctuary */}
        <Modal visible={modalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva Categoría</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                  value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Ej. Suscripciones"
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setModalVisible(false)}>
                    <Text style={{ color: colors.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.accent }]} onPress={handleAddCustomCategory}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
             </View>
          </View>
        </Modal>

        <Modal visible={accountModalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
             <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva Cuenta</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
                  value={newAccountName} onChangeText={setNewAccountName} placeholder="Ej. Bancolombia"
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setAccountModalVisible(false)}>
                    <Text style={{ color: colors.text }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.accent }]} onPress={handleAddCustomAccount}>
                    <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text>
                  </TouchableOpacity>
                </View>
             </View>
          </View>
        </Modal>

{/* Eliminado: Modal de Sugerencia Inteligente */}
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

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
  suggestionPill: { padding: 24, borderRadius: 28, alignItems: 'center', width: '100%', elevation: 4, shadowColor: '#4A7C59', shadowOpacity: 0.3, shadowRadius: 15, marginVertical: 12 },
  suggestionAmt: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  suggestionLab: { fontSize: 13, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
});
