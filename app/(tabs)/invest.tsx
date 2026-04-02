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

// Simulador de precios fallback (ya que no hay API gratuita universal infalible)
const MOCK_PRICES: Record<string, number> = {
  'ECOPETROL': 2640,
  'BCOLOMBIA': 35200,
  'ISA': 19100,
  'GEB': 2620,
  'NUTRESA': 48000,
  'CSPX': 1850000,
  'NU': 48000,
  'AAPL': 750000,
};

// Sugerencias de búsqueda para evitar errores
const SEARCH_SUGGESTIONS = [
    { ticker: 'ECOPETROL', name: 'Ecopetrol S.A.', price: 2640, type: 'stock' },
    { ticker: 'BCOLOMBIA', name: 'Bancolombia S.A.', price: 35200, type: 'stock' },
    { ticker: 'GEB', name: 'Grupo Energía Bogotá', price: 2620, type: 'stock' },
    { ticker: 'ISA', name: 'Interconexión Eléctrica', price: 19100, type: 'stock' },
    { ticker: 'PFAVAL', name: 'Grupo Aval Pref.', price: 480, type: 'stock' },
    { ticker: 'PFBCOLOM', name: 'Bancolombia Pref.', price: 34500, type: 'stock' },
    { ticker: 'AAPL', name: 'Apple Inc.', price: 750000, type: 'stock' },
    { ticker: 'TSLA', name: 'Tesla, Inc.', price: 820000, type: 'stock' },
    { ticker: 'BTC', name: 'Bitcoin', price: 280000000, type: 'crypto' },
    { ticker: 'ETH', name: 'Ethereum', price: 12500000, type: 'crypto' },
];

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

  // Info IA
  const [healthInfo, setHealthInfo] = useState({ available: 0, status: 'Calculando...' });

  // Precios en tiempo real
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  
  // Visibilidad y saldos (Simulados basados en Trii)
  const [showBalances, setShowBalances] = useState(true);
  const [availableCash, setAvailableCash] = useState(0);
  const [pendingCash, setPendingCash] = useState(0);

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
        // Retrocompatibilidad con posiciones viejas que no tenían tipo
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
            // Renta fija y bienes raíces se mantienen estables en su precio promedio o usamos valorización manual
            if (pos.type === 'fixed' || pos.type === 'real_estate') {
                newPrices[pos.id] = pos.avgPrice;
                continue;
            }

            try {
                let queryTicker = pos.ticker;
                
                // Intento 1: Ticker original
                let price = await tryFetchPrice(queryTicker, pos.type);
                
                // Intento 2: Si es colombiano (sin punto), añadir .CL
                if (!price && pos.type === 'stock' && !queryTicker.includes('.')) {
                    price = await tryFetchPrice(`${queryTicker}.CL`, pos.type);
                }

                if (price) {
                    newPrices[pos.id] = price;
                } else {
                    newPrices[pos.id] = MOCK_PRICES[pos.ticker] || pos.avgPrice;
                }
            } catch (err) {
                newPrices[pos.id] = MOCK_PRICES[pos.ticker] || pos.avgPrice;
            }
        }
    } catch (e) {}

    setLivePrices(newPrices);
    setIsFetchingPrices(false);

    // Calculate allocation after fetching live prices
    const newAllocation: Record<AssetType, number> = { stock: 0, crypto: 0, fixed: 0, real_estate: 0 };
    let totalValue = 0;

    currentPositions.forEach(p => {
        const val = p.shares * (newPrices[p.id] || p.avgPrice);
        newAllocation[p.type] += val;
        totalValue += val;
    });

    // Convert to percentages
    if (totalValue > 0) {
        Object.keys(newAllocation).forEach(key => {
            newAllocation[key as AssetType] = (newAllocation[key as AssetType] / totalValue) * 100;
        });
    }
    setAllocation(newAllocation);
  };

  const tryFetchPrice = async (ticker: string, type: AssetType) => {
    try {
        let queryTicker = ticker;
        if (type === 'crypto' && !queryTicker.includes('-')) {
            queryTicker = `${queryTicker}-USD`;
        }

        const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${queryTicker}`;
        const fetchUrl = Platform.OS === 'web' 
            ? `https://api.allorigins.win/get?url=${encodeURIComponent(baseUrl)}`
            : baseUrl;

        const res = await fetch(fetchUrl);
        if (!res.ok) return null;
        
        const rawData = await res.json();
        const data = Platform.OS === 'web' && rawData.contents ? JSON.parse(rawData.contents) : rawData;
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        
        if (price) {
            let finalPriceCop = price;
            const currencyRes = data?.chart?.result?.[0]?.meta?.currency;
            if (currencyRes === 'USD') {
                finalPriceCop = price * (rates['USD'] || 3950);
            } else if (currencyRes === 'EUR') {
                finalPriceCop = price * (rates['EUR'] || 4250);
            }
            return finalPriceCop;
        }
    } catch (e) {}
    return null;
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
      avgPrice: parseFloat(avgPrice.replace(/\./g, '').replace(',', '.')), // Normalize COP input
      type: assetType
    };

    const updated = [...positions, newPos];
    setPositions(updated);
    await AsyncStorage.setItem(`@invest_${user?.id}`, JSON.stringify(updated));
    
    setTicker(''); setShares(''); setAvgPrice('');
    setModalVisible(false);
    
    // Obtener su precio inmediato
    fetchLivePrices([newPos]);
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

  const getAssetIcon = (type: AssetType) => {
      switch(type) {
          case 'crypto': return <MaterialCommunityIcons name="bitcoin" size={24} color="#F7931A" />;
          case 'real_estate': return <MaterialIcons name="business" size={24} color="#6366F1" />;
          case 'fixed': return <MaterialCommunityIcons name="bank" size={24} color="#10B981" />;
          default: return <MaterialIcons name="show-chart" size={24} color={colors.accent} />;
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

  const getAssetLabel = (type: AssetType) => {
      switch(type) {
          case 'crypto': return 'Crypto';
          case 'real_estate': return 'Inmueble';
          case 'fixed': return 'Escalable';
          default: return 'Acción/ETF';
      }
  };

  const totalInvested = positions.reduce((sum, p) => sum + (p.shares * p.avgPrice), 0);
  const totalCurrent = positions.reduce((sum, p) => {
    const currentPrice = livePrices[p.id] || p.avgPrice; 
    return sum + (p.shares * currentPrice);
  }, 0);

  const profit = (totalCurrent - totalInvested) + totalDividends;
  const profitPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

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
            {/* ── TOTAL PORTFOLIO (Trii Style) ────────────────────────── */}
            <View style={{ alignItems: 'center', marginVertical: 32 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Text style={[styles.triiTotalLabel, { color: colors.sub }]}>Total</Text>
                    <TouchableOpacity onPress={() => setShowBalances(!showBalances)}>
                        <Ionicons name={showBalances ? "eye-outline" : "eye-off-outline"} size={22} color={colors.sub} />
                    </TouchableOpacity>
                </View>
                <Text style={[styles.triiTotalValue, { color: colors.text }]}>
                    {showBalances ? baseFmt(totalCurrent + totalDividends) : '• • • • • •'}
                </Text>
            </View>

            {/* ── PORTFOLIO SECTION ────────────── */}
            <View style={styles.triiPortfolioHeader}>
                <Text style={{ color: colors.sub, fontSize: 13, fontWeight: '700' }}>Portafolio</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{baseFmt(totalCurrent)}</Text>
            </View>

            {/* ALLOCATION BAR */}
            <View style={[styles.triiBarContainer, { backgroundColor: colors.cardBg || 'rgba(0,0,0,0.05)' }]}>

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

            {/* CATEGORY CARDS */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={[styles.triiCatCard, { backgroundColor: colors.card, borderColor: colors.accent, borderWidth: 1 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Acciones y ETFs</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{baseFmt(totalCurrent)}</Text>
                </View>
                <View style={[styles.triiCatCard, { backgroundColor: colors.card }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
                        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Fondos / Otros</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>$ 0,00</Text>
                </View>
            </View>



            {/* DIVIDENDS MINI-CARD */}
            <TouchableOpacity 
                style={[styles.divCard, { backgroundColor: colors.card }]} 
                onPress={() => setDivModalVisible(true)}
            >
                <View style={styles.divLeft}>
                    <View style={[styles.divIcon, { backgroundColor: '#10B98120' }]}>
                        <MaterialCommunityIcons name="cash-multiple" size={20} color="#10B981" />
                    </View>
                    <View>
                        <Text style={[styles.divTitle, { color: colors.text }]}>Dividendos / Rentas</Text>
                        <Text style={[styles.divSub, { color: colors.sub }]}>Ganancias históricas añadidas</Text>
                    </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.divAmount, { color: '#10B981' }]}>+ {baseFmt(totalDividends)}</Text>
                    <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', marginTop: 4 }}>AÑADIR RENTA</Text>
                </View>
            </TouchableOpacity>

            {/* POSITIONS LIST */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Tus Activos</Text>
              <TouchableOpacity onPress={() => setModalVisible(true)}>
                <MaterialIcons name="add-circle" size={28} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {positions.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="show-chart" size={48} color={colors.sub} />
                <Text style={[styles.emptyText, { color: colors.sub }]}>Aún no tienes inversiones registradas.</Text>
                <Text style={{ color: colors.sub, fontSize: 12, textAlign: 'center', marginTop: 8 }}>Suma tus acciones, criptomonedas o CDTs tocando el (+)</Text>
              </View>
            ) : (
                <View style={[styles.triiListCard, { backgroundColor: colors.card }]}>
                    {/* Header Tabla Trii */}
                    <View style={styles.triiTableHeader}>
                        <Text style={[styles.triiCol, { flex: 1.5 }]}>Empresas ({positions.length}) <Ionicons name="swap-vertical" size={12} /></Text>
                        <Text style={[styles.triiCol, { textAlign: 'center' }]}>Precio Mercado <Ionicons name="swap-vertical" size={12} /></Text>
                        <Text style={[styles.triiCol, { textAlign: 'right' }]}>Variación <Ionicons name="swap-vertical" size={12} /></Text>
                    </View>

                    {positions.map((pos) => {
                        const currentP = livePrices[pos.id] || pos.avgPrice;
                        const posProfitPct = ((currentP - pos.avgPrice) / pos.avgPrice) * 100;

                        return (
                        <TouchableOpacity 
                            key={pos.id} 
                            style={styles.triiListItem}
                            onPress={() => openChart(pos.ticker)}
                            onLongPress={() => setDeletingId(pos.id)}
                            activeOpacity={0.7}
                        >
                            <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[styles.triiLogoCircle, { backgroundColor: getAssetColor(pos.type) + '15' }]}>
                                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: getAssetColor(pos.type) }} />
                                </View>
                                <View>
                                    <Text style={[styles.triiTicker, { color: colors.text }]}>{pos.ticker}</Text>
                                    <Text style={[styles.triiShares, { color: colors.sub }]}>{pos.shares} unid.</Text>
                                </View>
                            </View>
                            
                            <Text style={[styles.triiMktPrice, { color: colors.text }]}>{baseFmt(currentP)}</Text>
                            
                            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                <Text style={[styles.triiPct, { color: posProfitPct >= 0 ? '#10B981' : '#EF4444' }]}>
                                    {posProfitPct >= 0 ? '+' : ''}{posProfitPct.toFixed(1)}%
                                </Text>
                                {deletingId === pos.id && (
                                    <TouchableOpacity onPress={() => handleDeletePosition(pos.id)} style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 }}>
                                        <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '800' }}>BORRAR</Text>
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
          <View style={[styles.aiCard, { backgroundColor: colors.card }]}>
            <View style={[styles.aiIcon, { backgroundColor: '#8B5CF620' }]}>
              <MaterialIcons name="auto-awesome" size={42} color="#8B5CF6" />
            </View>
            <Text style={[styles.aiTitle, { color: colors.text }]}>Análisis de Inversión</Text>
            
            <View style={[styles.dataBox, { backgroundColor: colors.bg }]}>
              <Text style={[styles.dataBoxLabel, { color: colors.sub }]}>Salud Financiera Actual</Text>
              <Text style={[styles.dataBoxVal, { color: healthInfo.status === 'Óptima' ? '#4CAF50' : healthInfo.status === 'Regular' ? '#F59E0B' : '#EF4444' }]}>
                {healthInfo.status}
              </Text>
              <Text style={[styles.dataBoxLabel, { color: colors.sub, marginTop: 8 }]}>Excedente Disponible (Aprox)</Text>
              <Text style={[styles.dataBoxVal, { color: colors.text }]}>{fmt(healthInfo.available)}</Text>
            </View>

            <Text style={[styles.aiRecommendation, { color: colors.text }]}>
              {healthInfo.status === 'Óptima' && healthInfo.available > 200000 
                ? "¡Excelente mes! Tienes un buen excedente. Es un momento ideal para hacer aportes a fondos indexados o comprar acciones estables. Abre tu plataforma preferida y considera reinvertir estos fondos."
                : healthInfo.status === 'Regular'
                ? "Tienes algo de capital, pero no estás en tu mejor momento de liquidez. Si vas a invertir, busca opciones seguras y líquidas como un fondo de inversión colectiva o un CDT antes de comprar acciones de volatilidad."
                : "Actualmente tu nivel de deudas o gastos sobrepasa tu comodidad financiera. Te recomendamos enfocarte en pagar tus tarjetas y crear un fondo de emergencia antes de buscar rendimientos."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal Add Position */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Añadir Activo</Text>
            
            <View style={styles.typeSelectorRow}>
               {[
                 { id: 'stock', label: 'Acción/ETF', ic: 'show-chart' },
                 { id: 'crypto', label: 'Crypto', ic: 'bitcoin' },
                 { id: 'fixed', label: 'CDT/Fijo', ic: 'bank' },
                 { id: 'real_estate', label: 'Inmueble', ic: 'business' }
               ].map(t => (
                  <TouchableOpacity 
                    key={t.id}
                    style={[styles.typeBtn, assetType === t.id ? { backgroundColor: colors.accent, borderColor: colors.accent } : { borderColor: colors.border }]}
                    onPress={() => setAssetType(t.id as AssetType)}
                  >
                    <MaterialCommunityIcons name={t.ic as any} size={18} color={assetType === t.id ? '#FFF' : colors.sub} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: assetType === t.id ? '#FFF' : colors.sub, marginTop: 4 }}>{t.label}</Text>
                  </TouchableOpacity>
               ))}
            </View>

            <View>
                <TextInput 
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} 
                    placeholder={assetType === 'crypto' ? 'Ej. BTC-USD' : assetType === 'fixed' ? 'Nombre del Banco' : 'Símbolo (Ej. ECOPETROL)'}
                    placeholderTextColor={colors.sub}
                    value={ticker} onChangeText={handleTickerSearch} autoCapitalize="characters"
                />
                {suggestions.length > 0 && (
                    <View style={[styles.suggestionBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        {suggestions.map((s, idx) => (
                            <TouchableOpacity key={idx} style={[styles.suggestionItem, idx !== suggestions.length -1 && { borderBottomColor: colors.border, borderBottomWidth: 1 }]} onPress={() => selectSuggestion(s)}>
                                <View>
                                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{s.ticker}</Text>
                                    <Text style={{ color: colors.sub, fontSize: 10 }}>{s.name}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '900' }}>{baseFmt(s.price)}</Text>
                                    <Text style={{ color: colors.sub, fontSize: 8 }}>MARKET PRICE</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>
            {assetType !== 'fixed' && assetType !== 'real_estate' && (
                <TextInput 
                  style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} 
                  placeholder="Cantidad comprada (Ej. 10.5)" 
                  placeholderTextColor={colors.sub}
                  keyboardType="decimal-pad"
                  value={shares} onChangeText={setShares}
                />
            )}
            <TextInput 
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} 
              placeholder={assetType === 'fixed' || assetType === 'real_estate' ? "Valor Invertido Total (COP)" : "Precio promedio c/u (COP)"}
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              value={avgPrice} onChangeText={setAvgPrice}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setModalVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.accent }]} onPress={() => { handleSavePosition(); if (assetType === 'fixed' || assetType === 'real_estate') setShares('1'); }}>
                <Text style={{ color: '#FFF', fontWeight: '800' }}>Añadir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Add Dividends */}
      <Modal visible={divModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, paddingVertical: 40 }]}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <MaterialCommunityIcons name="cash-register" size={40} color="#10B981" />
                <Text style={[styles.modalTitle, { color: colors.text, marginTop: 12, marginBottom: 4 }]}>Registrar Rentas</Text>
                <Text style={{ color: colors.sub, fontSize: 13, textAlign: 'center' }}>Suma dividendos, pagos de rentas o intereses de CDTs a tu beneficio total.</Text>
            </View>
            
            <TextInput 
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border, textAlign: 'center', fontSize: 24, fontWeight: '800' }]} 
              placeholder="$ 0" 
              placeholderTextColor={colors.sub + '80'}
              keyboardType="decimal-pad"
              value={divAmount} onChangeText={t => setDivAmount(formatCurrency(parseFloat(t.replace(/\D/g, '') || '0'), 'COP', false).replace('$', ''))}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setDivModalVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cerrar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: '#10B981' }]} onPress={handleAddDividends}>
                <Text style={{ color: '#FFF', fontWeight: '800' }}>Registrar Pago</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal TradingView Chart */}
      <Modal visible={chartModalVisible} animationType="slide" presentationStyle="formSheet">
          <SafeAreaView style={{ flex: 1, backgroundColor: '#131722' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#333' }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900' }}>Análisis: {chartSymbol}</Text>
                  <TouchableOpacity onPress={() => setChartModalVisible(false)}>
                      <Ionicons name="close" size={24} color="#FFF" />
                  </TouchableOpacity>
              </View>
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
  
  summaryCard: { borderRadius: 28, padding: 24, marginBottom: 16, elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, alignItems: 'center' },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { color: '#FFF', fontSize: 36, fontWeight: '900', marginVertical: 8 },
  profitBadge: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  profitText: { fontSize: 14, fontWeight: '800' },

  divCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  divLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  divTitle: { fontSize: 14, fontWeight: '800' },
  divSub: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  divAmount: { fontSize: 15, fontWeight: '900' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },

  positionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  posLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  tickerName: { fontSize: 16, fontWeight: '800' },
  posShares: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  posRight: { alignItems: 'flex-end' },
  posValue: { fontSize: 16, fontWeight: '800' },
  posReturn: { fontSize: 13, fontWeight: '800', marginTop: 2 },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { marginTop: 16, fontSize: 14, fontWeight: '600' },

  aiCard: { borderRadius: 32, padding: 32, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  aiIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  aiTitle: { fontSize: 22, fontWeight: '900', marginBottom: 24 },
  dataBox: { width: '100%', borderRadius: 20, padding: 20, marginBottom: 24, alignItems: 'center' },
  dataBoxLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  dataBoxVal: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  aiRecommendation: { fontSize: 15, lineHeight: 24, fontWeight: '500', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalBox: { borderRadius: 32, padding: 32 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  typeSelectorRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  mBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },

  allocationCard: { borderRadius: 24, padding: 20, marginBottom: 16, elevation: 1 },
  triiTotalLabel: { fontSize: 16, fontWeight: '700' },
  triiTotalValue: { fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  triiBalances: { flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingHorizontal: 10, width: '100%', justifyContent: 'center' },
  triiBalanceItem: { flex: 1, alignItems: 'center' },
  triiBalLabel: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  triiBalValue: { fontSize: 18, fontWeight: '900' },
  triiDivider: { width: 1, height: 30, marginHorizontal: 20 },
  triiPortfolioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingHorizontal: 4 },
  triiBarContainer: { height: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden', marginBottom: 24 },
  triiAllocationRow: { flexDirection: 'row', height: '100%', gap: 2 },
  triiBarFill: { height: '100%' },
  triiCatCard: { flex: 1, borderRadius: 16, padding: 18 },
  triiSliderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.03)', paddingVertical: 18, paddingHorizontal: 24, borderRadius: 24, marginBottom: 40 },
  triiListCard: { borderRadius: 32, paddingVertical: 10, overflow: 'hidden' },
  triiTableHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  triiCol: { fontSize: 11, fontWeight: '800', color: 'rgba(0,0,0,0.4)', flex: 1 },
  triiListItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' },
  triiLogoCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  triiTicker: { fontSize: 15, fontWeight: '800' },
  triiShares: { fontSize: 11, fontWeight: '600' },
  triiMktPrice: { flex: 1, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  triiPct: { fontSize: 14, fontWeight: '900' },
  suggestionBox: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden', borderTopWidth: 0, marginTop: -12, marginBottom: 16 },
  suggestionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  allocationTitle: { fontSize: 13, fontWeight: '900', marginBottom: 12, opacity: 0.8 },
  allocationRow: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', gap: 2, marginBottom: 12 },
  allocationBarPart: { height: '100%' },
  allocationLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  typeBadgeText: { fontSize: 8, fontWeight: '900' },
});
