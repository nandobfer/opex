/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { ComposeServicesDto, EnvironmentDto, EnvironmentEnvValuesDto, EnvironmentsListDto } from '@/features/environments/types'
import { EMPTY_SERVICE_VALUES } from '@/features/environments/service-overrides'

/** Página Novo/Editar ambiente (OPE-211): seções, variáveis, leitura do compose, serviços, salvar e sair. */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refetch: vi.fn(),
  read: vi.fn(),
  action: vi.fn(),
  push: vi.fn(),
  envValuesOpen: [] as boolean[],
  values: { data: undefined as EnvironmentEnvValuesDto | undefined, isError: false, isFetching: false },
  readState: { isPending: false, isError: false },
  list: { isLoading: false, isError: false, data: undefined as EnvironmentsListDto | undefined, error: null, refetch: vi.fn() },
  toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/ambientes/e1/editar', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [{ id: 'c1', projectName: 'Loja', repo: 'nandobfer/loja' }, { id: 'c2', projectName: 'CRM', repo: 'nandobfer/crm' }], isLoading: false }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useEnvironments: () => mocks.list,
  useEnvironmentsRealtime: () => undefined,
  useSaveEnvironment: () => ({ mutate: mocks.save, isPending: false }),
  useEnvironmentEnvValues: (_id: string | null, open: boolean) => {
    mocks.envValuesOpen.push(open)
    return { ...mocks.values, refetch: mocks.refetch }
  },
  useReadComposeServices: () => ({ mutate: mocks.read, ...mocks.readState }),
  useEnvironmentAction: () => ({ mutate: mocks.action, isPending: false }),
}))
vi.mock('@/features/environments/hooks/useEnvironmentCompose', () => ({
  useEnvironmentCompose: () => ({ isLoading: false, isError: false, data: undefined, refetch: vi.fn() }),
  useComposeRevision: () => ({ isLoading: false, isError: false, data: undefined }),
  useSaveCompose: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreCompose: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { EnvironmentEditorForm } from '@/features/environments/components/editor/EnvironmentEditorForm'
import { EnvironmentEditorPage } from '@/features/environments/components/editor/EnvironmentEditorPage'

const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
  id: 'e1',
  name: 'Loja',
  slug: 'loja',
  source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
  envKeys: ['TOKEN'],
  ports: [4100],
  healthUrl: null,
  buildOn: 'server',
  runOn: 'server',
  limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
  limitsConfigured: true,
  deployedLimits: null,
  composeOverrides: null,
  deployedComposeOverrides: null,
  deployedOn: { buildOn: 'server', runOn: 'server' },
  deployedVersion: null,
  deployedComposeVersion: null,
  lastDeploy: null,
  services: [],
  createdAt: '2026-11-27T10:00:00.000Z',
  updatedAt: '2026-11-27T10:00:00.000Z',
  ...overrides,
})

const COMPOSE: ComposeServicesDto = {
  services: [
    { name: 'app', hasBuild: true, declared: { memoryGb: null, swapGb: null, cpus: null }, limitStyle: { memory: 'deploy', cpus: 'deploy' }, values: { ...EMPTY_SERVICE_VALUES, command: ['npm', 'start'], restart: 'unless-stopped', environment: [{ key: 'TOKEN', value: 'do-compose' }] }, unreadable: { ports: ['8080:${ALVO}'], volumes: [] } },
    { name: 'db', hasBuild: false, declared: { memoryGb: 1, swapGb: null, cpus: null }, limitStyle: { memory: 'service', cpus: 'service' }, values: { ...EMPTY_SERVICE_VALUES, image: 'mongo:7' }, unreadable: { ports: [], volumes: [] } },
  ],
}

const HOSTS = { server: { cpus: 8, memoryGb: 31 }, pc: null }
const open = (value: EnvironmentDto | null = env()) => render(<EnvironmentEditorForm env={value} pcAvailable pcReason={null} hosts={HOSTS} />)
const respond = () => mocks.read.mockImplementation((_input: unknown, options: { onSuccess: (result: ComposeServicesDto) => void }) => options.onSuccess(COMPOSE))
const saveButton = () => screen.getAllByRole('button', { name: 'Salvar' })[0]!
const valueInput = (index: number) => screen.getByLabelText(`Valor da variável ${index}`) as HTMLInputElement
const savedInput = () => mocks.save.mock.calls.at(-1)![0]
const servicesSection = () => document.getElementById('ambiente-servicos')!
const panel = () => within(screen.getByLabelText(/^Serviço (app|db)$/))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.envValuesOpen = []
  mocks.readState = { isPending: false, isError: false }
  mocks.values = { data: { items: [{ key: 'TOKEN', value: 'segredo' }] }, isError: false, isFetching: false }
  window.history.replaceState(null, '', '/ambientes/e1/editar')
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe('página e seções', () => {
  it('Editar abre com o salvo, o índice das seções e as variáveis lidas à parte (skeleton e depois os valores)', async () => {
    mocks.values = { data: undefined, isError: false, isFetching: true }
    const view = open()
    expect(screen.getByRole('heading', { name: 'Editar Loja' })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Seções do ambiente' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['Identificação', 'Origem', 'Execução', 'Variáveis extras', 'Recursos', 'Serviços do compose'])
    expect(screen.getByLabelText('Carregando as variáveis')).toBeTruthy()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    expect(mocks.envValuesOpen.every(Boolean)).toBe(true)
    mocks.values = { data: { items: [{ key: 'TOKEN', value: 'segredo' }] }, isError: false, isFetching: false }
    view.rerender(<EnvironmentEditorForm env={env()} pcAvailable pcReason={null} hosts={HOSTS} />)
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    expect(saveButton().hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
  })

  it('erro ao ler as variáveis: Salvar bloqueado, com Tentar novamente', () => {
    mocks.values = { data: undefined, isError: true, isFetching: false }
    open()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: /Tentar novamente/ })[0]!)
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('alterar marca a seção no índice e o status; o tempo real (env novo do servidor) não reseta o que foi digitado', async () => {
    const view = open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja nova' } })
    await waitFor(() => expect(screen.getByText('Alterações não salvas em Identificação')).toBeTruthy())
    expect(within(screen.getByRole('navigation', { name: 'Seções do ambiente' })).getByLabelText('alterada')).toBeTruthy()
    view.rerender(<EnvironmentEditorForm env={env({ services: [] })} pcAvailable pcReason={null} hosts={HOSTS} />)
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Loja nova')
  })

  it('alteração feita em outro lugar: aviso com Recarregar (descarta) e Manter', async () => {
    const view = open()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Minha edição' } })
    view.rerender(<EnvironmentEditorForm env={env({ name: 'Loja do agente', updatedAt: '2026-11-27T11:00:00.000Z' })} pcAvailable pcReason={null} hosts={HOSTS} />)
    expect(screen.getByText(/foi alterado em outro lugar/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }))
    await waitFor(() => expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Loja do agente'))
    expect(screen.queryByText(/foi alterado em outro lugar/)).toBeNull()
  })

  it('salvar com erro rola até a primeira seção com erro e o índice mostra o alerta', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '' } })
    await act(async () => fireEvent.click(saveButton()))
    expect(mocks.save).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: /Erro em Identificação/ })).toBeTruthy())
    expect(within(screen.getByRole('navigation', { name: 'Seções do ambiente' })).getByLabelText('com erro')).toBeTruthy()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('Editar salvo fica na página: "Tudo salvo" e o aviso com Fazer deploy (abre a página do log)', async () => {
    mocks.save.mockImplementation((_values: unknown, options: { onSuccess: (saved: EnvironmentDto) => void }) => options.onSuccess(env({ updatedAt: '2026-11-27T12:00:00.000Z' })))
    mocks.action.mockImplementation((_input: unknown, options: { onSuccess: (result: { deployId: string }) => void }) => options.onSuccess({ deployId: 'd9' }))
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja 2' } })
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(screen.getByText(/Salvo. As mudanças valem no próximo deploy/)).toBeTruthy())
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(mocks.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Fazer deploy/ }))
    expect(mocks.action).toHaveBeenCalledWith({ action: 'deploy' }, expect.anything())
    expect(mocks.push).toHaveBeenCalledWith('/ambientes/deploys/d9')
  })

  it('Cancelar com alterações pede para descartar; sem alterações volta direto', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)
    expect(mocks.push).toHaveBeenCalledWith('/ambientes')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outra' } })
    await waitFor(() => expect(screen.getByText(/Alterações não salvas/)).toBeTruthy())
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!)
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }))
    expect(mocks.push).toHaveBeenCalledTimes(2)
  })
})

