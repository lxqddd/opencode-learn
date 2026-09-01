import { Config } from "@my/core"
import { ChatError, listModels } from "@my/core/llm"

export const models = async (overrides: Partial<Config.Overrides> = {}) => {
  const c = await Config.configLoader.resolve(overrides)
  try {
    const ids = await listModels(c)
    console.log(`可用模型 (${ids.length}):`)
    for (const id of ids) console.log(`  ${id}`)
  } catch (error) {
    if (error instanceof ChatError) {
      console.error(`[错误] ${error.kind}: ${error.message}`)
    } else {
      console.error(`[错误] ${(error as Error)?.message ?? String(error)}`)
    }
  }
}
