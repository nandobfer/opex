import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Execução no host do OpenCode: shell descartado no meio vira erro claro; leituras repetem uma vez. */

type Page = { output: string; cursor: number; size?: number; truncated?: boolean }
type OutputInput = { id: string; cursor?: number; limit?: number }

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  output: vi.fn<(input?: OutputInput) => Promise<{ data: Page }>>(async () => ({ data: { output: 'ok\n', cursor: 3 } })),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => ({ shell: { create: mocks.create, get: mocks.get, output: mocks.output, remove: mocks.remove } }),
}))
vi.mock('@/lib/integrations/debug', () => ({
  integrationDebug: () => ({ request: vi.fn(), response: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }),
}))

import { HostShellLostError, isShellNotFound, runOnHost } from '@/features/local-docker/server/shell'

/** Saída do OpenCode paginada: cada página vai de `cursor` até `cursor + limit`, com `size` e `truncated`. */
function paged(full: string) {
  return async (input?: OutputInput): Promise<{ data: Page }> => {
    const start = input?.cursor ?? 0
    const end = Math.min(full.length, start + (input?.limit ?? 20_000))
    return { data: { output: full.slice(start, end), cursor: end, size: full.length, truncated: end < full.length } }
  }
}

const notFound = () => Object.assign(new Error('Shell command not found: sh_1'), { status: 404 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ data: { id: 'sh_1', status: 'running' } })
  mocks.get.mockResolvedValue({ data: { id: 'sh_1', status: 'exited', exit: 0 } })
  mocks.output.mockImplementation(async () => ({ data: { output: 'ok\n', cursor: 3 } }))
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

  it('regressão: saída maior que uma página volta inteira, seguindo o cursor devolvido', async () => {
    const full = `OPEX_DIGEST:${'x'.repeat(150_000)}`
    mocks.output.mockImplementation(paged(full))
    const result = await runOnHost('node digest.js', 30_000)
    expect(result.output).toBe(full)
    expect(result.truncated).toBeUndefined()
    expect(mocks.output.mock.calls.map(([input]) => input?.cursor)).toEqual([0, 64_000, 128_000])
  })

  it('resposta sem size/truncated: lê uma página só, como antes', async () => {
    expect(await runOnHost('docker ps', 30_000)).toEqual({ exitCode: 0, output: 'ok' })
    expect(mocks.output).toHaveBeenCalledTimes(1)
  })

  it('teto maxOutput: devolve o começo e marca truncated', async () => {
    mocks.output.mockImplementation(paged('a'.repeat(200_000)))
    const result = await runOnHost('cat grande', 30_000, { maxOutput: 100_000 })
    expect(result.output).toHaveLength(100_000)
    expect(result.truncated).toBe(true)
    expect(mocks.output).toHaveBeenCalledTimes(2)
  })

  it('cursor que não avança não prende a leitura em laço', async () => {
    mocks.output.mockResolvedValue({ data: { output: 'abc', cursor: 0, size: 10, truncated: true } })
    expect(await runOnHost('x', 30_000)).toEqual({ exitCode: 0, output: 'abc' })
    expect(mocks.output).toHaveBeenCalledTimes(1)
  })

  it('onOutput: o restante maior que uma página depois do fim do comando é lido inteiro', async () => {
    const full = 'y'.repeat(150_000)
    mocks.output.mockImplementation(paged(full))
    const chunks: string[] = []
    const result = await runOnHost('build', 30_000, { onOutput: (chunk) => chunks.push(chunk) })
    expect(result.output).toBe(full)
    expect(chunks.join('')).toBe(full)
  })

  it('falha ao ler uma página do meio (mesmo repetindo): a saída não volta como completa', async () => {
    const page = paged('b'.repeat(150_000))
    mocks.output.mockImplementation(async (input) => {
      if ((input?.cursor ?? 0) > 0) throw new Error('timeout')
      return page(input)
    })
    const result = await runOnHost('node digest.js', 30_000)
    expect(result).toMatchObject({ truncated: true, readError: true })
    expect(result.output).toHaveLength(64_000)
    expect(mocks.output).toHaveBeenCalledTimes(3)
  })

  it('falha passageira numa página: repete a mesma página e devolve a saída inteira', async () => {
    const full = 'c'.repeat(150_000)
    const page = paged(full)
    let failed = false
    mocks.output.mockImplementation(async (input) => {
      if (input?.cursor === 64_000 && !failed) {
        failed = true
        throw new Error('timeout')
      }
      return page(input)
    })
    const result = await runOnHost('node digest.js', 30_000)
    expect(result.output).toBe(full)
    expect(result.truncated).toBeUndefined()
  })

  it('onOutput com maxOutput: a saída acumulada ao vivo não passa do teto', async () => {
    const page = paged('d'.repeat(200_000))
    let polls = 0
    mocks.create.mockResolvedValue({ data: { id: 'sh_1', status: 'running' } })
    mocks.get.mockImplementation(async () => ({ data: { id: 'sh_1', status: ++polls < 3 ? 'running' : 'exited', exit: 0 } }))
    mocks.output.mockImplementation(page)
    const result = await runOnHost('build', 30_000, { onOutput: () => undefined, maxOutput: 100_000 })
    expect(result.output).toHaveLength(100_000)
    expect(result.truncated).toBe(true)
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
