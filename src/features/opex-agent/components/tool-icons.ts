import { BrainCircuit, CalendarClock, Clock, Compass, GitPullRequest, LayoutDashboard, ListTodo, Paperclip, Plug, Receipt, Server, Sparkles, Users, Wallet, Workflow, Wrench, type LucideIcon } from "lucide-react"
import type { OpexToolGroup } from "../constants"

export const OPEX_TOOL_GROUP_ICONS: Record<OpexToolGroup, LucideIcon> = {
    context: Compass,
    files: Paperclip,
    tasks: ListTodo,
    previews: Sparkles,
    time: Clock,
    workbenches: Workflow,
    centrals: Server,
    integrations: Plug,
    routines: CalendarClock,
    "ai-settings": BrainCircuit,
    "pr-reviews": GitPullRequest,
    dashboard: LayoutDashboard,
    services: Receipt,
    finance: Wallet,
    clients: Users,
}

export const toolIcon = (group: OpexToolGroup | null): LucideIcon => (group ? OPEX_TOOL_GROUP_ICONS[group] : Wrench)
