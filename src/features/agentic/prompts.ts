import type { AgentRole } from "./constants"
import type { CentralConfig } from "./schemas"

/**
 * Mensagens enviadas à sessão do OpenCode em cada etapa da mesa (módulo puro). A sessão é a mesma
 * do início ao fim: cada turno só precisa do que mudou — o agente já tem o plano e o histórico.
 */

export interface WorkbenchContext {
    code: string
    title: string
    projectName: string
    repo: string | null
    sessionDirectory: string
    worktreePath: string
    branch: string
    composeProject: string
}

/** Texto sem acento, minúsculo, só `[a-z0-9-]`. */
export function slugify(value: string, max = 40): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, max)
        .replace(/-+$/g, "")
}

/** `{code}`, `{title}` e `{slug}` do padrão → valores da tarefa. */
export function renderPattern(pattern: string, task: { code: string; title: string }): string {
    return pattern.replaceAll("{code}", task.code).replaceAll("{title}", task.title).replaceAll("{slug}", slugify(task.title))
}

export function branchNameFor(config: CentralConfig, task: { code: string; title: string }): string {
    const raw = renderPattern(config.git.branchPattern, { code: task.code.toLowerCase(), title: task.title })
    return raw.replace(/[^A-Za-z0-9._/-]+/g, "-").replace(/-{2,}/g, "-").replace(/[-/.]+$/g, "")
}

export function worktreePathFor(config: CentralConfig, code: string): string {
    const root = config.worktreeRoot || `${config.sessionDirectory}/worktrees`
    return `${root}/${code.toLowerCase()}`
}

export function composeProjectFor(projectName: string, code: string): string {
    return slugify(`${projectName}-${code}`, 60) || slugify(code)
}

function extra(config: CentralConfig, role: AgentRole): string {
    const text = config.instructions[role].trim()
    return text ? `\n\n## Instruções adicionais da central\n${text}` : ""
}

const JSON_RULE = "Termine a resposta com um bloco ```json``` contendo SOMENTE o objeto pedido (sem comentários)."

export function planPrompt(config: CentralConfig, ctx: WorkbenchContext, taskMarkdown: string, additionalInfo: string | null = null): string {
    const info = (additionalInfo ?? "").trim()
    const parts = [
        `Você é o agente de PLANEJAMENTO de uma mesa de trabalho dO Opex para a tarefa ${ctx.code} do projeto ${ctx.projectName}.`,
        `O repositório está no diretório atual (${ctx.sessionDirectory}). Leia o código e as instruções do projeto (AGENTS.md, README, docs) antes de planejar.`,
        "NÃO altere arquivos, NÃO crie branches e NÃO execute comandos que modifiquem o repositório nesta etapa.",
        "Produza um plano de implementação em Markdown, em português do Brasil, com: entendimento da tarefa, abordagem, arquivos a criar/alterar, passos numerados, testes, riscos e dúvidas em aberto.",
        "Se algo essencial estiver ambíguo, pergunte (ferramenta de perguntas) antes de fechar o plano.",
        "Responda apenas com o plano (ele será exibido ao usuário e usado na implementação).",
        "",
        "---",
        taskMarkdown,
    ]
    if (info) parts.push("", "## Informações adicionais", info)
    return parts.join("\n") + extra(config, "planning")
}

export function revisePlanPrompt(config: CentralConfig, feedback: string): string {
    return [
        "O usuário pediu correções no plano. Revise o plano considerando o pedido abaixo e responda com o plano COMPLETO atualizado (não só as diferenças).",
        "Continue sem alterar arquivos.",
        "",
        "## Pedido do usuário",
        feedback,
    ].join("\n") + extra(config, "planning")
}

export function previewCorrectionPrompt(config: CentralConfig, feedback: string): string {
    return [
        "O usuário testou a prévia da implementação e pediu correções. Volte ao PLANEJAMENTO: analise o pedido, o código atual do worktree e responda com o plano COMPLETO atualizado para corrigir.",
        "Não altere arquivos nesta etapa — a implementação virá depois da aprovação do plano.",
        "",
        "## O que está errado / precisa mudar",
        feedback,
    ].join("\n") + extra(config, "planning")
}

export function prChangesPrompt(config: CentralConfig, prUrl: string, feedback: string): string {
    return [
        `Um comentário ou revisão do Pull Request (${prUrl}) pediu mudanças. Volte ao PLANEJAMENTO: analise os comentários abaixo e responda com o plano COMPLETO atualizado para atendê-los.`,
        "Não altere arquivos nesta etapa.",
        "",
        "## Comentários do PR",
        feedback,
    ].join("\n") + extra(config, "planning")
}

