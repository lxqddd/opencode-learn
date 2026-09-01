import { Config } from "@my/core"

export const config = async (overrides: Partial<Config.Overrides> = {}) => {
  const c = await Config.configLoader.resolve(overrides)
  console.log(`provider: ${c.provider}`)
  console.log(`model: ${c.model}`)
  console.log(`temperature: ${c.temperature}`)
  console.log(`apiKey: ${Config.maskKey(c.apiKey) ?? "(none)"}`)
}
