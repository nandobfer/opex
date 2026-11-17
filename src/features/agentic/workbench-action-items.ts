import type { WorkbenchAction } from "./logic"

/**
 * Descritor puro dos botões da barra da mesa (OPE-166): a barra do desktop e o dock do celular (`< lg`)
 * renderizam a partir da mesma lista, então rótulos, bloqueios e a ordem saem de uma regra só.
 */

export type FeedbackAction = Extract<WorkbenchAction, "revise-plan" | "request-correction" | "submit-pr-feedback" | "reopen">

/** Correções viram botão de ícone com dica no desktop; as demais (`submit-pr-feedback`, `reopen`) mantêm o texto. */
export type CorrectionAction = Extract<FeedbackAction, "revise-plan" | "request-correction">

export const FEEDBACK: Record<FeedbackAction, { button: string; title: string; placeholder: string; submit: string }> = {
    "revise-plan": { button: "Solicitar correção do plano", title: "O que precisa mudar no plano?", placeholder: "Ex.: não altere o schema; use o componente X; inclua testes de Y…", submit: "Enviar ao planejador" },
    "request-correction": { button: "Solicitar correção", title: "O que está errado?", placeholder: "Descreva o que não funcionou ou precisa mudar. Vai para o planejador, que refaz o plano.", submit: "Enviar ao planejador" },
    "submit-pr-feedback": { button: "Descrever as mudanças", title: "O que o PR pediu?", placeholder: "O PR pediu mudanças sem comentário: descreva o que precisa mudar.", submit: "Enviar ao planejador" },
    reopen: { button: "Reabrir mesa", title: "O que fazer agora?", placeholder: "Descreva o ajuste ou a continuação. Vai para o planejador.", submit: "Reabrir e planejar" },
}

export const isFeedback = (action: WorkbenchAction): action is FeedbackAction => action in FEEDBACK

export const isCorrection = (action: WorkbenchAction): action is CorrectionAction => action === "revise-plan" || action === "request-correction"

const CORRECTION_TOOLTIP: Record<CorrectionAction, string> = {
    "revise-plan": "Pedir mudanças no plano ao planejador",
    "request-correction": "Descrever o que está errado; vai para o planejador",
}

/** Bloqueio enquanto outra ação da mesa está em andamento. */
export const PENDING_REASON = "Aguarde a ação em andamento"

export const DELETING_REASON = "A mesa está sendo excluída"

export type ActionItemId = WorkbenchAction | "fork"

/** O que o clique faz: abre o fork, abre o campo de correção, executa, pede confirmação ou reconecta. */
export type ActionItemKind = "fork" | "composer" | "run" | "confirm" | "reconnect"

export interface WorkbenchActionItem {
    id: ActionItemId
    kind: ActionItemKind
    /** Nome completo (rótulo do desktop, do dock e da folha do celular; também o nome acessível). */
    label: string
    /** Explicação da ação (dica do botão de ícone e descrição na folha "Mais ações"). */
    hint: string | null
    /** Desktop: botão de ícone com dica (`TooltipIconButton`). */
    iconOnly: boolean
    variant: "default" | "outline"
    /** O botão de texto do desktop leva `aria-label` com o nome completo. */
    ariaLabel: boolean
    /** Motivo do bloqueio (`null` = disponível). No celular aparece em texto, sem depender de dica. */
    disabledReason: string | null
    /** `title` do botão de texto no desktop (ex.: anexo subindo no Implementar). */
    title: string | null
    ctrlEnter: boolean
}

export interface ActionItemsInput {
    actions: readonly WorkbenchAction[]
    /** Mesa com falha ou interrompida (a correção vira "Voltar ao planejamento"). */
    failed: boolean
    /** Outra ação da mesa em andamento. */
    pending: boolean
    prOpen: boolean
    deleting: boolean
    /** Anexo do "Informações adicionais" ainda subindo (bloqueia Implementar). */
    implementBlockReason: string | null
}

/** Ações que não viram botão da linha: a prévia abre pelo cabeçalho; as do adversário têm bloco próprio. */
const OUTSIDE_ROW = (action: WorkbenchAction) => action === "open-preview" || action === "rebuild-preview" || action.startsWith("adversarial-")

function item(id: ActionItemId, patch: Partial<WorkbenchActionItem> & Pick<WorkbenchActionItem, "kind" | "label">): WorkbenchActionItem {
    return { id, hint: null, iconOnly: false, variant: "default", ariaLabel: true, disabledReason: null, title: null, ctrlEnter: false, ...patch }
}