export function reopenPrompt(config: CentralConfig, ctx: WorkbenchContext, feedback: string, lastPlan: string | null = null): string {
    const plan = (lastPlan ?? "").trim()
    return [
        `A mesa da tarefa ${ctx.code} (${ctx.title}) foi concluída (PR mergeado) e foi REABERTA pelo usuário. Volte ao PLANEJAMENTO no repositório principal (${ctx.sessionDirectory}).`,
        "Esta é uma sessão NOVA do OpenCode: o histórico da conversa anterior não está mais disponível. Use o plano anterior (quando houver, abaixo) e o trabalho já presente na branch de destino como contexto.",
        "Considere que o trabalho anterior já está na branch de destino. Responda com um plano COMPLETO para o que foi pedido abaixo, sem alterar arquivos.",
        "",
        "## Pedido do usuário",
        feedback,
        plan ? `\n## Plano anterior (última versão)\n${plan}` : "",
    ]
        .filter(Boolean)
        .join("\n") + extra(config, "planning")
}

export function implementPrompt(config: CentralConfig, ctx: WorkbenchContext, planVersion: number, additionalInfo: string | null = null): string {
    const setup = config.git.setupCommands.trim()
    const info = (additionalInfo ?? "").trim()
    const base =
        [
            `Você agora é o agente de IMPLEMENTAÇÃO. Implemente o plano aprovado (versão ${planVersion}, a última que você escreveu nesta sessão).`,
            "",
            "## 1. Worktree (obrigatório antes de editar qualquer arquivo)",
            `- Se o diretório ${ctx.worktreePath} já for um worktree deste repositório, reutilize-o (é uma nova rodada sobre o mesmo trabalho).`,
            `- Senão, a partir de ${ctx.sessionDirectory}: \`git fetch origin\` e \`git worktree add -b ${ctx.branch} ${ctx.worktreePath} origin/${config.git.baseBranch}\` (se a branch já existir, use \`git worktree add ${ctx.worktreePath} ${ctx.branch}\`).`,
            `- MOVA ESTA SESSÃO para ${ctx.worktreePath} com a ferramenta de mover sessão do OpenCode (session_move) e confirme o diretório atual antes de continuar.`,
            setup ? `- No worktree, rode os comandos de preparo:\n\`\`\`sh\n${setup}\n\`\`\`` : "",
            "",
            "## 2. Implementação",
            "- Siga o plano aprovado e as instruções do projeto (AGENTS.md etc.). Escreva/atualize os testes previstos e rode-os.",
            "- Pode fazer commits locais; NÃO faça push e NÃO abra Pull Request nesta etapa.",
            "- Ao terminar, responda com um resumo do que foi feito, arquivos alterados e resultado dos testes.",
        ]
            .filter(Boolean)
            .join("\n")
    const withInfo = info ? `${base}\n\n## Informações adicionais\n${info}` : base
    return withInfo + extra(config, "implementation")
}

export function buildPrompt(config: CentralConfig, ctx: WorkbenchContext, port: number): string {
    const env = config.environment
    const file = env.composeFile.trim() ? ` -f ${env.composeFile.trim()}` : ""
    const command = `${env.portEnvVar}=${port} docker compose -p ${ctx.composeProject}${file} up -d --build`
    const health = `http://localhost:${port}${env.healthPath || "/"}`
    return [
        "Você agora é o agente de BUILD. Suba a prévia da implementação com Docker Compose, no worktree.",
        `- Diretório: ${ctx.worktreePath} (confirme que esta sessão está nele; se não estiver, mova-a com session_move).`,
        `- Confira o docker compose do projeto${file ? ` (${env.composeFile.trim()})` : ""} e garanta que a porta publicada vem da variável ${env.portEnvVar}. Use EXCLUSIVAMENTE a porta ${port} (faixa reservada 4001–4098; nunca outra).`,
        `- Execute: \`${command}\` (se já houver containers deste projeto, o mesmo comando os reconstrói).`,
        `- Acompanhe o build até o fim e espere a aplicação responder em ${health} (tente por alguns minutos; veja \`docker compose -p ${ctx.composeProject} logs --tail 100\` se falhar).`,
        "- Se o build falhar por causa do código, corrija o mínimo necessário e tente de novo.",
        `- ${JSON_RULE} Formato: {"ok": true} quando a prévia estiver respondendo, ou {"ok": false, "error": "motivo"}.`,
    ].join("\n") + extra(config, "build")
}

