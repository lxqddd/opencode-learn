import { describe, expect, it } from "bun:test"
import { bash } from "../src/tool/bash"

describe("bash tool", () => {
  it("returns stdout on success", async () => {
    const out = await bash.execute({ command: "echo hello" }, { sessionID: "t" })
    expect(out.trim()).toBe("hello")
  })

  it("returns exit code and stderr instead of throwing", async () => {
    const out = await bash.execute({ command: "echo oops >&2; exit 3" }, { sessionID: "t" })
    expect(out).toContain("exit=3")
    expect(out).toContain("oops")
  })

  it("kills long-running commands on timeout", async () => {
    const out = await bash.execute({ command: "sleep 5", timeout: 200 }, { sessionID: "t" })
    expect(out).toContain("timeout after 200ms")
  })

  it("truncates oversized output", async () => {
    const out = await bash.execute({ command: "head -c 20000 /dev/zero | tr '\\0' 'a'" }, { sessionID: "t" })
    expect(out.length).toBeLessThan(11_000)
    expect(out).toContain("[output truncated]")
  })
})
