import { Bot, Puzzle, ServerCog, Sparkles, SquareSlash, type LucideIcon } from "lucide-react"
import type { OpencodeResourceKind } from "../constants"

/** Textos e capacidades de cada aba de recursos do OpenCode. */

export interface KindUi {
    title: string
    description: string
    icon: LucideIcon
    canCreate: boolean
    createLabel: string
    canInstall: boolean
    installLabel: string
    installSourceLabel: string
    installSourcePlaceholder: string
    hasVersions: boolean
    removeVerb: string
    emptyTitle: string
    emptyDescription: string
}

export const KIND_UI: Record<OpencodeResourceKind, KindUi> = {
    skill: {
        title: "Skills",
        description: "Instruções reutilizáveis (SKILL.md) que os agentes carregam sob demanda. Crie à mão ou instale de um repositório.",
        icon: Sparkles,
        canCreate: true,
        createLabel: "Nova skill",
        canInstall: true,
        installLabel: "Instalar de repositório",
        installSourceLabel: "Repositório",
        installSourcePlaceholder: "dono/repositorio ou https://github.com/dono/repositorio",
        hasVersions: true,
        removeVerb: "Excluir",
        emptyTitle: "Nenhuma skill neste escopo",
        emptyDescription: "Crie uma skill ou instale de um repositório.",
    },
    agent: {
        title: "Agentes",
        description: "Agentes e subagentes em Markdown (frontmatter + prompt) ou no JSON da configuração. Os nativos e os de plugins são só leitura.",
        icon: Bot,
        canCreate: true,
        createLabel: "Novo agente",
        canInstall: false,
        installLabel: "",
        installSourceLabel: "",
        installSourcePlaceholder: "",
        hasVersions: false,
        removeVerb: "Excluir",
        emptyTitle: "Nenhum agente neste escopo",
        emptyDescription: "Crie um agente com o prompt e o modo (primário ou subagente).",
    },
    command: {
        title: "Comandos",
        description: "Comandos de barra (/nome) com template em Markdown. Os nativos e os de plugins são só leitura.",
        icon: SquareSlash,
        canCreate: true,
        createLabel: "Novo comando",
        canInstall: false,
        installLabel: "",
        installSourceLabel: "",
        installSourcePlaceholder: "",
        hasVersions: false,
        removeVerb: "Excluir",
        emptyTitle: "Nenhum comando neste escopo",
        emptyDescription: "Crie um comando com o template que o agente recebe.",
    },
    plugin: {
        title: "Plugins",
        description: "Pacotes npm ou repositórios que estendem o OpenCode. Instalar, atualizar ou desligar só vale depois de reiniciar o serviço.",
        icon: Puzzle,
        canCreate: false,
        createLabel: "",
        canInstall: true,
        installLabel: "Instalar plugin",
        installSourceLabel: "Pacote",
        installSourcePlaceholder: "nome-do-pacote, nome@1.2.3 ou github:dono/repo",
        hasVersions: true,
        removeVerb: "Desinstalar",
        emptyTitle: "Nenhum plugin neste escopo",
        emptyDescription: "Instale um plugin por pacote npm ou repositório.",
    },
    mcp: {
        title: "MCPs",
        description: "Servidores MCP locais (comando) ou remotos (URL). Variáveis e cabeçalhos são segredos: nunca são exibidos.",
        icon: ServerCog,
        canCreate: true,
        createLabel: "Adicionar MCP",
        canInstall: true,
        installLabel: "Instalar de pacote",
        installSourceLabel: "Pacote ou repositório",
        installSourcePlaceholder: "@escopo/servidor-mcp ou github:dono/repo",
        hasVersions: true,
        removeVerb: "Remover",
        emptyTitle: "Nenhum MCP neste escopo",
        emptyDescription: "Adicione um MCP local ou remoto, ou instale de um pacote.",
    },
}
