import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Turno do OpenCode com trabalho em segundo plano (OPE-216): desde a v2.3 o subagente roda em segundo
 * plano, a execução principal termina e o OpenCode acorda a sessão numa execução nova quando ele acaba.
 * O turno só termina com a sessão quieta, e o resultado é o texto da execução final.
 */

vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/consumption', () => ({ recordAiConsumption: vi.fn(async () => {}) }))

import { BACKGROUND_POLL_MS, runAgentTurn, type TurnEvent } from '@/lib/ai/opencode-run'
import type { OpencodeClient } from '@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client'

const ev = (type: string, data: Record<string, unknown> = {}) => ({ type, data: { sessionID: 's1', ...data } })
const job = (id: string, kind: string, status = 'running') => ({ type: 'experimental.job.updated', data: { info: { id, kind, status, sessionID: 's1' } } })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

interface Job {
  id: string
  kind: string
}

/** Cliente falso: os eventos são empurrados pelo teste (`push`), e as pendências da sessão são mutáveis. */
function fakeClient(options: { withJobs?: boolean; failReads?: boolean; attach?: boolean } = {}) {
  const queue: unknown[] = []
  let wake: () => void = () => {}
  let drop: (() => void) | null = null
  let prompted: () => void = () => {}
  const promptedP = options.attach ? Promise.resolve() : new Promise<void>((resolve) => (prompted = resolve))
  const state = {
    jobs: [] as Job[],
    inbox: [] as unknown[],
    children: [] as string[],
    active: {} as Record<string, unknown>,
    messages: [] as unknown[],
    info: null as unknown,
    // Host travado: leituras e cancelamentos nunca respondem (e ignoram o sinal da requisição).
    hang: false,
  }
  const never = new Promise<never>(() => {})
  const read = <T,>(value: () => T): Promise<T> => (state.hang ? never : options.failReads ? Promise.reject(new Error('fora do ar')) : Promise.resolve(value()))
  const cancel = vi.fn(async ({ id }: { id: string }) => {
    if (state.hang) return never
    state.jobs = state.jobs.filter((item) => item.id !== id)
  })
  const client = {
    session: {
      switchAgent: vi.fn().mockResolvedValue(undefined),
      switchModel: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(async () => prompted()),
      interrupt: vi.fn(async () => (state.hang ? never : {})),
      get: vi.fn(async () => state.info),
      active: vi.fn(() => read(() => state.active)),
      list: vi.fn(() => read(() => ({ data: state.children.map((id) => ({ id })) }))),
      inbox: { list: vi.fn(() => read(() => state.inbox)) },
      form: { list: vi.fn(async () => []) },
    },
    permission: { list: vi.fn(async () => []) },
    ...(options.withJobs === false ? {} : { experimental: { job: { list: vi.fn(() => read(() => state.jobs.map((item) => ({ ...item, status: 'running' })))), cancel } } }),
    message: { list: vi.fn(async () => ({ data: [...state.messages].reverse() })) },
    event: {
      subscribe: (opts: { signal: AbortSignal; onActivity?: () => void }) =>
        (async function* () {
          opts.onActivity?.()
          yield { type: 'server.connected', data: {} }
          await promptedP
          let dropped = false
          while (!opts.signal.aborted) {
            while (queue.length) yield queue.shift()
            await new Promise<void>((resolve) => {
              wake = resolve
              drop = () => {
                dropped = true
                resolve()
              }
              opts.signal.addEventListener('abort', () => resolve(), { once: true })
            })
            if (dropped) throw new Error('SSE caiu')
          }
        })(),
    },
  }
  const push = async (...events: unknown[]) => {
    queue.push(...events)
    wake()
    for (let i = 0; i < 20; i++) await tick()
  }
  return { client: client as unknown as OpencodeClient, state, push, cancel, raw: client, dropSse: () => drop?.() }
}

const assistant = (text: string, created: number) => ({ id: `a${created}`, type: 'assistant', time: { created }, content: [{ type: 'text', text }] })
const synthetic = (created: number) => ({ id: `y${created}`, type: 'synthetic', time: { created }, text: 'resultado do subagente' })

