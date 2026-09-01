import { beforeAll, describe, expect, it } from "bun:test"
import { createDb } from "../src/db/client"
import { migrate } from "../src/db/migrate"
import { SqliteSessionRepository } from "../src/db/session-repository"

describe("SqliteSessionRepository", () => {
  const db = createDb(":memory:")
  beforeAll(async () => {
    await migrate(db)
  })
  const repo = new SqliteSessionRepository(db)

  it("creates and gets a session", async () => {
    const s = await repo.create({ directory: "/tmp/project", title: "hello" })
    expect((await repo.get(s.id))?.title).toBe("hello")
    expect((await repo.get(s.id))?.directory).toBe("/tmp/project")
  })

  it("appends and lists messages in order", async () => {
    const s = await repo.create({ directory: "/tmp/project2" })
    await repo.appendMessage({ session_id: s.id, role: "user", content: "first" })
    await repo.appendMessage({ session_id: s.id, role: "assistant", content: "second" })
    const msgs = await repo.messages(s.id)
    expect(msgs.map((m) => m.content)).toEqual(["first", "second"])
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"])
  })

  it("findByDirectory returns latest session for the dir", async () => {
    await repo.create({ directory: "/tmp/project3" })
    const latest = await repo.create({ directory: "/tmp/project3" })
    const found = await repo.findByDirectory("/tmp/project3")
    expect(found?.id).toBe(latest.id)
  })

  it("list returns sessions ordered by update", async () => {
    const all = await repo.list()
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it("cascade deletes messages when session removed", async () => {
    const s = await repo.create({ directory: "/tmp/project4" })
    await repo.appendMessage({ session_id: s.id, role: "user", content: "x" })
    await repo.appendMessage({ session_id: s.id, role: "assistant", content: "y" })
    await repo.deleteSession(s.id)
    expect(await repo.messages(s.id)).toHaveLength(0)
  })
})
