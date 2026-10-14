import { describe, expect, it } from 'vitest'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import {
  branchNameFor,
  buildPrompt,
  cleanupPrompt,
  composeProjectFor,
  conflictPrompt,
  extractJsonBlock,
  extractPrUrl,
  formatPrFeedback,
  implementPrompt,
  planPrompt,
  prPrompt,
  reopenPrompt,
  slugify,
  worktreePathFor,
  type WorkbenchContext,
} from '@/features/agentic/prompts'

const config = defaultCentralConfig('/home/u/app')
const ctx: WorkbenchContext = {
  code: 'GO-DEV-12',
  title: 'Exportar relatório',
  projectName: 'Portal',
  repo: 'org/app',
  sessionDirectory: '/home/u/app',
  worktreePath: '/home/u/app/worktrees/go-dev-12',
  branch: 'feat/go-dev-12-exportar-relatorio',
  composeProject: 'portal-go-dev-12',
}

/** Backup do MongoDB da prévia (OPE-54) usado pelos prompts de build e de limpeza. */
const backup = {
  dir: '/home/u/app/worktrees/.opex-backups/go-dev-12/ciclo-1',
  path: '/home/u/app/worktrees/.opex-backups/go-dev-12/ciclo-1/opex-preview-backup.archive',
}

describe('nomes derivados da tarefa', () => {
  it('slugify remove acentos e símbolos', () => {
    expect(slugify('Relatório de Ações (v2)!')).toBe('relatorio-de-acoes-v2')
  })

  it('branch, worktree e projeto do compose seguem a central', () => {
    expect(branchNameFor(config, { code: 'GO-DEV-12', title: 'Exportar relatório' })).toBe('feat/go-dev-12-exportar-relatorio')
    expect(worktreePathFor(config, 'GO-DEV-12')).toBe('/home/u/app/worktrees/go-dev-12')
    expect(worktreePathFor({ ...config, worktreeRoot: '/wt' }, 'GO-DEV-12')).toBe('/wt/go-dev-12')
    expect(composeProjectFor('Portal Sipal', 'GO-DEV-12')).toBe('portal-sipal-go-dev-12')
  })
})

describe('mensagens das etapas', () => {
  it('implementação manda criar o worktree e mover a sessão', () => {
    const text = implementPrompt(config, ctx, 2)
    expect(text).toContain('git worktree add -b feat/go-dev-12-exportar-relatorio /home/u/app/worktrees/go-dev-12 origin/main')
    expect(text).toContain('session_move')
    expect(text).toContain('versão 2')
  })

  it('build usa a variável e a porta reservada', () => {
    const text = buildPrompt({ ...config, environment: { ...config.environment, portEnvVar: 'APP_PORT', composeFile: 'docker/compose.yml' } }, ctx, 4015, backup)
    expect(text).toContain('APP_PORT=4015 docker compose -p portal-go-dev-12 -f docker/compose.yml up -d --build')
    expect(text).toContain('4001–4098')
  })

  it('build manda criar o dump do MongoDB antes de publicar a prévia (OPE-54)', () => {
    const text = buildPrompt(config, ctx, 4015, backup)
    expect(text).toContain('## Backup do MongoDB (obrigatório ANTES de publicar a prévia)')
    expect(text).toContain('mongodump')
    expect(text).toContain(backup.dir)
    expect(text).toContain(backup.path)
    expect(text).toContain('REUTILIZE-O')
    expect(text).toContain(`test -s '${backup.path}'`)
    expect(text).toContain('{"ok": true} quando o dump existir')
  })

  it('PR novo usa gh pr create; PR existente só atualiza', () => {
    const task = { code: 'GO-DEV-12', title: 'Exportar', url: 'https://go/t' }
    expect(prPrompt({ ...config, git: { ...config.git, prDraft: true, prReviewers: ['ana'] } }, ctx, task, null)).toContain('gh pr create --base main --head feat/go-dev-12-exportar-relatorio --title "Exportar (GO-DEV-12)" --draft --reviewer ana')
    const update = prPrompt(config, ctx, task, { number: 7, url: 'https://github.com/org/app/pull/7' })
    expect(update).toContain('PR #7')
    expect(update).not.toContain('gh pr create')
  })

  it('resolução de conflito usa a branch real do PR e proíbe force-push e merge', () => {
    const text = conflictPrompt(config, ctx, { number: 7, url: 'https://github.com/org/app/pull/7', baseBranch: 'develop', headBranch: 'feat/x' })
    expect(text).toContain('PR #7')
    expect(text).toContain('origin/develop')
    expect(text).toContain('git push')
    expect(text).toContain('force-push')
    expect(text).not.toContain('gh pr create')
    expect(text).toContain('"ok": true')
  })

  it('limpeza respeita as opções da central', () => {
    const text = cleanupPrompt({ ...config, cleanup: { teardownEnvironment: true, removeWorktree: false, deleteBranch: false } }, ctx, null)
    expect(text).toContain('docker compose -p portal-go-dev-12 down')
    expect(text).not.toContain('git worktree remove')
    expect(text).not.toContain('git branch -D')
  })

  it('limpeza remove o backup mesmo com toda a limpeza de ambiente desligada (OPE-54)', () => {
    const text = cleanupPrompt({ ...config, cleanup: { teardownEnvironment: false, removeWorktree: false, deleteBranch: false } }, ctx, backup)
    expect(text).toContain(`rm -rf '${backup.dir}'`)
    expect(text).toContain(backup.path)
    expect(text).not.toContain('docker compose -p')
  })

  it('limpeza sem backup não menciona o dump', () => {
    expect(cleanupPrompt(config, ctx, null)).not.toContain('opex-preview-backup.archive')
  })

  it('reabertura parte de uma sessão nova e inclui o plano anterior quando houver', () => {
    const text = reopenPrompt(config, ctx, 'Ajuste o filtro de data')
    expect(text).toContain('sessão NOVA')
    expect(text).toContain(ctx.title)
    expect(text).toContain('Ajuste o filtro de data')
    expect(text).not.toContain('## Plano anterior')

    const withPlan = reopenPrompt(config, ctx, 'Ajuste o filtro de data', '# Plano v1\n- passo 1')
    expect(withPlan).toContain('## Plano anterior')
    expect(withPlan).toContain('- passo 1')
  })

  it('instruções adicionais da central vão no fim', () => {
    expect(implementPrompt({ ...config, instructions: { ...config.instructions, implementation: 'Use pnpm.' } }, ctx, 1)).toContain('## Instruções adicionais da central\nUse pnpm.')
  })

  it('planejamento anexa as informações adicionais do usuário no primeiro prompt', () => {
    const withInfo = planPrompt(config, ctx, '# Tarefa GO-DEV-12', 'Use o componente X; não altere o schema.')
    expect(withInfo).toContain('## Informações adicionais')
    expect(withInfo).toContain('Use o componente X; não altere o schema.')
    expect(planPrompt(config, ctx, '# Tarefa GO-DEV-12')).not.toContain('Informações adicionais')
    expect(planPrompt(config, ctx, '# Tarefa GO-DEV-12', '   ')).not.toContain('Informações adicionais')
  })

  it('implementação anexa as informações adicionais informadas ao aprovar o plano', () => {
    const withInfo = implementPrompt(config, ctx, 2, 'Use o componente X; não altere o schema.')
    expect(withInfo).toContain('## Informações adicionais')
    expect(withInfo).toContain('Use o componente X; não altere o schema.')
    expect(implementPrompt(config, ctx, 2)).not.toContain('Informações adicionais')
    expect(implementPrompt(config, ctx, 2, '   ')).not.toContain('Informações adicionais')
  })
})

