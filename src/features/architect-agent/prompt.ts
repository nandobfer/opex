import { memoriesSection } from "@/features/ai/memories-prompt"
import { selfMemoryInstructions } from "@/features/ai/self-memory"
import { ARCHITECT_DIRECT_PREVIOUS_MAX_CHARS, ARCHITECT_PLANS_MAX_CHARS, ARCHITECT_STREAM_FENCE, ARCHITECT_TEXT_LIMITS, ARCHITECT_DEPTH_DEFS, ARCHITECT_EDGE_KINDS, ARCHITECT_GROUP_LAYERS, ARCHITECT_NODE_KINDS, ARCHITECT_NODE_STATUSES, ARCHITECT_NOTE_KINDS, type ArchitectDepth } from "./constants"
import type { ArchitectGraph } from "./graph"

/**
 * Mensagens do Agente Arquiteto (módulo PURO): instruções duráveis da sessão, o pedido de cada versão
 * do diagrama e o pedido de correção quando a resposta vem inválida.
 */

/** Prefixo das ferramentas do MCP "Memória própria" no OpenCode (`opex_memorias_<ferramenta>`). */
const SELF_MEMORY_TOOL_PREFIX = "opex_memorias_"

/**
 * Uma linha de exemplo por operação do formato ao vivo (`stream-parser.ts`). Só marcadores, sem um
 * assunto de exemplo: um exemplo concreto (antes, o próprio diagrama do arquiteto) puxa o modelo para
 * um tema que não está nos planos.
 */
