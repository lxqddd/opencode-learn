import { join } from "node:path"
import { homedir } from "node:os"

export type Config = {
  provider: string
  model: string
  temperature: number
  apiKey?: string
}

export const defaults: Config = {
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
}

export async function findFileConfig(): Promise<{ path?: string; config: Partial<Config> }> {
  const globalPath = join(homedir(), ".config/my-cli/opencode.json")
  let dir = process.cwd()
  while (true) {
    const candidate = join(dir, "opencode.json")
    if (await Bun.file(candidate).exists()) {
      return { path: candidate, config: await fromFile(candidate) }
    }
    if (dir === homedir()) break
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  const global = await fromFile(globalPath)
  return { path: globalPath, config: global }
}

export async function fromFile(path: string): Promise<Partial<Config>> {
  if (!(await Bun.file(path).exists())) return {}
  try {
    const raw = (await Bun.file(path).json()) as Record<string, unknown>
    return {
      provider: typeof raw.provider === "string" ? raw.provider : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
      temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
    }
  } catch (error) {
    console.warn(`invalid config at ${path}: ${error}`)
    return {}
  }
}

export function fromEnv(): Partial<Config> {
  return { apiKey: Bun.env.OPENAI_API_KEY }
}

export async function resolveConfig(overrides: Partial<Config> = {}): Promise<Config> {
  const found = await findFileConfig()
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<Config>
  return { ...defaults, ...found.config, ...fromEnv(), ...defined }
}

export function maskKey(key?: string): string | undefined {
  if (!key) return undefined
  if (key.length <= 8) return "****"
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}
