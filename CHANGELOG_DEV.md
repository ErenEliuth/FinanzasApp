# 📋 Registro de Cambios y Fallos — FinanzasApp (Sanctuary)

> Este archivo documenta todos los cambios realizados, fallos encontrados y decisiones de diseño.
> **Léelo antes de tocar el código** para evitar repetir errores o perder contexto.
> 
> ### 🛑 REGLA OBLIGATORIA PARA LA IA:
> **Cada que realices un cambio en el código, DEBES:**
> 1. **Subir los cambios a Git** (commit y push).
> 2. **Desplegar la aplicación** (`npm run deploy`).
> 3. **Documentar el cambio** en este archivo.


---

## 🏗️ Arquitectura General

- **Framework**: React Native + Expo (Expo Router)
- **Base de datos**: Supabase (tablas: `transactions`, `debts`)
- **Storage local**: AsyncStorage (categorías, cuentas, tarjetas, notificaciones)
- **Temas**: Light/Dark toggle desde `useAuth()`
- **Navegación**: Tabs con Expo Router (`/(tabs)/`)

### Tabs principales:
| Tab | Archivo | Función |
|-----|---------|---------|
| Inicio | `index.tsx` | Dashboard principal con balance, salud financiera, transacciones |
| Historial | `history.tsx` | Lista completa de transacciones con filtros |
| Añadir | `explore.tsx` | Formulario para agregar ingreso/gasto/ahorro/transferencia |
| Cuentas | `cards.tsx` | Gestión de tarjetas de crédito |
| Perfil | `profile.tsx` | Configuración del usuario |
| Deudas | `debts.tsx` | Gestión de deudas (oculto en tab bar, acceso desde dashboard) |
| Presupuestos | `budgets.tsx` | Presupuestos (oculto en tab bar) |

### Pantallas adicionales:
- `app/goals.tsx` — Metas de ahorro
- `app/index.tsx` — Pantalla de login/splash
- `components/TutorialOverlay.tsx` — Tutorial interactivo para nuevos usuarios

---

## 📅 Historial de Cambios

### 2026-03-29 — Sanctuary: Rendimiento y Fluidez (v25)

**Archivos modificados:**
- `app/(tabs)/index.tsx` — Optimización masiva de renderizado y cálculos internos.
- `CHANGELOG_DEV.md` — Registro de la v25.

**Cambios realizados:**
- ✅ **Memoización Estratégica**: Se implementó `useMemo` para todos los cálculos financieros (Ahorros, Salud, Totales). Esto significa que la app ya no recalcula todo en cada parpadeo, mejorando significativamente la velocidad de respuesta.
- ✅ **Componentes Ligeros**: El componente de progreso circular ahora usa `React.memo`, evitando que se redibuje innecesariamente si sus datos no han cambiado.
- ✅ **Carga Inteligente de Historial**: En la versión de escritorio, se limitó el renderizado inicial de transacciones a las últimas 50. Esto reduce el consumo de memoria y hace que el dashboard cargue de forma instantánea.
- ✅ **Limpieza de Estado**: Eliminados estados redundantes (`useState`) para simplificar el flujo de datos y reducir la huella de memoria de la pantalla principal.

---

### 2026-03-29 — Sanctuary: Anti-Duplicados y Estética (v24)

**Archivos modificados:**
- `app/goals.tsx` — Prevención de clics dobles y eliminación de emoji en botón.
- `app/(tabs)/explore.tsx` — Prevención de transacciones duplicadas al guardar.
- `CHANGELOG_DEV.md` — Registro de la v24.

**Cambios realizados:**
- ✅ **Adiós duplicados**: Se implementó una lógica de bloqueo (`isProcessing`) en los botones de "Crear Meta", "Distribuir" y "Guardar Transacción". Ahora, el botón se deshabilita y muestra un mensaje de "Guardando..." mientras se procesa la solicitud, evitando registros repetidos por clics rápidos.
- ✅ **Estética Limpia**: Se eliminó el emoji "✨" del botón Distribuir en la sección de ahorros a petición del usuario para un look más sobrio.
- ✅ **UX Mejorada**: Añadido feedback visual con el icono de reloj de arena en el botón de guardar movimientos durante el procesamiento.