describe('Novo', () => {
  it('o nome gera o slug; a central é escolhida pela busca; o compose é lido sozinho; criar volta para a lista', async () => {
    respond()
    mocks.save.mockImplementation((_values: unknown, options: { onSuccess: (saved: EnvironmentDto) => void }) => options.onSuccess(env()))
    open(null)
    expect(screen.getByRole('heading', { name: 'Novo ambiente' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Loja Homologação' } })
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('loja-homologacao')
    expect(mocks.read).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Central (repositório)'))
    fireEvent.click(await screen.findByText('CRM'))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    expect(mocks.read.mock.calls[0]![0]).toEqual({ source: expect.objectContaining({ kind: 'central', centralId: 'c2', services: [] }) })
    // Serviços do compose lido viram atalhos para escolher os do ambiente.
    fireEvent.click(await screen.findByRole('button', { name: 'Incluir o serviço db' }))
    expect(screen.getByText('Só db sobe(m) no ambiente.')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Criar ambiente' })[0]!))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(savedInput()).toMatchObject({ name: 'Loja Homologação', slug: 'loja-homologacao', source: { centralId: 'c2', services: ['db'] } })
    expect(mocks.push).toHaveBeenCalledWith('/ambientes')
  })

  it('mudar a ref lê o compose de novo depois da espera', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      respond()
      open()
      await act(async () => vi.advanceTimersByTime(10))
      expect(mocks.read).toHaveBeenCalledTimes(1)
      fireEvent.change(screen.getByLabelText('Ref (branch, tag ou commit)'), { target: { value: 'release' } })
      await act(async () => vi.advanceTimersByTime(300))
      expect(mocks.read).toHaveBeenCalledTimes(1)
      await act(async () => vi.advanceTimersByTime(900))
      expect(mocks.read).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('serviços do compose', () => {
  it('lista os serviços lidos com selos; Editar abre com o valor do compose; Voltar ao do compose desfaz; salvar envia os ajustes', async () => {
    respond()
    open(env({ composeOverrides: { services: [{ service: 'antigo', ...EMPTY_SERVICE_VALUES, restart: 'always' }], yaml: '' } }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    const list = within(screen.getByRole('listbox', { name: 'Serviços do compose' }))
    expect(list.getAllByRole('option').map((option) => option.textContent)).toEqual([expect.stringContaining('app'), expect.stringContaining('db'), expect.stringContaining('antigo')])
    expect(list.getByText('não está no compose')).toBeTruthy()
    expect(list.getByText('mongo:7')).toBeTruthy()
    // O primeiro serviço vem escolhido.
    expect(panel().getByText('npm start')).toBeTruthy()
    expect(panel().getByText(/Não foi possível ler este item do compose: 8080:\$\{ALVO\}/)).toBeTruthy()
    fireEvent.click(panel().getByRole('button', { name: 'Editar Command' }))
    await waitFor(() => expect((panel().getByLabelText('command de app') as HTMLInputElement).value).toBe('npm start'))
    fireEvent.click(panel().getByRole('button', { name: 'Editar Environment' }))
    await waitFor(() => expect(panel().getByText(/O environment do serviço vence as Variáveis extras com o mesmo nome: TOKEN/)).toBeTruthy())
    fireEvent.click(panel().getByRole('button', { name: 'Voltar Environment ao do compose' }))
    expect(mocks.toast).toHaveBeenCalledWith('Environment de app voltou ao do compose', expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }))
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(savedInput().composeOverrides.services).toEqual([
      { service: 'antigo', ...EMPTY_SERVICE_VALUES, restart: 'always' },
      { service: 'app', ...EMPTY_SERVICE_VALUES, command: ['npm', 'start'] },
    ])
  })

  it('escolher por clique, por ↑/↓ e pela URL (?servico=)', async () => {
    respond()
    window.history.replaceState(null, '', '/ambientes/e1/editar?servico=db')
    open()
    await waitFor(() => expect(screen.getByLabelText('Serviço db')).toBeTruthy())
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Serviços do compose' }), { key: 'ArrowUp' })
    await waitFor(() => expect(screen.getByLabelText('Serviço app')).toBeTruthy())
    fireEvent.click(screen.getByRole('option', { name: /db/ }))
    await waitFor(() => expect(screen.getByLabelText('Serviço db')).toBeTruthy())
    expect(window.location.search).toBe('?servico=db')
    // No celular, a lista vira um seletor com busca.
    expect(screen.getByRole('button', { name: 'Serviço' })).toBeTruthy()
  })

  it('Desfazer os ajustes deste serviço pede confirmação', async () => {
    respond()
    open(env({ composeOverrides: { services: [{ service: 'app', ...EMPTY_SERVICE_VALUES, image: 'nginx:1.27' }], yaml: '' } }))
    await waitFor(() => expect(panel().getByText(/Com imagem própria/)).toBeTruthy())
    fireEvent.click(panel().getByRole('button', { name: /Desfazer os ajustes deste serviço/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer os ajustes' }))
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(savedInput().composeOverrides.services).toEqual([])
  })

  it('falha na leitura: aviso com Tentar novamente e os ajustes salvos continuam na lista', async () => {
    mocks.readState = { isPending: false, isError: true }
    open(env({ composeOverrides: { services: [{ service: 'app', ...EMPTY_SERVICE_VALUES, restart: 'always' }], yaml: '' } }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    expect(within(servicesSection()).getByText(/Não foi possível ler o compose da origem/)).toBeTruthy()
    expect(screen.getByLabelText('Serviço app')).toBeTruthy()
    fireEvent.click(within(servicesSection()).getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('limites "Por serviço": a seção Recursos resume e leva ao grupo Recursos do painel do serviço', async () => {
    respond()
    open(env({ limits: { mode: 'service', services: [{ service: 'db', memoryGb: 2, swapGb: null, cpus: null }] } }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalled())
    const resources = within(document.getElementById('ambiente-recursos')!)
    expect(resources.getByText('Sem limite')).toBeTruthy()
    fireEvent.click(resources.getByRole('button', { name: 'Ajustar os limites de db' }))
    await waitFor(() => expect(screen.getByLabelText('Serviço db')).toBeTruthy())
    expect(panel().getByText(/No compose: RAM 1 GiB/)).toBeTruthy()
    expect((document.getElementById('environment-limits-db-memory') as HTMLInputElement).value).toBe('2')
  })

  it('YAML avançado: erro com a linha bloqueia Salvar; as chaves aparecem como chips no painel', async () => {
    respond()
    open(env({ composeOverrides: { services: [], yaml: 'app:\n  stop_signal: SIGINT\n' } }))
    await waitFor(() => expect(panel().getByText('stop_signal')).toBeTruthy())
    const editor = screen.getByLabelText('YAML avançado (bloco services: do override)') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'app:\n  env_file: x\n' } })
    await waitFor(() => expect(document.body.textContent).toContain('app.env_file não pode ir no YAML avançado'))
    await act(async () => fireEvent.click(saveButton()))
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('"O que muda no deploy": o override com os valores do environment ocultos e o selo de diferença', async () => {
    respond()
    open(env({ composeOverrides: { services: [{ service: 'app', ...EMPTY_SERVICE_VALUES, environment: [{ key: 'SENHA', value: 'segredo-real' }] }], yaml: '' } }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /O que muda no deploy/ }))
    const preview = screen.getByLabelText('Override do próximo deploy')
    expect(preview.textContent).toContain('SENHA: "[valor oculto]"')
    expect(preview.textContent).not.toContain('segredo-real')
    expect(screen.getByText('Difere do implantado')).toBeTruthy()
  })
})

describe('EnvironmentEditorPage', () => {
  const list = (items: EnvironmentDto[]): EnvironmentsListDto => ({ items, unmanaged: [], pcAvailable: true, pcReason: null, hosts: HOSTS } as unknown as EnvironmentsListDto)

  it('carregando, não encontrado e erro', () => {
    mocks.list = { ...mocks.list, isLoading: true, data: undefined }
    const view = render(<EnvironmentEditorPage id="e1" />)
    expect(screen.getByLabelText('Carregando o ambiente')).toBeTruthy()
    mocks.list = { ...mocks.list, isLoading: false, data: list([]) }
    view.rerender(<EnvironmentEditorPage id="e1" />)
    expect(screen.getByText('Ambiente não encontrado')).toBeTruthy()
    mocks.list = { ...mocks.list, isError: true, data: undefined }
    view.rerender(<EnvironmentEditorPage id="e1" />)
    expect(screen.getByText('Não foi possível carregar o ambiente')).toBeTruthy()
    mocks.list = { ...mocks.list, isError: false, data: list([env()]) }
    view.rerender(<EnvironmentEditorPage id="e1" />)
    expect(screen.getByRole('heading', { name: 'Editar Loja' })).toBeTruthy()
  })
})
