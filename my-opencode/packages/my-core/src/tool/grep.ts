import { relative, resolve } from "node:path"
import type { Tool } from "./types"

interface GrepInput {
  pattern: string
  path?: string
}

const MAX_MATCHES = 200

async function grepWithRg(pattern: string, root: string): Promise<string | null> {
  let proc
  try {
    proc = Bun.spawn({
      cmd: ["rg", "-n", "--", pattern, root],
      stdout: "pipe",
      stderr: "pipe",
    })
  } catch {
    return null
  }
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  if (code === 2) return `error: ${stderr.trim()}`
  return stdout || "(no matches)"
}

async function grepFallback(pattern: string, root: string): Promise<string> {
  let re: RegExp
  try {
    re = new RegExp(pattern)
  } catch (error) {
    return `error: invalid regex: ${(error as Error).message}`
  }
  const { readdir } = await import("node:fs/promises")
  const SKIP = new Set(["node_modules", ".git", "dist", ".turbo"])
  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (results.length >= MAX_MATCHES) return
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) await walk(full)
        continue
      }
      const text = await Bun.file(full).text().catch(() => null)
      if (text === null || text.includes("\0")) continue
      const rel = relative(process.cwd(), full)
      for (const [i, line] of text.split("\n").entries()) {
        if (results.length >= MAX_MATCHES) break
        if (re.test(line)) results.push(`${rel}:${i + 1}:${line.trim().slice(0, 200)}`)
      }
    }
  }
  await walk(root).catch(() => {})
  if (results.length === 0) return "(no matches)"
  const note = results.length >= MAX_MATCHES ? `\n(showing first ${MAX_MATCHES}, narrow the pattern)` : ""
  return results.join("\n") + note
}

export const grep: Tool<GrepInput> = {
  description:
    "Search file contents with a regex. Returns file:line:content, respecting .gitignore when ripgrep is available. Defaults to the current directory.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "File or directory to search, default ." },
    },
    required: ["pattern"],
  },
  async execute(input) {
    const root = input.path ?? "."
    return (await grepWithRg(input.pattern, root)) ?? grepFallback(input.pattern, root)
  },
}