---

### 2026-03-29 — Sanctuary: Sincronización y Priorización Visual (v23)

**Archivos modificados:**
- `app/goals.tsx` — Sincronización final y visualización de prioridades.
- `CHANGELOG_DEV.md` — Registro de la v23.

**Cambios realizados:**
- ✅ **Base de Datos Sincronizada**: Se habilitó el soporte nativo para prioridades tras la actualización de la tabla en Supabase por parte del usuario.
- ✅ **Badge de Prioridad**: Ahora cada meta muestra su nivel de importancia (Alta, Media, Baja) con un color distintivo en la tarjeta.
- ✅ **Distribución Refinada**: Código simplificado eliminando el "fallback" temporal al crear metas.

---

### 2026-03-29 — Sanctuary: Reversión de Marca y Bug Fix (v22)

**Archivos modificados:**
- `app/goals.tsx` — Título cambiado a "Ahorros" y fix de botón de creación.
- `app/(tabs)/index.tsx` — Volvimos al nombre "Sanctuary" en el header principal.
- `CHANGELOG_DEV.md` — Registro de la v22.

**Cambios realizados:**
- ✅ **Reversión de Marca**: A petición del usuario, se restauró el nombre **"Sanctuary"** en el dashboard principal y **"Ahorros"** en la sección de metas.
- ✅ **Fix de Botón de Metas**: Se corrigió el error donde el botón de "Comenzar a ahorrar" no respondía. El fallo era causado por intentar guardar la prioridad en una columna inexistente en la base de datos.
- ✅ **Robustez de Datos**: Se implementó un "fallback" inteligente. Si la columna `priority` no existe en Supabase, la meta se guarda de todas formas (sin prioridad) en lugar de fallar silenciosamente.

---

### 2026-03-29 — Zenly: Ahorro Inteligente y Validación (v21)

**Archivos modificados:**
- `app/goals.tsx` — Implementación de Prioridades y Distribución Mágica ✨.
- `app/(tabs)/explore.tsx` — Nueva validación de saldo para gastos, ahorros y transferencias.
- `CHANGELOG_DEV.md` — Documentación de la versión v21.

**Cambios realizados:**
- ✅ **Prioridades en Metas**: Al crear una meta, ahora puedes elegir entre prioridad **Baja, Media o Alta**. Esto ayuda a Zenly a entender qué es lo más importante para ti.
- ✅ **Distribución Mágica ✨**: Se añadió un botón de "Distribuir" en la pantalla de metas que reparte automáticamente el **Ahorro Disponible** entre todas tus metas incompletas, dándole más peso a las de mayor prioridad.
- ✅ **Validación de Saldo**: Zenly ahora es más inteligente y no te permitirá registrar un gasto, ahorro o transferencia si la cuenta de origen (ej. Efectivo) no tiene suficiente balance.
- ✅ **Cero Negativos**: Esta lógica previene descuadres financieros al asegurar que siempre tengas fondos antes de mover dinero.

---

### 2026-03-29 — Zenly: Branding Total y Estabilidad (v20)

**Archivos modificados:**
- `package.json` — Fix de `expo-secure-store`.
- `app/(tabs)/index.tsx`, `app/goals.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/explore.tsx` — Estandarización de nombre "Zenly".
- `CHANGELOG_DEV.md` — Sincronización de versiones v18, v19 y v20.

**Cambios realizados:**
- ✅ **Identidad Consolidada**: Se completó la transición de "Sanctuary" a **"Zenly"** en toda la interfaz de usuario, headers, alertas de sistema y comentarios del código.
- ✅ **0 Advertencias**: Se resolvió el conflicto de versiones de `expo-secure-store` ajustándolo a la compatibilidad nativa con Expo SDK 54.
- ✅ **Limpieza Post-IA**: Eliminadas referencias huérfanas al motor de IA Santy para optimizar la legibilidad del código.

---

### 2026-03-29 — Zenly: Esencial y Rápido (v19)

**Archivos modificados:**
- `app/(tabs)/index.tsx`, `app/(tabs)/profile.tsx` — Eliminación selectiva de Aura/Santy IA.
- `constants/Changelog.ts` — Incremento a v19 y actualización de novedades.
- `package.json` — Corrección de versión de `expo-secure-store`.

