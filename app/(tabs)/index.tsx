import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform, SafeAreaView, ScrollView, StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { PieChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get('window').width;

const getColors = (isDark: boolean) => ({
  bg: isDark ? '#0F172A' : '#F4F6FF',
  card: isDark ? '#1E293B' : '#FFFFFF',
  text: isDark ? '#F1F5F9' : '#1E293B',
  sub: isDark ? '#94A3B8' : '#64748B',
  border: isDark ? '#334155' : '#E2E8F0',
});

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, logout, theme, toggleTheme } = useAuth();
  const colorsNav = getColors(theme === 'dark');

  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [ahorro, setAhorro] = useState(0);
  const [debtTotal, setDebtTotal] = useState(0);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [upcomingDebts, setUpcomingDebts] = useState<any[]>([]);

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
        .order('id', { ascending: false });

      if (txError) throw txError;

      let inc = 0, expGastos = 0, sav = 0;
      allTx?.forEach(tx => {
        if (tx.type === 'income') {
          inc += tx.amount;
        } else {
          if (tx.category === 'Ahorro') {
            sav += tx.amount;
          } else {
            expGastos += tx.amount;
          }
        }
      });

      setIngresos(inc);
      setGastos(expGastos);
      setAhorro(sav);
      setRecentTx(allTx?.slice(0, 4) || []);

      // 2. Gráfica de categorías
      const catTotals: { [key: string]: number } = {};
      allTx?.filter(tx => tx.type === 'expense' && tx.category !== 'Ahorro').forEach(tx => {
        catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
      });

      const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'];
      const chartData = Object.entries(catTotals).map(([name, population], idx) => ({
        name: name.substring(0, 10),
        population,
        color: colors[idx % colors.length],
        legendFontColor: theme === 'dark' ? '#94A3B8' : '#64748B',
        legendFontSize: 12
      }));
      setCategoryData(chartData);

      // 3. Cargar Deudas
      const { data: allDebts, error: debtError } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user.id);

      if (debtError) throw debtError;

      const activeDebts = allDebts?.filter(d => d.paid < d.value) || [];
      const totalDue = activeDebts.reduce((sum, d) => sum + (d.value - d.paid), 0);
      setDebtTotal(totalDue);

      // Deudas próximas
      const sortedDebts = activeDebts.sort((a, b) => {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }).slice(0, 3);
      setUpcomingDebts(sortedDebts);

    } catch (e) { console.error('Error cargando datos de Supabase:', e); }
  };

  const dineroActivo = ingresos - gastos - ahorro;


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
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={[styles.avatar, { backgroundColor: theme === 'dark' ? '#334155' : '#6366F1' }]} onPress={toggleTheme}>
              <Ionicons name={theme === 'dark' ? 'sunny' : 'moon'} size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatar} onPress={handleLogout} activeOpacity={0.8}>
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Balance Card */}
        <View style={[styles.balanceCard, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
          <View style={styles.balanceCardInner}>
            <Text style={styles.balanceLabel}>Dinero Activo</Text>
            <Text style={styles.balanceAmount}>{fmt(dineroActivo)}</Text>
            <Text style={styles.balanceSubLabel}>Ingresos − Gastos − Ahorro</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <View style={styles.dotGreen} />
              <View>
                <Text style={styles.pillLabel}>Ingresos</Text>
                <Text style={styles.pillValue}>{fmt(ingresos)}</Text>
              </View>
            </View>
            <View style={styles.statPill}>
              <View style={styles.dotRed} />
              <View>
                <Text style={styles.pillLabel}>Gastos</Text>
                <Text style={styles.pillValue}>{fmt(gastos)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Ahorro & Deudas */}
        <View style={styles.widgetsRow}>
          <TouchableOpacity
            style={[styles.widgetCard, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}
            activeOpacity={0.8}
            onPress={() => router.push('/goals')}
          >
            <View style={styles.widgetTopRow}>
              <Ionicons name="flag-outline" size={22} color="#6366F1" />
              <View style={styles.widgetAddBtn}>
                <MaterialIcons name="add" size={16} color="#6366F1" />
              </View>
            </View>
            <Text style={styles.widgetLabel}>Metas / Ahorros</Text>
            <Text style={styles.widgetValue}>{fmt(ahorro)}</Text>
            <Text style={styles.widgetSubLabelPurple}>Crear o ver metas →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.widgetCard, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/debts')}
          >
            <MaterialIcons name="credit-card" size={22} color="#EF4444" />
            <Text style={styles.widgetLabel}>Deudas</Text>
            <Text style={styles.widgetValueAlert}>{fmt(debtTotal)}</Text>
            <Text style={styles.widgetSubLabel}>Ver deudas →</Text>
          </TouchableOpacity>
        </View>

        {/* Visual Insights Section */}
        {categoryData.length > 0 && (
          <View style={[styles.chartContainer, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Distribución de Gastos</Text>
            <View style={styles.chartWrapper}>
              <PieChart
                data={categoryData}
                width={screenWidth - 40}
                height={200}
                chartConfig={{
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                }}
                accessor={"population"}
                backgroundColor={"transparent"}
                paddingLeft={"15"}
                center={[10, 0]}
                absolute
              />
            </View>
          </View>
        )}

        {/* Upcoming Payments / Reminders */}
        {upcomingDebts.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Próximos Vencimientos</Text>
            </View>
            <View style={styles.remindersList}>
              {upcomingDebts.map(debt => {
                const [d, m, y] = debt.due_date.split('/').map(Number);
                const diff = (new Date(y, m - 1, d).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000;
                const color = diff < 0 ? '#EF4444' : diff < 3 ? '#F59E0B' : '#10B981';
                return (
                  <TouchableOpacity
                    key={debt.id}
                    style={[styles.reminderItem, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}
                    onPress={() => router.push('/(tabs)/debts')}
                  >
                    <View style={[styles.reminderDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reminderTitle, { color: colorsNav.text }]}>{debt.client}</Text>
                      <Text style={styles.reminderSub}>{debt.due_date} · {diff < 0 ? 'Vencido' : diff === 0 ? 'Hoy' : `En ${Math.ceil(diff)}d`}</Text>
                    </View>
                    <Text style={[styles.reminderAmount, { color: colorsNav.text }]}>{fmt(debt.value - debt.paid)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Recent transactions preview */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Recientes</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
            <Text style={styles.seeAll}>Ver todos →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transactionList}>
          {recentTx.length === 0 && (
            <Text style={styles.emptyText}>Sin transacciones aún</Text>
          )}
          {recentTx.map((tx) => (
            <View key={tx.id} style={[styles.txItem, theme === 'dark' && { backgroundColor: '#1E293B', borderColor: '#334155', borderWidth: 1 }]}>
              <View style={[styles.txIcon,
              tx.category === 'Ahorro'
                ? styles.txIconSave
                : tx.type === 'income'
                  ? styles.txIconIn
                  : styles.txIconOut
              ]}>
                <MaterialIcons
                  name={
                    tx.category === 'Ahorro'
                      ? 'savings'
                      : tx.type === 'income'
                        ? 'arrow-downward'
                        : 'arrow-upward'
                  }
                  size={18}
                  color={
                    tx.category === 'Ahorro'
                      ? '#6366F1'
                      : tx.type === 'income'
                        ? '#10B981'
                        : '#EF4444'
                  }
                />
              </View>
              <View style={styles.txMeta}>
                <Text style={[styles.txTitle, { color: colorsNav.text }]}>{tx.description}</Text>
                <Text style={styles.txSub}>{tx.category} · {tx.date}</Text>
              </View>
              <Text style={[
                styles.txAmount,
                tx.category === 'Ahorro'
                  ? styles.txSave
                  : tx.type === 'income'
                    ? styles.txIn
                    : styles.txOut
              ]}>
                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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

  chartContainer: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  chartWrapper: {
    alignItems: 'center',
    marginTop: 10,
  },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: '#1E293B' },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 2 },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#6366F1',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '800', fontSize: 16 },

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
  widgetAddBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(99,102,241,0.1)', justifyContent: 'center', alignItems: 'center' },
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
  txOut: { color: '#1E293B' },
  txSave: { color: '#6366F1' },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 20 },

  sectionContainer: { marginTop: 24 },
  remindersList: { gap: 10 },
  reminderItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 16, padding: 12, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 6, elevation: 2,
  },
  reminderDot: { width: 8, height: 8, borderRadius: 4 },
  reminderTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  reminderSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  reminderAmount: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
});
