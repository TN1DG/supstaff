import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Neon's serverless driver needs a WebSocket implementation for pooled
// (transaction-capable) connections. Node 22+ has a global one, but wiring
// `ws` explicitly keeps behaviour identical across local + Vercel runtimes.
if (!neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws;
}

export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
/** Accepts either the root db handle or an open transaction. */
export type DbOrTx = Database | Transaction;

type Db = Database;

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema, casing: "snake_case" });
}

// Plain module-level lazy singleton — never wrap in a Proxy (breaks Auth.js
// adapter introspection and produces silent hangs).
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}

export { schema };
