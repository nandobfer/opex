import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(async () => {}),
  publish: vi.fn(async () => {}),
  portInUse: vi.fn(async () => false),
  active: vi.fn(async () => true),
}))
const store = vi.hoisted(() => ({ state: null as unknown, overrides: null as unknown, previews: null as unknown }))

vi.mock('@/features/local-docker/server/models', () => {
  store.state = memoryModel()
  store.overrides = memoryModel()
  store.previews = memoryModel()
  return { LocalDockerState: store.state, LocalDockerOverride: store.overrides, LocalDockerPreview: store.previews, localDockerDb: async () => {} }
})
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: vi.fn() }))
vi.mock('@/features/local-docker/server/active', () => ({ isBuilderMachineActive: mocks.active, assertBuilderMachineActive: vi.fn() }))
vi.mock('@/features/agentic/server/ports', () => ({ isPortInUse: mocks.portInUse }))

import { DEFAULT_LOCAL_DOCKER_SETTINGS } from '@/features/local-docker/schemas'
import { closeTunnel, getLocalDockerStatus, openTunnel, teardownLocalPreview } from '@/features/local-docker/server/tunnel'
import { resolveBuildTarget, teardownForCleanup } from '@/features/local-docker/server/agentic-hooks'
import { runLocalDockerHealth, resetLocalDockerHealthThrottle } from '@/features/local-docker/server/health'
import type { HostResult } from '@/features/local-docker/server/shell'

type Model = ReturnType<typeof memoryModel>
const state = () => store.state as Model
const overrides = () => store.overrides as Model
const previews = () => store.previews as Model

/** Host falso: o túnel abre/fecha de verdade no estado e cada comando é registrado. */
function fakeHost(options: { reachable?: boolean; openFails?: boolean; pcPorts?: number[] } = {}) {
  const calls: string[] = []
  let open = false
  const run = vi.fn(async (command: string): Promise<HostResult> => {
    calls.push(command)
    const done = (output = ''): HostResult => ({ exitCode: 0, output })
    const fail = (output = 'erro'): HostResult => ({ exitCode: 255, output })
    if (command.startsWith('if ssh -S')) {
      if (options.openFails) return fail('ssh: connect to host localhost port 2222: Connection refused')
      open = true
      return done()
    }
    if (command.startsWith('ssh -S') && command.includes('-O check')) return open ? done('Master running') : fail('Control socket connect: No such file')
    if (command.startsWith('ssh -S') && command.includes('-O exit')) {
      open = false
      return done()
    }
    if (command.includes("'ss -Htln'")) return done((options.pcPorts ?? []).map((port) => `LISTEN 0 128 0.0.0.0:${port} 0.0.0.0:*`).join('\n'))
    if (command.includes(' info --format')) return open ? done('29.5.1|pc|12|8000000000') : fail()
    if (command.startsWith('ssh -i')) return options.reachable === false ? fail('Connection timed out') : done()
    return done()
  })
  return { run, calls, isOpen: () => open }
}

const configured = async (extra: Record<string, unknown> = {}) => {
  await state().create({ key: 'default', settings: { ...DEFAULT_LOCAL_DOCKER_SETTINGS, pcUser: 'alfredopetri', serverAddress: '192.168.0.64' }, publicKey: 'ssh-ed25519 AAAA', wantOpen: false, lastSeenOpen: null, ...extra })
}

beforeEach(() => {
  vi.clearAllMocks()
  state().docs.splice(0)
  overrides().docs.splice(0)
  previews().docs.splice(0)
  resetLocalDockerHealthThrottle()
})

