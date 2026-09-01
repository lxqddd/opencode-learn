import { Config } from "@my/core"
import { ChatError, streamChat } from "@my/core/llm"

export const ask = async (overrides: Partial<Config.Overrides> = {}, prompt: string) => {
  const c = await Config.configLoader.resolve(overrides)
  console.log(`using: ${c.provider}/${c.model}`)
  try {
    for await (const token of streamChat(c, prompt)) {
      process.stdout.write(token)
    }
  } catch (error) {
    if (error instanceof ChatError) {
      const hints: Record<string, string> = {
        "missing-key": "请在 .env 中设置 OPENAI_API_KEY",
        "model-not-found": `检查 model 名称或运行 my-cli models 查看可用模型`,
        "auth-failed": `检查 .env 中的 key 与 baseURL (${c.baseURL ?? "http://api.openai.com/v1"})`,
        "request-failed": "请检查网络/端点配置",
      }
      console.error(`\n[错误] ${error.kind}: ${hints[error.kind] ?? ""} ${error.message}`)
    } else {
      console.error(`\n[错误] ${(error as Error)?.message ?? String(error)}`)
    }
  }
  process.stdout.write("\n")
}
