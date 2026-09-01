import { afterAll, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FileConfigLoader, defaults, type Overrides } from "../src/config"

const tmp = mkdtempSync(join(tmpdir(), "my-config-"))

async function inDir(dir: string, fn: () => Promise<void>) {
  const cwd = process.cwd()
  process.chdir(dir)
  try {
    await fn()
  } finally {
    process.chdir(cwd)
  }
}

describe("FileConfigLoader.resolve", () => {
  it("merges with priority: CLI > env > file > defaults", async () => {
    const projectDir = join(tmp, "project")
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, "opencode.json"),
      JSON.stringify({ provider: "anthropic", model: "claude-sonnet-4", temperature: 0.3 }),
    )
    const env = { OPENAI_API_KEY: "sk-file-env-key" }
    const loader = new FileConfigLoader(undefined, env)
    await inDir(projectDir, async () => {
      const c = await loader.resolve()
      expect(c.provider).toBe("anthropic")
      expect(c.model).toBe("claude-sonnet-4")
      expect(c.temperature).toBe(0.3)
      expect(c.apiKey).toBe("sk-file-env-key")

      const overridden = await loader.resolve({ provider: "openai" } as Overrides)
      expect(overridden.provider).toBe("openai")
      expect(overridden.model).toBe("claude-sonnet-4")
    })
  })

  it("discards non-string provider from malformed config", async () => {
    const badDir = join(tmp, "bad")
    mkdirSync(badDir, { recursive: true })
    writeFileSync(join(badDir, "opencode.json"), JSON.stringify({ provider: 123 }))
    const loader = new FileConfigLoader(undefined, {})
    await inDir(badDir, async () => {
      const c = await loader.resolve()
      expect(c.provider).toBe(defaults.provider)
    })
  })

  it("filters undefined overrides", async () => {
    const emptyDir = join(tmp, "empty")
    mkdirSync(emptyDir, { recursive: true })
    const loader = new FileConfigLoader(undefined, {})
    await inDir(emptyDir, async () => {
      const c = await loader.resolve({ provider: undefined, model: "deepseek-r1" } as Overrides)
      expect(c.provider).toBe(defaults.provider)
      expect(c.model).toBe("deepseek-r1")
    })
  })

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })
})
