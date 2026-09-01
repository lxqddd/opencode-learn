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
    expect(applied).toBe(1)
    const tables = tableNames(db)
    expect(tables).toContain("session")
    expect(tables).toContain("message")
    expect(tables).toContain("schema_migrations")
    const rows = db.$client.query("SELECT version, name FROM schema_migrations").all() as Array<{
      version: number
      name: string
    }>
    expect(rows.length).toBe(1)
    expect(rows[0]?.version).toBe(1)
    expect(rows[0]?.name).toBe("init-session-message")
  })

  it("is idempotent: second run applies nothing", async () => {
    const db = createDb(":memory:")
    await migrate(db)
    const again = await migrate(db)
    expect(again).toBe(0)
  })

  it("defensively tolerates pre-existing legacy tables", async () => {
    const db = createDb(":memory:")
    db.$client.exec(`CREATE TABLE session (id text PRIMARY KEY, directory text NOT NULL)`)
    const applied = await migrate(db)
    expect(applied).toBe(1)
    const tables = tableNames(db)
    expect(tables).toContain("message")
    expect(tables).not.toContain("session_legacy")
  })
})