**Cambios realizados:**
- ✅ **Adiós Santy (IA)**: Se eliminó el motor de IA para que Zenly sea más ligera, privada y se enfoque en la gestión pura de cuentas.
- ✅ **Depuración de Dependencias**: Corregido un "warning" crítico de `expo-secure-store` que era incompatible con Expo SDK 54.
- ✅ **Header Unificado**: Las notificaciones y el modo incógnito (ojo) ahora están juntos arriba para un look más limpio.

---

### 2026-03-28 — Zenly: Estadísticas Visuales (v18)

**Archivos modificados:**
- `app/(tabs)/profile.tsx` — Integración de `LineChart` para historial de 6 meses.
- `constants/Themes.ts` — Refinamiento de temas Lila y Océano.

**Cambios realizados:**
- ✅ **Gráfico de Gastos**: Implementación de un gráfico de líneas que muestra la evolución de los gastos de los últimos 6 meses en el perfil.
- ✅ **Branding Zenly**: Inicio de la transición visual de "Sanctuary" a "Zenly", con colores más suaves y tipografía refinada.
- ✅ **Micro-UX**: Mejora en las transiciones de los modales de seguridad y ahorro.

---

### 2026-03-27 — Sanctuary: Cerebro Seguro (v17)

**Archivos modificados:**
- `supabase/functions/ask-santy/index.ts` — Nueva Edge Function segura para Gemini.
- `components/AuraAI.tsx` — Migración del frontend para usar `supabase.functions.invoke`.
- `app/(tabs)/profile.tsx` — Eliminación definitiva de configuración local de API Key.
- `constants/Changelog.ts` — Salto a la versión **v17**.

**Cambios realizados:**
- ✅ **Seguridad Centralizada**: La API Key de Gemini ya no vive en el dispositivo del usuario ni en el código. Ahora reside de forma segura en los "Secrets" de Supabase.
- ✅ **SDK Actualizado**: Migración a `@google/generative-ai@0.21.0` en el backend para mejor rendimiento con **Gemini 1.5 Flash**.
- ✅ **Optimización de App**: El bundle de la aplicación es más ligero al eliminar dependencias de IA del frontend.
- ✅ **Privacidad Total**: Las peticiones ahora pasan por un servidor seguro, protegiendo las credenciales del desarrollador.

---

### 2026-03-26 — Sanctuary Lock: Privacidad Total (v16)

**Nuevos componentes:**
- `components/SanctuaryLock.tsx` — Pantalla de seguridad con PIN y Biometría.
- `@SantyMascot` — Identidad visual renovada para la IA (Robot 🤖).

**Cambios realizados:**
- ✅ **Cerradura Global**: Se integró un sistema de bloqueo que protege la app al abrirse.
- ✅ **Elección de Seguridad**: El usuario puede activar/desactivar el bloqueo desde el Perfil y elegir entre **PIN de 4 dígitos** o **Biometría (Huella/FaceID)**.
- ✅ **Experiencia Santy**: La IA ahora es "Santy", con un avatar de robot amigable y un tono aún más cercano.

---

### 2026-03-26 — Sanctuary: Cerebro Ejecutivo (v15)

### 2026-03-26 — Sanctuary AI: Más Humana (v14)

### 2026-03-26 — Aura AI: Tu Asesora Financiera (v13)

**Nuevos componentes:**
- `components/AuraAI.tsx` — Corazón de la IA con chat interactivo.
- `components/MagicAuraButton.tsx` — El botón mágico ✨ reutilizable.

**Cambios realizados:**
- ✅ **Omnipresencia Intelectual**: Se añadió el **Botón Mágico ✨** en la esquina superior derecha de **Inicio, Historial, Perfil y Nueva Transacción**.
- ✅ **Aura Advisor**: Implementación de un chat modal con "Aura", quien analiza tu presupuesto y te da consejos en tiempo real (ej: si te alcanza para sushi 🍣 o cómo vas con tus ahorros 💰).
- ✅ **Diseño Premium**: Interfaz tipo burbuja con efectos de *glassmorphism* y animaciones suaves para una experiencia lujosa.

