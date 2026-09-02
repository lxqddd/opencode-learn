import { describe, expect, it } from "bun:test"
import { createDb } from "../src/db/client"
import { migrate } from "../src/db/migrate"

const tableNames = (db: ReturnType<typeof createDb>): string[] =>
  (
    db.$client
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((t) => t.name)

describe("migrate", () => {
  it("creates tables on a fresh db and records versions", async () => {
    const db = createDb(":memory:")
    const applied = await migrate(db)
    expect(applied).toBe(2)
    const tables = tableNames(db)
    expect(tables).toContain("session")
    expect(tables).toContain("message")
    expect(tables).toContain("schema_migrations")
    const rows = db.$client.query("SELECT version, name FROM schema_migrations").all() as Array<{
      version: number
      name: string
    }>
    expect(rows.map((r) => r.version)).toEqual([1, 2])
    expect(rows[0]?.name).toBe("init-session-message")
    expect(rows[1]?.name).toBe("add-tool-message-fields")
  })

  it("is idempotent: second run applies nothing", async () => {
    const db = createDb(":memory:")
    await migrate(db)
    const again = await migrate(db)
    expect(again).toBe(0)
  })

  it("upgrades an M2-era db with message table but no tool columns", async () => {
    const db = createDb(":memory:")
    db.$client.exec(`CREATE TABLE session (id text PRIMARY KEY, directory text NOT NULL, title text, model text, time_created integer NOT NULL, time_updated integer NOT NULL)`)
    db.$client.exec(`CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, role text NOT NULL, content text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL)`)
    const applied = await migrate(db)
    expect(applied).toBe(2)
    const cols = db.$client.query("PRAGMA table_info(message)").all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toContain("tool_calls")
    expect(cols.map((c) => c.name)).toContain("tool_call_id")
  })
})