describe('leitura das respostas', () => {
  it('extractJsonBlock pega o último bloco json', () => {
    expect(extractJsonBlock('feito\n```json\n{"ok": false}\n```\nmais\n```json\n{"ok": true}\n```')).toEqual({ ok: true })
    expect(extractJsonBlock('resultado: {"url": "https://x"}')).toEqual({ url: 'https://x' })
    expect(extractJsonBlock('sem json')).toBeNull()
  })

  it('extractPrUrl pega o último PR citado', () => {
    expect(extractPrUrl('abri https://github.com/org/app/pull/3 e https://github.com/org/app/pull/4')).toEqual({ url: 'https://github.com/org/app/pull/4', number: 4 })
    expect(extractPrUrl('nada')).toBeNull()
  })

  it('formatPrFeedback junta corpo e comentários; sem texto vira vazio', () => {
    const text = formatPrFeedback([
      { author: 'ana', body: 'Ajustar nomes', comments: [{ path: 'a.ts', line: 3, body: 'renomear' }] },
      { author: 'bia', body: '@opex ajuste o filtro', comments: [] },
      { author: 'caio', body: '', comments: [{ path: 'b.ts', line: 1, body: '@opex reordenar' }] },
    ])
    expect(text).toContain('### @ana')
    expect(text).toContain('`a.ts:3`: renomear')
    expect(text).toContain('### @bia\n@opex ajuste o filtro')
    expect(text).toContain('`b.ts:1`: @opex reordenar')
    expect(formatPrFeedback([{ author: 'ana', body: '  ', comments: [] }])).toBe('')
  })
})

describe('limpeza da exclusão (OPE-68)', () => {
  it('usa o enunciado da exclusão e diz que o PR e a branch remota não são tocados', () => {
    const text = cleanupPrompt(config, ctx, null, { reason: 'deletion' })
    expect(text).toContain('EXCLUÍDA')
    expect(text).toContain('NÃO toque no Pull Request nem na branch remota')
    expect(text).not.toContain('O PR foi mergeado')
  })

  it('omite worktree e branch que a mesa não registrou', () => {
    const text = cleanupPrompt(config, { ...ctx, worktreePath: '', branch: '' }, null, { reason: 'deletion' })
    expect(text).not.toContain('git worktree remove')
    expect(text).not.toContain('git branch -D')
    expect(text).toContain('docker compose -p portal-go-dev-12 down')
  })

  it('trata recursos já ausentes como removidos (idempotente)', () => {
    expect(cleanupPrompt(config, ctx, null, { reason: 'deletion' })).toContain('se ainda existir')
  })
})

describe('fluxos alternativos (prévia vs PR automático)', () => {
  it('PR automático não afirma que a prévia foi aprovada', () => {
    const task = { code: 'GO-DEV-12', title: 'Exportar' }
    const auto = prPrompt(config, ctx, task, null, { fromPreview: false })
    expect(auto).toContain('PR automático')
    expect(auto).not.toContain('O usuário aprovou a prévia')
    expect(prPrompt(config, ctx, task, null)).toContain('O usuário aprovou a prévia')
  })

  it('limpeza sem prévia não manda derrubar o ambiente, mas mantém o resto', () => {
    const text = cleanupPrompt({ ...config, cleanup: { teardownEnvironment: true, removeWorktree: true, deleteBranch: true } }, ctx, null, { preview: false })
    expect(text).not.toContain('docker compose')
    expect(text).toContain('session_move')
    expect(text).toContain('git worktree remove')
    expect(text).toContain('git branch -D')
  })
})