describe('túnel da máquina local', () => {
  it('abrir exige a chave do servidor', async () => {
    await state().create({ key: 'default', settings: { ...DEFAULT_LOCAL_DOCKER_SETTINGS, pcUser: 'alfredopetri', serverAddress: '192.168.0.64' }, publicKey: null })
    await expect(openTunnel('local', fakeHost().run)).rejects.toMatchObject({ status: 409 })
  })

  it('abrir marca o túnel desejado, repassa as portas das prévias do PC e derruba as pendentes', async () => {
    await configured()
    await previews().create({ workbenchId: 'w1', centralId: 'c', composeProject: 'p1', port: 4001, pendingTeardown: false })
    await previews().create({ workbenchId: 'w2', centralId: 'c', composeProject: 'p2', port: 4002, pendingTeardown: true })
    const host = fakeHost()
    const status = await openTunnel('local', host.run)
    expect(status.tunnelOpen).toBe(true)
    expect(status.routesToLocal).toBe(true)
    expect(state().docs[0]).toMatchObject({ wantOpen: true })
    expect(host.calls.some((call) => call.includes('-O forward -L 0.0.0.0:4001:localhost:4001'))).toBe(true)
    expect(host.calls.some((call) => call.includes("label=com.docker.compose.project=p2"))).toBe(true)
    expect(previews().docs.map((doc) => doc.workbenchId)).toEqual(['w1'])
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidadeId: 'tunel', depois: { aberto: true } }))
    expect(mocks.publish).toHaveBeenCalledWith('local-docker-updated', { kind: 'status' })
  })

  it('falha ao abrir vira erro pt-BR com a última linha do ssh', async () => {
    await configured()
    await expect(openTunnel('local', fakeHost({ openFails: true }).run)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('Connection refused') })
    expect(state().docs[0]).toMatchObject({ wantOpen: false })
  })

  it('fechar com prévias no ar no PC exige confirmação', async () => {
    await configured()
    const host = fakeHost()
    await openTunnel('local', host.run)
    await previews().create({ workbenchId: 'w1', centralId: 'c', composeProject: 'p1', port: 4001, pendingTeardown: false })
    await expect(closeTunnel('local', false, host.run)).rejects.toMatchObject({ status: 409, code: 'LOCAL_DOCKER_PREVIEWS_RUNNING' })
    expect(host.isOpen()).toBe(true)
    const status = await closeTunnel('local', true, host.run)
    expect(status.tunnelOpen).toBe(false)
    expect(status.previews).toHaveLength(1)
    expect(state().docs[0]).toMatchObject({ wantOpen: false })
  })

  it('situação com o PC fora do ar explica o motivo', async () => {
    await configured()
    const status = await getLocalDockerStatus(fakeHost({ reachable: false }).run)
    expect(status).toMatchObject({ reachable: false, tunnelOpen: false, routesToLocal: false })
    expect(status.error).toContain('túnel de controle (porta 2222)')
  })

  it('derrubar prévia do PC com o túnel fechado deixa pendente; aberto, remove na hora', async () => {
    await configured()
    await previews().create({ workbenchId: 'w1', centralId: 'c', composeProject: 'p1', port: 4001, pendingTeardown: false })
    const host = fakeHost()
    expect(await teardownLocalPreview('w1', host.run)).toBe('pending')
    expect(previews().docs[0]).toMatchObject({ pendingTeardown: true })
    await openTunnel('local', host.run)
    expect(previews().docs).toHaveLength(0)
    expect(await teardownLocalPreview('w1', host.run)).toBe('none')
  })

  it('a rotina reabre o túnel que o usuário deixou aberto e caiu', async () => {
    await configured({ wantOpen: true, lastSeenOpen: true })
    const host = fakeHost()
    await runLocalDockerHealth(new Date(), host.run)
    expect(host.isOpen()).toBe(true)
  })

  it('a rotina não faz nada com a integração desativada', async () => {
    mocks.active.mockResolvedValueOnce(false)
    await configured({ wantOpen: true })
    const host = fakeHost()
    await runLocalDockerHealth(new Date(), host.run)
    expect(host.run).not.toHaveBeenCalled()
  })
})