---

### 2026-03-26 — Panel de Diagnóstico de Notificaciones (v12)

### 2026-03-26 — Recordatorio de Retraso al Entrar

**Archivos modificados:**
- `app/_layout.tsx` — Nueva lógica de chequeo `checkMissedReminders` al inicio.
- `constants/Changelog.ts` — Salto a la versión **v11**.

**Cambios realizados:**
- ✅ **Aviso proactivo**: Si el usuario abre la app después de su hora configurada y no recibió el aviso (porque la app estaba cerrada), Sanctuary le mostrará una alerta inmediata con opción de ir directo a "Nuevo Movimiento".
- ✅ **Control de Duplicados**: El aviso solo se muestra una vez al día para no ser intrusivo.
- ✅ **Sincronización**: Utiliza el mismo horario guardado en el Perfil para el chequeo.

---

### 2026-03-26 — Heartbeat de Notificaciones para PWA

**Archivos modificados:**
- `app/_layout.tsx` — Implementación de "latido" cada 30 segundos para chequear la hora de aviso.
- `utils/notifications.ts` — Ajuste de lógica de programación para plataformas web.
- `constants/Changelog.ts` — Salto a la versión **v10**.

**Cambios realizados:**
- ✅ **Monitoreo Activo**: El PWA ahora chequea constantemente la hora del sistema. Si coincide con tu preferencia y la app está abierta (o en segundo plano gestionada por el navegador), disparará el aviso.
- ✅ **Fallback de Navegador**: Se intenta usar la API de Notificaciones estándar del navegador. Si no hay permiso, se muestra una alerta visual dentro de Sanctuary.
- ✅ **Optimización**: El chequeo se detiene si cierras sesión o apagas los recordatorios.

---

### 2026-03-26 — Reloj Propio y Ajuste de Layout

**Archivos modificados:**
- `app/(tabs)/profile.tsx` — Implementación de `ManualTimeModal` y ajuste de `flex` en el item de configuración.
- `constants/Changelog.ts` — Salto a la versión **v9**.

**Cambios realizados:**
- ✅ **Reloj Universal**: Se reemplazó el `DateTimePicker` nativo (que fallaba en algunos navegadores) por un modal interno de Sanctuary para elegir hora y minuto. 100% fiable.
- ✅ **Corrección de TextWrap**: Se limitó el título a una sola línea con elipsis y se dio más espacio a los botones laterales para evitar que la palabra "Recordatorio" se rompa.
- ✅ **UX Refined**: Botones de "Editar Hora" con mejor espaciado y contraste.

---

### 2026-03-26 — Corrección Crítica: Selector de Hora y Nesting UI

**Archivos modificados:**
- `app/(tabs)/profile.tsx` — Separación de acciones en la fila de configuración y corrección de compatibilidad web para el picker.
- `constants/Changelog.ts` — Salto a la versión **v8**.

**Cambios realizados:**
- ✅ **Separación de Eventos**: Corregido un conflicto donde el botón de "Editar Hora" no funcionaba porque el contenedor padre lo bloqueaba.
- ✅ **Compatibilidad PWA**: Ajustado el comportamiento del selector de hora para que se muestre correctamente en navegadores web y dispositivos móviles.
- ✅ **Mejora del Toggle**: El switch de activación ahora es independiente de la edición de hora, evitando confusiones táctiles.

---

### 2026-03-26 — Hora Personalizada para Recordatorios

**Archivos modificados:**
- `app/(tabs)/profile.tsx` — Integración de `DateTimePicker` y lógica de persistencia de hora.
- `constants/Changelog.ts` — Salto a la versión **v7**.

**Cambios realizados:**
- ✅ **Selector de Hora**: Se añadió un botón "Editar Hora" en la configuración de recordatorios del perfil.
- ✅ **Flexibilidad Total**: El usuario ahora puede elegir exactamente a qué hora recibir su aviso diario (ej. 7:00 AM, 9:00 PM, etc.).
- ✅ **Persistencia**: La hora elegida se guarda localmente y se usa para reprogramar la notificación automáticamente.

---

