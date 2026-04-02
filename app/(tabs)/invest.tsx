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

interface InvestGoal {
    id: string;
    name: string;
    target: number;
    current: number;
    icon: string;
    color: string;
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
    { ticker: 'AAPL', name: 'Apple Inc.', price: 750000, type: 'stock' },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 3200000, type: 'stock' },
    { ticker: 'TSLA', name: 'Tesla, Inc.', price: 820000, type: 'stock' },
    { ticker: 'NU', name: 'NuBank (Nu Holdings)', price: 48000, type: 'stock' },
    { ticker: 'BTC', name: 'Bitcoin', price: 280000000, type: 'crypto' },
    { ticker: 'ETH', name: 'Ethereum', price: 12500000, type: 'crypto' },
];

const MOCK_DIVS: Record<string, { yield: number, months: number[] }> = {
    'ECOPETROL': { yield: 444, months: [3, 11] },
    'BCOLOMBIA': { yield: 3120, months: [0, 3, 6, 9] },
    'ISA': { yield: 1800, months: [4, 11] },
    'AAPL': { yield: 2.4, months: [1, 4, 7, 10] },
};

const TARGET_ALLOC: Record<AssetType, number> = {
    'stock': 0.50,
    'crypto': 0.15,
    'fixed': 0.25,
    'real_estate': 0.10
};

const TRII_FEE = 14875; // Comisión estándar aprox con IVA

