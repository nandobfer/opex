import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Builds da prévia (aba "Build (N)"): um registro por build da etapa "Subindo a prévia", com a saída do
 * `docker compose … up -d --build` que o app roda no host, ao vivo pelo stream NDJSON e gravado em
 * `agentic_builds`.
 */

const mocks = vi.hoisted(() => ({ model: null as unknown as import('../../helpers/memory-model').MemoryModel }))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.model = memoryModel()
  return { AgenticBuild: mocks.model }
})

import { appendBuildOutput, beginBuildSection, dropBuilds, listBuilds, openBuildLogStream, restartBuildSection, resumeBuild, setBuildRun, settleBuild, startBuild } from '@/features/agentic/server/build-logs'
import type { BuildLogLine } from '@/features/agentic/build-log'

const UP = 'PORT=4015 docker compose -p app-mt-1 up -d --build'

async function readAll(response: Response): Promise<BuildLogLine[]> {
  const text = await response.text()
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as BuildLogLine)
}

const stored = (workbenchId: string) => mocks.model.docs.filter((doc) => doc.workbenchId === workbenchId) as Record<string, unknown>[]

let n = 0
let wb = ''
beforeEach(() => {
  wb = `w${++n}`
})

describe('build-logs', () => {
  it('numera os builds da mesa e grava a saída do comando sob o cabeçalho', async () => {
    await startBuild(wb, { port: 4015, local: false })
    beginBuildSection(wb, UP)
    appendBuildOutput(wb, '#1 [internal] load build definition\n')
    appendBuildOutput(wb, '#2 DONE 0.1s\n')
    await settleBuild(wb, 'succeeded')

    const [doc] = stored(wb)
    expect(doc).toMatchObject({ number: 1, status: 'succeeded', port: 4015, commands: [UP] })
    expect(doc!.log).toContain(`$ ${UP}`)
    expect(doc!.log).toMatch(/\$ .*\n#1 \[internal\] load build definition\n#2 DONE 0\.1s\n$/)

    await startBuild(wb, { port: 4015, local: true })
    const list = await listBuilds(wb)
    expect(list.map((build) => [build.number, build.status, build.local])).toEqual([
      [1, 'succeeded', false],
      [2, 'running', true],
    ])
  })

  it('cada execução do comando no mesmo build (depois de uma correção) vira uma seção', async () => {
    await startBuild(wb, { port: 4016, local: false })
    beginBuildSection(wb, UP)
    appendBuildOutput(wb, 'falha 1\n')
    beginBuildSection(wb, UP)
    appendBuildOutput(wb, 'ok 2\n')
    await settleBuild(wb, 'failed', 'O build falhou')
    const [doc] = stored(wb)
    expect(doc!.commands).toEqual([UP, UP])
    expect((doc!.log as string).split(`$ ${UP}`)).toHaveLength(3)
    expect(doc).toMatchObject({ status: 'failed', message: 'O build falhou' })
  })

  it('stream do build em andamento: snapshot, trechos ao vivo e status final', async () => {
    const id = await startBuild(wb, { port: 4017, local: false })
    beginBuildSection(wb, UP)
    appendBuildOutput(wb, 'parte 1\n')
    const response = await openBuildLogStream(wb, id, new AbortController().signal)
    appendBuildOutput(wb, 'parte 2\n')
    await settleBuild(wb, 'succeeded')
    const lines = await readAll(response)
    expect(lines[0]).toMatchObject({ type: 'snapshot', status: 'running', offset: 0 })
    const snapshot = lines[0] as Extract<BuildLogLine, { type: 'snapshot' }>
    expect(snapshot.text).toContain('parte 1\n')
    expect(lines[1]).toEqual({ type: 'append', offset: snapshot.text.length, text: 'parte 2\n' })
    expect(lines.at(-1)).toEqual({ type: 'status', status: 'succeeded', message: null })
  })

  it('build encerrado: só o snapshot gravado; build inexistente é 404', async () => {
    const id = await startBuild(wb, { port: 4018, local: false })
    beginBuildSection(wb, UP)
    appendBuildOutput(wb, 'saida')
    await settleBuild(wb, 'unhealthy', 'sem resposta')
    const lines = await readAll(await openBuildLogStream(wb, id, new AbortController().signal))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ type: 'snapshot', status: 'unhealthy', message: 'sem resposta' })
    await expect(openBuildLogStream(wb, 'ffffffffffffffffffffffff', new AbortController().signal)).rejects.toMatchObject({ status: 404 })
  })

  it('retomada depois de reiniciar o app: volta ao começo da execução atual e manda um snapshot novo', async () => {
    await mocks.model.create({ workbenchId: wb, number: 1, status: 'running', startedAt: new Date(), log: 'cabeçalho\nparte lida', droppedChars: 0, sectionStart: 'cabeçalho\n'.length, commands: [UP] })
    expect((await listBuilds(wb))[0]!.status).toBe('interrupted')
    await resumeBuild(wb)
    expect((await listBuilds(wb))[0]!.status).toBe('running')
    const id = String(stored(wb)[0]!._id)
    const response = await openBuildLogStream(wb, id, new AbortController().signal)
    restartBuildSection(wb)
    appendBuildOutput(wb, 'parte lida e o resto\n')
    await settleBuild(wb, 'succeeded')
    expect(stored(wb)[0]!.log).toBe('cabeçalho\nparte lida e o resto\n')
    const lines = await readAll(response)
    expect(lines[1]).toEqual({ type: 'snapshot', offset: 0, text: 'cabeçalho\n', status: 'running', message: null, runUrl: null })
  })

  describe('link do run do GitHub Actions (OPE-221)', () => {
    const RUN = 'https://github.com/org/app/actions/runs/42'

    it('o run registrado vira o runUrl da lista, do snapshot e da linha run; URLs no texto do log não contam', async () => {
      const id = await startBuild(wb, { port: null, local: false, method: 'github' })
      beginBuildSection(wb, 'npx tsx scripts/preview-github.ts')
      const response = await openBuildLogStream(wb, id, new AbortController().signal)
      appendBuildOutput(wb, `Prévia GitHub: ${RUN}\n`)
      setBuildRun(wb, { repo: 'org/app', runId: 42 })
      setBuildRun(wb, { repo: 'org/app', runId: 42 })
      appendBuildOutput(wb, 'details_url: https://github.com/org/app/actions/runs/9\n')
      expect((await listBuilds(wb))[0]!.runUrl).toBe(RUN)
      await settleBuild(wb, 'succeeded')
      const lines = await readAll(response)
      expect(lines.filter((line) => line.type === 'run')).toEqual([{ type: 'run', url: RUN }])
      expect(stored(wb)[0]!.githubRun).toEqual({ repo: 'org/app', runId: 42 })
      expect((await listBuilds(wb))[0]!.runUrl).toBe(RUN)
      const [snapshot] = await readAll(await openBuildLogStream(wb, id, new AbortController().signal))
      expect(snapshot).toMatchObject({ type: 'snapshot', runUrl: RUN })
    })

    it('nova execução (correção) limpa o link até o novo run; a retomada mantém o run gravado', async () => {
      const id = await startBuild(wb, { port: null, local: false, method: 'github' })
      beginBuildSection(wb, 'script')
      setBuildRun(wb, { repo: 'org/app', runId: 42 })
      const response = await openBuildLogStream(wb, id, new AbortController().signal)
      beginBuildSection(wb, 'script')
      expect((await listBuilds(wb))[0]!.runUrl).toBeNull()
      setBuildRun(wb, { repo: 'org/app', runId: 43 })
      await settleBuild(wb, 'failed', 'falhou')
      const runs = (await readAll(response)).filter((line) => line.type === 'run')
      expect(runs).toEqual([{ type: 'run', url: null }, { type: 'run', url: 'https://github.com/org/app/actions/runs/43' }])

      const other = `${wb}-r`
      await mocks.model.create({ workbenchId: other, number: 1, status: 'running', method: 'github', startedAt: new Date(), log: 'x', droppedChars: 0, sectionStart: 1, commands: ['script'], githubRun: { repo: 'org/app', runId: 7 } })
      await resumeBuild(other)
      restartBuildSection(other)
      expect((await listBuilds(other))[0]!.runUrl).toBe('https://github.com/org/app/actions/runs/7')
      await settleBuild(other, 'succeeded')
    })

    it('build local ou run inválido: sem link', async () => {
      await startBuild(wb, { port: 4015, local: false, method: 'local' })
      beginBuildSection(wb, UP)
      setBuildRun(wb, { repo: 'org/app', runId: 42 })
      expect((await listBuilds(wb))[0]!.runUrl).toBeNull()
      await settleBuild(wb, 'succeeded')
      const gh = `${wb}-g`
      await startBuild(gh, { port: null, local: false, method: 'github' })
      setBuildRun(gh, { repo: 'org app', runId: 42 })
      setBuildRun(gh, { repo: 'org/app', runId: 0 })
      expect((await listBuilds(gh))[0]!.runUrl).toBeNull()
      await settleBuild(gh, 'succeeded')
    })
  })

  it('saída fora de um build ativo é ignorada e a exclusão apaga os builds', async () => {
    appendBuildOutput(wb, 'perdida')
    expect(stored(wb)).toHaveLength(0)
    await startBuild(wb, { port: 4019, local: false })
    await dropBuilds(wb)
    expect(stored(wb)).toHaveLength(0)
    expect(await listBuilds(wb)).toEqual([])
  })
})
