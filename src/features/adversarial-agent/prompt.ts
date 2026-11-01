import { memoriesSection } from "@/features/ai/memories-prompt"
import { selfMemoryInstructions } from "@/features/ai/self-memory"
import { ADVERSARIAL_LEVEL_DEFS, FINDING_CATEGORIES, FINDING_SEVERITIES, FINDING_SEVERITY_LABELS, type AdversarialLevel } from "./constants"
import type { EvaluatedFinding } from "./verdict"

/**
 * Mensagens do Agente Adversário (módulo PURO): instruções duráveis da sessão do revisor, o pedido de
 * cada rodada e o pedido de correção enviado ao implementador (na sessão da mesa).
 */

const SEVERITY_GUIDE: Record<(typeof FINDING_SEVERITIES)[number], string> = {
    critical: "quebra certa num fluxo principal, perda ou corrupção de dados, falha grave de segurança ou requisito da tarefa não implementado",
    high: "bug provável ou regressão em comportamento existente",
    medium: "caso de borda relevante, erro não tratado ou violação de regra explícita do projeto (AGENTS.md, docs)",
    low: "problema de design ou manutenção, lógica nova sem teste, inconsistência com os padrões do código",
    nit: "legibilidade, nomes, duplicação pequena, estilo",
}

/** Prefixo das ferramentas do MCP "Memória própria" no OpenCode (`opex_memorias_<ferramenta>`). */
export const SELF_MEMORY_TOOL_PREFIX = "opex_memorias_"

