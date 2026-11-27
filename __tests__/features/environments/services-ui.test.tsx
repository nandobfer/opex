/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { ComposeServicesDto, EnvironmentDto } from '@/features/environments/types'
import type { ComposeOverrides, ServiceOverride } from '@/features/environments/schemas'
import { EMPTY_SERVICE_VALUES } from '@/features/environments/service-overrides'

/** Ambientes: bloco "Serviços do compose" do formulário (OPE-211). */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  read: vi.fn(),
  readState: { isPending: false, isError: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [{ id: 'c1', name: 'Loja', config: { sessionDirectory: '/home/u/loja' } }], isLoading: false }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useSaveEnvironment: () => ({ mutate: mocks.save, isPending: false }),
  useEnvironmentEnvValues: () => ({ data: { items: [{ key: 'TOKEN', value: 'x' }] }, isError: false, isFetching: false, refetch: vi.fn() }),
  useReadComposeServices: () => ({ mutate: mocks.read, ...mocks.readState }),
}))

import { EnvironmentFormDialog } from '@/features/environments/components/EnvironmentFormDialog'

const override = (service: string, values: Partial<ServiceOverride> = {}): ServiceOverride => ({ service, ...EMPTY_SERVICE_VALUES, ...values })

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
  deployedOn: null,
  deployedVersion: null,
  deployedComposeVersion: null,
  lastDeploy: null,
  services: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const COMPOSE: ComposeServicesDto = {
  services: [
    { name: 'app', hasBuild: true, declared: { memoryGb: null, swapGb: null, cpus: null }, values: { ...EMPTY_SERVICE_VALUES, command: ['npm', 'start'], restart: 'unless-stopped', environment: [{ key: 'TOKEN', value: 'do-compose' }] }, unreadable: { ports: ['8080:${ALVO}'], volumes: [] } },
    { name: 'db', hasBuild: false, declared: { memoryGb: null, swapGb: null, cpus: null }, values: { ...EMPTY_SERVICE_VALUES, image: 'mongo:7' }, unreadable: { ports: [], volumes: [] } },
  ],
}

const open = (value: EnvironmentDto) => render(<EnvironmentFormDialog open env={value} pcAvailable pcReason={null} hosts={{ server: null, pc: null }} onClose={vi.fn()} />)
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })
const savedOverrides = () => mocks.save.mock.calls.at(-1)![0].composeOverrides as ComposeOverrides
const respond = () => mocks.read.mockImplementation((_input, options: { onSuccess: (result: ComposeServicesDto) => void }) => options.onSuccess(COMPOSE))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readState = { isPending: false, isError: false }
})
afterEach(cleanup)

describe('serviços do compose no formulário', () => {
  it('recolhido sem ajustes salvos: o compose só é lido ao abrir o bloco, uma vez, sem mexer nos limites', async () => {
    respond()
    open(env())
    expect(mocks.read).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Serviços do compose/ }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    expect(mocks.read.mock.calls[0]![0]).toEqual({ source: env().source })
    // Leitura automática: sem o toast do "Ler compose" (os limites não são preenchidos).
    expect(mocks.toast.success).not.toHaveBeenCalled()
    // Uma leitura serve os dois blocos: "Por serviço" dos limites usa os serviços lidos, sem ler de novo.
    fireEvent.click(screen.getByRole('radio', { name: 'Por serviço' }))
    await waitFor(() => expect(document.getElementById('environment-limits-db-memory')).toBeTruthy())
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })

  it('Editar reabre os campos salvos com "Personalizar" ligado; desligado mostra o valor do compose; ligar começa com ele', async () => {
    respond()
    open(env({ composeOverrides: { services: [override('app', { image: 'ghcr.io/loja/app:2' })], yaml: '' } }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    expect((screen.getByLabelText('Imagem de app') as HTMLInputElement).value).toBe('ghcr.io/loja/app:2')
    expect(screen.getByText('imagem própria')).toBeTruthy()
    expect(screen.getByText('Do compose: unless-stopped')).toBeTruthy()
    expect(screen.getByText('Do compose: npm start')).toBeTruthy()
    // Porta do compose que a tela não consegue ler: aviso, em vez de sumir calada ao personalizar.
    expect(document.body.textContent).toContain('Não foi possível ler este item do compose: 8080:${ALVO}')
    fireEvent.click(screen.getByLabelText('Personalizar Command'))
    await waitFor(() => expect((screen.getByLabelText('command de app') as HTMLTextAreaElement).value).toBe('npm\nstart'))
    // O environment do serviço vence as Variáveis extras com o mesmo nome: a tela avisa.
    fireEvent.click(screen.getByLabelText('Personalizar Environment'))
    await waitFor(() => expect(document.body.textContent).toContain('O environment do serviço vence as Variáveis extras com o mesmo nome: TOKEN'))
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(savedOverrides().services[0]).toMatchObject({ service: 'app', image: 'ghcr.io/loja/app:2', command: ['npm', 'start'], environment: [{ key: 'TOKEN', value: 'do-compose' }], restart: null })
  })

  it('desligar "Personalizar" envia null (volta a valer o do compose)', async () => {
    open(env({ composeOverrides: { services: [override('app', { image: 'nginx:1.27' })], yaml: '' } }))
    fireEvent.click(screen.getByLabelText('Personalizar Imagem'))
    await waitFor(() => expect(screen.queryByLabelText('Imagem de app')).toBeNull())
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(savedOverrides().services[0]!.image).toBeNull()
  })

  it('falha ao ler o compose: aviso com Tentar novamente, e Salvar continua livre', async () => {
    mocks.readState = { isPending: false, isError: true }
    open(env({ composeOverrides: { services: [override('app', { restart: 'always' })], yaml: '' } }))
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/A leitura do compose falhou/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar ler o compose dos serviços de novo' }))
    expect(mocks.read).toHaveBeenCalledTimes(2)
    expect(saveButton().hasAttribute('disabled')).toBe(false)
  })

  it('YAML avançado: erro com a linha em tempo real e não salva; válido vai junto', async () => {
    open(env({ composeOverrides: { services: [], yaml: 'app:\n  stop_signal: SIGINT\n' } }))
    fireEvent.click(screen.getByRole('radio', { name: 'YAML avançado' }))
    const editor = (await screen.findByLabelText('YAML avançado (bloco services: do override)')) as HTMLTextAreaElement
    expect(editor.value).toBe('app:\n  stop_signal: SIGINT\n')
    fireEvent.change(editor, { target: { value: 'app:\n  env_file: x\n' } })
    await waitFor(() => expect(document.body.textContent).toContain('app.env_file não pode ir no YAML avançado'))
    await act(async () => fireEvent.click(saveButton()))
    expect(mocks.save).not.toHaveBeenCalled()
    fireEvent.change(editor, { target: { value: 'app:\n  stop_grace_period: 30s\n' } })
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(savedOverrides().yaml).toBe('app:\n  stop_grace_period: 30s\n')
  })

  it('Novo sem a origem: não lê o compose e diz o que falta', () => {
    render(<EnvironmentFormDialog open env={null} pcAvailable pcReason={null} hosts={{ server: null, pc: null }} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Serviços do compose/ }))
    expect(mocks.read).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Ler o compose dos serviços' }).hasAttribute('disabled')).toBe(true)
  })
})
