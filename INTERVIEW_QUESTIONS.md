# My-OpenCode 复刻面试自测题（含完整应试答案）

> 适用范围：已完成部分（W1-W2 基础 + M1 配置/LLM 接入）
> 使用方法：完整答案为"话术版"——可直接练习；**举例一律用自己的项目细节**（FileConfigLoader / defined() / ChatError 等），面试官最吃"亲手实现"的证据。

---

## 第一档 · 基础掌握

### Q1 · `streamChat` 为什么用 async generator 而不是 `Promise<string>`？

**考察点**：流式 vs 全量的本质差异；生成器的惰性与中断能力

**完整答案**：

"这个问题的关键区别是**生产与消费的节奏**。

如果返回 `Promise<string>`，调用方只能等整个响应结束后拿到完整文本——用一句话 '废话',那打字机效果没了,对长回答体感极差,而且一旦请求失败整个 Promise 都要重来。如果返回 `Promise<string[]>`，则是'先攒后发'——它在内存里攒完所有 chunk 才一次性返回,既有内存成本也丢了实时性。

我用了 `async function*`:函数调用时只返回一个**惰性生成器**,真正的网络请求发生在调用方开始 `for await` 消费的那一刻（`for await (const part of result.textStream)` 内部才会触发 HTTP）。生产端每收到一个 token 就 `yield` 给消费端,消费端拿到就 `process.stdout.write(token)` 不打换行——这就是逐字打印的 '打字机' 效果的来源。

另外生成器天然支持**提前终止**:消费方 `break`/出错时,生成器停止,这为后面的 M3 实现用户 Esc 中断会话打了个基础(和 opencode 的受控取消模型同思路,不过他们用 Effect Fiber 实现)。"

### Q2 · 四级优先级合并怎么实现的？env 中 `OPENAI_BASE_URL` 不存在会发生什么？

**考察点**：spread 合并 + undefined 值陷阱（真实踩坑题，务必讲出具体场景）

**完整答案**：

"合并的代码是一行 spread:

```ts
return { ...defaults, ...defined(file.config), ...defined(env), ...defined(overrides) }
```

顺序就是优先级:代码默认值 < 配置文件 < 环境变量 < CLI 参数,后面覆盖前面。

但这里有个**我真实踩过的坑,而且是被一个单测逼出来的**:一开始我写完 `{ ...defaults, ...found.config, ...fromEnv(), ...defined(overrides) }`,其他来源我过滤了 undefined,唯独漏了 `env` 和文件。测试发现 `OPENAI_BASE_URL` 没设置时候 `fromEnv()` 返回 `{ baseURL: undefined, apiKey: undefined }`,spread 时这个 `undefined` 键让 `baseURL` 变成了 undefined——**未提供覆盖了已提供**,导致配置文件里的 baseURL 无效、请求打到默认官方端点才报错。

修复是抽了一个 `defined()`:合并前把对象里值为 undefined 的键过滤掉。类比我后来读源码看到的 idea:opencode 用 effect 的 Option 表达'有值/无值',我们是用 '键不存在' 表达。这个 bug 的深水区在于:JS 的 `{...a, ...{k: undefined}}` 是合法的、无报错、静默覆盖——全靠测试兜住。"

### Q3 · API key 写在哪、怎么被读到、为什么 `bun dev` 能读而直接 `node` 读不到？

**考察点**：环境变量生命周期、工具链差异

**完整答案**：

"key 在根目录 `.env`(已 gitignore,不进仓库),通过 `OPENAI_API_KEY` / `OPENAI_BASE_URL` 两个变量配置。

Bun 自带 `.env` 自动加载,但它只搜**当前工作目录附近**的 `.env`。问题来了:我们的 monorepo 里 `bun dev` 脚本的 cwd 是 `packages/my-cli`,所以根目录的 `.env` 根本不会被自动加载——第一次跑的时候它报 '缺少 API key',我才发现。

所以我写了个 `loadDotEnv()`:从 cwd 逐级向上找 `.env`(和找 opencode.json 的查找逻辑复用),找到后手动解析——处理 `#` 注释、单双引号、并且**不覆盖已存在的变量**(这是 dotenv 的规范行为,显式优先),写入 `process.env`。

再往上一层,`FileConfigLoader` 的 `fromEnv()` 不直接读 `process.env`,而是读**构造器注入的 env 参数**——这保证了单测里我可以注入假的 env 而不污染测试进程。"

---

