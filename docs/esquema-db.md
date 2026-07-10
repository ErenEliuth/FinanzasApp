# Esquema de Base de Datos

La aplicación utiliza un enfoque híbrido: **SQLite** en el dispositivo móvil para datos transaccionales, y **Supabase** en la nube para configuraciones de usuario y sincronización entre dispositivos.

---

## 🔗 Relaciones con el Cerebro
* Ver la estructura y flujo del sistema en [[arquitectura]].
* Ver la lógica del flujo de datos en [[flujos]].

---

## 📱 Base de Datos Local (SQLite)
Definida en [database.ts](file:///c:/Users/Admin/OneDrive/Escritorio/AppMobile/utils/database.ts). Utiliza la versión del esquema **7** (`PRAGMA user_version = 7`).

### 1. Tabla: `users`
Guarda la información básica de usuarios locales.
* `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
* `name` (TEXT, NOT NULL)
* `email` (TEXT, NOT NULL, UNIQUE)
* `password` (TEXT, NOT NULL)
* `created_at` (TEXT, NOT NULL)

### 2. Tabla: `transactions`
Registra los ingresos y gastos financieros.
* `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
* `user_id` (INTEGER, NOT NULL, DEFAULT 0)
* `type` (TEXT, NOT NULL) — Valores: `'income'` | `'expense'`
* `amount` (REAL, NOT NULL)
* `description` (TEXT)
* `category` (TEXT)
* `date` (TEXT, NOT NULL)

### 3. Tabla: `debts`
Controla deudas pendientes y préstamos.
* `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
* `user_id` (INTEGER, NOT NULL, DEFAULT 0)
* `client` (TEXT, NOT NULL)
* `value` (REAL, NOT NULL)
* `paid` (REAL, NOT NULL, DEFAULT 0)
* `due_date` (TEXT, NOT NULL)
* `created_date` (TEXT, NOT NULL)
* `debt_type` (TEXT, NOT NULL, DEFAULT `'debt'`) — Valores: `'debt'` (deuda) | `'fixed'` (gasto/ingreso fijo)

### 4. Tabla: `goals`
Almacena las metas financieras de ahorro.
* `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
* `user_id` (INTEGER, NOT NULL, DEFAULT 0)
* `name` (TEXT, NOT NULL)
* `target_amount` (REAL, NOT NULL)
* `current_amount` (REAL, NOT NULL, DEFAULT 0)
* `image_uri` (TEXT, NULLABLE)
* `created_at` (TEXT, NOT NULL)

### 5. Tabla: `saving_challenges`
Controla los retos de ahorro (como el reto de las 52 semanas, etc.).
* `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
* `user_id` (INTEGER, NOT NULL, DEFAULT 0)
* `name` (TEXT, NOT NULL)
* `target_amount` (REAL, NOT NULL)
* `current_amount` (REAL, NOT NULL, DEFAULT 0)
* `start_date` (TEXT, NOT NULL)
* `end_date` (TEXT, NOT NULL)
* `daily_amounts` (TEXT, NOT NULL) — Array JSON de montos a pagar.
* `completed_indices` (TEXT, NOT NULL, DEFAULT `'[]'`) — Array JSON con índices completados.
* `current_streak` (INTEGER, NOT NULL, DEFAULT 0)
* `last_payment_date` (TEXT, NULLABLE)
* `created_at` (TEXT, NOT NULL)

---

## ☁️ Base de Datos Remota (Supabase)

### Tabla: `user_configs`
Almacena las preferencias del usuario sincronizadas en la nube.
* `user_id` (UUID, PRIMARY KEY, References auth.users.id)
* `data` (JSONB) — Estructura del JSON de configuración:
  ```json
  {
    "name": "Nombre Usuario",
    "accounts": [],
    "categories": [],
    "cards": [],
    "budget_period": "mensual",
    "smart_savings": "true",
    "theme": "light",
    "currency": "COP",
    "hidden_mode": false,
    "reminders": {},
    "tutorial_seen": true,
    "lock": {},
    "invest": {
      "divs": null,
      "sync": null,
      "perf": false,
      "alloc": false,
      "watchlist": [],
      "hidden": []
    },
    "notifs_dismissed": [],
    "reminder_prompt_dismissed": false,
    "onboarding_done": true,
    "changelog_seen": "",
    "goals_interest": {},
    "category_thresholds": {},
    "updated_at": "ISOString"
  }
  ```
* `updated_at` (TIMESTAMP WITH TIME ZONE)
