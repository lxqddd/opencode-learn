# OpenCode 复刻学习路线

> 目标：从 0 到 1，用同款技术栈（Bun + TypeScript + Effect 4 + SolidJS/opentui + Drizzle/SQLite + Vercel AI SDK）手动实现一个与 OpenCode 架构同构的 AI 编程代理（最小可运行版本）。
>
> 参考源码：`./sourceCode/`（不参与运行，仅作参考答案）
> 节奏假设：每天 2 小时，一个完整周末 ≈ 2.5 天；总时长 12~16 周。
> 原则：**25% 读源码 + 75% 自己写**，卡住才翻对应源码，不照抄。

---

## 0. 复刻边界（确定做什么、不做什幺）

### 必做（与 OpenCode 架构同构的最小集合）

| 模块 | 功能 | 对应源码 |
|---|---|---|
| CLI | ask/demo 命令、帮助、配置读取 | `sourceCode/packages/opencode/src/cli/` |
| 配置 | opencode.json + .env 凭据，Schema 运行时校验 | `sourceCode/packages/core/src/config/` |
| Provider | 1~2 个 LLM provider（openai-compatible + anthropic） | `sourceCode/packages/llm/src/providers/` |
| 会话 | Session/Message 持久化、恢复、多项目/多 worktree | `sourceCode/packages/core/src/session/` |
| 工具 | read / write / edit / bash / grep 注册表 | `sourceCode/packages/core/src/tool/` |
| 权限 | allow / ask / deny 三态 + 匹配规则 + 交互确认 | `sourceCode/packages/core/src/permission/` |
| Agent 循环 | 模型 → tool_call → 执行 → 回填 → 继续 | `sourceCode/packages/llm/src/tool-runtime.ts` |
| HTTP | REST + SSE 流式会话接口 | `sourceCode/packages/opencode/src/server/` |
| Context | System Context 注入 + Token 计数 + 压缩 | `sourceCode/packages/core/src/system-context/` |
| TUI | 消息列表 + 流式渲染 + 输入行 + 权限弹窗 | `sourceCode/packages/tui/src/` |

### 可后置（M7+ 可选）

- MCP 外部工具（`core/src/mcp/`）
- 插件系统 / 自定义命令 / Skills（`core/src/plugin/`、`packages/plugin/`）
- 多 provider 智能路由、成本统计、会话分享、Web/桌面 UI

### 不做的（V2 预留的集群化设计，单进程复刻不需要）

- EventV2 回放与 owner claim、Session placement、分布式 drain
- client 代码生成器（`httpapi-codegen`）、OpenAPI 自动生成
- 完整的多语言 README / 发布流水线

---

## 1. 技术预热（第 1~4 周：每周一个练手项目）

### W1 · Bun + TypeScript + CLI 骨架

**学什么**

- Bun 运行时：`bun run` / `bun test` / 环境变量 / `Bun.file()` / `Bun.env`
- TypeScript：`tsconfig`（`@tsconfig/bun`）、module 导出、`imports` 字段映射（`#db` 这种别名）
- yargs CLI 封装（opencode 用的就是 yargs）

**练手产出**

```bash
my-cli ask "你好"
# -> 打印当前配置里的 provider/model 后退出（先不连 LLM）
```

**读源码（对照 3 个文件）**

- `sourceCode/packages/opencode/src/index.ts` — yargs 注册方式、命令挂载
- `sourceCode/packages/opencode/src/cli/cmd/run/` — 一个最小命令如何组织
- `sourceCode/packages/opencode/src/cli/ui.ts` — 终端输出风格

**验收标准**

- [ ] `my-cli --help` 正常；`--model`、`--provider` 参数生效
- [ ] 配置来源优先级：CLI 参数 > .env > opencode.json

### W2 · Effect 4（重点中的重点，2 周消化）

> Effect 是这套源码的语言。学不会 Effect，后面的源码几乎无法读懂。顺序很重要。

**学什么（按此顺序）**

