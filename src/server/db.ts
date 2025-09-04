// src/server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// avoid creating multiple clients in dev
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof drizzle> };

export const db = globalForDb.__db ?? drizzle(pool);
if (!globalForDb.__db) globalForDb.__db = db;