### 2026-03-26 — Prompt de Sugerencia y Mejora de Perfil

**Archivos modificados:**
- `app/(tabs)/index.tsx` — Nueva tarjeta interactiva para activar recordatorios.
- `app/(tabs)/profile.tsx` — Reubicación de la sección de Configuración arriba del Heatmap.
- `constants/Changelog.ts` — Subida a **v6**.

**Cambios realizados:**
- ✅ **Invitación Inteligente**: Si el usuario no tiene recordatorios, aparece una tarjeta elegante en el inicio sugiriendo activarlos. Desaparece al aceptar o rechazar.
- ✅ **UX de Perfil**: Se movió la configuración de notificaciones a la parte superior (antes del calendario) para que sea lo primero que se vea tras la tarjeta de perfil.

---

### 2026-03-26 — Recordatorios Diarios y Notificaciones

**Archivos modificados:**
- `app/(tabs)/profile.tsx` — Nueva sección de "Configuración" con toggle de avisos.
- `utils/notifications.ts` — Lógica de programación de notificaciones locales.
- `constants/Changelog.ts` — Versión **v5** lanzada.

**Cambios realizados:**
- ✅ **Recordatorio Automático**: Implementado un sistema de recordatorio diario a las 8:30 PM.
- ✅ **Toggle en Perfil**: Los usuarios pueden activar o desactivar los avisos directamente desde su perfil con un solo toque.
- ✅ **Integración con Sistema**: La app ahora solicita permisos de notificación de forma elegante al activar el servicio.

---

### 2026-03-26 — Temas Océano (Ocean) y Blanco Puro (Snow)

**Archivos modificados:**
- `constants/Themes.ts` — Incorporación de temas `ocean` y `snow`.
- `utils/auth.tsx` — Ciclo de temas ampliado a 5 opciones.
- `app/(tabs)/profile.tsx` — Actualización del icono de alternancia de tema.
- `constants/Changelog.ts` — Incremento a **v4** para forzar el panel de novedades.

**Cambios realizados:**
- ✅ **Tema Ocean**: Un tono azul cian pálido con acentos Teal. Calma y fluidez absoluta.
- ✅ **Tema Blanco Puro (Snow)**: Restaurado el fondo blanco puro (`#FFFFFF`) con acentos verdes para máxima claridad.
- ✅ **Ciclo de Color**: Se renovó el botón superior del perfil para navegar ahora entre los 5 temas (Nieve, Arena, Noche, Lila, Océano).
- ✅ **Panel Automático**: Al ser versión v4, los usuarios verán el anuncio de estos nuevos temas al abrir la app.

---

### 2026-03-26 — Tema Lila y Ciclo de Apariencia

**Archivos modificados:**
- `constants/Themes.ts` — Ajuste de paletas disponibles (Claro, Oscuro, Lila).
- `utils/auth.tsx` — Actualización del ciclo de cambio de tema (Sol → Luna → Chispas).
- `app/(tabs)/profile.tsx` — Restauración del icono de cambio rápido en el header.

**Cambios realizados:**
- ✅ **Tema Lila (Lavender)**: Añadido un nuevo tema elegante basado en tonos violetas suaves.
- ✅ **Toggle de Tema Mejorado**: El icono en el perfil ahora alterna cíclicamente entre Claro, Oscuro y Lila. Cada tema tiene su propio icono representativo (Sol, Luna y Chispas ✨).
- ✅ **Simplificación UI**: Se eliminó el selector de burbujas para mantener la interfaz limpia y minimalista, volviendo al icono único en la parte superior.

---

### 2026-03-26 — Sistema de Temas Multi-Color

**Archivos modificados:**
- `constants/Themes.ts` — Centralización de paletas de colores.
- `hooks/useThemeColors.ts` — Hook para facilitar el uso de colores en toda la app.
- `utils/auth.tsx` — Soporte para nombres de temas extendidos.
- `app/(tabs)/profile.tsx` — Selector visual de temas en el perfil.
- Múltiples pantallas actualizadas para usar el nuevo sistema centralizado.

