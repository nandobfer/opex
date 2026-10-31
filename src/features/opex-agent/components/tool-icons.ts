import { AlarmClock, BookOpen, Terminal, Bot, Boxes, Brain, BrainCircuit, Cable, CalendarClock, Clock, Compass, FolderGit2, GitPullRequest, LayoutDashboard, Network, ListTodo, Paperclip, Plug, PlugZap, Puzzle, Receipt, Server, Sparkles, SquareTerminal, Users, Wallet, Workflow, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"
import type { OpexClientToolGroup } from "../client-tools"
import { OPEX_MCP_TOOL_GROUP } from "../mcp"
import { MADDOX_NATIVE_TOOL_GROUP } from "@/features/maddox-agent/constants"
import type { OpexToolPartGroup } from "../types"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    docs: BookOpen,
    files: Paperclip,
    memories: Brain,
    tasks: ListTodo,
    previews: Sparkles,
    time: Clock,
    workbenches: Workflow,
    centrals: Server,
    github: FolderGit2,
    issues: Network,
    integrations: Plug,
    routines: CalendarClock,
    jobs: AlarmClock,
    "ai-settings": BrainCircuit,
    "pr-reviews": GitPullRequest,
    dashboard: LayoutDashboard,
    services: Receipt,
    host: SquareTerminal,
    finance: Wallet,
    clients: Users,
    environments: Boxes,
    "opencode-service": Bot,
    "opencode-resources": Puzzle,
    mcps: PlugZap,
}

const OPEX_CLIENT_GROUP_ICONS: Record<OpexClientToolGroup, LucideIcon> = {
    context: Compass,
    tasks: ListTodo,
    previews: Sparkles,
    files: Paperclip,
    dashboard: LayoutDashboard,
    environments: Boxes,
    finance: Wallet,
    users: Users,
    jobs: AlarmClock,
}

export const toolIcon = (group: OpexToolPartGroup | null): LucideIcon => {
    if (!group) return Wrench
    if (group === OPEX_MCP_TOOL_GROUP) return Cable
    // Agente Maddox: ferramentas nativas do OpenCode (terminal, arquivos, MCPs do OpenCode…).
    if (group === MADDOX_NATIVE_TOOL_GROUP) return Terminal
    return OPEX_TOOL_GROUP_ICONS[group as OpexToolGroup] ?? OPEX_CLIENT_GROUP_ICONS[group as OpexClientToolGroup] ?? Wrench
}
