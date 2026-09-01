import { Config } from "@my/core"
import { ChatError, authCheck } from "@my/core/llm"

export const auth = async (overrides: Partial<Config.Overrides> = {}) => {
  const c = await Config.configLoader.resolve(overrides)
  try {
    await authCheck(c)
  } catch (error) {
    if (error instanceof ChatError) {
      console.error(`[错误] ${error.kind}: ${error.message}`)
    } else {
      console.error(`[错误] ${(error as Error)?.message ?? String(error)}`)
    }
  }
}
