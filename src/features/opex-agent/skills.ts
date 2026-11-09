import { z } from "zod"
import { installSourceSchema, resourceNameSchema, skillFrontmatterSchema } from "@/features/opencode-resources/schemas"
import { FrontmatterError, parseMarkdownDocument, serializeMarkdownDocument } from "@/features/opencode-resources/frontmatter"

/**
 * Skills do Agente Opex (OPE-153): schemas, DTOs e regras puras. As skills ficam no banco do Opex
 * (`opex_skills`), são instaladas/atualizadas de pastas do GitHub e usadas pelo Agente Opex do dono e
 * pelos agentes rotineiros do motor Opex. Ver `aicontext/modules/opex-agent.md`, "Skills". Módulo puro.
 */

export const OPEX_SKILLS_EVENT = "opex-skills-updated"
export const OPEX_SKILL_AUDIT_ENTITY = "SkillOpex"
/** Grupo das ferramentas de skill (por turno: não entram no registro, na árvore de ferramentas nem no Maddox). */
export const OPEX_SKILL_TOOL_GROUP = "opex-skills"

/** Linhas devolvidas por janela pelas ferramentas de leitura de skill. */
export const OPEX_SKILL_READ_MAX_LINES = 400

/** Ações do evento de tempo real (`{ id, action }`). */
export type OpexSkillEventAction = "created" | "updated" | "toggled" | "deleted" | "installed"

/** Nome da skill: a mesma regra de nome/pasta das skills do OpenCode. */
export const opexSkillNameSchema = resourceNameSchema
export const opexSkillDescriptionSchema = skillFrontmatterSchema.shape.description

/** Caminho de arquivo de apoio: relativo à pasta da skill, sem `..` e diferente do próprio `SKILL.md`. */
export const opexSkillFilePathSchema = z
    .string()
    .trim()
    .min(1, "Informe o caminho do arquivo")
    .max(300, "Caminho: máximo de 300 caracteres")
    .refine((value) => !value.startsWith("/") && !value.includes("\\"), "Use um caminho relativo à pasta da skill (ex.: references/guia.md)")
    .refine((value) => value.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "Caminho inválido: sem '..', '.' ou barras repetidas")
    .refine((value) => value !== "SKILL.md", "O SKILL.md é o corpo da skill: use outro nome")

const textFileSchema = z.object({ path: opexSkillFilePathSchema, content: z.string() })

const uniquePaths = (files: { path: string }[] | undefined) => new Set((files ?? []).map((file) => file.path)).size === (files ?? []).length

/** Criar com texto. Sem limite de tamanho além do limite técnico do banco (D5, conferido no servidor). */
export const opexSkillCreateSchema = z.object({
    name: opexSkillNameSchema,
    description: opexSkillDescriptionSchema,
    body: z.string().refine((value) => value.trim().length > 0, "Informe as instruções da skill"),
    files: z.array(textFileSchema).max(500).refine(uniquePaths, "Há arquivos de apoio com o mesmo caminho").optional(),
})
export type OpexSkillCreateInput = z.infer<typeof opexSkillCreateSchema>

/**
 * Editar: descrição e corpo substituem; `files` traz só as mudanças nos arquivos de apoio
 * (`content` texto = grava/cria, `null` = remove). Arquivos não citados ficam como estão.
 */
export const opexSkillUpdateSchema = z.object({
    description: opexSkillDescriptionSchema,
    body: z.string().refine((value) => value.trim().length > 0, "Informe as instruções da skill"),
    files: z
        .array(z.object({ path: opexSkillFilePathSchema, content: z.string().nullable() }))
        .max(500)
        .refine(uniquePaths, "Há arquivos de apoio com o mesmo caminho")
        .optional(),
})
export type OpexSkillUpdateInput = z.infer<typeof opexSkillUpdateSchema>

export const opexSkillEnabledSchema = z.object({ enabled: z.boolean() })

/** Origem da instalação: as mesmas regras do OpenCode (sem espaços, começando por letra, número, `@` ou `.`). */
export const opexSkillSourceSchema = installSourceSchema
export const opexSkillDiscoverSchema = z.object({ source: opexSkillSourceSchema })

export const opexSkillInstallSchema = z.object({
    source: opexSkillSourceSchema,
    /** Pastas (no repositório) das skills marcadas; `""` = skill na raiz. */
    paths: z.array(z.string().max(500)).min(1, "Marque ao menos uma skill").max(100),
})
export type OpexSkillInstallInput = z.infer<typeof opexSkillInstallSchema>

export const opexSkillUpdateManySchema = z
    .object({ ids: z.array(z.string().min(1).max(64)).max(200).optional(), all: z.boolean().optional() })
    .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, "Informe as skills a atualizar ou all: true")
export type OpexSkillUpdateManyInput = z.infer<typeof opexSkillUpdateManySchema>

export interface OpexSkillOriginDto {
    kind: "opex" | "github"
    repo: string | null
    ref: string | null
    path: string | null
}

export interface OpexSkillVersionDto {
    /** Hash gravado (7 caracteres). */
    installed: string
    /** Hash da pasta no GitHub (7 caracteres); `null` = não verificado. */
    available: string | null
    outdated: boolean
}

/** Linha da lista (nunca traz o conteúdo). */
export interface OpexSkillDto {
    id: string
    name: string
    description: string
    enabled: boolean
    origin: OpexSkillOriginDto
    /** "Criada no Opex" ou `dono/repo[/pasta]`. */
    sourceLabel: string
    version: OpexSkillVersionDto | null
    size: number
    fileCount: number
    updatedAt: string
}

