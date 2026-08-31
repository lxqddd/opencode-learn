import { Console, Context, Effect, Layer, Schema } from "effect"

// ── 1. Effect 是惰性描述,不是立即执行 ─────────────────────────────
console.log("A: before creating")
const hello = Effect.succeed("hello")
console.log("B: created, not executed yet")
Effect.runSync(hello)
console.log("C: after runSync")

// ── 2. Effect.gen:顺序组合, yield* 等待并解包 ─────────────────────
const program = Effect.gen(function* () {
  yield* Console.log("first")
  const n = yield* Effect.succeed(42)
  yield* Console.log(`unwrapped n = ${n}`)
  return n * 2
})
const result = Effect.runSync(program)
console.log("D: result =", result)

// ── 3. 错误是类型的一部分, catchAll 兜底 ─────────────────────────
const risky = Effect.fail("boom")
const recovered = risky.pipe(
  Effect.catch((err) => Effect.succeed(`recovered: ${err}`)),
)
console.log("E:", Effect.runSync(recovered))

// ── 4. Context.Service + Layer:依赖注入(effect 4 beta 官方模式) ─────
export interface GreetingInterface {
  readonly text: string
}
export class Greeting extends Context.Service<Greeting, GreetingInterface>()("@my/Greeting") {}

const layer = Layer.succeed(Greeting, { text: "hi from layer" })

const useGreeting = Effect.gen(function* () {
  const g = yield* Greeting
  yield* Console.log(g.text)
})

Effect.runSync(useGreeting.pipe(Effect.provide(layer)))

// ── 5. Schema:运行时校验 + 类型推断 ────────────────────────────────
const Config = Schema.Struct({ provider: Schema.String, model: Schema.String })
type Inferred = Schema.Schema.Type<typeof Config>

const parsed = Schema.decodeUnknownSync(Config)({ provider: "openai", model: "gpt-4o" })
console.log("F: parsed =", parsed)

try {
  Schema.decodeUnknownSync(Config)({ provider: "openai" })
} catch (e) {
  console.log("G: validation failed as expected")
}
