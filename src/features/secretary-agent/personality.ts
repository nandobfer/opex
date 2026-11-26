/**
 * Personalidade do Agente Secretário (pura): blocos fixos + extras do dono, variantes por conversa (só os
 * blocos que mudam ou complementam a base), a montagem do prompt e o diff entre versões.
 */

export interface PersonalityBlock {
    key: string
    title: string
    content: string
}

export interface Personality {
    blocks: PersonalityBlock[]
}

export interface PersonalityVariant {
    jid: string
    title: string
    blocks: PersonalityBlock[]
    origin: "owner" | "analysis"
}

export const FIXED_BLOCKS: readonly { key: string; title: string; hint: string }[] = [
    { key: "identidade", title: "Identidade", hint: "Quem sou e como me apresento" },
    { key: "tom", title: "Tom e formalidade", hint: "Como soo: direto, carinhoso, brincalhão, formal…" },
    { key: "vocabulario", title: "Vocabulário, gírias e expressões", hint: "Palavras e expressões que uso (e as que não uso)" },
    { key: "emojis", title: "Emojis, risadas e pontuação", hint: "Quais emojis, \"kkkk\" ou \"haha\", pontuação, maiúsculas" },
    { key: "ritmo", title: "Tamanho e ritmo das mensagens", hint: "Mensagens curtas em sequência ou uma longa, quanto demoro" },
    { key: "assuntos", title: "Assuntos, opiniões e posicionamentos", hint: "O que penso sobre os assuntos que aparecem" },
    { key: "nunca", title: "O que nunca faço", hint: "Limites: o que não digo, não prometo, não aceito" },
    { key: "exemplos", title: "Exemplos reais de mensagens", hint: "Mensagens minhas, do jeito que escrevo" },
]

export const isFixedBlock = (key: string) => FIXED_BLOCKS.some((block) => block.key === key)

export function emptyPersonality(): Personality {
    return { blocks: FIXED_BLOCKS.map((block) => ({ key: block.key, title: block.title, content: "" })) }
}

/** Garante os blocos fixos (na ordem) e mantém os extras depois deles. */
export function normalizePersonality(personality: Personality | null | undefined): Personality {
    const byKey = new Map((personality?.blocks ?? []).map((block) => [block.key, block]))
    const fixed = FIXED_BLOCKS.map((def) => ({ key: def.key, title: def.title, content: byKey.get(def.key)?.content ?? "" }))
    const extras = (personality?.blocks ?? []).filter((block) => !isFixedBlock(block.key))
    return { blocks: [...fixed, ...extras] }
}

/** Chave de um bloco extra a partir do título (única entre as existentes). */
export function blockKeyOf(title: string, existing: readonly string[]): string {
    const base =
        title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "bloco"
    let key = base
    for (let n = 2; existing.includes(key); n++) key = `${base}-${n}`
    return key
}

/**
 * Seção da personalidade no prompt: a base e, quando há variante da conversa, os blocos dela ("Nesta
 * conversa") logo depois do bloco da base com a mesma chave; os blocos só da variante vêm no fim.
 */
export function composePersonality(base: Personality, variant: Pick<PersonalityVariant, "title" | "blocks"> | null): string {
    const variantByKey = new Map((variant?.blocks ?? []).filter((block) => block.content.trim()).map((block) => [block.key, block]))
    const lines: string[] = []
    for (const block of base.blocks) {
        const own = block.content.trim()
        const extra = variantByKey.get(block.key)
        if (!own && !extra) continue
        lines.push(`### ${block.title}`)
        if (own) lines.push(own)
        if (extra) {
            lines.push(`Nesta conversa (${variant!.title}): ${extra.content.trim()}`)
            variantByKey.delete(block.key)
        }
        lines.push("")
    }
    for (const block of variantByKey.values()) lines.push(`### ${block.title} (nesta conversa: ${variant!.title})`, block.content.trim(), "")
    return lines.join("\n").trim()
}

export interface PersonalitySnapshot {
    base: Personality
    variants: PersonalityVariant[]
}

export interface BlockChange {
    /** `base` ou o JID da variante. */
    scope: string
    scopeTitle: string
    key: string
    title: string
    kind: "added" | "removed" | "changed"
    before: string
    after: string
}

function diffBlocks(scope: string, scopeTitle: string, before: PersonalityBlock[], after: PersonalityBlock[]): BlockChange[] {
    const out: BlockChange[] = []
    const prev = new Map(before.map((block) => [block.key, block]))
    const next = new Map(after.map((block) => [block.key, block]))
    for (const block of after) {
        const old = prev.get(block.key)
        const was = old?.content.trim() ?? ""
        const now = block.content.trim()
        if (!old || (!was && now)) {
            if (now) out.push({ scope, scopeTitle, key: block.key, title: block.title, kind: "added", before: "", after: block.content })
        } else if (was !== now || old.title !== block.title) {
            out.push({ scope, scopeTitle, key: block.key, title: block.title, kind: now ? "changed" : "removed", before: old.content, after: block.content })
        }
    }
    for (const block of before) {
        if (!next.has(block.key) && block.content.trim()) out.push({ scope, scopeTitle, key: block.key, title: block.title, kind: "removed", before: block.content, after: "" })
    }
    return out
}

/** O que mudou, bloco a bloco, entre duas versões (base e cada variante). */
export function diffPersonality(before: PersonalitySnapshot | null, after: PersonalitySnapshot): BlockChange[] {
    const changes = diffBlocks("base", "Personalidade base", before?.base.blocks ?? [], after.base.blocks)
    const prevVariants = new Map((before?.variants ?? []).map((variant) => [variant.jid, variant]))
    const nextVariants = new Map(after.variants.map((variant) => [variant.jid, variant]))
    for (const variant of after.variants) changes.push(...diffBlocks(variant.jid, variant.title, prevVariants.get(variant.jid)?.blocks ?? [], variant.blocks))
    for (const variant of before?.variants ?? []) if (!nextVariants.has(variant.jid)) changes.push(...diffBlocks(variant.jid, variant.title, variant.blocks, []))
    return changes
}

/** Personalidade vazia (nenhum bloco preenchido): o agente usa só as regras fixas. */
export function isPersonalityEmpty(personality: Personality): boolean {
    return personality.blocks.every((block) => !block.content.trim())
}
