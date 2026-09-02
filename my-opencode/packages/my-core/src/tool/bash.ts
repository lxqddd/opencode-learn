import type { Tool } from "./types"

const MAX_OUTPUT = 10_000
const DEFAULT_TIMEOUT = 30_000

interface BashInput {
  command: string
  timeout?: number
}

const truncate = (s: string) =>
  s.length > MAX_OUTPUT
    ? { text: s.slice(0, MAX_OUTPUT) + "\n...[output truncated]", truncated: true }
    : { text: s, truncated: false }

export const bash: Tool<BashInput> = {
  description:
    "Run a shell command with bash and return its output. Use for running tests, git, installing deps, etc. A non-zero exit returns stderr so you can fix the command.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
      timeout: { type: "number", description: "Timeout in milliseconds, default 30000" },
    },
    required: ["command"],
  },
  async execute(input) {
    const proc = Bun.spawn({
      cmd: ["bash", "-c", input.command],
      stdout: "pipe",
      stderr: "pipe",
    })
    const timeout = input.timeout ?? DEFAULT_TIMEOUT
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, timeout)
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    clearTimeout(timer)
    const code = await proc.exited
    const out = truncate(stdout)
    const err = truncate(stderr)

    if (timedOut) return `timeout after ${timeout}ms (killed)\npartial output:\n${out.text}`
    if (code === 0) return out.text
    return `exit=${code}\n${out.text}${err.text ? `\nstderr:\n${err.text}` : ""}`
  },
}
