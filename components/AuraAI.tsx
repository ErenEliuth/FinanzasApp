import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, 
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/utils/auth';

type Message = {
  id: string;
  text: string;
  sender: 'sanctuary' | 'user';
  timestamp: Date;
  actionData?: {
    amount: number;
    category: string;
    description: string;
    type: 'income' | 'expense';
  };
};

export const AuraAI = ({ visible, onClose, userName }: { visible: boolean; onClose: () => void; userName: string; }) => {
  const colorsNav = useThemeColors();
  const { user } = useAuth();
  const isDark = colorsNav.isDark;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = React.useRef<any>(null);
  const scrollRef = React.useRef<ScrollView>(null);
  const finalName = userName || 'Amigo';

  // === BLOQUEO DE SCROLL DEL FONDO (iOS Safari Fix) ===
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    if (visible) {
      // Guardar posición actual del scroll
      const scrollY = window.scrollY;
      const body = document.body;
      const html = document.documentElement;
      
      // Congelar el body completamente
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
      
      // Prevenir el touchmove en el overlay
      const preventScroll = (e: TouchEvent) => {
        // Solo permitir scroll dentro del chat area
        const target = e.target as HTMLElement;
        const chatArea = document.querySelector('[data-chat-scroll="true"]');
        if (chatArea && chatArea.contains(target)) return;
        e.preventDefault();
      };
      
      document.addEventListener('touchmove', preventScroll, { passive: false });
      
      return () => {
        // Restaurar todo al cerrar
        document.removeEventListener('touchmove', preventScroll);
        const savedScrollY = parseInt(body.style.top || '0', 10) * -1;
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.width = '';
        body.style.overflow = '';
        html.style.overflow = '';
        window.scrollTo(0, savedScrollY);
        
        // Resetear zoom de iOS Safari
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
        }
      };
    }
  }, [visible]);

  useEffect(() => {
    if (visible && messages.length === 0) {
      setMessages([{
        id: '1',
        text: `¡Hola ${finalName}! ✨ Soy Sanctuary. Puedo ayudarte a anotar tus gastos si me lo pides por aquí o por voz. ¿Qué has hecho hoy?`,
        sender: 'sanctuary',
        timestamp: new Date()
      }]);
    }
  }, [visible]);

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      Alert.alert('No compatible', 'El navegador no soporta voz.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      return;
    }

    const recog = new SpeechRecognition();
    recognitionRef.current = recog;
    recog.lang = 'es-ES';
    recog.interimResults = true;

    recog.onstart = () => setIsListening(true);
    recog.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInput(finalTranscript);
        setIsListening(false);
      }
    };
    recog.onerror = () => setIsListening(false);
    recog.onend = () => setIsListening(false);

    try {
      recog.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(async () => {
      const { reply, action } = parseIntent(text);
      const sanctuaryMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: reply,
        sender: 'sanctuary',
        timestamp: new Date(),
        actionData: action
      };
      setMessages(prev => [...prev, sanctuaryMsg]);
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 1000);
  };

  const parseAmount = (text: string): number | null => {
    const q = text.toLowerCase().replace(/,/g, '').trim();
    
    // "20mil", "20 mil", "20.000", "20000"
    // "100 barras" = 100,000, "20 barras" = 20,000
    // "1 palo" = 1,000,000, "2 palos" = 2,000,000
    // "50k" = 50,000
    
    // Palos (millones)
    const paloMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:palo|palos|melón|melones)/);
    if (paloMatch) return parseFloat(paloMatch[1]) * 1000000;
    
    // Barras (miles)
    const barraMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:barra|barras|lucas|luca)/);
    if (barraMatch) return parseFloat(barraMatch[1]) * 1000;
    
    // "20k", "50K"
    const kMatch = q.match(/(\d+(?:\.\d+)?)\s*k\b/);
    if (kMatch) return parseFloat(kMatch[1]) * 1000;
    
    // "20mil", "20 mil", "100mil"
    const milMatch = q.match(/(\d+(?:\.\d+)?)\s*mil\b/);
    if (milMatch) return parseFloat(milMatch[1]) * 1000;
    
    // "1 millón", "2 millones"
    const millonMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:millón|millon|millones)/);
    if (millonMatch) return parseFloat(millonMatch[1]) * 1000000;
    
    // Formato con puntos como separadores: "20.000", "100.000"
    const dotFormatMatch = q.match(/(\d{1,3}(?:\.\d{3})+)/);
    if (dotFormatMatch) return parseFloat(dotFormatMatch[0].replace(/\./g, ''));
    
    // Número plano: "20000", "5000"
    const plainMatch = q.match(/(\d+)/);
    if (plainMatch) return parseFloat(plainMatch[0]);
    
    return null;
  };

  const parseIntent = (text: string) => {
    const q = text.toLowerCase().trim();

    // Manejo de saludos (Humanización)
    if (['hola', 'hey', 'buenas', 'saludos', 'hola hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'qué tal', 'que tal'].some(s => q === s || q.startsWith(s + ' ') || q.startsWith(s + ','))) {
      const greetings = [
        `¡Hola ${finalName}! 👋 Qué bueno saludarte. ¿En qué te ayudo hoy?`,
        `¡Hey ${finalName}! ✨ ¿Cómo va tu día? Estoy lista para lo que necesites.`,
        `¡Buenas ${finalName}! 👋 ¿Quieres anotar algún gasto o ingreso?`,
      ];
      return { reply: greetings[Math.floor(Math.random() * greetings.length)] };
    }

    // Agradecimientos y confirmaciones
    if (['gracias', 'vale', 'listo', 'ok', 'bueno', 'genial', 'perfecto', 'dale'].some(s => q === s)) {
      return { reply: `¡Con gusto, ${finalName}! Estaré aquí si necesitas registrar algo más. ✨` };
    }

    // Despedidas
    if (['chao', 'adiós', 'adios', 'nos vemos', 'hasta luego', 'bye'].some(s => q === s || q.startsWith(s))) {
      return { reply: `¡Hasta pronto, ${finalName}! 👋 Cuida esas finanzas. Aquí te espero. 💚` };
    }

    // Preguntas sobre qué puede hacer
    if (q.includes('qué puedes hacer') || q.includes('que puedes hacer') || q.includes('ayuda') || q.includes('cómo funciona') || q.includes('como funciona')) {
      return { reply: `Puedo ayudarte a registrar gastos e ingresos, ${finalName}. Solo dime algo como:\n\n• "Gasté 20mil en comida"\n• "Recibí 1 palo de sueldo"\n• "Taxi 15 barras"\n\n¡Y yo lo anoto por ti! 📝` };
    }

    // Extraer monto
    const amount = parseAmount(q);
    
    // Detectar categoría
    let category = 'General';
    if (q.includes('comida') || q.includes('almuerzo') || q.includes('cena') || q.includes('desayuno') || q.includes('restaurante') || q.includes('mercado') || q.includes('supermercado')) category = 'Comida';
    else if (q.includes('bus') || q.includes('transporte') || q.includes('taxi') || q.includes('uber') || q.includes('gasolin') || q.includes('pasaje') || q.includes('peaje')) category = 'Transporte';
    else if (q.includes('sueldo') || q.includes('nómina') || q.includes('nomina') || q.includes('salario') || q.includes('quincena')) category = 'Sueldo';
    else if (q.includes('regalo') || q.includes('sorpresa')) category = 'Regalo';
    else if (q.includes('ahorro') || q.includes('ahorr')) category = 'Ahorro';
    else if (q.includes('ropa') || q.includes('zapato') || q.includes('camisa') || q.includes('pantalón')) category = 'Ropa';
    else if (q.includes('arriendo') || q.includes('alquiler') || q.includes('renta')) category = 'Arriendo';
    else if (q.includes('luz') || q.includes('agua') || q.includes('internet') || q.includes('gas') || q.includes('servicio')) category = 'Servicios';
    else if (q.includes('médico') || q.includes('medico') || q.includes('salud') || q.includes('medicina') || q.includes('farmacia') || q.includes('doctor')) category = 'Salud';
    else if (q.includes('universidad') || q.includes('colegio') || q.includes('curso') || q.includes('estudio') || q.includes('educación')) category = 'Educación';
    else if (q.includes('cine') || q.includes('fiesta') || q.includes('entretenimiento') || q.includes('salida') || q.includes('bar') || q.includes('trago')) category = 'Entretenimiento';
    else if (q.includes('celular') || q.includes('teléfono') || q.includes('tecnología') || q.includes('computador')) category = 'Tecnología';
    else if (q.includes('mascota') || q.includes('perro') || q.includes('gato') || q.includes('veterinari')) category = 'Mascotas';
    else if (q.includes('deuda') || q.includes('préstamo') || q.includes('prestamo') || q.includes('cuota')) category = 'Deudas';

    const isIncome = q.includes('gané') || q.includes('gane') || q.includes('recibí') || q.includes('recibi') || q.includes('ingreso') || q.includes('sueldo') || q.includes('me pagaron') || q.includes('me lleg') || q.includes('cobré') || q.includes('cobre') || q.includes('nómina') || q.includes('quincena') || q.includes('salario');
    const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';

    if (amount) {
      return {
        reply: `Entendido, ${finalName}. He detectado un ${isIncome ? 'ingreso' : 'gasto'} de $${amount.toLocaleString()} en "${category}". ¿Lo registro?`,
        action: { amount, category, type, description: category }
      };
    }
    return { reply: `Cuéntame más detalles, ${finalName}. Dime cuánto y en qué gastaste. Por ejemplo: "Gasté 20mil en comida" o "Me llegaron 50 barras". 😊` };
  };

  const confirmTx = async (data: any) => {
    try {
      const { error } = await supabase.from('transactions').insert([{
        user_id: user?.id, type: data.type, amount: data.amount, description: data.description, category: data.category, account: 'Efectivo', date: new Date().toISOString()
      }]);
      if (error) throw error;
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `✅ ¡Perfecto! Ya quedó guardado en tu historial. ¿Algo más?`,
        sender: 'sanctuary',
        timestamp: new Date()
      }]);
    } catch (e) { Alert.alert("Error", "No pude guardar la transacción."); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent={true}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalContent, { backgroundColor: colorsNav.bg }]}>
          <View style={[styles.header, { borderBottomColor: colorsNav.border }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.auraIcon, { backgroundColor: colorsNav.accent }]}><Text style={{ fontSize: 20 }}>✨</Text></View>
                <View><Text style={[styles.headerTitle, { color: colorsNav.text }]}>Sanctuary AI</Text><Text style={[styles.headerSub, { color: colorsNav.sub }]}>Ejecutor financiero</Text></View>
             </View>
             <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Ionicons name="close" size={24} color={colorsNav.sub} /></TouchableOpacity>
          </View>
          <ScrollView 
            ref={scrollRef} 
            style={styles.chatArea} 
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }} 
            showsVerticalScrollIndicator={false}
            {...(Platform.OS === 'web' ? { 'data-chat-scroll': 'true' } as any : {})}
            bounces={false}
          >
            {messages.map((m) => (
                  <View key={m.id} style={[styles.msgRow, m.sender === 'user' ? styles.userRow : styles.auraRow]}>
                    {m.sender === 'sanctuary' && (
                       <View style={[styles.miniAvatar, { backgroundColor: colorsNav.accent }]}>
                          <Ionicons name="sparkles" size={12} color="#FFF" />
                       </View>
                    )}
                    <View style={{ flexShrink: 1, maxWidth: '100%', alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                      <View style={[
                        styles.bubble, 
                        m.sender === 'user' ? [styles.userBubble, { backgroundColor: colorsNav.accent }] : [styles.auraBubble, { backgroundColor: isDark ? '#2A2A3E' : '#F0F4F8' }]
                      ]}>
                        <Text style={[styles.msgText, { color: m.sender === 'user' ? '#FFF' : colorsNav.text }]}>
                          {m.text}
                        </Text>
                        <Text style={[styles.timeText, { color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : colorsNav.sub }]}>
                          {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </Text>
                      </View>
                      {m.actionData && (
                        <View style={styles.actionCard}>
                           <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colorsNav.accent }]} onPress={() => confirmTx(m.actionData)}>
                              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>Confirmar Registro</Text>
                           </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
            ))}
            {isTyping && <ActivityIndicator style={{ marginTop: 10 }} color={colorsNav.accent} />}
          </ScrollView>
          <View style={[styles.inputContainer, { backgroundColor: colorsNav.card, borderTopColor: colorsNav.border }]}>
             <TouchableOpacity style={[styles.micBtn, isListening && { backgroundColor: '#EF4444' }]} onPress={handleVoiceInput}>
                <Ionicons name={isListening ? "mic" : "mic-outline"} size={22} color={isListening ? "#FFF" : colorsNav.sub} />
             </TouchableOpacity>
             <TextInput style={[styles.input, { color: colorsNav.text, backgroundColor: isDark ? '#1E1E2E' : '#FFF', borderColor: colorsNav.border }]} placeholder={`Dime algo, ${finalName}...`} placeholderTextColor={colorsNav.sub} value={input} onChangeText={setInput} multiline />
             <TouchableOpacity style={[styles.sendBtn, { backgroundColor: input.trim() ? colorsNav.accent : colorsNav.sub }]} onPress={() => handleSend()} disabled={!input.trim()}><Ionicons name="send" size={20} color="#FFF" /></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', width: '100%', height: '100%' },
  modalContent: { 
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: '85%', 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  auraIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 12, fontWeight: '600' },
  closeBtn: { padding: 8 },
  chatArea: { flex: 1 },
  msgRow: { flexDirection: 'row', marginBottom: 15, maxWidth: '90%' },
  userRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  auraRow: { alignSelf: 'flex-start', alignItems: 'flex-end', gap: 8 },
  miniAvatar: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  bubble: {
    padding: 15,
    borderRadius: 22,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    flexShrink: 1,
    maxWidth: '100%',
  },
  auraBubble: { borderBottomLeftRadius: 4 },
  userBubble: { borderBottomRightRadius: 4 },
  msgText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    flexShrink: 1,
  },
  timeText: { fontSize: 9, marginTop: 4, textAlign: 'right', fontWeight: '700', opacity: 0.6 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingBottom: Platform.OS === 'ios' ? 35 : 15, gap: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, borderWidth: 1, maxHeight: 80 },
  sendBtn: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  micBtn: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  actionCard: {
    marginTop: 12,
    padding: 20,
    borderRadius: 24,
    width: '90%',
    flexShrink: 1,
  },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }
});
