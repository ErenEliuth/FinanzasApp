import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, 
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image
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
      // Primero intentar responder preguntas con datos reales
      const queryReply = await handleQuery(text);
      
      if (queryReply) {
        const sanctuaryMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: queryReply,
          sender: 'sanctuary',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, sanctuaryMsg]);
      } else {
        // Si no es una pregunta, intentar parsear como transacción
        const { reply, action } = parseIntent(text);
        const sanctuaryMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: reply,
          sender: 'sanctuary',
          timestamp: new Date(),
          actionData: action
        };
        setMessages(prev => [...prev, sanctuaryMsg]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: `Ups, tuve un problema procesando eso. ¿Puedes intentar de nuevo? 😅`,
        sender: 'sanctuary',
        timestamp: new Date(),
      }]);
    }

    setIsTyping(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Manejar preguntas que requieren consultar datos reales
  const handleQuery = async (text: string): Promise<string | null> => {
    const q = text.toLowerCase().trim();
    
    // Detectar si es una pregunta (NO un comando de transacción)
    const isQuestion = q.includes('cuánto') || q.includes('cuanto') || q.includes('cuáles') || q.includes('cuales') ||
      q.includes('muéstrame') || q.includes('muestrame') || q.includes('dime') || q.includes('qué he') || q.includes('que he') ||
      q.includes('mis transacciones') || q.includes('mi historial') || q.includes('mis gastos') || q.includes('mis ingresos') ||
      q.includes('he gastado') || q.includes('he ganado') || q.includes('resumen') || q.includes('balance') ||
      q.includes('últimas') || q.includes('ultimas') || q.includes('último') || q.includes('ultimo') ||
      q.includes('en qué gasto') || q.includes('en que gasto') || q.includes('qué gasté') || q.includes('que gaste') ||
      q.includes('hoy') || q.includes('este mes') || q.includes('mes pasado') || q.includes('semana') ||
      q.includes('consejo') || q.includes('tip') || q.includes('recomienda') ||
      q.includes('debo') || q.includes('deuda') || q.includes('deudas') ||
      q.includes('meta') || q.includes('metas') || q.includes('objetivo') ||
      q.includes('cómo estoy') || q.includes('como estoy') || q.includes('cómo voy') || q.includes('como voy');

    if (!isQuestion) return null;

    // === CONSEJOS FINANCIEROS (no requiere DB) ===
    if (q.includes('consejo') || q.includes('tip') || q.includes('recomienda')) {
      const tips = [
        `💡 Intenta ahorrar al menos el 10% de cada ingreso que recibas, ${finalName}. Aunque sea poco, la constancia hace la diferencia.`,
        `💡 Antes de comprar algo, pregúntate: "¿Lo necesito o lo quiero?" Si puedes esperar 24h y sigues queriéndolo, cómpralo.`,
        `💡 Registra TODOS tus gastos, incluso los pequeños. Los gastos hormiga ($2 aquí, $5 allá) son los que más se comen tu dinero.`,
        `💡 Crea un fondo de emergencia de al menos 3 meses de tus gastos fijos. Es tu colchón de seguridad.`,
        `💡 Si tienes deudas, paga primero la que tenga la tasa de interés más alta. Eso te ahorra dinero a largo plazo.`,
        `💡 Usa la regla 50/30/20: 50% necesidades, 30% deseos, 20% ahorro. Es simple pero muy efectiva.`,
        `💡 Evita las compras impulsivas. Haz una lista antes de ir al supermercado y cúmplela.`,
        `💡 Revisa tus suscripciones mensuales. Seguro hay alguna que ya no usas y puedes cancelar.`,
      ];
      return tips[Math.floor(Math.random() * tips.length)];
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      const today = now.toISOString().split('T')[0];

      // === GASTOS DE HOY ===
      if (q.includes('hoy')) {
        const { data } = await supabase.from('transactions').select('*')
          .eq('user_id', user?.id).gte('date', today).order('date', { ascending: false });
        
        if (!data || data.length === 0) return `No tienes movimientos registrados hoy, ${finalName}. ¡Día limpio! 🎉`;
        
        const gastos = data.filter((t: any) => t.type === 'expense');
        const ingresos = data.filter((t: any) => t.type === 'income');
        const totalG = gastos.reduce((s: number, t: any) => s + t.amount, 0);
        const totalI = ingresos.reduce((s: number, t: any) => s + t.amount, 0);
        
        let reply = `Hoy llevas ${data.length} movimiento(s), ${finalName}:\n\n`;
        if (totalI > 0) reply += `💰 Ingresos: $${totalI.toLocaleString()}\n`;
        if (totalG > 0) reply += `💸 Gastos: $${totalG.toLocaleString()}\n`;
        reply += `\n📝 Detalle:\n`;
        data.slice(0, 5).forEach((t: any) => {
          reply += `• ${t.type === 'income' ? '💰' : '💸'} ${t.category}: $${t.amount.toLocaleString()}\n`;
        });
        return reply;
      }

      // === ÚLTIMO GASTO / ÚLTIMA TRANSACCIÓN ===
      if (q.includes('último') || q.includes('ultimo') || q.includes('última') || q.includes('ultima')) {
        const { data } = await supabase.from('transactions').select('*')
          .eq('user_id', user?.id).order('date', { ascending: false }).limit(1);
        
        if (!data || data.length === 0) return `No tienes transacciones aún, ${finalName}. 📝`;
        
        const t = data[0];
        const fecha = new Date(t.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
        return `Tu última transacción fue un ${t.type === 'income' ? 'ingreso' : 'gasto'} de $${t.amount.toLocaleString()} en "${t.category}" el ${fecha}. ${t.type === 'income' ? '💰' : '💸'}`;
      }

      // === DEUDAS ===
      if (q.includes('debo') || q.includes('deuda') || q.includes('deudas')) {
        const { data } = await supabase.from('debts').select('*').eq('user_id', user?.id);
        
        if (!data || data.length === 0) return `¡No tienes deudas registradas, ${finalName}! Eso es genial. 🎉`;
        
        const totalDeuda = data.reduce((s: number, d: any) => s + (d.total_amount - (d.paid_amount || 0)), 0);
        let reply = `Tienes ${data.length} deuda(s) activa(s), ${finalName}.\n\n💳 Total pendiente: $${totalDeuda.toLocaleString()}\n\n`;
        data.slice(0, 5).forEach((d: any) => {
          const pendiente = d.total_amount - (d.paid_amount || 0);
          reply += `• ${d.name || d.description}: $${pendiente.toLocaleString()}\n`;
        });
        return reply;
      }

      // === METAS ===
      if (q.includes('meta') || q.includes('metas') || q.includes('objetivo')) {
        const { data } = await supabase.from('goals').select('*').eq('user_id', user?.id);
        
        if (!data || data.length === 0) return `No tienes metas de ahorro registradas, ${finalName}. ¿Quieres crear una desde la sección de Metas? 🎯`;
        
        let reply = `Tus metas de ahorro, ${finalName}:\n\n`;
        data.forEach((g: any) => {
          const pct = g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
          const falta = g.target_amount - g.current_amount;
          reply += `🎯 ${g.name}: $${g.current_amount.toLocaleString()} / $${g.target_amount.toLocaleString()} (${pct}%)\n   Faltan: $${falta.toLocaleString()}\n\n`;
        });
        return reply;
      }

      // === CONSULTAS CON DATOS DEL MES ===
      const { data: monthTx } = await supabase.from('transactions').select('*')
        .eq('user_id', user?.id).gte('date', startOfMonth).order('date', { ascending: false });
      
      const txs = monthTx || [];
      const gastosM = txs.filter((t: any) => t.type === 'expense');
      const ingresosM = txs.filter((t: any) => t.type === 'income');
      const totalGastos = gastosM.reduce((s: number, t: any) => s + t.amount, 0);
      const totalIngresos = ingresosM.reduce((s: number, t: any) => s + t.amount, 0);

      // === COMPARACIÓN CON MES ANTERIOR ===
      if (q.includes('mes pasado') || q.includes('mes anterior') || q.includes('comparar') || q.includes('más que')) {
        const { data: lastMonthTx } = await supabase.from('transactions').select('*')
          .eq('user_id', user?.id).gte('date', startOfLastMonth).lte('date', endOfLastMonth);
        
        const lastGastos = (lastMonthTx || []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
        const diff = totalGastos - lastGastos;
        const emoji = diff > 0 ? '📈' : '📉';
        
        return `Comparación mensual, ${finalName}:\n\n💸 Este mes: $${totalGastos.toLocaleString()}\n💸 Mes pasado: $${lastGastos.toLocaleString()}\n${emoji} Diferencia: ${diff > 0 ? '+' : ''}$${diff.toLocaleString()}\n\n${diff > 0 ? '¡Ojo! Estás gastando más que el mes pasado. 👀' : '¡Bien! Estás gastando menos que el mes anterior. 💪'}`;
      }

      // === EN QUÉ GASTO MÁS / TOP GASTOS ===
      if (q.includes('en qué gasto') || q.includes('en que gasto') || q.includes('más gasto') || q.includes('mas gasto') || q.includes('top')) {
        const catMap = gastosM.reduce((acc: any, t: any) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        }, {});
        
        const sorted = Object.entries(catMap).sort(([,a]: any, [,b]: any) => b - a);
        if (sorted.length === 0) return `No tienes gastos este mes, ${finalName}. ¡Impresionante! 🎉`;
        
        let reply = `Tus categorías con más gasto este mes, ${finalName}:\n\n`;
        sorted.slice(0, 5).forEach(([cat, amt]: any, i: number) => {
          const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
          reply += `${medals[i]} ${cat}: $${amt.toLocaleString()}\n`;
        });
        return reply;
      }

      // === GASTO POR CATEGORÍA ESPECÍFICA ===
      const categories = ['comida', 'transporte', 'sueldo', 'arriendo', 'servicios', 'salud', 'educación', 'entretenimiento', 'ropa', 'tecnología', 'mascotas', 'deudas'];
      const mentionedCat = categories.find(c => q.includes(c));
      if (mentionedCat && (q.includes('cuánto') || q.includes('cuanto') || q.includes('gasté') || q.includes('gaste'))) {
        const catName = mentionedCat.charAt(0).toUpperCase() + mentionedCat.slice(1);
        const catTotal = gastosM.filter((t: any) => t.category.toLowerCase() === mentionedCat).reduce((s: number, t: any) => s + t.amount, 0);
        return `Este mes llevas $${catTotal.toLocaleString()} gastado en ${catName}, ${finalName}. ${catTotal > 0 ? '💸' : '¡Nada! 🎉'}`;
      }

      // === CUÁNTO HE GASTADO ESTE MES ===
      if (q.includes('gastado') || q.includes('gastos') || q.includes('gasto')) {
        return `Este mes llevas $${totalGastos.toLocaleString()} en gastos, ${finalName}. Tienes ${gastosM.length} transacciones de gasto registradas. 📊`;
      }

      // === CUÁNTO HE GANADO ===
      if (q.includes('ganado') || q.includes('ingresos') || q.includes('ingreso') || q.includes('recibido')) {
        return `Este mes has recibido $${totalIngresos.toLocaleString()} en ingresos, ${finalName}. 💰`;
      }

      // === LISTAR ÚLTIMAS TRANSACCIONES ===
      if (q.includes('transacciones') || q.includes('historial') || q.includes('lista')) {
        if (txs.length === 0) return `No tienes transacciones este mes, ${finalName}. 📝`;
        
        let reply = `Tus últimas transacciones, ${finalName}:\n\n`;
        txs.slice(0, 7).forEach((t: any) => {
          const fecha = new Date(t.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
          reply += `${t.type === 'income' ? '💰' : '💸'} ${t.category} — $${t.amount.toLocaleString()} (${fecha})\n`;
        });
        return reply;
      }

      // === BALANCE / RESUMEN / CÓMO ESTOY ===
      return `Tu resumen de este mes, ${finalName}:\n\n💰 Ingresos: $${totalIngresos.toLocaleString()}\n💸 Gastos: $${totalGastos.toLocaleString()}\n📊 Balance: $${(totalIngresos - totalGastos).toLocaleString()}\n\n${totalIngresos > totalGastos ? '¡Vas bien! Estás en positivo. 💪' : 'Ojo, estás gastando más de lo que recibes. 👀'}`;

    } catch (e) {
      return `No pude consultar tus datos ahora, ${finalName}. Intenta de nuevo en un momento. 😅`;
    }
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

    const isIncome = q.includes('gané') || q.includes('gane') || q.includes('recibí') || q.includes('recibi') || q.includes('ingreso') || q.includes('sueldo') || q.includes('me pagaron') || q.includes('me entró') || q.includes('me entro') || q.includes('me entraron') || q.includes('me llegaron') || q.includes('me llego') || q.includes('me lleg') || q.includes('cobré') || q.includes('cobre') || q.includes('nómina') || q.includes('quincena') || q.includes('salario') || q.includes('venta') || q.includes('vendí') || q.includes('vendi');
    const isExpense = q.includes('gasté') || q.includes('gaste') || q.includes('pagué') || q.includes('pague') || q.includes('compré') || q.includes('compre') || q.includes('di') || q.includes('metí') || q.includes('meti') || q.includes('pagar') || q.includes('comprar');
    
    // Si contiene palabras de gasto, priorizar gasto a menos que sea muy claro que es ingreso
    const type: 'income' | 'expense' = (isIncome && !isExpense) ? 'income' : 'expense';

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
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={[styles.modalContent, { backgroundColor: colorsNav.bg }]}
          {...(Platform.OS === 'web' ? { 'data-modal-content': 'true' } as any : {})}
        >
          <View style={[styles.header, { borderBottomColor: colorsNav.border }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.auraIcon, { backgroundColor: colorsNav.accent, overflow: 'hidden' }]}>
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
                        <View style={[styles.miniAvatar, { backgroundColor: colorsNav.accent, overflow: 'hidden' }]}>
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
