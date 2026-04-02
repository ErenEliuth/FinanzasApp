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

  // Precios en tiempo real
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  
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

  const getAssetLabel = (type: AssetType) => {
      switch(type) {
          case 'crypto': return 'Crypto';
          case 'real_estate': return 'Inmueble';
          case 'fixed': return 'Escalable';
          default: return 'Acción/ETF';
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

  // Rebalance logic
  const getRebalanceAdvice = () => {
    const advice = [];
    const totalAssets = totalCurrent || 1;
    for (const [type, target] of Object.entries(TARGET_ALLOC)) {
        const currentPct = allocation[type as AssetType] || 0;
        const targetPct = target * 100;
        if (targetPct - currentPct > 5) {
            const gapAmount = (totalAssets * (targetPct / 100)) - (totalAssets * (currentPct / 100));
            advice.push({ type, gapAmount, label: getAssetLabel(type as AssetType) });
        }
    }
    return advice;
  };
  const rebalanceAdvice = getRebalanceAdvice();

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
            <View style={{ alignItems: 'center', marginVertical: 32 }}>
                <Text style={[styles.triiTotalLabel, { color: colors.sub }]}>Total</Text>
                <Text style={[styles.triiTotalValue, { color: colors.text }]}>
                    {showBalances ? baseFmt(totalCurrent + totalDividends) : '• • • • • •'}
                </Text>
            </View>

            {/* DIVIDEND CALENDAR */}
            <View style={{ marginBottom: 32 }}>
                <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>Dividendos Proyectados</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
                    {projectedDivs.map((amount, idx) => {
                        if (amount === 0) return null;
                        const month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][idx];
                        const isNext = idx === (currentMonthIdx + 1) % 12;
                        return (
                            <View key={idx} style={[styles.divMonthCard, { borderColor: isNext ? colors.accent : colors.border, backgroundColor: colors.card }]}>
                                <Text style={{ color: colors.sub, fontSize: 10, fontWeight: '800' }}>{month.toUpperCase()}</Text>
                                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900' }}>{baseFmt(amount)}</Text>
                            </View>
                        );
                    })}
                </ScrollView>
            </View>

            {/* REBALANCE BANNER */}
            {rebalanceAdvice.length > 0 && (
                <TouchableOpacity style={[styles.rebalanceBanner, { backgroundColor: colors.accent + '15', borderColor: colors.accent }]} onPress={() => setActiveTab('ai')}>
                    <MaterialCommunityIcons name="scale-balance" size={20} color={colors.accent} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>Oportunidad de Rebalanceo</Text>
                        <Text style={{ color: colors.sub, fontSize: 11 }}>Te recomendamos invertir para llegar a tu meta ideal.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.divCard, { backgroundColor: colors.card, marginBottom: 32 }]} onPress={() => setDivModalVisible(true)}>
              <View style={styles.divLeft}>
                  <View style={[styles.divIcon, { backgroundColor: '#10B98120' }]}>
                      <MaterialCommunityIcons name="cash-multiple" size={20} color="#10B981" />
                  </View>
                  <View>
                      <Text style={[styles.divTitle, { color: colors.text }]}>Ganancias registradas</Text>
                      <Text style={[styles.divSub, { color: colors.sub }]}>Histórico de pagos añadidos</Text>
                  </View>
              </View>
              <Text style={[styles.divAmount, { color: '#10B981' }]}>+ {baseFmt(totalDividends)}</Text>
            </TouchableOpacity>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Tus Activos</Text>
              <TouchableOpacity onPress={() => setModalVisible(true)}>
                <MaterialIcons name="add-circle" size={28} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {positions.length > 0 && (
                <View style={[styles.triiListCard, { backgroundColor: colors.card }]}>
                    <View style={styles.triiTableHeader}>
                        <Text style={[styles.triiCol, { flex: 1.5 }]}>Empresa</Text>
                        <Text style={[styles.triiCol, { textAlign: 'center' }]}>Mercado</Text>
                        <Text style={[styles.triiCol, { textAlign: 'right' }]}>Rent.</Text>
                    </View>
                    {positions.map(pos => {
                        const currentP = livePrices[pos.id] || pos.avgPrice;
                        const posProfitPct = ((currentP - pos.avgPrice) / pos.avgPrice) * 100;
                        return (
                            <TouchableOpacity key={pos.id} style={styles.triiListItem} onPress={() => openChart(pos.ticker)} onLongPress={() => setDeletingId(pos.id)}>
                                <View style={{ flex: 1.5 }}>
                                    <Text style={[styles.triiTicker, { color: colors.text }]}>{pos.ticker}</Text>
                                    <Text style={[styles.triiShares, { color: colors.sub }]}>{pos.shares} unid.</Text>
                                </View>
                                <Text style={[styles.triiMktPrice, { color: colors.text }]}>{baseFmt(currentP)}</Text>
                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                    <Text style={[styles.triiPct, { color: posProfitPct >= 0 ? '#10B981' : '#EF4444' }]}>{posProfitPct >= 0 ? '+' : ''}{posProfitPct.toFixed(1)}%</Text>
                                    {deletingId === pos.id && (
                                        <TouchableOpacity onPress={() => handleDeletePosition(pos.id)}><Text style={{color:'#EF4444', fontSize:10}}>ELIMINAR</Text></TouchableOpacity>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
          </>
        ) : (
            <View style={[styles.aiCard, { backgroundColor: colors.card }]}>
              <View style={[styles.aiIcon, { backgroundColor: '#8B5CF620' }]}>
                <MaterialIcons name="auto-awesome" size={42} color="#8B5CF6" />
              </View>
              <Text style={[styles.aiTitle, { color: colors.text }]}>Asesor Santy</Text>
              <View style={[styles.dataBox, { backgroundColor: colors.bg, width: '100%', borderRadius: 20, padding: 20, marginBottom: 24 }]}>
                    {rebalanceAdvice.map((adv, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ color: colors.text, fontSize: 12 }}>Falta en {adv.label}</Text>
                            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '900' }}>+ {baseFmt(adv.gapAmount)}</Text>
                        </View>
                    ))}
                    {rebalanceAdvice.length === 0 && <Text style={{ color:colors.text }}>¡Tu portafolio está perfectamente balanceado!</Text>}
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
  divCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 24 },
  divLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  divTitle: { fontSize: 14, fontWeight: '800' },
  divSub: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  divAmount: { fontSize: 15, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  aiCard: { borderRadius: 32, padding: 32, alignItems: 'center' },
  aiIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  aiTitle: { fontSize: 22, fontWeight: '900', marginBottom: 24 },
  dataBox: { width: '100%', borderRadius: 20, padding: 20, marginBottom: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingBottom: 50 },
  modalTitle: { fontSize: 24, fontWeight: '900', marginBottom: 24 },
  typeSelectorRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  typeBtn: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 18, padding: 18, fontSize: 16, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
  mBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
  divMonthCard: { width: 100, borderRadius: 16, padding: 16, marginRight: 12, borderWidth: 1, alignItems: 'center' },
  rebalanceBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 32 },
  triiTotalLabel: { fontSize: 16, fontWeight: '700' },
  triiTotalValue: { fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  triiPortfolioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingHorizontal: 4 },
  triiBarContainer: { height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 24 },
  triiAllocationRow: { flexDirection: 'row', height: '100%', gap: 2 },
  triiBarFill: { height: '100%' },
  triiCatCard: { flex: 1, borderRadius: 16, padding: 18 },
  triiListCard: { borderRadius: 32, paddingVertical: 10, overflow: 'hidden' },
  triiTableHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  triiCol: { fontSize: 11, fontWeight: '800', color: 'rgba(0,0,0,0.4)', flex: 1 },
  triiListItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' },
  triiTicker: { fontSize: 15, fontWeight: '800' },
  triiShares: { fontSize: 11, fontWeight: '600' },
  triiMktPrice: { flex: 1, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  triiPct: { fontSize: 14, fontWeight: '900' },
});
