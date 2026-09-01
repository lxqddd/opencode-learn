import { beforeAll, describe, expect, it } from "bun:test"
import { createDb } from "../src/db/client"
import { migrate } from "../src/db/migrate"
import { SqliteSessionRepository } from "../src/db/session-repository"
import { ChatError, type ChatMessage } from "../src/llm"
import { SessionService, type LLMStreamFn } from "../src/session/service"

const fakeConfig = { provider: "openai", model: "gpt-4o", temperature: 0.7 }

async function makeService(stream: LLMStreamFn) {
  const db = createDb(":memory:")
  await migrate(db)
  const repo = new SqliteSessionRepository(db)
  const configLoader = { resolve: async () => fakeConfig }
  return { service: new SessionService(configLoader, repo, stream), repo }
}

describe("SessionService.promptStream", () => {
  const db = createDb(":memory:")
  beforeAll(async () => {
    await migrate(db)
  })
  const repo = new SqliteSessionRepository(db)
  const configLoader = { resolve: async () => fakeConfig }

  it("persists user + assistant on success", async () => {
    const service = new SessionService(configLoader, repo, async function* () {
      yield "hello"
      yield " world"
    })
    const parts: string[] = []
    for await (const t of service.promptStream({ prompt: "hi" })) parts.push(t)
    expect(parts.join("")).toBe("hello world")
    const msgs = await repo.messages(service.sessionId ?? "")
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(msgs.map((m) => m.content)).toEqual(["hi", "hello world"])
  })

  it("rolls back the user message when the stream fails", async () => {
    const stream: LLMStreamFn = async function* () {
      throw new ChatError("request-failed", "boom")
    }
    const make = await makeService(stream)
    const drain = async () => {
      for await (const t of make.service.promptStream({ prompt: "hi" })) void t
    }
    await expect(drain()).rejects.toThrow()
    const any = await make.repo.list()
    for (const s of any) {
      expect(await make.repo.messages(s.id)).toHaveLength(0)
    }
  })

  it("rolls back on empty assistant response", async () => {
    const make = await makeService(async function* () {})
    const drain = async () => {
      for await (const t of make.service.promptStream({ prompt: "hi" })) void t
    }
    await expect(drain()).rejects.toThrow()
    const any = await make.repo.list()
    for (const s of any) {
      expect(await make.repo.messages(s.id)).toHaveLength(0)
    }
  })
})