const base = (signal = new AbortController().signal, timeoutMs = 60_000, extra: { attach?: boolean; startedAt?: number } = {}) => ({ id: 'r1', sessionId: 's1', stage: 'Planejando', title: 'Planejando', agent: { agent: 'plan', model: null, variant: null }, text: 'Planeje', timeoutMs, signal, ...extra })

function start(fake: ReturnType<typeof fakeClient>, request = base(), extra: { onSegment?: () => void } = {}) {
  const published: TurnEvent[] = []
  const pieces: string[] = []
  let done = false
  const promise = runAgentTurn(fake.client, request, { publish: (event) => published.push(event), onText: (delta) => void pieces.push(delta), ...extra }).then((result) => {
    done = true
    return result
  })
  return { promise, published, pieces, isDone: () => done }
}

const ANNOUNCE = 'Disparei duas explorações em paralelo. Fecho o plano assim que os resultados chegarem.'

afterEach(() => {
  vi.useRealTimers()
})

describe('turno com trabalho em segundo plano', () => {
  it('não termina com subagentes rodando: espera a execução seguinte e devolve o texto final', async () => {
    const fake = fakeClient()
    const onSegment = vi.fn()
    const turn = start(fake, base(), { onSegment })
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }, { id: 'j2', kind: 'subagent' }]
    await fake.push(ev('session.text.delta', { delta: ANNOUNCE }), ev('session.execution.succeeded'))

    expect(turn.isDone()).toBe(false)
    expect(turn.published.filter((event) => event.type === 'background')).toEqual([{ type: 'background', subagents: 2, shells: 0, other: 0 }])

    // Um subagente termina: a contagem acompanha.
    fake.state.jobs = [{ id: 'j2', kind: 'subagent' }]
    await fake.push(job('j1', 'subagent', 'completed'))
    expect(turn.published.at(-1)).toEqual({ type: 'background', subagents: 1, shells: 0, other: 0 })

    // O segundo termina e o OpenCode acorda a sessão com os resultados.
    fake.state.jobs = []
    await fake.push(job('j2', 'subagent', 'completed'), ev('session.execution.started'))
    expect(onSegment).toHaveBeenCalledTimes(1)
    expect(turn.published.at(-1)).toEqual({ type: 'background', subagents: 0, shells: 0, other: 0 })
    await fake.push(ev('session.text.delta', { delta: '# Plano\n\n1. Fazer' }), ev('session.execution.succeeded'))

    const result = await turn.promise
    expect(result.outcome).toBe('succeeded')
    expect(result.text).toBe('# Plano\n\n1. Fazer')
    // A saída publicada mostra os dois (anúncio e plano).
    expect(turn.published.flatMap((event) => (event.type === 'text' ? [event.text] : [])).join('')).toContain(ANNOUNCE)
  })

  it('sem trabalho pendente termina no primeiro fim de execução, como antes', async () => {
    const fake = fakeClient()
    const turn = start(fake)
    await fake.push(ev('session.text.delta', { delta: '# Plano' }), ev('session.execution.succeeded'))
    const result = await turn.promise
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano' })
    expect(turn.published.some((event) => event.type === 'background')).toBe(false)
  })

  it('mensagem pendente na caixa de entrada conta como trabalho pendente', async () => {
    const fake = fakeClient()
    const turn = start(fake)
    await fake.push()
    fake.state.inbox = [{ id: 'i1' }]
    await fake.push(ev('session.text.delta', { delta: ANNOUNCE }), ev('session.execution.succeeded'))
    expect(turn.isDone()).toBe(false)
    fake.state.inbox = []
    await fake.push(ev('session.execution.started'), ev('session.text.delta', { delta: 'Final' }), ev('session.execution.succeeded'))
    expect((await turn.promise).text).toBe('Final')
  })

  it('comando de terminal em segundo plano conta como pendente', async () => {
    const fake = fakeClient()
    const turn = start(fake)
    await fake.push()
    fake.state.jobs = [{ id: 'sh1', kind: 'shell' }]
    await fake.push(ev('session.execution.succeeded'))
    expect(turn.isDone()).toBe(false)
    expect(turn.published.at(-1)).toEqual({ type: 'background', subagents: 0, shells: 1, other: 0 })
    fake.state.jobs = []
    await fake.push(ev('session.execution.started'), ev('session.text.delta', { delta: 'ok' }), ev('session.execution.succeeded'))
    expect((await turn.promise).outcome).toBe('succeeded')
  })

  it('Parar durante a espera cancela os jobs e termina interrompido', async () => {
    const fake = fakeClient()
    const controller = new AbortController()
    const turn = start(fake, base(controller.signal))
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }, { id: 'sh1', kind: 'shell' }]
    await fake.push(ev('session.execution.succeeded'))
    controller.abort(new Error('Interrompido pelo usuário'))
    const result = await turn.promise
    expect(result).toMatchObject({ outcome: 'interrupted', message: 'Interrompido pelo usuário' })
    expect(fake.cancel.mock.calls.map(([input]) => input.id).sort()).toEqual(['j1', 'sh1'])
  })

  it('o tempo limite continua valendo durante a espera', async () => {
    const fake = fakeClient()
    const turn = start(fake, base(new AbortController().signal, 300))
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }]
    await fake.push(ev('session.execution.succeeded'))
    const result = await turn.promise
    expect(result.outcome).toBe('interrupted')
    expect(result.message).toContain('Tempo limite')
    expect(fake.cancel).toHaveBeenCalledWith({ id: 'j1' }, expect.anything())
  })

  it('job termina sem a sessão acordar: as leituras seguidas sem pendência fecham o turno, sem devolver o anúncio', async () => {
    // Só o intervalo das releituras é falso (o restante do turno segue com o relógio real).
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const fake = fakeClient()
    const turn = start(fake)
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }]
    await fake.push(ev('session.text.delta', { delta: 'Resumo' }), ev('session.execution.succeeded'))
    expect(turn.isDone()).toBe(false)
    fake.state.jobs = []
    await vi.advanceTimersByTimeAsync(BACKGROUND_POLL_MS * 3)
    vi.useRealTimers()
    const result = await turn.promise
    // O texto anterior à espera é o anúncio: sem execução final, o resultado fica vazio (o planejamento falha).
    expect(result).toMatchObject({ outcome: 'succeeded', text: '' })
  })

  it('F2: dois subagentes que terminam juntos (eventos job seguidos) não fecham a espera antes de a sessão acordar', async () => {
    const fake = fakeClient()
    const turn = start(fake)
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }, { id: 'j2', kind: 'subagent' }]
    await fake.push(ev('session.text.delta', { delta: ANNOUNCE }), ev('session.execution.succeeded'))
    fake.state.jobs = []
    await fake.push(job('j1', 'subagent', 'completed'), job('j2', 'subagent', 'completed'))
    await fake.push(job('j1', 'subagent', 'completed'))
    expect(turn.isDone()).toBe(false)
    await fake.push(ev('session.execution.started'), ev('session.text.delta', { delta: '# Plano' }), ev('session.execution.succeeded'))
    expect(await turn.promise).toMatchObject({ outcome: 'succeeded', text: '# Plano' })
  })

  it('F1: com o host travado na espera, Parar encerra o turno na hora (leituras e cancelamentos sem resposta)', async () => {
    const fake = fakeClient()
    const controller = new AbortController()
    const turn = start(fake, base(controller.signal))
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }]
    await fake.push(ev('session.execution.succeeded'))
    fake.state.hang = true
    const started = Date.now()
    controller.abort(new Error('Interrompido pelo usuário'))
    const result = await turn.promise
    expect(result).toMatchObject({ outcome: 'interrupted', message: 'Interrompido pelo usuário' })
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('fim de execução com a própria sessão ativa de novo (acordou antes da leitura) aguarda a execução seguinte', async () => {
    const fake = fakeClient()
    const turn = start(fake)
    await fake.push()
    fake.state.active = { s1: { type: 'running' } }
    await fake.push(ev('session.text.delta', { delta: ANNOUNCE }), ev('session.execution.succeeded'))
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(turn.isDone()).toBe(false)
    // Só a sessão rodando não tem contagem a exibir.
    expect(turn.published.some((event) => event.type === 'background')).toBe(false)
    fake.state.active = {}
    await fake.push(ev('session.execution.started'), ev('session.text.delta', { delta: '# Plano' }), ev('session.execution.succeeded'))
    expect((await turn.promise).text).toBe('# Plano')
  })

  it('SSE cai na espera e a sessão acorda e termina no buraco: o texto final vem do histórico depois da entrega', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const fake = fakeClient()
    const turn = start(fake, base(new AbortController().signal, 60_000, { startedAt: 1 }))
    await fake.push()
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }]
    await fake.push(ev('session.text.delta', { delta: ANNOUNCE }), ev('session.execution.succeeded'))
    // No buraco: o subagente acaba, a entrega acorda a sessão e o plano é escrito.
    fake.state.jobs = []
    fake.state.messages = [assistant(ANNOUNCE, 10), synthetic(20), assistant('# Plano final', 30)]
    fake.state.info = { id: 's1', outcome: 'succeeded', time: { idle: 40 } }
    fake.dropSse()
    await new Promise((resolve) => setTimeout(resolve, 2_200))
    expect(turn.isDone()).toBe(false)
    await vi.advanceTimersByTimeAsync(BACKGROUND_POLL_MS * 3)
    vi.useRealTimers()
    const result = await turn.promise
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano final' })
  }, 10_000)

  it('reconexão com a execução já terminada: o texto recuperado é só o da execução final (depois da entrega)', async () => {
    const fake = fakeClient({ attach: true })
    fake.state.info = { id: 's1', outcome: 'succeeded', time: { idle: 40 } }
    fake.state.messages = [assistant(ANNOUNCE, 10), synthetic(20), assistant('# Plano final', 30)]
    const result = await runAgentTurn(fake.client, base(new AbortController().signal, 60_000, { attach: true, startedAt: 1 }))
    expect(result).toMatchObject({ outcome: 'succeeded', text: '# Plano final' })
  })

  it('reconexão com a sessão parada aguardando subagentes: o acompanhamento começa na espera', async () => {
    const fake = fakeClient({ attach: true })
    fake.state.info = { id: 's1', outcome: 'succeeded', time: { idle: 40 } }
    fake.state.jobs = [{ id: 'j1', kind: 'subagent' }]
    const turn = start(fake, base(new AbortController().signal, 60_000, { attach: true, startedAt: 1 }))
    await fake.push()
    expect(turn.isDone()).toBe(false)
    expect(turn.published).toContainEqual({ type: 'background', subagents: 1, shells: 0, other: 0 })
    fake.state.jobs = []
    await fake.push(ev('session.execution.started'), ev('session.text.delta', { delta: '# Plano' }), ev('session.execution.succeeded'))
    expect(await turn.promise).toMatchObject({ outcome: 'succeeded', text: '# Plano' })
  })

  it('sem a API de jobs (host antigo), conta os subagentes filhos em execução', async () => {
    const fake = fakeClient({ withJobs: false })
    const turn = start(fake)
    await fake.push()
    fake.state.children = ['c1', 'c2']
    fake.state.active = { c1: { type: 'running' } }
    await fake.push(ev('session.execution.succeeded'))
    expect(turn.published.at(-1)).toEqual({ type: 'background', subagents: 1, shells: 0, other: 0 })
    fake.state.active = {}
    await fake.push(ev('session.execution.started'), ev('session.text.delta', { delta: 'Final' }), ev('session.execution.succeeded'))
    expect((await turn.promise).text).toBe('Final')
  })

  it('sem conseguir ler as pendências, termina como antes (com aviso)', async () => {
    const fake = fakeClient({ failReads: true })
    const turn = start(fake)
    await fake.push(ev('session.text.delta', { delta: 'Texto' }), ev('session.execution.succeeded'))
    const result = await turn.promise
    expect(result).toMatchObject({ outcome: 'succeeded', text: 'Texto' })
    expect(turn.published.some((event) => event.type === 'notice' && event.level === 'warn')).toBe(true)
  })
})
