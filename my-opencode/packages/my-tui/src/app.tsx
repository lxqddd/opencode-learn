import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { render, useKeyboard } from "@opentui/solid"
import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { realpathSync } from "node:fs"
import type { App } from "@my/core/app"
import type { AskFn, AskReply } from "@my/core/permission"
import { MessageList } from "./component/message-list"
import { PermissionDialog } from "./component/permission-dialog"
import { PromptInput } from "./component/prompt-input"
import type { Mode, TuiMessage } from "./context/state"

export interface TuiController {
  ask: AskFn
  run(app: App): Promise<void>
}

export function createTui(): TuiController {
  const [messages, setMessages] = createStore<TuiMessage[]>([])
  const [mode, setMode] = createSignal<Mode>("input")
  const [permission, setPermission] = createSignal<{ tool: string; resource: string } | null>(null)
  let resolvePermission: ((reply: AskReply) => void) | null = null
  let appRef: App | null = null
  let rendererRef: CliRenderer | null = null

  const ask: AskFn = async (tool, resource) => {
    return new Promise((resolve) => {
      resolvePermission = resolve
      setPermission({ tool, resource })
      setMode("permission")
    })
  }

  const finishPermission = (reply: AskReply) => {
    setMode("streaming")
    setPermission(null)
    resolvePermission?.(reply)
    resolvePermission = null
  }

  const quit = () => {
    if (rendererRef && !rendererRef.isDestroyed) {
      rendererRef.destroy()
    }
    setTimeout(() => process.exit(0), 200)
  }

  const submit = async (prompt: string) => {
    const app = appRef
    if (!app) return
    setMessages((prev) => [...prev, { role: "user", content: prompt }])
    setMode("streaming")
    try {
      for await (const token of app.session.promptStream({ prompt })) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === "assistant") {
            return [...prev.slice(0, -1), { ...last, content: last.content + token }]
          }
          return [...prev, { role: "assistant", content: token }]
        })
      }
    } catch (error) {
      setMessages((prev) => [...prev, { role: "tool", content: `error: ${(error as Error)?.message ?? error}` }])
    }
    setMode("input")
  }

  function TuiApp() {
    useKeyboard((key) => {
      if (mode() === "permission") {
        if (key.name === "y" || key.name === "return") finishPermission("once")
        if (key.name === "a") finishPermission("always")
        if (key.name === "n") finishPermission("reject")
        return
      }
      if (key.name === "escape" || (key.ctrl && key.name === "c")) quit()
    })
    return (
      <box flexDirection="column" flexGrow={1}>
        <text content={` my-opencode tui  (esc=quit)`} fg="#888888" />
        <MessageList messages={messages} />
        <PermissionDialog visible={() => mode() === "permission"} permission={permission()} />
        <PromptInput visible={() => mode() === "input"} onSubmit={submit} />
      </box>
    )
  }

  return {
    ask,
    async run(app: App) {
      appRef = app
      const session = await app.repo.findByDirectory(realpathSync(process.cwd()))
      if (session) {
        const msgs = await app.repo.messages(session.id)
        setMessages(
          msgs.map((m) => ({ role: m.role as TuiMessage["role"], content: m.content })),
        )
      }
      rendererRef = await createCliRenderer({
        externalOutputMode: "passthrough",
        targetFps: 60,
        exitOnCtrlC: false,
        useKittyKeyboard: null,
        autoFocus: false,
        openConsoleOnError: false,
      })
      process.on("SIGTERM", () => quit())
      process.on("SIGHUP", () => quit())
      process.on("SIGINT", () => quit())
      await render(() => <TuiApp />, rendererRef)
      process.exit(0)
    },
  }
}