1. `Effect<Success, Error, Requirements>`：每个函数都是一个"可组合的依赖计算"，**惰性执行**
2. `Effect.gen` / `yield*`：顺序组合；`Effect.gen(function* () {...})` 的优雅写法
3. `Context.Tag` + `Layer`：依赖注入（服务接口 + 提供实现 + 层级组合）
4. `Schema`：运行时校验 + 类型导出（`Schema.decodeUnknownOption` 等人性化入口）
5. `Ref` / `Queue` / `PubSub`：共享状态、事件流
6. `Scope`（资源管理）、`Exit`（错误）、`Config`（环境配置）
7. `effect/unstable/http`：`HttpRouter` / `HttpServer` / 过滤器（M4 要用）
8. `Effect.gen` 注意事项：服务先 bind 到变量再用；不要嵌套 `yield* (yield* Foo.Service).bar()`（`AGENTS.md` 明确禁止）

**练手产出**

- 用 Layer 注入的 "todo CLI"：增删改查存 JSON，全部走 Effect。含 Schema 校验 + Error 分支
- Service A → Service B 的 Layer 组合

**读源码**

- `sourceCode/packages/core/src/config/` — 看 Effect 代码的组织风格（文件内 `export * as ConfigAgent` 自导出模式）
- `sourceCode/packages/core/src/provider.ts` — 典型的 Service Tag + Layer 结构
- `sourceCode/AGENTS.md` — 直接从"Style Guide"学团队的 Effect 写法约定（好过纯看文档）

**验收标准**

- [ ] 能徒手写出一个 `Layer` 注入两层的服务
- [ ] 看懂 `Schema.decodeUnknownOption`、`Effect.gen` 的 T 类型参数

### W3 · Drizzle + SQLite

**学什么**

- drizzle-orm + drizzle-kit：`sqliteTable`、migration 生成、query/insert
- effect-sqlite-node 与 drizzle 的适配（opencode 自研 `@opencode-ai/effect-drizzle-sqlite`，学习时直接读它）
- Schema 命名约定：字段用 snake_case，列名不需要再定义字符串（`AGENTS.md` Section Schema Definitions）

**练手产出**

- `session(id, project_id, created_at)` + `message(id, session_id, role, content, created_at)` 两张表
- migration 文件提交到 git；应用启动时自动/手动 migrate

**读源码**

- `sourceCode/packages/core/src/database/`（DB 初始化 + 运行事务 + migration 流程）
- `sourceCode/specs/storage/remove-opencode-db.md`（理解"为什么持久化长这样"）
- `sourceCode/packages/effect-drizzle-sqlite/`（drizzle 与 Effect 的胶水层）

**验收标准**

- [ ] 进程重启后数据还在
- [ ] 新表变更走 migration 而非删库重来

### W4 · SolidJS + opentui

**学什么（Solid 核心 5 个概念）**

1. `createSignal` / `createMemo`（原子级响应式）
2. `createEffect`（自动追踪）
3. `For` / `Show` 控制流
4. 上下文（`createContext`）+ 自定义渲染（opentui 场景不直接跑浏览器 DOM）
5. opentui 组件模型：`App`、`List`、`TextInput`、Keymap、主题 system

**练手产出**

- opentui 小程序：一个列表 + 底部输入框，方向键选中、回车打印到"日志面板"
- Solid 响应式完成：输入每击键刷新"预览面板"

**读源码**

- `sourceCode/packages/tui/src/app.tsx`（应用骨架）
- `sourceCode/packages/tui/src/component/`（先读 list.tsx / chat.tsx 两个）
- opentui 官方 demos（同目录 `node_modules` 不可用时看仓库里 `packages/tui/tsconfig.json` 引用）

**验收标准**

- [ ] 键盘导航 + 焦点管理 OK
- [ ] 能解释 opentui 的"虚拟 DOM→终端渲染"管线（比照 Solid 的机制）

---

## 2. 里程碑实施（第 5~14 周：从单体走到同构）

> 纪律：每 M 实现前**先读对应 spec 文档**，再写代码，最后对照源码。每 M 结束 `git tag mX`。

### M1 · 配置 + 阻塞问答（1 周）

**目标**：`my-cli ask "你好"` 真正连上 LLM，流式输出文字。

**顺序**：schema(配置结构) → 配置加载 → provider 服务 → LLM 流接口 → CLI 命令

**读源码**

- `specs/v2/config.md`（设计意图）
- `core/src/config/`（按模块拆分的配置）
- `core/src/provider.ts`、`core/src/model.ts`（provider + model 解析管线）
- `llm/src/llm.ts`、`llm/src/providers/`（推荐先看 openai-compatible 适配器，最通用）
- `core/src/credential.ts`（凭据拿取）

**写代码**

