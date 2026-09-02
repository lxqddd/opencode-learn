import { dirname, resolve } from "node:path"
import type { Tool } from "./types"

interface WriteInput {
  path: string
  content: string
}

export const write: Tool<WriteInput> = {
  description:
    "Write a file with full content. Creates parent directories. Overwrites the file if it exists.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to cwd or absolute" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
  async execute(input) {
    const path = resolve(input.path)
    const { mkdirSync } = await import("node:fs")
    mkdirSync(dirname(path), { recursive: true })
    await Bun.write(path, input.content)
    return `wrote ${input.content.length} bytes to ${path}`
  },
}
