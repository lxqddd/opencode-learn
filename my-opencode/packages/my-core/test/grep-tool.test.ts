import { describe, expect, it } from "bun:test"
import { dirname, join } from "node:path"
import { grep } from "../src/tool/grep"

const toolDir = join(dirname(import.meta.dir), "src", "tool")

describe("grep tool", () => {
  it("finds matches with file:line:content", async () => {
    const out = await grep.execute({ pattern: "interface Tool", path: toolDir }, { sessionID: "t" })
    expect(out).toContain("types.ts:11:export interface Tool<Input = unknown> {")
  })

  it("returns (no matches) instead of error", async () => {
    const out = await grep.execute({ pattern: "zzz-no-such-token", path: toolDir }, { sessionID: "t" })
    expect(out).toBe("(no matches)")
  })

  it("reports invalid regex as error text", async () => {
    const out = await grep.execute({ pattern: "([unclosed", path: toolDir }, { sessionID: "t" })
    expect(out).toMatch(/error: (invalid regex|rg)/)
  })
})