function actionItem(action: WorkbenchAction, input: ActionItemsInput): WorkbenchActionItem | null {
    const busy = input.pending ? PENDING_REASON : null
    if (isFeedback(action)) {
        if (isCorrection(action)) {
            const replan = action === "request-correction" && input.failed
            return item(action, {
                kind: "composer",
                label: replan ? "Voltar ao planejamento" : FEEDBACK[action].button,
                hint: replan ? "Voltar ao planejamento com uma correção" : CORRECTION_TOOLTIP[action],
                iconOnly: true,
                variant: "outline",
                disabledReason: busy,
            })
        }
        return item(action, { kind: "composer", label: FEEDBACK[action].button, variant: "outline", disabledReason: busy })
    }
    switch (action) {
        case "implement":
            return item(action, { kind: "run", label: "Implementar", ariaLabel: false, disabledReason: busy ?? input.implementBlockReason, title: input.implementBlockReason, ctrlEnter: true })
        case "approve":
            return input.prOpen ? item(action, { kind: "confirm", label: "Aprovar", disabledReason: busy }) : item(action, { kind: "confirm", label: "Aprovar e abrir PR", disabledReason: busy })
        case "reconnect":
            return item(action, { kind: "reconnect", label: "Reconectar ao agente", variant: "outline", hint: "Acompanha a sessão existente sem reenviar a mensagem (use se o agente ainda estiver rodando)." })
        case "retry":
            return item(action, { kind: "run", label: "Tentar novamente", disabledReason: busy })
        case "cancel-wait":
            return item(action, { kind: "confirm", label: "Cancelar espera", variant: "outline", disabledReason: busy })
        case "interrupt":
            return item(action, { kind: "confirm", label: "Parar", variant: "outline", ariaLabel: false, disabledReason: busy })
        default:
            return null
    }
}

/** Botões da linha de ações, na ordem do desktop: **Abrir fork** sempre primeiro, depois as ações da etapa. */
export function workbenchActionItems(input: ActionItemsInput): WorkbenchActionItem[] {
    const fork = item("fork", {
        kind: "fork",
        label: "Abrir fork",
        hint: "Abrir fork da conversa (perguntar ou investigar sem alterar a mesa)",
        iconOnly: true,
        variant: "outline",
        disabledReason: input.deleting ? DELETING_REASON : null,
    })
    const rest = input.actions.filter((action) => !OUTSIDE_ROW(action)).map((action) => actionItem(action, input))
    return [fork, ...rest.filter((value): value is WorkbenchActionItem => value !== null)]
}

/** Prioridade do botão principal do dock do celular (a ação que leva a mesa adiante). */
export const DOCK_PRIMARY_PRIORITY: readonly ActionItemId[] = ["implement", "approve", "retry", "reconnect", "submit-pr-feedback", "reopen", "cancel-wait", "interrupt", "request-correction", "revise-plan"]

export type DockPrimary = { type: "requests"; count: number } | { type: "adversarial" } | { type: "item"; item: WorkbenchActionItem } | null

export interface DockLayout {
    primary: DockPrimary
    /** Itens que vão para a folha "Mais ações" (o principal não se repete). */
    secondary: WorkbenchActionItem[]
}

/**
 * Dock do celular: um botão principal sempre no mesmo lugar e o resto na folha "Mais ações". Pedido do
 * agente esperando resposta vence tudo (é bloqueante), depois a decisão do bloqueio do adversário e, por
 * fim, a ação da etapa pela prioridade de `DOCK_PRIMARY_PRIORITY`.
 */
export function dockLayout({ items, requestCount, adversarialBlocked }: { items: readonly WorkbenchActionItem[]; requestCount: number; adversarialBlocked: boolean }): DockLayout {
    if (requestCount > 0) return { primary: { type: "requests", count: requestCount }, secondary: [...items] }
    if (adversarialBlocked) return { primary: { type: "adversarial" }, secondary: [...items] }
    const main = DOCK_PRIMARY_PRIORITY.map((id) => items.find((entry) => entry.id === id)).find((entry) => entry !== undefined)
    if (!main) return { primary: null, secondary: [...items] }
    return { primary: { type: "item", item: main }, secondary: items.filter((entry) => entry.id !== main.id) }
}

/** Rótulo do botão principal quando há pedidos do agente esperando. */
export const requestsLabel = (count: number) => (count === 1 ? "Responder pedido" : `Responder pedidos (${count})`)
