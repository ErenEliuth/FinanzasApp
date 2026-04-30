import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';
import {
  Alert, Modal, Platform, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator, Animated,
  Dimensions, KeyboardAvoidingView, TouchableWithoutFeedback
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { formatCurrency, convertCurrency, convertToBase, fetchExchangeRates } from '@/utils/currency';
import { searchAssets, fetchLivePrice, POPULAR_ASSETS, SearchResult, fetchBvcMarketOverview, simulateLiveVolatility } from '@/utils/stockPrices';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import { LineChart, PieChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';

export type AssetType = 'stock' | 'crypto' | 'fixed' | 'real_estate' | 'fund' | 'etf';

interface PriceAlert {
  id: string; ticker: string; targetPrice: number; condition: 'above' | 'below'; active: boolean;
}

interface Position {
  id: string;
  ticker: string;
  name?: string;
  shares: number;
  avgPrice: number;
  type: AssetType;
  currency?: string;
}

interface InvestGoal {
  id: string; name: string; target: number; current: number; icon: string; color: string;
}

const MOCK_DIVS: Record<string, { yield: number, months: number[] }> = {
  'ECOPETROL': { yield: 444, months: [3, 11] },
  'BCOLOMBIA': { yield: 3120, months: [0, 3, 6, 9] },
  'ISA': { yield: 1800, months: [4, 11] },
  'AAPL': { yield: 2.4, months: [1, 4, 7, 10] },
};

const TRII_FEE = 14875;

export default function InvestScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, currency, rates, isHidden } = useAuth();
  const colors = useThemeColors();

  const [positions, setPositions] = useState<Position[]>([]);
  const [detailAsset, setDetailAsset] = useState<Position | null>(null);
  const [activeTab, setActiveTab] = useState<'hub' | 'portfolio' | 'calendar'>('hub');
  const [modalVisible, setModalVisible] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [healthInfo, setHealthInfo] = useState({ available: 0, status: 'Calculando...' });
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // Search & Add Asset
  const [addFlowStep, setAddFlowStep] = useState<'category' | 'search' | 'amount'>('category');
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<SearchResult | null>(null);
  const [addShares, setAddShares] = useState('');
  const [addAvgPrice, setAddAvgPrice] = useState('');

  // Simulator
  const [simAmount, setSimAmount] = useState('');
  const [simResult, setSimResult] = useState<{ticker: string, amount: number, shares?: number}[] | null>(null);
  const [simRationale, setSimRationale] = useState('');

  const [showPerfChart, setShowPerfChart] = useState(true);
  const [showAllocChart, setShowAllocChart] = useState(true);
  const [healthScore, setHealthScore] = useState(0);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [newAlert, setNewAlert] = useState({ ticker: '', target: '', condition: 'above' as 'above' | 'below' });
  
  // BVC Market Status
  const [bvcMarket, setBvcMarket] = useState<SearchResult[]>([]);
  const [lastBvcUpdate, setLastBvcUpdate] = useState<Date>(new Date());
  const [bvcCountdown, setBvcCountdown] = useState(60); 
  const [hiddenBvcTickers, setHiddenBvcTickers] = useState<string[]>([]);

  const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates || {}), currency, isHidden);
  const usdToCop = rates?.USD || 3950;

  useEffect(() => { 
    if (isFocused) { 
      loadData(); 
      calculateInvestHealth(); 
      updateBvc();
    } 
  }, [isFocused]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBvcCountdown(prev => {
        if (prev <= 1) {
          updateBvc();
          refreshPrices(positions); // Actualizar también portafolio
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [positions]);

  const updateBvc = async () => {
    const data = await fetchBvcMarketOverview();
    const volatileData = data.map(asset => ({
      ...asset,
      price: simulateLiveVolatility(asset.price)
    }));
    setBvcMarket(volatileData);
    setLastBvcUpdate(new Date());
  };

  const getMarketStatus = () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    if (day === 0 || day === 6) return { label: 'CERRADO', color: '#EF4444' };
    if (hour >= 9 && hour < 16) return { label: 'ABIERTO', color: '#10B981' };
    return { label: 'CERRADO', color: '#EF4444' };
  };

  const loadData = async () => {
    try {
      if (!user) return;
      
      // Cargar Posiciones desde Supabase
      const { data: pData, error: pError } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id);
      
      if (!pError && pData) {
        const parsed = pData.map((p: any) => ({
          id: p.id,
          ticker: p.ticker,
          name: p.name,
          shares: Number(p.shares),
          avgPrice: Number(p.avg_price),
          type: p.type as AssetType,
          currency: p.currency
        }));
        setPositions(parsed);
        refreshPrices(parsed);
        handleDividendSync(parsed);
      }

      const storedDivs = await AsyncStorage.getItem(SYNC_KEYS.INVEST_DIVS(user.id));
      if (storedDivs) setTotalDividends(Number(storedDivs));

      const sPerf = await AsyncStorage.getItem(SYNC_KEYS.INVEST_PERF(user.id));
      if (sPerf !== null) setShowPerfChart(sPerf === 'true');
      const sAlloc = await AsyncStorage.getItem(SYNC_KEYS.INVEST_ALLOC(user.id));
      if (sAlloc !== null) setShowAllocChart(sAlloc === 'true');

      // Cargar Alertas desde Supabase
      const { data: aData } = await supabase.from('price_alerts').select('*').eq('user_id', user.id);
      if (aData) setAlerts(aData.map((a: any) => ({
        id: a.id, ticker: a.ticker, targetPrice: a.target_price, condition: a.condition, active: a.active
      })));

      const storedHidden = await AsyncStorage.getItem('@hidden_bvc_tickers');
      if (storedHidden) setHiddenBvcTickers(JSON.parse(storedHidden));

      calculateInvestHealth();
    } catch (e) { 
        console.log("No se pudo cargar price_alerts o salud - omitiendo."); 
    }
  };

  const handleDividendSync = async (pos: Position[]) => {
    if (!user) return;
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastCheckStr = await AsyncStorage.getItem(SYNC_KEYS.INVEST_SYNC(user.id));
      
      if (!lastCheckStr) {
        await AsyncStorage.setItem(SYNC_KEYS.INVEST_SYNC(user.id), `${currentMonth}-${currentYear}`);
        await syncUp(user.id);
        return;
      }

      const [lastMonth, lastYear] = lastCheckStr.split('-').map(Number);
      if (currentMonth === lastMonth && currentYear === lastYear) return;

      let monthsToProcess: number[] = [];
      let checkM = lastMonth;
      let checkY = lastYear;

      while (checkM !== currentMonth || checkY !== currentYear) {
        checkM++;
        if (checkM > 11) { checkM = 0; checkY++; }
        monthsToProcess.push(checkM);
        if (checkM === currentMonth && checkY === currentYear) break;
      }
      
      if (monthsToProcess.length === 0) return;

      let extraDivs = 0;
      pos.forEach(p => {
        const dConfig = MOCK_DIVS[p.ticker];
        if (dConfig) {
          const payPerMonth = dConfig.yield / (dConfig.months.length || 1);
          monthsToProcess.forEach(m => {
            if (dConfig.months.includes(m)) {
              extraDivs += p.shares * payPerMonth;
            }
          });
        }
      });

      if (extraDivs > 0) {
        const currentStored = await AsyncStorage.getItem(SYNC_KEYS.INVEST_DIVS(user.id));
        const newTotal = (Number(currentStored) || 0) + extraDivs;
        setTotalDividends(newTotal);
        await AsyncStorage.setItem(SYNC_KEYS.INVEST_DIVS(user.id), String(newTotal));
        Alert.alert("💸 Dividendos Cobrados", `Se han sumado ${fmt(extraDivs)} a tu patrimonio por fechas de pago cumplidas.`);
      }

      await AsyncStorage.setItem(SYNC_KEYS.INVEST_SYNC(user.id), `${currentMonth}-${currentYear}`);
      await syncUp(user.id);
    } catch (e) {
      console.log("Error en sync de dividendos:", e);
    }
  };

  const calculateInvestHealth = async () => {
    if (!user) return;
    try {
      const alloc = getAllocation();
      let score = 70;
      const maxAlloc = Math.max(...Object.values(alloc));
      if (maxAlloc > 45) score -= 20; 
      else if (maxAlloc < 30) score += 10;
      const activeTypes = Object.values(alloc).filter(p => p > 5).length;
      if (activeTypes >= 3) score += 15;
      if (activeTypes >= 4) score += 5;
      setHealthScore(Math.min(100, Math.max(0, score)));
    } catch (e) { }
  };



  const handleCreateAlert = async () => {
    if (!user || !newAlert.ticker || !newAlert.target) return;
    const targetNum = parseFloat(newAlert.target.replace(/\D/g, ''));
    
    const dbAlert = {
      user_id: user.id,
      ticker: newAlert.ticker,
      target_price: targetNum,
      condition: newAlert.condition,
      active: true
    };

    const { data: inserted } = await supabase.from('price_alerts').insert([dbAlert]).select();
    if (inserted) {
      setAlerts([...alerts, { id: inserted[0].id, ticker: inserted[0].ticker, targetPrice: inserted[0].target_price, condition: inserted[0].condition, active: true }]);
      setAlertModalVisible(false);
      Alert.alert("Éxito", "Alerta de precio creada. Te notificaremos cuando se cruce el umbral.");
    }
  };

  const togglePerfChart = async () => {
    if (!user?.id) return;
    const val = !showPerfChart;
    setShowPerfChart(val);
    await AsyncStorage.setItem(SYNC_KEYS.INVEST_PERF(user.id), String(val));
    await syncUp(user.id);
    if (Platform.OS !== 'web') {
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const toggleAllocChart = async () => {
    if (!user?.id) return;
    const val = !showAllocChart;
    setShowAllocChart(val);
    await AsyncStorage.setItem(SYNC_KEYS.INVEST_ALLOC(user.id), String(val));
    await syncUp(user.id);
    if (Platform.OS !== 'web') {
        const Haptics = require('expo-haptics');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const refreshPrices = async (pos: Position[]) => {
    const prices: Record<string, number> = {};
    
    for (const p of pos) {
      try {
        const livePrice = await fetchLivePrice(p.ticker, p.type);
        if (livePrice !== null) {
          const volatilePrice = simulateLiveVolatility(livePrice);
          const isUsd = p.currency === 'USD' || (p.type === 'crypto') || (p.type === 'etf' && p.ticker !== 'ICOLEAP');
          const currentVal = isUsd ? volatilePrice * usdToCop : volatilePrice;
          prices[p.id] = currentVal;
          checkAlerts(p.ticker, currentVal); 
        } else {
          prices[p.id] = p.avgPrice;
        }
      } catch (e) {
        prices[p.id] = p.avgPrice;
      }
    }
    setLivePrices(prices);
    calculateInvestHealth();
  };

  const checkAlerts = async (ticker: string, currentPrice: number) => {
    // 1. Alertas Manuales (Si existen)
    const activeAlerts = alerts.filter(a => a.ticker === ticker && a.active);
    for (const alert of activeAlerts) {
       let triggered = false;
       if (alert.condition === 'above' && currentPrice >= alert.targetPrice) triggered = true;
       if (alert.condition === 'below' && currentPrice <= alert.targetPrice) triggered = true;

       if (triggered) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🚨 Alerta: ${ticker}`,
              body: `¡Llegamos! ${ticker} cruzó tu objetivo de ${fmt(alert.targetPrice)}.`,
            },
            trigger: null,
          });
          setAlerts(prev => prev.map(a => a.id === alert.id ? {...a, active: false} : a));
          await supabase.from('price_alerts').update({ active: false }).eq('id', alert.id);
       }
    }

    // 2. 🟢 CONSEJO AUTOMÁTICO DE SANTY (BUY THE DIP)
    const pos = positions.find(p => p.ticker === ticker);
    if (pos) {
       const dropPct = ((pos.avgPrice - currentPrice) / pos.avgPrice) * 100;
       if (dropPct >= 5) { // Si bajó más del 5% de tu promedio
          const lastAdviceKey = `@santy_advice_${ticker}_${new Date().toDateString()}`;
          const alreadyAdvised = await AsyncStorage.getItem(lastAdviceKey);
          
          if (!alreadyAdvised) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `💡 Consejo de Santy: ¡Oportunidad!`,
                  body: `${ticker} está un ${dropPct.toFixed(1)}% abajo de tu precio promedio. ¡Es un buen momento para comprar y promediar!`,
                },
                trigger: null,
              });
              await AsyncStorage.setItem(lastAdviceKey, 'true');
          }
       }
    }
  };


  // Search handler with debounce
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) { 
        if (selectedAssetType === 'stock' && bvcMarket.length > 0) {
          setSearchResults(bvcMarket);
        } else if (selectedAssetType) {
          setSearchResults(POPULAR_ASSETS.filter(a => a.type === selectedAssetType).slice(0, 8));
        } else {
          setSearchResults(POPULAR_ASSETS.slice(0, 8)); 
        }
        return; 
    }
    
    try {
      setIsSearching(true);
      const results = await searchAssets(q);
      if (selectedAssetType) {
          setSearchResults(results.filter(r => r.type === selectedAssetType));
      } else {
          setSearchResults(results);
      }
    } catch (err) {
      console.error("Search failed:", err);
      // Fallback to local search if remote fails
      const q_upper = q.toUpperCase();
      const local = POPULAR_ASSETS.filter(a => a.ticker.includes(q_upper) || a.name.toUpperCase().includes(q_upper));
      setSearchResults(selectedAssetType ? local.filter(a => a.type === selectedAssetType) : local);
    } finally {
      setIsSearching(false);
    }
  }, [selectedAssetType, bvcMarket]);

  const handleSelectAsset = (asset: SearchResult) => {
    setSelectedAsset(asset);
    setAddAvgPrice(asset.price.toString());
    setSearchQuery('');
    setSearchResults([]);
    setAddFlowStep('amount');
  };

  const handleSavePosition = async () => {
    if (!selectedAsset || !addShares || !user) return;
    const customPrice = parseFloat(addAvgPrice.replace(',', '.'));
    const basePrice = isNaN(customPrice) ? selectedAsset.price : customPrice;
    
    let priceCOP = selectedAsset.currency === 'USD' ? basePrice * usdToCop : basePrice;
    
    const dbEntry = {
      user_id: user.id,
      ticker: selectedAsset.ticker,
      name: selectedAsset.name,
      shares: sharesNum,
      avg_price: priceCOP,
      type: selectedAsset.type,
      currency: selectedAsset.currency
    };

    const { data: inserted, error } = await supabase.from('investments').insert([dbEntry]).select();
    
    if (!error && inserted) {
      const newPos: Position = {
        id: inserted[0].id,
        ticker: inserted[0].ticker,
        name: inserted[0].name,
        shares: Number(inserted[0].shares),
        avgPrice: Number(inserted[0].avg_price),
        type: inserted[0].type as AssetType,
        currency: inserted[0].currency,
      };
      const updated = [...positions, newPos];
      setPositions(updated);
      setSelectedAsset(null); setAddShares(''); setSearchQuery(''); setModalVisible(false);
      refreshPrices(updated);
    } else {
      Alert.alert("Error", "No se pudo guardar la inversión en la nube.");
    }
  };

  const handleDeletePosition = async (id: string) => {
    const { error } = await supabase.from('investments').delete().eq('id', id);
    if (!error) {
      const updated = positions.filter(p => p.id !== id);
      setPositions(updated);
      setDeletingId(null);
    } else {
      Alert.alert("Error", "No se pudo eliminar de la nube.");
    }
  };

  const handleDeleteBvcTicker = async (ticker: string) => {
    Alert.alert(
      "Ocultar Acción",
      `¿No quieres ver ${ticker} en tu tira?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sí, ocultar", 
          style: "destructive",
          onPress: async () => {
            const updated = [...hiddenBvcTickers, ticker];
            setHiddenBvcTickers(updated);
            await AsyncStorage.setItem('@hidden_bvc_tickers', JSON.stringify(updated));
            if (Platform.OS !== 'web') {
              const Haptics = require('expo-haptics');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        }
      ]
    );
  };



  const getAssetIcon = (type: AssetType) => {
    switch(type) {
      case 'crypto': return <MaterialCommunityIcons name="bitcoin" size={22} color="#F7931A" />;
      case 'real_estate': return <MaterialIcons name="apartment" size={22} color="#6366F1" />;
      case 'fixed': return <MaterialIcons name="trending-up" size={22} color="#10B981" />;
      case 'fund': return <MaterialIcons name="pie-chart" size={22} color="#3B82F6" />;
      case 'etf': return <MaterialIcons name="layers" size={22} color="#8B5CF6" />;
      default: return <MaterialIcons name="show-chart" size={22} color={colors.accent} />;
    }
  };

  const getAssetColor = (type: AssetType) => {
    switch(type) {
      case 'crypto': return '#F7931A'; case 'real_estate': return '#6366F1';
      case 'fixed': return '#10B981'; case 'fund': return '#3B82F6'; case 'etf': return '#8B5CF6';
      default: return colors.accent;
    }
  };

  const totalCurrent = positions.reduce((s, p) => s + (p.shares * (livePrices[p.id] || p.avgPrice)), 0);
  const totalInvested = positions.reduce((s, p) => s + (p.shares * p.avgPrice), 0);
  const profitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;
  const profitAbs = totalCurrent - totalInvested;

  const getAllocation = () => {
    const alloc: Record<AssetType, number> = { stock: 0, crypto: 0, fixed: 0, real_estate: 0, fund: 0, etf: 0 };
    positions.forEach(p => { alloc[p.type] += p.shares * (livePrices[p.id] || p.avgPrice); });
    const total = Object.values(alloc).reduce((a, b) => a + b, 0);
    if (total === 0) return alloc;
    Object.keys(alloc).forEach(k => { alloc[k as AssetType] = (alloc[k as AssetType] / total) * 100; });
    return alloc;
  };
  const allocation = getAllocation();

  const getProjectedDividends = () => {
    const m = Array(12).fill(0);
    positions.forEach(pos => {
      const d = MOCK_DIVS[pos.ticker];
      if (d) { const pay = d.yield / (d.months.length || 1); d.months.forEach(mi => { m[mi] += pos.shares * pay; }); }
    });
    return m;
  };
  const projectedDivs = getProjectedDividends();
  const nextMonthDiv = projectedDivs[(new Date().getMonth() + 1) % 12];
  const projectedSurplus = healthInfo.available > 0 ? healthInfo.available : 0;

  const getSantyPack = (amount: number) => {
    if (amount <= TRII_FEE) return { items: [], rationale: 'El monto es insuficiente para cubrir la comisión.' };
    const net = amount - TRII_FEE;
    const pool = [...POPULAR_ASSETS.filter(a => a.type !== 'crypto' && a.type !== 'real_estate')].sort(() => 0.5 - Math.random()).slice(0, 4);
    const weights = [0.4, 0.3, 0.2, 0.1];
    const items = pool.map((s, i) => ({ ticker: s.ticker, amount: net * weights[i], shares: s.price ? Math.floor((net * weights[i]) / s.price) : undefined }));
    return { items, rationale: `Comisión Trii: ${fmt(TRII_FEE)}. Capital neto: ${fmt(net)}` };
  };

  const handleSimulate = () => {
    const amount = parseFloat(simAmount.replace(/\D/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    const res = getSantyPack(amount);
    setSimResult(res.items); setSimRationale(res.rationale);
  };

  const allocColors: Record<string, string> = { stock: colors.accent, crypto: '#F7931A', fixed: '#10B981', real_estate: '#6366F1', fund: '#3B82F6', etf: '#8B5CF6' };
  const allocLabels: Record<string, string> = { stock: 'Acciones' };

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => activeTab === 'hub' ? router.back() : setActiveTab('hub')} style={[s.backBtn, { backgroundColor: colors.card }]}>
          <Ionicons name={activeTab === 'hub' ? "close" : "arrow-back"} size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          {activeTab === 'hub' ? 'Inversiones' : activeTab === 'portfolio' ? 'Portafolio' : 'Dividendos'}
        </Text>
        {activeTab === 'portfolio' ? (
          <TouchableOpacity onPress={() => { 
            setSelectedAssetType('stock');
            setSearchResults(bvcMarket.length > 0 ? bvcMarket : POPULAR_ASSETS.filter(a => a.type === 'stock').slice(0, 8));
            setAddFlowStep('search');
            setModalVisible(true); 
          }} style={[s.addBtn, { backgroundColor: colors.accent }]}>
            <Ionicons name="add" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
      >
        <ScrollView contentContainerStyle={s.mainScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ═══ HUB ═══ */}
          {activeTab === 'hub' && (
            <View>
              {/* Summary Card */}
              <LinearGradient 
                colors={profitAbs >= 0 ? ['#8B5CF6', '#7C3AED'] : ['#EF4444', '#DC2626']} 
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[s.summaryCard, { borderColor: 'rgba(255,255,255,0.1)' }]}
              >
                <Text style={[s.summaryLabel, { color: 'rgba(255,255,255,0.7)' }]}>PATRIMONIO TOTAL</Text>
                <Text style={[s.summaryAmount, { color: '#FFF' }]}>{fmt(totalCurrent + totalDividends)}</Text>
                <View style={s.summaryRow}>
                  <View style={[s.chip, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>
                      {profitAbs >= 0 ? '▲' : '▼'} {profitPct.toFixed(1)}%
                    </Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' }}>{fmt(Math.abs(profitAbs))} {profitAbs >= 0 ? 'ganancia' : 'pérdida'}</Text>
                  
                  <TouchableOpacity onPress={togglePerfChart} style={{ marginLeft: 'auto', padding: 4 }}>
                    <Ionicons name={showPerfChart ? "eye-off-outline" : "eye-outline"} size={18} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>

                {/* HEALTH SCORE GAUGE */}
                <View style={{ width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 25 }}>
                   <View style={{ width: `${healthScore}%`, height: '100%', backgroundColor: '#FFF', borderRadius: 2 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                   <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800' }}>SALUD PORTAFOLIO</Text>
                   <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{healthScore}/100</Text>
                </View>

                {/* 📊 MINI GRÁFICA DE RENDIMIENTO (SIMULADA) */}
                {showPerfChart && (
                  <View style={{ width: '100%', height: 70, marginTop: 15, justifyContent: 'center' }}>
                    <LineChart
                      data={{
                        labels: ["1", "2", "3", "4", "5", "6"],
                        datasets: [{
                          data: [
                            totalCurrent * 0.95 + 100, 
                            totalCurrent * 0.97 - 50, 
                            totalCurrent * 0.98 + 20, 
                            totalCurrent * 0.96 + 80, 
                            totalCurrent * 0.99 - 10, 
                            totalCurrent
                          ]
                        }]
                      }}
                      width={Dimensions.get('window').width - 80}
                      height={60}
                      chartConfig={{
                        backgroundColor: 'transparent',
                        backgroundGradientFrom: '#FFF',
                        backgroundGradientTo: '#FFF',
                        backgroundGradientFromOpacity: 0,
                        backgroundGradientToOpacity: 0,
                        paddingRight: 0,
                        paddingTop: 0,
                        decimalPlaces: 0,
                        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                        style: { borderRadius: 16 },
                        propsForBackgroundLines: { strokeOpacity: 0 },
                        propsForDots: { r: "0" }
                      }}
                      bezier
                      style={{ marginLeft: -20, marginBottom: -10 }}
                      withInnerLines={false}
                      withOuterLines={false}
                      withHorizontalLabels={false}
                      withVerticalLabels={false}
                    />
                  </View>
                )}
              </LinearGradient>

              {/* 🕒 BVC MARKET STATUS SECTION */}
              <View style={[s.bvcMarketSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                  <View>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>Mercado BVC 🇨🇴</Text>
                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '700' }}>Cómo amaneció la bolsa hoy</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={[s.statusBadge, { backgroundColor: getMarketStatus().color + '15' }]}>
                      <View style={[s.statusDot, { backgroundColor: getMarketStatus().color }]} />
                      <Text style={{ color: getMarketStatus().color, fontSize: 10, fontWeight: '900' }}>{getMarketStatus().label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialCommunityIcons name="clock-outline" size={12} color={colors.sub} />
                      <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700' }}>Actualiza en {Math.floor(bvcCountdown / 60)}:{(bvcCountdown % 60).toString().padStart(2, '0')}</Text>
                    </View>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
                  {bvcMarket.filter(a => !hiddenBvcTickers.includes(a.ticker)).map((asset, i) => (
                    <TouchableOpacity 
                      key={i} 
                      style={[s.bvcAssetCard, { backgroundColor: colors.bg, borderColor: colors.border }]}
                      onLongPress={() => handleDeleteBvcTicker(asset.ticker)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '900' }}>{asset.ticker}</Text>
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{fmt(asset.price)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                        <Text style={{ color: asset.changePercent >= 0 ? '#10B981' : '#EF4444', fontSize: 10, fontWeight: '900' }}>
                          {asset.changePercent >= 0 ? '▲' : '▼'}
                        </Text>
                        <Text style={{ color: asset.changePercent >= 0 ? '#10B981' : '#EF4444', fontSize: 11, fontWeight: '800' }}>
                          {asset.changePercent >= 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {bvcMarket.length === 0 && (
                    <Text style={{ color: colors.sub, fontSize: 12, paddingVertical: 10 }}>Cargando datos del mercado...</Text>
                  )}
                </ScrollView>
              </View>

              {/* Quick Stats Row */}
              <View style={s.quickRow}>
                <View style={[s.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialIcons name="pie-chart" size={18} color={colors.accent} />
                  <Text style={[s.quickNum, { color: colors.text }]}>{positions.length}</Text>
                  <Text style={[s.quickLabel, { color: colors.sub }]}>Activos</Text>
                </View>
                <View style={[s.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialIcons name="payments" size={18} color="#3B82F6" />
                  <Text style={[s.quickNum, { color: colors.text }]}>{fmt(nextMonthDiv)}</Text>
                  <Text style={[s.quickLabel, { color: colors.sub }]}>Próx. Div</Text>
                </View>
              </View>

              {/* Navigation Cards */}
              <View style={{ gap: 12, marginTop: 8 }}>
                {[
                  { id: 'portfolio', label: 'Mi Portafolio', sub: `${positions.length} activos · ${fmt(totalCurrent)}`, icon: 'pie-chart', color: colors.accent },
                  { id: 'calendar', label: 'Dividendos & Rentas', sub: `Anual est: ${fmt(projectedDivs.reduce((a,b)=>a+b, 0))}`, icon: 'calendar-month', color: '#3B82F6' },
                ].map(item => (
                  <TouchableOpacity key={item.id} style={[s.navCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setActiveTab(item.id as any)}>
                    <View style={[s.navIcon, { backgroundColor: item.color + '12' }]}>
                      <MaterialIcons name={item.icon as any} size={24} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{item.label}</Text>
                      <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600', marginTop: 2 }}>{item.sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.sub} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ═══ PORTFOLIO ═══ */}
          {activeTab === 'portfolio' && (
            <View>
              {/* Portfolio Summary */}
              <View style={[s.portfolioSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={s.portfolioRow}>
                  <View>
                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800' }}>INVERTIDO</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{fmt(totalInvested)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800' }}>ACTUAL</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{fmt(totalCurrent)}</Text>
                  </View>
                </View>
                <View style={[s.profitBadge, { backgroundColor: profitAbs >= 0 ? '#10B98112' : '#EF444412' }]}>
                  <Text style={{ color: profitAbs >= 0 ? '#10B981' : '#EF4444', fontWeight: '900', fontSize: 13 }}>
                    {profitAbs >= 0 ? '+' : ''}{fmt(profitAbs)} ({profitPct.toFixed(1)}%)
                  </Text>
                </View>
              </View>

              {/* Allocation Breakdown (Sleek Bar) */}
              {totalCurrent > 0 && (
                <View style={[s.allocSection, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 20 }]}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '900', textAlign: 'center', marginBottom: 15 }}>DISTRIBUCIÓN DEL PORTAFOLIO</Text>
                    
                    <View style={{ height: 12, backgroundColor: colors.bg, borderRadius: 6, marginHorizontal: 20, flexDirection: 'row', overflow: 'hidden' }}>
                        {Object.entries(allocation).map(([type, pct]) => pct > 0 && (
                            <View key={type} style={{ width: `${pct}%`, height: '100%', backgroundColor: allocColors[type] }} />
                        ))}
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 15, paddingHorizontal: 20 }}>
                        {Object.entries(allocation).map(([type, pct]) => pct > 0 && (
                            <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: allocColors[type] }} />
                                <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '700' }}>{allocLabels[type]} {pct.toFixed(0)}%</Text>
                            </View>
                        ))}
                    </View>
                </View>
              )}

              {/* Assets List */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 16 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Activos ({positions.length})</Text>
                <TouchableOpacity onPress={() => refreshPrices(positions)}>
                  <Ionicons name="refresh" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>

              {positions.sort((a,b) => {
                const valA = a.shares * (livePrices[a.id] || a.avgPrice);
                const valB = b.shares * (livePrices[b.id] || b.avgPrice);
                return valB - valA;
              }).map(pos => {
                const currentPrice = livePrices[pos.id] || pos.avgPrice;
                const value = pos.shares * currentPrice;
                const totalCost = pos.shares * pos.avgPrice;
                const gain = value - totalCost;
                const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
                const assetColor = getAssetColor(pos.type);
                
                return (
                  <TouchableOpacity 
                    key={pos.id} 
                    style={[s.assetCard, { backgroundColor: colors.card, borderColor: colors.border }]} 
                    onLongPress={() => {
                        if (Platform.OS === 'web') {
                            if (window.confirm('¿Eliminar esta posición?')) handleDeletePosition(pos.id);
                        } else {
                            setDeletingId(pos.id);
                        }
                    }}
                    onPress={() => setDetailAsset(pos)}
                  >
                    <View style={s.assetMain}>
                      <View style={[s.assetIconWrapper, { backgroundColor: assetColor + '15' }]}>
                        {getAssetIcon(pos.type)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.assetTicker, { color: colors.text }]}>{pos.ticker}</Text>
                        <Text style={[s.assetSub, { color: colors.sub }]} numberOfLines={1}>
                          {pos.name || pos.ticker} · {pos.shares.toLocaleString()} unid.
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={() => { setNewAlert({ ...newAlert, ticker: pos.ticker }); setAlertModalVisible(true); }}>
                           <MaterialCommunityIcons name="bell-outline" size={18} color={alerts.some(a => a.ticker === pos.ticker) ? colors.accent : colors.sub} />
                        </TouchableOpacity>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[s.assetValue, { color: colors.text }]}>{fmt(value)}</Text>
                            <View style={[s.gainBadge, { backgroundColor: gain >= 0.01 ? '#10B98115' : gain <= -0.01 ? '#EF444415' : colors.sub + '15' }]}>
                            <Text style={{ 
                                color: gain >= 0.01 ? '#10B981' : gain <= -0.01 ? '#EF4444' : colors.sub, 
                                fontSize: 11, 
                                fontWeight: '900' 
                            }}>
                                {gain > 0.01 ? '+' : ''}{gainPct.toFixed(2)}%
                            </Text>
                            </View>
                        </View>
                      </View>
                    </View>
                    
                    {deletingId === pos.id && (
                      <View style={s.deleteOverlay}>
                        <TouchableOpacity onPress={() => setDeletingId(null)} style={s.cancelBtn}>
                           <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeletePosition(pos.id)} style={s.confirmDeleteBtn}>
                           <Ionicons name="trash" size={18} color="#FFF" />
                           <Text style={{ color: '#FFF', fontWeight: '800' }}>Eliminar</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {positions.length === 0 && (
                <View style={[s.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialIcons name="show-chart" size={40} color={colors.sub} />
                  <Text style={{ color: colors.sub, fontSize: 14, fontWeight: '700', marginTop: 12 }}>Agrega tu primer activo</Text>
                  <TouchableOpacity onPress={() => { setModalVisible(true); setAddFlowStep('category'); }} style={[s.emptyBtn, { backgroundColor: colors.accent }]}>
                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>+ Buscar Activo</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ═══ CALENDAR ═══ */}
          {activeTab === 'calendar' && (
            <View>
              <View style={[s.divSummary, { backgroundColor: colors.accent }]}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' }}>DIVIDENDOS ANUALES ESTIMADOS</Text>
                <Text style={{ color: '#FFF', fontSize: 30, fontWeight: '900', marginTop: 4 }}>{fmt(projectedDivs.reduce((a,b)=>a+b, 0))}</Text>
              </View>
              {projectedDivs.map((amount, idx) => amount > 0 && (
                <View key={idx} style={[s.divRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[s.monthBadge, { backgroundColor: colors.accent + '12' }]}>
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '900' }}>{['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][idx]}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 }}>{fmt(amount)}</Text>
                  <Ionicons name="calendar-outline" size={16} color={colors.sub} />
                </View>
              ))}
            </View>
          )}

      {/* ═══ ADD ASSET MODAL ═══ */}
      <Modal visible={modalVisible} transparent animationType="slide" statusBarTranslucent>
        <View style={s.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => { setModalVisible(false); setSelectedAsset(null); setSearchQuery(''); }}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
            <View style={[s.modalBox, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                {addFlowStep === 'amount' ? (
                  <TouchableOpacity onPress={() => setAddFlowStep('search')} style={{ marginRight: 10 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                  </TouchableOpacity>
                ) : <View style={{ width: 34 }} />}
                
                <Text style={[s.modalTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                  {addFlowStep === 'search' ? 'Buscar Acción' : 'Detalles de Compra'}
                </Text>
                
                <TouchableOpacity onPress={() => { setModalVisible(false); setSelectedAsset(null); setSearchQuery(''); }}>
                  <Ionicons name="close" size={24} color={colors.sub} />
                </TouchableOpacity>
              </View>


              {addFlowStep === 'search' && (
                <>
                  <View style={[s.searchBar, { backgroundColor: colors.bg }]}>
                    <Ionicons name="search" size={18} color={colors.sub} />
                    <TextInput style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '600', marginLeft: 10 }}
                      placeholder="Buscar por nombre o ticker..." placeholderTextColor={colors.sub}
                      value={searchQuery} onChangeText={handleSearch} autoFocus autoCorrect={false} autoCapitalize="none" textContentType="none" />
                    {isSearching && <ActivityIndicator size="small" color={colors.accent} />}
                  </View>
                  <ScrollView style={{ maxHeight: 260, marginTop: 12 }} showsVerticalScrollIndicator={false}>
                    {searchResults.map((asset, i) => (
                      <TouchableOpacity key={i} style={[s.searchItem, { borderColor: colors.border }]} onPress={() => handleSelectAsset(asset)}>
                        <View style={[s.searchIcon, { backgroundColor: getAssetColor(asset.type as AssetType) + '12' }]}>
                          {asset.type === 'crypto' ? <MaterialCommunityIcons name="bitcoin" size={20} color="#F7931A" /> : <MaterialIcons name="show-chart" size={20} color={colors.accent} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{asset.ticker}</Text>
                          <Text style={{ color: colors.sub, fontSize: 11 }} numberOfLines={1}>{asset.name}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>
                            {fmt(asset.currency === 'USD' ? asset.price * usdToCop : asset.price)}
                          </Text>
                          <Text style={{ color: asset.changePercent >= 0 ? '#10B981' : '#EF4444', fontSize: 11, fontWeight: '700' }}>
                            {asset.changePercent >= 0 ? '+' : ''}{asset.changePercent.toFixed(2)}%
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    {searchResults.length === 0 && (
                      <Text style={{ textAlign: 'center', color: colors.sub, marginTop: 40, fontWeight: '700' }}>No hubieron resultados para esta categoría.</Text>
                    )}
                  </ScrollView>
                </>
              )}
              
              {addFlowStep === 'amount' && selectedAsset && (
                <View>
                  {/* Premium Header for Asset */}
                  <LinearGradient 
                    colors={[colors.bg, colors.card]} 
                    style={[s.selectedAssetBox, { borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                      <View style={[s.assetIconWrapper, { backgroundColor: getAssetColor(selectedAsset.type as AssetType) + '15', width: 56, height: 56, borderRadius: 18 }]}>
                        {getAssetIcon(selectedAsset.type as AssetType)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{selectedAsset.ticker}</Text>
                        <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{selectedAsset.name}</Text>
                      </View>
                    </View>
                    
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 15 }} />
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>PRECIO ACTUAL</Text>
                        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 2 }}>
                          {fmt(selectedAsset.currency === 'USD' ? selectedAsset.price * usdToCop : selectedAsset.price)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={[s.statusBadge, { backgroundColor: selectedAsset.changePercent >= 0 ? '#10B98115' : '#EF444415', paddingVertical: 4, paddingHorizontal: 10 }]}>
                          <Text style={{ color: selectedAsset.changePercent >= 0 ? '#10B981' : '#EF4444', fontWeight: '900', fontSize: 12 }}>
                            {selectedAsset.changePercent >= 0 ? '▲' : '▼'} {Math.abs(selectedAsset.changePercent).toFixed(2)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  </LinearGradient>

                  <View style={{ gap: 15, marginTop: 20 }}>
                    <View>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>Cantidad de acciones</Text>
                      <TextInput 
                        style={[s.input, { backgroundColor: colors.bg, color: colors.text, height: 56, fontSize: 18, fontWeight: '700' }]}
                        placeholder="0" 
                        placeholderTextColor={colors.sub} 
                        keyboardType="decimal-pad"
                        value={addShares} 
                        onChangeText={setAddShares} 
                      />
                    </View>

                    <View>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
                        Precio de compra ({selectedAsset.currency || 'COP'})
                      </Text>
                      <TextInput 
                        style={[s.input, { backgroundColor: colors.bg, color: colors.text, height: 56, fontSize: 18, fontWeight: '700' }]}
                        placeholder={selectedAsset.price.toString()} 
                        placeholderTextColor={colors.sub} 
                        keyboardType="decimal-pad"
                        value={addAvgPrice} 
                        onChangeText={setAddAvgPrice} 
                      />
                      <Text style={{ color: colors.sub, fontSize: 11, marginTop: 6, marginLeft: 4 }}>
                        Si las compraste hace tiempo, pon el precio de ese entonces.
                      </Text>
                    </View>
                  </View>

                  {/* LIVE CALCULATION DASHBOARD */}
                  {addShares && parseFloat(addShares) > 0 && (
                    <View style={{ marginTop: 25, gap: 10 }}>
                      <View style={[s.calcCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <View style={s.calcRow}>
                          <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Patrimonio Actual</Text>
                          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>
                            {fmt((selectedAsset.currency === 'USD' ? selectedAsset.price * usdToCop : selectedAsset.price) * parseFloat(addShares || '0'))}
                          </Text>
                        </View>
                        
                        <View style={[s.calcRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '50' }]}>
                          <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Inversión Inicial</Text>
                          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                            {fmt((selectedAsset.currency === 'USD' ? (parseFloat(addAvgPrice) || selectedAsset.price) * usdToCop : (parseFloat(addAvgPrice) || selectedAsset.price)) * parseFloat(addShares || '0'))}
                          </Text>
                        </View>

                        {/* PROFIT INDICATOR */}
                        {(() => {
                          const currentPrice = selectedAsset.currency === 'USD' ? selectedAsset.price * usdToCop : selectedAsset.price;
                          const buyPriceInput = parseFloat(addAvgPrice.replace(',', '.'));
                          const buyPrice = isNaN(buyPriceInput) ? currentPrice : (selectedAsset.currency === 'USD' ? buyPriceInput * usdToCop : buyPriceInput);
                          const shares = parseFloat(addShares.replace(',', '.'));
                          const profit = (currentPrice - buyPrice) * shares;
                          const profitPct = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
                          
                          if (isNaN(profit) || Math.abs(profit) < 1) return null;

                          return (
                            <View style={[s.profitPreview, { backgroundColor: profit >= 0 ? '#10B98115' : '#EF444415', marginTop: 12 }]}>
                              <Text style={{ color: profit >= 0 ? '#10B981' : '#EF4444', fontSize: 14, fontWeight: '900' }}>
                                {profit >= 0 ? '¡Vas ganando ' : 'Vas perdiendo '} {fmt(Math.abs(profit))} ({profitPct.toFixed(1)}%)
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                    </View>
                  )}

                  <TouchableOpacity 
                    onPress={handleSavePosition} 
                    style={[s.confirmBtn, { backgroundColor: colors.accent, height: 56, marginTop: 25, borderRadius: 18 }]}
                  >
                    <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900' }}>Agregar al Portafolio</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>




      {/* Alert Modal */}
      <Modal visible={alertModalVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setAlertModalVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
            <View style={[s.modalBox, { backgroundColor: colors.card }]}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Alerta para {newAlert.ticker}</Text>
              <Text style={{ color: colors.sub, fontSize: 13, marginBottom: 15 }}>Avísame cuando el precio esté...</Text>
              
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                <TouchableOpacity onPress={() => setNewAlert({...newAlert, condition: 'above'})} style={[s.modalBtn, { backgroundColor: newAlert.condition === 'above' ? colors.accent : colors.bg }]}>
                    <Text style={{ color: newAlert.condition === 'above' ? '#FFF' : colors.text, fontWeight: '800' }}>Por Encima de</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setNewAlert({...newAlert, condition: 'below'})} style={[s.modalBtn, { backgroundColor: newAlert.condition === 'below' ? colors.accent : colors.bg }]}>
                    <Text style={{ color: newAlert.condition === 'below' ? '#FFF' : colors.text, fontWeight: '800' }}>Por Debajo de</Text>
                </TouchableOpacity>
              </View>

              <TextInput style={[s.input, { backgroundColor: colors.bg, color: colors.text, fontSize: 24 }]} placeholder="Precio Objetivo" placeholderTextColor={colors.sub} keyboardType="decimal-pad" value={newAlert.target} onChangeText={t => setNewAlert({...newAlert, target: t})} autoCorrect={false} />
              
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={[s.modalBtn, { backgroundColor: colors.bg }]} onPress={() => setAlertModalVisible(false)}><Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[s.modalBtn, { backgroundColor: colors.accent }]} onPress={handleCreateAlert}><Text style={{ color: '#FFF', fontWeight: '900' }}>Configurar Alerta</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  backBtn: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  addBtn: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  mainScroll: { paddingHorizontal: 20, paddingBottom: 120 },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },

  // Hub
  summaryCard: { padding: 24, borderRadius: 28, borderWidth: 1, marginBottom: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, elevation: 2 },
  summaryLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, opacity: 0.6 },
  summaryAmount: { fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  miniAllocBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 24, width: '100%', gap: 2 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickStat: { flex: 1, padding: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center', gap: 6 },
  quickNum: { fontSize: 15, fontWeight: '900' },
  quickLabel: { fontSize: 10, fontWeight: '700' },
  navCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 24, borderWidth: 1, gap: 14 },
  navIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Portfolio
  portfolioSummary: { padding: 24, borderRadius: 28, borderWidth: 1, marginBottom: 16 },
  portfolioRow: { flexDirection: 'row', justifyContent: 'space-between' },
  profitBadge: { marginTop: 16, padding: 12, borderRadius: 16, alignItems: 'center' },
  allocSection: { padding: 20, borderRadius: 28, borderWidth: 1, marginBottom: 20 },
  allocBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  allocLegend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 12, justifyContent: 'center' },
  allocItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allocDot: { width: 8, height: 8, borderRadius: 4 },
  
  // Asset Cards Improved
  assetCard: { borderRadius: 24, padding: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  assetMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  assetIconWrapper: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  assetTicker: { fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  assetSub: { fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  assetValue: { fontSize: 15, fontWeight: '900' },
  gainBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  deleteOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  confirmDeleteBtn: { backgroundColor: '#EF4444', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  
  emptyState: { padding: 40, borderRadius: 28, borderWidth: 1, alignItems: 'center', gap: 10 },
  emptyBtn: { marginTop: 10, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 16 },

  // Goals
  goalCard: { padding: 20, borderRadius: 28, borderWidth: 1, marginBottom: 16 },
  goalIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

  // Calendar
  divSummary: { padding: 32, borderRadius: 28, marginBottom: 16, alignItems: 'center' },
  divRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 8, gap: 14 },
  monthBadge: { width: 48, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },

  // AI
  santyCard: { padding: 28, borderRadius: 32 },
  tickerCard: { padding: 16, borderRadius: 20, borderWidth: 1, width: 115, marginRight: 12 },
  simCard: { padding: 24, borderRadius: 28, borderWidth: 1 },
  simInput: { flex: 1, borderRadius: 16, padding: 16, fontWeight: '800', fontSize: 16 },
  simBtn: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', elevation: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 60, maxHeight: '85%' },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  searchBar: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, height: 56 },
  searchItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 12 },
  searchIcon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  selectedAssetBox: { padding: 20, borderRadius: 24, marginTop: 12 },
  input: { borderRadius: 18, padding: 18, fontSize: 18, fontWeight: '800', marginBottom: 16 },
  totalPreview: { padding: 18, borderRadius: 20, alignItems: 'center', marginBottom: 16 },
  confirmBtn: { padding: 20, borderRadius: 22, alignItems: 'center', marginTop: 12 },
  modalBtn: { flex: 1, padding: 18, borderRadius: 18, alignItems: 'center' },
  insightSection: { marginTop: 24, borderRadius: 24, padding: 20, borderWidth: 1 },
  pathCard: { borderRadius: 24, padding: 20, borderWidth: 1 },
  pathIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  primaryBtn: { height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  tipCard: { width: 160, padding: 16, borderRadius: 24, borderWidth: 1, marginRight: 12 },
  strategyMiniCard: { width: 140, padding: 16, borderRadius: 24, borderWidth: 1, marginRight: 12 },
  strategyIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  
  // New Advice Section Styles
  santyAdviceCard: { padding: 20, borderRadius: 28, borderWidth: 1, marginBottom: 16 },
  adviceIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  adviceItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18, borderWidth: 1, gap: 12 },
  adviceItemIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  addSmallBtn: { width: 28, height: 28, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  adviceQuote: { fontSize: 13, lineHeight: 18, marginBottom: 16, fontWeight: '600', fontStyle: 'italic' },
  
  // BVC Market Section
  bvcMarketSection: { padding: 20, borderRadius: 28, borderWidth: 1, marginBottom: 16 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  bvcAssetCard: { width: 120, padding: 12, borderRadius: 20, borderWidth: 1, marginRight: 10 },
  
  // Trii Corner
  triiCorner: { padding: 20, borderRadius: 28, marginBottom: 16 },
  triiInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  triiInfoText: { fontSize: 12, fontWeight: '600' },
  triiPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },

  // Calc Dashboard
  calcCard: { padding: 18, borderRadius: 24, borderWidth: 1 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profitPreview: { padding: 12, borderRadius: 14, alignItems: 'center' },
});
