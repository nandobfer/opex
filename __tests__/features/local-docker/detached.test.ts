import { describe, expect, it, vi } from 'vitest'
import { detachedCancelCommand, detachedPollCommand, detachedStartCommand, parseDetachedPoll } from '@/features/local-docker/detached-commands'
import { runDetached } from '@/features/local-docker/server/detached'
import { HostShellLostError, type HostRunner } from '@/features/local-docker/server/shell'

/**
 * Executor desacoplado do Builder Machine: o comando longo roda em segundo plano no host e o app
 * acompanha por consultas curtas — o OpenCode descartar um shell no meio não derruba o comando.
 */

const b64 = (text: string | Buffer) => Buffer.from(text).toString('base64')
const pollOutput = (exit: number | null, size: number, chunk: string | Buffer) => `exit=${exit ?? ''}\nsize=${size}\n---\n${b64(chunk)}`

/** Host falso: guarda a saída do job e responde às consultas pelo deslocamento pedido. */
function fakeHost(options: { output: Buffer; exitAfterPolls: number; exitCode?: number; lostPolls?: number[] }) {
  let polls = 0
  const calls: string[] = []
  const run: HostRunner = vi.fn(async (command: string) => {
    calls.push(command)
    if (command.includes('base64 -d >')) return { exitCode: 0, output: 'started' }
    if (command.startsWith('d=')) {
      polls += 1
      if (options.lostPolls?.includes(polls)) throw new HostShellLostError(`sh_${polls}`)
      const offset = Number(/tail -c \+(\d+)/.exec(command)![1]) - 1
      const done = polls >= options.exitAfterPolls
      const visible = done ? options.output : options.output.subarray(0, Math.min(options.output.length, polls * 4))
      return { exitCode: 0, output: pollOutput(done ? (options.exitCode ?? 0) : null, visible.length, visible.subarray(offset, offset + 5)) }
    }
    return { exitCode: 0, output: '' }
  })
  return { run, calls }
}

describe('comandos do job', () => {
  it('início idempotente com setsid/timeout e o comando em base64; consulta pelo deslocamento; cancelamento do grupo', () => {
    const start = detachedStartCommand('env-1', 'docker compose up -d', 90)
    expect(start).toContain('mkdir -p "$HOME/.cache/opex/jobs/env-1"')
    expect(start).toContain('if [ -s "$HOME/.cache/opex/jobs/env-1"/pid ]; then echo started;')
    expect(start).toContain(`printf %s '${b64('docker compose up -d')}' | base64 -d`)
    expect(start).toContain('setsid nohup sh -c \'timeout 90 bash "$0/cmd.sh"')
    expect(detachedPollCommand('env-1', 10)).toContain('tail -c +11 "$d/out"')
    const cancel = detachedCancelCommand('env-1')
    expect(cancel).toContain('kill -TERM -- -"$p"')
    // O `timeout` sai do grupo do `sh` (setpgid): o grupo dele também recebe o TERM.
    expect(cancel).toContain('for c in $(pgrep -P "$p" 2>/dev/null); do kill -TERM -- -"$c"')
    // Regressão: com o `sh` morto ninguém gravaria o `exit` — o cancelamento fecha o job.
    expect(cancel).toContain('[ -f "$HOME/.cache/opex/jobs/env-1"/exit ] || { echo 143 >')
    expect(() => detachedStartCommand('x; rm -rf /', 'true', 1)).toThrow('Id de job inválido')
  })

  it('parser: código, tamanho, pedaço em base64 e job sumido', () => {
    expect(parseDetachedPoll(pollOutput(null, 3, 'abc'))).toMatchObject({ missing: false, exitCode: null, size: 3 })
    expect(parseDetachedPoll(pollOutput(2, 3, 'abc')).chunk.toString()).toBe('abc')
    expect(parseDetachedPoll(pollOutput(2, 3, 'abc')).exitCode).toBe(2)
    expect(parseDetachedPoll('missing=1\n').missing).toBe(true)
  })
})