1. `Config` Schema：provider/model + 自定义 baseURL + 环境变量
2. `ProviderService`：`Context.Tag` + 两个实现（openai-compatible / anthropic）
3. `LLMService.stream()`：用 AI SDK `streamText` 打印增量 token

**验收标准**

- [ ] 换一个 model/key 均可用
- [ ] 配置错误（缺 key / 未知 model）有明确 Human-readable 报错

### M2 · 会话持久化（1.5 周）

**目标**：会话可断点续聊；纯 CLI 会话管理（list/message/resume）。

**读源码**

- `specs/v2/session.md`（先全文读完，再做）
- `core/src/session/`（Session 服务 + prompt 入口）
- `core/src/database/`（表结构 + migrate）

**写代码**

1. 表：`session` / `message`（含项目目录、模型、token 统计）
2. `prompt()`：追加消息 + 一条"用户输入" → LLM → 追加"assistant"消息（含 tool 部分为 M3 预留字段）
3. CLI：`my-cli session list` / `my-cli session --resume`

**验收标准**

- [ ] 重启进程后 `--resume` 续聊，上下文完整
- [ ] 多项目目录隔离（同目录才续得上）

### M3 · 工具系统 + 权限 + Agent 循环（2.5 周，项目核心）

**目标**：agent 自主完成"读文件 → 改文件 → 跑测试"闭环，且中间有权限控制。

**读源码**

- `specs/v2/tools.md`（工具 schema 与执行协议设计）
- `core/src/tool/`（注册表：Tool 接口、输出格式、执行器）
- `core/src/permission/`（规则匹配：allow/ask/deny）
- `llm/src/tool-runtime.ts`（tool_call 执行回填）
- `core/src/file.ts`、`core/src/pty.ts`（编辑与 bash 执行）

**写代码**

1. `Tool` 接口：`{ name, description, inputSchema, execute }` + 注册表
2. 内置工具：read / write / edit / bash / grep（bash 用 `cross-spawn` + 超时 + 输出上限）
3. `permission`：`ask` 时 CLI 交互（y/n/y-all），阻断式执行
4. `AgentLoop`：多轮：模型 → 工具调用（并行）→ 回填 → 继续，直到无 tool_call
5. 工具输出存储：大输出落盘、摘要进上下文（防止 token 爆炸）

**验收标准**

- [ ] 中文指令："看一下 xx 文件，说出行数" 能自动 read+grep
- [ ] 权限 ask 弹窗可拒绝，拒绝后 agent 能调整继续
- [ ] bash 输出超 10KB 被截断/落盘

### M4 · HTTP 服务化（1.5 周）

**目标**：core 逻辑与 TUI 解耦——一切通过 HTTP；SSE 流式。

**读源码**

- `packages/opencode/src/server/server.ts`（effect HttpServer 组装）
- `packages/opencode/src/server/routes/`（路由结构：session/message/permission）
- `packages/protocol/`（请求/响应契约）

**写代码**

- `POST /session`（创建）；`GET /session`（列表）
- `POST /session/:id/message`（SSE：`event: text-delta` 流式）
- permission 确认端点（阻塞等待用户外部确认）
- 手写一个 http client（node fetch），暂不做代码生成

**验收标准**

- [ ] 用 curl 能完成一轮对话（含流式）
- [ ] Server 与 core 分离：TUI 的所有数据只从 HTTP 拿

### M5 · TUI（2.5~3 周，最⻓但成就感最大）

**目标**：纯键盘聊天的完整终端体验。

**读源码（每写一个组件前读一个）**

- `tui/src/app.tsx`（壳：应用启动、快捷键路由）
- `tui/src/component/chat.tsx`（消息流列表）
- `tui/src/component/`（text input / 菜单 / 权限弹窗类似物）
- `tui/src/context/`（状态容器、主题）

**写代码（组件迭代顺序）**

1. Shell + 消息列表渲染（静态）
2. SSE 文本增量 → 逐帧刷新（节流到 ~10fps 保证不闪屏）
3. 输入行 + 多行粘贴 + Enter/Ctrl+C 处理
4. 权限 ask 弹窗（上下键选择 + vim 键位）
5. 快捷键：`/help` 斜杠命令、Tab 切换 agent（可后置）
6. 主题化（配色/边框风格参数化）

**验收标准**

- [ ] 一次完整流程不碰鼠标：输入 → 流式回答 → 权限确认 → 工具执行展示
- [ ] 长回答滚动平滑、不闪烁
- [ ] 窗口 resize 自适应

