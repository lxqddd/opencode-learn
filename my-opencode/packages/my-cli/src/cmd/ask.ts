import { Config } from "@my/core"
import { ChatError } from "@my/core/llm"
import { createApp } from "@my/core/app"

export const ask = async (
  overrides: Partial<Config.Overrides> = {},
  prompt: string,
  opts: { resume?: string } = {},
) => {
  const c = await Config.configLoader.resolve(overrides)
  const app = await createApp()
  console.log(`using: ${c.provider}/${c.model}${opts.resume ? ` (resume ${opts.resume})` : ""}`)
  try {
    for await (const token of app.session.promptStream({ prompt, resume: opts.resume })) {
      process.stdout.write(token)
    }
    console.log(`\nsession: ${app.session.sessionId}`)
  } catch (error) {
    if (error instanceof ChatError) {
      const hints: Record<string, string> = {
        "missing-key": "请在 .env 中设置 OPENAI_API_KEY",
        "model-not-found": "检查 model 名称或运行 my-cli models 查看可用模型",
        "auth-failed": "检查 .env 中的 key 与 baseURL",
        "request-failed": "请检查网络/端点配置",
      }
      console.error(`\n[错误] ${error.kind}: ${hints[error.kind] ?? ""} ${error.message}`)
    } else {
      console.error(`\n[错误] ${(error as Error)?.message ?? String(error)}`)
    }
  }
}