export function buildAdversarialInstructions(input: { level: AdversarialLevel; instructions: string; memories: string; selfMemory?: boolean }): string {
    const level = ADVERSARIAL_LEVEL_DEFS[input.level]
    const extra = input.instructions.trim()
    return [
        "Você é o AGENTE ADVERSÁRIO: um revisor de código independente, sem vínculo com quem implementou. Seu papel é encontrar problemas reais na implementação antes que ela siga para a prévia ou para o Pull Request.",
        "",
        "## Regras invioláveis",
        "- NUNCA rode testes, build, typecheck, lint, formatadores, servidores nem instale dependências. Considere que o implementador já rodou tudo isso e que está tudo verde.",
        "- NUNCA altere arquivos, NUNCA faça commit, push, checkout, stash ou qualquer operação que mude o repositório. Você só LÊ (git diff/log/show/status, leitura de arquivos e buscas).",
        "- Revise SOMENTE o código alterado nesta mesa (o diff contra a branch base e o que ainda não foi commitado). Código pré-existente só importa quando o diff o quebra.",
        "- Não pergunte nada: ninguém responde durante a revisão.",
        "",
        `## Nível de criticidade: ${level.label}`,
        `Bloqueia a partir da severidade **${FINDING_SEVERITY_LABELS[level.blocksFrom]}** (${level.blocksFrom}).`,
        `- Bloqueia: ${level.blocks.join("; ")}.`,
        `- Não bloqueia: ${level.allows.join("; ")}.`,
        "",
        "## Severidades (classifique com honestidade; quem decide se bloqueia é o sistema)",
        ...FINDING_SEVERITIES.map((severity) => `- ${severity}: ${SEVERITY_GUIDE[severity]}.`),
        "",
        "## Não bloqueie à toa",
        "- Reporte só o que você comprovou lendo o código: cite arquivo, linha, o trecho (evidência) e um cenário concreto em que o problema acontece.",
        "- Sem evidência e cenário, não é achado. Preferência pessoal não é problema.",
        "- Não invente requisitos que a tarefa não pede.",
        "",
        "## Formato da resposta",
        "Escreva um resumo curto da revisão e termine com um bloco ```json``` contendo SOMENTE este objeto:",
        "```json",
        JSON.stringify(
            {
                summary: "resumo de 1 a 3 frases",
                findings: [{ id: "F1", severity: FINDING_SEVERITIES.join("|"), category: FINDING_CATEGORIES.join("|"), title: "frase curta", file: "caminho/do/arquivo.ts", line: 42, evidence: "trecho ou explicação objetiva", scenario: "quando e como o problema acontece", suggestion: "como corrigir", inDiff: true, carriedOver: false, introducedByFix: false }],
                previous: [{ id: "F1", status: "resolved|unresolved|dispute-accepted", note: "opcional" }],
            },
            null,
            2,
        ),
        "```",
        "- `findings` vazio quando não houver problema. Use ids curtos (F1, F2…); numa rodada seguinte, mantenha o id de um achado anterior que continua sem solução (`carriedOver: true`).",
        "- `previous` só existe a partir da 2ª rodada: o estado de cada achado bloqueante anterior.",
        extra ? `\n## Instruções adicionais\n${extra}` : "",
        memoriesSection(input.memories),
        input.selfMemory ? selfMemoryInstructions("adversario", { kind: "review" }, { toolPrefix: SELF_MEMORY_TOOL_PREFIX }) : "",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

export interface ReviewPromptInput {
    code: string
    title: string
    worktreePath: string
    branch: string
    baseBranch: string
    round: number
    context: string
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
    const base = `origin/${input.baseBranch}`
    const followUp =
        input.round > 1
            ? [
                  "",
                  `## Rodada ${input.round} (depois de uma correção)`,
                  "- Confira cada achado bloqueante da rodada anterior (seção abaixo, quando enviada) e informe o estado em `previous`.",
                  "- Contestação com evidência convincente: aceite (`dispute-accepted`) e não repita o achado.",
                  "- Não troque de objetivo: só abra achado NOVO se ele foi criado pela correção (`introducedByFix: true`) ou se for crítico.",
              ]
            : []
    return [
        `Revise a implementação da tarefa ${input.code} (${input.title}).`,
        `- Worktree: ${input.worktreePath} (branch ${input.branch}, base ${base}).`,
        `- Código alterado: \`git -C ${input.worktreePath} diff ${base}...HEAD\`, mais o que ainda não foi commitado (\`git -C ${input.worktreePath} status --short\` e \`git -C ${input.worktreePath} diff HEAD\`) e os arquivos novos não rastreados.`,
        "- Leia os arquivos envolvidos e as regras do produto (AGENTS.md, docs) para julgar o diff no contexto.",
        "- Lembre: não rode testes, build, typecheck ou lint e não altere nada.",
        ...followUp,
        input.context ? `\n---\n\n${input.context}` : "",
    ]
        .filter(Boolean)
        .join("\n")
}

/** Pedido de correção ao implementador (na sessão da mesa) com os achados bloqueantes escolhidos. */
export function buildFixPrompt(input: { round: number; worktreePath: string; findings: readonly EvaluatedFinding[]; userText?: string | null }): string {
    const findings = input.findings.map((finding) =>
        [
            `### ${finding.id} · ${FINDING_SEVERITY_LABELS[finding.severity]} · ${finding.title}`,
            finding.file ? `- Arquivo: \`${finding.file}${finding.line ? `:${finding.line}` : ""}\`` : "",
            finding.evidence ? `- Evidência: ${finding.evidence}` : "",
            finding.scenario ? `- Cenário: ${finding.scenario}` : "",
            finding.suggestion ? `- Sugestão: ${finding.suggestion}` : "",
        ]
            .filter(Boolean)
            .join("\n"),
    )
    const user = (input.userText ?? "").trim()
    return [
        `Um revisor independente (agente adversário) revisou a sua implementação (rodada ${input.round}) e encontrou problemas que BLOQUEIAM a entrega. Corrija-os no worktree ${input.worktreePath}.`,
        "- Corrija só o que os achados pedem, sem refatorar o resto. Rode os testes e checks afetados e deixe tudo verde, como na implementação.",
        "- Pode fazer commits locais; NÃO faça push e NÃO abra Pull Request.",
        '- Se discordar de um achado com base em evidência concreta, não o altere e conteste. Termine a resposta com um resumo do que mudou e um bloco ```json``` com {"disputes": [{"id": "F1", "reason": "por que o achado não procede"}]} (lista vazia se não contestar nada).',
        "",
        "## Achados bloqueantes",
        findings.join("\n\n"),
        user ? `\n## Orientação do usuário\n${user}` : "",
    ]
        .filter(Boolean)
        .join("\n")
}
