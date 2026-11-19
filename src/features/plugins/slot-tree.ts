import { PLUGIN_SLOTS, PLUGIN_SLOT_LABELS, type PluginScope, type PluginSlotName } from "./constants"

/**
 * Catálogo dos slots em árvore (OPE-172). Módulo PURO. Cada nó é uma **área** (só agrupa; não é
 * slot) ou um **slot** (lugar onde o plugin monta algo). Os ids dos slots são os de `PLUGIN_SLOTS`;
 * os das áreas começam com `area:`. A árvore alimenta o filtro da lista, os selos com o caminho
 * completo e o SDK (`.opex-sdk/slots.json`).
 */

export type PluginSlotTreeNode =
    | { kind: "area"; id: `area:${string}`; label: string; description: string; children: PluginSlotTreeNode[] }
    | { kind: "slot"; id: PluginSlotName; label: string; description: string }

const slot = (id: PluginSlotName, description: string): PluginSlotTreeNode => ({ kind: "slot", id, label: PLUGIN_SLOT_LABELS[id], description })
const area = (id: string, label: string, description: string, children: PluginSlotTreeNode[]): PluginSlotTreeNode => ({ kind: "area", id: `area:${id}`, label, description, children })

export const PLUGIN_SLOT_TREE: Record<PluginScope, PluginSlotTreeNode[]> = {
    owner: [
        area("shell", "Casca do app", "Partes fixas em todas as telas do dono", [
            area("sidebar", "Barra lateral", "Menu do app", [
                slot("sidebar.nav", "Itens na seção Plugins do menu (lista `nav` do manifesto)"),
                slot("sidebar.nav.agentes", "Itens dentro do menu Agentes (`nav[].slot`)"),
                slot("sidebar.nav.contabil", "Itens dentro do menu Contábil (`nav[].slot`)"),
                slot("sidebar.nav.configuracoes", "Itens dentro do menu Configurações (`nav[].slot`)"),
                slot("topbar.actions", "Ações: no desktop, no rodapé da barra lateral; no celular, no cabeçalho"),
            ]),
        ]),
        area("dashboard", "Dashboards", "Tela inicial (/dashboard)", [
            slot("dashboard.widgets", "Cards no fim da página"),
            slot("dashboard.section.tarefas", "Cards no fim da seção Visão geral de tarefas"),
            slot("dashboard.section.financeiro", "Cards no fim da seção Financeiro"),
            slot("dashboard.section.horas", "Cards no fim da seção Horas agênticas"),
            slot("dashboard.section.central", "Cards no fim da seção Central de desenvolvimento"),
        ]),
        area("tasks", "Tarefas", "Quadro e página da tarefa", [
            slot("tasks.header", "Bloco acima do quadro em /tarefas"),
            area("task-page", "Página da tarefa", "Detalhe de uma tarefa", [
                slot("task.panel", "Aba extra (props `{ task }`)"),
                slot("task.sidebar", "Cards na coluna lateral (props `{ task }`)"),
            ]),
        ]),
        area("dev-center", "Central de desenvolvimento", "Mesas de desenvolvimento", [slot("workbench.panel", "Aba extra da mesa (props `{ workbenchId, taskId }`)")]),
        area("contabil", "Contábil", "Telas do menu Contábil", [
            slot("financeiro.widgets", "Cards no topo de /financeiro"),
            slot("horas.widgets", "Cards no topo de /tarefas/horas"),
        ]),
    ],
    client: [
        slot("portal.nav", "Itens no menu do portal (lista `nav` do manifesto)"),
        slot("portal.dashboard.widgets", "Cards no Dashboard do portal (props `{ clientId }`)"),
        area("portal-tasks", "Tarefas", "Lista e página da tarefa no portal", [
            slot("portal.tasks.header", "Bloco no topo da lista de tarefas (props `{ clientId }`)"),
            slot("portal.task.panel", "Aba na página da tarefa (props `{ taskId, clientId }`)"),
        ]),
    ],
}

