import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';
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
  View,
  ActivityIndicator
} from 'react-native';
import { formatCurrency, convertCurrency } from '@/utils/currency';
import TradingViewWidget from '@/components/TradingViewWidget';

export type AssetType = 'stock' | 'crypto' | 'fixed' | 'real_estate';

interface Position {
  id: string;
  ticker: string;
  shares: number;
  avgPrice: number; // Base COP
  type: AssetType;
}

// Simulador de precios fallback
const MOCK_PRICES: Record<string, number> = {
  'ECOPETROL': 2640,
  'BCOLOMBIA': 35200,
  'ISA': 19100,
  'GEB': 2620,
  'NUTRESA': 48000,
  'AAPL': 750000,
};

const SEARCH_SUGGESTIONS = [
    { ticker: 'ECOPETROL', name: 'Ecopetrol S.A.', price: 2640, type: 'stock' },
    { ticker: 'BCOLOMBIA', name: 'Bancolombia S.A.', price: 35200, type: 'stock' },
    { ticker: 'PFBCOLOM', name: 'Bancolombia Pref.', price: 34500, type: 'stock' },
    { ticker: 'GEB', name: 'Grupo Energía Bogotá', price: 2620, type: 'stock' },
    { ticker: 'ISA', name: 'Interconexión Eléctrica', price: 19100, type: 'stock' },
    { ticker: 'PFAVAL', name: 'Grupo Aval Pref.', price: 480, type: 'stock' },
    { ticker: 'PFGRUPSU', name: 'Grupo Sura Pref.', price: 32500, type: 'stock' },
    { ticker: 'CNEC', name: 'Canacol Energy', price: 12500, type: 'stock' },
    { ticker: 'NUTRESA', name: 'Nutresa S.A.', price: 48000, type: 'stock' },
    { ticker: 'AAPL', name: 'Apple Inc.', price: 750000, type: 'stock' },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 3200000, type: 'stock' },
    { ticker: 'TSLA', name: 'Tesla, Inc.', price: 820000, type: 'stock' },
    { ticker: 'AMZN', name: 'Amazon.com', price: 780000, type: 'stock' },
    { ticker: 'NU', name: 'NuBank (Nu Holdings)', price: 48000, type: 'stock' },
    { ticker: 'BTC', name: 'Bitcoin', price: 280000000, type: 'crypto' },
    { ticker: 'ETH', name: 'Ethereum', price: 12500000, type: 'crypto' },
    { ticker: 'SOL', name: 'Solana', price: 650000, type: 'crypto' },
];

// Valores reales de dividendos para Colombia (Anual promedio)
const MOCK_DIVS: Record<string, { yield: number, months: number[] }> = {
    'ECOPETROL': { yield: 444, months: [3, 11] }, // COP por accion, pagado en Abril y Diciembre
    'BCOLOMBIA': { yield: 3120, months: [0, 3, 6, 9] }, // COP por accion, trimestral
    'ISA': { yield: 1800, months: [4, 11] },
    'GEB': { yield: 220, months: [5, 11] },
    'AAPL': { yield: 2.4, months: [1, 4, 7, 10] }, // USD, simulado
};

const TARGET_ALLOC: Record<AssetType, number> = {
    'stock': 0.50,
    'crypto': 0.15,
    'fixed': 0.25,
    'real_estate': 0.10
};

