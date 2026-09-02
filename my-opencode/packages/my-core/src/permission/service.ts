export type Decision = "allow" | "ask" | "deny"

export class PermissionDenied extends Error {
  constructor(
    readonly tool: string,
    readonly resource: string,
  ) {
    super(
      `permission denied: the user rejected ${tool} on "${resource.slice(0, 100)}". Do not retry the same action; ask the user or find another approach.`,
    )
  }
}

export type AskReply = "once" | "always" | "reject"
export type AskFn = (tool: string, resource: string) => Promise<AskReply>

export interface PermissionRule {
  tool: string
  pattern?: string
  decision: Decision
}

const DEFAULT_POLICY: Record<string, Decision> = {
  read: "allow",
  grep: "allow",
  edit: "ask",
  write: "ask",
  bash: "ask",
}

function prefixOf(tool: string, resource: string): string {
  if (tool === "bash") return resource.split(/\s+/)[0] ?? resource
  return resource
}

export function pickResource(tool: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>
  if (tool === "bash" && typeof args.command === "string") return args.command
  if (typeof args.path === "string") return args.path
  if (typeof args.pattern === "string") return args.pattern
  return JSON.stringify(args).slice(0, 200)
}

export class PermissionService {
  private rules: PermissionRule[] = []

  constructor(private ask: AskFn) {}

  evaluate(tool: string, resource: string): Decision {
    for (const r of this.rules) {
      if (r.tool !== tool && r.tool !== "*") continue
      if (r.pattern && !resource.startsWith(r.pattern)) continue
      return r.decision
    }
    return DEFAULT_POLICY[tool] ?? "deny"
  }

  save(rule: PermissionRule): void {
    this.rules.unshift(rule)
  }

  async assert(tool: string, resource: string): Promise<void> {
    const decision = this.evaluate(tool, resource)
    if (decision === "allow") return
    if (decision === "deny") throw new PermissionDenied(tool, resource)
    const reply = await this.ask(tool, resource)
    if (reply === "reject") throw new PermissionDenied(tool, resource)
    if (reply === "always") this.save({ tool, pattern: prefixOf(tool, resource), decision: "allow" })
  }
}
