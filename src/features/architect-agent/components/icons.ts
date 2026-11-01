import type { LucideIcon } from "lucide-react"
import { AlertTriangle, Box, Database, Flag, Globe, Layers, Library, Network, Route, Scale } from "lucide-react"
import type { ArchitectNodeKind } from "../constants"

/** Ícone de cada tipo de nó do diagrama. */
export const ARCHITECT_NODE_KIND_ICONS: Record<ArchitectNodeKind, LucideIcon> = {
    objective: Flag,
    module: Box,
    route: Route,
    feature: Layers,
    lib: Library,
    data: Database,
    external: Globe,
    decision: Scale,
    risk: AlertTriangle,
}

/** Ícone do Agente Arquiteto (aba da configuração). */
export const ARCHITECT_ICON = Network
