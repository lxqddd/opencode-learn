import { resolve } from "node:path"
import type { Tool } from "./types"

interface ReadInput {
  path: string
  offset?: number
  limit?: number
}

const IMAGE_MAGIC: Array<{ ext: string; bytes: number[] }> = [
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "gif", bytes: [0x47, 0x49, 0x46] },
  { ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
]

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
    const buffer = new Uint8Array(await file.arrayBuffer())
    for (const { ext, bytes } of IMAGE_MAGIC) {
      if (bytes.every((b, i) => buffer[i] === b)) {
        return `error: ${input.path} is a ${ext} file (binary). This tool only reads text files, and the current model cannot see images. Inform the user that image content cannot be read, and suggest describing the image or using a vision-capable model.`
      }
    }
    if (buffer.includes(0)) {
      return `error: ${input.path} is a binary file (contains NUL bytes). This tool only reads text files. Inform the user and try another approach.`
    }
    const text = new TextDecoder().decode(buffer)
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
