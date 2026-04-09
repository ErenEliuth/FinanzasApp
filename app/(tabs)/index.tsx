import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import * as Notifications from '@/utils/notifications';
import { THEMES, ThemeName } from '@/constants/Themes';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency } from '@/utils/currency';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LATEST_VERSION, CHANGELOG_UPDATES } from '@/constants/Changelog';
// Eliminado: MagicAuraButton
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
  minPaymentPct: number;
  manualMinPayment?: number;
};

// ─── Sanctuary Theme Colors ───────────────────────────────────────────


// ─── Circular Progress Component ──────────────────────────────────────
const CircularProgress = React.memo(({ percentage, size = 80, strokeWidth = 10, color }: { percentage: number, size?: number, strokeWidth?: number, color: string }) => {
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
});

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 1024; // Aumentado para evitar falsos positivos en móviles de alta resolución
  const { user, currency, rates, isHidden, toggleHiddenMode, logout } = useAuth();
  const colorsNav = useThemeColors();
  const isDark = colorsNav.isDark;

  const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

  const [debtTotal, setDebtTotal] = useState(0);
  const [accountTotals, setAccountTotals] = useState<any>({});
  const [breakdownVisible, setBreakdownVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [userCards, setUserCards] = useState<string[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cardBalances, setCardBalances] = useState<Record<string, number>>({});
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [changelogVisible, setChangelogVisible] = useState(false);
  const [investmentTotal, setInvestmentTotal] = useState(0);

  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (isFocused) {
      loadData();
      checkChangelog();
      checkReminderPrompt();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isFocused]);

  const checkReminderPrompt = async () => {
    try {
      const isEnabled = await AsyncStorage.getItem('user_reminders');
      const isDismissed = await AsyncStorage.getItem('@dismissed_reminder_prompt');
      if (isEnabled !== 'true' && isDismissed !== 'true') {
        // setShowReminderPrompt(true); // Removido por limpieza
      }
    } catch (e) { }
  };

  const handleAcceptReminders = async () => {
    const granted = await Notifications.registerForPushNotificationsAsync();
    if (granted) {
      await Notifications.scheduleDailyReminder(20, 30);
      await AsyncStorage.setItem('user_reminders', 'true');
      // setShowReminderPrompt(false); // Removido por limpieza
      Alert.alert("✅ ¡Activado!", "Te avisaremos a las 8:30 PM.");
    } else {
      Alert.alert("⚠️ Permiso denegado", "Activa las notificaciones en ajustes.");
    }
  };

  const handleDismissReminders = async () => {
    await AsyncStorage.setItem('@dismissed_reminder_prompt', 'true');
    // setShowReminderPrompt(false); // Removido por limpieza
  };

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

      setAccountTotals(accs);
      setAllTransactions(allTx || []);

      let parsedCards: CreditCard[] = [];
      let balances: Record<string, number> = {};

      try {
        const storedCards = await AsyncStorage.getItem(`@cards_${user.id}`);
        if (storedCards) {
          parsedCards = JSON.parse(storedCards);
          setCards(parsedCards);
          const cNames = parsedCards.map((c: any) => c.name);
          setUserCards(cNames);
          
          parsedCards.forEach(c => balances[c.name] = 0);
          
          allTx?.forEach(tx => {
            if (cNames.includes(tx.account)) {
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

      // Cargar total de inversiones desde Supabase
      try {
        const { data: invData } = await supabase
          .from('investments')
          .select('shares, avg_price')
          .eq('user_id', user.id);
        
        if (invData) {
          const total = invData.reduce((sum, pos) => sum + (Number(pos.shares || 0) * (Number(pos.avg_price || 0))), 0);
          setInvestmentTotal(total);
        }
      } catch (e) { }


      const { data: allDebts, error: debtError } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user.id);

      if (debtError) throw debtError;

      const remainingDebts = allDebts?.filter(d => Number(d.paid || 0) < Number(d.value)) || [];

      // Calcular Deuda de Tarjetas (Solo el PAGO MÍNIMO)
      let cardObligations = 0;
      parsedCards.forEach(card => {
        const balance = balances[card.name] || 0;
        if (card.manualMinPayment && card.manualMinPayment > 0) {
          cardObligations += card.manualMinPayment;
        } else {
          const pct = card.minPaymentPct || 10;
          cardObligations += Math.round(balance * (pct / 100));
        }
      });

      const totalDue = remainingDebts.reduce((sum, d) => sum + (Number(d.value) - Number(d.paid || 0)), 0) + cardObligations;

      setDebtTotal(totalDue);

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

    } catch (e) {
      console.error('Error cargando datos de Supabase:', e);
    }
  };

  const { dineroActivo, dineroReal, dineroGeneral, ahorroTotal, ingresosMes, gastosMes, ahorroDelMes, saludPorcentaje, saludLabel, saludColor, porcentajeMes, saldoDisponible } = React.useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let inc = 0, expGastos = 0, savTotal = 0, savMes = 0;
    let accs: any = {};

    allTransactions.forEach(tx => {
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

    const activeMoney = Object.entries(accountTotals)
      .filter(([accName]) => !userCards.includes(accName) && accName !== 'Ahorro')
      .reduce((sum, [_, amt]) => {
        const val = Number(amt);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

    // Balance Real (Dinero Disponible al Instante - Deudas)
    const realMoney = activeMoney - (isNaN(debtTotal) ? 0 : debtTotal);

    // Balance General (Patrimonio Total: Disponible + Ahorro + Inversión - Deudas)
    const currentAhorro = isNaN(savTotal) ? 0 : savTotal;
    const currentInvestment = isNaN(investmentTotal) ? 0 : investmentTotal;
    const currentDebt = isNaN(debtTotal) ? 0 : debtTotal;
    
    const assetsTotal = activeMoney + currentAhorro + currentInvestment;
    const generalMoney = assetsTotal - currentDebt;
    
    const rawHealthPct = assetsTotal > 0 
      ? Math.max(0, Math.min(100, Math.round((realMoney / assetsTotal) * 100))) 
      : 0;
    
    const healthPct = isNaN(rawHealthPct) ? 0 : rawHealthPct;

    const healthLbl = healthPct >= 70 ? 'ÓPTIMO' : healthPct >= 40 ? 'REGULAR' : 'BAJO';
    const healthClr = healthPct >= 70 ? colorsNav.accent : healthPct >= 40 ? '#F59E0B' : '#EF4444';
    const monthPct = inc > 0 ? ((inc - expGastos) / inc * 100).toFixed(1) : '0';

    return {
      dineroActivo: activeMoney,
      dineroReal: realMoney,
      dineroGeneral: generalMoney,
      ahorroTotal: savTotal,
      investmentTotal,
      ingresosMes: inc,
      gastosMes: expGastos,
      ahorroDelMes: savMes,
      saludPorcentaje: healthPct,
      saludLabel: healthLbl,
      saludColor: healthClr,
      porcentajeMes: monthPct,
      saldoDisponible: realMoney // Usamos el balance real como saldo disponible
    };
  }, [allTransactions, debtTotal, accountTotals, userCards, investmentTotal]);

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

  // Icon helper for transactions
  const getTxIconInfo = (tx: any) => {
    if (tx.type === 'income') {
      if (tx.category === 'Transferencia') return { icon: 'swap-horiz', bg: colorsNav.accent + '20', color: colorsNav.accent };
      return { icon: 'call-received', bg: colorsNav.accent + '20', color: colorsNav.accent };
    }
    if (tx.category === 'Ahorro') return { icon: 'savings', bg: '#F0E6FF', color: '#8B5CF6' };
    if (tx.category === 'Comida' || tx.category === 'Supermercado') return { icon: 'shopping-cart', bg: '#FFF0E0', color: '#F59E0B' };
    if (tx.category === 'Transporte') return { icon: 'directions-car', bg: '#E0F7FA', color: '#00BCD4' };
    if (tx.category === 'Salud') return { icon: 'favorite', bg: '#FCE4EC', color: '#E91E63' };
    if (tx.category === 'Hogar') return { icon: 'home', bg: '#E8F5E9', color: '#4CAF50' };
    if (tx.category === 'Transferencia') return { icon: 'swap-horiz', bg: '#E3F0FF', color: '#3B82F6' };
    return { icon: 'bolt', bg: '#FFF8E1', color: '#FF9800' };
  };

  const formatTxDate = (tx: any) => {
    const dateStr = tx.date;
    if (!dateStr) return '';
    
    const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
    const txDate = new Date(normalized);

    return `${txDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).toUpperCase()}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
      <ScrollView 
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.desktopScrollContainer
        ]} 
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header Sanctuary ─────────────────────────────────────── */}
        <View style={[styles.header, isDesktop && styles.desktopHeader, Platform.OS === 'web' && { backdropFilter: 'blur(25px)', backgroundColor: isDark ? 'rgba(26, 26, 46, 0.85)' : 'rgba(255, 248, 240, 0.85)', position: 'sticky', top: 0, zIndex: 1000 } as any]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
            <View style={[styles.logoIcon, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}>
              <MaterialIcons name="shield" size={24} color={isDark ? '#D4C5A9' : '#8B7355'} />
            </View>
            <View>
              <Text style={[styles.logoText, { color: isDark ? '#FFF' : '#2D2D2D', fontSize: 20 }]}>Sanctuary</Text>
              {isDesktop && <Text style={{ fontSize: 9, color: colorsNav.sub, fontWeight: '800', letterSpacing: 2, marginTop: -2 }}>PREMIUM FINTECH</Text>}
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {/* OJO Y NOTIFICACIONES - Mobile & Desktop */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.headerIconBtnSmall, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}
                onPress={toggleHiddenMode}
              >
                <Ionicons name={isHidden ? "eye-off-outline" : "eye-outline"} size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.headerIconBtnSmall, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}
                onPress={() => setNotificationsVisible(true)}
              >
                <Ionicons name="notifications-outline" size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
                {pendingItems.length > 0 && <View style={styles.notifBadge} />}
              </TouchableOpacity>
            </View>

            {/* ACCIONES PRINCIPALES - Estilo exacto como en la imagen */}
            {isDesktop && (
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginLeft: 10 }}>
                <TouchableOpacity
                  style={[styles.mainActionBtn, { backgroundColor: colorsNav.accent }]}
                  onPress={() => router.push('/explore')}
                >
                  <MaterialIcons name="add" size={22} color="#FFF" />
                  <Text style={styles.mainActionText}>Nuevo Movimiento</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.subActionBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}
                  onPress={() => router.push('/invest' as any)}
                >
                  <MaterialIcons name="show-chart" size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
                  <Text style={[styles.subActionText, { color: isDark ? '#D4C5A9' : '#8B7355' }]}>Inversiones</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.subActionBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]}
                  onPress={() => router.push('/profile')}
                >
                  <Ionicons name="person-outline" size={18} color={isDark ? '#D4C5A9' : '#8B7355'} />
                  <Text style={[styles.subActionText, { color: isDark ? '#D4C5A9' : '#8B7355' }]}>Perfil</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── View Row Responsive en PC (70/30 Split) ────────────────── */}
        <View style={isDesktop ? styles.desktopMainRowRefined : undefined}>
          
          {/* LADO IZQUIERDO: CONTENIDO PRINCIPAL (70%) */}
          <View style={isDesktop ? styles.desktopMainCol : undefined}>
            
            <View style={{ marginBottom: isDesktop ? 25 : 8 }}>
               <Text style={[styles.greeting, { color: colorsNav.text }]}>Hola, {displayName.split(' ')[0]} 👋</Text>
               <Text style={[styles.subtitle, { color: colorsNav.sub }]}>Tu resumen financiero hoy</Text>
            </View>

            {/* Gran Tarjeta Hero */}
            <TouchableOpacity 
              style={[
                isDesktop ? styles.mainHeroCard : styles.mainHeroCardMobile,
                { backgroundColor: isDesktop ? (isDark ? '#5D1220' : '#8B1A2E') : colorsNav.greenCard }
              ]}
              activeOpacity={0.9}
              onPress={() => setBreakdownVisible(true)}
            >
              <View style={styles.heroHeader}>
                <Text style={[styles.heroLabel, !isDesktop && { textTransform: 'uppercase', fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.8)', letterSpacing: 1.2 }]}>Dinero Activo</Text>
              </View>
              <Text style={[styles.heroAmount, !isDesktop && { fontSize: 48, marginTop: 10 }]}>{fmt(dineroActivo)}</Text>
              
              {!isDesktop && (
                <View style={styles.mobileTrendContainer}>
                  <View style={styles.mobileTrendBubble}>
                    <MaterialIcons name={Number(porcentajeMes) >= 0 ? "trending-up" : "trending-down"} size={14} color={colorsNav.accent} />
                    <Text style={[styles.mobileTrendTxt, { color: '#004D40' }]}>{porcentajeMes}% este mes</Text>
                  </View>
                </View>
              )}
              
              {isDesktop && (
                <View style={styles.heroTrend}>
                  <MaterialIcons name="trending-up" size={14} color="#FFF" />
                  <Text style={styles.heroTrendTxt}>{porcentajeMes}% este mes</Text>
                </View>
              )}
              
              <View style={styles.heroVisual} />
            </TouchableOpacity>

            {/* ── Estadísticas ─── */}
            {isDesktop ? (
              /* Desktop: 3 columnas side by side */
              <View style={styles.statsRowRefined}>
                <TouchableOpacity style={[styles.statBoxRefined, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]} onPress={() => router.push('/goals')}>
                  <View style={[styles.statIconWrapRefined, { backgroundColor: '#E0F2FE' }]}>
                    <MaterialIcons name="savings" size={20} color="#0EA5E9" />
                  </View>
                  <Text style={styles.statLabelRefined}>AHORROS</Text>
                  <Text style={[styles.statValueRefined, { color: colorsNav.text }]}>{fmt(ahorroTotal)}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.statBoxRefined, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]} onPress={() => router.push('/(tabs)/debts')}>
                  <View style={[styles.statIconWrapRefined, { backgroundColor: '#FEE2E2' }]}>
                    <MaterialIcons name="credit-score" size={20} color="#EF4444" />
                  </View>
                  <Text style={styles.statLabelRefined}>DEUDAS</Text>
                  <Text style={[styles.statValueRefined, { color: colorsNav.text }]}>{fmt(debtTotal)}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.statBoxRefined, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]} onPress={() => router.push('/invest' as any)}>
                  <View style={[styles.statIconWrapRefined, { backgroundColor: '#F3E8FF' }]}>
                    <MaterialIcons name="insights" size={20} color="#8B5CF6" />
                  </View>
                  <Text style={styles.statLabelRefined}>INVERSIONES</Text>
                  <Text style={[styles.statValueRefined, { color: colorsNav.text }]}>{fmt(investmentTotal)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Mobile: 2 cols (Ahorros + Deudas) + full-width Inversiones */
              <View style={{ marginBottom: 20 }}>
                <View style={styles.mobileStatsRow}>
                  <TouchableOpacity style={[styles.mobileStatBox, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]} onPress={() => router.push('/goals')}>
                    <View style={[styles.statIconWrapRefined, { backgroundColor: '#E8F5E9', borderRadius: 14 }]}>
                      <MaterialIcons name="savings" size={22} color="#2D5A3D" />
                    </View>
                    <Text style={[styles.statLabelRefined, { fontSize: 10, marginTop: 8 }]}>AHORROS</Text>
                    <Text style={[styles.mobileStatValue, { color: colorsNav.text }]}>{fmt(ahorroTotal)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.mobileStatBox, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]} onPress={() => router.push('/(tabs)/debts')}>
                    <View style={[styles.statIconWrapRefined, { backgroundColor: '#FFEBEE', borderRadius: 14 }]}>
                      <MaterialIcons name="credit-card" size={22} color="#D32F2F" />
                    </View>
                    <Text style={[styles.statLabelRefined, { fontSize: 10, marginTop: 8 }]}>DEUDAS</Text>
                    <Text style={[styles.mobileStatValue, { color: '#D32F2F' }]}>{fmt(debtTotal)}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.mobileInvestRow, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]} 
                  onPress={() => router.push('/invest' as any)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={[styles.statIconWrapRefined, { backgroundColor: '#E3F2FD', borderRadius: 14 }]}>
                      <MaterialIcons name="show-chart" size={22} color="#1976D2" />
                    </View>
                    <View>
                      <Text style={[styles.statLabelRefined, { fontSize: 10, letterSpacing: 0.8 }]}>INVERSIONES</Text>
                      <Text style={[styles.mobileStatValue, { color: colorsNav.text }]}>{fmt(investmentTotal)}</Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Salud Financiera ─── */}
            <View style={[
              styles.mobileHealthCard,
              { backgroundColor: isDark ? colorsNav.card : '#FFF' }
            ]}>
              <View style={styles.mobileHealthCenter}>
                <CircularProgress percentage={saludPorcentaje} size={100} strokeWidth={14} color={saludColor} />
                <View style={styles.healthInnerRefined}>
                  <Text style={[styles.healthScoreRefined, { color: saludColor, fontSize: 24 }]}>{saludPorcentaje}%</Text>
                  <Text style={[styles.healthSuffixRefined, { color: saludColor, fontSize: 8 }]}>{saludLabel}</Text>
                </View>
              </View>
              <View style={styles.mobileHealthDetails}>
                <Text style={styles.mobileHealthLabel}>SALDO DISPONIBLE</Text>
                <Text style={[styles.mobileHealthAmount, { color: saldoDisponible >= 0 ? colorsNav.text : '#EF4444' }]}>{fmt(saldoDisponible)}</Text>
                <TouchableOpacity 
                  style={[styles.mobileHealthBtn, { borderColor: colorsNav.border + '50' }]} 
                  onPress={() => setBreakdownVisible(true)}
                >
                  <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 13 }}>Ver detalles</Text>
                  <MaterialIcons name="arrow-forward" size={14} color={colorsNav.text} style={{ marginLeft: 5 }} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Últimas Transacciones (7) ─── */}
            <View style={{ marginTop: 10, paddingBottom: 120 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: colorsNav.text }}>Últimas Transacciones</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                  <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Ver todas</Text>
                </TouchableOpacity>
              </View>
              
              {allTransactions.slice(0, 7).map((tx, idx) => {
                const iconInfo = getTxIconInfo(tx);
                return (
                  <View key={tx.id || idx} style={[styles.mobileTxItem, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
                    <View style={[styles.txIconRoundRefined, { backgroundColor: isDark ? colorsNav.cardBg : iconInfo.bg, width: 44, height: 44 }]}>
                      <MaterialIcons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 16, color: colorsNav.text }} numberOfLines={1}>
                        {tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description}
                      </Text>
                      <Text style={{ fontSize: 11, color: colorsNav.sub, marginTop: 2 }}>HOY</Text>
                    </View>
                    <Text style={{ 
                      fontWeight: '900', 
                      fontSize: 16, 
                      color: tx.type === 'expense' ? colorsNav.text : colorsNav.accent 
                    }}>
                      {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* LADO DERECHO: BARRA LATERAL (30%) - Solo Desktop */}
          {isDesktop && (
          <View style={styles.desktopSidebarCol}>
            <View style={[styles.sidebarCardRefined, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
              <View style={[styles.rowBetweenRefined, { marginBottom: 20 }]}>
                <Text style={[styles.gridTitleRefined, { color: colorsNav.text }]}>Historial Completo</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                  <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 13 }}>Ver todo</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.sidebarHistoryListRefined}>
                {allTransactions.length === 0 ? (
                  <Text style={{ color: colorsNav.sub, textAlign: 'center', marginTop: 40 }}>Sin movimientos</Text>
                ) : (
                  allTransactions.slice(0, 12).map((tx, idx) => {
                    const iconInfo = getTxIconInfo(tx);
                    return (
                      <View key={tx.id || idx} style={[styles.txItemRefined, { borderBottomColor: colorsNav.border + '30' }]}>
                        <View style={[styles.txIconRoundRefined, { backgroundColor: isDark ? colorsNav.cardBg : iconInfo.bg }]}>
                          <MaterialIcons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.txNameRefined, { color: colorsNav.text }]} numberOfLines={1}>
                             {tx.description === 'Sin descripción' || !tx.description ? tx.category : tx.description}
                          </Text>
                          <Text style={styles.txDateRefined}>{tx.category} • {formatTxDate(tx)}</Text>
                        </View>
                        <Text style={[styles.txAmtRefined, { color: tx.type === 'expense' ? '#EF4444' : colorsNav.accent }]}>
                          {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
              
              <View style={styles.sidebarChartBoxRefined}>
                 <Text style={styles.sidebarChartTitleRefined}>ANÁLISIS SEMANAL</Text>
                 <View style={styles.fakeChartRefined}>
                    {[40, 60, 50, 90, 45, 70, 55].map((h, i) => (
                      <View key={i} style={{ alignItems: 'center', gap: 5 }}>
                        <View style={[styles.chartBarRefined, { height: h, backgroundColor: i === 3 ? (isDark ? colorsNav.accent : '#8B1A2E') : (isDark ? '#3A3A52' : '#E5E7EB') }]} />
                        <Text style={{ fontSize: 8, color: colorsNav.sub, fontWeight: '800' }}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]}</Text>
                      </View>
                    ))}
                 </View>
              </View>
            </View>
          </View>
          )}
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
                    style={{ backgroundColor: colorsNav.accent + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                    onPress={async () => {
                      const keys = pendingItems.map(i => i.notifKey);
                      const prev = await AsyncStorage.getItem(`@dismissed_notifs_${user?.id}`);
                      const parsed = prev ? JSON.parse(prev) : [];
                      const updated = [...parsed, ...keys];
                      await AsyncStorage.setItem(`@dismissed_notifs_${user?.id}`, JSON.stringify(updated));
                      setPendingItems([]);
                      setNotificationsVisible(false);
                    }}>
                    <Text style={{ color: colorsNav.accent, fontWeight: '800', fontSize: 13 }}>Marcar Leídas</Text>
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

      {/* ── Modal de Novedades (Changelog) ────────────────────────── */}
      <Modal visible={changelogVisible} transparent animationType="fade" onRequestClose={markChangelogSeen}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colorsNav.card : '#FFF', maxWidth: 450 }]}>
            <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 8 }}>
              <View style={[styles.changelogIconWrap, { backgroundColor: colorsNav.accent + '15', width: 64, height: 64, borderRadius: 24, marginBottom: 16 }]}>
                <Ionicons name="sparkles" size={32} color={colorsNav.accent} />
              </View>
              <Text style={[styles.modalTitle, { color: colorsNav.text, textAlign: 'center' }]}>¡Novedades en Zenly!</Text>
              <Text style={[styles.modalSub, { color: colorsNav.sub, textAlign: 'center', marginTop: 4 }]}>Hemos mejorado tu experiencia financiera</Text>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {CHANGELOG_UPDATES.map((update, idx) => (
                <View key={idx} style={[styles.changelogItem, { backgroundColor: isDark ? colorsNav.bg : '#F8F5F0' }]}>
                  <View style={[styles.changelogIconWrap, { backgroundColor: colorsNav.accent + (isDark ? '15' : '10') }]}>
                    <MaterialIcons name={update.icon as any} size={22} color={colorsNav.accent} />
                  </View>
                  <View style={styles.changelogTextWrap}>
                    <Text style={[styles.changelogItemTitle, { color: colorsNav.text }]}>{update.title}</Text>
                    <Text style={[styles.changelogItemDesc, { color: colorsNav.sub }]}>{update.description}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.modalCloseBtn, { backgroundColor: colorsNav.accent, borderTopWidth: 0 }]} 
              onPress={markChangelogSeen}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalCloseBtnText, { color: '#FFF' }]}>¡Explorar Zenly!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Breakdown Modal ────────────────────────────────────── */}
      <Modal visible={breakdownVisible} transparent animationType="fade" onRequestClose={() => setBreakdownVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBreakdownVisible(false)}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colorsNav.card : '#FFF' }]}>
            <View style={{ alignItems: 'center', marginBottom: 25 }}>
              <View style={[styles.statIconWrapRefined, { backgroundColor: colorsNav.accent + '15', width: 50, height: 50, borderRadius: 18 }]}>
                <MaterialIcons name="analytics" size={28} color={colorsNav.accent} />
              </View>
              <Text style={[styles.modalTitle, { color: colorsNav.text, textAlign: 'center' }]}>Salud Financiera</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Apartado 1: Liquidez */}
              <View style={[styles.refinedBreakdownBox, { backgroundColor: isDark ? '#2A2A42' : '#F8FAFC' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.breakdownLabel, { color: colorsNav.sub }]}>LIQUIDEZ (REAL)</Text>
                  <MaterialIcons name="account-balance-wallet" size={16} color={colorsNav.accent} />
                </View>
                <Text style={[styles.breakdownValue, { color: dineroReal >= 0 ? colorsNav.text : '#EF4444' }]}>{fmt(dineroReal)}</Text>
                <Text style={styles.breakdownMath}>Efectivo/Cuentas - Deudas</Text>
              </View>

              {/* Apartado 2: Patrimonio */}
              <View style={[styles.refinedBreakdownBox, { backgroundColor: isDark ? '#2A2A42' : '#F8FAFC' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.breakdownLabel, { color: colorsNav.sub }]}>PATRIMONIO GENERAL</Text>
                  <MaterialIcons name="account-balance" size={16} color={colorsNav.accent} />
                </View>
                <Text style={[styles.breakdownValue, { color: dineroGeneral >= 0 ? colorsNav.text : '#EF4444' }]}>{fmt(dineroGeneral)}</Text>
                <Text style={styles.breakdownMath}>Tus Bienes - Deudas Totales</Text>
              </View>

              <Text style={{ fontSize: 13, fontWeight: '900', color: colorsNav.sub, marginTop: 15, marginBottom: 10, letterSpacing: 1 }}>DESGLOSE DE CUENTAS</Text>
              
              <View style={styles.breakdownList}>
                {Object.entries(accountTotals)
                  .filter(([name]) => name !== 'Ahorro' && !userCards.includes(name))
                  .map(([name, total]) => (
                    <View key={name} style={[styles.breakdownItem, { borderBottomColor: isDark ? colorsNav.border : '#F0E8DC' }]}>
                      <View style={styles.breakdownLeft}>
                        <View style={[styles.accIcon, { backgroundColor: name === 'Efectivo' ? '#E8F5E9' : '#F0E6FF' }]}>
                          <MaterialIcons
                            name={name === 'Efectivo' ? 'money' : (name === 'Transferencia' || name === 'Bancaria') ? 'account-balance' : 'wallet' as any}
                            size={20}
                            color={name === 'Efectivo' ? colorsNav.accent : '#8B5CF6'}
                          />
                        </View>
                        <Text style={[styles.accName, { color: colorsNav.text }]}>{name}</Text>
                      </View>
                      <Text style={[styles.accValue, { color: colorsNav.text }]}>{fmt(total as number)}</Text>
                    </View>
                  ))}
              </View>
            </ScrollView>

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
  // ── DESKTOP RESTRUCTURE REFINED (70/30) ──────────────────
  desktopMainRowRefined: {
    flexDirection: 'row',
    gap: 30,
    alignItems: 'flex-start',
    marginTop: 10,
  },
  desktopMainCol: {
    flex: 0.7,
    paddingRight: 10,
  },
  desktopSidebarCol: {
    flex: 0.3,
  },
  mainHeroCard: {
    width: '100%',
    borderRadius: 36,
    padding: 40,
    height: 260,
    justifyContent: 'center',
    marginBottom: 25,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mainHeroCardMobile: {
    width: '100%',
    borderRadius: 24,
    padding: 30,
    height: 220,
    justifyContent: 'flex-start',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  mobileTrendContainer: {
    position: 'absolute',
    bottom: 25,
    right: 25,
    zIndex: 3,
  },
  mobileTrendBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 50,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  mobileTrendTxt: { fontSize: 13, fontWeight: '800' },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    zIndex: 2,
  },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  heroAmount: { color: '#FFF', fontSize: 62, fontWeight: '900', letterSpacing: -2, zIndex: 2 },
  heroTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  heroTrendTxt: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  heroVisual: {
    position: 'absolute',
    right: -50,
    top: -30,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 110,
  },

  statsRowRefined: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 25,
  },
  statBoxRefined: {
    flex: 1,
    padding: 22,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconWrapRefined: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statLabelRefined: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  statValueRefined: { fontSize: 18, fontWeight: '900' },

  lowerGridRefined: {
    flexDirection: 'row',
    gap: 20,
  },
  healthGridCardRefined: {
    flex: 1,
    padding: 24,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileHealthCard: {
    padding: 24,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  mobileHealthCenter: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: 100,
  },
  mobileHealthDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  mobileHealthLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4,
    opacity: 0.7,
  },
  mobileHealthAmount: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  mobileHealthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  mobileAccountsCard: {
    padding: 24,
    borderRadius: 24,
    marginBottom: 100, // Extra para no tapar con el boton +
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  mobileStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  mobileStatBox: {
    flex: 1,
    padding: 18,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  mobileStatValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  mobileInvestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  healthCenterRefined: {
    position: 'relative',
    marginVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthInnerRefined: {
    position: 'absolute',
    alignItems: 'center',
  },
  healthScoreRefined: { fontSize: 40, fontWeight: '900' },
  healthSuffixRefined: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  healthTipRefined: { fontSize: 12, textAlign: 'center', fontWeight: '600', lineHeight: 18, opacity: 0.7 },

  accountsGridCardRefined: {
    flex: 1.2,
    padding: 24,
    borderRadius: 28,
  },
  ccContainerRefined: {
    marginTop: 15,
    flex: 1,
  },
  ccWrapperRefined: {
    borderRadius: 20,
    padding: 20,
    height: 160,
    justifyContent: 'space-between',
  },
  ccLabelRefined: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  ccAmountRefined: { color: '#FFF', fontSize: 28, fontWeight: '900', marginTop: 2 },
  ccFooterRefined: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  ccNumberRefined: { color: '#FFF', fontSize: 12, fontWeight: '700', opacity: 0.8 },
  ccBrandRefined: { color: '#FFF', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  payBtnSimpleRefined: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  payBtnSimpleTxtRefined: { fontWeight: '800', fontSize: 13 },

  sidebarCardRefined: {
    flex: 1,
    borderRadius: 28,
    padding: 24,
    minHeight: 800,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  sidebarHistoryListRefined: {
    flex: 1,
  },
  txItemRefined: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  txIconRoundRefined: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txNameRefined: { fontSize: 14, fontWeight: '700' },
  txDateRefined: { color: '#94A3B8', fontSize: 10, marginTop: 1, fontWeight: '600' },
  txAmtRefined: { fontSize: 14, fontWeight: '800' },

  sidebarChartBoxRefined: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  sidebarChartTitleRefined: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 15, textAlign: 'center' },
  fakeChartRefined: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
    paddingHorizontal: 5,
  },
  chartBarRefined: {
    width: 16,
    borderRadius: 5,
  },

  gridTitleRefined: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  rowBetweenRefined: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyCCRefined: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },

  // Base Styles
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 100 },
  desktopScrollContainer: { width: '100%', alignSelf: 'center', paddingHorizontal: 30, paddingTop: 30 },
  desktopHeader: { marginBottom: 30, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 20, marginHorizontal: -20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  logoIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 22, fontWeight: '900' },
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, height: 50, borderRadius: 16, gap: 10 },
  mainActionText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  subActionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50, borderRadius: 16, gap: 8 },
  subActionText: { fontSize: 13, fontWeight: '800' },
  headerIconBtnSmall: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: '600' },
  notifBadge: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', borderRadius: 28, padding: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  modalCloseBtn: { height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  modalCloseBtnText: { fontWeight: '800' },

  // Changelog
  changelogItem: { flexDirection: 'row', gap: 15, marginBottom: 15, padding: 12, borderRadius: 16 },
  changelogIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  changelogTextWrap: { flex: 1 },
  changelogItemTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  changelogItemDesc: { fontSize: 12, fontWeight: '500', opacity: 0.8 },

  // Transaction Lists (Mobile Legacy)
  txItem: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 16, borderRadius: 24 },
  txIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  txMeta: { flex: 1 },
  txTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  txSub: { fontSize: 12, opacity: 0.6, fontWeight: '600' },
  txAmount: { fontSize: 16, fontWeight: '900' },

  // Breakdown Refined
  refinedBreakdownBox: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 15,
  },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  breakdownValue: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -1,
  },
  breakdownMath: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  breakdownList: { marginTop: 10 },
  breakdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1 },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  accName: { fontSize: 14, fontWeight: '700' },
  accValue: { fontSize: 14, fontWeight: '800' },

  // Reminders / Others
  remBtnTextNo: { fontSize: 13, fontWeight: '700' },
  remBtnYes: { flex: 1.5, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  remBtnTextYes: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  investmentWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
});
