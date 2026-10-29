import { describe, expect, it, vi } from 'vitest'
import { outputTail, runPreviewBuild } from '@/features/agentic/server/preview-build'
import type { HostRunner } from '@/features/local-docker/server/shell'

/**
 * Build da prévia rodado pelo app: o comando vai desacoplado para o host (mesmo job na retomada), a
 * saída chega aos pedaços para a aba Build e o final dela volta para a correção do agente.
 */

describe('runPreviewBuild', () => {
  it('roda desacoplado com o job informado, repassa a saída ao vivo e devolve o código e o final', async () => {
    const onOutput = vi.fn()
    const run = vi.fn<HostRunner>(async (_command, _timeout, options) => {
      options?.onOutput?.('#1 building\n')
      options?.onOutput?.('ERROR: failed to solve\n')
      return { exitCode: 1, output: '#1 building\nERROR: failed to solve' }
    })
    const signal = new AbortController().signal
    const result = await runPreviewBuild({ run: 'cd /w && docker compose up -d --build', jobId: 'build-1', timeoutMs: 60_000, signal, onOutput }, run)
    expect(run).toHaveBeenCalledWith('cd /w && docker compose up -d --build', 60_000, expect.objectContaining({ detached: true, jobId: 'build-1', signal }))
    expect(onOutput.mock.calls.map(([chunk]) => chunk)).toEqual(['#1 building\n', 'ERROR: failed to solve\n'])
    expect(result).toEqual({ exitCode: 1, tail: '#1 building\nERROR: failed to solve' })
  })

  it('comando que não terminou (cancelado ou sumiu do host) devolve exitCode null', async () => {
    const run: HostRunner = async () => ({ exitCode: null, output: '' })
    expect(await runPreviewBuild({ run: 'x', jobId: 'build-2', timeoutMs: 1_000, signal: new AbortController().signal, onOutput: vi.fn() }, run)).toEqual({ exitCode: null, tail: '' })
  })
})

describe('outputTail', () => {
  it('fica com as últimas linhas, sem as cores do terminal e com as atualizações de progresso em linhas', () => {
    const output = `${Array.from({ length: 200 }, (_, i) => `linha ${i}`).join('\n')}\n\x1b[31mERRO\x1b[0m\rfim`
    const tail = outputTail(output, 3)
    expect(tail).toBe('linha 199\nERRO\nfim')
  })
})
