import { realpathSync } from "node:fs"
import type { Config, ConfigLoader } from "../config"
import type { Session, SessionRepository, Message } from "../db/session-repository"
import { ChatError, type ChatMessage, type LoopEvent, type ToolAd, type ToolCallInfo, streamWithToolCalls } from "../llm"
import { PermissionDenied, pickResource, type PermissionService } from "../permission/service"
import type { ToolRegistry } from "../tool/registry"

export interface PromptInput {
  prompt: string
  resume?: string
  directory?: string
}

const MAX_STEPS = 10

export const toChatMessage = (m: Message): ChatMessage => {
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.tool_call_id }
  }
  if (m.role === "assistant") {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.tool_calls ? (JSON.parse(m.tool_calls) as ChatMessage["tool_calls"]) : undefined,
    }
  }
  return { role: "user", content: m.content }
}

export type LoopStreamFn = (
  config: Config,
  messages: ChatMessage[],
  tools: ToolAd[],
) => AsyncGenerator<LoopEvent, void, unknown>

export class SessionService {
  constructor(
    private configLoader: ConfigLoader,
    private repo: SessionRepository,
    private tools: ToolRegistry,
    private permission: PermissionService,
    private stream: LoopStreamFn = streamWithToolCalls,
  ) {}

  private async resolveSession(input: PromptInput): Promise<Session> {
    const directory = realpathSync(input.directory ?? process.cwd())
    if (input.resume) {
      const session = await this.repo.get(input.resume)
      if (!session) throw new Error(`会话不存在: ${input.resume} (my-cli session list 查看)`)
      return session
    }
    const existing = await this.repo.findByDirectory(directory)
    if (existing) return existing
    const config = await this.configLoader.resolve()
    return this.repo.create({
      directory,
      title: input.prompt.slice(0, 50),
      model: config.model,
    })
  }

  private async buildHistory(sessionId: string): Promise<ChatMessage[]> {
    const history = await this.repo.messages(sessionId)
    return history.map(toChatMessage)
  }

  private async executeWithPermission(call: ToolCallInfo, sessionId: string): Promise<string> {
    const tool = this.tools.get(call.name)
    if (!tool) return `error: unknown tool: ${call.name}`
    const resource = pickResource(call.name, call.input)
    try {
      await this.permission.assert(call.name, resource)
    } catch (error) {
      if (error instanceof PermissionDenied) return error.message
      throw error
    }
    try {
      return await tool.execute(call.input ?? {}, { sessionID: sessionId })
    } catch (error) {
      return `error: tool crashed: ${(error as Error)?.message ?? String(error)}`
    }
  }

  async *promptStream(input: PromptInput): AsyncGenerator<string, void, unknown> {
    const config = await this.configLoader.resolve()
    const session = await this.resolveSession(input)
    const userMsg = await this.repo.appendMessage({
      session_id: session.id,
      role: "user",
      content: input.prompt,
    })

    let history = await this.buildHistory(session.id)
    let full = ""
    let steps = 0
    let stoppedByLimit = false

    try {
      while (true) {
        steps++
        let roundText = ""
        let calls: ToolCallInfo[] = []

        for await (const event of this.stream(config, history, this.tools.list())) {
          if (event.type === "text") {
            roundText += event.text
            full += event.text
            yield event.text
          } else {
            calls = event.calls
          }
        }

        if (calls.length > 0 || roundText) {
          await this.repo.appendMessage({
            session_id: session.id,
            role: "assistant",
            content: roundText,
            tool_calls: calls.length > 0 ? JSON.stringify(calls) : undefined,
          })
        }

        if (calls.length === 0) break

        for (const call of calls) {
          const output = await this.executeWithPermission(call, session.id)
          await this.repo.appendMessage({
            session_id: session.id,
            role: "tool",
            content: output,
            tool_call_id: call.id,
          })
        }

        history = await this.buildHistory(session.id)
        if (steps >= MAX_STEPS) {
          yield "\n[reached max tool steps, stopping]"
          stoppedByLimit = true
          break
        }
      }

      if (!full && !stoppedByLimit) throw new ChatError("request-failed", "empty assistant response")
    } catch (error) {
      await this.repo.deleteMessage(userMsg.id).catch(() => {})
      if (error instanceof ChatError) throw error
      throw new ChatError("request-failed", error instanceof Error ? error.message : String(error))
    }

    this.sessionId = session.id
  }

  sessionId?: string

  async list(): Promise<Session[]> {
    return this.repo.list()
  }
}
