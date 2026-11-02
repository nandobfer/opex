import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `invalidateRemotePreview`: apaga o estado da tentativa só quando ela é a que falhou. Uma falha
 * atrasada de uma tentativa antiga não pode apagar a reserva nova; sem tentativa conhecida (o turno
 * falhou antes de ler a reserva), invalida a atual como antes do filtro.
 */

const mocks = vi.hoisted(() => ({ shell: vi.fn(async () => ({ exitCode: 0, status: 'completed', output: '' })) }))

vi.mock('@/lib/ai/opencode-client', () => ({ runOpencodeShell: mocks.shell }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: { updateOne: vi.fn() } }))

import { invalidateRemotePreview } from '@/features/agentic/server/remote-preview'
import type { IAgenticWorkbench } from '@/lib/db/models/Agentic'

const STATE = '/backups/OPE-1/x/remote-preview-a2.json'
const doc = { _id: 'w1', previewBuild: { method: 'github', attempt: 'a2', statePath: STATE, dumpRequired: false } } as unknown as IAgenticWorkbench
const client = {} as never
const removed = () => mocks.shell.mock.calls.some((call) => String((call as unknown[])[2]).includes(`rm -f '${STATE}'`))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('invalidateRemotePreview', () => {
  it('tentativa que falhou é a reservada: apaga o estado', async () => {
    await invalidateRemotePreview(client, doc, '/repo', { attempt: 'a2' })
    expect(removed()).toBe(true)
  })

  it('falha atrasada de uma tentativa antiga: não toca na reserva nova', async () => {
    await invalidateRemotePreview(client, doc, '/repo', { attempt: 'a1' })
    expect(mocks.shell).not.toHaveBeenCalled()
  })

  it('sem filtro ou com a tentativa desconhecida (o turno falhou antes de ler a reserva): invalida a atual', async () => {
    await invalidateRemotePreview(client, doc, '/repo')
    expect(removed()).toBe(true)
    mocks.shell.mockClear()
    await invalidateRemotePreview(client, doc, '/repo', { attempt: null })
    expect(removed()).toBe(true)
  })

  it('falha do comando no host: avisa que a publicação não foi cancelada', async () => {
    mocks.shell.mockResolvedValueOnce({ exitCode: 1, status: 'completed', output: 'erro' })
    await expect(invalidateRemotePreview(client, doc, '/repo', { attempt: 'a2' })).rejects.toThrow('publicação não cancelada')
  })
})
