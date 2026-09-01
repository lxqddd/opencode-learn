import { Config } from "@my/core"

export const ask = async (overrides: Partial<Config.Overrides> = {}, prompt: string) => {
  const c = await Config.configLoader.resolve(overrides)
  console.log(`provider: ${c.provider}`)
  console.log(`model: ${c.model}`)
  console.log(`apiKey: ${Config.maskKey(c.apiKey) ?? "(none)"}`)
  console.log("---")
  console.log(`You asked: ${prompt}`)
}