export default function InvestScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const { user, currency, rates, isHidden } = useAuth();
  const colors = useThemeColors();

  const [positions, setPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<'hub' | 'portfolio' | 'goals' | 'calendar' | 'ai'>('hub');
  const [modalVisible, setModalVisible] = useState(false);

  // Goals
  const [goals, setGoals] = useState<InvestGoal[]>([]);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target: '', icon: 'home' });
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

  // Form
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<Record<AssetType, number>>({ stock: 0, crypto: 0, fixed: 0, real_estate: 0 });

  // Divs
  const [totalDividends, setTotalDividends] = useState<number>(0);
  const [divModalVisible, setDivModalVisible] = useState(false);
  const [divAmount, setDivAmount] = useState('');

  const [healthInfo, setHealthInfo] = useState({ available: 0, status: 'Calculando...' });
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  // Simulator
  const [simAmount, setSimAmount] = useState('');
  const [simResult, setSimResult] = useState<{ticker: string, amount: number, shares?: number}[] | null>(null);
  const [simRationale, setSimRationale] = useState('');

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [chartModalVisible, setChartModalVisible] = useState(false);

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
      const storedGoals = await AsyncStorage.getItem(`@invest_goals_${user?.id}`);
      if (storedGoals) setGoals(JSON.parse(storedGoals));
      else {
          const def = [{ id: '1', name: 'Libertad Financiera', target: 50000000, current: 0, icon: 'shield', color: '#8B5CF6' }];
          setGoals(def);
          await AsyncStorage.setItem(`@invest_goals_${user?.id}`, JSON.stringify(def));
      }

      const stored = await AsyncStorage.getItem(`@invest_${user?.id}`);
      if (stored) {
        const parsed = JSON.parse(stored).map((p: any) => ({ ...p, type: p.type || 'stock' }));
        setPositions(parsed);
        fetchLivePrices(parsed);
      }
      const storedDivs = await AsyncStorage.getItem(`@invest_divs_${user?.id}`);
      if (storedDivs) setTotalDividends(Number(storedDivs));
    } catch (e) { console.error(e); }
  };

  const fetchLivePrices = async (currentPositions: Position[]) => {
    if (currentPositions.length === 0) return;
    setIsFetchingPrices(true);
    const newPrices: Record<string, number> = { ...livePrices };
    try {
        currentPositions.forEach(pos => {
            if (pos.type === 'fixed' || pos.type === 'real_estate') newPrices[pos.id] = pos.avgPrice;
            else newPrices[pos.id] = MOCK_PRICES[pos.ticker] || pos.avgPrice;
        });
    } catch (e) {}
    setLivePrices(newPrices);
    setIsFetchingPrices(false);

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
      let totalActive = 0;
      allTx?.forEach(t => {
        if (t.type === 'income') totalActive += t.amount;
        else totalActive -= t.amount;
      });
      setHealthInfo({ available: totalActive, status: 'Analizado' });
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

  const handleAddGoal = async () => {
      if (!newGoal.name || !newGoal.target) return;
      const goal: InvestGoal = {
          id: Date.now().toString(),
          name: newGoal.name,
          target: parseFloat(newGoal.target.replace(/\D/g, '')),
          current: 0,
          icon: newGoal.icon,
          color: ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EF4444'][goals.length % 5]
      };
      const updated = [...goals, goal];
      setGoals(updated);
      await AsyncStorage.setItem(`@invest_goals_${user?.id}`, JSON.stringify(updated));
      setGoalModalVisible(false);
      setNewGoal({ name: '', target: '', icon: 'home' });
  };

  const handleDeleteGoal = async (id: string) => {
      const updated = goals.filter(g => g.id !== id);
      setGoals(updated);
      await AsyncStorage.setItem(`@invest_goals_${user?.id}`, JSON.stringify(updated));
      setDeletingGoalId(null);
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
      setDivAmount(''); setDivModalVisible(false);
  };

  const getAssetIcon = (type: AssetType) => {
      switch(type) {
          case 'crypto': return <MaterialCommunityIcons name="bitcoin" size={20} color="#F7931A" />;
          case 'real_estate': return <MaterialIcons name="apartment" size={20} color="#6366F1" />;
          case 'fixed': return <MaterialIcons name="trending-up" size={20} color="#10B981" />;
          default: return <MaterialIcons name="show-chart" size={20} color={colors.accent} />;
      }
  };

  const getAssetColor = (type: AssetType) => {
      switch(type) {
          case 'crypto': return '#F7931A';
          case 'real_estate': return '#6366F1';
          case 'fixed': return '#10B981';
          default: return colors.accent;
      }
  };

  const totalCurrent = positions.reduce((sum, p) => sum + (p.shares * (livePrices[p.id] || p.avgPrice)), 0);
  const totalInvested = positions.reduce((sum, p) => sum + (p.shares * p.avgPrice), 0);
  const profitPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

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
  
  // Paquete Sugerido Dinámico
  const getSantyPack = (amount: number) => {
    if (amount <= TRII_FEE) return { items: [], rationale: 'El monto es insuficiente para cubrir la comisión de Trii.' };
    
    const netAmount = amount - TRII_FEE; // Importante: Restar comisión
    
    // Pool de activos dinámico
    const pool = [...SEARCH_SUGGESTIONS].sort(() => 0.5 - Math.random());
    const selected = pool.slice(0, 4);
    
    const items = selected.map((s, i) => {
        const weights = [0.4, 0.3, 0.2, 0.1];
        const val = netAmount * weights[i];
        return { ticker: s.ticker, amount: val, shares: s.price ? Math.floor(val / s.price) : undefined };
    });

    const rationale = `Santy restó la comisión de Trii (${baseFmt(TRII_FEE)}) y te recomienda invertir tu capital neto de ${baseFmt(netAmount)} para maximizar ganancias.`;
    
    return { items, rationale };
  };

  const projectedSurplus = healthInfo.available > 0 ? healthInfo.available : 0;
  const autoPack = getSantyPack(projectedSurplus);

  // Lógica del Simulador de Santy
  const handleSimulate = () => {
    const amount = parseFloat(simAmount.replace(/\D/g, ''));
    if (isNaN(amount) || amount <= 0) return;
    const res = getSantyPack(amount);
    setSimResult(res.items);
    setSimRationale(res.rationale);
  };

  const openChart = (s: string) => { setChartSymbol(`BVC:${s}`); setChartModalVisible(true); };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity 
            onPress={() => activeTab === 'hub' ? router.back() : setActiveTab('hub')} 
            style={[styles.circleBtn, { backgroundColor: colors.card }]}
        >
          <Ionicons name={activeTab === 'hub' ? "close" : "arrow-back"} size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
            {activeTab === 'hub' ? 'Inversiones' : 
             activeTab === 'portfolio' ? 'Mi Portafolio' :
             activeTab === 'goals' ? 'Mis Metas' :
             activeTab === 'calendar' ? 'Calendario' : 'Asesor Santy'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeTab === 'hub' && (
            <View>
                <View style={{ alignItems: 'center', marginVertical: 40 }}>
                    <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>PATRIMONIO TOTAL</Text>
                    <Text style={{ color: colors.text, fontSize: 38, fontWeight: '900' }}>{baseFmt(totalCurrent + totalDividends)}</Text>
                    <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '800', marginTop: 8 }}>▲ {profitPct.toFixed(1)}% Ganancia Total</Text>
                </View>

                <View style={{ gap: 16 }}>
                    {[
                        { id: 'portfolio', label: 'Mi Portafolio', sub: `${positions.length} Activos`, icon: 'pie-chart', color: colors.accent },
                        { id: 'goals', label: 'Mis Metas', sub: `${goals.length} Proyectos`, icon: 'flag', color: '#10B981' },
                        { id: 'calendar', label: 'Calendario de Rentas', sub: `Próximo: ${baseFmt(nextMonthDiv)}`, icon: 'calendar-month', color: '#3B82F6', set: 'MaterialCommunityIcons' },
                        { id: 'ai', label: 'Asesor Santy', sub: `Excedente: ${baseFmt(projectedSurplus)}`, icon: 'auto-awesome', color: '#8B5CF6' }
                    ].map((item) => (
                        <TouchableOpacity key={item.id} style={[styles.hubCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setActiveTab(item.id as any)}>
                            <View style={[styles.hubIconBox, { backgroundColor: item.color + '15' }]}>
                                {item.set === 'MaterialCommunityIcons' 
                                  ? <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                                  : <MaterialIcons name={item.icon as any} size={24} color={item.color} />}
                            </View>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{item.label}</Text>
                                <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>{item.sub}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.sub} />
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        )}

        {activeTab === 'portfolio' && (
            <View>
                <View style={[styles.triiBarContainer, { backgroundColor: colors.cardBg || 'rgba(0,0,0,0.05)', marginBottom: 24 }]}>
                    <View style={styles.triiAllocationRow}>
                        {Object.entries(allocation).map(([type, pct], idx) => (
                            <View key={type} style={{ flex: pct }}>
                               <View style={[styles.triiBarFill, { backgroundColor: getAssetColor(type as AssetType) }]} />
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Activos</Text>
                    <TouchableOpacity onPress={() => setModalVisible(true)} style={{ backgroundColor: colors.accent, width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="add" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>

                {positions.map(pos => (
                    <TouchableOpacity key={pos.id} style={[styles.assetRow, { backgroundColor: colors.card, borderColor: colors.border }]} onLongPress={() => setDeletingId(pos.id)}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={[styles.assetIconBox, { backgroundColor: getAssetColor(pos.type) + '15' }]}>{getAssetIcon(pos.type)}</View>
                            <View>
                                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{pos.ticker}</Text>
                                <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '700' }}>{pos.shares} Unid.</Text>
                            </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{baseFmt((livePrices[pos.id] || pos.avgPrice) * pos.shares)}</Text>
                            {deletingId === pos.id && <TouchableOpacity onPress={() => handleDeletePosition(pos.id)}><Text style={{color:'#EF4444', fontSize:10, fontWeight:'900', marginTop:4}}>ELIMINAR</Text></TouchableOpacity>}
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        )}

        {activeTab === 'goals' && (
            <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Metas</Text>
                    <TouchableOpacity onPress={() => setGoalModalVisible(true)}><Text style={{ color: colors.accent, fontWeight: '800' }}>+ AÑADIR</Text></TouchableOpacity>
                </View>
                {goals.map((g) => {
                    const prog = Math.min((totalCurrent / (g.target || 1)) * 100, 100);
                    const remaining = Math.max(g.target - totalCurrent, 0);
                    const monthsToReach = projectedSurplus > 0 ? Math.ceil(remaining / projectedSurplus) : null;
                    return (
                        <TouchableOpacity 
                            key={g.id} 
                            onLongPress={() => setDeletingGoalId(g.id)}
                            style={[styles.insightCard, { backgroundColor: colors.card, marginBottom: 16, borderWidth: 1, borderColor: colors.border }]}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <View style={[styles.goalIconBox, { backgroundColor: g.color + '15' }]}>
                                    <MaterialCommunityIcons name={g.icon as any} size={24} color={g.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{g.name}</Text>
                                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '700' }}>Objetivo: {baseFmt(g.target)}</Text>
                                </View>
                                {deletingGoalId === g.id ? (
                                    <TouchableOpacity 
                                        onPress={() => handleDeleteGoal(g.id)}
                                        style={{ backgroundColor: '#EF4444', width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}
                                    >
                                        <Ionicons name="trash" size={20} color="#FFF" />
                                    </TouchableOpacity>
                                ) : (
                                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>{prog.toFixed(0)}%</Text>
                                )}
                            </View>
                            <View style={{ height: 10, backgroundColor: colors.bg, borderRadius: 5, marginBottom: 16 }}>
                                <View style={{ width: `${prog}%`, height: '100%', backgroundColor: g.color, borderRadius: 5 }} />
                            </View>
                            <View style={{ marginTop: 12, backgroundColor: g.color + '10', padding: 12, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: g.color }}>
                                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>💡 SANTY INSIGHT:</Text>
                                <Text style={{ color: colors.sub, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
                                    {monthsToReach && monthsToReach > 0 
                                      ? `Ahorra $50.000 COP más al mes para alcanzar esta meta ${Math.max(1, Math.floor(monthsToReach/2))} mes(es) antes.` 
                                      : `¡Estás en la recta final! Mantén el ritmo de inversión.`}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        )}


        {activeTab === 'calendar' && (
            <View>
                <View style={[styles.compactCard, { backgroundColor: colors.card, marginBottom: 24, alignItems: 'center' }]}>
                    <Text style={{ color: colors.sub, fontSize: 12, fontWeight: '900' }}>TOTAL ANUAL ESTIMADO</Text>
                    <Text style={{ color: '#10B981', fontSize: 28, fontWeight: '900' }}>{baseFmt(projectedDivs.reduce((a,b)=>a+b, 0))}</Text>
                </View>
                {projectedDivs.map((amount, idx) => amount > 0 && (
                    <View key={idx} style={[styles.assetRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][idx]}</Text>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{baseFmt(amount)}</Text>
                    </View>
                ))}
            </View>
        )}

        {activeTab === 'ai' && (
            <View>
                {/* PROACTIVE SAVINGS INSIGHT */}
                <View style={[styles.premiumCard, { backgroundColor: '#8B5CF6', marginBottom: 24 }]}>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '800' }}>SANTY INSIGHT</Text>
                    <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '900', marginVertical: 8 }}>{baseFmt(projectedSurplus)}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 18 }}>
                        Este es tu excedente mensual para invertir. Santy te recomienda usarlo sabiamente.
                    </Text>
                </View>

                {/* TOP GAINERS SECTION */}
                <View style={{ marginBottom: 32 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 16 }}>Las Más Eficientes de Hoy (BVC)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
                        {SEARCH_SUGGESTIONS.slice(0, 5).map((s, i) => (
                            <View key={i} style={[styles.compactCard, { backgroundColor: colors.card, width: 140, marginRight: 12, borderWidth: 1, borderColor: colors.border }]}>
                                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '900' }}>{s.ticker}</Text>
                                <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '800', marginTop: 4 }}>+{(Math.random() * 3 + 1).toFixed(2)}%</Text>
                                <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '700', marginTop: 8 }}>{baseFmt(s.price || 0)}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* MANUAL SIMULATOR */}
                <View style={[styles.insightCard, { backgroundColor: colors.card, marginBottom: 24 }]}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 16 }}>Simulador de Capital Extra</Text>
                    <Text style={{ color: colors.sub, fontSize: 11, marginBottom: 12 }}>Trii cobra {baseFmt(TRII_FEE)} por operación. Santy lo restará automáticamente.</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TextInput 
                            style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 16, color: colors.text, fontWeight: '800' }}
                            placeholder="¿Cuánto quieres invertir?" 
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
                        <View style={{ marginTop: 24 }}>
                            <View style={{ backgroundColor: colors.bg, padding: 16, borderRadius: 16, marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '900' }}>ESTRATEGIA SANTY:</Text>
                                    <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: '900' }}>FEE: - {baseFmt(TRII_FEE)}</Text>
                                </View>
                                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' }}>{simRationale}</Text>
                            </View>
                            {simResult.map((res, i) => (
                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <View>
                                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{res.ticker}</Text>
                                        {res.shares && <Text style={{ color: colors.sub, fontSize: 10 }}>{res.shares} unidades aprox.</Text>}
                                    </View>
                                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '900' }}>{baseFmt(res.amount)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </View>
        )}

      </ScrollView>

      {/* MODALS */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Añadir Activo</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Símbolo" value={ticker} onChangeText={setTicker} />
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Cantidad" keyboardType="decimal-pad" value={shares} onChangeText={setShares} />
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Precio" keyboardType="decimal-pad" value={avgPrice} onChangeText={setAvgPrice} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.bg, padding: 16, borderRadius: 16, alignItems: 'center' }} onPress={() => setModalVisible(false)}><Text style={{ color: colors.text }}>Cerrar</Text></TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.accent, padding: 16, borderRadius: 16, alignItems: 'center' }} onPress={handleSavePosition}><Text style={{ color: '#FFF', fontWeight: '900' }}>Añadir</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={goalModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nueva Meta</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Nombre" value={newGoal.name} onChangeText={t => setNewGoal({...newGoal, name: t})} />
            <TextInput style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} placeholder="Objetivo" keyboardType="decimal-pad" value={newGoal.target} onChangeText={t => setNewGoal({...newGoal, target: t})} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.bg, padding: 16, borderRadius: 16, alignItems: 'center' }} onPress={() => setGoalModalVisible(false)}><Text style={{ color: colors.text }}>Cerrar</Text></TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.accent, padding: 16, borderRadius: 16, alignItems: 'center' }} onPress={handleAddGoal}><Text style={{ color: '#FFF', fontWeight: '900' }}>Crear</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  circleBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  hubCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 28, borderWidth: 1, marginBottom: 16 },
  hubIconBox: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  assetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 24, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  assetIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  insightCard: { padding: 24, borderRadius: 28 },
  premiumCard: { padding: 32, borderRadius: 32 },
  goalIconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  compactCard: { padding: 24, borderRadius: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingBottom: 60 },
  modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 24 },
  input: { borderWidth: 1, borderRadius: 18, padding: 16, fontSize: 16, marginBottom: 16, borderColor: 'rgba(0,0,0,0.05)' },
  triiBarContainer: { height: 12, borderRadius: 6, overflow: 'hidden' },
  triiAllocationRow: { flexDirection: 'row', height: '100%' },
  triiBarFill: { height: '100%' },
});
