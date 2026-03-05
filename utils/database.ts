import { type SQLiteDatabase } from 'expo-sqlite';

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 5;

  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = result?.user_version ?? 0;

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentDbVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        category TEXT,
        date TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL DEFAULT 0,
        client TEXT NOT NULL,
        value REAL NOT NULL,
        paid REAL NOT NULL DEFAULT 0,
        due_date TEXT NOT NULL,
        created_date TEXT NOT NULL,
        debt_type TEXT NOT NULL DEFAULT 'debt'
      );
    `);
    currentDbVersion = 1;
  }

  if (currentDbVersion === 1) {
    // Migración v1→v2: create debts table if not exists
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS debts (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL DEFAULT 0,
        client TEXT NOT NULL,
        value REAL NOT NULL,
        paid REAL NOT NULL DEFAULT 0,
        due_date TEXT NOT NULL,
        created_date TEXT NOT NULL,
        debt_type TEXT NOT NULL DEFAULT 'debt'
      );
    `);
    currentDbVersion = 2;
  }

  if (currentDbVersion === 2) {
    // Migración v2→v3: agregar debt_type a debts
    try {
      await db.execAsync(`ALTER TABLE debts ADD COLUMN debt_type TEXT NOT NULL DEFAULT 'debt';`);
    } catch (_) {
      // La columna puede que ya exista
    }
    currentDbVersion = 3;
  }

  if (currentDbVersion === 3) {
    // Migración v3→v4: agregar tabla users + columna user_id a tablas existentes
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    try {
      await db.execAsync(`ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;`);
    } catch (_) { }

    try {
      await db.execAsync(`ALTER TABLE debts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;`);
    } catch (_) { }

    currentDbVersion = 4;
  }

  if (currentDbVersion === 4) {
    // Migración v4→v5: crear tabla de metas (goals)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        current_amount REAL NOT NULL DEFAULT 0,
        image_uri TEXT,
        created_at TEXT NOT NULL
      );
    `);
    currentDbVersion = 5;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
}

export interface Debt {
  id: number;
  user_id: number;
  client: string;
  value: number;
  paid: number;
  due_date: string;
  created_date: string;
  debt_type: 'debt' | 'fixed';
}

export interface Goal {
  id: number;
  user_id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  image_uri: string | null;
  created_at: string;
}
