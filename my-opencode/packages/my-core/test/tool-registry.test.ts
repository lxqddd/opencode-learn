import { describe, expect, it } from "bun:test"
import { ToolRegistry } from "../src/tool/registry"
import type { AnyTool } from "../src/tool/types"

const fake = (description: string): AnyTool => ({
  description,
  inputSchema: { type: "object", properties: {} },
  execute: async () => description,
})

describe("ToolRegistry", () => {
  it("registers and gets by name", () => {
    const r = new ToolRegistry()
    r.register({ grep: fake("search") })
    expect(r.get("grep")?.description).toBe("search")
    expect(r.get("nope")).toBeUndefined()
  })

  it("latest registration wins on name conflict", () => {
    const r = new ToolRegistry()
    r.register({ grep: fake("old") })
    r.register({ grep: fake("new") })
    expect(r.get("grep")?.description).toBe("new")
  })

  it("list exposes model-facing ads", () => {
    const r = new ToolRegistry()
    r.register({ grep: fake("search"), read: fake("read file") })
    const ads = r.list()
    expect(ads.map((a) => a.name).sort()).toEqual(["grep", "read"])
    expect(ads.every((a) => a.inputSchema.type === "object")).toBe(true)
  })
})
