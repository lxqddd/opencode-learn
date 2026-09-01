import { join } from "node:path"
import { homedir } from "node:os"

export type Config = {
  provider: string
  model: string
  temperature: number
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
    return { apiKey: this.env.OPENAI_API_KEY }
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
