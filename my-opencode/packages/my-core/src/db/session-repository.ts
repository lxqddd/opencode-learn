import { asc, desc, eq } from "drizzle-orm"
import { ulid } from "ulid"
import type { DrizzleDb } from "./client"
import { MessageTable, SessionTable, type MessageRole } from "./schema"

export type Session = {
  id: string
  directory: string
  title?: string
  model?: string
  time_created: number
  time_updated: number
}

export type Message = {
  id: string
  session_id: string
  role: MessageRole
  content: string
  time_created: number
  time_updated: number
}

export interface SessionRepository {
  create(input: { directory: string; title?: string; model?: string }): Promise<Session>
  get(id: string): Promise<Session | undefined>
  list(): Promise<Session[]>
  findByDirectory(directory: string): Promise<Session | undefined>
  appendMessage(input: { session_id: string; role: MessageRole; content: string }): Promise<Message>
  messages(sessionId: string): Promise<Message[]>
  deleteSession(id: string): Promise<void>
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private db: DrizzleDb) {}

  async create(input: { directory: string; title?: string; model?: string }): Promise<Session> {
    const id = ulid()
    const [row] = await this.db
      .insert(SessionTable)
      .values({ id, directory: input.directory, title: input.title, model: input.model })
      .returning()
    return row as unknown as Session
  }

  async get(id: string): Promise<Session | undefined> {
    const [row] = await this.db.select().from(SessionTable).where(eq(SessionTable.id, id))
    return row as unknown as Session | undefined
  }

  async list(): Promise<Session[]> {
    const rows = await this.db
      .select()
      .from(SessionTable)
      .orderBy(desc(SessionTable.time_updated), desc(SessionTable.id))
    return rows as unknown as Session[]
  }

  async findByDirectory(directory: string): Promise<Session | undefined> {
    const [row] = await this.db
      .select()
      .from(SessionTable)
      .where(eq(SessionTable.directory, directory))
      .orderBy(desc(SessionTable.time_updated), desc(SessionTable.id))
    return row as unknown as Session | undefined
  }

  async appendMessage(input: { session_id: string; role: MessageRole; content: string }): Promise<Message> {
    const [row] = await this.db
      .insert(MessageTable)
      .values({ id: ulid(), session_id: input.session_id, role: input.role, content: input.content })
      .returning()
    return row as unknown as Message
  }

  async messages(sessionId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.session_id, sessionId))
      .orderBy(asc(MessageTable.time_created))
    return rows as unknown as Message[]
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(SessionTable).where(eq(SessionTable.id, id))
  }
}
