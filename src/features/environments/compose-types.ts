/**
 * Tipos do compose e da compatibilidade de restauração. Módulo PURO (sem dependências de servidor),
 * importável tanto pelas regras quanto pelos componentes.
 */

export interface ComposeServiceSummary {
    name: string
    image: string | null
    build: string | null
    ports: string[]
    volumes: string[]
    environment: string[]
    containerName: string | null
    dependsOn: string[]
}

export interface ComposeSummary {
    file: string
    services: ComposeServiceSummary[]
    volumes: string[]
    networks: string[]
}

export type RestoreLevel = "compatible" | "confirm" | "blocked"

export interface RestoreCompatibility {
    level: RestoreLevel
    /** A restauração pode prosseguir (com ou sem confirmação já dada). */
    allowed: boolean
    requiresConfirmation: boolean
    message: string
}
