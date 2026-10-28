/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { framerMotionMock } from '../../helpers/framer-motion'
import { DEFAULT_LOCAL_DOCKER_SETTINGS, type LocalDockerSettings } from '@/features/local-docker/schemas'
import type { LocalDockerContainerDto, LocalDockerSettingsDto, LocalDockerStatusDto } from '@/features/local-docker/types'

const mocks = vi.hoisted(() => ({
  tunnel: vi.fn(),
  override: vi.fn(),
  machine: vi.fn(),
  key: vi.fn(),
  mode: 'inherit' as string,
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('@/features/local-docker/hooks/useLocalDocker', () => ({
  useLocalDockerTunnel: () => ({ mutate: mocks.tunnel, isPending: false }),
  useLocalDockerMachine: () => ({ mutate: mocks.machine, isPending: false }),
  useLocalDockerKey: () => ({ mutate: mocks.key, isPending: false }),
  useLocalDockerOverride: () => ({ isLoading: false, isError: false, data: { centralId: 'c1', mode: mocks.mode } }),
  useSetLocalDockerOverride: () => ({ mutate: mocks.override }),
  useLocalDockerRealtime: () => {},
}))
vi.mock('@/features/integrations/components/detail/GeneralCard', () => ({ GeneralCard: () => <div>Geral</div> }))

import { TunnelStatusCard } from '@/features/local-docker/components/tunnel/TunnelStatusCard'
import { SetupChecklist, setupChecklist } from '@/features/local-docker/components/tunnel/SetupChecklist'
import { ContainerRow, deleteDescription } from '@/features/local-docker/components/tunnel/ContainerRow'
import { CONNECTION_MODES, ConnectionTab } from '@/features/local-docker/components/connection/ConnectionTab'
import { KeyCard, importKeyError } from '@/features/local-docker/components/setup/KeyCard'
import { LocalDockerCentralCard } from '@/features/local-docker/components/LocalDockerCentralCard'
import { ActivationCard } from '@/features/local-docker/components/ActivationCard'
import { LockedTabs } from '@/features/local-docker/components/LockedTabs'

const status = (overrides: Partial<LocalDockerStatusDto> = {}): LocalDockerStatusDto => ({
  reachable: true,
  tunnelOpen: true,
  wantOpen: true,
  machine: { version: '29.5.1', name: 'sipcurnot354', cpus: 12, memoryBytes: 8 * 1024 ** 3 },
  routesToLocal: true,
  previews: [],
  error: null,
  checkedAt: new Date().toISOString(),
  ...overrides,
})

const saved = (overrides: Partial<LocalDockerSettingsDto> = {}): LocalDockerSettingsDto => ({
  settings: { ...DEFAULT_LOCAL_DOCKER_SETTINGS, pcUser: 'alfredopetri', serverAddress: '192.168.0.64' },
  isDefault: false,
  key: { configured: true, source: 'generated', fingerprint: 'SHA256:abc (ED25519)' },
  lastPrepare: { ok: true, trigger: 'manual', steps: [], at: new Date().toISOString() },
  updatedAt: null,
  ...overrides,
})

const container = (overrides: Partial<LocalDockerContainerDto> = {}): LocalDockerContainerDto => ({
  name: 'gosipal-GO-DEV-717',
  kind: 'preview',
  state: 'running',
  status: 'Up 5m',
  image: 'sipal/painel',
  ports: '',
  stats: { cpuPercent: 12.5, memoryUsage: '512MiB / 7.7GiB', memoryPercent: 6.5 },
  composeProject: 'go-sipal-go-dev-717',
  service: 'app',
  workbenchId: 'w1',
  taskCode: 'GO-DEV-717',
  port: 5003,
  alias: null,
  target: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mode = 'inherit'
})
afterEach(cleanup)

describe('aba Túnel: situação', () => {
  it('mostra o PC, o destino das novas prévias e fecha direto sem prévias no PC', () => {
    render(<TunnelStatusCard status={status()} fetching={false} onRefresh={vi.fn()} openBlockedReason={null} />)
    expect(screen.getByText('Túnel aberto')).toBeTruthy()
    expect(screen.getByText('Novas prévias: no PC')).toBeTruthy()
    expect(screen.getByText(/sipcurnot354: Docker 29\.5\.1, 12 CPUs, 8\.0 GiB/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Fechar túnel/ }))
    expect(mocks.tunnel).toHaveBeenCalledWith({ action: 'close' })
  })

  it('com prévias no ar no PC, fechar pede confirmação antes', async () => {
    render(<TunnelStatusCard status={status({ previews: [{ workbenchId: 'w1', composeProject: 'portal-go-dev-1', port: 4001, pendingTeardown: false }] })} fetching={false} onRefresh={vi.fn()} openBlockedReason={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Fechar túnel/ }))
    expect(mocks.tunnel).not.toHaveBeenCalled()
    expect(await screen.findByText('Fechar o túnel com prévias no PC?')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar túnel' }).at(-1)!)
    expect(mocks.tunnel).toHaveBeenCalledWith({ action: 'close', confirm: true })
  })

  it('túnel fechado: abrir fica bloqueado com o motivo', () => {
    render(<TunnelStatusCard status={status({ tunnelOpen: false, wantOpen: false, machine: null, routesToLocal: false })} fetching={false} onRefresh={vi.fn()} openBlockedReason="Salve a configuração antes de abrir o túnel." />)
    expect(screen.getByText('Novas prévias: no servidor')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Abrir túnel/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Salve a configuração antes de abrir o túnel.')).toBeTruthy()
  })
})

describe('aba Túnel: passos pendentes', () => {
  it('lista na ordem e marca o que já foi feito', () => {
    const items = setupChecklist(saved({ key: { configured: false, source: null, fingerprint: null }, lastPrepare: null }), status({ reachable: false, tunnelOpen: false }), false)
    expect(items.map((item) => [item.id, item.done])).toEqual([
      ['config', true],
      ['key', false],
      ['reachable', false],
      ['tunnel', false],
      ['prepared', false],
    ])
  })

  it('atalhos: chave leva ao Preparo; com a chave, testar e abrir o túnel', () => {
    const goTo = vi.fn()
    const { unmount } = render(<SetupChecklist saved={saved({ key: { configured: false, source: null, fingerprint: null } })} status={status({ reachable: false, tunnelOpen: false })} unsaved={false} goTo={goTo} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Preparo/ }))
    expect(goTo).toHaveBeenCalledWith('preparo')
    unmount()
    render(<SetupChecklist saved={saved({ lastPrepare: null })} status={status({ tunnelOpen: false })} unsaved={false} goTo={goTo} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir túnel/ }))
    expect(mocks.tunnel).toHaveBeenCalledWith({ action: 'open' })
    // Preparar só depois do túnel aberto.
    expect(screen.getByRole('button', { name: /Preparar o PC/ }).hasAttribute('disabled')).toBe(true)
  })

  it('tudo feito: avisa que está pronta', () => {
    render(<SetupChecklist saved={saved()} status={status()} unsaved={false} goTo={vi.fn()} />)
    expect(screen.getByText('Builder Machine pronta')).toBeTruthy()
  })
})

