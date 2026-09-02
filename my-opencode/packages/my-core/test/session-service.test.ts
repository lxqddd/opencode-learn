import { describe, expect, it } from "bun:test"
import { createDb } from "../src/db/client"
import { migrate } from "../src/db/migrate"
import { SqliteSessionRepository } from "../src/db/session-repository"
import { ChatError } from "../src/llm"
import { PermissionService, type AskFn } from "../src/permission/service"
import { SessionService, type LoopStreamFn } from "../src/session/service"
import { ToolRegistry } from "../src/tool/registry"

const fakeConfig = { provider: "openai", model: "gpt-4o", temperature: 0.7 }
const allowAll: AskFn = async () => "once"

async function makeService(stream: LoopStreamFn) {
  const db = createDb(":memory:")
  await migrate(db)
  const repo = new SqliteSessionRepository(db)
  const configLoader = { resolve: async () => fakeConfig }
  const service = new SessionService(configLoader, repo, new ToolRegistry(), new PermissionService(allowAll), stream)
  return { service, repo }
}

describe("SessionService.promptStream basics", () => {
  it("persists user + assistant on success", async () => {
    const { service, repo } = await makeService(async function* () {
      yield { type: "text", text: "hello world" }
    })
    const parts: string[] = []
    for await (const t of service.promptStream({ prompt: "hi" })) parts.push(t)
    expect(parts.join("")).toBe("hello world")
    const msgs = await repo.messages(service.sessionId ?? "")
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(msgs.map((m) => m.content)).toEqual(["hi", "hello world"])
  })

  it("rolls back the user message when the stream fails", async () => {
    const { service, repo } = await makeService(async function* () {
      throw new ChatError("request-failed", "boom")
    })
    const drain = async () => {
      for await (const t of service.promptStream({ prompt: "hi" })) void t
    }
    await expect(drain()).rejects.toThrow()
    const any = await repo.list()
    for (const s of any) {
      expect(await repo.messages(s.id)).toHaveLength(0)
    }
  })

  it("rolls back on empty assistant response", async () => {
    const { service, repo } = await makeService(async function* () {})
    const drain = async () => {
      for await (const t of service.promptStream({ prompt: "hi" })) void t
    }
    await expect(drain()).rejects.toThrow()
    const any = await repo.list()
    for (const s of any) {
      expect(await repo.messages(s.id)).toHaveLength(0)
    }
  })
})
