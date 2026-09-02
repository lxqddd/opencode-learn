import { bash } from "./bash"
import { edit } from "./edit"
import { grep } from "./grep"
import type { ToolRegistry } from "./registry"
import { read } from "./read"
import { write } from "./write"

export function registerBuiltins(registry: ToolRegistry): void {
  registry.register({ bash, read, write, edit, grep })
}
