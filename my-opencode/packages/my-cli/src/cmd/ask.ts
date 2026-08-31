import { Config } from "@my/core"

export const ask = async (config: Config.Config, prompt: string) => {
  console.log(`provider: ${config.provider}`)
  console.log(`model: ${config.model}`)
  console.log(`apiKey: ${Config.maskKey(config.apiKey) ?? "(none)"}`)
  console.log("---")
  console.log(`You asked: ${prompt}`)
}
