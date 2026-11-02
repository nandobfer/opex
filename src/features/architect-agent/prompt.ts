import { memoriesSection } from "@/features/ai/memories-prompt"
import { selfMemoryInstructions } from "@/features/ai/self-memory"
import { ARCHITECT_STREAM_FENCE, ARCHITECT_TEXT_LIMITS, ARCHITECT_DEPTH_DEFS, ARCHITECT_EDGE_KINDS, ARCHITECT_GROUP_LAYERS, ARCHITECT_NODE_KINDS, ARCHITECT_NODE_STATUSES, ARCHITECT_NOTE_KINDS, type ArchitectDepth } from "./constants"
import type { ArchitectGraph } from "./graph"

/**
 * Mensagens do Agente Arquiteto (módulo PURO): instruções duráveis da sessão, o pedido de cada versão
 * do diagrama e o pedido de correção quando a resposta vem inválida.
 */

/** Prefixo das ferramentas do MCP "Memória própria" no OpenCode (`opex_memorias_<ferramenta>`). */
const SELF_MEMORY_TOOL_PREFIX = "opex_memorias_"

/** Uma linha de exemplo por operação do formato ao vivo (`stream-parser.ts`). */
const FORMAT_LINES = [
    { op: "meta", title: "título curto do diagrama", summary: "a ideia do plano em 1 a 3 frases" },
    { op: "node", id: "objective", label: "Diagrama do plano aprovado", kind: "objective", status: "new", detail: "o que o plano entrega, em linguagem comum" },
    { op: "group", id: "g-pessoas", label: "Quem participa", layer: ARCHITECT_GROUP_LAYERS.join("|") },
    { op: "node", id: "dono", label: "Dono aprova o plano", groupId: "g-pessoas", kind: "actor", status: "existing", detail: "quem dispara o processo" },
    { op: "node", id: "geracao", label: "Geração do diagrama", kind: ARCHITECT_NODE_KINDS.join("|"), status: ARCHITECT_NODE_STATUSES.join("|"), detail: "o que acontece e por quê, em 1 a 3 frases" },
    { op: "node", id: "versoes", label: "Versões do diagrama", kind: "information", status: "new", detail: "o que fica guardado" },
    { op: "edge", source: "dono", target: "geracao", kind: ARCHITECT_EDGE_KINDS.join("|"), label: "opcional, 1 a 3 palavras" },
    { op: "edge", source: "geracao", target: "versoes", kind: "produces" },
    { op: "note", kind: ARCHITECT_NOTE_KINDS.join("|"), text: "decisão, risco ou dúvida do plano" },
    { op: "remove", id: "id de um nó, aresta ou grupo emitido antes (só para corrigir)" },
    { op: "done" },
]

/** O que NUNCA aparece em nenhum texto do diagrama (é de ideias, não de código). */
const NO_CODE_RULE =
    "- PROIBIDO em qualquer texto (rótulo, descrição, grupo, ligação e nota): nomes de arquivos, diretórios ou caminhos; funções, componentes, classes, hooks; rotas e endpoints; coleções e tabelas; variáveis, campos técnicos e bibliotecas; e qualquer coisa em `camelCase`, `snake_case`, com `/`, extensão (`.ts`, `.tsx`…) ou `()`. Nomes de produtos e serviços (GitHub, OpenCode, Pusher) podem aparecer."

const FENCE = "```" + ARCHITECT_STREAM_FENCE

/** Tamanhos pedidos ao modelo (bem abaixo do teto de proteção do saneamento). */
const TEXT_GUIDANCE = (["title", "summary", "nodeLabel", "detail", "groupLabel", "groupDetail", "edgeLabel", "note"] as const)
    .map((field) => `${ARCHITECT_TEXT_LIMITS[field].label} até ${ARCHITECT_TEXT_LIMITS[field].prompt.toLocaleString("pt-BR")}`)
    .join("; ")

