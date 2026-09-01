import { realpathSync } from "node:fs"
import type { ConfigLoader } from "../config"
import type { Session, SessionRepository } from "../db/session-repository"
import { ChatError, type ChatMessage, streamChat } from "../llm"

export interface PromptInput {
  prompt: string
  resume?: string
  directory?: string
}

export class SessionService {
  constructor(
    private configLoader: ConfigLoader,
    private repo: SessionRepository,
  ) {}

  private async resolveSession(input: PromptInput): Promise<Session> {
    const directory = realpathSync(input.directory ?? process.cwd())
    if (input.resume) {
      const session = await this.repo.get(input.resume)
      if (!session) throw new Error(`会话不存在: ${input.resume} (my-cli session list 查看)` as string)
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

  async *promptStream(input: PromptInput): AsyncGenerator<string, void, unknown> {
    const config = await this.configLoader.resolve()
    const session = await this.resolveSession(input)
    await this.repo.appendMessage({ session_id: session.id, role: "user", content: input.prompt })

    const history = await this.repo.messages(session.id)
    const messages: ChatMessage[] = history.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }))

    let full = ""
    try {
      for await (const token of streamChat(config, messages)) {
        full += token
        yield token
      }
    } catch (error) {
      if (error instanceof ChatError) throw error
      throw new ChatError("request-failed", error instanceof Error ? error.message : String(error))
    }
    if (!full) throw new ChatError("request-failed", "empty assistant response")

    await this.repo.appendMessage({ session_id: session.id, role: "assistant", content: full })
    this.sessionId = session.id
  }

  sessionId?: string

  async list(): Promise<Session[]> {
    return this.repo.list()
  }
}
