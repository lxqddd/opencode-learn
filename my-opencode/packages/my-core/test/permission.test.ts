import { describe, expect, it } from "bun:test"
import { PermissionDenied, PermissionService, type AskFn } from "../src/permission/service"

describe("PermissionService.evaluate", () => {
  const svc = new PermissionService(async () => "reject")

  it("default policy: reads allow, writes/bash ask, unknown deny", () => {
    expect(svc.evaluate("read", "/any/file")).toBe("allow")
    expect(svc.evaluate("grep", "pattern")).toBe("allow")
    expect(svc.evaluate("bash", "git status")).toBe("ask")
    expect(svc.evaluate("edit", "/f")).toBe("ask")
    expect(svc.evaluate("mystery-plugin-tool", "x")).toBe("deny")
  })

  it("saved rules take precedence with prefix matching", () => {
    const s = new PermissionService(async () => "reject")
    s.save({ tool: "bash", pattern: "git", decision: "allow" })
    expect(s.evaluate("bash", "git push")).toBe("allow")
    expect(s.evaluate("bash", "rm -rf /")).toBe("ask")
  })
})

describe("PermissionService.assert", () => {
  it("allow passes without asking", async () => {
    let asked = 0
    const ask: AskFn = async () => {
      asked++
      return "once"
    }
    const s = new PermissionService(ask)
    await s.assert("read", "/f")
    expect(asked).toBe(0)
  })

  it("deny and reject throw PermissionDenied with model guidance", async () => {
    const s = new PermissionService(async () => "reject")
    await expect(s.assert("bash", "rm -rf /")).rejects.toThrow(PermissionDenied)
    await expect(s.assert("bash", "git push")).rejects.toThrow("Do not retry")
  })

  it("always: second call skips asking", async () => {
    let asked = 0
    const ask: AskFn = async () => {
      asked++
      return "always"
    }
    const s = new PermissionService(ask)
    await s.assert("bash", "git status")
    await s.assert("bash", "git push")
    await s.assert("bash", "git log")
    expect(asked).toBe(1)
  })
})
