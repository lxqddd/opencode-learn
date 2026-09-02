import { resolve } from "node:path"
import type { Tool } from "./types"

interface EditInput {
  path: string
  oldText: string
  newText: string
}

export const edit: Tool<EditInput> = {
  description:
    "Replace exact text in a file. oldText must match exactly once — if it matches zero or multiple places, re-read the file and use more surrounding lines to make it unique.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to cwd or absolute" },
      oldText: { type: "string", description: "Exact text to replace (must be unique in the file)" },
      newText: { type: "string", description: "Replacement text" },
    },
    required: ["path", "oldText", "newText"],
  },
  async execute(input) {
    const path = resolve(input.path)
    const file = Bun.file(path)
    if (!(await file.exists())) return `error: file not found: ${input.path}`
    const text = await file.text()
    const count = text.split(input.oldText).length - 1
    if (count === 0)
      return `error: oldText not found in ${input.path}. Read the file again and copy the exact text including whitespace.`
    if (count > 1)
      return `error: oldText matches ${count} places in ${input.path}. Add surrounding lines to make it unique.`
    await Bun.write(path, text.replace(input.oldText, input.newText))
    return `ok: replaced 1 occurrence in ${path}`
  },
}