/** Nó achatado (para listas e o filtro): caminho de rótulos, profundidade e pai. */
export interface FlatSlotNode {
    id: string
    kind: "area" | "slot"
    label: string
    description: string
    depth: number
    parentId: string | null
    /** Rótulos da raiz até o nó ("Casca do app › Barra lateral › Menu Agentes"). */
    path: string[]
    /** Slots (folhas) abaixo do nó; num slot, ele mesmo. */
    slots: PluginSlotName[]
}

function flatten(nodes: readonly PluginSlotTreeNode[], depth: number, parent: FlatSlotNode | null, out: FlatSlotNode[]): PluginSlotName[] {
    const leaves: PluginSlotName[] = []
    for (const node of nodes) {
        const path = [...(parent?.path ?? []), node.label]
        const flat: FlatSlotNode = { id: node.id, kind: node.kind, label: node.label, description: node.description, depth, parentId: parent?.id ?? null, path, slots: [] }
        out.push(flat)
        flat.slots = node.kind === "slot" ? [node.id] : flatten(node.children, depth + 1, flat, out)
        leaves.push(...flat.slots)
    }
    return leaves
}

const FLAT: Record<PluginScope, FlatSlotNode[]> = { owner: [], client: [] }
for (const scope of ["owner", "client"] as const) flatten(PLUGIN_SLOT_TREE[scope], 0, null, FLAT[scope])

/** Árvore achatada na ordem de leitura (pai antes dos filhos). Sem escopo: dono e depois portal. */
export function flatSlotTree(scope?: PluginScope): FlatSlotNode[] {
    return scope ? FLAT[scope] : [...FLAT.owner, ...FLAT.client]
}

const SCOPE_ROOT_LABELS: Record<PluginScope, string> = { owner: "Dono", client: "Portal do cliente" }

/**
 * Nós do filtro de slots: com escopo, a árvore dele; sem escopo (o dono vê os dois), cada escopo vira
 * uma área raiz (`area:owner`, `area:client`) com a árvore dentro.
 */
export function slotFilterNodes(scope?: PluginScope): FlatSlotNode[] {
    if (scope) return FLAT[scope]
    return (["owner", "client"] as const).flatMap((root) => {
        const rootId = `area:${root}`
        const head: FlatSlotNode = { id: rootId, kind: "area", label: SCOPE_ROOT_LABELS[root], description: root === "owner" ? "Slots do app do dono" : "Slots do portal do cliente", depth: 0, parentId: null, path: [SCOPE_ROOT_LABELS[root]], slots: FLAT[root].filter((node) => node.kind === "slot").map((node) => node.slots[0]!) }
        return [head, ...FLAT[root].map((node) => ({ ...node, depth: node.depth + 1, parentId: node.parentId ?? rootId, path: [SCOPE_ROOT_LABELS[root], ...node.path] }))]
    })
}

const BY_ID = new Map([...slotFilterNodes().filter((node) => node.depth === 0), ...flatSlotTree()].map((node) => [node.id, node]))
export const PLUGIN_SLOT_NODE_IDS: readonly string[] = slotFilterNodes().map((node) => node.id)

export const slotNode = (id: string): FlatSlotNode | undefined => BY_ID.get(id)

/** Caminho legível do slot ("Dashboards › Seção Financeiro"); id desconhecido volta como está. */
export function slotPathLabel(id: string, separator = " › "): string {
    return BY_ID.get(id)?.path.join(separator) ?? id
}

/** Slots (folhas) cobertos por uma seleção de nós: escolher uma área cobre todos os slots abaixo dela. */
export function expandSlotSelection(ids: readonly string[]): Set<PluginSlotName> {
    return new Set(ids.flatMap((id) => BY_ID.get(id)?.slots ?? ((PLUGIN_SLOTS as readonly string[]).includes(id) ? [id as PluginSlotName] : [])))
}

/** Nó-área? (não é slot: o manifesto recusa). */
export const isSlotArea = (id: string) => id.startsWith("area:")
