// src/server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// 👇 import your tables (adjust the path if yours differs)
import * as schema from "@/drizzle/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// avoid creating multiple clients in dev
const globalForDb = globalThis as unknown as {
  __db?: ReturnType<typeof drizzle<typeof schema>>;
};

export const db =
  globalForDb.__db ?? drizzle(pool, { schema }); // 👈 pass schema here

if (!globalForDb.__db) globalForDb.__db = db;

// (optional) convenient re-export
export { schema };
