import type { DrizzleDb } from "./client"
import { MessageTable, SessionTable } from "./schema"

export interface Migration {
  version: number
  name: string
  statements: string[]
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "init-session-message",
    statements: [
      `CREATE TABLE IF NOT EXISTS session (
        id text PRIMARY KEY,
        directory text NOT NULL,
        title text,
        model text,
        time_created integer NOT NULL,
        time_updated integer NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS message (
        id text PRIMARY KEY,
        session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE,
        role text NOT NULL,
        content text NOT NULL,
        time_created integer NOT NULL,
        time_updated integer NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS message_session_created_idx
        ON message(session_id, time_created)`,
    ],
  },
]

async function appliedVersions(db: DrizzleDb): Promise<Set<number>> {
  db.$client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at integer NOT NULL
    )
  `)
  const rows = db.$client.query("SELECT version FROM schema_migrations").all() as Array<{ version: number }>
  return new Set(rows.map((r) => r.version))
}

export async function migrate(db: DrizzleDb): Promise<number> {
  const applied = await appliedVersions(db)
  let count = 0
  for (const m of migrations) {
    if (applied.has(m.version)) continue
    for (const statement of m.statements) db.$client.exec(statement)
    db.$client
      .query("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
      .run(m.version, m.name, Date.now())
    count++
  }
  return count
}
