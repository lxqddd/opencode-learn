# My-OpenCode 复刻面试自测题（含完整应试答案）

> 适用范围：已完成部分（W1-W2 基础 + M1 配置/LLM 接入）
> 使用方法：完整答案为"话术版"——可直接练习；**举例一律用自己的项目细节**（FileConfigLoader / defined() / ChatError 等），面试官最吃"亲手实现"的证据。
>
> 文档已分五档：第一~三档（W/M1 基础）| 第四档 Q11-Q20（M2 会话/存储层）| 第五档 Q21（M3 前瞻综合题）
> 做题顺序：先第四档（当前阶段）→ 回做第一三档 → 最后 Q21 训练判断力

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

## 第四档 · 存储与会话层（M2 范围）

### Q11 · 为什么 DB 用 SQLite 而不是 JSON 文件或 Postgres？什么信号下该换？

**考察点**：数据库选型的判断力；"本地优先、随规模演进"的工程观

**完整答案**：

"选了 SQLite,三个理由:

1. **零运维**——单文件,不需要起服务,备份=拷贝文件;作为 CLI 工具的分发体验,不能要求用户装 Postgres
2. **成熟的 SQL**——会话/消息的查询(按目录查最近会话、按会话拉消息流)是真正的查询;JSON 文件做"读全量重写全量"在几百条消息后就扛不住增量写了
3. **并发写**——WAL 模式支持读-写并发,`findByDirectory` 读、`appendMessage` 写可以并行;JSON 文件没有这个保证(写时读会读到半截)

关键细节:SQLite 的 `PRAGMA foreign_keys=ON` 默认关着,级联删除默认不生效——我们的仓库测试真的抓到了这个坑,'删 session 后 message 还在'。所以把 `PRAGMA journal_mode=WAL / foreign_keys=ON` 放在了 `createDb()` 这个唯一连接入口,保证所有连接行为一致。

'什么信号换'——我的阈值是:① 多设备/多机器同步需求 ② 需要远程多客户端同时写 ③ 数据量到百万级且查询模式复杂。那时候换 Postgres。**对 agent 工具这种本地优先的产品,SQLite 是主流共识**(opencode 也是,虽然它们在按项目分库的演进中)。"

### Q12 · 复合索引 (session_id, time_created) 为什么是这个列序？

**考察点**：索引原理——列序匹配查询形状

**完整答案**：

"索引本质是**按列顺序组织好的 B-tree**。我 repo 里最高频的查询形状是:

```sql
WHERE session_id = ? ORDER BY time_created
```

复合索引 (session_id, time_created) 正好对上这个形状:第一列 session_id 用来精确过滤(定位到某个会话的树片段),而树片段内部**已经按 time_created 排好序**——查询直接顺序取,不需要再 sort。

如果反过来说 (time_created, session_id):第一列是范围不确定的列,SI 无法用它高效定位某个会话,需要整个索引里把符合会话的条目筛一遍,而且旧值新值混合——两个场景都会翻车。

一个误区是'多建几个单列索引':SQLite 虽然可能合并使用,但合并行为是黑盒。**复合索引的列序应该直接等于查询条件的使用顺序——等值列在前,排序/范围列在后**。我们加它的时候查询还没性能问题,但这叫'预判查询形状',在消息表这种写少读多、会被反复读历史的重载场景下收益明确。"

### Q13 · title 为什么用"首条 prompt 截断"？opencode 怎么做？代价是什么？

**考察点**：占位方案的诚实性;知道"何时升级"比"完美实现"更值钱

**完整答案**：

"当前实现是:**创建会话时取第一条 prompt 前 50 字符当 title,之后永不更新**。这是一眼可见的占位方案。

正面看:零成本让 `session list` 可辨识;负面看两个问题:
1. **语义漂移**——会话长跑后,topic 早变了,title 还停在第一句
2. **无法区分**——两条首句相同的会话无法分辨

源码的做法:opencode 有专门的 LLM 摘要任务(`title.txt` 提示词),后台给会话重命名;CLI 那侧也有 `rename` 命令。单条请求极便宜就换上——它们的选择是'体验>'成本'。

我的态度:**知道这是债务,且知道 M6(上下文工程)阶段升级——从'截断'变'LLM 摘要'时,甚至可以把 title 当作一次免费的 Context Source 应用**(为会话打标签也是 context 工程的一部分)。面试官问'代价',你要能说'产生可接受成本、有明确替换计划',而不是假装它是完美设计。"

### Q14 · 同一目录自动 attach 最近会话——设计上有没有坑？

**考察点**：隐性全局状态的边界;多项目场景的展望

**完整答案**：

"有,而且我知道具体坑:**目录即身份**太粗。

