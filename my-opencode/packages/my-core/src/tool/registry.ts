import type { AnyTool, JSONSchema } from "./types"

export interface ToolAd {
  name: string
  description: string
  inputSchema: JSONSchema
}

export class ToolRegistry {
  private tools = new Map<string, AnyTool>()

  register(tools: Record<string, AnyTool>): void {
    for (const [name, tool] of Object.entries(tools)) this.tools.set(name, tool)
  }

  get(name: string): AnyTool | undefined {
    return this.tools.get(name)
  }

  list(): ToolAd[] {
    return [...this.tools.entries()].map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  }
}