export default function InvestScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, currency, rates, isHidden } = useAuth();
  const colors = useThemeColors();

  const [positions, setPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'ai'>('portfolio');
  const [modalVisible, setModalVisible] = useState(false);

  // Formulario nueva inversión
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<Record<AssetType, number>>({ stock: 0, crypto: 0, fixed: 0, real_estate: 0 });

  // Dividendos
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [divModalVisible, setDivModalVisible] = useState(false);
  const [divAmount, setDivAmount] = useState('');

  // Info IA / Salud Financiera
  const [healthInfo, setHealthInfo] = useState({ available: 0, status: 'Calculando...' });

  // Precios en tiempo real
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  
  // Simulator State
  const [simAmount, setSimAmount] = useState('');
  const [simResult, setSimResult] = useState<{ticker: string, amount: number, shares?: number}[] | null>(null);

  // Visibilidad y saldos
  const [showBalances, setShowBalances] = useState(true);

  // Sugerencias buscador
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // TradingView Chart
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [chartModalVisible, setChartModalVisible] = useState(false);

  // Funciones de formato
  const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);
  const baseFmt = (n: number) => formatCurrency(n, 'COP', isHidden);

  useEffect(() => {
    if (isFocused) {
      loadData();
      calculateHealth();
    }
  }, [isFocused]);

  const loadData = async () => {
    try {
      if (!user) return;
      const stored = await AsyncStorage.getItem(`@invest_${user?.id}`);
      let parsedPositions: Position[] = [];
      if (stored) {
        parsedPositions = JSON.parse(stored);
        parsedPositions = parsedPositions.map(p => ({ ...p, type: p.type || 'stock' }));
        setPositions(parsedPositions);
      }
      
      const storedDivs = await AsyncStorage.getItem(`@invest_divs_${user?.id}`);
      if (storedDivs) {
        setTotalDividends(Number(storedDivs));
      }

      fetchLivePrices(parsedPositions);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLivePrices = async (currentPositions: Position[]) => {
    if (currentPositions.length === 0) return;
    setIsFetchingPrices(true);
    const newPrices: Record<string, number> = { ...livePrices };

    try {
        for (const pos of currentPositions) {
            if (pos.type === 'fixed' || pos.type === 'real_estate') {
                newPrices[pos.id] = pos.avgPrice;
                continue;
            }
            newPrices[pos.id] = MOCK_PRICES[pos.ticker] || pos.avgPrice;
        }
    } catch (e) {}

    setLivePrices(newPrices);
    setIsFetchingPrices(false);

    // Calculate allocation
    const newAllocation: Record<AssetType, number> = { stock: 0, crypto: 0, fixed: 0, real_estate: 0 };
    let totalValue = 0;
    currentPositions.forEach(p => {
        const val = p.shares * (newPrices[p.id] || p.avgPrice);
        newAllocation[p.type] += val;
        totalValue += val;
    });

    if (totalValue > 0) {
        Object.keys(newAllocation).forEach(key => {
            newAllocation[key as AssetType] = (newAllocation[key as AssetType] / totalValue) * 100;
        });
    }
    setAllocation(newAllocation);
  };

  const calculateHealth = async () => {
    if (!user) return;
    try {
      const { data: allTx } = await supabase.from('transactions').select('amount, type, category').eq('user_id', user.id);
      const { data: allDebts } = await supabase.from('debts').select('value, paid').eq('user_id', user.id);

      let totalActive = 0, totalAhorro = 0;
      allTx?.forEach(t => {
        if (t.type === 'income') totalActive += t.amount;
        else {
          if (t.category === 'Ahorro') totalAhorro += t.amount;
          totalActive -= t.amount;
        }
      });
      const debtTotal = allDebts?.reduce((sum, d) => sum + (Number(d.value) - Number(d.paid || 0)), 0) || 0;

      const healthPct = totalActive > 0 ? ((totalActive + totalAhorro - debtTotal) / (totalActive + totalAhorro)) * 100 : 0;
      let status = healthPct >= 70 ? 'Óptima' : healthPct >= 40 ? 'Regular' : 'Baja';

      setHealthInfo({ available: totalActive, status });
    } catch (e) { }
  };

  const handleSavePosition = async () => {
    if (!ticker || !shares || !avgPrice) return;
    const newPos: Position = {
      id: Date.now().toString(),
      ticker: ticker.toUpperCase().trim(),
      shares: parseFloat(shares.replace(',', '.')),
      avgPrice: parseFloat(avgPrice.replace(/\./g, '').replace(',', '.')),
      type: assetType
    };
    const updated = [...positions, newPos];
    setPositions(updated);
    await AsyncStorage.setItem(`@invest_${user?.id}`, JSON.stringify(updated));
    setTicker(''); setShares(''); setAvgPrice('');
    setModalVisible(false);
    fetchLivePrices(updated);
  };

  const handleTickerSearch = (text: string) => {
    setTicker(text.toUpperCase());
    if (text.length > 1) {
        const filtered = SEARCH_SUGGESTIONS.filter(s => 
            s.ticker.includes(text.toUpperCase()) || 
            s.name.toLowerCase().includes(text.toLowerCase())
        );
        setSuggestions(filtered);
    } else {
        setSuggestions([]);
    }
  };

  const selectSuggestion = (s: any) => {
    setTicker(s.ticker);
    setAssetType(s.type);
    setAvgPrice(s.price.toString());
    setSuggestions([]);
  };

  const openChart = (s: string) => {
    setChartSymbol(s.includes(':') ? s : `BVC:${s}`);
    setChartModalVisible(true);
  };

  const handleDeletePosition = async (id: string) => {
      const updated = positions.filter(p => p.id !== id);
      setPositions(updated);
      await AsyncStorage.setItem(`@invest_${user?.id}`, JSON.stringify(updated));
      setDeletingId(null);
  };

  const handleAddDividends = async () => {
      const val = parseFloat(divAmount.replace(/\./g, '').replace(',', '.'));
      if (isNaN(val) || val <= 0) return;
      const newTotal = totalDividends + val;
      setTotalDividends(newTotal);
      await AsyncStorage.setItem(`@invest_divs_${user?.id}`, newTotal.toString());
      setDivAmount('');
      setDivModalVisible(false);
  };

  const getAssetColor = (type: AssetType) => {
      switch(type) {
          case 'crypto': return '#F7931A';
          case 'real_estate': return '#6366F1';
          case 'fixed': return '#10B981';
          default: return colors.accent;
      }
  };

  const getAssetIcon = (type: AssetType) => {
      switch(type) {
          case 'crypto': return <MaterialCommunityIcons name="bitcoin" size={20} color="#F7931A" />;
          case 'real_estate': return <MaterialIcons name="apartment" size={20} color="#6366F1" />;
          case 'fixed': return <MaterialIcons name="trending-up" size={20} color="#10B981" />;
          default: return <MaterialIcons name="show-chart" size={20} color={colors.accent} />;
      }
  };

  const totalInvested = positions.reduce((sum, p) => sum + (p.shares * p.avgPrice), 0);
  const totalCurrent = positions.reduce((sum, p) => sum + (p.shares * (livePrices[p.id] || p.avgPrice)), 0);

  // Dividend projections
  const getProjectedDividends = () => {
    const monthlyData = Array(12).fill(0);
    positions.forEach(pos => {
        const d = MOCK_DIVS[pos.ticker];
        if (d) {
            const payPerShare = d.yield / (d.months.length || 1);
            d.months.forEach(m => { monthlyData[m] += pos.shares * payPerShare; });
        }
    });
    return monthlyData;
  };

  const currentMonthIdx = new Date().getMonth();
  const projectedDivs = getProjectedDividends();
  const nextMonthDiv = projectedDivs[(currentMonthIdx + 1) % 12];

  // Rebalance logic
  const getRebalanceAdvice = () => {
    const advice = [];
    const totalAssets = totalCurrent || 1;
    for (const [type, target] of Object.entries(TARGET_ALLOC)) {
        const currentPct = allocation[type as AssetType] || 0;
        const targetPct = target * 100;
        if (targetPct - currentPct > 5) {
            const gapAmount = (totalAssets * (targetPct / 100)) - (totalAssets * (currentPct / 100));
            advice.push({ type, gapAmount, label: type === 'stock' ? 'Acciones' : type === 'crypto' ? 'Crypto' : type === 'fixed' ? 'Renta Fija' : 'Inmuebles' });
        }
    }
    return advice;
  };
  const rebalanceAdvice = getRebalanceAdvice();

  // Paquete Sugerido Basado en excedente
  const getSantyPack = (amount: number) => {
    if (amount <= 0) return [];
    const ecoP = SEARCH_SUGGESTIONS.find(s => s.ticker === 'ECOPETROL')?.price || 2400;
    const bcolP = SEARCH_SUGGESTIONS.find(s => s.ticker === 'BCOLOMBIA')?.price || 35200;
    
    return [
       { ticker: 'ECOPETROL', amount: amount * 0.45, shares: Math.floor((amount * 0.45) / ecoP) },
       { ticker: 'BCOLOMBIA', amount: amount * 0.35, shares: Math.floor((amount * 0.35) / bcolP) },
       { ticker: 'BTC-USD', amount: amount * 0.20 }
    ];
  };

  const projectedSurplus = healthInfo.available > 0 ? healthInfo.available : 0;
  const autoPack = getSantyPack(projectedSurplus);

  // Lógica del Simulador de Santy
  const handleSimulate = () => {
    const amount = parseFloat(simAmount.replace(/\D/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    setSimResult(getSantyPack(amount));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Inversiones</Text>
        <TouchableOpacity onPress={() => fetchLivePrices(positions)} style={styles.circleBtn}>
          {isFetchingPrices 
            ? <ActivityIndicator color={colors.accent} size="small" /> 
            : <Ionicons name="refresh" size={20} color={colors.sub} />}
        </TouchableOpacity>
      </View>

      {/* TABS */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={[styles.tab, activeTab === 'portfolio' && { backgroundColor: colors.accent }]} onPress={() => setActiveTab('portfolio')}>
          <MaterialIcons name="pie-chart" size={18} color={activeTab === 'portfolio' ? '#FFF' : colors.sub} />
          <Text style={[styles.tabText, { color: activeTab === 'portfolio' ? '#FFF' : colors.sub }]}>Portafolio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'ai' && { backgroundColor: '#8B5CF6' }]} onPress={() => setActiveTab('ai')}>
          <MaterialIcons name="auto-awesome" size={18} color={activeTab === 'ai' ? '#FFF' : colors.sub} />
          <Text style={[styles.tabText, { color: activeTab === 'ai' ? '#FFF' : colors.sub }]}>Asesor Santy</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* TRADINGVIEW TICKER TAPE */}
          <View style={{ marginHorizontal: -24, height: 48, marginBottom: 12 }}>
            <TradingViewWidget type="ticker-tape" height={48} />
          </View>

        {activeTab === 'portfolio' ? (
          <>
            {/* ── HEADER SALDO ────────────────────────── */}
            <View style={{ alignItems: 'center', marginVertical: 40 }}>
                <Text style={[styles.triiTotalLabel, { color: colors.sub }]}>Tu Patrimonio Total</Text>
                <Text style={[styles.triiTotalValue, { color: colors.text }]}>
                    {showBalances ? baseFmt(totalCurrent + totalDividends) : '• • • • • •'}
                </Text>
                <TouchableOpacity onPress={() => setShowBalances(!showBalances)} style={{ marginTop: 12 }}>
                    <Ionicons name={showBalances ? "eye-outline" : "eye-off-outline"} size={22} color={colors.sub} />
                </TouchableOpacity>
            </View>

            {/* ── SECCIÓN SIMULADOR SANTY ────────────── */}
            <View style={[styles.premiumCard, { backgroundColor: colors.accent, padding: 24, borderRadius: 28, marginBottom: 32 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <MaterialIcons name="auto-awesome" size={24} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900', marginLeft: 10 }}>¿Cuánto quieres invertir?</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput 
                        style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 16, color: '#FFF', fontWeight: '900', fontSize: 18 }}
                        placeholder="$ 500.000" 
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        keyboardType="decimal-pad"
                        value={simAmount}
                        onChangeText={t => setSimAmount(formatCurrency(parseFloat(t.replace(/\D/g, '') || '0'), 'COP', false).replace('$', ''))}
                    />
                    <TouchableOpacity onPress={handleSimulate} style={{ backgroundColor: '#FFF', width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="sparkles" size={24} color={colors.accent} />
                    </TouchableOpacity>
                </View>

                {simResult && (
                    <View style={{ marginTop: 20, backgroundColor: 'rgba(0,0,0,0.1)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800', marginBottom: 10 }}>PAQUETE RECOMENDADO POR SANTY:</Text>
                        {simResult.map((res, i) => (
                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>{res.ticker} {res.shares ? `(${res.shares} unid.)` : ''}</Text>
                                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900' }}>{baseFmt(res.amount)}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* ── RESUMEN EN TARJETAS LIMPIAS ────────── */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={[styles.compactCard, { backgroundColor: colors.card, flex: 1 }]}>
                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800' }}>PRÓXIMA RENTA</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 }}>{baseFmt(nextMonthDiv)}</Text>
                    <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{new Date().toLocaleString('es-ES', { month: 'long' }).toUpperCase()}</Text>
                </View>
                <TouchableOpacity onPress={() => setDivModalVisible(true)} style={[styles.compactCard, { backgroundColor: colors.card, flex: 1 }]}>
                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800' }}>GANANCIAS COBRADAS</Text>
                    <Text style={{ color: '#10B981', fontSize: 18, fontWeight: '900', marginTop: 4 }}>+ {baseFmt(totalDividends)}</Text>
                    <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700', marginTop: 2 }}>HISTORIAL RENTAS</Text>
                </TouchableOpacity>
            </View>

            {/* SECCIÓN PORTAFOLIO Y TUS ACTIVOS */}
            <View style={{ marginBottom: 32 }}>
                <View style={styles.triiPortfolioHeader}>
                    <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '700' }}>Distribución de Activos</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Valorizado: {baseFmt(totalCurrent)}</Text>
                </View>

                {/* ALLOCATION BAR */}
                <View style={[styles.triiBarContainer, { backgroundColor: colors.cardBg || 'rgba(0,0,0,0.05)', marginTop: 8 }]}>
                    <View style={styles.triiAllocationRow}>
                        {Object.entries(allocation).filter(([_, pct]) => pct > 0).map(([type, pct], idx) => (
                            <View key={type} style={{ flex: pct }}>
                               <View style={[styles.triiBarFill, { 
                                   backgroundColor: getAssetColor(type as AssetType),
                                   borderTopLeftRadius: idx === 0 ? 6 : 0,
                                   borderBottomLeftRadius: idx === 0 ? 6 : 0,
                                   borderTopRightRadius: idx === Object.keys(allocation).length - 1 ? 6 : 0,
                                   borderBottomRightRadius: idx === Object.keys(allocation).length - 1 ? 6 : 0,
                               }]} />
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* LISTA DE ACTIVOS (MODERNA) */}
            <View style={styles.sectionHeader}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Tus Posiciones</Text>
                <TouchableOpacity onPress={() => setModalVisible(true)} style={{ backgroundColor: colors.accent, width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="add" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            {positions.length === 0 ? (
                <View style={styles.emptyState}>
                    <MaterialIcons name="show-chart" size={48} color={colors.sub} />
                    <Text style={{ color: colors.sub, fontWeight: '700', marginTop: 12 }}>Sin activos aún.</Text>
                </View>
            ) : (
                <View style={{ marginTop: 8 }}>
                    {positions.map((pos) => {
                        const currentP = livePrices[pos.id] || pos.avgPrice;
                        const posProfitPct = ((currentP - pos.avgPrice) / pos.avgPrice) * 100;
                        return (
                            <TouchableOpacity 
                                key={pos.id} 
                                style={[styles.assetRow, { backgroundColor: colors.card, borderColor: colors.border }]} 
                                onPress={() => openChart(pos.ticker)}
                                onLongPress={() => setDeletingId(pos.id)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={[styles.assetIconBox, { backgroundColor: getAssetColor(pos.type) + '15' }]}>
                                        {getAssetIcon(pos.type)}
                                    </View>
                                    <View>
                                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{pos.ticker}</Text>
                                        <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '700' }}>{pos.shares} Unid.</Text>
                                    </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{baseFmt(currentP * pos.shares)}</Text>
                                    <Text style={{ color: posProfitPct >= 0 ? '#10B981' : '#EF4444', fontSize: 12, fontWeight: '900' }}>
                                        {posProfitPct >= 0 ? '▲' : '▼'} {Math.abs(posProfitPct).toFixed(1)}%
                                    </Text>
                                    {deletingId === pos.id && (
                                        <TouchableOpacity onPress={() => handleDeletePosition(pos.id)} style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 }}>
                                            <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>ELIMINAR</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
          </>
        ) : (
            <View style={{ paddingVertical: 20 }}>
                <View style={{ alignItems: 'center', marginBottom: 40 }}>
                    <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#8B5CF620', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                        <MaterialIcons name="auto-awesome" size={50} color="#8B5CF6" />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900' }}>Analítica Santy</Text>
                    <Text style={{ color: colors.sub, fontSize: 14, textAlign: 'center', paddingHorizontal: 20, marginTop: 8 }}>
                        Santy analiza tus ingresos y gastos para decirte cuánto puedes invertir.
                    </Text>
                </View>

                {/* PROACTIVE SAVINGS INSIGHT */}
                <View style={[styles.premiumCard, { backgroundColor: '#8B5CF6', marginBottom: 24, padding: 24, borderRadius: 32 }]}>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '800' }}>POTENCIAL DE INVERSIÓN FINAL DE MES</Text>
                    <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '900', marginVertical: 8 }}>{baseFmt(projectedSurplus)}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18 }}>
                        {projectedSurplus > 0 
                          ? `Si mantienes tu nivel de gasto actual, podrías terminar el mes con este excedente para invertir.`
                          : `Aún no detecto excedentes. ¡Intenta reducir tus gastos este mes para empezar a invertir!`}
                    </Text>
                    
                    {autoPack.length > 0 && projectedSurplus > 0 && (
                        <View style={{ marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' }}>
                            <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '900', marginBottom: 12 }}>PAQUETE SUGERIDO POR SANTY:</Text>
                            {autoPack.map((p, i) => (
                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '700' }}>{p.ticker}</Text>
                                    <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900' }}>~ {baseFmt(p.amount)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* MANUAL SIMULATOR */}
                <View style={[styles.insightCard, { backgroundColor: colors.card, marginBottom: 24 }]}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 16 }}>Simulador de Capital Extra</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TextInput 
                            style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 16, color: colors.text, fontWeight: '800' }}
                            placeholder="Monto a invertir..." 
                            placeholderTextColor={colors.sub}
                            keyboardType="decimal-pad"
                            value={simAmount}
                            onChangeText={t => setSimAmount(formatCurrency(parseFloat(t.replace(/\D/g, '') || '0'), 'COP', false).replace('$', ''))}
                        />
                        <TouchableOpacity onPress={handleSimulate} style={{ backgroundColor: colors.accent, width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="sparkles" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    {simResult && (
                        <View style={{ marginTop: 16 }}>
                            {simResult.map((res, i) => (
                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{res.ticker}</Text>
                                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800' }}>{baseFmt(res.amount)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* REBALANCE INSIGHT */}

                <View style={[styles.insightCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                        <MaterialCommunityIcons name="scale-balance" size={24} color={colors.accent} />
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>Estado del Rebalanceo</Text>
                    </View>
                    {rebalanceAdvice.length > 0 ? (
                        <>
                            <Text style={{ color: colors.sub, fontSize: 13, lineHeight: 20, marginBottom: 20 }}>
                                Tu portafolio actual está un poco desviado de tu meta ideal. Santy te recomienda estas acciones:
                            </Text>
                            {rebalanceAdvice.map((adv, idx) => (
                                <View key={idx} style={{ backgroundColor: colors.bg, padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Añadir en {adv.label}</Text>
                                    <Text style={{ color: colors.accent, fontWeight: '900' }}>+ {baseFmt(adv.gapAmount)}</Text>
                                </View>
                            ))}
                        </>
                    ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
                            <Text style={{ color: colors.text, fontWeight: '800', marginTop: 16 }}>¡Tu portafolio está perfecto!</Text>
                        </View>
                    )}
                </View>

                {/* DIVIDEND CALENDAR SECTION */}
                <View style={[styles.insightCard, { backgroundColor: colors.card, marginTop: 20 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                        <MaterialCommunityIcons name="calendar-month" size={24} color="#3B82F6" />
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>Tus Rentas Futuras</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {projectedDivs.map((amount, idx) => {
                            if (amount === 0) return null;
                            const month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][idx];
                            const isCurrent = idx === currentMonthIdx;
                            return (
                                <View key={idx} style={{ width: 120, height: 100, backgroundColor: isCurrent ? colors.accent + '20' : colors.bg, borderRadius: 20, padding: 16, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
                                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '900', marginBottom: 4 }}>{month.toUpperCase()}</Text>
                                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900' }}>{baseFmt(amount)}</Text>
                                    {isCurrent && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 8 }} />}
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        )}
      </ScrollView>

      {/* Modals... */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Añadir Activo</Text>
            <View style={styles.typeSelectorRow}>
               {['stock', 'crypto', 'fixed', 'real_estate'].map(t => (
                  <TouchableOpacity key={t} style={[styles.typeBtn, assetType === t ? { backgroundColor: colors.accent } : { borderColor: colors.border }]} onPress={() => setAssetType(t as AssetType)}>
                    <Text style={{ fontSize: 10, color: assetType === t ? '#FFF' : colors.sub }}>{t.toUpperCase()}</Text>
                  </TouchableOpacity>
               ))}
            </View>
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Símbolo" value={ticker} onChangeText={handleTickerSearch} />
            {suggestions.length > 0 && (
                <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    {suggestions.map(s => <TouchableOpacity key={s.ticker} onPress={() => selectSuggestion(s)}><Text style={{color:colors.text, padding:8}}>{s.ticker} - {s.name}</Text></TouchableOpacity>)}
                </View>
            )}
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Cantidad" keyboardType="decimal-pad" value={shares} onChangeText={setShares} />
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Precio Promedio" keyboardType="decimal-pad" value={avgPrice} onChangeText={setAvgPrice} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setModalVisible(false)}><Text style={{color:colors.text}}>Cerrar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.accent }]} onPress={handleSavePosition}><Text style={{color:'#FFF'}}>Añadir</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={divModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={[styles.modalBox, {backgroundColor:colors.card}]}>
            <Text style={[styles.modalTitle, {color:colors.text}]}>Registrar Renta</Text>
            <TextInput style={[styles.input, {backgroundColor:colors.bg, color:colors.text}]} placeholder="Monto" keyboardType="decimal-pad" value={divAmount} onChangeText={setDivAmount} />
            <View style={styles.modalBtns}>
                <TouchableOpacity style={[styles.mBtn, {backgroundColor:colors.bg}]} onPress={() => setDivModalVisible(false)}><Text style={{color:colors.text}}>Cerrar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.mBtn, {backgroundColor:'#10B981'}]} onPress={handleAddDividends}><Text style={{color:'#FFF'}}>Guardar</Text></TouchableOpacity>
            </View>
        </View></View>
      </Modal>

      <Modal visible={chartModalVisible} transparent={false} animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#131722' }}>
              <TouchableOpacity style={{ padding: 16 }} onPress={() => setChartModalVisible(false)}><Ionicons name="close" size={32} color="#FFF" /></TouchableOpacity>
              {chartSymbol && <TradingViewWidget symbol={chartSymbol} type="chart" height={600} />}
          </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  tabContainer: { flexDirection: 'row', marginHorizontal: 24, padding: 6, borderRadius: 16, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 13, fontWeight: '800' },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingBottom: 50 },
  modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 24 },
  typeSelectorRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  typeBtn: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 18, padding: 18, fontSize: 16, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
  mBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
  triiTotalLabel: { fontSize: 16, fontWeight: '700' },
  triiTotalValue: { fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  triiPortfolioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingHorizontal: 4 },
  triiBarContainer: { height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 24 },
  triiAllocationRow: { flexDirection: 'row', height: '100%', gap: 2 },
  triiBarFill: { height: '100%' },
  compactCard: { padding: 16, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  assetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 24, marginBottom: 8, borderWidth: 1 },
  assetIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  insightCard: { padding: 24, borderRadius: 28 },
  premiumCard: { padding: 24, borderRadius: 28 },
  divCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 24 },
  triiTicker: { fontSize: 15, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
});