const FORMAT_LINES = [
    { op: "meta", title: "título curto do diagrama", summary: "a ideia do plano em 1 a 3 frases" },
    { op: "node", id: "objective", label: "objetivo da tarefa", kind: "objective", status: "new", detail: "o que os planos entregam, em linguagem comum" },
    { op: "group", id: "g-pessoas", label: "Quem participa", layer: ARCHITECT_GROUP_LAYERS.join("|") },
    { op: "node", id: "ator", label: "quem usa ou dispara", groupId: "g-pessoas", kind: "actor", status: "existing", detail: "quem participa do processo" },
    { op: "node", id: "processo", label: "processo dos planos", kind: ARCHITECT_NODE_KINDS.join("|"), status: ARCHITECT_NODE_STATUSES.join("|"), detail: "o que acontece e por quê, em 1 a 3 frases" },
    { op: "node", id: "informacao", label: "o que fica guardado", kind: "information", status: "new", detail: "a informação e para que serve" },
    { op: "edge", source: "ator", target: "processo", kind: ARCHITECT_EDGE_KINDS.join("|"), label: "opcional, 1 a 3 palavras" },
    { op: "edge", source: "processo", target: "informacao", kind: "produces" },
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

/**
 * Fonte do diagrama: TODOS os planos da mesa consolidados (plano v6 da OPE-105). Uma rodada de
 * correção costuma descrever só o ajuste; sem o histórico, o diagrama perde a funcionalidade da tarefa
 * e passa a desenhar outro assunto (ex.: a prévia).
 */
const SOURCE_RULES = [
    "## Fonte: os planos da tarefa",
    "- O diagrama mostra a FUNCIONALIDADE da tarefa como ela fica depois de TODOS os planos da mesa, que vêm em ordem no pedido (o primeiro é o plano original; os seguintes, as rodadas de ajuste, com o pedido que gerou cada uma).",
    "- Consolide: em caso de conflito, vale o plano mais recente. Uma rodada que só ajusta um detalhe atualiza o diagrama da funcionalidade; não troca o assunto do diagrama.",
    "- Fica FORA do diagrama o processo de ENTREGA da tarefa: integrar a branch principal, conflitos de merge, prévia, build, deploy, CI, testes, versão, erros de publicação e endereço da prévia — a menos que a rodada mude o que a funcionalidade faz para quem a usa. Uma rodada só de entrega não acrescenta nós.",
    "- NADA entra no diagrama sem estar nos planos ou na tarefa. As memórias servem só para vocabulário e estilo, nunca para acrescentar assuntos.",
]

export function buildArchitectInstructions(input: {
    instructions: string
    memories: string
    selfMemory?: boolean
    /** MCP de memórias registrado (leitura da faixa de títulos, OPE-117); provedor direto não tem. */
    memoryRead?: boolean
    counts?: { titles: number; overflow: number } | null
    /** Sessão do OpenCode no repositório (`false` = provedor direto, sem acesso ao código). */
    codeAccess?: boolean
}): string {
    const extra = input.instructions.trim()
    const codeAccess = input.codeAccess ?? true
    const rules = codeAccess
        ? [
              "## Regras invioláveis",
              "- Você só LÊ: NUNCA altere arquivos, NUNCA faça commit, checkout, stash ou qualquer operação que mude o repositório.",
              "- NUNCA rode testes, build, typecheck, lint, servidores nem instale dependências.",
              "- Não pergunte nada: ninguém responde durante a geração.",
              "",
              ...SOURCE_RULES,
              "- Leia o código só se precisar entender um processo que os planos citam — e NUNCA cite o que leu (nada de arquivos, funções ou rotas no diagrama).",
          ]
        : [
              "## Regras invioláveis",
              "- Você NÃO tem acesso ao repositório nem a ferramentas: trabalhe só com o plano, a tarefa e (num ajuste) o diagrama anterior que vêm no pedido.",
              "- Não pergunte nada: ninguém responde durante a geração.",
              "",
              ...SOURCE_RULES,
          ]
    return [
        "Você é o AGENTE ARQUITETO: lê os planos de uma tarefa e desenha a ARQUITETURA DA IDEIA da funcionalidade — quem participa, quais processos acontecem, quais estruturas e informações existem e como se ligam — para quem NÃO lê código. É um diagrama de quadro branco, de alto nível, nunca um mapa de arquivos.",
        "",
        ...rules,
        "",
        "## Escopo e vocabulário: ideias, processos e estruturas",
        "- Parta do OBJETIVO do plano (um nó `kind: \"objective\"`) e mostre só as partes que o plano CRIA, ALTERA ou de que depende diretamente. NÃO desenhe o sistema inteiro: o que já existe e não muda aparece só como contexto mínimo (`status: \"existing\"`).",
        "- `status`: `new` = o plano cria; `changed` = o plano altera; `existing` = só contexto.",
        "- Tipos de nó (`kind`): `objective` (o objetivo), `actor` (pessoa ou ator: o dono, o cliente, um agente), `process` (processo ou etapa), `structure` (uma parte do sistema vista como ideia), `information` (o que é guardado ou trocado), `external` (serviço externo), `decision` e `risk`.",
        "- Rótulos de 2 a 5 palavras em português comum, com os nomes que os PLANOS usam para as coisas (nunca nomes de código). Descrição: o que o bloco faz e por quê, em 1 a 3 frases.",
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
        input.selfMemory || input.memoryRead
            ? selfMemoryInstructions("arquiteto", { kind: "review" }, { toolPrefix: SELF_MEMORY_TOOL_PREFIX, counts: input.counts, write: Boolean(input.selfMemory), read: Boolean(input.memoryRead) })
            : "",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

export interface PlanSource {
    version: number
    /** Pedido do dono que gerou esta rodada (`null` no plano original). */
    feedback: string | null
    text: string
}

/** Marca de mensagem do histórico (`§49§ `) que às vezes abre o texto do plano. */
const cleanPlan = (text: string) => text.replace(/^\s*§\d+§\s*/, "").trim()

/**
 * Seção dos planos em ordem. Acima de `ARCHITECT_PLANS_MAX_CHARS`, o primeiro e o último ficam
 * inteiros e os do meio são encurtados (com a marca do corte), divididos igualmente na sobra.
 */
export function plansSection(plans: readonly PlanSource[]): string {
    const texts = plans.map((plan) => cleanPlan(plan.text))
    const total = texts.reduce((sum, text) => sum + text.length, 0)
    if (total > ARCHITECT_PLANS_MAX_CHARS && texts.length > 2) {
        const middle = texts.length - 2
        const spare = Math.max(0, ARCHITECT_PLANS_MAX_CHARS - texts[0]!.length - texts.at(-1)!.length)
        // Cada plano do meio guarda ao menos o começo (o resumo da rodada), mesmo sem sobra.
        const each = Math.max(2_000, Math.floor(spare / middle))
        for (let index = 1; index < texts.length - 1; index++) {
            if (texts[index]!.length > each) texts[index] = `${texts[index]!.slice(0, each)}\n[… plano encurtado: o texto passou do limite do pedido]`
        }
    }
    return plans
        .map((plan, index) => {
            const last = index === plans.length - 1
            const heading = index === 0 ? `### Plano v${plan.version} (original)${last ? " — o atual" : ""}` : `### Plano v${plan.version}${last ? " (o mais recente: vale nos conflitos)" : ""}`
            const asked = plan.feedback?.trim() ? `Pedido que gerou esta rodada: ${plan.feedback.trim()}\n\n` : ""
            return `${heading}\n${asked}${texts[index]}`
        })
        .join("\n\n")
}

export interface DiagramPromptInput {
    code: string
    title: string
    description: string | null
    technicalSpec: string | null
    planVersion: number
    /** Todos os planos da mesa até `planVersion`, em ordem (o diagrama os consolida). */
    plans: readonly PlanSource[]
    /** `null` = provedor direto, sem acesso ao código. */
    directory: string | null
    /** O diretório é o worktree da mesa (`false` = a base do repositório: o worktree ainda não existe). */
    worktree: boolean
    depth: ArchitectDepth
    /** Ajuste: o grafo anterior e o pedido do usuário. */
    adjust?: { graph: ArchitectGraph; feedback: string } | null
}

export function buildDiagramPrompt(input: DiagramPromptInput): string {
    const where = !input.directory
        ? "Você não tem acesso ao código: o diagrama sai dos planos e da tarefa abaixo."
        : input.worktree
        ? `Se precisar entender um processo que já existe, o código está no worktree da mesa: ${input.directory} (o que vale são os planos; nunca cite o código no diagrama).`
        : `Se precisar entender um processo que já existe, o código está na base do repositório em ${input.directory} (o worktree da mesa ainda não existe; os planos descrevem as mudanças sobre esta base; nunca cite o código no diagrama).`
    return [
        `# Arquitetura da tarefa ${input.code}: ${input.title} (planos v1 a v${input.planVersion})`,
        "",
        where,
        "",
        depthDirective(input.depth),
        "",
        "## Tarefa",
        input.description?.trim() ? `### Descrição\n${input.description.trim()}` : "(sem descrição)",
        input.technicalSpec?.trim() ? `\n### Especificação técnica\n${input.technicalSpec.trim()}` : "",
        "",
        `## Planos da tarefa (${input.plans.length}, em ordem; consolide a funcionalidade, fora o processo de entrega)`,
        plansSection(input.plans),
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

/**
 * Pedido de correção num provedor direto (sem conversa): leva o pedido original, o fim da resposta
 * anterior e a correção, numa chamada nova.
 */
export function buildDirectFollowUp(originalPrompt: string, previousAnswer: string, correction: string): string {
    const tail = previousAnswer.slice(-ARCHITECT_DIRECT_PREVIOUS_MAX_CHARS)
    return [originalPrompt, "", "---", "## Sua resposta anterior (final)", "", tail || "(vazia)", "", "---", "## Correção pedida", "", correction].join("\n")
}