### M6 · 上下文工程（1.5 周）

**目标**：系统上下文注入 + 超长自动压缩。

**读源码（顺序：先概念后实现）**

- `CONTEXT.md`（整个"System Context / Session History / Context Epoch"词典 — 必读）
- `specs/v2/instructions.md`
- `core/src/system-context/`（注册表 + producer）
- `core/src/instruction-context.ts`

**写代码**

1. Context Source 注册表：cwd、git 状态、仓库说明（`.opencode` 同级 README/AGENTS）、最后一次工具输出摘要
2. Token 计数（`ai` 包自带 `countTokens`/文本按 4 字符粗算）
3. 阈值触发：消息达到预算 → 摘要旧消息 + 加"系统纪元"提示 → 基线重渲染
4. 结构：prompt 组装输出诊断命令 `my-cli debug context`

**验收标准**

- [ ] 10 轮对话上下文注入可见/有效
- [ ] 超过阈值后自动压缩，继续对话语义连续

### M7 · MCP + 插件系统（2 周，可选但强烈建议）

**目标**：加载外部 MCP server 作为工具；加载插件脚本增加命令/agent。

**读源码**

- `core/src/mcp/`（传输：stdio + sse；发现 + 校验 + 工具适配）
- `core/src/plugin/`、`packages/plugin/`（打包、导出协议）
- `packages/core/src/command.ts`（命令注册表）

**写代码**

1. MCP client：stdio 进程 spawn → JSON-RPC → `listTools` → schema 转换进 Tool 注册表 → 执行回传
2. 插件协议：打包为 bundle 的 `.js` + `export` 约定（commands/agents/configure）
3. 最小插件示例：注册一条自定义命令 `/praise`

**验收标准**

- [ ] `my-cli mcp add filesystem` 后，agent 能用 MCP 工具读写任意目录
- [ ] 插件命令 `/praise` TUI 内可用

### M8 · 打磨与扩展（1 周）

- 错误分类展示、重试、超时
- `.env` 与配置文件编辑器 `my-cli config`
- `my-cli debug context/session` 等内部调试子命令（学 `sourceCode/packages/opencode/src/cli/cmd/debug/` 的取舍）
- 多 provider 路由：失败切换（`cache-policy.ts` 里有效策略）

---

## 3. 常用速查

### 命令对照表

| 用途 | 参考命令 | 你的命令（示意） |
|---|---|---|
| 开发运行 | `bun dev`(root) | `bun run dev`（package 内） |
| 类型检查 | `tsgo --noEmit`（勿用 tsc） | 同 |
| 测试 | 包目录内 `bun test`（勿在根跑） | 同 |
| 调试 | `opencode debug v2/agent/config` | `my-cli debug ...` |
| 日志 | `~/.local/share/opencode/logs/` | `~/.local/share/my-cli/logs/` |

### 学习优先级（文件阅读金字塔）

```
specs/v2/*.md + client/AGENTS.md + CONTEXT.md   ← 为什么这样设计（先读）
packages/core/src/ (session/tool/permission)    ← 机制本体
packages/opencode/src/ (server/cli)             ← 组装与入口
packages/tui/src/ + packages/llm/               ← 表现与边缘
```

### 避坑清单

- 根目录跑 `bun test` 会报 `do-not-run-tests-from-root`（guard 配置于 `bunfig.toml`）
- 不要直接 `tsc`，统一 `tsgo --noEmit`（性能与行为差异大）
- Effect 里禁止 `import * as Foo`，用命名导入 + `namespace` 用途按需
- 权限默认 **deny**（安全优先），别学 demo 全 allow
- 工具输出做 token 预算（截断/落盘），这是"长期能用"与"demo 级"的分水岭

---

## 4. 总时间线一览

```text
W1-4  技术预热           B/TS CLI · Effect · Drizzle · Solid/opentui
W5-6   M1-M2             配置+问答 · 会话持久化
W7-9   M3 工具+权限+循环  （核心，可再加 1 周）
W10-11 M4-M5 服务化+TUI  TUI 可从 M4 并行开始
W12-13 M6-M7 上下文+MCP
W14    M8 打磨
```

13~14 周达成：一个具备 OpenCode 核心能力（多工具 agent + 权限 + 持久化 + TUI + HTTP API + MCP/插件）的自研实现。
