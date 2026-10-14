import { describe, expect, it } from 'vitest'

import { cleanupTargets, cleanupVerificationCommands, deletionContext, hasCleanupWork, type CleanupTargets } from '@/features/agentic/server/environment-cleanup'
import { defaultCentralConfig, type CentralConfig } from '@/features/agentic/schemas'
import type { WorkbenchContext } from '@/features/agentic/prompts'

/**
 * Limpeza de ambiente compartilhada pela conclusão e pela exclusão (OPE-68): decide o que remover a
 * partir do que a mesa REALMENTE criou e monta a conferência (a exclusão não confia só no JSON do
 * agente).
 */

const config = (cleanup: CentralConfig['cleanup']): CentralConfig => ({ ...defaultCentralConfig('/home/u/app'), cleanup })

const backup = { dir: '/home/u/app/worktrees/.opex-backups/OPE-68/tok', path: '/home/u/app/worktrees/.opex-backups/OPE-68/tok/opex-preview-backup.archive', createdAt: new Date() }

const ctx: WorkbenchContext = {
  code: 'OPE-68',
  title: 'Excluir mesa',
  projectName: 'App',
  repo: 'org/app',
  sessionDirectory: '/home/u/app',
  worktreePath: '/home/u/app/worktrees/ope-68',
  branch: 'feat/ope-68',
  composeProject: 'app-ope-68',
}

const all = { teardownEnvironment: true, removeWorktree: true, deleteBranch: true }
const none = { teardownEnvironment: false, removeWorktree: false, deleteBranch: false }

describe('cleanupTargets', () => {
  it('só mira worktree e branch REGISTRADOS na mesa (planejamento não apaga caminho inferido)', () => {
    const targets = cleanupTargets(config(all), { previewBackup: null, previewBuild: null, previewUrl: null, port: null, worktreePath: null, branch: null })
    expect(targets.worktreePath).toBeNull()
    expect(targets.branch).toBeNull()
    expect(targets.teardownEnvironment).toBe(false)
    expect(hasCleanupWork(targets)).toBe(false)
  })

  it('derruba os containers quando a mesa chegou a preparar um build (mesmo sem previewUrl)', () => {
    const targets = cleanupTargets(config(all), { previewBackup: null, previewBuild: { method: 'local' }, previewUrl: null, port: null, worktreePath: '/w', branch: 'b' })
    expect(targets.teardownEnvironment).toBe(true)
  })

  it('respeita as opções da central: limpeza desligada não mira recursos', () => {
    const targets = cleanupTargets(config(none), { previewBackup: null, previewBuild: { method: 'local' }, previewUrl: 'http://x', port: 4015, worktreePath: '/w', branch: 'b' })
    expect(targets).toEqual({ backup: null, teardownEnvironment: false, worktreePath: null, branch: null })
    expect(hasCleanupWork(targets)).toBe(false)
  })

  it('o backup entra sempre, mesmo com toda a limpeza de ambiente desligada', () => {
    const targets = cleanupTargets(config(none), { previewBackup: backup, previewBuild: null, previewUrl: null, port: null, worktreePath: null, branch: null })
    expect(targets.backup).toBe(backup)
    expect(hasCleanupWork(targets)).toBe(true)
  })
})

describe('cleanupVerificationCommands', () => {
  it('confere backup, worktree, branch local e containers do projeto', () => {
    const commands = cleanupVerificationCommands({ backup, teardownEnvironment: true, worktreePath: '/w', branch: 'feat/x' }, 'app-ope-68')
    expect(commands).toHaveLength(4)
    expect(commands[0]).toContain("test ! -e '/home/u/app/worktrees/.opex-backups/OPE-68/tok/opex-preview-backup.archive'")
    expect(commands[1]).toBe("test ! -e '/w'")
    expect(commands[2]).toContain('show-ref --verify --quiet')
    expect(commands[2]).toContain('refs/heads/feat/x')
    expect(commands[3]).toContain('docker ps -q --filter')
    expect(commands[3]).toContain('com.docker.compose.project=app-ope-68')
  })

  it('sem alvos não gera nenhum comando', () => {
    expect(cleanupVerificationCommands({ backup: null, teardownEnvironment: false, worktreePath: null, branch: null }, 'app')).toEqual([])
  })
})

describe('deletionContext', () => {
  it('zera worktree e branch não registrados (o passo é omitido no prompt)', () => {
    const targets: CleanupTargets = { backup: null, teardownEnvironment: false, worktreePath: null, branch: null }
    expect(deletionContext(ctx, targets)).toMatchObject({ worktreePath: '', branch: '', composeProject: 'app-ope-68' })
  })

  it('preserva os recursos registrados', () => {
    const targets: CleanupTargets = { backup: null, teardownEnvironment: true, worktreePath: '/w', branch: 'feat/x' }
    expect(deletionContext(ctx, targets)).toMatchObject({ worktreePath: '/w', branch: 'feat/x' })
  })
})
