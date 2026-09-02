import { describe, expect, it } from "bun:test"
import { grep } from "../src/tool/grep"

describe("grep tool", () => {
  it("finds matches with file:line:content", async () => {
    const out = await grep.execute({ pattern: "interface Tool", path: "src/tool" }, { sessionID: "t" })
    expect(out).toContain("types.ts:11:export interface Tool<Input = unknown> {")
    expect(out).not.toMatch(/^\/Users\//m)
  })

  it("returns (no matches) instead of error", async () => {
    const out = await grep.execute({ pattern: "zzz-no-such-token", path: "src/tool" }, { sessionID: "t" })
    expect(out).toBe("(no matches)")
  })

  it("reports invalid regex as error text", async () => {
    const out = await grep.execute({ pattern: "([unclosed", path: "src/tool" }, { sessionID: "t" })
    expect(out).toMatch(/error: (invalid regex|rg)/)
  })
})
