import { drizzle } from "drizzle-orm/bun-sqlite"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export const defaultDbPath = join(homedir(), ".config/my-cli/db.sqlite")

export function createDb(dbPath: string = defaultDbPath): DrizzleDb {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true })
  const db = drizzle({ connection: { source: dbPath } })
  db.$client.exec("PRAGMA journal_mode = WAL;")
  db.$client.exec("PRAGMA foreign_keys = ON;")
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id text PRIMARY KEY,
      directory text NOT NULL,
      title text,
      model text,
      time_created integer NOT NULL,
      time_updated integer NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message (
      id text PRIMARY KEY,
      session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      role text NOT NULL,
      content text NOT NULL,
      time_created integer NOT NULL,
      time_updated integer NOT NULL
    );
    CREATE INDEX IF NOT EXISTS message_session_created_idx
      ON message(session_id, time_created);
  `)
  return db
}

export type DrizzleDb = ReturnType<typeof drizzle>