export function prPrompt(config: CentralConfig, ctx: WorkbenchContext, task: { code: string; title: string; url?: string }, existingPr: { number: number; url: string } | null): string {
    const git = config.git
    const title = renderPattern(git.prTitlePattern, task)
    const commit = renderPattern(git.commitPattern, task)
    const validate = git.validateCommands.trim()
    const flags = [git.prDraft ? "--draft" : "", ...git.prReviewers.map((name) => `--reviewer ${name}`), ...git.prLabels.map((label) => `--label "${label}"`)].filter(Boolean).join(" ")
    return [
        "Você agora é o agente de PULL REQUEST. O usuário aprovou a prévia.",
        `- Trabalhe no worktree ${ctx.worktreePath}, branch ${ctx.branch}.`,
        validate ? `- Antes de tudo, rode a validação e corrija o que falhar:\n\`\`\`sh\n${validate}\n\`\`\`` : "",
        `- Faça commit de todas as alterações pendentes com a mensagem \`${commit}\` (siga a convenção do projeto, se houver; mantenha o código ${task.code} no título).`,
        `- \`git push -u origin ${ctx.branch}\`.`,
        existingPr
            ? `- O PR #${existingPr.number} (${existingPr.url}) já existe: o push o atualiza. Comente nele um resumo do que mudou nesta rodada (\`gh pr comment ${existingPr.number}\`). Não abra outro PR.`
            : `- Abra o PR com o gh: \`gh pr create --base ${git.prTargetBranch} --head ${ctx.branch} --title "${title}" ${flags}\` com um corpo em Markdown: resumo, o que mudou, como testar${task.url ? ` e o link da tarefa (${task.url})` : ""}.`,
        `- ${JSON_RULE} Formato: {"url": "<URL do PR>", "number": <número>}.`,
    ]
        .filter(Boolean)
        .join("\n") + extra(config, "pr")
}

export function conflictPrompt(config: CentralConfig, ctx: WorkbenchContext, pr: { number: number; url: string; baseBranch: string; headBranch: string }): string {
    const git = config.git
    const validate = git.validateCommands.trim()
    return [
        `Você agora é o agente de RESOLUÇÃO DE CONFLITOS. O PR #${pr.number} (${pr.url}) está com o merge BLOQUEADO por conflito entre a branch ${pr.headBranch} e a branch de destino ${pr.baseBranch}. Resolva o conflito e atualize o PR — sem nova aprovação do usuário.`,
        `- Trabalhe no worktree ${ctx.worktreePath}, na branch ${ctx.branch} (a branch do PR). Confirme o diretório atual e, se não for o worktree, ajuste antes de continuar.`,
        `- \`git fetch origin\` para trazer o estado mais recente.`,
        `- Integre a branch de destino por merge, preservando o histórico: \`git merge origin/${pr.baseBranch}\`. NÃO faça rebase nem force-push.`,
        "- Resolva cada conflito preservando a intenção das alterações dos dois lados (não descarte nenhum dos lados). Rode os testes pertinentes quando ajudar a decidir.",
        validate ? `- Antes de publicar, rode a validação e corrija o que falhar:\n\`\`\`sh\n${validate}\n\`\`\`` : "",
        `- Conclua o merge com um commit seguindo a convenção do projeto (mantenha o código ${ctx.code} no título) e faça \`git push\` na branch do PR.`,
        `- Comente um resumo da resolução no PR: \`gh pr comment ${pr.number} --body "..."\`. NÃO mencione @opex no comentário.`,
        "- NÃO abra outro Pull Request, NÃO faça merge do PR, NÃO use force-push e NÃO descarte alterações locais.",
        `- ${JSON_RULE} Formato: {"ok": true, "sha": "<sha publicado>"} quando o push concluir a resolução, ou {"ok": false, "error": "motivo"}.`,
    ]
        .filter(Boolean)
        .join("\n") + extra(config, "pr")
}

