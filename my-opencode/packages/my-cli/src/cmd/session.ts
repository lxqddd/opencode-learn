import { Config } from "@my/core"
import { createDb } from "@my/core/db"
import { SqliteSessionRepository } from "@my/core/db/session-repository"
import { SessionService } from "@my/core/session"

export const sessionList = async () => {
  const repo = new SqliteSessionRepository(createDb())
  const sessions = await new SessionService(Config.configLoader, repo).list()
  if (sessions.length === 0) {
    console.log("(no sessions yet)")
    return
  }
  for (const s of sessions) {
    console.log(`${s.id}  ${s.model ?? "?"}  ${s.time_created && new Date(s.time_created).toLocaleString()}  ${s.directory}`)
    console.log(`   title: ${s.title ?? ""}`)
  }
}
