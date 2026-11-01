import { memoriesSection } from "@/features/ai/memories-prompt"
import { selfMemoryInstructions } from "@/features/ai/self-memory"
import { ARCHITECT_NODE_DETAIL_MAX, ARCHITECT_DEPTH_DEFS, ARCHITECT_EDGE_KINDS, ARCHITECT_GROUP_LAYERS, ARCHITECT_NODE_KINDS, ARCHITECT_NODE_STATUSES, ARCHITECT_NOTE_KINDS, type ArchitectDepth } from "./constants"
import type { ArchitectGraph } from "./graph"

/**
 * Mensagens do Agente Arquiteto (módulo PURO): instruções duráveis da sessão, o pedido de cada versão
 * do diagrama e o pedido de correção quando a resposta vem inválida.
 */

/** Prefixo das ferramentas do MCP "Memória própria" no OpenCode (`opex_memorias_<ferramenta>`). */
const SELF_MEMORY_TOOL_PREFIX = "opex_memorias_"

const FORMAT_EXAMPLE = {
    title: "título curto do diagrama",
    summary: "leitura arquitetural de 1 a 3 frases",
    groups: [{ id: "g-ui", label: "UI", layer: ARCHITECT_GROUP_LAYERS.join("|"), detail: "opcional" }],
    nodes: [
        { id: "objective", label: "objetivo do plano", groupId: null, kind: "objective", detail: "o que o plano entrega", files: [], status: "new" },
        { id: "n-tab", label: "Aba X da mesa", groupId: "g-ui", kind: ARCHITECT_NODE_KINDS.join("|"), detail: "o que muda e por quê", files: ["src/caminho/real/Arquivo.tsx"], status: ARCHITECT_NODE_STATUSES.join("|") },
    ],
    edges: [{ id: "e1", source: "objective", target: "n-tab", label: "opcional", kind: ARCHITECT_EDGE_KINDS.join("|") }],
    notes: [{ kind: ARCHITECT_NOTE_KINDS.join("|"), text: "decisão, risco ou dúvida do plano" }],
}

export function depthDirective(depth: ArchitectDepth): string {
    const def = ARCHITECT_DEPTH_DEFS[depth]
    return [`## Profundidade: nível ${depth} — ${def.label} (${def.content})`, def.directive, `- No máximo ${def.maxNodes} nós e ${def.maxEdges} arestas (o excedente é cortado pelo sistema).`].join("\n")
}

export function buildArchitectInstructions(input: { instructions: string; memories: string; selfMemory?: boolean }): string {
    const extra = input.instructions.trim()
    return [
        "Você é o AGENTE ARQUITETO: lê o plano aprovado de uma tarefa e o código do repositório e desenha a arquitetura DO PLANO como um grafo semântico (camadas, módulos, rotas, dados, integrações, eventos, decisões e riscos).",
        "",
        "## Regras invioláveis",
        "- Você só LÊ: NUNCA altere arquivos, NUNCA faça commit, checkout, stash ou qualquer operação que mude o repositório.",
        "- NUNCA rode testes, build, typecheck, lint, servidores nem instale dependências.",
        "- Não pergunte nada: ninguém responde durante a geração.",
        "",
        "## Escopo: somente o que o plano toca",
        "- Parta do OBJETIVO do plano (um nó `kind: \"objective\"`) e mostre os módulos, rotas, modelos, integrações e eventos que o plano CRIA, ALTERA ou de que depende diretamente.",
        "- NÃO desenhe o sistema inteiro. O que já existe e não muda aparece só como contexto mínimo, com `status: \"existing\"`.",
        "- `status`: `new` = o plano cria; `changed` = o plano altera; `existing` = só contexto.",
        "- `files`: caminhos REAIS do repositório (confirme lendo o código); para arquivos que o plano cria, use o caminho previsto no plano.",
        "- Agrupe os nós em camadas (`groups`, ex.: UI, Rotas/API, Features, Lib, Banco, Externo) e ligue-os com arestas tipadas (`contains`, `uses`, `flow`, `event`, `data`).",
        "- Registre em `notes` as decisões, os riscos e as dúvidas do plano.",
        `- \`detail\` de cada nó: no máximo ${ARCHITECT_NODE_DETAIL_MAX.toLocaleString("pt-BR")} caracteres (o excedente é cortado).`,
        "- Ids curtos, únicos e estáveis (letras, números e hífen). Toda aresta liga dois ids existentes.",
        "",
        "## Formato da resposta",
        "Termine a resposta com um bloco ```json``` contendo SOMENTE este objeto (sem comentários):",
        "```json",
        JSON.stringify(FORMAT_EXAMPLE, null, 2),
        "```",
        extra ? `\n## Instruções adicionais\n${extra}` : "",
        memoriesSection(input.memories),
        input.selfMemory ? selfMemoryInstructions("arquiteto", { kind: "review" }, { toolPrefix: SELF_MEMORY_TOOL_PREFIX }) : "",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

export interface DiagramPromptInput {
    code: string
    title: string
    description: string | null
    technicalSpec: string | null
    planVersion: number
    plan: string
    directory: string
    /** O diretório é o worktree da mesa (`false` = a base do repositório: o worktree ainda não existe). */
    worktree: boolean
    depth: ArchitectDepth
    /** Ajuste: o grafo anterior e o pedido do usuário. */
    adjust?: { graph: ArchitectGraph; feedback: string } | null
}

export function buildDiagramPrompt(input: DiagramPromptInput): string {
    const where = input.worktree
        ? `Leia o código no worktree da mesa: ${input.directory} (a implementação pode estar em andamento; o que vale é o plano).`
        : `O worktree da mesa ainda não existe: leia o código da base do repositório em ${input.directory}. O plano descreve as mudanças sobre esta base.`
    return [
        `# Arquitetura do plano v${input.planVersion} da tarefa ${input.code}: ${input.title}`,
        "",
        where,
        "",
        depthDirective(input.depth),
        "",
        "## Tarefa",
        input.description?.trim() ? `### Descrição\n${input.description.trim()}` : "(sem descrição)",
        input.technicalSpec?.trim() ? `\n### Especificação técnica\n${input.technicalSpec.trim()}` : "",
        "",
        `## Plano aprovado (v${input.planVersion})`,
        input.plan.trim(),
        input.adjust
            ? [
                  "",
                  "## Ajuste pedido",
                  "Gere uma NOVA versão do diagrama a partir do grafo anterior, aplicando o pedido abaixo. Mantenha os ids dos nós que continuam.",
                  `### Pedido\n${input.adjust.feedback.trim()}`,
                  "### Grafo anterior",
                  "```json",
                  JSON.stringify(input.adjust.graph),
                  "```",
              ].join("\n")
            : "",
        "",
        "Responda com o bloco ```json``` do grafo no formato das instruções.",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

/** Segunda (e última) tentativa: a resposta anterior veio inválida. */
export function buildRepairPrompt(error: string, depth: ArchitectDepth): string {
    const def = ARCHITECT_DEPTH_DEFS[depth]
    return [
        `A sua resposta não pôde ser lida: ${error}.`,
        `Responda de novo SOMENTE com o bloco \`\`\`json\`\`\` do grafo, no formato das instruções (no máximo ${def.maxNodes} nós; \`nodes\` não pode ser vazio). Não leia mais nada do repositório.`,
    ].join("\n")
}
