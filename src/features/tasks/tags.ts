/**
 * Vocabulário de tags das tarefas (módulo PURO, cliente e servidor). A **taxonomia** é fechada e
 * gerenciada na aba "Tags de tarefas" (Integrações › Provedores de IA), persistida na configuração
 * da feature `task-tags`. As tarefas guardam apenas os `id` das tags (estáveis); o rótulo é
 * resolvido na hora pela taxonomia.
 */

export interface TaskTagDef {
    /** Identificador estável (slug, ex.: `banco-de-dados`); é o valor gravado na tarefa. */
    id: string
    /** Rótulo exibido (ex.: "Banco de dados"). */
    label: string
}

/**
 * Taxonomia inicial sugerida — o dono edita livremente na aba "Tags de tarefas". É só a semente:
 * a lista em execução fica salva em `ai_feature_settings` (feature `task-tags`) e é o que a aba edita.
 * As tags descrevem **do que a tarefa trata** (módulo/produto do Opex ou domínio do cliente), nunca
 * a camada técnica. Derivada das tarefas reais do Opex e das demandas de clientes.
 */
export const DEFAULT_TASK_TAXONOMY: TaskTagDef[] = [
    // Módulos e áreas do Opex
    { id: "tarefas", label: "Tarefas" },
    { id: "horas", label: "Horas" },
    { id: "orcamentos", label: "Orçamentos" },
    { id: "desenvolvimento-agentico", label: "Desenvolvimento agêntico" },
    { id: "ia", label: "IA" },
    { id: "integracoes", label: "Integrações" },
    { id: "github", label: "GitHub" },
    { id: "painel", label: "Painel e navegação" },
    { id: "acesso", label: "Acesso e login" },
    { id: "relatorios", label: "Relatórios" },
    { id: "notificacoes", label: "Notificações" },
    { id: "tempo-real", label: "Tempo real" },
    { id: "rotinas", label: "Rotinas agendadas" },
    { id: "arquivos", label: "Arquivos e anexos" },
    // Domínios de negócio dos clientes
    { id: "marketplace", label: "Marketplace" },
    { id: "catalogo", label: "Catálogo de produtos" },
    { id: "checkout", label: "Checkout e carrinho" },
    { id: "pagamentos", label: "Pagamentos" },
    { id: "endereco", label: "Endereço e entrega" },
    { id: "leads", label: "Leads e marketing" },
    { id: "nota-fiscal", label: "Nota fiscal" },
    { id: "cadastros", label: "Cadastros" },
    { id: "app-mobile", label: "Aplicativo mobile" },
    { id: "emails", label: "E-mails" },
]

/** Limites (espelham o schema Zod da feature). */
export const MAX_TAXONOMY_TAGS = 100
export const MAX_TASK_TAGS = 20
export const TASK_TAG_ID_MAX = 40
export const TASK_TAG_LABEL_MAX = 60

/** Id a partir de um rótulo: minúsculas, sem acentos, não-alfanumérico vira hífen. */
export function slugifyTag(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, TASK_TAG_ID_MAX)
}

/** Ids únicos mantendo a ordem: descarta vazios e repetidos (primeiro vence). */
export function normalizeTaxonomy(list: readonly TaskTagDef[]): TaskTagDef[] {
    const seen = new Set<string>()
    const result: TaskTagDef[] = []
    for (const tag of list) {
        const id = slugifyTag(tag.id || tag.label)
        const label = tag.label.trim().slice(0, TASK_TAG_LABEL_MAX)
        if (!id || !label || seen.has(id)) continue
        seen.add(id)
        result.push({ id, label })
    }
    return result
}

/** Gera um id único a partir do rótulo, acrescentando sufixo numérico quando necessário. */
export function uniqueTagId(label: string, taken: readonly string[]): string {
    const base = slugifyTag(label) || "tag"
    const used = new Set(taken)
    if (!used.has(base)) return base
    let suffix = 2
    while (used.has(`${base}-${suffix}`)) suffix++
    return `${base}-${suffix}`.slice(0, TASK_TAG_ID_MAX)
}

/** Mantém só as tags conhecidas pela taxonomia, sem repetição e no máximo `max`. */
export function filterKnownTags(ids: readonly string[], taxonomy: readonly TaskTagDef[], max = MAX_TASK_TAGS): string[] {
    const known = new Set(taxonomy.map((tag) => tag.id))
    const result: string[] = []
    for (const id of ids) {
        if (known.has(id) && !result.includes(id)) result.push(id)
        if (result.length >= max) break
    }
    return result
}

/** Rótulo de uma tag; cai no próprio id quando ela saiu da taxonomia. */
export function tagLabel(id: string, taxonomy: readonly TaskTagDef[]): string {
    return taxonomy.find((tag) => tag.id === id)?.label ?? id
}
