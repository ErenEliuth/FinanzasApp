# 📋 Registro de Cambios y Fallos — FinanzasApp (Sanctuary)

> Este archivo documenta todos los cambios realizados, fallos encontrados y decisiones de diseño.
> **Léelo antes de tocar el código** para evitar repetir errores o perder contexto.

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
| 1 | `expo-secure-store` versión incompatible (warning al iniciar) | ⚠️ Pendiente | `package.json` |
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