场景:同一个 repo 里有两个子目录各跑过一条 ask——因为 `realpath(cwd)` 不同所以两个会话,没问题;但如果两个不同项目恰好深链到同一 realpath(比如两个 worktree 通过 symlink 指向同一个?realpath 归一会让它们撞上),就会互相 attach——这就是 opencode 引入 **Project + Location + worktree 体系**的原因:身份不是'一个目录'而是'项目+目录+worktree'三元组。

我们的现状:`findByDirectory` 按目录串匹配,一个目录只有一个'最近会话'。**够 M2 用**——因为 M2 的诉求就是'同目录自然续聊'。真正的风险是 M6 前后:用户从两个终端同时在一个目录下各自开聊(比如工具修 bug 一个、问问题一个),就会被强行合并。

合理的演进:会话主动标识——`session new "标题"` 时清空/指定 attach 策略,或引入'agent-会话'隔离。我们 M2 就把 `--resume <id>` 留作显式 bypass,这是'自动默认+显式覆盖'的安全设计。**面试时回答'我清楚 tradeoff 且设计里有逃生口'即可**。"

### Q15 · 失败时 user 已落库、assistant 缺失——现场给修复方案

**考察点**：补偿/事务思维;从源码 admission 思想看问题

**完整答案**：

"现状:`promptStream` 先 appendMessage(user),再流式问答;请求失败时 user 留在库里、assistant 没有。下次 resume,模型看到'一条没被回答的问题',可能重复回答或困惑。

**方案 A(补偿删除)**——失败路径里 delete 刚写的 user 消息:
实现简单,messages 查询重载后不会出现孤儿。问题:如果失败发生在 assistant 被写了一半(我们没写,但如果加了'流式中途落库'),要么留半截要么回滚;且'失败'的定义要精确——用户 Ctrl+C 中断也走这里?

**方案 B(admission 分离,源码的思想)**——'用户输入'落库为独立不可见状态(源码的 `session_input` inbox),**执行成功后**才 promote 成可见消息:
```text
用户说 → 落 inbox(durable) → 执行 → 成功:promote 为可见 user+assistant 成对
                              → 失败:inbox 保留但不可见,等下次执行
```
优点:失败永远不产生'看到但没答'的会话状态;缺点:多了一张表/状态机。

**我的选择:马上修用 A(30 分钟,失败即补偿回滚),M3 后如果发现'失败被复用'场景频繁,再升到 B。**面试官想听到的是:知道问题、两方案、还能说出'当前规模选便宜的、核心概念与源码对齐'。

### Q16 · `if (!full) throw` 有什么问题？

**考察点**：区分"合法空"与"异常";结果建模

**完整答案**：

"问题在于把'模型语法成功但内容为空'和'底层的 request-failed'两个语义混成了一个。

`!full` 可能来自:① 模型返回了纯 thinking 不产文本(模型本来就可能——特别是新的 reasoning 风格模型)② 响应被上游截断(合法但空)③ 上下文相关。是否该 throw,取决于业务语义:对一个 agent 工具,空回复展示为'模型没有输出'比'报错'更真实。

正解是**让 streamChat 返回携带状态的结果**(而不是仅靠字符串判断):比如 `{ type: "text" | "empty" | "error" }` 的可辨联合,调用方显式分支。对应到我们的 `ChatError`,可以加 `empty-response` 这样的 kind——**分类比 bool 更可诊断**。这是一个典型的'用类型建模边界情形'的题,比'它应不应该报错'更有讨论深度。"

### Q17 · role 映射为什么是定时炸弹？

**考察点**：类型收窄与穷尽处理;预言未来扩展

**完整答案**：

"这句是炸弹:

```ts
role: m.role === "assistant" ? "assistant" : "user"
```

现在只有 user/assistant,M3 要加工具消息(role='tool')时,`else` 会把工具结果**静默当 user 内容塞进上下文**——模型以为'用户输出了一堆 shell 结果',语义直接污染,而且**无声无息**——这不是立刻崩,而是产生'行为怪但无报错'的最难解 bug。

对策:① role 是字符串联合类型(`"user" | "assistant" | "tool" | "system"`),不是裸 string ② 映射处写**显式穷尽分支**——没有覆盖的 role 类型走 `never` 检查,编译期给你报错:

```ts
const toChatRole = (role: string): ChatMessage["role"] => {
  if (role === "user") return "user"
  if (role === "assistant") return "assistant"
  throw new Error(`unsupported role: ${role}`)   // M3 加 tool 前必须修
}
```

**面试要点**:'早期的宽容会变成后期的沉默错误'——类型安全的一个实例。我也会主动承认:这是我现在就改的件(和 Q19 一样,在 M3 前)。

### Q18 · `as unknown as` 强转让你放弃什么？

**考察点**：drizzle 类型系统使用;schema 驱动的价值

**完整答案**：

```ts
const [row] = await this.db.insert(...).returning()
return row as unknown as Session    // 三重强转
```

