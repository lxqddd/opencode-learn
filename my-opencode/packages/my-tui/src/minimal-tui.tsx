import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"

async function main() {
  console.error("[minimal-tui] renderer init...")
  const renderer = await createCliRenderer({
    externalOutputMode: "passthrough",
    targetFps: 60,
    exitOnCtrlC: false,
    useKittyKeyboard: null,
    autoFocus: false,
    openConsoleOnError: false,
  })
  console.error("[minimal-tui] renderer OK, rendering...")
  await render(
    () => (
      <box flexDirection="column" flexGrow={1}>
        <text content=" minimal-tui works" fg="#00ff00" />
      </box>
    ),
    renderer,
  )
  console.error("[minimal-tui] render resolved")
  process.exit(0)
}

main().catch((e) => {
  console.error("[minimal-tui] FAILED:", e?.message ?? e)
  process.exit(1)
})