## 第二档 · 架构决策

### Q4 · `ChatError` 为什么用 class + `kind`，不用原始 Error 或错误码字符串？

**考察点**：错误分类投影——错误翻译层的动机与设计

**完整答案**：

"考虑错误传播路径:AI SDK / fetch 抛出的错误是异构的——有的是 `Error` 带 message,有的是网络异常,有的是 HTTP 401,错误形态不固定、不稳定。

我做的 '错误分类投影' 是:在 `llm` 这一层**把外部错误翻译成领域内稳定的错误类型**:

```ts
export class ChatError extends Error {
  constructor(readonly kind: "missing-key" | "model-not-found" | "auth-failed" | "request-failed", message?: string) {...}
}
```

调用方(CLI)只要 `instanceof ChatError` + 按 `kind` 分支,拿到稳定的分类分类去匹配提示语;**正则识别 '模型不存在' 这种错误只在 llm 模块出现一次**。

为什么不直接用原始 Error?一是不同 SDK 版本错误结构会变,领域层层会污染;二是 UI 层会写一堆 `if (message.includes('404'))` 这种脆代码。为什么不返回错误码字符串?这样丢失 `instanceof` 和 `Error` 语义——日志框架、调试器看到的是 `[object Object]`,第一次实现用对象字面量就踩过这个坑。所以 'class + kind' 是两者折中:有 Error 语义,又有稳定分类。"

### Q5 · `FileConfigLoader` 构造器注入 `fs`/`env` 的目的是什么？

**考察点**：依赖注入的最小实践——'为什么接口 + 构造器'而非全局单例

**完整答案**：

"核心目的:**可测试性 + 环境隔离**。

`FileConfigLoader` 的构造是:

```ts
new FileConfigLoader(fs = Bun.file, env = Bun.env)
```

`fs` 和 `env` 都是可替换的依赖。单测时我注入 `{}` env、把 cwd chdir 到测试自己的临时目录,就能在不真实设置环境变量的情况下测试 'CLI 参数 > env > 文件' 的合并逻辑——不需要 mock 整个 Bun 环境。

不注入的后果:依赖退化成了隐式全局。想测 '某字段是数字时合并结果' 就得真实写临时文件、真实设环境变量,测试间互相污染,还会碰到之前 Q8 说的 'undefined 覆盖' 只能在生产环境暴露的尴尬。

这是 '接口 + 构造器注入' 的最简形态——单测试替身靠'构造参数'换掉即可。我对比过 opencode 的做法:它们用 Effect 的 `Context.Service` + `Layer` 做同样的事,收益是依赖声明在类型系统里、组合更强,代价是学习成本;对我这个学习项目,构造器注入是'够用且证伪成本低'的选择,等 M7 插件化再升级。"

### Q6 · `createProvider(config)` 为什么一个工厂服务所有 OpenAI 兼容端点？

**考察点**：协议思维——供应商抽象的正确粒度

**完整答案**：

"因为 **OpenAI 兼容是一份协议,不是一家公司**。协议约定:endpoint 形如 `{base}/chat/completions`、`Authorization: Bearer` 鉴权、同样的 request/response JSON 形状。任何实现了这份协议的厂商——Minimax、DeepSeek、Groq、本地的 Ollama——对我的代码来说是**同一个东西**,差异只有 baseURL 和 key。

所以我的 `createProvider(config)` 就是个工厂:

```ts
createOpenAICompatible({ baseURL, apiKey, name: config.provider })
```

`config.provider` 只是给 SDK 一个名字标签。切换供应商 = 改配置文件的 `baseURL`,业务代码零改动——这个协议抽象正是能支持这么多厂商的原因。

我在 opencode 源码里看到更强的验证:它们**连官方适配器都没用**,在 `llm/src/protocols/openai-compatible-chat.ts` 自研了协议实现,providers 目录里每个厂商只是 `configure({baseURL, provider})` 的调参——抽象画法和我的一模一样,只是自己掌握了协议实现。对我而言用官方 SDK 是成本最优:协议思想一致,少维护一个 HTTP 客户端。"

### Q7 · M1 为什么先做单轮问答,不直接上 agent loop？

**考察点**：依赖拓扑、增量验证——'先跑通再堆砌'的工程判断

**完整答案**：

"看依赖关系:agent loop 需要三个输入——**工具注册表**、**权限系统**、**会话历史**。没有会话,循环就是单轮;没有工具,循环没有事做;没有权限,工具执行不可控。所以 M1 只做 'Config → Provider → 单轮流式问答',是把依赖拓扑的**底层净水**:

