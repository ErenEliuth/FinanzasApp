import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { THEMES, ThemeName } from '@/constants/Themes';
import { useThemeColors } from '@/hooks/useThemeColors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LATEST_VERSION, CHANGELOG_UPDATES } from '@/constants/Changelog';
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// ─── Types and Constants ─────────────────────────────────────────────
type CreditCard = {
  id: string;
  name: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'other';
  limit: number;
  cutDay: number;
  dueDay: number;
  color: string;
};

// ─── Sanctuary Theme Colors ───────────────────────────────────────────


// ─── Circular Progress Component ──────────────────────────────────────
const CircularProgress = ({ percentage, size = 80, strokeWidth = 8, color = '#4A7C59' }: {
  percentage: number; size?: number; strokeWidth?: number; color?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="#E8E0D4" strokeWidth={strokeWidth} fill="none"
      />
      <Circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
};

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
  const { user, logout, theme, toggleTheme, isHidden, toggleHiddenMode } = useAuth();
  const colorsNav = useThemeColors();
  const isDark = colorsNav.isDark;

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
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cardBalances, setCardBalances] = useState<Record<string, number>>({});
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [isRealBalanceCollapsed, setIsRealBalanceCollapsed] = useState(true);
  const [changelogVisible, setChangelogVisible] = useState(false);

  useEffect(() => {
    if (isFocused) {
      loadData();
      checkChangelog();
    }
  }, [isFocused]);

  const checkChangelog = async () => {
    try {
      const lastSeen = await AsyncStorage.getItem('@last_seen_changelog');
      if (lastSeen !== LATEST_VERSION) {
        setChangelogVisible(true);
      }
    } catch (e) { }
  };

  const markChangelogSeen = async () => {
    try {
      await AsyncStorage.setItem('@last_seen_changelog', LATEST_VERSION);
      setChangelogVisible(false);
    } catch (e) { }
  };

  const loadData = async () => {
    if (!user) return;
    try {
      const { data: allTx, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .order('id', { ascending: false });
      if (txError) throw txError;

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
          if (isThisMonth && tx.category !== 'Transferencia') inc += tx.amount;
          accs[acc] += tx.amount;
        } else {
          if (tx.category === 'Ahorro') {
            savTotal += tx.amount;
            if (isThisMonth) savMes += tx.amount;
          } else if (tx.category !== 'Transferencia') {
            if (isThisMonth) expGastos += tx.amount;
          }

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
      setRecentTx(allTx?.slice(0, 5) || []);
      setAllTransactions(allTx || []);

      let parsedCards: CreditCard[] = [];
      try {
        const storedCards = await AsyncStorage.getItem(`@cards_${user.id}`);
        if (storedCards) {
          parsedCards = JSON.parse(storedCards);
          setCards(parsedCards);
          const cardNames = parsedCards.map((c: any) => c.name);
          setUserCards(cardNames);
          
          // Calculate card balances based on allTx
          const balances: Record<string, number> = {};
          parsedCards.forEach(c => balances[c.name] = 0);
          
          allTx?.forEach(tx => {
            if (cardNames.includes(tx.account)) {
              const amt = Number(tx.amount || 0);
              if (tx.type === 'expense') {
                balances[tx.account] += amt;
              } else if (tx.type === 'income' || tx.type === 'transfer') {
                balances[tx.account] -= amt;
              }
            }
          });
          
          Object.keys(balances).forEach(k => {
             if (balances[k] < 0) balances[k] = 0;
          });
          setCardBalances(balances);
        }
      } catch (e) { }


      const { data: allDebts, error: debtError } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user.id);

      if (debtError) throw debtError;

      const remainingDebts = allDebts?.filter(d => Number(d.paid || 0) < Number(d.value)) || [];
      let totalDue = remainingDebts.reduce((sum, d) => sum + (Number(d.value) - Number(d.paid || 0)), 0);

      Object.entries(accs).forEach(([accName, balance]) => {
        if (cardNames.includes(accName) && Number(balance) < 0) {
          totalDue += Math.abs(Number(balance));
        }
      });

      setDebtTotal(totalDue);
      setUpcomingDebts([]);

      const parseDateStr = (dateStr: string) => {
        if (!dateStr) return new Date();
        const cleanStr = dateStr.trim();
        if (cleanStr.includes('/')) {
          const parts = cleanStr.split('/');
          if (parts.length >= 3) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const y = parseInt(parts[2], 10);
            return new Date(y, m - 1, d);
          }
        }
        if (cleanStr.includes('-')) {
          const parts = cleanStr.split('-');
          if (parts.length >= 3) {
            const p1 = parseInt(parts[0], 10);
            const p2 = parseInt(parts[1], 10);
            const p3 = parseInt(parts[2], 10);
            if (p1 > 1000) {
              if (p2 > 12) return new Date(p1, p3 - 1, p2);
              return new Date(p1, p2 - 1, p3);
            }
            if (p3 > 1000) return new Date(p3, p2 - 1, p1);
          }
        }
        const date = new Date(cleanStr);
        return isNaN(date.getTime()) ? new Date() : date;
      };

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

          const uniqueId = d.debt_type === 'fixed' ? `${d.id}_${today.getMonth()}_${today.getFullYear()}` : `${d.id}`;
          d.notifKey = uniqueId;

          if (dismissedNotifs.includes(uniqueId)) return false;

          const diffTime = checkDate.getTime() - today.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          return diffDays <= 3 && diffDays >= -7;
        } catch (e) { return false; }
      }) || [];
      setPendingItems(urgent);

    } catch (e) { console.error('Error cargando datos de Supabase:', e); }
  };

  const dineroActivo = Object.entries(accountTotals)
    .filter(([accName]) => !userCards.includes(accName) && accName !== 'Ahorro')
    .reduce((sum, [_, amt]) => sum + Number(amt), 0);

  const dineroReal = (dineroActivo + ahorro) - debtTotal;

  // Salud financiera
  const saludPorcentaje = (() => {
    if (dineroActivo <= 0) return 0;
    const total = dineroActivo + ahorro;
    if (total <= 0) return 0;
    const ratio = dineroReal / total;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  })();
  const saludLabel = saludPorcentaje >= 70 ? 'ÓPTIMO' : saludPorcentaje >= 40 ? 'REGULAR' : 'BAJO';
  const saludColor = saludPorcentaje >= 70 ? '#4A7C59' : saludPorcentaje >= 40 ? '#F59E0B' : '#EF4444';

  // Porcentaje de cambio mes
  const mesAnteriorIngresos = ingresos; // For display
  const porcentajeMes = ingresos > 0 ? ((ingresos - gastos) / ingresos * 100).toFixed(1) : '0';

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

  const saldoDisponible = dineroActivo - debtTotal + ahorro;

  // Icon helper for transactions
  const getTxIconInfo = (tx: any) => {
    if (tx.type === 'income') {
      if (tx.category === 'Transferencia') return { icon: 'swap-horiz', bg: '#E3F0FF', color: '#3B82F6' };
      return { icon: 'call-received', bg: '#E3F0FF', color: '#3B82F6' };
    }
    if (tx.category === 'Ahorro') return { icon: 'savings', bg: '#F0E6FF', color: '#8B5CF6' };
    if (tx.category === 'Comida' || tx.category === 'Supermercado') return { icon: 'shopping-cart', bg: '#FFF0E0', color: '#F59E0B' };
    if (tx.category === 'Transporte') return { icon: 'directions-car', bg: '#E0F7FA', color: '#00BCD4' };
    if (tx.category === 'Salud') return { icon: 'favorite', bg: '#FCE4EC', color: '#E91E63' };
    if (tx.category === 'Hogar') return { icon: 'home', bg: '#E8F5E9', color: '#4CAF50' };
    if (tx.category === 'Transferencia') return { icon: 'swap-horiz', bg: '#E3F0FF', color: '#3B82F6' };
    return { icon: 'bolt', bg: '#FFF8E1', color: '#FF9800' };
  };

  const formatTxDate = (dateStr: string) => {
    const txDate = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = txDate.toDateString() === today.toDateString();
    const isYesterday = txDate.toDateString() === yesterday.toDateString();

    const timeStr = txDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

    if (isToday) return `HOY, ${timeStr}`;
    if (isYesterday) return `AYER, ${timeStr}`;
    return `${txDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).toUpperCase()}, ${timeStr}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.desktopScrollContainer
        ]} 
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header Sanctuary ─────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.logoIcon, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}>
              <MaterialIcons name="shield" size={20} color={isDark ? '#A09B8C' : '#8B7355'} />
            </View>
            <Text style={[styles.logoText, { color: isDark ? '#D4C5A9' : '#8B7355' }]}>Sanctuary</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}
              onPress={() => setNotificationsVisible(true)}
            >
              <Ionicons name="notifications-outline" size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
              {pendingItems.length > 0 && <View style={styles.notifBadge} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}
              onPress={toggleHiddenMode}
            >
              <Ionicons name={isHidden ? 'eye-off' : 'eye'} size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
            </TouchableOpacity>

            {isDesktop && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.headerIconBtn, { backgroundColor: colorsNav.accent, width: 'auto', paddingHorizontal: 16, borderRadius: 12 }]}
                  onPress={() => router.push('/explore')}
                >
                  <MaterialIcons name="add" size={20} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800', marginLeft: 6 }}>Nuevo Movimiento</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.headerIconBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0', width: 'auto', paddingHorizontal: 14, borderRadius: 12 }]}
                  onPress={() => router.push('/profile')}
                >
                  <Ionicons name="person-outline" size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
                  <Text style={{ color: isDark ? '#D4C5A9' : '#8B7355', fontSize: 13, fontWeight: '700', marginLeft: 6 }}>Perfil</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── View Row Responsive en PC ───────────────────────────── */}
        <View style={isDesktop ? styles.desktopMainRow : undefined}>
          
          {/* LADO IZQUIERDO EN PC - RESUMEN */}
          <View style={isDesktop ? styles.colSummary : undefined}>
            {/* ── Greeting ─────────────────────────────────────────────── */}
            <View style={styles.greetingSection}>
              <Text style={[styles.greeting, { color: colorsNav.text }]}>
                Hola, {displayName.split(' ')[0]} 👋
              </Text>
              <Text style={[styles.subtitle, { color: colorsNav.sub }]}>Tu resumen financiero hoy</Text>
            </View>

            {/* ── Balance Card (Green) ─────────────────────────────────── */}
            <TouchableOpacity
              style={[styles.balanceCard, { backgroundColor: colorsNav.greenCard }]}
              activeOpacity={0.9}
              onPress={() => setBreakdownVisible(true)}
            >
              <Text style={styles.balanceLabel}>DINERO ACTIVO</Text>
              <Text style={styles.balanceAmount}>{fmt(dineroActivo)}</Text>
              <View style={styles.balanceBadge}>
                <MaterialIcons name="trending-up" size={14} color="#4A7C59" />
                <Text style={styles.balanceBadgeText}>
                  {Number(porcentajeMes) >= 0 ? '+' : ''}{porcentajeMes}% este mes
                </Text>
              </View>
            </TouchableOpacity>

            {/* ── Ahorros & Deudas Row ─────────────────────────────────── */}
            <View style={styles.widgetsRow}>
              <TouchableOpacity
                style={[styles.widgetCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}
                activeOpacity={0.8}
                onPress={() => router.push('/goals')}
              >
                <View style={[styles.widgetIconWrap, { backgroundColor: isDark ? '#3A5A4A' : '#E8F5E9' }]}>
                  <MaterialIcons name="savings" size={22} color="#4A7C59" />
                </View>
                <Text style={[styles.widgetLabel, { color: colorsNav.sub }]}>AHORROS</Text>
                <Text style={[styles.widgetValue, { color: colorsNav.text }]}>{fmt(ahorro)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.widgetCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}
                activeOpacity={0.8}
                onPress={() => router.push('/(tabs)/debts')}
              >
                <View style={[styles.widgetIconWrap, { backgroundColor: isDark ? '#5A3A3A' : '#FFEBEE' }]}>
                  <MaterialIcons name="credit-card" size={22} color="#EF4444" />
                </View>
                <Text style={[styles.widgetLabel, { color: colorsNav.sub }]}>DEUDAS</Text>
                <Text style={[styles.widgetValueAlert, { color: '#EF4444' }]}>{fmt(debtTotal)}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Salud Financiera ──────────────────────────────────────── */}
            <View style={[styles.healthCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
              <Text style={[styles.healthTitle, { color: colorsNav.text }]}>Salud Financiera</Text>
              <View style={styles.healthContent}>
                <View style={styles.healthCircleWrap}>
                  <CircularProgress percentage={saludPorcentaje} size={90} strokeWidth={9} color={saludColor} />
                  <View style={styles.healthCircleLabel}>
                    <Text style={[styles.healthPercentage, { color: saludColor }]}>{saludPorcentaje}%</Text>
                    <Text style={[styles.healthStatus, { color: saludColor }]}>{saludLabel}</Text>
                  </View>
                </View>
                <View style={styles.healthDetails}>
                  <Text style={[styles.healthDetailLabel, { color: colorsNav.sub }]}>SALDO DISPONIBLE</Text>
                  <Text style={[styles.healthDetailValue, { color: colorsNav.text }]}>{fmt(saldoDisponible)}</Text>
                  <TouchableOpacity
                    style={[styles.healthDetailBtn, { borderColor: isDark ? colorsNav.border : '#E0D8CC' }]}
                    onPress={() => setIsRealBalanceCollapsed(!isRealBalanceCollapsed)}
                  >
                    <Text style={[styles.healthDetailBtnText, { color: colorsNav.sub }]}>Ver detalles</Text>
                    <MaterialIcons name="arrow-forward" size={14} color={colorsNav.sub} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── Detalles expandidos ──────────────────────────────────── */}
            {!isRealBalanceCollapsed && (
              <View style={[styles.healthExpandedCard, { backgroundColor: isDark ? colorsNav.card : '#FFF', borderColor: isDark ? colorsNav.border : '#F0E8DC' }]}>
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <Text style={[styles.healthExpandedTitle, { color: colorsNav.text }]}>Balance Real</Text>
                  <Text style={[styles.healthExpandedAmount, { color: dineroReal >= 0 ? colorsNav.text : '#EF4444' }]}>
                    {fmt(dineroReal)}
                  </Text>
                  <Text style={[styles.healthExpandedSub, { color: colorsNav.sub }]}>Dinero proyectado una vez pagues deudas</Text>
                </View>
                <View style={[styles.healthExpandedGrid, { backgroundColor: isDark ? '#2A2A42' : '#FAF5ED' }]}>
                  <View style={styles.healthExpandedItem}>
                    <Text style={[styles.healthExpandedItemLabel, { color: colorsNav.sub }]}>Disponible</Text>
                    <Text style={[styles.healthExpandedItemValue, { color: '#4A7C59' }]}>{fmt(dineroActivo)}</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: isDark ? colorsNav.border : '#E8E0D4', height: '60%', alignSelf: 'center' }} />
                  <View style={styles.healthExpandedItem}>
                    <Text style={[styles.healthExpandedItemLabel, { color: colorsNav.sub }]}>Ahorro</Text>
                    <Text style={[styles.healthExpandedItemValue, { color: '#8B5CF6' }]}>{fmt(ahorro)}</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: isDark ? colorsNav.border : '#E8E0D4', height: '60%', alignSelf: 'center' }} />
                  <View style={styles.healthExpandedItem}>
                    <Text style={[styles.healthExpandedItemLabel, { color: colorsNav.sub }]}>Deuda</Text>
                    <Text style={[styles.healthExpandedItemValue, { color: '#EF4444' }]}>−{fmt(debtTotal)}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* COLUMNA CENTRAL (TARJETAS) EN PC */}
          {isDesktop && (
            <View style={styles.colCards}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>Mis Cuentas</Text>
                <TouchableOpacity onPress={() => router.push('/cards')}>
                  <Text style={styles.seeAll}>Gestionar</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.desktopCardsList}>
                {cards.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colorsNav.sub }]}>No hay cuentas registradas</Text>
                ) : (
                  cards.map(card => {
                    const debt = cardBalances[card.name] || 0;
                    return (
                      <View key={card.id} style={[styles.miniCard, { backgroundColor: card.color }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={styles.miniCardName}>{card.name}</Text>
                          <Text style={styles.miniCardBrand}>{card.brand.toUpperCase()}</Text>
                        </View>
                        <View>
                          <Text style={styles.miniCardLabel}>DEUDA</Text>
                          <Text style={styles.miniCardAmount}>{fmt(debt)}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/* LADO DERECHO EN PC - TRANSACCIONES */}
          <View style={isDesktop ? styles.colHistory : undefined}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colorsNav.text }]}>
                {isDesktop ? 'Historial Completo' : 'Últimas Transacciones'}
              </Text>
              {!isDesktop && (
                <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                  <Text style={styles.seeAll}>Ver todas</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={[styles.transactionList, isDesktop && styles.desktopScrollHistory]}>
              {(isDesktop ? allTransactions : recentTx).length === 0 ? (
                <Text style={[styles.emptyText, { color: colorsNav.sub }]}>No hay transacciones</Text>
              ) : (
                (isDesktop ? allTransactions : recentTx).map((tx) => {
                  const iconInfo = getTxIconInfo(tx);
                  return (
                    <View key={tx.id} style={[styles.txItem, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                      <View style={[styles.txIcon, { backgroundColor: isDark ? colorsNav.cardBg : iconInfo.bg }]}>
                        <MaterialIcons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
                      </View>
                      <View style={styles.txMeta}>
                        <Text style={[styles.txTitle, { color: colorsNav.text }]} numberOfLines={1}>
                          {tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description}
                        </Text>
                        <Text style={[styles.txSub, { color: colorsNav.sub }]}>{formatTxDate(tx.date)}</Text>
                      </View>
                      <Text style={[
                        styles.txAmount,
                        tx.category === 'Ahorro' ? { color: '#8B5CF6' } : (tx.type === 'income' ? { color: '#4A7C59' } : { color: '#EF4444' }),
                      ]}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modal de Notificaciones ─────────────────────────────── */}
      <Modal visible={notificationsVisible} transparent animationType="fade" onRequestClose={() => setNotificationsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colorsNav.card : '#FFF', maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Notificaciones</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {pendingItems.length > 0 && (
                  <TouchableOpacity
                    style={{ backgroundColor: '#4A7C5915', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                    onPress={async () => {
                      const keys = pendingItems.map(i => i.notifKey);
                      const prev = await AsyncStorage.getItem(`@dismissed_notifs_${user?.id}`);
                      const parsed = prev ? JSON.parse(prev) : [];
                      const updated = [...parsed, ...keys];
                      await AsyncStorage.setItem(`@dismissed_notifs_${user?.id}`, JSON.stringify(updated));
                      setPendingItems([]);
                      setNotificationsVisible(false);
                    }}>
                    <Text style={{ color: '#4A7C59', fontWeight: '800', fontSize: 13 }}>Marcar Leídas</Text>
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
                    style={[styles.txItem, { backgroundColor: isDark ? '#2A3447' : '#FFF8F0', marginBottom: 10, padding: 12 }]}
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
                      <Text style={[styles.txSub, { color: colorsNav.sub }]}>Vence: {item.due_date}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: item.debt_type === 'fixed' ? '#F59E0B' : '#EF4444' }]}>
                      {fmt(item.value - item.paid)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: isDark ? colorsNav.border : '#F5EDE0' }]}
              onPress={() => setNotificationsVisible(false)}
            >
              <Text style={[styles.modalCloseBtnText, { color: colorsNav.text }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal de Novedades (What's New) ────────────────────────── */}
      <Modal visible={changelogVisible} transparent animationType="fade" onRequestClose={markChangelogSeen}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colorsNav.card : '#FFF', paddingBottom: 24, width: '90%', maxWidth: 450 }]}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: colorsNav.accent + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <MaterialIcons name="auto-awesome" size={32} color={colorsNav.accent} />
              </View>
              <Text style={[styles.modalTitle, { color: colorsNav.text, fontSize: 24 }]}>¡Novedades en Sanctuary!</Text>
              <Text style={[styles.modalSub, { color: colorsNav.sub, marginTop: 4 }]}>Descubre lo último que hemos mejorado</Text>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {CHANGELOG_UPDATES.map((update, idx) => (
                <View key={idx} style={{ flexDirection: 'row', gap: 16, marginBottom: 20, paddingHorizontal: 4 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isDark ? colorsNav.border : '#F5EDE0', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialIcons name={update.icon as any} size={20} color={colorsNav.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colorsNav.text, marginBottom: 4 }}>{update.title}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colorsNav.sub, lineHeight: 18 }}>{update.description}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.modalCloseBtn, { backgroundColor: colorsNav.accent, marginTop: 20, borderTopWidth: 0 }]} 
              onPress={markChangelogSeen}
            >
              <Text style={[styles.modalCloseBtnText, { color: '#FFF', fontWeight: '900' }]}>¡Entendido!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Breakdown Modal ────────────────────────────────────── */}
      <Modal visible={breakdownVisible} transparent animationType="fade" onRequestClose={() => setBreakdownVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBreakdownVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
            <Text style={[styles.modalTitle, { color: colorsNav.text, textAlign: 'center', marginBottom: 20 }]}>Distribución de Dinero</Text>
            <View style={styles.breakdownList}>
              {Object.entries(accountTotals)
                .filter(([name]) => name !== 'Ahorro' && !userCards.includes(name))
                .map(([name, total]) => (
                  <View key={name} style={[styles.breakdownItem, { borderBottomColor: isDark ? colorsNav.border : '#F0E8DC' }]}>
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.accIcon, { backgroundColor: name === 'Efectivo' ? '#E8F5E9' : '#F0E6FF' }]}>
                        <MaterialIcons
                          name={name === 'Efectivo' ? 'money' : name === 'Transferencia' ? 'account-balance' : 'wallet' as any}
                          size={20}
                          color={name === 'Efectivo' ? '#4A7C59' : '#8B5CF6'}
                        />
                      </View>
                      <Text style={[styles.accName, { color: colorsNav.text }]}>{name}</Text>
                    </View>
                    <Text style={[styles.accValue, { color: colorsNav.text }]}>{fmt(total as number)}</Text>
                  </View>
                ))}
            </View>
            <TouchableOpacity
              style={[styles.modalCloseBtn, { backgroundColor: isDark ? colorsNav.border : '#F5EDE0' }]}
              onPress={() => setBreakdownVisible(false)}
            >
              <Text style={[styles.modalCloseBtnText, { color: colorsNav.text }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 20,
    paddingBottom: 100,
  },
  desktopScrollContainer: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 30,
    paddingTop: 30,
  },
  desktopMainRow: {
    flexDirection: 'row',
    gap: 30,
    alignItems: 'flex-start',
  },
  colSummary: {
    flex: 1.1,
  },
  colCards: {
    flex: 0.9,
  },
  colHistory: {
    flex: 1.2,
  },

  // Desktop Cards
  desktopCardsList: {
    gap: 12,
  },
  miniCard: {
    borderRadius: 18,
    padding: 18,
    height: 120,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  miniCardName: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  miniCardBrand: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '800' },
  miniCardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  miniCardAmount: { color: '#FFF', fontSize: 20, fontWeight: '900' },

  desktopScrollHistory: {
    maxHeight: 600,
    overflow: 'hidden',
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFF8F0',
  },

  // ── Greeting ────────────────────────────────────────────────
  greetingSection: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },

  // ── Balance Card (Green) ────────────────────────────────────
  balanceCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#2D5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 14,
  },
  balanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  balanceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D5A3D',
  },

  // ── Widget Cards ────────────────────────────────────────────
  widgetsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  widgetCard: {
    flex: 1,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  widgetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  widgetLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  widgetValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  widgetValueAlert: {
    fontSize: 18,
    fontWeight: '800',
  },

  // ── Health Card ─────────────────────────────────────────────
  healthCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  healthTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  healthContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  healthCircleWrap: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthCircleLabel: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthPercentage: {
    fontSize: 18,
    fontWeight: '900',
  },
  healthStatus: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: -2,
  },
  healthDetails: {
    flex: 1,
  },
  healthDetailLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  healthDetailValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  healthDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  healthDetailBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Health Expanded ─────────────────────────────────────────
  healthExpandedCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  healthExpandedTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  healthExpandedAmount: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  healthExpandedSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  healthExpandedGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
  },
  healthExpandedItem: {
    alignItems: 'center',
    flex: 1,
  },
  healthExpandedItemLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  healthExpandedItemValue: {
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Sections ────────────────────────────────────────────────
  sectionContainer: { marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  seeAll: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
  },

  // ── Transactions ────────────────────────────────────────────
  transactionList: { gap: 10 },
  txItem: {
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  txIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txMeta: {
    flex: 1,
    marginLeft: 12,
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  txSub: {
    fontSize: 11,
    marginTop: 2,
    textTransform: 'uppercase',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },

  // ── Modals ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalCloseBtn: {
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Breakdown ───────────────────────────────────────────────
  breakdownList: {
    marginBottom: 16,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accName: {
    fontSize: 16,
    fontWeight: '600',
  },
  accValue: {
    fontSize: 16,
    fontWeight: '700',
  },
});