export function depthDirective(depth: ArchitectDepth): string {
    const def = ARCHITECT_DEPTH_DEFS[depth]
    return [`## Profundidade: nível ${depth} — ${def.label} (${def.content})`, def.directive, `- No máximo ${def.maxNodes} nós e ${def.maxEdges} arestas (o excedente é cortado pelo sistema).`].join("\n")
}

export function buildArchitectInstructions(input: { instructions: string; memories: string; selfMemory?: boolean }): string {
    const extra = input.instructions.trim()
    return [
        "Você é o AGENTE ARQUITETO: lê o plano aprovado de uma tarefa e desenha a ARQUITETURA DA IDEIA do plano — quem participa, quais processos acontecem, quais estruturas e informações existem e como se ligam — para quem NÃO lê código. É um diagrama de quadro branco, de alto nível, nunca um mapa de arquivos.",
        "",
        "## Regras invioláveis",
        "- Você só LÊ: NUNCA altere arquivos, NUNCA faça commit, checkout, stash ou qualquer operação que mude o repositório.",
        "- NUNCA rode testes, build, typecheck, lint, servidores nem instale dependências.",
        "- Não pergunte nada: ninguém responde durante a geração.",
        "",
        "## Fonte: o plano",
        "- O plano aprovado é a fonte principal. Leia o código só se precisar entender um processo que já existe — e NUNCA cite o que leu (nada de arquivos, funções ou rotas no diagrama).",
        "",
        "## Escopo e vocabulário: ideias, processos e estruturas",
        "- Parta do OBJETIVO do plano (um nó `kind: \"objective\"`) e mostre só as partes que o plano CRIA, ALTERA ou de que depende diretamente. NÃO desenhe o sistema inteiro: o que já existe e não muda aparece só como contexto mínimo (`status: \"existing\"`).",
        "- `status`: `new` = o plano cria; `changed` = o plano altera; `existing` = só contexto.",
        "- Tipos de nó (`kind`): `objective` (o objetivo), `actor` (pessoa ou ator: o dono, o cliente, um agente), `process` (processo ou etapa), `structure` (uma parte do sistema vista como ideia, ex.: \"Mesa de trabalho\", \"Configuração do agente\"), `information` (o que é guardado ou trocado, ex.: \"Plano aprovado\"), `external` (serviço externo), `decision` e `risk`.",
        "- Rótulos de 2 a 5 palavras em português comum (\"Aprovação do plano\", \"Geração do diagrama\", \"Histórico de versões\"). Descrição: o que o bloco faz e por quê, em 1 a 3 frases.",
        NO_CODE_RULE,
        "- Agrupe em camadas (`groups`: `people` Pessoas e canais, `processes` Processos, `structures` Estruturas, `information` Informação, `external` Serviços externos, `other`) e ligue com arestas tipadas (`contains` contém, `triggers` dispara, `flow` segue para, `uses` usa, `produces` gera/grava, `notifies` avisa).",
        "- Registre em `notes` as decisões, os riscos e as dúvidas do plano (também sem nomes de código).",
        `- Tamanho dos textos (em caracteres): ${TEXT_GUIDANCE}.`,
        "- Ids curtos, únicos e estáveis (letras, números e hífen). Toda aresta liga dois ids existentes.",
        "",
        "## Formato da resposta: o diagrama é desenhado AO VIVO",
        `O dono acompanha o diagrama sendo construído na tela enquanto você trabalha. Escreva o grafo como OPERAÇÕES, uma linha JSON por operação (sem quebrar a linha), dentro de blocos ${FENCE}:`,
        FENCE,
        ...FORMAT_LINES.map((line) => JSON.stringify(line)),
        "```",
        "- Escreva aos POUCOS: logo depois de ler o plano, um primeiro bloco com `meta`, o objetivo e as grandes partes; depois, novos blocos acrescentando ou refinando processos, estruturas e ligações. Vários blocos ao longo da resposta são esperados.",
        "- Repetir um `node` com o mesmo id ATUALIZA os campos enviados (ex.: trocar `status` ou melhorar a descrição). Uma aresta pode vir antes do nó de destino.",
        "- Termine o último bloco com `{\"op\":\"done\"}`. Não escreva o grafo de outra forma (nada de JSON único no fim).",
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
        ? `Se precisar entender um processo que já existe, o código está no worktree da mesa: ${input.directory} (o que vale é o plano; nunca cite o código no diagrama).`
        : `Se precisar entender um processo que já existe, o código está na base do repositório em ${input.directory} (o worktree da mesa ainda não existe; o plano descreve as mudanças sobre esta base; nunca cite o código no diagrama).`
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
                  "O grafo anterior (abaixo) JÁ ESTÁ desenhado na tela como ponto de partida. Aplique o pedido emitindo só as DIFERENÇAS: `node` para criar ou atualizar (mesmo id), `edge` para ligações novas e `remove` para o que sai. Mantenha os ids dos nós que continuam.",
                  `### Pedido\n${input.adjust.feedback.trim()}`,
                  "### Grafo anterior",
                  "```json",
                  JSON.stringify(input.adjust.graph),
                  "```",
              ].join("\n")
            : "",
        "",
        `Escreva o diagrama em blocos ${FENCE}, aos poucos, no formato das instruções.`,
    ]
        .filter((line) => line !== "")
        .join("\n")
}