放弃的是**编译期约束**。drizzle 的 `returning()` 本来会推断出列的精确类型;`as` 链把它降级成'手写类型说了算'。SQL 变了(加列/改列类型)时,drizzle 推断会变,但我们的 `Session` 类型是手写的——完全不同的地方一改，**类型漂移且编译不报**。

正解:drizzle 的 `.returning<Session>()` 支持泛型;或者表定义直接用 `$type<Session>()` 把 schema 和 TS 类型绑定——**schema 成为类型源头**,哪里变了整个链路都会跟着编译检查到。

这是'强转是债务、schema-as-type-source 是法币'的典型题。我会承认现在的写法是赶工期,但已知道怎么修——面试里'知道债务+知道根因+能说清修法'就是好的表现。

### Q19 · 每次 ask 都 `new SqliteSessionRepository(createDb())`——何时该有组合根？

**考察点**：组合根/ DI 容器引入时机;识别"重复组合"信号

**完整答案**：

"现状:cmd/ask.ts 里每次调用都 open db + 组装三个对象;session.ts 也重复了一次。现在——CLI 进程是短生命(每条命令一个进程),每次 new 也就 1 次;但坏味道已经在了:**组装逻辑散落在调用方**,将来 M3 加工具/权限,服务数 ×5,每个 cmd 都 copy 一段组装 = 维护噩梦。

信号:'组装重复出现 ≥2 处,且服务间有依赖图(工具依赖权限、权限依赖配置、编排依赖全部)'就是引入**组合根**的时刻——M3 开工时做:

```ts
// 组合根:一处构建、四处使用
export function createApp(configLoader: ConfigLoader, db: DrizzleDb) {
  return {
    session: new SessionService(configLoader, new SqliteSessionRepository(db)),
    llm: createLLM(...),
  }
}
```

面试官想听的:**知道组合根的职责(控制反转、测试替身入口、依赖图唯一位置)、知道引入阈值(不是'越早越好')**。说'现在是对的、M3 前会升'是成熟的判断。"

### Q20 · 测试覆盖了 repo 却没测 service——为什么 service 更值得测？

**考察点**：测试分层哲学——IO 样板 vs 业务规则

**完整答案**：

"因为**业务规则在 service,不在 repo**。repo(SqliteSessionRepository)是 50 行直白的 CRUD——它哪里脆弱,SQLite/方言的坑(比如 foreign_keys 那些)更多靠集成测试抓;真正值得放单元测试的是:

1. **上下文重组**:历史 messages → ChatMessage[] 的映射(role 拍扁的 bug 就在这里,Q17)
2. **失败路径**:streamChat 抛错时,user 消息如何处理(Q15)
3. **会话选择逻辑**:resume 优先 > 目录复用 > create
4. **append 顺序**:user 先、assistant 后,保证可重放

这些规则依赖注入的边界正好在'service-构造器接收 repo 与 llm 工厂'处——**我把 streamChat 换成 mock 就能测 service,这正是构造器注入的回报**。测试金字塔的启示:边界/样板的正确性靠小测试+集成,业务规则的保证靠 service 单元测试;漏掉它等于让路由、错误处理裸奔。

面试回答加分点:我主动说这是当前**最大的测试缺口**,并已列入 M3 start check。"

---

## 第五档 · 综合设计（压轴）

### Q21 · M3 要加工具系统，基于今天聊的问题你会先改哪三处？为什么？

**考察点**：判断力——优先级的依据;能否把"面试的散点"连成工程决策

**完整答案**：

"我不会直接开工 M3,而是先修三个前置——它们正是 M3 的直接前置依赖:

**1. migration 版本表**:M3 要给 message 加 `kind`/工具字段列。现在的 `CREATE TABLE IF NOT EXISTS` 对已有库无效——不解决就只能在 M3 里 drop 用户库。加一张 `schema_migrations` 版本表(30 行),把 '建列 vs 建表' 统一到版本化脚本。

**2. role 类型化**:工具消息的 role='tool' 进来,映射处 `else→user` 会立刻污染上下文。先改成显式穷尽映射。

**3. user 消息补偿回滚**:M3 权限拒绝本身就是失败路径——而且它是**业务预期内的失败**(用户 say no),会高频出现!这时'user 已落库、没有 assistant'会从低频 bug 变高频 bug。失败/拒绝必须统一走 compensation。

顺序依据:**先行性**(不修会导致 M3 必须返工)+ **高频性**(权限拒绝是 M3 第一天就有的路径)+ **数据安全**(迁移丢用户数据不可逆)。这是我判断优先级的三个标准——'如果 M3 出了 bug,先怀疑没改的这三处'。"

---

## 附:自测技巧

1. **举例子永远用自己项目**——`defined()`、`loadDotEnv`、`chdir 隔离单测` 都是具体证据
2. **每题 2 分钟**:先说结论(一句话),再展开理由(结构:需求→方案→取舍→对比源码)
3. Q2 / Q6 / Q8 是最能讲出深度的三题,重点练
