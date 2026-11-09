import { z } from "zod"
import { OPEX_SKILL_READ_MAX_LINES, OPEX_SKILL_TOOL_GROUP, skillWindow, type OpexSkillCatalogItem } from "../../skills"
import { defineTool, type OpexTool } from "../tools/define"
import { loadSkillByName, loadSkillCatalog } from "./service"
import { bytesOf } from "./size"

/**
 * Uso das skills pelo agente (OPE-153, item B). O catálogo (nome + descrição) vai nas instruções; o corpo
 * e os arquivos de apoio vêm sob demanda por duas ferramentas do TURNO (fora do registro `OPEX_TOOLS`, da
 * árvore de ferramentas e do catálogo do Maddox):
 * - `load_opex_skill`: corpo do `SKILL.md` em janelas numeradas + lista dos arquivos de apoio;
 * - `read_opex_skill_file`: um arquivo de apoio em janelas (binário só com o tamanho).
 * O alcance é o conjunto liberado no início do turno: no chat do dono, as ligadas (e a skill precisa
 * continuar ligada ao carregar); no rotineiro do motor Opex, a seleção do snapshot (D2: ligada ou não).
 * Skill fora do alcance, desligada ou removida devolve "indisponível" sem derrubar a execução (D6).
 */

export const LOAD_OPEX_SKILL = "load_opex_skill"
export const READ_OPEX_SKILL_FILE = "read_opex_skill_file"
export const OPEX_SKILL_TURN_TOOL_NAMES = [LOAD_OPEX_SKILL, READ_OPEX_SKILL_FILE] as const

export interface SkillTurnScope {
    /** Nomes que o agente pode carregar neste turno. */
    allowed: readonly string[]
    /** Chat do dono: confere que a skill continua ligada no momento de carregar. */
    requireEnabled: boolean
}

const unavailable = (name: string) => ({ available: false, name, message: `Skill "${name}" indisponível (removida, desligada ou fora das skills liberadas para este agente). Siga sem ela.` })

const windowInput = {
    startLine: z.number().int().min(1).optional().describe("Linha inicial (padrão 1)"),
    maxLines: z.number().int().min(1).max(OPEX_SKILL_READ_MAX_LINES).optional().describe(`Padrão ${OPEX_SKILL_READ_MAX_LINES}`),
}

async function reachable(name: string, scope: SkillTurnScope) {
    if (!scope.allowed.includes(name)) return null
    const skill = await loadSkillByName(name)
    if (!skill) return null
    if (scope.requireEnabled && skill.enabled === false) return null
    return skill
}

/** Ferramentas de skill do turno; sem skill liberada, nenhuma ferramenta. */
export function skillTurnTools(scope: SkillTurnScope): OpexTool[] {
    if (scope.allowed.length === 0) return []
    const names = scope.allowed.join(", ")
    const load = defineTool({
        name: LOAD_OPEX_SKILL,
        group: OPEX_SKILL_TOOL_GROUP,
        label: "Carregar skill",
        risk: "read",
        description: `Carrega as instruções (corpo do SKILL.md) de uma skill do Opex, com as linhas numeradas em janelas de até ${OPEX_SKILL_READ_MAX_LINES} linhas, e lista os arquivos de apoio. Skills liberadas: ${names}. Se truncated=true, continue com startLine.`,
        input: z.object({ name: z.string().min(1).max(64).describe("Nome exato da skill"), ...windowInput }),
        execute: async ({ name, startLine, maxLines }) => {
            const skill = await reachable(name, scope)
            if (!skill) return unavailable(name)
            const window = skillWindow(skill.body, startLine, maxLines)
            return {
                available: true,
                name: skill.name,
                description: skill.description,
                instructions: window.text,
                startLine: window.startLine,
                endLine: window.endLine,
                totalLines: window.totalLines,
                truncated: window.endLine < window.totalLines,
                files: skill.files.map((file) => ({ path: file.path, size: file.size, binary: file.binary })),
            }
        },
    })
    const read = defineTool({
        name: READ_OPEX_SKILL_FILE,
        group: OPEX_SKILL_TOOL_GROUP,
        label: "Ler arquivo de skill",
        risk: "read",
        description: `Lê um arquivo de apoio de uma skill do Opex (caminho relativo à pasta da skill, como listado por ${LOAD_OPEX_SKILL}), em janelas de até ${OPEX_SKILL_READ_MAX_LINES} linhas numeradas.`,
        input: z.object({ name: z.string().min(1).max(64).describe("Nome exato da skill"), path: z.string().min(1).max(300), ...windowInput }),
        execute: async ({ name, path, startLine, maxLines }) => {
            const skill = await reachable(name, scope)
            if (!skill) return unavailable(name)
            const file = skill.files.find((item) => item.path === path)
            if (!file) return { available: true, name, found: false, message: `Arquivo ${path} não existe na skill ${name}. Arquivos: ${skill.files.map((item) => item.path).join(", ") || "nenhum"}` }
            if (file.binary) return { available: true, name, path, binary: true, size: file.size, message: "Arquivo binário: o conteúdo não pode ser lido como texto." }
            const window = skillWindow(bytesOf(file.content).toString("utf8"), startLine, maxLines)
            return { available: true, name, path, content: window.text, startLine: window.startLine, endLine: window.endLine, totalLines: window.totalLines, truncated: window.endLine < window.totalLines }
        },
    })
    return [load, read] as OpexTool[]
}

/** Catálogo + ferramentas do Agente Opex do dono: só as ligadas (D2, D4). */
export async function ownerSkillsForTurn(): Promise<{ catalog: OpexSkillCatalogItem[]; tools: OpexTool[] }> {
    const catalog = await loadSkillCatalog({ onlyEnabled: true })
    return { catalog, tools: skillTurnTools({ allowed: catalog.map((skill) => skill.name), requireEnabled: true }) }
}

/** Catálogo + ferramentas de um rotineiro do motor Opex: a seleção (ligadas ou não), sem as que sumiram. */
export async function routineSkillsForRun(selected: readonly string[]): Promise<{ catalog: OpexSkillCatalogItem[]; tools: OpexTool[]; missing: string[] }> {
    const catalog = await loadSkillCatalog({ names: selected })
    const found = new Set(catalog.map((skill) => skill.name))
    return { catalog, tools: skillTurnTools({ allowed: catalog.map((skill) => skill.name), requireEnabled: false }), missing: selected.filter((name) => !found.has(name)) }
}