**Cambios realizados:**
- ✅ **Centralización de Diseño**: Se eliminaron las definiciones de colores locales en cada pantalla, centralizándolas en un solo lugar. Esto permite añadir nuevos temas en minutos.
- ✅ **Nuevos Temas Premium**:
    - 🌲 **Forest (Naturaleza)**: Un tema oscuro profundo basado en verdes bosque para un descanso visual total.
    - 🍇 **Lavender (Lila)**: Una paleta suave y clara basada en tonos violetas y lavanda, muy elegante.
- ✅ **Selector en Perfil**: Los usuarios ahora pueden cambiar entre 4 temas (Claro, Oscuro, Naturaleza, Lila) desde los ajustes de su perfil con una vista previa de color.

---

### 2026-03-26 — Panel de "Novedades" (What's New)

**Archivos modificados:**
- `app/(tabs)/index.tsx` — Integración del panel de novedades en el dashboard.
- `constants/Changelog.ts` — Nueva base de datos de cambios para el usuario final.

**Cambios realizados:**
- ✅ **Panel Informativo**: Ahora aparece un modal elegante al entrar a la app cuando hay una actualización importante.
- ✅ **Memoria de Lectura**: El panel usa `AsyncStorage` para aparecer **solo una vez** por cada versión o actualización realizada.
- ✅ **Resumen de Mejoras**: Informa al usuario sobre los arreglos en el selector de fecha, la lógica de gastos fijos y otras optimizaciones.

---

### 2026-03-26 — Modal de Confirmación Personalizado para Gastos Fijos

**Archivos modificados:**
- `app/(tabs)/debts.tsx` — Creación de modal de selección de mes de inicio.

**Cambios realizados:**
- ✅ **Interfaz de Selección Mejorada**: Reemplazado el `Alert.alert` y `window.confirm` por un modal personalizado dentro de la app.
- ✅ **Botones Personalizados**: Ahora se muestran exactamente las opciones **"Este Mes"** y **"Próximo Mes"**, tal como solicitó el usuario.
- ✅ **Consistencia Multiplataforma**: El nuevo modal garantiza que la experiencia sea idéntica en Web, iOS y Android, evitando las limitaciones de los diálogos nativos del sistema.

---

### 2026-03-26 — Inteligencia Artificial Real (Google Gemini 1.5 Flash)

**Archivos modificados:**
- `components/AuraAI.tsx` — Reemplazo total del motor de NLP heurístico por SDK oficial.

**Cambios realizados:**
- ✅ **Cerebro Inteligente**: Santy ya no usa reglas "if/else" para adivinar intenciones. Ahora usa el supermodelo **Gemini 1.5 Flash** de Google.
- ✅ **Inyección de Contexto en Tiempo Real**: Gemini recibe tras bambalinas los saldos actualizados, gastos procesados e historial del mes para responder preguntas con datos precisos.
- ✅ **Respuesta Funcional Estructurada**: La IA es obligada mediante *Prompt Engineering* avanzado a devolver sus decisiones en formato JSON crudo, permitiendo que la App ejecute transacciones con cero clics.
- ✅ **Comprensión de Lenguaje Natural**: "Me comí una empanada de 5 lucas", "Tirame un consejo" o "Ayer me gasté 50 barras" son interpretados perfectamente y categorizados con la respectiva conversión numérica.

---

### 2026-03-26 — Lógica Avanzada de Gastos Fijos y Reinicio Mensual

**Archivos modificados:**
- `app/(tabs)/debts.tsx` — Implementación de reinicio mensual y selección por día para gastos fijos.

**Cambios realizados:**
- ✅ **Diferenciación de Fecha**: Categoría "Deudas" conserva selector de fecha completo; "Gastos Fijos" ahora solo permite elegir el día del mes (1-31).
- ✅ **Reinicio Mensual Automático**: Al cargar la pantalla, los gastos fijos de meses anteriores se actualizan al mes actual y vuelven a estado "Pendiente" (`paid: 0`).
- ✅ **Lógica de Inicio Diferido**: Al crear un gasto fijo con un día anterior al actual, la app pregunta si inicia este mes o el próximo.
    - Si inicia el próximo mes: Se marca como "Pagado" automáticamente para el mes actual sin generar transacciones ni restar dinero.
