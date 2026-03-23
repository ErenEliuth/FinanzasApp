import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  if (t === 'dark') {
    return { bg: '#0F172A', card: '#1E293B', text: '#F1F5F9', sub: '#94A3B8', border: '#334155', accent: '#6366F1' };
  }
  return { bg: '#F8FAFF', card: '#FFFFFF', text: '#1E293B', sub: '#64748B', border: '#E2E8F0', accent: '#6366F1' };
};

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, logout, theme, toggleTheme, isHidden, toggleHiddenMode } = useAuth();
  const isDark = theme === 'dark';
  const colorsNav = getColors(theme);

  const [ingresos, setIngresos] = useState(0);
  const [gastos, setGastos] = useState(0);
  const [ahorro, setAhorro] = useState(0);
  const [ahorroMes, setAhorroMes] = useState(0);
  const [debtTotal, setDebtTotal] = useState(0);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [upcomingDebts, setUpcomingDebts] = useState<any[]>([]);
  const [accountTotals, setAccountTotals] = useState<any>({});
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [userCards, setUserCards] = useState<string[]>([]);
  const [isRealBalanceCollapsed, setIsRealBalanceCollapsed] = useState(true);

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

      // Cargar nombres de tarjetas para identificar qué cuentas son de crédito
      let cardNames: string[] = [];
      try {
        const storedCards = await AsyncStorage.getItem(`@cards_${user.id}`);
        if (storedCards) {
          const parsed = JSON.parse(storedCards);
          cardNames = parsed.map((c: any) => c.name);
          setUserCards(cardNames);
        }
      } catch (e) { }

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

          // Si el gasto es de tarjeta de crédito, no debería restar del flujo de caja "líquido" del mes
          // porque el dinero físico todavía está en tu poder.
          // Pero depende de cómo el usuario quiera ver su balance.
          // Actualmente, el balance del mes es: ingresos - gastos - ahorroMes.
          // Dejaremos el balance del mes igual, pero en el breakdown mostraremos cuáles son tarjetas.
        }
      });

      setIngresos(inc);
      setGastos(expGastos);
      setAhorro(savTotal);
      setAhorroMes(savMes);
      setAccountTotals(accs);
      setRecentTx(allTx?.slice(0, 5) || []);


      // 2. Cargar Deudas
      const { data: allDebts, error: debtError } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user.id);

      if (debtError) throw debtError;

      const remainingDebts = allDebts?.filter(d => Number(d.paid || 0) < Number(d.value)) || [];
      let totalDue = remainingDebts.reduce((sum, d) => sum + (Number(d.value) - Number(d.paid || 0)), 0);

      // Sumar deudas de tarjetas de crédito (si tienen saldo negativo en sus transacciones)
      Object.entries(accs).forEach(([accName, balance]) => {
        if (cardNames.includes(accName) && Number(balance) < 0) {
          totalDue += Math.abs(Number(balance));
        }
      });

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
      const dismissedStr = await AsyncStorage.getItem(`@dismissed_notifs_${user.id}`);
      const dismissedNotifs = dismissedStr ? JSON.parse(dismissedStr) : [];

      const urgent = allDebts?.filter((d: any) => {
        if (d.paid >= d.value) return false;
        try {
          const targetDate = parseDateStr(d.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          let checkDate = new Date(targetDate);
          if (d.debt_type === 'fixed') {
            checkDate = new Date(today.getFullYear(), today.getMonth(), targetDate.getDate());
          }
          checkDate.setHours(0, 0, 0, 0);

          // Unique ID para saber si la descarto ESTE mes
          const uniqueId = d.debt_type === 'fixed' ? `${d.id}_${today.getMonth()}_${today.getFullYear()}` : `${d.id}`;
          d.notifKey = uniqueId;
          
          if (dismissedNotifs.includes(uniqueId)) return false;

          const diffTime = checkDate.getTime() - today.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          return diffDays <= 3 && diffDays >= -7;
        } catch (e) { return false; }
      }) || [];
      setPendingItems(urgent);

      // Misiones eliminadas por solicitud del usuario
      // ------------------------------------------

    } catch (e) { console.error('Error cargando datos de Supabase:', e); }
  };

  // Dinero Activo: Es la sumatoria del balance histórico de todas tus cuentas bancarias o efectivo,
  // pero excluye la deuda proyectada en Tarjetas de Crédito y el dinero de la cuenta "Ahorro".
  // De esta forma, si usas una TC, tu "Plata en Mano" no disminuye hasta que pagues la tarjeta.
  const dineroActivo = Object.entries(accountTotals)
    .filter(([accName]) => !userCards.includes(accName) && accName !== 'Ahorro')
    .reduce((sum, [_, amt]) => sum + Number(amt), 0);

  const dineroReal = (dineroActivo + ahorro) - debtTotal;

  const fmt = (n: number) =>
    isHidden
      ? '****'
      : new Intl.NumberFormat('es-CO', {
          style: 'currency', currency: 'COP', minimumFractionDigits: 0
        }).format(n);

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        await logout();
        router.replace('/login');
      }
      return;
    }
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

            <TouchableOpacity 
              style={[styles.headerIcon, { backgroundColor: isDark ? '#334155' : '#6366F1' }]} 
              onPress={toggleTheme}
            >
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.avatar} onPress={handleLogout} activeOpacity={0.8}>
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Misiones eliminadas */}

        {/* Balance Card */}
        <TouchableOpacity
          style={[styles.balanceCard, { backgroundColor: isDark ? '#1E293B' : '#1E293B' }]}
          activeOpacity={0.9}
          onPress={() => setBreakdownVisible(true)}
        >
          <View style={styles.balanceCardInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Text style={styles.balanceLabelNoMargin}>Dinero Activo</Text>
              <TouchableOpacity onPress={toggleHiddenMode} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={isHidden ? 'eye-off' : 'eye'} size={14} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            <Text style={styles.balanceAmount}>{fmt(dineroActivo)}</Text>
            <Text style={styles.balanceSubLabel}>Ingresos − Gastos − Ahorros</Text>
            <View style={styles.breakdownHint}>
              <Ionicons name="stats-chart" size={10} color="rgba(255,255,255,0.4)" />
              <Text style={styles.breakdownHintText}>Ver desglose</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Ionicons name="trending-up-outline" size={16} color="#10B981" />
              <View>
                <Text style={styles.pillLabel}>Ingresos</Text>
                <Text style={styles.pillValue}>{fmt(ingresos)}</Text>
              </View>
            </View>
            <View style={styles.statPill}>
              <Ionicons name="trending-down-outline" size={16} color="#EF4444" />
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



        {/* ── Balance Real Dashboard (Desplegable) ────────────────────────────── */}
        <View style={{ marginHorizontal: 20, marginTop: 10 }}>
            <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => setIsRealBalanceCollapsed(!isRealBalanceCollapsed)}
                style={[
                    styles.realBalanceHeaderToggle, 
                    { 
                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF', 
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                        borderBottomLeftRadius: isRealBalanceCollapsed ? 16 : 0,
                        borderBottomRightRadius: isRealBalanceCollapsed ? 16 : 0,
                    }
                ]}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="health-and-safety" size={18} color={dineroReal >= 0 ? '#10B981' : '#EF4444'} />
                    <Text style={[styles.realBalanceTitle, { color: colorsNav.text, fontSize: 13, fontWeight: '700' }]}>Salud Financiera</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isRealBalanceCollapsed && (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: dineroReal >= 0 ? '#10B981' : '#EF4444' }}>{fmt(dineroReal)}</Text>
                    )}
                    <Ionicons name={isRealBalanceCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={colorsNav.sub} />
                </View>
            </TouchableOpacity>

            {!isRealBalanceCollapsed && (
                <View style={[
                    styles.realBalanceCard, 
                    { 
                        backgroundColor: isDark ? '#1E293B' : '#FFFFFF', 
                        borderColor: isDark ? '#334155' : '#E2E8F0', 
                        padding: 14, 
                        marginTop: 0,
                        borderTopWidth: 0,
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0
                    }
                ]}>
                    <View style={{ alignItems: 'center', marginBottom: 12, marginTop: 4 }}>
                        <Text style={[styles.realBalanceMainAmount, { color: dineroReal >= 0 ? (isDark ? '#F1F5F9' : '#1E293B') : '#EF4444', fontSize: 26 }]}>
                            {fmt(dineroReal)}
                        </Text>
                        <Text style={{ fontSize: 10, color: colorsNav.sub, fontWeight: '500', marginTop: -2 }}>Dinero proyectado una vez pagues deudas</Text>
                    </View>

                    <View style={[styles.realBalanceGrid, { padding: 8, borderRadius: 12 }]}>
                        <View style={styles.realBalanceItem}>
                            <Text style={[styles.realBalanceItemLabel, { fontSize: 8 }]}>Disponible</Text>
                            <Text style={[styles.realBalanceItemValue, { color: '#10B981', fontSize: 11 }]}>{fmt(dineroActivo)}</Text>
                        </View>
                        <View style={{ width: 1, backgroundColor: colorsNav.border, height: '60%', alignSelf: 'center' }} />
                        <View style={styles.realBalanceItem}>
                            <Text style={[styles.realBalanceItemLabel, { fontSize: 8 }]}>Ahorro</Text>
                            <Text style={[styles.realBalanceItemValue, { color: '#6366F1', fontSize: 11 }]}>{fmt(ahorro)}</Text>
                        </View>
                        <View style={{ width: 1, backgroundColor: colorsNav.border, height: '60%', alignSelf: 'center' }} />
                        <View style={styles.realBalanceItem}>
                            <Text style={[styles.realBalanceItemLabel, { fontSize: 8 }]}>Deuda</Text>
                            <Text style={[styles.realBalanceItemValue, { color: '#EF4444', fontSize: 11 }]}>−{fmt(debtTotal)}</Text>
                        </View>
                    </View>
                </View>
            )}
        </View>
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
                    <Ionicons
                      name={tx.type === 'income' ? 'trending-up-outline' : tx.category === 'Ahorro' ? 'leaf-outline' : 'trending-down-outline'}
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
                    tx.category === 'Ahorro' ? styles.txSave : (tx.type === 'income' ? styles.txIn : styles.txOut),
                    isDark && tx.category === 'Ahorro' && { color: '#818CF8' }
                  ]}>
                    {tx.category === 'Ahorro' ? '☕ ' : (tx.type === 'income' ? '+' : '-')}{fmt(tx.amount)}
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
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                 {pendingItems.length > 0 && (
                     <TouchableOpacity 
                        style={{ backgroundColor: '#6366F115', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                        onPress={async () => {
                         const keys = pendingItems.map(i => i.notifKey);
                         const prev = await AsyncStorage.getItem(`@dismissed_notifs_${user?.id}`);
                         const parsed = prev ? JSON.parse(prev) : [];
                         const updated = [...parsed, ...keys];
                         await AsyncStorage.setItem(`@dismissed_notifs_${user?.id}`, JSON.stringify(updated));
                         setPendingItems([]);
                         setNotificationsVisible(false);
                     }}>
                         <Text style={{ color: '#6366F1', fontWeight: '800', fontSize: 13 }}>Marcar Leídas</Text>
                     </TouchableOpacity>
                 )}
                 <TouchableOpacity onPress={() => setNotificationsVisible(false)}>
                   <Ionicons name="close" size={24} color={colorsNav.text} />
                 </TouchableOpacity>
              </View>
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
                .filter(([name]) => name !== 'Ahorro' && !userCards.includes(name))
                .map(([name, total]) => (
                  <View key={name} style={[styles.breakdownItem, { borderBottomColor: colorsNav.border }]}>
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.accIcon, { backgroundColor: name === 'Efectivo' ? '#10B98120' : userCards.includes(name) ? '#EF444420' : '#6366F120' }]}>
                        <MaterialIcons
                          name={name === 'Efectivo' ? 'money' : userCards.includes(name) ? 'credit-card' : name === 'Transferencia' ? 'account-balance' : 'wallet'}
                          size={20}
                          color={name === 'Efectivo' ? '#10B981' : userCards.includes(name) ? '#EF4444' : '#6366F1'}
                        />
                      </View>
                      <View>
                        <Text style={[styles.accName, { color: colorsNav.text }]}>{name}</Text>
                        {userCards.includes(name) && <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: 'bold' }}>TARJETA</Text>}
                      </View>
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

  // Missions
  missionsCard: {
    borderRadius: 24, padding: 20, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, elevation: 3,
  },
  missionsTitle: { fontSize: 18, fontWeight: '800' },
  missionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  missionText: { fontSize: 15, fontWeight: '600' },

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
  balanceLabelNoMargin: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
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
  // Dinero Real Dashboard
  realBalanceHeaderToggle: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
  realBalanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  realBalancePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  realBalanceTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  realBalancePillText: {
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  realBalanceMainAmount: {
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  realBalanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(148,163,184,0.08)',
  },
  realBalanceItem: {
    alignItems: 'center',
    flex: 1,
  },
  realBalanceItemLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
    color: '#94A3B8',
  },
  realBalanceItemValue: {
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
