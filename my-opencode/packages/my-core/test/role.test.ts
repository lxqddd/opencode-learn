import { describe, expect, it } from "bun:test"
import { ChatError } from "../src/llm"
import { toChatRole } from "../src/session/service"

describe("toChatRole", () => {
  it("maps user/assistant through unchanged", () => {
    expect(toChatRole("user")).toBe("user")
    expect(toChatRole("assistant")).toBe("assistant")
  })

  it("throws — not silently downgrades — on tool role", () => {
    expect(() => toChatRole("tool")).toThrow(ChatError)
    expect(() => toChatRole("tool")).toThrow("M3")
  })

  it("compiler forbids arbitrary role at build time (type guard)", () => {
    const role: "user" | "assistant" = "user"
    expect(toChatRole(role)).toBe("user")
  })
})
