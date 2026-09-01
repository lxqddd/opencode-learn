import { Config } from "@my/core"
import { streamChat } from "@my/core/llm"

export const ask = async (overrides: Partial<Config.Overrides> = {}, prompt: string) => {
  const c = await Config.configLoader.resolve(overrides)
  console.log(`using: ${c.provider}/${c.model}`)
  try {
    for await (const token of streamChat(c, prompt)) {
      process.stdout.write(token)
    }
  } catch (error) {
    const e = error as { kind?: string; message?: string }
    if (e.kind === "missing-key") {
      console.error("\n[错误] 缺少 API key:请在 .env 中设置 OPENAI_API_KEY")
    } else if (e.kind === "model-not-found") {
      console.error(`\n[错误] 模型不存在:${c.model}。检查 model 名称或改用 my-cli models 查看可用模型`)
    } else if (e.kind === "request-failed") {
      console.error(`\n[错误] 请求失败:${e.message ?? "未知原因"}`)
    } else {
      console.error(`\n[错误] ${(error as Error).message ?? String(error)}`)
    }
  }
  process.stdout.write("\n")
}
