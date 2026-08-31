import { join } from "node:path"
import { homedir } from "node:os"
import { Effect, Option, Schema } from "effect"

export const OverridesSchema = Schema.Struct({
  provider: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  apiKey: Schema.optional(Schema.String),
  temperature: Schema.optional(Schema.Number),
})
export type Overrides = Schema.Schema.Type<typeof OverridesSchema>

export const ConfigSchema = Schema.Struct({
  provider: Schema.String,
  model: Schema.String,
  temperature: Schema.Number,
  apiKey: Schema.optional(Schema.String),
})
export type Config = Schema.Schema.Type<typeof ConfigSchema>

export const defaults: Config = {
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
}

const fromFile = (path: string): Effect.Effect<Overrides> =>
  Effect.gen(function* () {
    const exists = yield* Effect.promise(() => Bun.file(path).exists())
    if (!exists) return {} as Overrides
    const raw: unknown = yield* Effect.promise(() => Bun.file(path).json())
    const decoded = Schema.decodeUnknownOption(OverridesSchema)(raw)
    return Option.getOrElse(decoded, () => ({} as Overrides))
  })

export async function findFileConfig(): Promise<{ path?: string; config: Overrides }> {
  const globalPath = join(homedir(), ".config/my-cli/opencode.json")
  let dir = process.cwd()
  while (true) {
    const candidate = join(dir, "opencode.json")
    if (await Bun.file(candidate).exists()) {
      return { path: candidate, config: await Effect.runPromise(fromFile(candidate)) }
    }
    if (dir === homedir()) break
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  const global = await Effect.runPromise(fromFile(globalPath))
  return { path: globalPath, config: global }
}

export function fromEnv(): Overrides {
  return { apiKey: Bun.env.OPENAI_API_KEY }
}

export async function resolveConfig(overrides: Overrides = {}): Promise<Config> {
  const found = await findFileConfig()
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Overrides
  return { ...defaults, ...found.config, ...fromEnv(), ...defined }
}

export function maskKey(key?: string): string | undefined {
  if (!key) return undefined
  if (key.length <= 8) return "****"
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}
