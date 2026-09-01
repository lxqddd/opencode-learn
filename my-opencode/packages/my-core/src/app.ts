import { configLoader, type ConfigLoader } from "./config"
import { createDb, type DrizzleDb } from "./db/client"
import { migrate } from "./db/migrate"
import { SqliteSessionRepository, type SessionRepository } from "./db/session-repository"
import { SessionService } from "./session/service"

export interface App {
  db: DrizzleDb
  configLoader: ConfigLoader
  repo: SessionRepository
  session: SessionService
}

export async function createApp(opts: { dbPath?: string } = {}): Promise<App> {
  const db = createDb(opts.dbPath)
  await migrate(db)
  const repo = new SqliteSessionRepository(db)
  const session = new SessionService(configLoader, repo)
  return { db, configLoader, repo, session }
}
