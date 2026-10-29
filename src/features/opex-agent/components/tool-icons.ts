import { AlarmClock, BookOpen, Brain, BrainCircuit, CalendarClock, Clock, Compass, FolderGit2, GitPullRequest, LayoutDashboard, Network, ListTodo, Paperclip, Plug, Receipt, Server, Sparkles, SquareTerminal, Users, Wallet, Workflow, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"
import type { OpexClientToolGroup } from "../client-tools"

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
}

const OPEX_CLIENT_GROUP_ICONS: Record<OpexClientToolGroup, LucideIcon> = {
    context: Compass,
    tasks: ListTodo,
    previews: Sparkles,
    files: Paperclip,
    dashboard: LayoutDashboard,
    finance: Wallet,
    users: Users,
    jobs: AlarmClock,
}

export const toolIcon = (group: OpexToolGroup | OpexClientToolGroup | null): LucideIcon => {
    if (!group) return Wrench
    return OPEX_TOOL_GROUP_ICONS[group as OpexToolGroup] ?? OPEX_CLIENT_GROUP_ICONS[group as OpexClientToolGroup] ?? Wrench
}
