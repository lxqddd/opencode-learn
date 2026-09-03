import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { Config } from "@my/core"
import { ask } from "./cmd/ask"
import { config } from "./cmd/config"
import { models } from "./cmd/models"
import { auth } from "./cmd/auth"
import { sessionList } from "./cmd/session"
import { tui } from "./cmd/tui"

await Config.loadDotEnv()

if (process.argv[2] === "tui") {
  await tui()
  process.exit(0)
}

yargs(hideBin(process.argv))
  .scriptName("my-cli")
  .command(
    "ask <prompt>",
    "ask the model",
    (y) =>
      y
        .positional("prompt", { demandOption: true, type: "string", describe: "the prompt" })
        .option("provider", { type: "string", describe: "provider to use" })
        .option("model", { type: "string", describe: "model to use" })
        .option("resume", { type: "string", describe: "session id to resume" }),
    async (args) => {
      const overrides = { provider: args.provider, model: args.model }
      await ask(overrides, args.prompt, { resume: args.resume })
    },
  )
  .command(
    "config",
    "show the effective config",
    (y) => y.option("provider", { type: "string" }).option("model", { type: "string" }),
    async (args) => {
      await config({ provider: args.provider, model: args.model })
    },
  )
  .command(
    "models",
    "list available models",
    (y) => y.option("provider", { type: "string" }).option("model", { type: "string" }),
    async (args) => {
      await models({ provider: args.provider, model: args.model })
    },
  )
  .command(
    "auth",
    "verify credentials",
    (y) => y.option("provider", { type: "string" }).option("model", { type: "string" }),
    async (args) => {
      await auth({ provider: args.provider, model: args.model })
    },
  )
  .command(
    "tui",
    "start the terminal UI",
    () => {},
    async () => {
      console.error("my-cli tui must run directly: bun run tui")
      process.exit(1)
    },
  )
  .command(
    "session",
    "session management",
    (y) => y.command("list", "list sessions", async () => await sessionList()),
  )
  .demandCommand()
  .argv
