import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkbenchEvent, WorkbenchStreamLine } from '@/features/agentic/types'

/**
 * OPE-188: o stream da saída manda `reset`, escreve o histórico conforme o cursor lê, fecha com `ready` e
 * só então repassa o ao vivo. A mesa só tem a existência conferida (o DTO completo vem do `by-task`).
 */

type Listener = (event: WorkbenchEvent) => void

const mocks = vi.hoisted(() => ({
  listeners: [] as ((event: unknown) => void)[],
  history: [] as unknown[],
  stopped: { value: false },
  gate: { release: () => {}, wait: Promise.resolve() as Promise<void> },
  waitGate: false,
  exists: vi.fn(async () => undefined),
  getWorkbench: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/agentic/server/hub', () => ({
  flushWorkbenchEvents: vi.fn(async () => undefined),
  subscribeWorkbench: (_id: string, listener: Listener) => {
    mocks.listeners.push(listener as (event: unknown) => void)
    return () => {
      mocks.listeners = mocks.listeners.filter((item) => item !== listener)
    }
  },
  streamWorkbenchEvents: async function* (_id: string, isOpen: () => boolean) {
    for (const [index, event] of mocks.history.entries()) {
      if (!isOpen()) {
        mocks.stopped.value = true
        return
      }
      if (index === 1 && mocks.waitGate) await mocks.gate.wait
      yield event
    }
  },
}))
vi.mock('@/features/agentic/server/workflow', () => ({ assertWorkbenchExists: mocks.exists, getWorkbench: mocks.getWorkbench }))

import { DomainError } from '@/lib/api/route'
import { openWorkbenchStream } from '@/features/agentic/server/stream'

const ts = '2026-11-26T12:00:00.000Z'
const notice = (seq: number): WorkbenchEvent => ({ type: 'notice', level: 'info', message: `n${seq}`, seq, ts })
const emit = (event: WorkbenchEvent) => mocks.listeners.forEach((listener) => listener(event))

async function readLines(response: Response, count: number): Promise<WorkbenchStreamLine[]> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const lines: WorkbenchStreamLine[] = []
  let buffer = ''
  while (lines.length < count) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) if (part.trim()) lines.push(JSON.parse(part) as WorkbenchStreamLine)
  }
  reader.releaseLock()
  return lines
}

beforeEach(() => {
  mocks.listeners = []
  mocks.history = []
  mocks.stopped.value = false
  mocks.waitGate = false
  mocks.gate.wait = new Promise<void>((resolve) => (mocks.gate.release = resolve))
  vi.clearAllMocks()
})

describe('openWorkbenchStream', () => {
  it('reset → histórico → ao vivo da espera → ready → ao vivo, sem seq repetido', async () => {
    mocks.history = [notice(1), notice(2)]
    mocks.waitGate = true
    const controller = new AbortController()
    const response = await openWorkbenchStream('w1', controller.signal)
    // Enquanto o histórico é lido, um evento ao vivo chega (repetido e novo): fica na espera.
    await vi.waitFor(() => expect(mocks.listeners).toHaveLength(1))
    emit(notice(2))
    emit(notice(3))
    mocks.gate.release()
    const lines = await readLines(response, 5)
    expect(lines.map((line) => (line.type === 'notice' ? line.seq : line.type))).toEqual(['reset', 1, 2, 3, 'ready'])
    emit(notice(4))
    emit(notice(3))
    const live = await readLines(response, 1)
    expect(live).toMatchObject([{ type: 'notice', seq: 4 }])
    controller.abort()
  })

  it('o reset sai antes de o histórico terminar (primeiro conteúdo sem esperar a mesa inteira)', async () => {
    mocks.history = [notice(1), notice(2)]
    mocks.waitGate = true
    const controller = new AbortController()
    const response = await openWorkbenchStream('w1', controller.signal)
    const first = await readLines(response, 2)
    expect(first.map((line) => line.type)).toEqual(['reset', 'notice'])
    mocks.gate.release()
    controller.abort()
  })

  it('abortar no meio do histórico para a leitura e não escreve o ready', async () => {
    mocks.history = [notice(1), notice(2), notice(3)]
    mocks.waitGate = true
    const controller = new AbortController()
    const response = await openWorkbenchStream('w1', controller.signal)
    await readLines(response, 2)
    controller.abort()
    mocks.gate.release()
    await vi.waitFor(() => expect(mocks.stopped.value).toBe(true))
    expect(mocks.listeners).toHaveLength(0)
  })

  it('confere só a existência da mesa (sem montar o DTO) e devolve o 404', async () => {
    await openWorkbenchStream('w1', new AbortController().signal)
    expect(mocks.exists).toHaveBeenCalledWith('w1')
    expect(mocks.getWorkbench).not.toHaveBeenCalled()
    mocks.exists.mockRejectedValueOnce(new DomainError(404, 'Mesa de trabalho não encontrada', 'WORKBENCH_NOT_FOUND'))
    await expect(openWorkbenchStream('nada', new AbortController().signal)).rejects.toMatchObject({ status: 404 })
  })
})
