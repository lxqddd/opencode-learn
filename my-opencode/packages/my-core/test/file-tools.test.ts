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


describe("read binary rejection", () => {
  it("rejects PNG files with model guidance", async () => {
    const p = join(tmp, "fake.png")
    writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
    const out = await read.execute({ path: p }, { sessionID: "t" })
    expect(out).toContain("is a png file (binary)")
    expect(out).toContain("Inform the user")
  })

  it("rejects generic binary (NUL bytes)", async () => {
    const p = join(tmp, "data.bin")
    writeFileSync(p, Buffer.from([0x01, 0x00, 0x02, 0x00]))
    const out = await read.execute({ path: p }, { sessionID: "t" })
    expect(out).toContain("binary file")
  })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})
