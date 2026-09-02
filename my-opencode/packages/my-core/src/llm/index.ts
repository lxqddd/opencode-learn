import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { dynamicTool, jsonSchema, streamText, type ModelMessage } from "ai"
import type { Config } from "../config"

export type ChatErrorKind = "missing-key" | "model-not-found" | "request-failed" | "auth-failed"

export class ChatError extends Error {
  constructor(
    readonly kind: ChatErrorKind,
    message?: string,
  ) {
    super(message ?? kind)
  }
}

function requireKey(config: Config): string {
  if (!config.apiKey) throw new ChatError("missing-key")
  return config.apiKey
}

function createProvider(config: Config) {
  const baseURL = config.baseURL ?? "https://api.openai.com/v1"
  return createOpenAICompatible({ baseURL, apiKey: requireKey(config), name: config.provider })
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: Array<{ id: string; name: string; input: unknown }>
  tool_call_id?: string
}

export interface ToolCallInfo {
  id: string
  name: string
  input: unknown
}

export type LoopEvent = { type: "text"; text: string } | { type: "tools"; calls: ToolCallInfo[] }

export interface ToolAd {
  name: string
  description: string
  inputSchema: unknown
}

export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  const names = new Map<string, string>()
  const out: ModelMessage[] = []
  for (const m of messages) {
    if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = []
      if (m.content) content.push({ type: "text", text: m.content })
      for (const c of m.tool_calls ?? []) {
        names.set(c.id, c.name)
        content.push({ type: "tool-call", toolCallId: c.id, toolName: c.name, input: c.input })
      }
      out.push({ role: "assistant", content } as unknown as ModelMessage)
      continue
    }
    if (m.role === "tool") {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: m.tool_call_id ?? "",
            toolName: names.get(m.tool_call_id ?? "") ?? "unknown",
            output: { type: "text", value: m.content },
          },
        ],
      } as unknown as ModelMessage)
      continue
    }
    out.push({ role: "user", content: m.content ?? "" } as ModelMessage)
  }
  return out
}

export async function* streamChat(
  config: Config,
  messages: ChatMessage[],
): AsyncGenerator<string, void, unknown> {
  const provider = createProvider(config)
  try {
    const result = streamText({
      model: provider(config.model),
      messages: toModelMessages(messages),
      temperature: config.temperature,
    })
    for await (const part of result.textStream) {
      yield part
    }
  } catch (error) {
    if (error instanceof ChatError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/model.*not found|404|not_found/i.test(message)) throw new ChatError("model-not-found", message)
    throw new ChatError("request-failed", message)
  }
}

export async function* streamWithToolCalls(
  config: Config,
  messages: ChatMessage[],
  tools: ToolAd[],
): AsyncGenerator<LoopEvent, void, unknown> {
  const provider = createProvider(config)
  try {
    const result = streamText({
      model: provider(config.model),
      messages: toModelMessages(messages),
      temperature: config.temperature,
      tools: tools.reduce<Record<string, ReturnType<typeof dynamicTool>> >((acc, t) => {
        acc[t.name] = dynamicTool({
          description: t.description,
          inputSchema: jsonSchema(t.inputSchema),
          execute: async () => "",
        })
        return acc
      }, {}),
    })
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        yield { type: "text", text: part.text }
      }
    }
    const calls = (await result.toolCalls) ?? []
    if (calls.length > 0) {
      yield {
        type: "tools",
        calls: calls.map((c) => ({ id: c.toolCallId, name: c.toolName, input: c.input })),
      }
    }
  } catch (error) {
    if (error instanceof ChatError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/model.*not found|404|not_found/i.test(message)) throw new ChatError("model-not-found", message)
    throw new ChatError("request-failed", message)
  }
}

export async function listModels(config: Config): Promise<string[]> {
  const baseURL = config.baseURL ?? "https://api.openai.com/v1"
  const key = requireKey(config)
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new ChatError("auth-failed", `GET /models failed: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as { data?: Array<{ id?: string }> }
    return (data.data ?? []).map((m) => m.id).filter((id): id is string => id !== undefined)
  } catch (error) {
    if (error instanceof ChatError) throw error
    throw new ChatError("request-failed", error instanceof Error ? error.message : String(error))
  }
}

export async function authCheck(config: Config): Promise<void> {
  const models = await listModels(config)
  if (models.length === 0) throw new ChatError("auth-failed", "authenticated but no models returned")
  console.log(`[ok] 认证成功,端点可用 (${models.length} 个模型)`)
}