/** Segunda (e última) tentativa: a resposta anterior veio sem diagrama legível; o rascunho recomeça. */
/**
 * Pedido de correção (uma vez). Num ajuste, o contrato é o do primeiro turno: o grafo anterior volta a
 * ser o ponto de partida na tela, e o agente reemite só as DIFERENÇAS — pedir a reescrita completa
 * deixaria os nós antigos não reemitidos duplicados no resultado.
 */
export function buildRepairPrompt(error: string, depth: ArchitectDepth, adjusting = false): string {
    const def = ARCHITECT_DEPTH_DEFS[depth]
    const ask = adjusting
        ? `O diagrama anterior voltou a ser o ponto de partida na tela (o que você emitiu foi descartado). Emita de novo só as DIFERENÇAS do pedido de ajuste sobre ele, em blocos ${FENCE} com uma operação JSON por linha: \`node\` para criar ou atualizar (mesmo id), \`edge\` para ligações novas e \`remove\` para o que sai (no máximo ${def.maxNodes} nós no total), e termine com {"op":"done"}. Não leia mais nada do repositório.`
        : `Reescreva o diagrama COMPLETO de novo, em blocos ${FENCE} com uma operação JSON por linha, no formato das instruções (no máximo ${def.maxNodes} nós, ao menos o objetivo, e termine com {"op":"done"}). Não leia mais nada do repositório.`
    return [`A sua resposta não pôde ser lida: ${error}.`, ask].join("\n")
}

/**
 * Correção (a mesma tentativa única) quando o diagrama veio com cara de código: lista os rótulos e pede
 * os blocos reescritos como ideias. Num ajuste, só as diferenças sobre o grafo anterior.
 */
export function buildIdeaRepairPrompt(codeLabels: readonly string[], depth: ArchitectDepth, adjusting = false): string {
    const def = ARCHITECT_DEPTH_DEFS[depth]
    const how = adjusting
        ? `O diagrama anterior voltou a ser o ponto de partida na tela (o que você emitiu foi descartado). Emita de novo só as DIFERENÇAS do pedido de ajuste, já como ideias: \`node\`, \`edge\` e \`remove\`, em blocos ${FENCE}, e termine com {"op":"done"}.`
        : `Reescreva o diagrama COMPLETO de novo como ideias, em blocos ${FENCE} com uma operação JSON por linha (no máximo ${def.maxNodes} nós, ao menos o objetivo), e termine com {"op":"done"}.`
    return [
        "O diagrama veio com nomes de CÓDIGO, e ele deve mostrar ideias, processos e estruturas para quem não lê código. Rótulos a reescrever:",
        ...codeLabels.slice(0, 30).map((label) => `- ${label}`),
        NO_CODE_RULE,
        "- Rótulos de 2 a 5 palavras em português comum; descrições de 1 a 3 frases sobre o que o bloco faz e por quê.",
        `${how} Não leia mais nada do repositório.`,
    ].join("\n")
}