describe('runDetached', () => {
  it('acompanha até o fim: saída inteira (UTF-8 dividido entre pedaços) e o código de saída', async () => {
    const output = Buffer.from('Construindo ação…\nImagem pronta ✓\n')
    const host = fakeHost({ output, exitAfterPolls: 3, exitCode: 0 })
    const chunks: string[] = []
    const result = await runDetached(host.run, 'docker build .', { id: 'job-1', timeoutMs: 60_000, pollMs: 1, onOutput: (chunk) => chunks.push(chunk) })
    expect(result).toEqual({ exitCode: 0, output: 'Construindo ação…\nImagem pronta ✓' })
    expect(chunks.join('')).toBe(output.toString())
    expect(host.calls.at(-1)).toBe('rm -rf "$HOME/.cache/opex/jobs/job-1"')
  })

  it('regressão: o OpenCode descarta o shell da consulta ("Shell command not found") e o comando segue', async () => {
    const host = fakeHost({ output: Buffer.from('push ok\n'), exitAfterPolls: 4, exitCode: 0, lostPolls: [1, 2] })
    const result = await runDetached(host.run, 'docker push', { id: 'job-2', timeoutMs: 60_000, pollMs: 1 })
    expect(result).toEqual({ exitCode: 0, output: 'push ok' })
  })

  it('código de erro do comando volta como está', async () => {
    const host = fakeHost({ output: Buffer.from('falhou\n'), exitAfterPolls: 1, exitCode: 2 })
    expect(await runDetached(host.run, 'false', { id: 'job-3', timeoutMs: 60_000, pollMs: 1 })).toEqual({ exitCode: 2, output: 'falhou' })
  })

  it('regressão: abort cancela e termina assim que o cancelamento fecha o job (sem esperar o prazo)', async () => {
    const controller = new AbortController()
    let cancelled = false
    const run: HostRunner = vi.fn(async (command: string) => {
      if (command.includes('base64 -d >')) return { exitCode: 0, output: 'started' }
      if (command.includes('kill -TERM')) {
        cancelled = true
        return { exitCode: 0, output: '' }
      }
      // O comando nunca termina sozinho: só o cancelamento grava o `exit`.
      if (command.startsWith('d=')) return { exitCode: 0, output: pollOutput(cancelled ? 143 : null, 0, '') }
      return { exitCode: 0, output: '' }
    })
    const job = runDetached(run, 'sleep 600', { id: 'job-4', timeoutMs: 600_000, pollMs: 1, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    const started = Date.now()
    expect((await job).exitCode).toBe(143)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('cancelamento sem o `exit` (comando de cancelar falhou): desiste depois da folga, sem esperar o prazo', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      controller.abort()
      const run: HostRunner = vi.fn(async (command: string) => (command.includes('base64 -d >') ? { exitCode: 0, output: 'started' } : command.startsWith('d=') ? { exitCode: 0, output: pollOutput(null, 0, '') } : { exitCode: 0, output: '' }))
      const job = runDetached(run, 'sleep 600', { id: 'job-7', timeoutMs: 600_000, pollMs: 1_000, signal: controller.signal })
      await vi.advanceTimersByTimeAsync(20_000)
      expect((await job).exitCode).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pasta do job sumiu (host reiniciado): falha sem código', async () => {
    const run: HostRunner = vi.fn(async (command: string) => (command.includes('base64 -d >') ? { exitCode: 0, output: 'started' } : command.startsWith('d=') ? { exitCode: 0, output: 'missing=1\n' } : { exitCode: 0, output: '' }))
    const result = await runDetached(run, 'true', { id: 'job-5', timeoutMs: 60_000, pollMs: 1 })
    expect(result.exitCode).toBeNull()
    expect(result.output).toContain('O comando sumiu do host')
  })

  it('não iniciou: devolve a falha do início sem consultar', async () => {
    const run: HostRunner = vi.fn(async () => ({ exitCode: 1, output: 'mkdir: permissão negada' }))
    expect(await runDetached(run, 'true', { id: 'job-6', timeoutMs: 60_000, pollMs: 1 })).toEqual({ exitCode: 1, output: 'mkdir: permissão negada' })
  })
})