describe('aba Túnel: containers', () => {
  it('mostra CPU e memória; levantar bloqueado quando já roda; derrubar chama a ação', () => {
    const onAction = vi.fn()
    render(<ul><ContainerRow item={container()} busyAction={null} onAction={onAction} /></ul>)
    expect(screen.getByText('CPU 12.5%')).toBeTruthy()
    expect(screen.getByText('RAM 512MiB / 7.7GiB (6.5%)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Levantar gosipal-GO-DEV-717' }))
    expect(onAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Derrubar gosipal-GO-DEV-717' }))
    expect(onAction).toHaveBeenCalledWith('stop')
  })

  it('apagar com o ambiente pede confirmação explicando o que sai', async () => {
    const onAction = vi.fn()
    render(<ul><ContainerRow item={container()} busyAction={null} onAction={onAction} /></ul>)
    fireEvent.click(screen.getByRole('button', { name: 'Apagar gosipal-GO-DEV-717 e o ambiente' }))
    expect(onAction).not.toHaveBeenCalled()
    expect(await screen.findByText(/containers, volumes, rede e imagens/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(onAction).toHaveBeenCalledWith('delete', true)
    expect(deleteDescription(container({ kind: 'builder' }))).toContain('cache de build')
  })
})

function ConnectionHarness({ mode }: { mode: LocalDockerSettings['mode'] }) {
  const form = useForm<LocalDockerSettings>({ defaultValues: { ...DEFAULT_LOCAL_DOCKER_SETTINGS, mode } })
  return <ConnectionTab form={form} general={<div>Geral</div>} />
}

describe('aba Conexão com o PC', () => {
  it('cada modo tem uma dica de quando usar', () => {
    expect(CONNECTION_MODES.map((mode) => mode.value)).toEqual(['reverse', 'direct'])
    expect(String(CONNECTION_MODES[0]!.tooltip)).toContain('NÃO alcança o IP do PC')
    expect(String(CONNECTION_MODES[1]!.tooltip)).toContain('alcança o IP do PC na rede')
  })

  it('túnel de controle mostra só os campos dele; direto, só os do IP', () => {
    const { unmount } = render(<ConnectionHarness mode="reverse" />)
    expect(screen.getByLabelText('Como o PC acessa o servidor')).toBeTruthy()
    expect(screen.getByLabelText('Porta do túnel de controle (no servidor)')).toBeTruthy()
    expect(screen.queryByLabelText('IP do PC')).toBeNull()
    unmount()
    render(<ConnectionHarness mode="direct" />)
    expect(screen.getByLabelText('IP do PC')).toBeTruthy()
    expect(screen.getByLabelText('Porta SSH do PC')).toBeTruthy()
    expect(screen.queryByLabelText('Como o PC acessa o servidor')).toBeNull()
  })
})

describe('aba Preparo do PC: chave', () => {
  it('com chave configurada mostra só a impressão digital; gerar nova pede confirmação', async () => {
    render(<KeyCard keyInfo={{ configured: true, source: 'imported', fingerprint: 'SHA256:abc (ED25519)' }} />)
    expect(screen.getByText('SHA256:abc (ED25519)')).toBeTruthy()
    expect(screen.queryByText(/ssh-ed25519/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar uma chave nova (substitui a atual)' }))
    expect(mocks.key).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar nova' }))
    expect(mocks.key).toHaveBeenCalledWith({ action: 'generate' }, expect.anything())
  })

  it('inserir valida a chave colada com o schema da API', () => {
    expect(importKeyError('ssh-ed25519 AAAA')).toContain('Cole a chave privada completa')
    expect(importKeyError('-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----')).toBeNull()
  })
})

describe('card da central', () => {
  it('troca a máquina da central na hora', () => {
    render(<LocalDockerCentralCard centralId="c1" />)
    expect(screen.getByText('Builder Machine')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Nunca' }))
    expect(mocks.override).toHaveBeenCalledWith('off')
  })
})

describe('ativação da integração', () => {
  const draft = (active: boolean) => ({ environment: 'interno', debugMode: false, publicValues: { active }, secrets: {}, swaggerUrl: '' }) as never

  it('o interruptor grava "active" no rascunho da integração', () => {
    const setDraft = vi.fn()
    render(<ActivationCard draft={draft(false)} setDraft={setDraft} savedActive={false} />)
    fireEvent.click(screen.getByRole('switch'))
    const update = setDraft.mock.calls[0]![0] as (prev: { publicValues: Record<string, unknown> }) => { publicValues: Record<string, unknown> }
    expect(update({ publicValues: { active: false } }).publicValues.active).toBe(true)
    expect(screen.queryByText(/os containers continuam lá/)).toBeNull()
  })

  it('desativar uma integração ativa avisa que as prévias do PC ficam lá', () => {
    render(<ActivationCard draft={draft(false)} setDraft={vi.fn()} savedActive />)
    expect(screen.getByText(/os containers continuam lá/)).toBeTruthy()
  })

  it('desativada: abas bloqueadas pedindo a ativação', () => {
    render(<LockedTabs tabs={[{ id: 'tunel', label: 'Túnel do Docker do PC', icon: () => null }]} />)
    expect(screen.getByRole('tab', { name: 'Túnel do Docker do PC' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/Ative a integração e salve/)).toBeTruthy()
  })
})