export interface OpexSkillFileMetaDto {
    path: string
    size: number
    binary: boolean
}

export interface OpexSkillDetailDto extends OpexSkillDto {
    body: string
    files: OpexSkillFileMetaDto[]
}

export interface OpexSkillFileDto extends OpexSkillFileMetaDto {
    /** Texto do arquivo; `null` quando binário. */
    content: string | null
}

export interface OpexSkillDiscoveredDto {
    /** Pasta no repositório (`""` = raiz). */
    path: string
    name: string | null
    description: string | null
    /** Motivo de não poder instalar (frontmatter inválido, nome já existente). */
    error: string | null
    exists: boolean
}

export interface OpexSkillDiscoveryDto {
    repo: string
    ref: string | null
    skills: OpexSkillDiscoveredDto[]
}

export interface OpexSkillResultDto {
    /** Pasta (instalação) ou id (atualização). */
    key: string
    name: string | null
    ok: boolean
    id: string | null
    message: string
}

export interface OpexSkillUsageDto {
    count: number
    agents: { id: string; name: string }[]
}

/** Item do catálogo entregue ao modelo (nome + descrição). */
export interface OpexSkillCatalogItem {
    name: string
    description: string
}

export const OPEX_SKILL_CREATED_LABEL = "Criada no Opex"

export function skillSourceLabel(origin: OpexSkillOriginDto): string {
    if (origin.kind !== "github" || !origin.repo) return OPEX_SKILL_CREATED_LABEL
    return origin.path ? `${origin.repo}/${origin.path}` : origin.repo
}

/** Versão de uma skill instalada (hash gravado × hash disponível); criada no Opex → `null`. */
export function skillVersionOf(hash: string | null, available: string | null): OpexSkillVersionDto | null {
    if (!hash) return null
    return { installed: hash.slice(0, 7), available: available ? available.slice(0, 7) : null, outdated: Boolean(available && available !== hash) }
}

/** "Atualizar todos (N)": todas as instaladas com atualização, ligadas ou desligadas (o D2 as mantém nos rotineiros). */
export function outdatedSkills<T extends Pick<OpexSkillDto, "version">>(list: readonly T[] | undefined): T[] {
    return (list ?? []).filter((skill) => skill.version?.outdated === true)
}

export type OpexSkillFilter = "all" | "enabled" | "disabled" | "outdated"

export function matchesSkillFilter(skill: Pick<OpexSkillDto, "enabled" | "version">, filter: OpexSkillFilter): boolean {
    if (filter === "enabled") return skill.enabled
    if (filter === "disabled") return !skill.enabled
    if (filter === "outdated") return skill.version?.outdated === true
    return true
}

export interface ParsedSkillMarkdown {
    name: string
    description: string
    body: string
    extra: Record<string, unknown>
}

/** Lê e valida um `SKILL.md`. Lança `FrontmatterError` com mensagem clara. */
export function parseSkillMarkdown(text: string): ParsedSkillMarkdown {
    const doc = parseMarkdownDocument(text)
    const parsed = skillFrontmatterSchema.safeParse(doc.frontmatter)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const field = issue?.path[0] ? `${String(issue.path[0])}: ` : ""
        throw new FrontmatterError(`Frontmatter inválido (${field}${issue?.message ?? "confira name e description"})`)
    }
    const { name, description, ...extra } = parsed.data
    return { name, description, body: doc.body, extra }
}

/** Monta o `SKILL.md` (frontmatter `name` + `description` + extras e o corpo). */
export function buildSkillMarkdown(skill: ParsedSkillMarkdown): string {
    return serializeMarkdownDocument({ frontmatter: { name: skill.name, description: skill.description, ...skill.extra }, body: skill.body })
}

export interface SkillWindow {
    text: string
    startLine: number
    endLine: number
    totalLines: number
}

/** Janela numerada de um texto (corpo ou arquivo de apoio), para conteúdo grande não estourar o turno. */
export function skillWindow(text: string, startLine = 1, maxLines = OPEX_SKILL_READ_MAX_LINES): SkillWindow {
    const lines = text.split("\n")
    const start = Math.min(Math.max(1, Math.floor(startLine)), Math.max(1, lines.length))
    const count = Math.max(1, Math.min(OPEX_SKILL_READ_MAX_LINES, Math.floor(maxLines)))
    const slice = lines.slice(start - 1, start - 1 + count)
    return { text: slice.map((line, index) => `${start + index}: ${line}`).join("\n"), startLine: start, endLine: start - 1 + slice.length, totalLines: lines.length }
}

/** Bloco "Skills" das instruções do agente: só nome e descrição; o corpo vem sob demanda. */
export function skillsCatalogBlock(skills: readonly OpexSkillCatalogItem[], toolPrefix = ""): string {
    if (skills.length === 0) return ""
    const lines = skills.map((skill) => `- ${skill.name}: ${skill.description.replace(/\s+/g, " ").trim()}`)
    return [
        "## Skills disponíveis",
        `Skills são instruções reutilizáveis para tarefas específicas. Quando o pedido combinar com a descrição de uma skill, carregue-a com \`${toolPrefix}load_opex_skill\` (nome exato) antes de seguir e obedeça às instruções; arquivos de apoio citados nela são lidos com \`${toolPrefix}read_opex_skill_file\`.`,
        ...lines,
    ].join("\n")
}
