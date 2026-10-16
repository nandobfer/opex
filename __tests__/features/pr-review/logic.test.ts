import { describe, expect, it } from "vitest"
import { isAutoReviewText, matchesReviewScope, parsePrUrl, parseReviewResult, replanDecision, reviewMarker, reviewWorktreePath, verdictFromGithubState } from "@/features/pr-review/logic"
import { buildPrReviewPrompt } from "@/features/pr-review/prompt"
import { DEFAULT_PR_REVIEW_SETTINGS, prReviewSettingsSchema } from "@/features/pr-review/schemas"

const pr = (overrides: Partial<Parameters<typeof matchesReviewScope>[0]> = {}) => ({ author: "ana", draft: false, requestedReviewers: [] as string[], workbench: false, ...overrides })
const scope = (overrides: Partial<typeof DEFAULT_PR_REVIEW_SETTINGS> = {}) => ({ ...DEFAULT_PR_REVIEW_SETTINGS, ...overrides })

describe("critério da revisão automática", () => {
    it("todos: qualquer PR aberto, menos rascunho e PR de mesa quando desligados", () => {
        expect(matchesReviewScope(pr(), scope(), null)).toBe(true)
        expect(matchesReviewScope(pr({ draft: true }), scope(), null)).toBe(false)
        expect(matchesReviewScope(pr({ draft: true }), scope({ includeDrafts: true }), null)).toBe(true)
        expect(matchesReviewScope(pr({ workbench: true }), scope({ includeWorkbenchPrs: false }), null)).toBe(false)
    })

    it("exceto os meus: compara o autor com o usuário do token (sem caixa)", () => {
        expect(matchesReviewScope(pr({ author: "Eu" }), scope({ scope: "not_mine" }), "eu")).toBe(false)
        expect(matchesReviewScope(pr({ author: "ana" }), scope({ scope: "not_mine" }), "eu")).toBe(true)
    })

    it("revisor solicitado: só quando o usuário está entre os revisores pedidos", () => {
        expect(matchesReviewScope(pr({ requestedReviewers: ["bob", "EU"] }), scope({ scope: "review_requested" }), "eu")).toBe(true)
        expect(matchesReviewScope(pr({ requestedReviewers: ["bob"] }), scope({ scope: "review_requested" }), "eu")).toBe(false)
    })

    it("sem o usuário do GitHub, critérios pessoais deixam o PR de fora", () => {
        expect(matchesReviewScope(pr(), scope({ scope: "not_mine" }), null)).toBe(false)
        expect(matchesReviewScope(pr({ requestedReviewers: ["eu"] }), scope({ scope: "review_requested" }), null)).toBe(false)
    })
})

describe("replanejamento pela revisão automática", () => {
    it("sem limite por padrão", () => {
        expect(replanDecision(DEFAULT_PR_REVIEW_SETTINGS, 50)).toEqual({ allowed: true, reason: null })
    })

    it("com limite, bloqueia ao atingir o máximo; desligado, nunca replaneja", () => {
        const limited = scope({ replanLimit: { enabled: true, max: 2 } })
        expect(replanDecision(limited, 1).allowed).toBe(true)
        expect(replanDecision(limited, 2)).toMatchObject({ allowed: false, reason: expect.stringContaining("limite de 2") })
        expect(replanDecision(scope({ replanOnChanges: false }), 0).allowed).toBe(false)
    })
})

describe("utilitários", () => {
    it("parsePrUrl normaliza o repositório e lê o número", () => {
        expect(parsePrUrl("https://github.com/Org/App/pull/12/files")).toEqual({ repo: "org/app", number: 12 })
        expect(parsePrUrl("https://github.com/org/app/issues/12")).toBeNull()
    })

    it("marcador identifica o texto da revisão automática", () => {
        const marker = reviewMarker("abcdef1234567890")
        expect(marker).toBe("<!-- opex:pr-review sha=abcdef123456 -->")
        expect(isAutoReviewText(`ok\n${marker}`)).toBe(true)
        expect(isAutoReviewText("revisão humana")).toBe(false)
    })

    it("worktree temporário por PR e commit", () => {
        expect(reviewWorktreePath("/repos/app/worktrees/", "org/app", 7, "abcdef123")).toBe("/repos/app/worktrees/review-app-pr-7-abcdef1")
    })

    it("lê o veredito do bloco JSON final e separa o relatório", () => {
        const result = parseReviewResult('## Bloqueios reais\nNenhum\n\n```json\n{"verdict": "approved", "blocking": 0, "summary": "Tudo certo"}\n```')
        expect(result).toEqual({ verdict: "approved", blocking: 0, summary: "Tudo certo", report: "## Bloqueios reais\nNenhum" })
        expect(parseReviewResult("sem json").verdict).toBeNull()
        expect(verdictFromGithubState("CHANGES_REQUESTED")).toBe("changes_requested")
        expect(verdictFromGithubState("DISMISSED")).toBeNull()
    })

    it("schema: ativada exige modelo; skill com formato restrito", () => {
        expect(prReviewSettingsSchema.safeParse({ ...DEFAULT_PR_REVIEW_SETTINGS, enabled: true }).error?.issues[0]?.message).toBe("Selecione o modelo")
        expect(prReviewSettingsSchema.safeParse({ ...DEFAULT_PR_REVIEW_SETTINGS, skill: "rm -rf" }).success).toBe(false)
        expect(prReviewSettingsSchema.safeParse(DEFAULT_PR_REVIEW_SETTINGS).success).toBe(true)
    })
})

describe("prompt", () => {
    const ctx = { repo: "org/app", number: 7, url: "https://github.com/org/app/pull/7", title: "Filtro", author: "eu", baseRef: "main", headSha: "abcdef1234567", sessionDirectory: "/repos/app", worktreePath: "/repos/app/worktrees/review-app-pr-7-abcdef1", skill: "code-review", ownPr: false, mention: null }

    it("manda criar o worktree destacado, usar a skill e marcar a publicação", () => {
        const prompt = buildPrReviewPrompt(ctx)
        expect(prompt).toContain("git worktree add --detach /repos/app/worktrees/review-app-pr-7-abcdef1 abcdef1234567")
        expect(prompt).toContain("skill `code-review`")
        expect(prompt).toContain(reviewMarker("abcdef1234567"))
        expect(prompt).toContain("git worktree remove --force")
    })

    it("proíbe rodar testes, build e lint: o desenvolvedor já testou antes do PR", () => {
        const prompt = buildPrReviewPrompt(ctx)
        expect(prompt).toContain("NÃO execute testes, build, typecheck, lint")
        expect(prompt).toContain("o desenvolvedor já rodou os testes antes de abrir o PR")
        expect(prompt).toContain("gh pr checks")
    })

    it("PR próprio de mesa: comentário com a menção da central só quando houver bloqueios", () => {
        const prompt = buildPrReviewPrompt({ ...ctx, ownPr: true, mention: "@mytasks" })
        expect(prompt).toContain("gh pr review --comment")
        expect(prompt).toContain("comece o comentário com `@mytasks`")
    })
})
