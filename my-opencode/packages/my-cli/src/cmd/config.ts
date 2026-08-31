import { Config } from "@my/core"

export const config = async (overrides: Partial<Config.Config> = {}) => {
  const c = await Config.resolveConfig(overrides)
  console.log(`provider: ${c.provider}`)
  console.log(`model: ${c.model}`)
  console.log(`temperature: ${c.temperature}`)
  console.log(`apiKey: ${Config.maskKey(c.apiKey) ?? "(none)"}`)
}
