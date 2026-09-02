import { describe, expect, it } from "bun:test"
import { createDb } from "../src/db/client"
import { migrate } from "../src/db/migrate"
import { SqliteSessionRepository } from "../src/db/session-repository"
import { PermissionService, type AskFn } from "../src/permission/service"
import { SessionService, toChatMessage, type LoopStreamFn } from "../src/session/service"
import { ToolRegistry } from "../src/tool/registry"
import type { AnyTool, ToolContext } from "../src/tool/types"

const fakeConfig = { provider: "openai", model: "gpt-4o", temperature: 0.7 }
const allowAll: AskFn = async () => "once"

async function makeService(stream: LoopStreamFn, ask: AskFn = allowAll) {
  const db = createDb(":memory:")
  await migrate(db)
  const repo = new SqliteSessionRepository(db)
  const tools = new ToolRegistry()
  tools.register({
    get_lines: {
      description: "returns line count",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async (input: { path?: string }, _ctx: ToolContext) => `42 lines in ${input.path}`,
    } satisfies AnyTool,
  })
  const permission = new PermissionService(ask)
  const session = new SessionService({ resolve: async () => fakeConfig }, repo, tools, permission, stream)
  return { session, repo, permission }
}

describe("SessionService loop", () => {
  it("runs tool loop: tool call -> permission -> execute -> result -> final text", async () => {
    let round = 0
    const stream: LoopStreamFn = async function* () {
      round++
      if (round === 1) {
        yield { type: "tools", calls: [{ id: "c1", name: "get_lines", input: { path: "a.ts" } }] }
      } else {
        yield { type: "text", text: "答案是 42 行" }
      }
    }
    const { session, repo, permission } = await makeService(stream)
    permission.save({ tool: "get_lines", decision: "allow" })
    const parts: string[] = []
    for await (const t of session.promptStream({ prompt: "how many lines?" })) parts.push(t)
    expect(parts.join("")).toBe("答案是 42 行")
    const msgs = await repo.messages(session.sessionId ?? "")
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"])
    expect(msgs[2]?.content).toContain("42 lines")
    expect(msgs[2]?.tool_call_id).toBe("c1")
    expect(msgs[1]?.tool_calls).toContain('"name":"get_lines"')
  })

  it("rejected tool becomes model-visible text and loop continues", async () => {
    let round = 0
    const stream: LoopStreamFn = async function* () {
      round++
      if (round === 1) {
        yield { type: "tools", calls: [{ id: "c1", name: "get_lines", input: { path: "a.ts" } }] }
      } else {
        yield { type: "text", text: "好的,我不碰它" }
      }
    }
    const { session, repo } = await makeService(stream, async () => "reject")
    const parts: string[] = []
    for await (const t of session.promptStream({ prompt: "try it" })) parts.push(t)
    const toolMsg = (await repo.messages(session.sessionId ?? "")).find((m) => m.role === "tool")
    expect(toolMsg?.content).toContain("permission denied")
    expect(parts.join("")).toBe("好的,我不碰它")
  })

  it("stops after MAX_STEPS even if model keeps calling tools", async () => {
    const stream: LoopStreamFn = async function* () {
      yield { type: "tools", calls: [{ id: "c1", name: "get_lines", input: { path: "a.ts" } }] }
    }
    const { session, repo } = await makeService(stream)
    const parts: string[] = []
    for await (const t of session.promptStream({ prompt: "loop forever" })) parts.push(t)
    expect(parts.join("")).toContain("max tool steps")
    const msgs = await repo.messages(session.sessionId ?? "")
    expect(msgs.filter((m) => m.role === "tool").length).toBe(10)
  })
})

describe("toChatMessage", () => {
  it("reconstructs tool/tool_calls faithfully", () => {
    const base = { id: "x", session_id: "s", time_created: 1, time_updated: 1 }
    expect(
      toChatMessage({ ...base, role: "tool", content: "out", tool_call_id: "c9" }),
    ).toEqual({ role: "tool", content: "out", tool_call_id: "c9" })
    expect(
      toChatMessage({ ...base, role: "assistant", content: "", tool_calls: '[{"id":"c9","name":"read","input":{}}]' }),
    ).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c9", name: "read", input: {} }],
    })
  })
})
