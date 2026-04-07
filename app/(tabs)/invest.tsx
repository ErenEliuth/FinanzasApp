import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';
import {
  Alert, Modal, Platform, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator, Animated,
  Dimensions, KeyboardAvoidingView, TouchableWithoutFeedback
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { formatCurrency, convertCurrency } from '@/utils/currency';
import { searchAssets, fetchCryptoPrice, POPULAR_ASSETS, SearchResult } from '@/utils/stockPrices';
import TradingViewWidget from '@/components/TradingViewWidget';

export type AssetType = 'stock' | 'crypto' | 'fixed' | 'real_estate' | 'fund' | 'etf';

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
  const [activeTab, setActiveTab] = useState<'hub' | 'portfolio' | 'goals' | 'calendar' | 'ai'>('hub');
  const [modalVisible, setModalVisible] = useState(false);

  const [goals, setGoals] = useState<InvestGoal[]>([]);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target: '', icon: 'home' });
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
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

  // Simulator
  const [simAmount, setSimAmount] = useState('');
  const [simResult, setSimResult] = useState<{ticker: string, amount: number, shares?: number}[] | null>(null);
  const [simRationale, setSimRationale] = useState('');

  const baseFmt = (n: number) => formatCurrency(n, 'COP', isHidden);
  const usdToCop = rates?.USD || 3950;

  useEffect(() => { if (isFocused) { loadData(); calculateHealth(); } }, [isFocused]);

  const loadData = async () => {
    try {
      if (!user) return;
      
      // Cargar Metas desde Supabase
      const { data: gData, error: gError } = await supabase
        .from('investment_goals')
        .select('*')
        .eq('user_id', user.id);
      
      if (!gError && gData && gData.length > 0) {
        setGoals(gData);
      } else {
        const defGoal = { 
          user_id: user.id, 
          name: 'Libertad Financiera', 
          target: 50000000, 
          icon: 'shield', 
          color: '#8B5CF6' 
        };
        const { data: inserted } = await supabase.from('investment_goals').insert([defGoal]).select();
        if (inserted) setGoals(inserted);
      }

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
      }

      const storedDivs = await AsyncStorage.getItem(`@invest_divs_${user?.id}`);
      if (storedDivs) setTotalDividends(Number(storedDivs));
    } catch (e) { console.error(e); }
  };

  const refreshPrices = async (pos: Position[]) => {
    const prices: Record<string, number> = {};
    const { fetchLivePrice } = require('@/utils/stockPrices');
    
    for (const p of pos) {
      try {
        const livePrice = await fetchLivePrice(p.ticker, p.type);
        if (livePrice !== null) {
          // Convertimos a COP si es USD (stocks/crypto suelen venir en USD)
          const isUsd = p.currency === 'USD' || (p.type === 'crypto') || (p.type === 'etf' && p.ticker !== 'ICOLEAP');
          prices[p.id] = isUsd ? livePrice * usdToCop : livePrice;
        } else {
          prices[p.id] = p.avgPrice;
        }
      } catch (e) {
        prices[p.id] = p.avgPrice;
      }
    }
    setLivePrices(prices);
  };

  const calculateHealth = async () => {
    if (!user) return;
    try {
      const { data: allTx } = await supabase.from('transactions').select('amount, type, category').eq('user_id', user.id);
      let totalActive = 0;
      allTx?.forEach(t => { totalActive += t.type === 'income' ? t.amount : -t.amount; });
      setHealthInfo({ available: totalActive, status: 'Analizado' });
    } catch (e) { }
  };

  // Search handler with debounce
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 1) { 
        if (selectedAssetType) setSearchResults(POPULAR_ASSETS.filter(a => a.type === selectedAssetType).slice(0, 6));
        else setSearchResults(POPULAR_ASSETS.slice(0, 6)); 
        return; 
    }
    setIsSearching(true);
    const results = await searchAssets(q);
    if (selectedAssetType) {
        setSearchResults(results.filter(r => r.type === selectedAssetType));
    } else {
        setSearchResults(results);
    }
    setIsSearching(false);
  }, [selectedAssetType]);

  const handleSelectAsset = (asset: SearchResult) => {
    setSelectedAsset(asset);
    setSearchQuery('');
    setSearchResults([]);
    setAddFlowStep('amount');
  };

  const handleSavePosition = async () => {
    if (!selectedAsset || !addShares || !user) return;
    let priceCOP = selectedAsset.currency === 'USD' ? selectedAsset.price * usdToCop : selectedAsset.price;
    
    // Si es un fondo, calculamos el precio simulado actual para guardarlo como precio promedio
    if (selectedAsset.type === 'fund') {
      const { simulateFundGrowth } = require('@/utils/stockPrices');
      priceCOP = simulateFundGrowth(selectedAsset.price, selectedAsset.changePercent);
    }
    
    const sharesNum = parseFloat(addShares.replace(',', '.'));
    
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

  const handleAddGoal = async () => {
    if (!newGoal.name || !newGoal.target || !user) return;
    const targetNum = parseFloat(newGoal.target.replace(/\D/g, ''));
    const color = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EF4444'][goals.length % 5];
    
    const dbGoal = {
      user_id: user.id,
      name: newGoal.name,
      target: targetNum,
      icon: newGoal.icon,
      color: color
    };

    const { data: inserted, error } = await supabase.from('investment_goals').insert([dbGoal]).select();
    
    if (!error && inserted) {
      setGoals([...goals, inserted[0]]);
      setGoalModalVisible(false); setNewGoal({ name: '', target: '', icon: 'home' });
    } else {
      Alert.alert("Error", "No se pudo crear la meta en la nube.");
    }
  };

  const handleDeleteGoal = async (id: string) => {
    const { error } = await supabase.from('investment_goals').delete().eq('id', id);
    if (!error) {
      const updated = goals.filter(g => g.id !== id);
      setGoals(updated);
      setDeletingGoalId(null);
    } else {
      Alert.alert("Error", "No se pudo eliminar la meta.");
    }
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
    return { items, rationale: `Comisión Trii: ${baseFmt(TRII_FEE)}. Capital neto: ${baseFmt(net)}` };
  };

  const handleSimulate = () => {
    const amount = parseFloat(simAmount.replace(/\D/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    const res = getSantyPack(amount);
    setSimResult(res.items); setSimRationale(res.rationale);
  };

  const allocColors: Record<string, string> = { stock: colors.accent, crypto: '#F7931A', fixed: '#10B981', real_estate: '#6366F1', fund: '#3B82F6', etf: '#8B5CF6' };
  const allocLabels: Record<string, string> = { stock: 'Acciones', crypto: 'Crypto', fixed: 'Renta Fija', real_estate: 'Inmuebles', fund: 'Fondos', etf: 'ETFs' };

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => activeTab === 'hub' ? router.back() : setActiveTab('hub')} style={[s.backBtn, { backgroundColor: colors.card }]}>
          <Ionicons name={activeTab === 'hub' ? "close" : "arrow-back"} size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>
          {activeTab === 'hub' ? 'Inversiones' : activeTab === 'portfolio' ? 'Portafolio' :
           activeTab === 'goals' ? 'Metas' : activeTab === 'calendar' ? 'Dividendos' : 'Asesor Santy'}
        </Text>
        {activeTab === 'portfolio' ? (
          <TouchableOpacity onPress={() => { setModalVisible(true); setAddFlowStep('category'); }} style={[s.addBtn, { backgroundColor: colors.accent }]}>
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
              <View style={[s.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.summaryLabel, { color: colors.sub }]}>PATRIMONIO TOTAL</Text>
                <Text style={[s.summaryAmount, { color: colors.text }]}>{baseFmt(totalCurrent + totalDividends)}</Text>
                <View style={s.summaryRow}>
                  <View style={[s.chip, { backgroundColor: profitAbs >= 0 ? '#10B98115' : '#EF444415' }]}>
                    <Text style={{ color: profitAbs >= 0 ? '#10B981' : '#EF4444', fontSize: 13, fontWeight: '800' }}>
                      {profitAbs >= 0 ? '▲' : '▼'} {profitPct.toFixed(1)}%
                    </Text>
                  </View>
                  <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>{baseFmt(Math.abs(profitAbs))} {profitAbs >= 0 ? 'ganancia' : 'pérdida'}</Text>
                </View>

                {/* Mini allocation bar */}
                {totalCurrent > 0 && (
                  <View style={s.miniAllocBar}>
                    {Object.entries(allocation).map(([type, pct]) => pct > 0 && (
                      <View key={type} style={{ flex: pct, height: 6, backgroundColor: allocColors[type], borderRadius: 3 }} />
                    ))}
                  </View>
                )}
              </View>

              {/* Quick Stats Row */}
              <View style={s.quickRow}>
                <View style={[s.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialIcons name="pie-chart" size={18} color={colors.accent} />
                  <Text style={[s.quickNum, { color: colors.text }]}>{positions.length}</Text>
                  <Text style={[s.quickLabel, { color: colors.sub }]}>Activos</Text>
                </View>
                <View style={[s.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialIcons name="flag" size={18} color="#10B981" />
                  <Text style={[s.quickNum, { color: colors.text }]}>{goals.length}</Text>
                  <Text style={[s.quickLabel, { color: colors.sub }]}>Metas</Text>
                </View>
                <View style={[s.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MaterialIcons name="payments" size={18} color="#3B82F6" />
                  <Text style={[s.quickNum, { color: colors.text }]}>{baseFmt(nextMonthDiv)}</Text>
                  <Text style={[s.quickLabel, { color: colors.sub }]}>Próx. Div</Text>
                </View>
              </View>

              {/* Navigation Cards */}
              <View style={{ gap: 12, marginTop: 8 }}>
                {[
                  { id: 'portfolio', label: 'Mi Portafolio', sub: `${positions.length} activos · ${baseFmt(totalCurrent)}`, icon: 'pie-chart', color: colors.accent, iconSet: 'MI' },
                  { id: 'goals', label: 'Metas de Inversión', sub: `${goals.length} proyectos activos`, icon: 'flag', color: '#10B981', iconSet: 'MI' },
                  { id: 'calendar', label: 'Dividendos & Rentas', sub: `Anual est: ${baseFmt(projectedDivs.reduce((a,b)=>a+b, 0))}`, icon: 'calendar-month', color: '#3B82F6', iconSet: 'MI' },
                  { id: 'ai', label: 'Asesor Santy', sub: `Excedente: ${baseFmt(projectedSurplus)}`, icon: 'auto-awesome', color: '#8B5CF6', iconSet: 'MI' },
                ].map(item => (
                  <TouchableOpacity key={item.id} style={[s.navCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setActiveTab(item.id as any)}>
                    <View style={[s.navIcon, { backgroundColor: item.color + '12' }]}>
                      {item.iconSet === 'MCI'
                        ? <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                        : <MaterialIcons name={item.icon as any} size={24} color={item.color} />}
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
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{baseFmt(totalInvested)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '800' }}>ACTUAL</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{baseFmt(totalCurrent)}</Text>
                  </View>
                </View>
                <View style={[s.profitBadge, { backgroundColor: profitAbs >= 0 ? '#10B98112' : '#EF444412' }]}>
                  <Text style={{ color: profitAbs >= 0 ? '#10B981' : '#EF4444', fontWeight: '900', fontSize: 13 }}>
                    {profitAbs >= 0 ? '+' : ''}{baseFmt(profitAbs)} ({profitPct.toFixed(1)}%)
                  </Text>
                </View>
              </View>

              {/* Allocation Breakdown */}
              {totalCurrent > 0 && (
                <View style={[s.allocSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={s.allocBar}>
                    {Object.entries(allocation).map(([type, pct]) => pct > 0 && (
                      <View key={type} style={{ flex: pct, height: 8, backgroundColor: allocColors[type], borderRadius: 4 }} />
                    ))}
                  </View>
                  <View style={s.allocLegend}>
                    {Object.entries(allocation).map(([type, pct]) => pct > 0 && (
                      <View key={type} style={s.allocItem}>
                        <View style={[s.allocDot, { backgroundColor: allocColors[type] }]} />
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
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.assetValue, { color: colors.text }]}>{baseFmt(value)}</Text>
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

          {/* ═══ GOALS ═══ */}
          {activeTab === 'goals' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>Mis Metas</Text>
                <TouchableOpacity onPress={() => setGoalModalVisible(true)}><Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>+ NUEVA</Text></TouchableOpacity>
              </View>
              {goals.map(g => {
                const prog = Math.min((totalCurrent / (g.target || 1)) * 100, 100);
                const remaining = Math.max(g.target - totalCurrent, 0);
                const months = projectedSurplus > 0 ? Math.ceil(remaining / projectedSurplus) : null;
                return (
                  <TouchableOpacity key={g.id} onLongPress={() => setDeletingGoalId(g.id)} style={[s.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <View style={[s.goalIcon, { backgroundColor: g.color + '12' }]}><MaterialCommunityIcons name={g.icon as any} size={24} color={g.color} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{g.name}</Text>
                        <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '600' }}>Objetivo: {baseFmt(g.target)}</Text>
                      </View>
                      {deletingGoalId === g.id ? (
                        <TouchableOpacity onPress={() => handleDeleteGoal(g.id)} style={{ backgroundColor: '#EF4444', width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="trash" size={18} color="#FFF" />
                        </TouchableOpacity>
                      ) : <Text style={{ color: g.color, fontSize: 20, fontWeight: '900' }}>{prog.toFixed(0)}%</Text>}
                    </View>
                    <View style={{ height: 8, backgroundColor: colors.bg, borderRadius: 4, marginBottom: 12 }}>
                      <View style={{ width: `${prog}%`, height: '100%', backgroundColor: g.color, borderRadius: 4 }} />
                    </View>
                    <View style={{ backgroundColor: g.color + '08', padding: 12, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: g.color }}>
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>💡 SANTY:</Text>
                      <Text style={{ color: colors.sub, fontSize: 11, lineHeight: 16, marginTop: 2 }}>
                        {months && months > 0 ? `A tu ritmo actual, alcanzarás esta meta en ~${months} meses.` : `¡Vas por buen camino! Mantén el ritmo.`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ═══ CALENDAR ═══ */}
          {activeTab === 'calendar' && (
            <View>
              <View style={[s.divSummary, { backgroundColor: colors.accent }]}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' }}>DIVIDENDOS ANUALES ESTIMADOS</Text>
                <Text style={{ color: '#FFF', fontSize: 30, fontWeight: '900', marginTop: 4 }}>{baseFmt(projectedDivs.reduce((a,b)=>a+b, 0))}</Text>
              </View>
              {projectedDivs.map((amount, idx) => amount > 0 && (
                <View key={idx} style={[s.divRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[s.monthBadge, { backgroundColor: colors.accent + '12' }]}>
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '900' }}>{['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][idx]}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 }}>{baseFmt(amount)}</Text>
                  <Ionicons name="calendar-outline" size={16} color={colors.sub} />
                </View>
              ))}
            </View>
          )}

          {/* ═══ AI ADVISOR ═══ */}
          {activeTab === 'ai' && (
            <View>
              <View style={[s.santyCard, { backgroundColor: '#8B5CF6' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MaterialIcons name="auto-awesome" size={20} color="rgba(255,255,255,0.8)" />
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '800' }}>SANTY INSIGHT</Text>
                </View>
                <Text style={{ color: '#FFF', fontSize: 28, fontWeight: '900' }}>{baseFmt(projectedSurplus)}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 18, marginTop: 8 }}>Tu excedente mensual disponible para invertir.</Text>
              </View>

              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 24, marginBottom: 12 }}>Top Activos del Momento</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24, marginBottom: 24 }}>
                {POPULAR_ASSETS.filter(a => a.type !== 'crypto').slice(0, 6).map((s2, i) => (
                  <View key={i} style={[s.tickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '900' }}>{s2.ticker}</Text>
                    <Text style={{ color: s2.changePercent >= 0 ? '#10B981' : '#EF4444', fontSize: 12, fontWeight: '800', marginTop: 4 }}>
                      {s2.changePercent >= 0 ? '+' : ''}{s2.changePercent.toFixed(2)}%
                    </Text>
                    <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700', marginTop: 6 }}>{s2.exchange}</Text>
                  </View>
                ))}
              </ScrollView>

              <View style={[s.simCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 4 }}>Simulador de Capital</Text>
                <Text style={{ color: colors.sub, fontSize: 11, marginBottom: 16 }}>Ingresa un monto y Santy te arma un portafolio.</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput style={[s.simInput, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Monto a invertir" placeholderTextColor={colors.sub} keyboardType="decimal-pad" value={simAmount}
                    onChangeText={t => setSimAmount(formatCurrency(parseFloat(t.replace(/\D/g, '') || '0'), 'COP', false).replace('$', ''))} autoCorrect={false} />
                  <TouchableOpacity onPress={handleSimulate} style={[s.simBtn, { backgroundColor: '#8B5CF6' }]}>
                    <Ionicons name="sparkles" size={22} color="#FFF" />
                  </TouchableOpacity>
                </View>
                {simResult && (
                  <View style={{ marginTop: 20, backgroundColor: colors.bg, padding: 16, borderRadius: 16 }}>
                    <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '900', marginBottom: 8 }}>ESTRATEGIA SANTY</Text>
                    <Text style={{ color: colors.sub, fontSize: 11, marginBottom: 12 }}>{simRationale}</Text>
                    {simResult.map((r, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{r.ticker} {r.shares ? `(${r.shares} unid.)` : ''}</Text>
                        <Text style={{ color: '#8B5CF6', fontSize: 13, fontWeight: '900' }}>{baseFmt(r.amount)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ═══ ADD ASSET MODAL ═══ */}
      <Modal visible={modalVisible} transparent animationType="slide" statusBarTranslucent>
        <View style={s.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => { setModalVisible(false); setSelectedAsset(null); setSearchQuery(''); }}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
            <View style={[s.modalBox, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                {addFlowStep !== 'category' ? (
                  <TouchableOpacity onPress={() => {
                     if (addFlowStep === 'amount') setAddFlowStep('search');
                     else setAddFlowStep('category');
                  }} style={{ marginRight: 10 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                  </TouchableOpacity>
                ) : <View style={{ width: 34 }} />}
                
                <Text style={[s.modalTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>
                  {addFlowStep === 'category' ? '¿Qué quieres agregar?' : addFlowStep === 'search' ? 'Buscar Activo' : 'Detalles'}
                </Text>
                
                <TouchableOpacity onPress={() => { setModalVisible(false); setSelectedAsset(null); setSearchQuery(''); }}>
                  <Ionicons name="close" size={24} color={colors.sub} />
                </TouchableOpacity>
              </View>

              {addFlowStep === 'category' && (
                <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                  {[
                    { id: 'stock', title: 'Acciones locales y ext.', icon: 'show-chart', color: colors.accent },
                    { id: 'fund', title: 'Fondos de Inversión', icon: 'pie-chart', color: '#3B82F6' },
                    { id: 'etf', title: 'ETFs y Canastas', icon: 'layers', color: '#8B5CF6' },
                    { id: 'crypto', title: 'Crypto y NFT', icon: 'currency-exchange', color: '#F7931A' },
                    { id: 'fixed', title: 'CDTs y Renta Fija', icon: 'trending-up', color: '#10B981' },
                    { id: 'real_estate', title: 'Inmuebles', icon: 'apartment', color: '#6366F1' }
                  ].map(cat => (
                    <TouchableOpacity key={cat.id} style={[s.navCard, { backgroundColor: colors.bg, borderWidth: 0, paddingVertical: 18 }]} onPress={() => {
                      setSelectedAssetType(cat.id as AssetType);
                      setSearchResults(POPULAR_ASSETS.filter(a => a.type === cat.id).slice(0, 8));
                      setAddFlowStep('search');
                      setSearchQuery('');
                    }}>
                      <View style={[s.navIcon, { backgroundColor: cat.color + '12' }]}>
                        {cat.id === 'crypto' ? <MaterialIcons name="currency-exchange" size={20} color={cat.color} /> : <MaterialIcons name={cat.icon as any} size={24} color={cat.color} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>{cat.title}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.sub} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

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
                            {asset.currency === 'USD' ? `$${asset.price.toLocaleString()} USD` : baseFmt(asset.price)}
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
                  <View style={[s.selectedAssetBox, { backgroundColor: colors.bg }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[s.searchIcon, { backgroundColor: getAssetColor(selectedAsset.type as AssetType) + '12' }]}>
                        {selectedAsset.type === 'crypto' ? <MaterialCommunityIcons name="bitcoin" size={22} color="#F7931A" /> : <MaterialIcons name="show-chart" size={22} color={colors.accent} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{selectedAsset.ticker}</Text>
                        <Text style={{ color: colors.sub, fontSize: 12 }}>{selectedAsset.name}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Precio actual</Text>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>
                        {selectedAsset.currency === 'USD' ? `$${selectedAsset.price.toLocaleString()} USD` : baseFmt(selectedAsset.price)}
                      </Text>
                    </View>
                    {selectedAsset.currency === 'USD' && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={{ color: colors.sub, fontSize: 11 }}>≈ en COP</Text>
                        <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>{baseFmt(selectedAsset.price * usdToCop)}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 8 }}>
                    {selectedAsset.type === 'fund' ? 'Monto a invertir (COP)' : 'Cantidad de unidades'}
                  </Text>
                  <TextInput style={[s.input, { backgroundColor: colors.bg, color: colors.text }]}
                    placeholder={selectedAsset.type === 'fund' ? "Ej: 100000" : "Ej: 10"} 
                    placeholderTextColor={colors.sub} keyboardType="decimal-pad"
                    value={addShares} onChangeText={setAddShares} autoCorrect={false} />

                  {addShares && parseFloat(addShares) > 0 && selectedAsset.type !== 'fund' && (
                    <View style={[s.totalPreview, { backgroundColor: colors.bg }]}>
                      <Text style={{ color: colors.sub, fontSize: 12 }}>Total inversión</Text>
                      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>
                        {baseFmt((selectedAsset.currency === 'USD' ? selectedAsset.price * usdToCop : selectedAsset.price) * parseFloat(addShares || '0'))}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity onPress={handleSavePosition} style={[s.confirmBtn, { backgroundColor: colors.accent }]}>
                    <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '800' }}>Agregar al Portafolio</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Goal Modal */}
      <Modal visible={goalModalVisible} transparent animationType="slide" statusBarTranslucent>
        <View style={s.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setGoalModalVisible(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
            <View style={[s.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Nueva Meta</Text>
            <TextInput style={[s.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Nombre" placeholderTextColor={colors.sub} value={newGoal.name} onChangeText={t => setNewGoal({...newGoal, name: t})} autoCorrect={false} />
            <TextInput style={[s.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Objetivo (COP)" placeholderTextColor={colors.sub} keyboardType="decimal-pad" value={newGoal.target} onChangeText={t => setNewGoal({...newGoal, target: t})} autoCorrect={false} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: colors.bg }]} onPress={() => setGoalModalVisible(false)}><Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: colors.accent }]} onPress={handleAddGoal}><Text style={{ color: '#FFF', fontWeight: '900' }}>Crear</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
        </View>
      </Modal>


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
});
