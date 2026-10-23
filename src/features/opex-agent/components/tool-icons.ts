import { Brain, BrainCircuit, CalendarClock, Clock, Compass, FolderGit2, GitPullRequest, LayoutDashboard, ListTodo, Paperclip, Plug, Receipt, Server, Sparkles, Users, Wallet, Workflow, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"
import type { OpexClientToolGroup } from "../client-tools"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    files: Paperclip,
    memories: Brain,
    tasks: ListTodo,
    previews: Sparkles,
    time: Clock,
    workbenches: Workflow,
    centrals: Server,
    github: FolderGit2,
    integrations: Plug,
    routines: CalendarClock,
    "ai-settings": BrainCircuit,
    "pr-reviews": GitPullRequest,
    dashboard: LayoutDashboard,
    services: Receipt,
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
}

export const toolIcon = (group: OpexToolGroup | OpexClientToolGroup | null): LucideIcon => {
    if (!group) return Wrench
    return OPEX_TOOL_GROUP_ICONS[group as OpexToolGroup] ?? OPEX_CLIENT_GROUP_ICONS[group as OpexClientToolGroup] ?? Wrench
}
