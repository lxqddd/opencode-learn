import { createContext } from "solid-js"

export type Mode = "input" | "streaming" | "permission"

export interface TuiMessage {
  role: "user" | "assistant" | "tool"
  content: string
}

export interface TuiState {
  messages: TuiMessage[]
  mode: () => Mode
  permission: () => { tool: string; resource: string } | null
  submit: (prompt: string) => Promise<void>
}

export const StateContext = createContext<TuiState>()