describe('destino do build da prévia', () => {
  const input = { workbenchId: 'w1', centralId: 'c1', composeProject: 'portal-go-dev-1', hadPort: false }

  it('túnel fechado: servidor (null)', async () => {
    await configured()
    expect(await resolveBuildTarget(input, fakeHost().run)).toBeNull()
  })

  it('túnel aberto: prefixo do PC, portas ocupadas no PC puladas e a porta repassada ao anexar', async () => {
    await configured()
    const host = fakeHost({ pcPorts: [4001] })
    await openTunnel('local', host.run)
    const target = await resolveBuildTarget(input, host.run)
    expect(target?.dockerPrefix).toBe('DOCKER_CONTEXT=opex-local BUILDX_BUILDER=opex-local-builder')
    expect(await target!.portCheck('192.168.0.64', 4001)).toBe(true)
    expect(await target!.portCheck('192.168.0.64', 4002)).toBe(false)
    await target!.attach(4002)
    expect(previews().docs[0]).toMatchObject({ workbenchId: 'w1', port: 4002, composeProject: 'portal-go-dev-1', pendingTeardown: false })
    expect(host.calls.at(-1)).toContain('-O forward -L 0.0.0.0:4002:localhost:4002')
  })

  it('central com "Nunca" fica no servidor mesmo com o túnel aberto; "Sempre" vence a chave global desligada', async () => {
    await configured()
    const host = fakeHost()
    await openTunnel('local', host.run)
    await overrides().create({ centralId: 'c1', mode: 'off' })
    expect(await resolveBuildTarget(input, host.run)).toBeNull()
    overrides().docs.splice(0)
    state().docs[0]!.settings = { ...DEFAULT_LOCAL_DOCKER_SETTINGS, pcUser: 'alfredopetri', serverAddress: '192.168.0.64', useWhenOpen: false }
    expect(await resolveBuildTarget(input, host.run)).toBeNull()
    await overrides().create({ centralId: 'c1', mode: 'on' })
    expect(await resolveBuildTarget(input, host.run)).not.toBeNull()
  })

  it('trocar de máquina derruba a prévia anterior: do servidor ao ir para o PC, e do PC ao voltar ao servidor', async () => {
    await configured()
    const host = fakeHost()
    await openTunnel('local', host.run)
    await resolveBuildTarget({ ...input, hadPort: true }, host.run)
    expect(host.calls.some((call) => call.startsWith('ids=$(docker ps -aq'))).toBe(true)

    await previews().create({ workbenchId: 'w1', centralId: 'c1', composeProject: 'portal-go-dev-1', port: 4001, pendingTeardown: false })
    await overrides().create({ centralId: 'c1', mode: 'off' })
    expect(await resolveBuildTarget({ ...input, hadPort: true }, host.run)).toBeNull()
    expect(host.calls.some((call) => call.startsWith('ids=$(docker --context opex-local ps -aq'))).toBe(true)
    expect(previews().docs).toHaveLength(0)
  })

  it('prévia no GitHub Action (forceServer): fica no servidor mesmo com o túnel aberto e derruba a prévia anterior no PC', async () => {
    await configured()
    const host = fakeHost()
    await openTunnel('local', host.run)
    await previews().create({ workbenchId: 'w1', centralId: 'c1', composeProject: 'portal-go-dev-1', port: 4001, pendingTeardown: false })
    expect(await resolveBuildTarget({ ...input, hadPort: true, forceServer: true }, host.run)).toBeNull()
    expect(host.calls.some((call) => call.startsWith('ids=$(docker --context opex-local ps -aq'))).toBe(true)
    expect(previews().docs).toHaveLength(0)
  })

  it('limpeza: mesa sem prévia no PC segue com o down do agente', async () => {
    await configured()
    expect(await teardownForCleanup('w9', fakeHost().run)).toBe(false)
    await previews().create({ workbenchId: 'w9', centralId: 'c1', composeProject: 'p', port: 4001, pendingTeardown: false })
    expect(await teardownForCleanup('w9', fakeHost().run)).toBe(true)
  })
})
