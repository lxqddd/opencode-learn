import readline from "node:readline"
import type { AskFn } from "@my/core/permission"

export const cliAsk: AskFn = async (tool, resource) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((res) =>
    rl.question(
      `\n[permission] ${tool}: ${resource.slice(0, 120).replace(/\n/g, " ")}\nallow? [y]es / [a]lways / [n]o > `,
      res,
    ),
  )
  rl.close()
  const c = answer.trim().toLowerCase()
  if (c === "a" || c === "always") return "always"
  if (c === "n" || c === "no") return "reject"
  return "once"
}
