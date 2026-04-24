import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { useTutorial } from './TutorialContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const TUTORIAL_CONTENT = {
  welcome: {
    emoji: '👋',
    title: '¡Bienvenida a Sanctuary!',
    desc: 'Tu refugio financiero personal. Aquí aprenderás a tomar el control total de tu dinero de una forma sencilla y amigable.',
    example: 'Imagina tener una visión clara de cada peso que entra y sale.',
    action: 'Presiona "Siguiente" para comenzar tu viaje.',
  },
  accounts: {
    emoji: '🏦',
    title: '1. Configura tus Cuentas',
    desc: 'El primer paso es registrar dónde tienes tu dinero: efectivo, bancos o billeteras digitales.',
    example: 'Ejemplo: "Bancolombia: $1.000.000" o "Efectivo: $50.000".',
    action: 'En la pestaña "Explorar", puedes añadir todas tus cuentas.',
  },
  fixed_expenses: {
    emoji: '📝',
    title: '2. Gastos Fijos y Deudas',
    desc: 'No olvides tus compromisos. Registra arriendos, servicios o cuotas de créditos para saber cuánto tienes comprometido.',
    example: 'Ejemplo: "Arriendo: $800.000" (se repite cada mes).',
    action: 'Usa el apartado de "Deudas" para llevar este control.',
  },
  savings: {
    emoji: '🎯',
    title: '3. Metas de Ahorro',
    desc: 'Ahorrar es más fácil cuando tienes un objetivo. Define para qué estás guardando dinero.',
    example: 'Ejemplo: "Viaje a la playa" o "Fondo de Emergencia".',
    action: 'Crea tu primera meta en la sección de "Metas".',
  },
  movements: {
    emoji: '🔍',
    title: '4. Explora tus Movimientos',
    desc: 'Revisa tu historial para entender tus hábitos. Puedes editar errores o borrar lo que no necesites.',
    example: 'Desliza una transacción a la izquierda para borrarla.',
    action: 'Mira el detalle de cada movimiento para más info.',
  },
  cards: {
    emoji: '💳',
    title: '5. Tarjetas de Crédito',
    desc: 'Controla el uso de tus tarjetas, sus fechas de corte y los pagos pendientes para evitar intereses.',
    example: 'Añade tu tarjeta "Visa" y define su cupo total.',
    action: 'Gestiona tus plásticos en la sección dedicada.',
  },
  profile: {
    emoji: '🎨',
    title: '6. Personaliza tu Perfil',
    desc: 'Haz que la app sea tuya. Cambia los colores, el tema (claro/oscuro) y la moneda de visualización.',
    example: 'Prueba el tema "Lavender" o "Nature" para un look fresco.',
    action: 'Ve a "Perfil" para ver todos los ajustes.',
  },
  stats: {
    emoji: '📊',
    title: '7. Reportes y Estadísticas',
    desc: 'Visualiza tu progreso con gráficos claros. Entiende en qué categoría gastas más cada mes.',
    example: 'Mira el gráfico de torta para ver tu porcentaje de gasto en "Comida".',
    action: 'Revisa tus resúmenes semanales y mensuales.',
  },
  advice: {
    emoji: '💡',
    title: '8. Biblioteca de Consejos',
    desc: 'Recibe sugerencias inteligentes basadas en tu comportamiento financiero real.',
    example: '"Has gastado un 10% más en ocio este mes, ¡cuidado!"',
    action: 'Lee los consejos diarios en el inicio.',
  },
  security: {
    emoji: '👁️',
    title: '9. Seguridad y Privacidad',
    desc: 'Protege tus datos. Usa el modo oculto cuando estés en lugares públicos.',
    example: 'Toca el ícono del ojo para censurar tus saldos.',
    action: '¡Pruébalo ahora en el panel principal!',
  },
  wealth: {
    emoji: '📈',
    title: '10. Salud y Patrimonio',
    desc: 'Calculamos tu salud financiera restando tus deudas de tus activos. ¡Mira cómo crece tu patrimonio!',
    example: 'Tus cuentas menos tus deudas = Tu Valor Neto.',
    action: 'Observa tu indicador de salud en el resumen.',
  },
  finish: {
    emoji: '✨',
    title: '¡Todo listo!',
    desc: 'Ya conoces lo básico para dominar tus finanzas con Sanctuary. ¡El camino a la libertad financiera empieza hoy!',
    example: 'Recuerda: la constancia es la clave del éxito.',
    action: 'Presiona "Finalizar" para empezar a usar la app.',
  },
};

export const InteractiveTutorial = () => {
  const { step, isTutorialMode, nextStep, prevStep, finishTutorial } = useTutorial();
  const colors = useThemeColors();

  if (!isTutorialMode || step === 'off') return null;

  const content = TUTORIAL_CONTENT[step];
  if (!content) return null;

  const isFirst = step === 'welcome';
  const isLast = step === 'finish';

  return (
    <Modal transparent animationType="fade" visible={isTutorialMode}>
      <View style={styles.overlay}>
        {Platform.OS !== 'web' ? (
          <BlurView intensity={80} tint={colors.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />
        )}

        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={styles.emoji}>{content.emoji}</Text>
            <TouchableOpacity onPress={finishTutorial} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{content.title}</Text>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>{content.desc}</Text>

          <View style={[styles.exampleBox, { backgroundColor: colors.isDark ? '#1E293B' : '#F1F5F9' }]}>
            <Text style={[styles.exampleTitle, { color: colors.primary }]}>💡 Ejemplo Práctico:</Text>
            <Text style={[styles.exampleText, { color: colors.text }]}>{content.example}</Text>
          </View>

          <View style={styles.actionBox}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>{content.action}</Text>
          </View>

          <View style={styles.footer}>
            {!isFirst && (
              <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                <Text style={[styles.backText, { color: colors.textSecondary }]}>Anterior</Text>
              </TouchableOpacity>
            )}
            
            <View style={{ flex: 1 }} />

            <TouchableOpacity 
              onPress={isLast ? finishTutorial : nextStep} 
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.nextText}>{isLast ? '¡Empezar!' : 'Siguiente'}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          </View>

          <View style={styles.progressRow}>
            {Object.keys(TUTORIAL_CONTENT).map((s, idx) => (
              <View 
                key={s} 
                style={[
                  styles.progressDot, 
                  { backgroundColor: s === step ? colors.primary : (colors.isDark ? '#334155' : '#E2E8F0') }
                ]} 
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 32,
    padding: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 50,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  desc: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  exampleBox: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  exampleText: {
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  actionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 18,
  },
  nextText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
