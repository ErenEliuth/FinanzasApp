# Guía de Secciones de la Aplicación

Este documento detalla todas las pantallas, pestañas y secciones de **FinanzasApp**, especificando qué hace cada una y en qué archivos están implementadas.

---

## 🔗 Relaciones con el Cerebro
* Volver a la [[arquitectura]] global.
* Ver las tablas asociadas en [[esquema-db]].

---

## 🗂️ 1. Pantallas Principales (Menu Inferior - Pestañas)
Ubicadas dentro de la carpeta [app/(tabs)](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/).

### 🏠 Inicio (Dashboard)
* **Archivo:** [app/(tabs)/index.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/index.tsx)
* **Función:** Es la pantalla de bienvenida y el panel principal del usuario.
* **Características:**
  * Muestra el saldo neto total disponible.
  * Resumen del mes actual (Total de Ingresos vs. Gastos).
  * Lista de transacciones recientes.
  * Accesos rápidos para agregar ingresos o gastos de forma ágil.
  * Filtros de rango de fechas rápidas.

### 💳 Tarjetas (Cards)
* **Archivo:** [app/(tabs)/cards.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/cards.tsx)
* **Función:** Administración de tarjetas de crédito y débito.
* **Características:**
  * Registro visual de tarjetas con colores personalizados.
  * Control del cupo disponible, cupo usado y fecha de corte/pago.
  * Permite ver la lista de consumos asociados específicamente a cada tarjeta.

### 📊 Historial (History)
* **Archivo:** [app/(tabs)/history.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/history.tsx)
* **Función:** Historial completo y detallado de movimientos.
* **Características:**
  * Lista cronológica de todas las transacciones financieras.
  * Buscador de transacciones por descripción.
  * Filtrado avanzado por categoría, tipo (ingreso/gasto) y fecha.
  * Permite editar o eliminar movimientos antiguos directamente.

### 📈 Inversiones (Invest)
* **Archivo:** [app/(tabs)/invest.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/invest.tsx)
* **Función:** Control de portafolios y seguimiento del mercado.
* **Características:**
  * Watchlist (lista de seguimiento) de acciones o activos de interés.
  * Registro de compras y ventas de acciones.
  * Cálculo de rendimiento (ganancias/pérdidas) en tiempo real con precios actualizados.
  * Integración con dividendos recibidos.

### 🤝 Préstamos y Deudas (Debts & Loans)
* **Archivos:** 
  * [app/(tabs)/debts.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/debts.tsx) (Deudas generales y gastos fijos)
  * [app/(tabs)/loans.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/loans.tsx) (Préstamos a terceros o recibidos)
* **Función:** Controlar a quién le debes dinero y quién te debe a ti.
* **Características:**
  * Registro del monto total, fecha límite de pago y abonos realizados.
  * Barra de progreso visual para saber qué porcentaje de la deuda se ha saldado.
  * Clasificación entre deudas fijas o recurrentes.

### ⚙️ Perfil y Ajustes (Profile)
* **Archivo:** [app/(tabs)/profile.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/(tabs)/profile.tsx)
* **Función:** Gestión de la cuenta, personalización y agenda.
* **Características:**
  * **Agenda Financiera (Heatmap):** Un calendario interactivo estilo GitHub que pinta los días con base en la cantidad de gastos o vencimientos pendientes.
  * **Personalizador de Temas:** Selector visual con múltiples combinaciones de color (lavanda, esmeralda, cereza, etc.) y modo claro/oscuro.
  * **Ajustes:** Cambiar tipo de moneda principal (con conversión automática de tasas de cambio), habilitar ahorro inteligente, y notificaciones.
  * Edición del perfil del usuario (nombre, avatar).

---

## 📁 2. Pantallas Adicionales y Flujos Auxiliares
Ubicadas en la raíz de la carpeta [app](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/).

### 🎯 Metas de Ahorro (Goals)
* **Archivo:** [app/goals.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/goals.tsx)
* **Función:** Crear y monitorear objetivos de ahorro a mediano/largo plazo (ej. "Comprar un carro").
* **Características:**
  * Permite añadir imágenes para personalizar la meta.
  * Barra de progreso interactiva según el dinero asignado.
  * Simulación de plazos y aportes recurrentes necesarios.

### 🐷 Presupuestos por Categoría (Budgets)
* **Archivo:** [app/budgets.tsx](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/app/budgets.tsx)
* **Función:** Establecer topes máximos de gasto mensual por cada categoría (Comida, Transporte, Entretenimiento, etc.).
* **Características:**
  * Alertas visuales (cambio a color rojo) cuando el gasto actual de una categoría se aproxima o supera el presupuesto límite.

### 🏁 Flujo de Entrada (Auth & Onboarding)
* **`onboarding.tsx`**: Introducción visual de la app para nuevos usuarios.
* **`login.tsx`** y **`register.tsx`**: Registro e inicio de sesión.
* **`currency-setup.tsx`**: Pantalla inicial obligatoria para elegir la moneda por defecto al crear la cuenta.
