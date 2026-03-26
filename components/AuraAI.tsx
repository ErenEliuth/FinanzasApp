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
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { supabase } from '@/utils/supabase';

type Message = {
  id: string;
  text: string;
  sender: 'sanctuary' | 'user';
  timestamp: Date;
};

export const AuraAI = ({ visible, onClose, userName }: { 
  visible: boolean; 
  onClose: () => void; 
  userName: string;
}) => {
  const colorsNav = useThemeColors();
  const isDark = colorsNav.isDark;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Usamos el nombre del prop directamente
  const finalName = userName || 'Amigo';

  useEffect(() => {
    if (visible && messages.length === 0) {
      setMessages([{
        id: '1',
        text: `¡Hola ${finalName}! ✨ Soy Sanctuary, tu espacio seguro de finanzas. Qué alegría que estés por aquí. ¿Cómo va tu día hoy?`,
        sender: 'sanctuary',
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

    // AI Logic more "Human"
    setTimeout(async () => {
      const response = await getSanctuaryAdvice(input);
      const sanctuaryMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'sanctuary',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, sanctuaryMsg]);
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 1200);
  };

  const getSanctuaryAdvice = async (query: string): Promise<string> => {
    const q = query.toLowerCase();
    
    // Saludos y Humanidad
    if (q === 'hola' || q === 'holas' || q === 'buen dia' || q === 'buenas') {
        return `¡Hola ${finalName}! Me encanta saludarte. Aquí estoy pendiente de tus números para que tú puedas estar tranquilo. ✨ ¿En qué puedo apoyarte hoy?`;
    }

    if (q.includes('como estas') || q.includes('cómo estás') || q.includes('qué tal')) {
        return `¡Estoy genial, ${finalName}! Especialmente cuando veo que te tomas el tiempo de cuidar tu futuro financiero. ¡Eso dice mucho de ti! 💜`;
    }

    if (q.includes('gracias') || q.includes('muchas gracias')) {
        return `¡De nada, ${finalName}! Es un placer para mí. Recuerda que cada peso que organizamos hoy es una preocupación menos mañana. 😊`;
    }

    if (q.includes('quien eres') || q.includes('qué eres')) {
        return `Soy Sanctuary ✨, tu inteligencia financiera personal. Mi misión es ayudarte a que tu dinero trabaje para ti y no al revés.`;
    }

    // Análisis de Gastos (Contextual)
    if (q.includes('sushi') || q.includes('pizza') || q.includes('hamburguesa') || q.includes('comida') || q.includes('comer')) {
      return `Mmm... ¡suena delicioso ${finalName}! He revisado tus gastos de 'Comida' y veo que ya has usado gran parte de tu presupuesto este mes. Si te das el gusto hoy, quizás toque apretar un poco el cinturón la próxima semana. ¿Tú qué dices? 🍣`;
    }
    
    if (q.includes('ahorro') || q.includes('metas') || q.includes('cuanto tengo')) {
      return `¡Tengo buenas noticias, ${finalName}! Tus ahorros están creciendo con constancia. Si sigues con esta disciplina, estarás un paso más cerca de tus sueños muy pronto. ¡Sigue así! 💰`;
    }

    if (q.includes('consejo') || q.includes('ahorrar')) {
       return `Mi consejo de hoy para ti, ${finalName}: Intenta la regla de los 20 minutos. Antes de comprar algo que no necesitas, espera 20 minutos. ¡A veces el impulso se va y el dinero se queda contigo! 💡`;
    }

    if (q.includes('te quiero') || q.includes('te amo')) {
        return `¡Oh, ${finalName}! Yo también aprecio mucho que me permitas ser parte de tu orden financiero. ¡Hacemos un gran equipo! 💜✨`;
    }

    return `Interesante lo que me cuentas, ${finalName}. Estoy analizando tus movimientos y me di cuenta que tus gastos en 'Pequeños Gustos' han subido un poquito. ¡No pasa nada, pero tenlo en el radar! ✨ ¿Quieres que veamos algún presupuesto específico?`;
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
                   <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Sanctuary AI</Text>
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
                {m.sender === 'sanctuary' && (
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
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              </View>
            ))}

            {isTyping && (
                <View style={styles.auraRow}>
                    <View style={[styles.miniAvatar, { backgroundColor: colorsNav.accent }]}>
                        <Text style={{ fontSize: 10 }}>✨</Text>
                    </View>
                    <View style={[styles.auraBubble, { backgroundColor: isDark ? '#2A2A42' : '#F1F5F9', paddingVertical: 12, paddingHorizontal: 20 }]}>
                        <ActivityIndicator size="small" color={colorsNav.accent} />
                    </View>
                </View>
            )}
          </ScrollView>

          {/* Input Area */}
          <View style={[styles.inputContainer, { backgroundColor: colorsNav.card, borderTopColor: colorsNav.border }]}>
             <TextInput 
                style={[styles.input, { color: colorsNav.text, backgroundColor: isDark ? '#1E1E2E' : '#FFF', borderColor: colorsNav.border }]}
                placeholder={`Dime algo, ${finalName}...`}
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
  miniAvatar: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  bubble: { padding: 16, borderRadius: 24 },
  auraBubble: { borderBottomLeftRadius: 4 },
  userBubble: { borderBottomRightRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  timeText: { fontSize: 9, marginTop: 6, textAlign: 'right', fontWeight: '800', opacity: 0.6, letterSpacing: 0.5 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, gap: 12, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15, borderWidth: 1, maxHeight: 100 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }
});