export function mergePrPrompt(config: CentralConfig, ctx: WorkbenchContext, pr: { number: number; url: string; baseBranch: string }): string {
    return [
        `Você agora é o agente de MERGE. O PR #${pr.number} (${pr.url}) está pronto: sem conflitos e com as verificações exigidas satisfeitas. Faça o merge — sem nova aprovação do usuário.`,
        `- Trabalhe no worktree ${ctx.worktreePath}, branch ${ctx.branch}. Confirme o diretório atual e, se não for o worktree, ajuste antes de continuar.`,
        `- Faça o merge preservando o histórico: \`gh pr merge ${pr.number} --merge\`. NÃO use squash nem rebase.`,
        `- NÃO use \`--admin\`, \`--auto\`, force-push nem contorne as proteções do repositório. Se o GitHub recusar (verificações, revisões obrigatórias, regras de branch), pare e informe o motivo.`,
        "- NÃO apague a branch remota nesta etapa (a exclusão é um passo separado) e NÃO abra outro Pull Request.",
        `- ${JSON_RULE} Formato: {"ok": true} quando o PR estiver mergeado, ou {"ok": false, "error": "motivo"}.`,
    ].join("\n") + extra(config, "pr")
}

export function deletePrBranchPrompt(config: CentralConfig, ctx: WorkbenchContext, pr: { number: number; url: string; branch: string }): string {
    return [
        `O PR #${pr.number} (${pr.url}) foi mergeado. Apague a branch remota de origem \`${pr.branch}\` — sem nova aprovação do usuário.`,
        `- Trabalhe no worktree ${ctx.worktreePath} (repositório do projeto). Confirme o diretório atual e, se não for o worktree, ajuste antes de continuar.`,
        `- Apague só a branch remota de origem: \`git push origin --delete ${pr.branch}\`.`,
        `- NUNCA apague a branch de destino \`${config.git.prTargetBranch}\` nem a branch padrão do repositório; apague apenas \`${pr.branch}\`.`,
        "- Se a branch remota já não existir, considere a exclusão concluída (idempotente).",
        `- ${JSON_RULE} Formato: {"ok": true} quando a branch remota tiver sido apagada (ou já não existir), ou {"ok": false, "error": "motivo"}.`,
    ].join("\n") + extra(config, "pr")
}

export function cleanupPrompt(config: CentralConfig, ctx: WorkbenchContext): string {
    const steps = [
        `- Primeiro MOVA ESTA SESSÃO de volta para ${ctx.sessionDirectory} com a ferramenta session_move.`,
        config.cleanup.teardownEnvironment ? `- Derrube a prévia: \`docker compose -p ${ctx.composeProject} down --remove-orphans\` (rode no worktree, se ele ainda existir).` : "",
        config.cleanup.removeWorktree ? `- Remova o worktree: \`git worktree remove --force ${ctx.worktreePath}\` e depois \`git worktree prune\`.` : "",
        config.cleanup.deleteBranch ? `- Apague a branch local \`${ctx.branch}\` (\`git branch -D ${ctx.branch}\`); não apague a remota.` : "",
        `- \`git fetch origin\` e, se for seguro (sem alterações locais), atualize ${config.git.prTargetBranch} no repositório principal.`,
    ].filter(Boolean)
    return [`O PR foi mergeado e a tarefa ${ctx.code} foi concluída. Faça a LIMPEZA:`, ...steps, `- ${JSON_RULE} Formato: {"ok": true} ou {"ok": false, "error": "motivo"}.`].join("\n")
}

/** Último bloco ```json``` (ou o último objeto `{…}`) do texto, já interpretado. */
export function extractJsonBlock(text: string): unknown {
    const fenced = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]!.trim())
    const candidates = fenced.reverse()
    const lastBrace = text.lastIndexOf("{")
    if (lastBrace >= 0) candidates.push(text.slice(lastBrace).replace(/`+\s*$/, "").trim())
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate)
        } catch {
            // tenta o próximo
        }
    }
    return null
}

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/g

/** URL e número do último PR do GitHub citado no texto. */
export function extractPrUrl(text: string): { url: string; number: number } | null {
    const matches = [...text.matchAll(PR_URL)]
    const last = matches.at(-1)
    return last ? { url: last[0], number: Number(last[1]) } : null
}

/** Pedidos de mudança do PR (comentários e revisões) → texto para o planejador (vazio = sem texto com o motivo). */
export function formatPrFeedback(sections: { author: string | null; body: string; comments: { path: string | null; line: number | null; body: string }[] }[]): string {
    return sections
        .map((section) => {
            const lines = [
                section.body.trim() ? section.body.trim() : "",
                ...section.comments.filter((comment) => comment.body.trim()).map((comment) => `- ${comment.path ? `\`${comment.path}${comment.line ? `:${comment.line}` : ""}\`: ` : ""}${comment.body.trim()}`),
            ].filter(Boolean)
            return lines.length ? `### ${section.author ? `@${section.author}` : "Revisor"}\n${lines.join("\n")}` : ""
        })
        .filter(Boolean)
        .join("\n\n")
}
