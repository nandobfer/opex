import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Backup do MongoDB da prévia (OPE-54): caminhos fora do worktree, reserva preservada entre
 * retentativas e conferência do arquivo na máquina do OpenCode.
 */

const mocks = vi.hoisted(() => ({
  runShell: vi.fn(),
}))

vi.mock('@/lib/ai/opencode-client', () => ({ runOpencodeShell: mocks.runShell }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})

import type { OpencodeClient } from '@/lib/ai/opencode-client'
import { AgenticWorkbench, type IPreviewBackup } from '@/lib/db/models/Agentic'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import {
  PREVIEW_BACKUP_FILE,
  backupExistsCommand,
  backupRemovedCommand,
  previewBackupDir,
  previewBackupFile,
  previewBackupRoot,
  shellQuote,
} from '@/features/agentic/preview-backup'
import { assertPreviewBackup, assertPreviewBackupRemoved, reservePreviewBackup } from '@/features/agentic/server/preview-backup'

const model = AgenticWorkbench as unknown as {
  docs: Record<string, unknown>[]
  create: (doc: Record<string, unknown>) => Promise<{ _id: string }>
}

const config = defaultCentralConfig('/home/u/app')
const client = {} as OpencodeClient
const backup: IPreviewBackup = { dir: '/home/u/app/worktrees/.opex-backups/OPE-54/tok', path: '/home/u/app/worktrees/.opex-backups/OPE-54/tok/opex-preview-backup.archive', createdAt: new Date('2026-10-12T10:00:00Z') }

const shellOk = { exitCode: 0, status: 'exited', output: '' }
const shellFail = { exitCode: 1, status: 'exited', output: '' }

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
})

describe('caminhos e comandos do backup', () => {
  it('a raiz fica ao lado dos worktrees (fora do worktree)', () => {
    expect(previewBackupRoot(config)).toBe('/home/u/app/worktrees/.opex-backups')
    expect(previewBackupRoot({ ...config, worktreeRoot: '/wt' })).toBe('/wt/.opex-backups')
    expect(previewBackupRoot({ ...config, worktreeRoot: '' })).toBe('/home/u/app/worktrees/.opex-backups')
  })

  it('a pasta do ciclo usa o código sanitizado e o arquivo tem nome fixo', () => {
    const dir = previewBackupDir(config, 'GO DEV/12', 'tok-1')
    expect(dir).toBe('/home/u/app/worktrees/.opex-backups/GO-DEV-12/tok-1')
    expect(previewBackupFile(dir)).toBe(`${dir}/${PREVIEW_BACKUP_FILE}`)
  })

  it('os comandos de verificação citam o caminho e são idempotentes', () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'")
    expect(backupExistsCommand(backup.path)).toBe(`test -s '${backup.path}'`)
    expect(backupRemovedCommand(backup.path)).toBe(`test ! -e '${backup.path}'`)
  })
})

describe('reserva do backup', () => {
  it('cria uma pasta exclusiva quando a mesa não tem backup', async () => {
    const wb = await model.create({ taskCode: 'OPE-54', previewBackup: null })

    const reserved = await reservePreviewBackup({ _id: wb._id, taskCode: 'OPE-54', previewBackup: null }, config)

    expect(reserved.dir).toContain('/.opex-backups/OPE-54/')
    expect(reserved.path).toBe(`${reserved.dir}/${PREVIEW_BACKUP_FILE}`)
    expect(model.docs[0]!.previewBackup).toEqual(reserved)
  })

  it('preserva o primeiro dump nas retentativas (não sobrescreve)', async () => {
    const wb = await model.create({ taskCode: 'OPE-54', previewBackup: backup })

    const reserved = await reservePreviewBackup({ _id: wb._id, taskCode: 'OPE-54', previewBackup: backup }, config)

    expect(reserved).toBe(backup)
    expect(model.docs[0]!.previewBackup).toEqual(backup)
  })

  it('cada ciclo novo recebe uma pasta diferente', async () => {
    const first = await reservePreviewBackup({ _id: 'x', taskCode: 'OPE-54', previewBackup: null }, config)
    const second = await reservePreviewBackup({ _id: 'y', taskCode: 'OPE-54', previewBackup: null }, config)
    expect(first.dir).not.toBe(second.dir)
  })
})

describe('conferência do arquivo na máquina do OpenCode', () => {
  it('confirma o dump existente e não vazio', async () => {
    mocks.runShell.mockResolvedValue(shellOk)

    await expect(assertPreviewBackup(client, backup, '/home/u/app')).resolves.toBeUndefined()
    expect(mocks.runShell).toHaveBeenCalledWith(client, '/home/u/app', `test -s '${backup.path}'`, { timeoutMs: 15000 })
  })

  it('falha quando o dump não foi criado', async () => {
    mocks.runShell.mockResolvedValue(shellFail)

    await expect(assertPreviewBackup(client, backup, '/home/u/app')).rejects.toThrow('não foi criado')
  })

  it('confirma a remoção e falha enquanto o arquivo existir', async () => {
    mocks.runShell.mockResolvedValue(shellOk)
    await expect(assertPreviewBackupRemoved(client, backup, '/home/u/app')).resolves.toBeUndefined()
    expect(mocks.runShell).toHaveBeenCalledWith(client, '/home/u/app', `test ! -e '${backup.path}'`, { timeoutMs: 15000 })

    mocks.runShell.mockResolvedValue(shellFail)
    await expect(assertPreviewBackupRemoved(client, backup, '/home/u/app')).rejects.toThrow('ainda existe')
  })
})
