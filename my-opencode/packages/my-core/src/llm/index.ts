import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText } from "ai"
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
  role: "user" | "assistant"
  content: string
}

export async function* streamChat(
  config: Config,
  messages: ChatMessage[],
): AsyncGenerator<string, void, unknown> {
  const provider = createProvider(config)
  try {
    const result = streamText({
      model: provider(config.model),
      messages,
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
