import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Execução no host do OpenCode: shell descartado no meio vira erro claro; leituras repetem uma vez. */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  output: vi.fn(async () => ({ data: { output: 'ok\n', cursor: 3 } })),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => ({ shell: { create: mocks.create, get: mocks.get, output: mocks.output, remove: mocks.remove } }),
}))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ request: vi.fn(), response: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}))

import { HostShellLostError, isShellNotFound, runOnHost } from '@/features/local-docker/server/shell'

const notFound = () => Object.assign(new Error('Shell command not found: sh_1'), { status: 404 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ data: { id: 'sh_1', status: 'running' } })
  mocks.get.mockResolvedValue({ data: { id: 'sh_1', status: 'exited', exit: 0 } })
})

describe('shell do host', () => {
  it('reconhece o 404 do OpenCode', () => {
    expect(isShellNotFound(notFound())).toBe(true)
    expect(isShellNotFound(new Error('timeout'))).toBe(false)
  })

  it('regressão: shell descartado no meio do comando → HostShellLostError (sem repetir)', async () => {
    mocks.get.mockRejectedValueOnce(notFound())
    await expect(runOnHost('docker push', 30_000)).rejects.toBeInstanceOf(HostShellLostError)
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('retryOnLost: leitura repete uma vez quando o shell some', async () => {
    mocks.get.mockRejectedValueOnce(notFound())
    expect(await runOnHost('docker ps', 30_000, { retryOnLost: true })).toEqual({ exitCode: 0, output: 'ok' })
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('detached: o comando vai para o executor desacoplado (início, consultas e limpeza em shells curtos)', async () => {
    const commands: string[] = []
    mocks.create.mockImplementation(async ({ command }: { command: string }) => {
      commands.push(command)
      return { data: { id: `sh_${commands.length}`, status: 'exited', exit: 0 } }
    })
    mocks.output.mockImplementation(async () => {
      const last = commands.at(-1)!
      if (last.includes('base64 -d >')) return { data: { output: 'started', cursor: 7 } }
      if (last.startsWith('d=')) return { data: { output: `exit=0\nsize=5\n---\n${Buffer.from('feito').toString('base64')}`, cursor: 1 } }
      return { data: { output: '', cursor: 0 } }
    })
    expect(await runOnHost('docker compose build', 60_000, { detached: true })).toEqual({ exitCode: 0, output: 'feito' })
    expect(commands[0]).toContain('setsid nohup')
    expect(commands.at(-1)).toMatch(/^rm -rf "\$HOME\/\.cache\/opex\/jobs\/job-/)
  })

  it('detached com jobId: o job usa o id fixo (outro processo reencontra o mesmo comando no host)', async () => {
    const commands: string[] = []
    mocks.create.mockImplementation(async ({ command }: { command: string }) => {
      commands.push(command)
      return { data: { id: `sh_${commands.length}`, status: 'exited', exit: 0 } }
    })
    mocks.output.mockImplementation(async () => {
      const last = commands.at(-1)!
      if (last.includes('base64 -d >')) return { data: { output: 'started', cursor: 7 } }
      if (last.startsWith('d=')) return { data: { output: 'exit=0\nsize=0\n---\n', cursor: 1 } }
      return { data: { output: '', cursor: 0 } }
    })
    await runOnHost('docker compose up -d', 60_000, { detached: true, jobId: 'envdeploy-abc-3' })
    expect(commands[0]).toContain('/jobs/envdeploy-abc-3"')
    // Início idempotente: com o pid já gravado (job iniciado pelo processo anterior) só responde started.
    expect(commands[0]).toContain('if [ -s "$HOME/.cache/opex/jobs/envdeploy-abc-3"/pid ]; then echo started')
    expect(commands.at(-1)).toBe('rm -rf "$HOME/.cache/opex/jobs/envdeploy-abc-3"')
  })
})