1. 配置解析(数据入口校验)
2. provider 工厂(协议层)
3. 流式管道(执行层)

每一层都验证过了才往上叠。如果一开始就写 loop,一旦出错——是模型问题?工具调用解析问题?还是权限阻塞问题?三层 bug 互叠,排查时间翻倍。我现在每个 M 的验收标准都是'可运行的最小闭环',不是'全部功能':M1 验收是'真实流式问答+诊断命令',M3 开始才有'读文件改文件跑测试'的闭环。这也是我在学习路线里定的纪律:每章先读 spec(设计意图)→ 实现 → 对照源码,一步步逼近目标架构,而不是一把梭。"

---

## 第三档 · 情景与应变（开放讨论，给出思考路径）

### Q8 · `my-cli ask` 突然全部 `request-failed`,如何排查？

**参考思路**：

"我会按分层定位,而且**诊断命令就是为这可设计的**:

1. `my-cli config` 先看生效值——provider/model/baseURL 对不对(是不是 opencode.json 被改了,或 .env 漏了)
2. `my-cli auth` 验证连通性——401 = key 错,网络异常 = baseURL 错
3. `my-cli models` 看模型名还在不在列表里——'模型被下线'是高频事故
4. 还不行就看 `request-failed` 的 message 关键字:404→模型名;401→key;ECONNREFUSED→端点;超时→网络
5. 最后一步(如果还查不出):在 `llm` 层加参数打印请求 body 的 debug 子命令——源码里 `opencode debug v2/config` 就是这么干的,M8 我计划收录成 `my-cli debug llm`

关键点:排查顺序是**从配置层到网络层**,每层用现成的命令验证,不要在底层 SDK 里第一步就放 console.log。"

### Q9 · 配置文件里 `temperature: "hot"`(字符串)会怎样?你想怎么改?

**参考思路**：

"现在的情况:白名单检查 `typeof raw.temperature === "number"`,非数字被**静默丢弃**,落到默认值 0.7。行为无害,但是问题在**静默**——用户以为配了 0.3,实际用的是 0.7,无从察觉。

我会改成'**可诊断**'阶段:
- `fromFile` 解析时如果发现非法字段,收集 warnings(`field temperature: expected number, got "hot"`)
- `my-cli config` 输出里附上 warnings 列表
- 更高目标(M2/M6 后):整个配置文件 decode 失败时明确报错——对比 opencode 用 effect Schema 的 decodeOption 是'整体校验、失败整体拒绝',那是契约严格型;简化实现先做警告型,达到 90% 的收益,维护成本更低

这道题想表达的是:**'能容忍脏数据' 和 '容忍得让人知道' 是两件事**。"

### Q10 · opencode `llm` 包自研协议,我们用了官方 `@ai-sdk/openai-compatible`,怎么选？

**参考思路**：

"这是典型的'控制权 vs 交付速度'取舍。

**用官方 SDK**:
- 快:一行配置生产环境可用,官方维护错误处理、补丁
- 代价:抽象边界受 SDK 限制——错误形状、token 部分、工具调用格式我都不能改
- 适用:学习项目 / 非核心壁垒 / 团队没有专职协议层维护者

**自研**(opencode 的做法,`protocols/openai-compatible-chat.ts`):
- 收益:完全控制协议 —— 自定义错误分类、流式 chunk 解析、未来对接非 OpenAI 协议不用换架构
- 代价:自己维护 HTTP 客户端 + 测试矩阵,每加一个供应商都要回归
- 适用:核心产品是把'多供应商路由'当卖点——opencode 就是,它们还要支持 cloudflare 等非 openai 协议

我的判断:对'学习 architecture'的目的,官方 SDK 是正确选择——**思想(协议抽象)已通过看源码学到,SDK 只是实现**;如果日后我要做'任意供应商+错误重试策略'这种产品级功能,再往自研协议走不迟。面试里我会补充:我看过源码的自研路线,能讲出它们的取舍,这本身就是学习收益。"

---

## 附:自测技巧

1. **举例子永远用自己项目**——`defined()`、`loadDotEnv`、`chdir 隔离单测` 都是具体证据
2. **每题 2 分钟**:先说结论(一句话),再展开理由(结构:需求→方案→取舍→对比源码)
3. Q2 / Q6 / Q8 是最能讲出深度的三题,重点练
