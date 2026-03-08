import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Platform, SafeAreaView, ScrollView, StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const screenWidth = Dimensions.get('window').width;

const getColors = (t: string) => {
  switch (t) {
    case 'pink': return { bg: '#FDF2F8', card: '#FBCFE8', text: '#831843', sub: '#DB2777', border: '#F9A8D4' };
    case 'purple': return { bg: '#F5F3FF', card: '#ddd6fe', text: '#4C1D95', sub: '#7C3AED', border: '#C4B5FD' };
    case 'blue': return { bg: '#EFF6FF', card: '#bfdbfe', text: '#1E3A8A', sub: '#3B82F6', border: '#93C5FD' };
    case 'dark': return { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155' };
    default: return { bg: '#F4F6FF', card: '#FFFFFF', text: '#1E293B', sub: '#64748B', border: '#E2E8F0' };
  }
};

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, logout, theme, toggleTheme } = useAuth();
  const isDark = theme === 'dark' || ['purple', 'blue', 'pink'].includes(theme);
  const colorsNav = getColors(theme);

  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [ahorro, setAhorro] = useState(0);
  const [debtTotal, setDebtTotal] = useState(0);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [upcomingDebts, setUpcomingDebts] = useState<any[]>([]);
  const [accountTotals, setAccountTotals] = useState<any>({});
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [ahorroMes, setAhorroMes] = useState(0);
  const [pendingItems, setPendingItems] = useState<any[]>([]);

  useEffect(() => {
    if (isFocused) loadData();
  }, [isFocused]);

  const loadData = async () => {
    if (!user) return;
    try {
      // 1. Cargar todas las transacciones
      const { data: allTx, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('id', { ascending: false });

      if (txError) throw txError;

      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      let inc = 0, expGastos = 0, savTotal = 0, savMes = 0;
      let accs: any = {};

      allTx?.forEach(tx => {
        const txDate = new Date(tx.date);
        const isThisMonth = txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;

        if (tx.type === 'income') {
          const acc = tx.account || 'Efectivo';
          if (!accs[acc]) accs[acc] = 0;
          if (isThisMonth) inc += tx.amount;
          accs[acc] += tx.amount;
        } else {
          // Es un gasto o un ahorro
          if (tx.category === 'Ahorro') {
            savTotal += tx.amount;
            if (isThisMonth) savMes += tx.amount;
          } else {
            if (isThisMonth) expGastos += tx.amount;
          }

          // El dinero sale de la cuenta activa (Efectivo/Nequi/etc)
          // Si por error el "account" dice "Ahorro", lo tratamos como Efectivo para el saldo
          const acc = (tx.account === 'Ahorro' || !tx.account) ? 'Efectivo' : tx.account;
          if (!accs[acc]) accs[acc] = 0;
          accs[acc] -= tx.amount;
        }
      });

      setIngresos(inc);
      setGastos(expGastos);
      setAhorro(savTotal);
      setAhorroMes(savMes);
      setAccountTotals(accs);
      setRecentTx(allTx?.slice(0, 4) || []);

      // 2. Cargar Deudas
      const { data: allDebts, error: debtError } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user.id);

      if (debtError) throw debtError;

      const onlyDebts = allDebts?.filter(d => d.debt_type === 'debt' && d.paid < d.value) || [];
      const totalDue = onlyDebts.reduce((sum, d) => sum + (Number(d.value) - Number(d.paid || 0)), 0);
      setDebtTotal(totalDue);
      setUpcomingDebts([]); // No longer used in main screen but keep state for now

      const parseDateStr = (dateStr: string) => {
        if (!dateStr) return new Date();
        const cleanStr = dateStr.trim();

        // Formato DD/MM/YYYY
        if (cleanStr.includes('/')) {
          const parts = cleanStr.split('/');
          if (parts.length >= 3) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const y = parseInt(parts[2], 10);
            return new Date(y, m - 1, d);
          }
        }

        // Formato YYYY-MM-DD o similar del sistema con guiones
        if (cleanStr.includes('-')) {
          const parts = cleanStr.split('-');
          if (parts.length >= 3) {
            const p1 = parseInt(parts[0], 10);
            const p2 = parseInt(parts[1], 10);
            const p3 = parseInt(parts[2], 10);

            // Si parece YYYY-MM-DD (primer parte es el año)
            if (p1 > 1000) {
              // Manejo inteligente: si el segundo número > 12, es el día (YYYY-DD-MM)
              if (p2 > 12) return new Date(p1, p3 - 1, p2);
              return new Date(p1, p2 - 1, p3);
            }
            // Si parece DD-MM-YYYY (primer parte es día o mes, y el tercero es año)
            if (p3 > 1000) return new Date(p3, p2 - 1, p1);
          }
        }

        const date = new Date(cleanStr);
        return isNaN(date.getTime()) ? new Date() : date;
      };

      // 3. Identificar notificaciones (Deudas urgentes o Gastos Fijos pendientes)
      const urgent = allDebts?.filter((d: any) => {
        if (d.paid >= d.value) return false;
        try {
          const targetDate = parseDateStr(d.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          let checkDate = new Date(targetDate);
          if (d.debt_type === 'fixed') {
            // Para gastos fijos, evaluamos el día del mes actual
            checkDate = new Date(today.getFullYear(), today.getMonth(), targetDate.getDate());
          }
          checkDate.setHours(0, 0, 0, 0);

          const diffTime = checkDate.getTime() - today.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          // REQUERIMIENTO: Notificar solo cuando falten 3 días o menos.
          // También incluimos las vencidas recientemente (últimos 7 días) para que no se pierdan,
          // pero ignoramos deudas viejas o muy lejanas en el futuro.
          return diffDays <= 3 && diffDays >= -7;
        } catch (e) { return false; }
      }) || [];
      setPendingItems(urgent);

    } catch (e) { console.error('Error cargando datos de Supabase:', e); }
  };

  const dineroActivo = ingresos - gastos - ahorroMes;

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', minimumFractionDigits: 0
    }).format(n);

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar sesión',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          }
        },
      ]
    );
  };

  const displayName = user?.user_metadata?.name || 'Usuario';
  const initials = displayName
    .trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colorsNav.text }]}>¡Hola, {displayName.split(' ')[0]} 👋</Text>
            <Text style={styles.subtitle}>Resumen del mes</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.headerIcon, { backgroundColor: colorsNav.card, borderColor: colorsNav.border, borderWidth: 1 }]}
              onPress={() => setNotificationsVisible(true)}
            >
              <Ionicons name="notifications-outline" size={20} color={colorsNav.text} />
              {pendingItems.length > 0 && <View style={styles.notifBadge} />}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.headerIcon, { backgroundColor: theme === 'dark' ? '#334155' : theme === 'purple' ? '#C4B5FD' : theme === 'blue' ? '#93C5FD' : theme === 'pink' ? '#F9A8D4' : '#6366F1' }]} onPress={toggleTheme}>
              <Ionicons name={theme === 'dark' ? 'moon' : theme === 'purple' ? 'color-palette' : theme === 'blue' ? 'water' : theme === 'pink' ? 'flower' : 'sunny'} size={20} color={theme === 'purple' ? '#4C1D95' : theme === 'blue' ? '#1E3A8A' : theme === 'pink' ? '#831843' : '#FFF'} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.avatar} onPress={handleLogout} activeOpacity={0.8}>
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance Card */}
        <TouchableOpacity
          style={[styles.balanceCard, theme === 'purple' && { backgroundColor: '#7C3AED' }, theme === 'blue' && { backgroundColor: '#2563EB' }, theme === 'pink' && { backgroundColor: '#DB2777' }]}
          activeOpacity={0.9}
          onPress={() => setBreakdownVisible(true)}
        >
          <View style={styles.balanceCardInner}>
            <Text style={styles.balanceLabel}>Dinero Activo</Text>
            <Text style={styles.balanceAmount}>{fmt(dineroActivo)}</Text>
            <Text style={styles.balanceSubLabel}>Ingresos − Gastos − Ahorros</Text>
            <View style={styles.breakdownHint}>
              <Ionicons name="stats-chart" size={10} color="rgba(255,255,255,0.4)" />
              <Text style={styles.breakdownHintText}>Ver desglose</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <MaterialIcons name="trending-up" size={16} color="#10B981" />
              <View>
                <Text style={styles.pillLabel}>Ingresos</Text>
                <Text style={styles.pillValue}>{fmt(ingresos)}</Text>
              </View>
            </View>
            <View style={styles.statPill}>
              <MaterialIcons name="trending-down" size={16} color="#EF4444" />
              <View>
                <Text style={styles.pillLabel}>Gastos</Text>
                <Text style={styles.pillValue}>{fmt(gastos)}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Ahorro & Deudas */}
        <View style={styles.widgetsRow}>
          <TouchableOpacity
            style={[styles.widgetCard, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}
            activeOpacity={0.8}
            onPress={() => router.push('/goals')}
          >
            <View style={styles.widgetTopRow}>
              <Ionicons name="flag-outline" size={22} color="#6366F1" />
            </View>
            <Text style={styles.widgetLabel}>Ahorro Total</Text>
            <Text style={[styles.widgetValue, { color: colorsNav.text }]}>{fmt(ahorro)}</Text>
            <Text style={styles.widgetSubLabelPurple}>Ver mis metas →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.widgetCard, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/debts')}
          >
            <View style={styles.widgetTopRow}>
              <MaterialIcons name="credit-card" size={22} color="#EF4444" />
            </View>
            <Text style={styles.widgetLabel}>Deudas</Text>
            <Text style={styles.widgetValueAlert}>{fmt(debtTotal)}</Text>
            <Text style={styles.widgetSubLabel}>Ver deudas →</Text>
          </TouchableOpacity>
        </View>

        {/* Últimas Transacciones */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Últimas Transacciones</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
              <Text style={styles.seeAll}>Ver todas →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.transactionList}>
            {recentTx.length === 0 ? (
              <Text style={styles.emptyText}>No hay transacciones recientes</Text>
            ) : (
              recentTx.map((tx) => (
                <View key={tx.id} style={[styles.txItem, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
                  <View style={[
                    styles.txIcon,
                    tx.type === 'income' ? styles.txIconIn : tx.category === 'Ahorro' ? styles.txIconSave : styles.txIconOut
                  ]}>
                    <MaterialIcons
                      name={tx.type === 'income' ? 'trending-up' : tx.category === 'Ahorro' ? 'savings' : 'trending-down'}
                      size={20}
                      color={tx.type === 'income' ? '#10B981' : tx.category === 'Ahorro' ? (isDark ? '#A5B4FC' : '#6366F1') : '#EF4444'}
                    />
                  </View>
                  <View style={styles.txMeta}>
                    <Text style={[styles.txTitle, { color: colorsNav.text }]}>
                      {tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description}
                    </Text>
                    <Text style={styles.txSub}>{tx.category} • {new Date(tx.date).toLocaleDateString('es-CO')}</Text>
                  </View>
                  <Text style={[
                    styles.txAmount,
                    tx.type === 'income' ? styles.txIn : tx.category === 'Ahorro' ? styles.txSave : styles.txOut,
                    isDark && tx.category === 'Ahorro' && { color: '#818CF8' }
                  ]}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modal de Notificaciones ─────────────────────────────── */}
      <Modal visible={notificationsVisible} transparent animationType="fade" onRequestClose={() => setNotificationsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.breakdownCard, { backgroundColor: colorsNav.card, maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.breakdownTitle, { color: colorsNav.text, marginBottom: 0 }]}>Notificaciones</Text>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)}>
                <Ionicons name="close" size={24} color={colorsNav.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {pendingItems.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Ionicons name="notifications-off-outline" size={40} color={colorsNav.sub} />
                  <Text style={{ color: colorsNav.sub, marginTop: 12, textAlign: 'center' }}>No tienes pagos próximos o vencidos.</Text>
                </View>
              ) : (
                pendingItems.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.txItem, { backgroundColor: theme === 'dark' ? '#2A3447' : '#F8FAFF', marginBottom: 10, padding: 12 }]}
                    onPress={() => {
                      setNotificationsVisible(false);
                      router.push('/(tabs)/debts');
                    }}
                  >
                    <View style={[styles.txIcon, { backgroundColor: item.debt_type === 'fixed' ? '#F59E0B20' : '#EF444420' }]}>
                      <MaterialIcons
                        name={item.debt_type === 'fixed' ? 'repeat' : 'credit-card'}
                        size={20}
                        color={item.debt_type === 'fixed' ? '#F59E0B' : '#EF4444'}
                      />
                    </View>
                    <View style={styles.txMeta}>
                      <Text style={[styles.txTitle, { color: colorsNav.text }]}>{item.client}</Text>
                      <Text style={styles.txSub}>Vence: {item.due_date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: item.debt_type === 'fixed' ? '#F59E0B' : '#EF4444' }]}>
                      {fmt(item.value - item.paid)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: colorsNav.border, marginTop: 20 }]}
              onPress={() => setNotificationsVisible(false)}
            >
              <Text style={[styles.closeBtnText, { color: colorsNav.text }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Breakdown Modal */}
      <Modal visible={breakdownVisible} transparent animationType="fade" onRequestClose={() => setBreakdownVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBreakdownVisible(false)}>
          <View style={[styles.breakdownCard, { backgroundColor: colorsNav.card }]}>
            <Text style={[styles.breakdownTitle, { color: colorsNav.text }]}>Distribución de Dinero</Text>
            <View style={styles.breakdownList}>
              {Object.entries(accountTotals)
                .filter(([name]) => name !== 'Ahorro')
                .map(([name, total]) => (
                  <View key={name} style={[styles.breakdownItem, { borderBottomColor: colorsNav.border }]}>
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.accIcon, { backgroundColor: name === 'Efectivo' ? '#10B98120' : '#6366F120' }]}>
                        <MaterialIcons
                          name={name === 'Efectivo' ? 'money' : name === 'Transferencia' ? 'account-balance' : 'wallet'}
                          size={20}
                          color={name === 'Efectivo' ? '#10B981' : '#6366F1'}
                        />
                      </View>
                      <Text style={[styles.accName, { color: colorsNav.text }]}>{name}</Text>
                    </View>
                    <Text style={[styles.accValue, { color: colorsNav.text }]}>{fmt(total as number)}</Text>
                  </View>
                ))}
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colorsNav.sub + '20' }]} onPress={() => setBreakdownVisible(false)}>
              <Text style={[styles.closeBtnText, { color: colorsNav.text }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FF' },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    paddingBottom: 100,
  },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: '#1E293B' },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '800', fontSize: 13 },

  // Balance Card
  balanceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 28,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  balanceCardInner: { alignItems: 'center', marginBottom: 24 },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  balanceAmount: { color: '#FFF', fontSize: 36, fontWeight: '900' },
  balanceSubLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 8 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statPill: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  dotRed: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  pillLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
  pillValue: { color: '#FFF', fontSize: 14, fontWeight: '700', marginTop: 2 },

  // Widgets
  widgetsRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  widgetCard: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 24, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 4,
  },
  widgetTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  widgetLabel: { color: '#64748B', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  widgetValue: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  widgetValueAlert: { fontSize: 18, fontWeight: '800', color: '#EF4444' },
  widgetSubLabel: { fontSize: 11, color: '#94A3B8', marginTop: 8 },
  widgetSubLabelPurple: { fontSize: 11, color: '#6366F1', marginTop: 8, fontWeight: '600' },

  // Sections
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  seeAll: { fontSize: 13, color: '#6366F1', fontWeight: '600' },

  transactionList: { gap: 12 },
  txItem: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  txIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  txIconIn: { backgroundColor: 'rgba(16,185,129,0.1)' },
  txIconOut: { backgroundColor: 'rgba(239,68,68,0.1)' },
  txIconSave: { backgroundColor: 'rgba(99,102,241,0.1)' },
  txMeta: { flex: 1, marginLeft: 12 },
  txTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  txSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '800' },
  txIn: { color: '#10B981' },
  txOut: { color: '#EF4444' },
  txSave: { color: '#6366F1' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 20 },

  sectionContainer: { marginTop: 24 },
  breakdownCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  breakdownTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 20,
    textAlign: 'center',
  },
  breakdownList: {
    marginBottom: 20,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  accName: {
    fontSize: 16,
    fontWeight: '600',
  },
  accValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  breakdownHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    opacity: 0.8,
  },
  breakdownHintText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