- ✅ **Soporte Web/Móvil**: Sincronización de prompts nativos y de navegador para la nueva lógica.

---

### 2026-03-26 — Fix de Fecha Límite (Mobile Web) y Regla de Despliegue

**Archivos modificados:**
- `app/(tabs)/debts.tsx` — Mejora del selector de fecha usando HTML5 nativo en Web.
- `CHANGELOG_DEV.md` — Adición de regla obligatoria de Git + Deploy.

**Cambios realizados:**
- ✅ **Soporte Web/Móvil Real**: Forzado el uso de `<input type="date">` mediante `React.createElement` para asegurar que iOS Safari y Chrome Android muestren el calendario nativo.
- ✅ **Fix Android**: Movido `DateTimePicker` dentro del Modal para evitar problemas de visibilidad.
- ✅ **Regla de Proceso**: Añadida instrucción obligatoria para que la IA realice commit y deploy tras cada cambio.

---

### 2026-03-24 — Integración "Todo en una Ventana" para PC / Desktop

**Archivos modificados:**
- `app/(tabs)/index.tsx` — Dashboard rediseñado para 3 columnas en PC (Resumen, Cuentas, Historial)
- `app/(tabs)/_layout.tsx` — Tab bar oculto en PC, navegación integrada en Header de Inicio

**Cambios realizados:**
- ✅ **Layout de 3 columnas (PC)**:
    - Columna 1: Resumen financiero, Salud, Ahorros/Deudas (redirecciones)
    - Columna 2: **Mis Cuentas** (Tarjetas/Cuentas con deuda actual)
    - Columna 3: **Historial Completo** de transacciones con scroll interno
- ✅ **Navegación Desktop**: 
    - Tab bar inferior oculto en pantallas > 768px
    - Botones de "Nuevo Movimiento" y "Perfil" añadidos al Header derecho
- ✅ **Lógica de carga**: `loadData` ahora procesa balances de tarjetas y transacciones completas para el dashboard en PC
- ✅ **Redirecciones conservadas**: Ahorros (`/goals`), Deudas (`/debts`) y Perfil (`/profile`) siguen cargando en páginas independientes como se solicitó
- ✅ **Responsividad**: En celulares (`width <= 768`), la navegación por tabs y el dashboard simplificado se mantienen intactos

---

### 2026-03-24 — Rediseño Visual "Sanctuary"

**Archivos modificados:**
- `app/(tabs)/index.tsx` — Rediseño completo del estilo visual
- `app/(tabs)/_layout.tsx` — Colores del tab bar actualizados

**Cambios realizados:**
- ✅ Fondo cambiado de `#F8FAFF` (azulado) a `#FFF8F0` (crema cálido)
- ✅ Tarjeta de balance: de `#1E293B` (dark slate) a `#2D5A3D` (verde bosque)
- ✅ Color de acento: de `#6366F1` (morado indigo) a `#4A7C59` (verde Sanctuary)
- ✅ Header: Logo "Sanctuary" con ícono de escudo reemplaza el saludo + avatar
- ✅ Cards de Ahorros/Deudas: estilo minimalista con iconos en círculos de color
- ✅ Sección "Salud Financiera": círculo de progreso SVG (usa `react-native-svg`)
- ✅ Transacciones: iconos categorizados por color (azul=transferencia, naranja=comida, etc.)
- ✅ Formato de fecha en transacciones: "HOY, 10:45 AM" en vez de fecha larga
- ✅ Badge de % en tarjeta de balance (ej: "+12.5% este mes")
- ✅ Tab bar: FAB verde, colores cálidos, bordes crema
- ✅ Historial: rediseño completo con iconos Sanctuary y resumen minimalista
- ✅ Cuentas: rediseño de tarjetas de crédito con estética Sanctuary y modales actualizados
- ✅ Perfil: rediseño completo con heatmap Sanctuary, estadísticas de gastos y nuevo estilo de cards
- ✅ Tema dark actualizado a paleta cálida oscura (`#1A1A2E`)

