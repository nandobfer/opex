import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Prazo da prévia remota (OPE-212): o script `scripts/preview-github.ts` desiste pelo `timeoutMinutes` do
 * estado da reserva. O workflow remoto roda testes completos e o build (~20 min), então o estado nunca pode
 * levar um prazo menor que o mínimo da prévia remota, mesmo com `buildTimeoutMinutes` configurado abaixo dele.
 */

const mocks = vi.hoisted(() => ({
  runOpencodeShell: vi.fn(async (_client: unknown, _directory: string, _command: string, _options: unknown) => ({ exitCode: 0 })),
  updateOne: vi.fn(async () => ({})),
}))

vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client', () => ({ runOpencodeShell: mocks.runOpencodeShell }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { updateOne: mocks.updateOne } }))

import { remoteBuildTimeoutMinutes, REMOTE_BUILD_MIN_MINUTES } from '@/features/agentic/remote-build-timeout'
import { reserveRemotePreview } from '@/features/agentic/server/remote-preview'

const config = (buildTimeoutMinutes: number) =>
  ({
    sessionDirectory: '/srv/central',
    environment: {
      githubWorkflow: 'preview.yml',
      previewService: 'app',
      composeFile: '',
      portEnvVar: 'PORT',
      previewHost: 'localhost',
      healthPath: '/',
      backupDatabase: true,
      buildTimeoutMinutes,
    },
  }) as never

/** Prazo gravado no estado: o comando de escrita leva o JSON do estado (com as aspas do `sh -c` escapadas). */
function writtenTimeout(): number {
  const command = String(mocks.runOpencodeShell.mock.calls[0]![2])
  const minutes = /timeoutMinutes\W+(\d+)/.exec(command)?.[1]
  if (!minutes) throw new Error('prazo não encontrado no comando de escrita')
  return Number(minutes)
}

beforeEach(() => {
  mocks.runOpencodeShell.mockClear()
  mocks.updateOne.mockClear()
})

describe('prazo da prévia remota', () => {
  it('nunca fica abaixo do mínimo do workflow', () => {
    expect(REMOTE_BUILD_MIN_MINUTES).toBe(25)
    expect(remoteBuildTimeoutMinutes(20)).toBe(25)
    expect(remoteBuildTimeoutMinutes(2)).toBe(25)
  })

  it('um prazo configurado acima do mínimo é mantido', () => {
    expect(remoteBuildTimeoutMinutes(40)).toBe(40)
  })

  it('a reserva grava no estado o prazo mínimo, não o configurado de 20 min (regressão da prévia)', async () => {
    await reserveRemotePreview({} as never, { _id: 'wb1' } as never, config(20), 'agenciaboz-dev/opex', 7001, { min: 7001, max: 7010 }, { dir: '/srv/backup', path: '/srv/backup/db.archive' }, { branch: 'feat/x', worktreePath: '/srv/wt', composeProject: 'opex-x' })
    expect(writtenTimeout()).toBe(25)
  })

  it('a reserva mantém um prazo configurado acima do mínimo', async () => {
    await reserveRemotePreview({} as never, { _id: 'wb1' } as never, config(40), 'agenciaboz-dev/opex', 7001, { min: 7001, max: 7010 }, { dir: '/srv/backup', path: '/srv/backup/db.archive' }, { branch: 'feat/x', worktreePath: '/srv/wt', composeProject: 'opex-x' })
    expect(writtenTimeout()).toBe(40)
  })
})
