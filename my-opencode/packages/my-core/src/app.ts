import { configLoader, type ConfigLoader } from "./config"
import { createDb, type DrizzleDb } from "./db/client"
import { migrate } from "./db/migrate"
import { SqliteSessionRepository, type SessionRepository } from "./db/session-repository"
import { PermissionService, type AskFn } from "./permission/service"
import { SessionService } from "./session/service"
import { registerBuiltins } from "./tool/builtins"
import { ToolRegistry } from "./tool/registry"

export interface App {
  db: DrizzleDb
  configLoader: ConfigLoader
  repo: SessionRepository
  session: SessionService
  tools: ToolRegistry
  permission: PermissionService
}

const rejectAll: AskFn = async () => "reject"

export async function createApp(opts: { dbPath?: string; ask?: AskFn } = {}): Promise<App> {
  const db = createDb(opts.dbPath)
  await migrate(db)
  const repo = new SqliteSessionRepository(db)
  const tools = new ToolRegistry()
  registerBuiltins(tools)
  const permission = new PermissionService(opts.ask ?? rejectAll)
  const session = new SessionService(configLoader, repo, tools, permission)
  return { db, configLoader, repo, session, tools, permission }
}
