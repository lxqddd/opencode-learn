import { Console, Effect, Schedule, Schema } from 'effect'

const ConfigSchema = Schema.Struct({
  model: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String)
})

export type Config = Schema.Schema.Type<typeof ConfigSchema>

const fn = Effect.sync(() => 1 + 1)
const ret = Effect.runSync(fn)
console.log(ret)


const prog = Effect.gen(function* () {
  const a = yield* Effect.succeed(10)
  const b = yield* Effect.succeed(20)
  return a+b
})

const retProg = Effect.runSync(prog)
console.log(retProg)


const tapE = Effect.succeed(30).pipe(
  Effect.tap((n) => Console.log(`拿到的值为：${n}`)),
  Effect.map(n => n * 2),
  Effect.as(666)
)

console.log('tapE ===>', Effect.runSync(tapE))


const flaky = Effect.gen(function* () {
  const ok = yield* Effect.sync(() => Math.random() > 0.99)
  if (!ok) return yield* Effect.fail("wobble")
  return "ok"
})
flaky.pipe(
  Effect.retry({ times: 5, schedule: Schedule.spaced("100 millis") }),   // 失败重试直到成功/次数耗尽
  Effect.timeoutOption("2 minute"),                  // 超时中断 → Option.None
)

console.log(Effect.runSync(flaky))