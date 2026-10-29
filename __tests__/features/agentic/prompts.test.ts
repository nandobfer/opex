import { describe, expect, it } from 'vitest'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import {
  branchNameFor,
  buildFixPrompt,
  cleanupPrompt,
  composeProjectFor,
  ciFixPrompt,
  conflictPrompt,
  extractJsonBlock,
  extractPrUrl,
  formatPrFeedback,
  implementPrompt,
  planPrompt,
  previewBuildCommands,
  previewPreparePrompt,
  prPrompt,
  remotePreviewCommands,
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
    const cmd = previewBuildCommands({ ...config, environment: { ...config.environment, portEnvVar: 'APP_PORT', composeFile: 'docker/compose.yml' } }, ctx, 4015)
    expect(cmd.command).toBe('APP_PORT=4015 docker compose -p portal-go-dev-12 -f docker/compose.yml up -d --build')
    // O app roda no worktree e força a saída do BuildKit linha a linha (log da aba Build).
    expect(cmd.run).toBe(`cd '/home/u/app/worktrees/go-dev-12' && BUILDKIT_PROGRESS=plain ${cmd.command}`)
  })

  it('build usa o builder do Docker da central quando configurado', () => {
    const cmd = previewBuildCommands({ ...config, environment: { ...config.environment, dockerBuilder: 'limit-builder' } }, ctx, 4015)
    expect(cmd.command).toBe('BUILDX_BUILDER=limit-builder PORT=4015 docker compose -p portal-go-dev-12 up -d --build')
  })

  it('build na Builder Machine: o prefixo do Docker do PC vence o builder da central', () => {
    const prefix = 'DOCKER_CONTEXT=opex-local BUILDX_BUILDER=opex-local-builder'
    const cmd = previewBuildCommands({ ...config, environment: { ...config.environment, dockerBuilder: 'limit-builder' } }, ctx, 4015, { prefix })
    expect(cmd.command).toBe(`${prefix} PORT=4015 docker compose -p portal-go-dev-12 up -d --build`)
    expect(cmd.logs).toBe(`${prefix} docker compose -p portal-go-dev-12 logs --tail 100`)
    const fix = buildFixPrompt(config, ctx, 4015, { exitCode: 1, tail: 'erro', round: 1, command: cmd.command }, { docker: { prefix } })
    expect(fix).toContain('docker context use')
    expect(fix).toContain('bind mounts')
  })

  it('build na Builder Machine com as CAs do PC: usa exatamente os arquivos do compose (o último é o override)', () => {
    const prefix = 'DOCKER_CONTEXT=opex-local BUILDX_BUILDER=opex-local-builder'
    const files = ['docker-compose.yml', '/home/srv/.opex-local/compose/portal-go-dev-12.ca.yml']
    const cmd = previewBuildCommands(config, ctx, 4015, { prefix, files })
    expect(cmd.command).toBe(`${prefix} PORT=4015 docker compose -p portal-go-dev-12 -f docker-compose.yml -f /home/srv/.opex-local/compose/portal-go-dev-12.ca.yml up -d --build`)
    expect(cmd.logs).toBe(`${prefix} docker compose -p portal-go-dev-12 -f docker-compose.yml -f /home/srv/.opex-local/compose/portal-go-dev-12.ca.yml logs --tail 100`)
    expect(buildFixPrompt(config, ctx, 4015, { exitCode: 1, tail: '', round: 1, command: cmd.command }, { docker: { prefix, files } })).toContain('monta as CAs do PC nos containers')
  })

  it('sem builder configurado, o build usa o padrão do host', () => {
    const cmd = previewBuildCommands(config, ctx, 4015)
    expect(cmd.command).toBe('PORT=4015 docker compose -p portal-go-dev-12 up -d --build')
    expect(cmd.command).not.toContain('BUILDX_BUILDER')
  })

  it('prévia no GitHub Action: o app roda o script da tentativa no worktree', () => {
    const cmd = remotePreviewCommands(ctx, { attempt: 'a1', statePath: '/tmp/s.json' })
    expect(cmd.command).toBe("npx tsx scripts/preview-github.ts '/tmp/s.json' 'a1'")
    expect(cmd.run).toBe(`cd '/home/u/app/worktrees/go-dev-12' && ${cmd.command}`)
  })

  it('preparo Local com backup: só o dump do MongoDB, sem subir a prévia (OPE-54)', () => {
    const text = previewPreparePrompt(config, ctx, { method: 'local', backup })
    expect(text).toContain('## Backup do MongoDB')
    expect(text).toContain('mongodump')
    expect(text).toContain(backup.dir)
    expect(text).toContain('REUTILIZE-O')
    expect(text).toContain(`test -s '${backup.path}'`)
    expect(text).toContain('NÃO rode `docker compose up`')
    expect(text).toContain('{"ok": true} quando o dump existir')
    expect(text).not.toContain('Commit para a prévia')
  })

  it('preparo no GitHub Action sem backup (OPE-72): só o commit, sem dump nem push', () => {
    const text = previewPreparePrompt(config, ctx, { method: 'github', backup: null })
    expect(text).not.toContain('mongodump')
    expect(text).toContain('Commit para a prévia no GitHub Action')
    expect(text).toContain('NÃO faça push')
    expect(text).toContain('{"ok": true} quando tudo estiver commitado')
  })

  it('correção do build: traz o fim da saída e proíbe subir o build (o app roda de novo)', () => {
    const text = buildFixPrompt(config, ctx, 4015, { exitCode: 17, tail: 'npm ERR! missing script', round: 2, command: 'PORT=4015 docker compose up' })
    expect(text).toContain('FALHOU (exit 17; correção 2)')
    expect(text).toContain('npm ERR! missing script')
    expect(text).toContain('NÃO rode `docker compose up`')
    expect(text).toContain('EXCLUSIVAMENTE a porta 4015')
  })

  it('correção do build no GitHub Action: commitar a correção e não rodar o script', () => {
    const text = buildFixPrompt(config, ctx, 4015, { exitCode: 1, tail: 'Testes falharam', round: 1, command: 'npx tsx scripts/preview-github.ts' }, { method: 'github', docker: { prefix: 'DOCKER_CONTEXT=x' } })
    expect(text).toContain('(GitHub Action)')
    expect(text).toContain('COMMITE na branch da mesa')
    expect(text).toContain('NÃO rode o script da prévia')
    expect(text).not.toContain('DOCKER_CONTEXT=')
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

describe('ciFixPrompt', () => {
  const failures = [{ id: 'check:31', name: 'test', url: 'https://github.com/org/app/actions/runs/900/job/901', runId: 900, jobId: 901, summary: '2 testes falharam' }]
  const pr = { number: 7, url: 'https://github.com/org/app/pull/7', headBranch: 'feat/x', headSha: 'abcdef1234567890', rerunAllowed: true }

  it('lê os logs, corrige o mínimo sem desativar testes, faz push e comenta no PR', () => {
    const text = ciFixPrompt({ ...config, git: { ...config.git, validateCommands: 'pnpm lint' } }, ctx, pr, failures)
    expect(text).toContain('**test** — run 900, job 901')
    expect(text).toContain('gh run view <run> --log-failed')
    expect(text).toContain('NÃO desative, pule nem apague testes')
    expect(text).toContain('pnpm lint')
    expect(text).toContain('`git push`')
    expect(text).toContain('NÃO use force-push nem rebase')
    expect(text).toContain('gh pr comment 7')
    expect(text).toContain('<!-- opex:ci-fix -->')
    expect(text).toContain('gh run rerun <run> --failed')
    expect(text).toContain('{"ok": true, "rerun": true}')
  })

  it('depois da 1ª tentativa no mesmo commit não oferece reexecução', () => {
    const text = ciFixPrompt(config, ctx, { ...pr, rerunAllowed: false }, failures)
    expect(text).not.toContain('gh run rerun <run> --failed')
    expect(text).toContain('NÃO reexecute de novo')
  })
})
