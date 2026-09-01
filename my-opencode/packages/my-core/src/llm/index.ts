import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText } from "ai"
import type { Config } from "../config"

export type ChatError =
  | { kind: "missing-key" }
  | { kind: "model-not-found" }
  | { kind: "request-failed"; message: string }

function createProvider(config: Config) {
  const baseURL = config.baseURL ?? "https://api.openai.com/v1"
  if (!config.apiKey) throw { kind: "missing-key" } as ChatError
  return createOpenAICompatible({ baseURL, apiKey: config.apiKey, name: config.provider })
}

export async function* streamChat(
  config: Config,
  prompt: string,
): AsyncGenerator<string, void, ChatError | undefined> {
  const provider = createProvider(config)
  try {
    const result = streamText({
      model: provider(config.model),
      prompt,
      temperature: config.temperature,
    })
    for await (const part of result.textStream) {
      yield part
    }
  } catch (error) {
    if ((error as ChatError).kind === "missing-key") throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/model.*not found|404|not_found/i.test(message)) throw { kind: "model-not-found" } as ChatError
    throw { kind: "request-failed", message } as ChatError
  }
}
