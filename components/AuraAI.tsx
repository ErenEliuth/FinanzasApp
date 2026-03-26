import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  KeyboardAvoidingView, 
  Platform,
  Image,
  ActivityIndicator
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Message = {
  id: string;
  text: string;
  sender: 'aura' | 'user';
  timestamp: Date;
};

export const AuraAI = ({ visible, onClose, userName, theme }: { 
  visible: boolean; 
  onClose: () => void; 
  userName: string;
  theme?: string;
}) => {
  const colorsNav = useThemeColors();
  const isDark = colorsNav.isDark;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible && messages.length === 0) {
      setMessages([{
        id: '1',
        text: `¡Hola ${userName}! Soy Aura ✨. Tu asesora financiera personal. ¿En qué puedo ayudarte hoy?`,
        sender: 'aura',
        timestamp: new Date()
      }]);
    }
  }, [visible]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // AI Logic Mock
    setTimeout(async () => {
      const auraResponse = await getAuraAdvice(input);
      const auraMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: auraResponse,
        sender: 'aura',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, auraMsg]);
      setIsTyping(false);
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 1500);
  };

  const getAuraAdvice = async (query: string): Promise<string> => {
    const q = query.toLowerCase();
    
    if (q.includes('sushi') || q.includes('comida') || q.includes('comer')) {
      return "He revisado tu presupuesto de 'Comida'. Llevas un 75% gastado este mes y te faltan 12 días para que termine. Mi consejo: hoy cocina en casa y guarda ese dinero para el fin de semana. 🍳";
    }
    
    if (q.includes('ahorro') || q.includes('metas')) {
      return "¡Vas muy bien! Tus ahorros han crecido un 15% este mes comparado con el anterior. Si sigues a este ritmo, alcanzarás tu meta 'Vacaciones' en Julio. ✈️";
    }

    if (q.includes('consejo') || q.includes('ahorrar')) {
       return "Un truco clásico: Divide tus gastos en 50/30/20. 50% Necesidades, 30% Gustos y 20% Ahorro. Veo que tus 'Gustos' están llegando al 40%, intenta bajar $20 esta semana. 💰";
    }

    if (q.includes('hola') || q.includes('buenos días')) {
        return "¡Hola! Estoy aquí lista para analizar tus números. ¿Quieres saber cuánto te queda disponible para hoy? 📊";
    }

    return "Interesante pregunta. Estoy analizando tus movimientos... Veo que tus gastos fijos están bajo control, pero tus 'Gastos Hormiga' en café han subido un poco esta semana. ¡Ojo ahí! ✨";
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalContent, { backgroundColor: colorsNav.bg }]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colorsNav.border }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.auraIcon, { backgroundColor: colorsNav.accent }]}>
                   <Text style={{ fontSize: 20 }}>✨</Text>
                </View>
                <View>
                   <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Aura AI Advisor</Text>
                   <Text style={[styles.headerSub, { color: colorsNav.sub }]}>Tu lugar seguro financiero</Text>
                </View>
             </View>
             <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colorsNav.sub} />
             </TouchableOpacity>
          </View>

          {/* Chat area */}
          <ScrollView 
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m) => (
              <View 
                key={m.id} 
                style={[
                   styles.msgRow, 
                   m.sender === 'user' ? styles.userRow : styles.auraRow
                ]}
              >
                {m.sender === 'aura' && (
                   <View style={[styles.miniAvatar, { backgroundColor: colorsNav.accent }]}>
                      <Text style={{ fontSize: 10 }}>✨</Text>
                   </View>
                )}
                <View 
                   style={[
                      styles.bubble, 
                      m.sender === 'user' ? 
                        [styles.userBubble, { backgroundColor: colorsNav.accent }] : 
                        [styles.auraBubble, { backgroundColor: isDark ? '#2A2A42' : '#F1F5F9' }]
                   ]}
                >
                  <Text style={[styles.msgText, { color: m.sender === 'user' ? '#FFF' : colorsNav.text }]}>
                    {m.text}
                  </Text>
                  <Text style={[styles.timeText, { color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : colorsNav.sub }]}>
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}

            {isTyping && (
                <View style={styles.auraRow}>
                    <View style={[styles.miniAvatar, { backgroundColor: colorsNav.accent }]}>
                        <Text style={{ fontSize: 10 }}>✨</Text>
                    </View>
                    <View style={[styles.auraBubble, { backgroundColor: isDark ? '#2A2A42' : '#F1F5F9', paddingVertical: 12 }]}>
                        <ActivityIndicator size="small" color={colorsNav.accent} />
                    </View>
                </View>
            )}
          </ScrollView>

          {/* Input Area */}
          <View style={[styles.inputContainer, { backgroundColor: colorsNav.card, borderTopColor: colorsNav.border }]}>
             <TextInput 
                style={[styles.input, { color: colorsNav.text, backgroundColor: isDark ? '#1E1E2E' : '#FFF', borderColor: colorsNav.border }]}
                placeholder="Pregúntale algo a Aura..."
                placeholderTextColor={colorsNav.sub}
                value={input}
                onChangeText={setInput}
                multiline
             />
             <TouchableOpacity 
                style={[styles.sendBtn, { backgroundColor: input.trim() ? colorsNav.accent : colorsNav.sub }]} 
                onPress={handleSend}
                disabled={!input.trim()}
             >
                <Ionicons name="send" size={20} color="#FFF" />
             </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { 
    height: '85%', 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 24, 
    borderBottomWidth: 1 
  },
  auraIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 12, fontWeight: '600' },
  closeBtn: { padding: 8 },
  chatArea: { flex: 1 },
  msgRow: { flexDirection: 'row', marginBottom: 20, maxWidth: '85%' },
  userRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  auraRow: { alignSelf: 'flex-start', alignItems: 'flex-end', gap: 8 },
  miniAvatar: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  bubble: { padding: 16, borderRadius: 24 },
  auraBubble: { borderBottomLeftRadius: 4 },
  userBubble: { borderBottomRightRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  timeText: { fontSize: 10, marginTop: 6, textAlign: 'right', fontWeight: '700', letterSpacing: 0.5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, gap: 12, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15, borderWidth: 1, maxHeight: 100 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }
});
