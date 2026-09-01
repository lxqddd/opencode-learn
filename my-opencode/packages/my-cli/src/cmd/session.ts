import { createApp } from "@my/core/app"

export const sessionList = async () => {
  const app = await createApp()
  const sessions = await app.session.list()
  if (sessions.length === 0) {
    console.log("(no sessions yet)")
    return
  }
  for (const s of sessions) {
    console.log(
      `${s.id}  ${s.model ?? "?"}  ${s.time_created && new Date(s.time_created).toLocaleString()}  ${s.directory}`,
    )
    console.log(`   title: ${s.title ?? ""}`)
  }
}
