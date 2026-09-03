import { For } from "solid-js"
import type { TuiMessage } from "../context/state"

const prefix: Record<TuiMessage["role"], string> = {
  user: "you> ",
  assistant: "ai> ",
  tool: "      [tool] ",
}

export function MessageList(props: { messages: TuiMessage[] }) {
  return (
    <scrollbox flexGrow={1}>
      <For each={props.messages}>
        {(m) => <text content={prefix[m.role] + m.content} wrapMode="word" />}
      </For>
    </scrollbox>
  )
}
