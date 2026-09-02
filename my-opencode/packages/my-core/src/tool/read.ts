import { resolve } from "node:path"
import type { Tool } from "./types"

interface ReadInput {
  path: string
  offset?: number
  limit?: number
}

export const read: Tool<ReadInput> = {
  description:
    "Read a text file with 1-based line numbers. Use offset/limit to page through large files instead of reading everything at once.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to cwd or absolute" },
      offset: { type: "number", description: "1-based line to start from" },
      limit: { type: "number", description: "Max lines to return, default 2000" },
    },
    required: ["path"],
  },
  async execute(input) {
    const file = Bun.file(resolve(input.path))
    if (!(await file.exists())) return `error: file not found: ${input.path}`
    const text = await file.text()
    const lines = text.split("\n")
    const offset = Math.max(1, input.offset ?? 1)
    const limit = input.limit ?? 2000
    const slice = lines.slice(offset - 1, offset - 1 + limit)
    const numbered = slice.map((line, i) => `${String(offset + i).padStart(6)}\t${line}`).join("\n")
    const total = lines.length
    const shown = `${offset}..${offset - 1 + slice.length}`
    return `${numbered}\n\n(total ${total} lines, showing ${shown})`
  },
}
