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
  const scrollRef = useRef<ScrollView>(null);
  const finalName = userName || 'Amigo';

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

  const handleVoice = () => {
    if (Platform.OS !== 'web') {
      Alert.alert("Próximamente", "El dictado por voz nativo estará disponible en la próxima versión.");
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Alert.alert("No compatible", "Tu navegador no soporta dictado por voz.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.start();
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

  const parseIntent = (text: string) => {
    const q = text.toLowerCase();
    const amountMatch = q.match(/(\d+[\d\.]*)/);
    const amount = amountMatch ? parseFloat(amountMatch[0].replace(/\./g, '')) : null;
    
    let category = 'General';
    if (q.includes('comida') || q.includes('almuerzo') || q.includes('cena')) category = 'Comida';
    if (q.includes('bus') || q.includes('transporte') || q.includes('taxi') || q.includes('gasolin')) category = 'Transporte';
    if (q.includes('sueldo') || q.includes('pago') || q.includes('nómina')) category = 'Sueldo';
    if (q.includes('regalo') || q.includes('sorpresa')) category = 'Regalo';
    if (q.includes('ahorro')) category = 'Ahorro';

    const isIncome = q.includes('gané') || q.includes('recibí') || q.includes('ingreso') || q.includes('sueldo');
    const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';

    if (amount) {
      return {
        reply: `Entendido ${finalName}. He detectado un ${isIncome ? 'ingreso' : 'gasto'} de $${amount.toLocaleString()} en la categoría ${category}. ¿Quieres que lo registre oficialmente?`,
        action: { amount, category, type, description: text }
      };
    }
    return { reply: `Cuéntame más, ${finalName}. Si me dices el monto (ej: "Gasté 50 en comida"), te ayudaré a registrarlo en un segundo.` };
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
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalContent, { backgroundColor: colorsNav.bg }]}>
          <View style={[styles.header, { borderBottomColor: colorsNav.border }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.auraIcon, { backgroundColor: colorsNav.accent }]}><Text style={{ fontSize: 20 }}>✨</Text></View>
                <View><Text style={[styles.headerTitle, { color: colorsNav.text }]}>Sanctuary AI</Text><Text style={[styles.headerSub, { color: colorsNav.sub }]}>Ejecutor financiero</Text></View>
             </View>
             <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Ionicons name="close" size={24} color={colorsNav.sub} /></TouchableOpacity>
          </View>
          <ScrollView ref={scrollRef} style={styles.chatArea} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {messages.map((m) => (
              <View key={m.id} style={[styles.msgRow, m.sender === 'user' ? styles.userRow : styles.auraRow]}>
                {m.sender === 'sanctuary' && <View style={[styles.miniAvatar, { backgroundColor: colorsNav.accent }]}><Text style={{ fontSize: 10 }}>✨</Text></View>}
                <View style={{ alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  <View style={[styles.bubble, m.sender === 'user' ? [styles.userBubble, { backgroundColor: colorsNav.accent }] : [styles.auraBubble, { backgroundColor: isDark ? '#2A2A42' : '#F1F5F9' }]]}>
                    <Text style={[styles.msgText, { color: m.sender === 'user' ? '#FFF' : colorsNav.text }]}>{m.text}</Text>
                    <Text style={[styles.timeText, { color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : colorsNav.sub }]}>{m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
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
             <TouchableOpacity style={[styles.micBtn, isListening && { backgroundColor: '#EF4444' }]} onPress={handleVoice}>
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
  overlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { height: '85%', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  auraIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 12, fontWeight: '600' },
  closeBtn: { padding: 8 },
  chatArea: { flex: 1 },
  msgRow: { flexDirection: 'row', marginBottom: 20, maxWidth: '85%' },
  userRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  auraRow: { alignSelf: 'flex-start', alignItems: 'flex-end', gap: 8 },
  miniAvatar: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  bubble: { padding: 15, borderRadius: 22 },
  auraBubble: { borderBottomLeftRadius: 4 },
  userBubble: { borderBottomRightRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  timeText: { fontSize: 9, marginTop: 4, textAlign: 'right', fontWeight: '700', opacity: 0.6 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingBottom: Platform.OS === 'ios' ? 35 : 15, gap: 10, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15, borderWidth: 1, maxHeight: 80 },
  sendBtn: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  micBtn: { width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  actionCard: { marginTop: 10, alignSelf: 'flex-start', paddingLeft: 10 },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }
});