**Mecánicas conservadas (NO tocar):**
- Lógica de cálculo de Dinero Activo, Dinero Real, Salud Financiera
- Modal de desglose de cuentas (breakdownVisible)
- Modal de notificaciones con "Marcar Leídas"
- Cálculo de deudas incluyendo tarjetas de crédito con saldo negativo
- Lógica de notificaciones urgentes (deudas a 3 días / vencidas hasta 7 días)
- Toggle de ocultar montos (isHidden / eye icon)
- Toggle de tema dark/light
- Sección expandible de Balance Real

**Dependencias usadas:**
- `react-native-svg` (ya estaba instalado) — para CircularProgress

---

### 2026-03-23 — Rediseño anterior de pantalla principal
- Se había hecho un rediseño previo (conversación `f235c8a1`)
- Este fue reemplazado por el diseño Sanctuary del 2026-03-24

### 2026-03-23 — Rediseño Deudas y Gastos Fijos
- Timeline view para deudas
- Summary card con progress bar
- Circular progress para gastos fijos
- Modal para agregar nuevas deudas

### 2026-03-20 — Tutorial Interactivo
- `TutorialOverlay.tsx` implementado
- Guía paso a paso: ingreso → transferencia → deuda → ahorro → limpieza

### 2026-03-19 — Formato de montos
- Input de cantidades formatea con separadores de miles (ej: "21.000")
- Usa `Intl.NumberFormat('es-CO')`

### 2026-03-18 — Eliminación de mascota
- Sistema de mascota completamente removido del perfil
- Perfil ahora es minimalista

### 2026-03-17 — Fix de íconos web
- Problema: íconos no se mostraban en GitHub Pages
- Solución: script `fix-web-fonts.js` para cargar fonts de íconos correctamente

---

## 🐛 Fallos Conocidos

| # | Descripción | Estado | Archivo |
|---|-------------|--------|---------|
| 1 | `expo-secure-store` versión incompatible (warning al iniciar) | ✅ Corregido | `package.json` |
| 2 | En web, `Keyboard.dismiss` no aplica (se usa condicional `Platform.OS`) | ✅ Manejado | `explore.tsx` |
| 3 | Alerts no funcionan en web (se usa `window.confirm` como fallback) | ✅ Manejado | varios |

---

## 📌 Decisiones de Diseño Importantes

1. **Dinero Activo** = suma de todas las cuentas EXCEPTO tarjetas de crédito y cuenta "Ahorro"
2. **Deuda Total** = deudas pendientes + saldo negativo de tarjetas de crédito
3. **Dinero Real** = (Dinero Activo + Ahorro) - Deuda Total
4. **Salud Financiera** = porcentaje de (Dinero Real / (Dinero Activo + Ahorro))
5. **Transferencias** se guardan como 2 transacciones: un expense (origen) y un income (destino), ambos con categoría "Transferencia"
6. **Ahorros** se guardan como `type: 'expense'` con `category: 'Ahorro'` y `account: 'Ahorro'`
7. **Sugerencia de ahorro inteligente**: al guardar un ingreso, se analiza ratio deuda/ingreso y superávit para sugerir % de ahorro (5%, 10%, 15%, 20%)

---

## 🎨 Paleta de Colores — Sanctuary Theme

### Light Mode
| Uso | Color | Hex |
|-----|-------|-----|
| Fondo | Crema | `#FFF8F0` |
| Cards | Blanco | `#FFFFFF` |
| Texto principal | Negro suave | `#2D2D2D` |
| Texto secundario | Gris cálido | `#8B8680` |
| Bordes | Crema oscuro | `#F0E8DC` |
| Acento / Verde | Verde bosque | `#4A7C59` |
| Card balance | Verde oscuro | `#2D5A3D` |
| Crema fondos | Arena | `#F5EDE0` |
| Error / Deudas | Rojo | `#EF4444` |
| Ahorro | Morado | `#8B5CF6` |
| Ingreso badge | Azul | `#3B82F6` |
| Warning | Ámbar | `#F59E0B` |

### Dark Mode
| Uso | Color | Hex |
|-----|-------|-----|
| Fondo | Azul oscuro | `#1A1A2E` |
| Cards | Morado oscuro | `#25253D` |
| Texto | Crema claro | `#F5F0E8` |
| Subtexto | Oliva | `#A09B8C` |
| Bordes | Gris azulado | `#3A3A52` |
