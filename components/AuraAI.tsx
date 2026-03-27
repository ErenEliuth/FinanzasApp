import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, 
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/utils/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
      
      // Prevenir el touchmove SOLO en el overlay de fondo
      const preventScroll = (e: TouchEvent) => {
        // Buscar si el toque está dentro del modal content
        const target = e.target as HTMLElement;
        let el: HTMLElement | null = target;
        while (el) {
          // Si encontramos el contenido del modal, permitir scroll
          if (el.getAttribute && el.getAttribute('data-modal-content') === 'true') return;
          el = el.parentElement;
        }
        // Si no está dentro del modal, bloquear
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
      Alert.alert('No compatible', 'El navegador no soporta reconocimiento de voz.');
      return;
    }

    // Si ya está escuchando, detener
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    // SIEMPRE destruir la instancia anterior antes de crear una nueva
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }

    const recog = new SpeechRecognition();
    recognitionRef.current = recog;
    recog.lang = 'es-CO'; // Español colombiano para mejor reconocimiento
    recog.continuous = false; // Una sola frase (más fiable en iOS)
    recog.interimResults = true; // Mostrar texto mientras habla
    recog.maxAlternatives = 1;

    let lastTranscript = '';

    recog.onstart = () => {
      setIsListening(true);
      lastTranscript = '';
    };

    recog.onresult = (event: any) => {
      let interim = '';
      let final_ = '';
      
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final_ += transcript;
        } else {
          interim += transcript;
        }
      }
      
      // Mostrar en tiempo real lo que va escuchando
      if (final_) {
        lastTranscript = final_;
        setInput(final_);
      } else if (interim) {
        lastTranscript = interim;
        setInput(interim); // Mostrar texto parcial mientras habla
      }
    };

    recog.onerror = (event: any) => {
      console.log('Speech error:', event.error);
      setIsListening(false);
      recognitionRef.current = null;
      // Si hubo un resultado parcial, mantenerlo
      if (lastTranscript) {
        setInput(lastTranscript);
      }
    };

    recog.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Si hay texto capturado, asegurarse de que se muestre
      if (lastTranscript) {
        setInput(lastTranscript);
      }
    };

    try {
      recog.start();
    } catch (e) {
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const { reply, action } = await askSanty(text);
      
      const sanctuaryMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: reply,
        sender: 'sanctuary',
        timestamp: new Date(),
        actionData: action
      };
      setMessages(prev => [...prev, sanctuaryMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: `Ups, mi conexión cerebral falló. ¿Puedes intentarlo de nuevo? 😅`,
        sender: 'sanctuary',
        timestamp: new Date(),
      }]);
    }

    setIsTyping(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const askSanty = async (text: string): Promise<{reply: string, action?: any}> => {
    try {
      const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        return { reply: "Uy, me falta algo para pensar (falta la llave API de Gemini en .env)." };
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Build context
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: monthTx } = await supabase.from('transactions')
        .select('*').eq('user_id', user?.id).gte('date', startOfMonth).order('date', { ascending: false });
        
      const txs = monthTx || [];
      const gastosM = txs.filter((t: any) => t.type === 'expense');
      const ingresosM = txs.filter((t: any) => t.type === 'income');
      const totalGastos = gastosM.reduce((s: number, t: any) => s + t.amount, 0);
      const totalIngresos = ingresosM.reduce((s: number, t: any) => s + t.amount, 0);

      const allTxs = await supabase.from('transactions').select('*').eq('user_id', user?.id).order('date', { ascending: false }).limit(8);
      const txHistory = (allTxs.data || []).map(t => `${t.type === 'income' ? '+' : '-'}$${t.amount} en ${t.category} (${new Date(t.date).toLocaleDateString()})`).join(', ');

      const prompt = `
Eres Santy, la asistente financiera personal y ejecutiva de ${finalName}.
Eres muy inteligente, sutilmente cómica y amable. Usas algo de jerga bogotana/colombiana (solo cuando es natural, como 'barras', 'lucas', 'palos'). 
Tratas de empoderar a ${finalName} con sus finanzas.

Aquí tienes el contexto financiero A TIEMPO REAL de este mes de ${finalName}:
- Ingresos logrados en este mes: $${totalIngresos}
- Gastos de este mes: ${gastosM.length} pagos por un total de $${totalGastos}
- Balance total calculado de este mes: $${totalIngresos - totalGastos}
- Sus últimas 8 transacciones registradas son: ${txHistory || 'Ninguna'}

El usuario te dirá algo. Revisa la oración. Tu objetivo general:
1. Si hace una pregunta sobre sus datos (ej. "¿cuánto gasté?", "¿cuál fue mi último gasto?"), respóndele mirando su contexto y saca cálculos si es necesario.
2. Si quiere registrar o anotar una transacción (ej. "me comí una empanada de 5 lucas", "me entraron 2 palos del sueldo", "anota 20k"), detecta y estructura la acción.

EXTREMADAMENTE IMPORTANTE: Solo debes responder en formato JSON crudo, nada de markdown ni saludos por fuera del JSON. La estructura del objeto DEBE ser exactamente:
{
  "reply": "Tu mensaje de respuesta conversacional (si vas a registrar algo, confirma lo que vas a registrar).",
  "action": null
}

Nota de action: Si solo charlaban o respondías pregunta, déjalo "action": null. PERO si detectas un registro, usa esta estructura:
  "action": {
    "amount": 20000, 
    "category": "Comida",
    "type": "expense",
    "description": "Empanada"
  }
Las categorías soportadas para action son EXACTAMENTE UNA DE LAS SIGUIENTES: Comida, Transporte, Sueldo, Arriendo, Servicios, Salud, Educación, Entretenimiento, Ropa, Tecnología, Mascotas, Deudas, General.
El "type" debe ser 'expense' o 'income'.

Mensaje del usuario: "${text}"
      `.trim();

      const result = await model.generateContent(prompt);
      let responseText = result.response.text();
      
      responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (err) {
        console.error("Gemini returned invalid JSON:", responseText);
        return { reply: "Uy, procesé mal la información en mi cabeza. Hablame más claro por favor." };
      }

      return {
        reply: parsed.reply || "No te entendí bien, ¿qué me decías?",
        action: parsed.action
      };

    } catch (e) {
      console.error('Gemini Error:', e);
      return { reply: "Tuve un cortocircuito en mi cerebro (servidor Gemini). Intenta de nuevo más tardecito." };
    }
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
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={[styles.modalContent, { backgroundColor: colorsNav.bg }]}
          {...(Platform.OS === 'web' ? { 'data-modal-content': 'true' } as any : {})}
        >
          <View style={[styles.header, { borderBottomColor: colorsNav.border }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.auraIcon, { borderRadius: 22, overflow: 'hidden' }]}>
                  <Image source={require('../assets/images/santy_eye.png')} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                </View>
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
                        <View style={[styles.miniAvatar, { borderRadius: 11, overflow: 'hidden' }]}>
                           <Image source={require('../assets/images/santy_eye.png')} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
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
