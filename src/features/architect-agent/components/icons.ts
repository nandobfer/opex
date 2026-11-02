import type { LucideIcon } from "lucide-react"
import { AlertTriangle, Boxes, Database, Flag, Globe, Network, Scale, User, Workflow } from "lucide-react"
import type { ArchitectNodeKind } from "../constants"

/** Ícone de cada tipo de nó do diagrama. */
export const ARCHITECT_NODE_KIND_ICONS: Record<ArchitectNodeKind, LucideIcon> = {
    objective: Flag,
    actor: User,
    process: Workflow,
    structure: Boxes,
    information: Database,
    external: Globe,
    decision: Scale,
    risk: AlertTriangle,
}

/** Ícone do Agente Arquiteto (aba da configuração). */
export const ARCHITECT_ICON = Network
