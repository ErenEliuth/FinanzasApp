import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
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
  View
} from 'react-native';
import { formatCurrency, convertCurrency } from '@/utils/currency';

interface Position {
  id: string;
  ticker: string;
  shares: number;
  avgPrice: number;
}

// Simulador de precios (ya que no hay API gratuita universal integrada ahora mismo)
const MOCK_PRICES: Record<string, number> = {
  'ECOPETROL': 2100,
  'BCOLOMBIA': 32000,
  'ISA': 18500,
  'GEB': 2400,
  'NUTRESA': 45000,
  'CSPX': 1850000,
  'NU': 48000,
  'AAPL': 750000,
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

  // Info IA
  const [healthInfo, setHealthInfo] = useState({ available: 0, status: 'Calculando...' });

  const fmt = (n: number) => formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

  useEffect(() => {
    if (isFocused) {
      loadPositions();
      calculateHealth();
    }
  }, [isFocused]);

  const loadPositions = async () => {
    try {
      const stored = await AsyncStorage.getItem(`@invest_${user?.id}`);
      if (stored) setPositions(JSON.parse(stored));
    } catch (e) {
      console.error(e);
    }
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
      shares: parseFloat(shares),
      avgPrice: parseFloat(avgPrice)
    };

    const updated = [...positions, newPos];
    setPositions(updated);
    await AsyncStorage.setItem(`@invest_${user?.id}`, JSON.stringify(updated));
    
    setTicker(''); setShares(''); setAvgPrice('');
    setModalVisible(false);
  };

  const handleDeletePosition = (id: string) => {
    Alert.alert('Eliminar', '¿Borrar esta inversión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
          const updated = positions.filter(p => p.id !== id);
          setPositions(updated);
          await AsyncStorage.setItem(`@invest_${user?.id}`, JSON.stringify(updated));
      }}
    ]);
  };

  const totalInvested = positions.reduce((sum, p) => sum + (p.shares * p.avgPrice), 0);
  const totalCurrent = positions.reduce((sum, p) => {
    const currentPrice = MOCK_PRICES[p.ticker] || p.avgPrice; // usar precio real si lo hay, o empatar
    return sum + (p.shares * currentPrice);
  }, 0);

  const profit = totalCurrent - totalInvested;
  const profitPct = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Inversiones</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* TABS */}
      <View style={[styles.tabContainer, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={[styles.tab, activeTab === 'portfolio' && { backgroundColor: colors.accent }]} onPress={() => setActiveTab('portfolio')}>
          <MaterialIcons name="pie-chart" size={18} color={activeTab === 'portfolio' ? '#FFF' : colors.sub} />
          <Text style={[styles.tabText, { color: activeTab === 'portfolio' ? '#FFF' : colors.sub }]}>Mi Portafolio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'ai' && { backgroundColor: '#8B5CF6' }]} onPress={() => setActiveTab('ai')}>
          <MaterialIcons name="auto-awesome" size={18} color={activeTab === 'ai' ? '#FFF' : colors.sub} />
          <Text style={[styles.tabText, { color: activeTab === 'ai' ? '#FFF' : colors.sub }]}>Asesor Santy</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {activeTab === 'portfolio' ? (
          <>
            {/* PORTFOLIO SUMMARY */}
            <View style={[styles.summaryCard, { backgroundColor: colors.greenCard }]}>
              <Text style={styles.summaryLabel}>BALANCE TOTAL (COP)</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalCurrent, 'COP', isHidden)}</Text>
              
              <View style={styles.profitBadge}>
                <Ionicons name={profit >= 0 ? 'trending-up' : 'trending-down'} size={16} color={profit >= 0 ? '#4CAF50' : '#EF4444'} />
                <Text style={[styles.profitText, { color: profit >= 0 ? '#4CAF50' : '#EF4444' }]}>
                  {profit >= 0 ? '+' : ''}{formatCurrency(profit, 'COP', isHidden)} ({profitPct.toFixed(2)}%)
                </Text>
              </View>
            </View>

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
              </View>
            ) : (
              positions.map((pos) => {
                const currentP = MOCK_PRICES[pos.ticker] || pos.avgPrice;
                const posTotalVal = pos.shares * currentP;
                const posProfit = posTotalVal - (pos.shares * pos.avgPrice);
                const posProfitPct = ((currentP - pos.avgPrice) / pos.avgPrice) * 100;

                return (
                  <TouchableOpacity 
                    key={pos.id} 
                    style={[styles.positionCard, { backgroundColor: colors.card }]}
                    onLongPress={() => handleDeletePosition(pos.id)}
                  >
                    <View style={styles.posLeft}>
                      <View style={[styles.tickerIcon, { backgroundColor: colors.accent + '20' }]}>
                        <Text style={[styles.tickerInitials, { color: colors.accent }]}>
                          {pos.ticker.substring(0, 2)}
                        </Text>
                      </View>
                      <View>
                        <Text style={[styles.tickerName, { color: colors.text }]}>{pos.ticker}</Text>
                        <Text style={[styles.posShares, { color: colors.sub }]}>{pos.shares} acciones</Text>
                      </View>
                    </View>
                    <View style={styles.posRight}>
                      <Text style={[styles.posValue, { color: colors.text }]}>{formatCurrency(posTotalVal, 'COP', isHidden)}</Text>
                      <Text style={[styles.posReturn, { color: posProfit >= 0 ? '#4CAF50' : '#EF4444' }]}>
                        {posProfit >= 0 ? '+' : ''}{posProfitPct.toFixed(2)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
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
              <Text style={[styles.dataBoxVal, { color: colors.text }]}>{formatCurrency(healthInfo.available, 'COP', isHidden)}</Text>
            </View>

            <Text style={[styles.aiRecommendation, { color: colors.text }]}>
              {healthInfo.status === 'Óptima' && healthInfo.available > 200000 
                ? "¡Excelente mes! Tienes un buen excedente. Es un momento ideal para hacer aportes a fondos indexados (como el S&P 500 vía MGC) o comprar acciones estables. Abre tu app Trii y considera reinvertir estos fondos."
                : healthInfo.status === 'Regular'
                ? "Tienes algo de capital, pero no estás en tu mejor momento de liquidez. Si vas a invertir, busca opciones seguras y líquidas como un fondo de inversión colectiva o un CDT antes de comprar acciones de volatilidad."
                : "Actualmente tu nivel de deudas o gastos sobrepasa tu comodidad financiera. Te recomendamos enfocarte en pagar tus tarjetas y crear un fondo de emergencia antes de buscar rendimientos en bolsa."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal Add Position */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Añadir Activo</Text>
            
            <TextInput 
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} 
              placeholder="Símbolo (Ej. ECOPETROL, NU)" 
              placeholderTextColor={colors.sub}
              value={ticker} onChangeText={setTicker} autoCapitalize="characters"
            />
            <TextInput 
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} 
              placeholder="Número de acciones" 
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              value={shares} onChangeText={setShares}
            />
            <TextInput 
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]} 
              placeholder="Precio promedio de compra (COP)" 
              placeholderTextColor={colors.sub}
              keyboardType="decimal-pad"
              value={avgPrice} onChangeText={setAvgPrice}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.bg }]} onPress={() => setModalVisible(false)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mBtn, { backgroundColor: colors.accent }]} onPress={handleSavePosition}>
                <Text style={{ color: '#FFF', fontWeight: '800' }}>Añadir</Text>
              </TouchableOpacity>
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
  
  tabContainer: { flexDirection: 'row', marginHorizontal: 24, padding: 6, borderRadius: 16, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 13, fontWeight: '800' },

  scroll: { paddingHorizontal: 24, paddingBottom: 100 },
  
  summaryCard: { borderRadius: 28, padding: 24, marginBottom: 24, elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, alignItems: 'center' },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { color: '#FFF', fontSize: 36, fontWeight: '900', marginVertical: 8 },
  profitBadge: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  profitText: { fontSize: 14, fontWeight: '800' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },

  positionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  posLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tickerIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  tickerInitials: { fontSize: 16, fontWeight: '900' },
  tickerName: { fontSize: 16, fontWeight: '800' },
  posShares: { fontSize: 13, fontWeight: '600', marginTop: 2 },
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
  aiRecommendation: { fontSize: 16, lineHeight: 24, fontWeight: '500', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalBox: { borderRadius: 32, padding: 32 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16, marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  mBtn: { flex: 1, paddingVertical: 18, borderRadius: 20, alignItems: 'center' },
});
