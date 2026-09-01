import { join } from "node:path"
import { homedir } from "node:os"

export type Config = {
  provider: string
  model: string
  temperature: number
  baseURL?: string
  apiKey?: string
}

export type Overrides = Partial<Config>

export const defaults: Config = {
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
}

export interface ConfigLoader {
  resolve(overrides?: Overrides): Promise<Config>
  readonly sourcePath?: string
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)

export async function loadDotEnv(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  let dir = process.cwd()
  while (true) {
    const candidate = join(dir, ".env")
    if (await Bun.file(candidate).exists()) {
      const text = await Bun.file(candidate).text()
      for (const line of text.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const eq = trimmed.indexOf("=")
        if (eq === -1) continue
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (env[key] === undefined) env[key] = value
      }
      return true
    }
    if (dir === homedir()) break
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  return false
}

export class FileConfigLoader implements ConfigLoader {
  constructor(
    private fs = Bun.file,
    private env: Record<string, string | undefined> = Bun.env,
  ) {}

  sourcePath?: string

  private async fromFile(path: string): Promise<Overrides> {
    if (!(await this.fs(path).exists())) return {}
    try {
      const raw = (await this.fs(path).json()) as Record<string, unknown>
      return {
        provider: str(raw.provider),
        model: str(raw.model),
        baseURL: str(raw.baseURL),
        apiKey: str(raw.apiKey),
        temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
      }
    } catch (error) {
      console.warn(`invalid config at ${path}: ${error}`)
      return {}
    }
  }

  private async findFileConfig(): Promise<{ path?: string; config: Overrides }> {
    const globalPath = join(homedir(), ".config/my-cli/opencode.json")
    let dir = process.cwd()
    while (true) {
      const candidate = join(dir, "opencode.json")
      if (await this.fs(candidate).exists()) {
        return { path: candidate, config: await this.fromFile(candidate) }
      }
      if (dir === homedir()) break
      const parent = join(dir, "..")
      if (parent === dir) break
      dir = parent
    }
    const global = await this.fromFile(globalPath)
    return { path: globalPath, config: global }
  }

  private fromEnv(): Overrides {
    return { apiKey: this.env.OPENAI_API_KEY, baseURL: this.env.OPENAI_BASE_URL }
  }

  async resolve(overrides: Overrides = {}): Promise<Config> {
    const found = await this.findFileConfig()
    this.sourcePath = found.path
    const defined = Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ) as Overrides
    return { ...defaults, ...found.config, ...this.fromEnv(), ...defined }
  }
}

export const configLoader: ConfigLoader = new FileConfigLoader()

export function maskKey(key?: string): string | undefined {
  if (!key) return undefined
  if (key.length <= 8) return "****"
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}
