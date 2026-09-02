export interface JSONSchema {
  type: "object"
  properties: Record<string, { type: string; description?: string }>
  required?: string[]
}

export interface ToolContext {
  sessionID: string
}

export interface Tool<Input = unknown> {
  readonly description: string
  readonly inputSchema: JSONSchema
  execute(input: Input, context: ToolContext): Promise<string>
}

export type AnyTool = Tool<any>
