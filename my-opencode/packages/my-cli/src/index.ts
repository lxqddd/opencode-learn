import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { Config } from "@my/core"
import { ask } from "./cmd/ask"
import { config } from "./cmd/config"

await Config.loadDotEnv()

yargs(hideBin(process.argv))
  .scriptName("my-cli")
  .command(
    "ask <prompt>",
    "ask the model",
    (y) =>
      y
        .positional("prompt", { demandOption: true, type: "string", describe: "the prompt" })
        .option("provider", { type: "string", describe: "provider to use" })
        .option("model", { type: "string", describe: "model to use" }),
    async (args) => {
      const overrides = { provider: args.provider, model: args.model }
      await ask(overrides, args.prompt)
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
  .demandCommand()
  .argv
