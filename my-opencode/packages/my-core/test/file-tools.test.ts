import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { edit } from "../src/tool/edit"
import { read } from "../src/tool/read"
import { write } from "../src/tool/write"

const tmp = mkdtempSync(join(tmpdir(), "my-tools-"))

describe("read tool", () => {
  it("returns numbered lines with total", async () => {
    const p = join(tmp, "a.txt")
    writeFileSync(p, "alpha\nbeta\ngamma")
    const out = await read.execute({ path: p }, { sessionID: "t" })
    expect(out).toContain("1\talpha")
    expect(out).toContain("2\tbeta")
    expect(out).toContain("total 3 lines")
  })

  it("pages with offset/limit", async () => {
    const p = join(tmp, "b.txt")
    writeFileSync(p, Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join("\n"))
    const out = await read.execute({ path: p, offset: 3, limit: 2 }, { sessionID: "t" })
    expect(out).toContain("3\tl3")
    expect(out).toContain("4\tl4")
    expect(out).not.toContain("l5\t")
  })

  it("missing file returns error text, not throw", async () => {
    const out = await read.execute({ path: join(tmp, "nope.txt") }, { sessionID: "t" })
    expect(out).toContain("error: file not found")
  })
})

describe("write tool", () => {
  it("writes with parent dirs", async () => {
    const p = join(tmp, "nested/dir/c.txt")
    const out = await write.execute({ path: p, content: "hello" }, { sessionID: "t" })
    expect(out).toContain("wrote 5 bytes")
    expect(await Bun.file(p).text()).toBe("hello")
  })
})

describe("edit tool", () => {
  const p = join(tmp, "edit.txt")

  beforeAll(() => {
    writeFileSync(p, "const a = 1\nconst b = 2\nconst a = 1\n")
  })

  it("replaces a unique occurrence", async () => {
    const out = await edit.execute({ path: p, oldText: "const b = 2", newText: "const b = 20" }, { sessionID: "t" })
    expect(out).toContain("ok: replaced 1 occurrence")
    expect(await Bun.file(p).text()).toContain("const b = 20")
  })

  it("errors on zero matches with guidance", async () => {
    const out = await edit.execute({ path: p, oldText: "not-there", newText: "x" }, { sessionID: "t" })
    expect(out).toContain("error: oldText not found")
    expect(out).toContain("Read the file again")
  })

  it("errors on multiple matches", async () => {
    const out = await edit.execute({ path: p, oldText: "const a = 1", newText: "x" }, { sessionID: "t" })
    expect(out).toContain("matches 2 places")
  })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})
