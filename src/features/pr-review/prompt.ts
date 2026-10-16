import { reviewMarker } from "./logic"

/** Mensagens enviadas à sessão do OpenCode na revisão de PR (módulo puro). */

export interface PrReviewContext {
    repo: string
    number: number
    url: string
    title: string
    author: string | null
    baseRef: string
    headSha: string
    sessionDirectory: string
    worktreePath: string
    skill: string
    /** O PR foi aberto pelo usuário do token (o GitHub não deixa aprovar/pedir mudanças no próprio PR). */
    ownPr: boolean
    /** Menção da central (PR de mesa): num comentário, faz a mesa replanejar. */
    mention: string | null
}

/** Instruções duráveis da sessão: as adicionais configuradas na aba. */
export function buildPrReviewInstructions(instructions: string): string {
    const text = instructions.trim()
    return text ? `## Instruções adicionais da revisão de PR\n${text}` : ""
}

export function buildPrReviewPrompt(ctx: PrReviewContext): string {
    const marker = reviewMarker(ctx.headSha)
    const own = ctx.ownPr
        ? [
              "- Este PR foi aberto pelo mesmo usuário do `gh`: o GitHub NÃO permite aprovar nem pedir mudanças no próprio PR. Publique o resultado como comentário de revisão (`gh pr review --comment`).",
              ctx.mention
                  ? `- Se houver bloqueios reais, comece o comentário com \`${ctx.mention}\` (é o que faz a mesa de desenvolvimento corrigir o PR). Sem bloqueios, NÃO use essa menção.`
                  : "",
          ]
        : ["- Se o `gh` recusar aprovar/pedir mudanças por o PR ser seu, publique como comentário de revisão (`gh pr review --comment`)."]
    return [
        `Você é o agente de REVISÃO DE PR. Revise o Pull Request #${ctx.number} de ${ctx.repo} (${ctx.url}): "${ctx.title}"${ctx.author ? `, aberto por @${ctx.author}` : ""}, com destino \`${ctx.baseRef}\`.`,
        "",
        "## 1. Worktree temporário (obrigatório antes de ler o código)",
        `- A partir de ${ctx.sessionDirectory}: \`git fetch origin pull/${ctx.number}/head\` e \`git worktree add --detach ${ctx.worktreePath} ${ctx.headSha}\` (se o diretório já existir como worktree, só \`git -C ${ctx.worktreePath} checkout --detach ${ctx.headSha}\`).`,
        `- MOVA ESTA SESSÃO para ${ctx.worktreePath} com a ferramenta de mover sessão do OpenCode (session_move) e confirme o diretório atual.`,
        "- Nunca troque a branch do diretório principal nem de outros worktrees (há mesas de desenvolvimento trabalhando neles).",
        "",
        "## 2. Revisão",
        `- Carregue e siga a skill \`${ctx.skill}\` (ferramenta de skills do OpenCode) para revisar o PR #${ctx.number} (\`gh pr view ${ctx.number} -R ${ctx.repo}\`, \`gh pr diff ${ctx.number} -R ${ctx.repo}\`).`,
        `- Revise o commit ${ctx.headSha}. Não altere arquivos, não faça commit, push nem merge.`,
        "- NÃO execute testes, build, typecheck, lint nem instale dependências (nada de `pnpm test`, `vitest`, `npm install`, `tsc` etc.). Considere que o desenvolvedor já rodou os testes antes de abrir o PR; como evidência de testes, lint e build, use apenas o status dos checks do CI (`gh pr checks`) e a leitura do código.",
        "",
        "## 3. Publicação no GitHub",
        "- Publique o resultado seguindo a skill (aprovar sem bloqueios reais; pedir mudanças só com bloqueios comprovados).",
        ...own.filter(Boolean),
        `- Termine o corpo de TODA revisão/comentário que publicar com a linha \`${marker}\` (marcador oculto do Opex).`,
        "",
        "## 4. Limpeza",
        `- Mova a sessão de volta para ${ctx.sessionDirectory} (session_move) e remova o worktree: \`git worktree remove --force ${ctx.worktreePath}\`.`,
        "",
        "## 5. Resposta",
        "- Responda com o relatório completo da revisão (Bloqueios reais / Observações não bloqueantes / Elogios / Verificações).",
        '- Termine com um bloco ```json``` contendo SOMENTE o objeto: {"verdict": "approved" | "changes_requested" | "commented", "blocking": <número de bloqueios>, "summary": "<uma linha>"}. Use "changes_requested" sempre que houver bloqueios reais, mesmo que tenha publicado como comentário.',
    ].join("\n")
}
