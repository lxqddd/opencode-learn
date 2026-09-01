import { describe, expect, it } from "bun:test"
import { ChatError, streamChat } from "../src/llm"

describe("streamChat", () => {
  it("throws missing-key when no apiKey", async () => {
    const gen = streamChat({ provider: "openai", model: "gpt-4o", temperature: 0.7 }, "hi")
    const drain = (async () => {
      let text = ""
      for await (const t of gen) text += t
      return text
    })()
    await expect(drain).rejects.toBeInstanceOf(ChatError)
    await expect(drain).rejects.toMatchObject({ kind: "missing-key" })
  })
})
