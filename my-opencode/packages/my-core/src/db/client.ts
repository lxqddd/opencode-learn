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
  return db
}

export type DrizzleDb = ReturnType<typeof drizzle>
