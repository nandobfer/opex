/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentDto, EnvironmentEnvValuesDto } from '@/features/environments/types'

/** Ambientes: formulário com os valores das variáveis à vista e o Importar (.env/texto) — OPE-175; limites de recursos — OPE-193. */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refetch: vi.fn(),
  values: { data: undefined as EnvironmentEnvValuesDto | undefined, isError: false, isFetching: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  read: vi.fn(),
  readState: { isPending: false, isError: false },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [{ id: 'c1', name: 'Loja', config: { sessionDirectory: '/home/u/loja' } }], isLoading: false }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useSaveEnvironment: () => ({ mutate: mocks.save, isPending: false }),
  useEnvironmentEnvValues: () => ({ ...mocks.values, refetch: mocks.refetch }),
  useReadComposeServices: () => ({ mutate: mocks.read, ...mocks.readState }),
}))

import { EnvironmentFormDialog } from '@/features/environments/components/EnvironmentFormDialog'
import { formValuesOf } from '@/features/environments/view'

const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
  id: 'e1',
  name: 'Loja',
  slug: 'loja',
  source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' },
  envKeys: ['TOKEN', 'URL'],
  ports: [4100],
  healthUrl: null,
  buildOn: 'server',
  runOn: 'server',
  limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
  limitsConfigured: false,
  deployedLimits: null,
  deployedOn: null,
  deployedVersion: null,
  lastDeploy: null,
  services: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const HOSTS = { server: { cpus: 8, memoryGb: 31.2 }, pc: null }
const open = (value: EnvironmentDto | null = env()) => render(<EnvironmentFormDialog open env={value} pcAvailable pcReason={null} hosts={HOSTS} onClose={vi.fn()} />)
const valueInput = (index: number) => screen.getByLabelText(`Valor da variável ${index}`) as HTMLInputElement
const nameInput = (index: number) => screen.getByLabelText(`Nome da variável ${index}`) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })

async function openImportMenu() {
  const trigger = screen.getByRole('button', { name: /Importar/ })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  await screen.findByRole('menuitem', { name: /Importar \.env/ })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readState = { isPending: false, isError: false }
  mocks.values = { data: { items: [{ key: 'TOKEN', value: 'segredo' }, { key: 'URL', value: 'http://a#b' }] }, isError: false, isFetching: false }
})
afterEach(cleanup)

describe('valores das variáveis', () => {
  it('Editar mostra o valor salvo, legível (sem máscara)', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    expect(valueInput(2).value).toBe('http://a#b')
    expect(valueInput(1).getAttribute('type')).not.toBe('password')
    expect(saveButton().hasAttribute('disabled')).toBe(false)
  })

  it('apagar o valor e salvar envia vazio (sem keep); remover a linha tira a variável', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.change(valueInput(1), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remover a variável 2' }))
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0].env).toEqual([{ key: 'TOKEN', value: '' }])
  })

  it('erro ao carregar os valores: Salvar bloqueado, com Tentar novamente', () => {
    mocks.values = { data: undefined, isError: true, isFetching: false }
    open()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar os valores das variáveis')
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.refetch).toHaveBeenCalled()
  })

  it('carregando: Salvar bloqueado e skeleton no lugar das linhas', () => {
    mocks.values = { data: undefined, isError: false, isFetching: true }
    open()
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Carregando as variáveis')).toBeTruthy()
  })

  it('valor que não pôde ser lido vai com keep (mantém o salvo); as outras seguem editáveis', () => {
    expect(formValuesOf(env(), { centralId: '', projectName: '' }, { items: [{ key: 'TOKEN', value: 'segredo' }, { key: 'URL', value: null }] }).env).toEqual([
      { key: 'TOKEN', value: 'segredo' },
      { key: 'URL', value: '', keep: true },
    ])
  })

  it('Novo ambiente começa sem variáveis e sem ler valores', () => {
    mocks.values = { data: undefined, isError: false, isFetching: false }
    render(<EnvironmentFormDialog open env={null} pcAvailable pcReason={null} hosts={HOSTS} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Valor da variável 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Criar ambiente' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('Importar', () => {
  it('menu com "Importar .env" e "Importar texto"', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    await openImportMenu()
    expect(screen.getByRole('menuitem', { name: /Importar texto/ })).toBeTruthy()
  })

  it('Importar texto faz upsert na lista e mostra o resumo, sem salvar', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    await openImportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Importar texto/ }))
    const text = await screen.findByLabelText('Conteúdo')
    fireEvent.change(text, { target: { value: '# comentário\nTOKEN=novo\nNOVA="a b"\nsem igual\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
    await waitFor(() => expect(nameInput(3).value).toBe('NOVA'))
    expect(valueInput(1).value).toBe('novo')
    expect(valueInput(3).value).toBe('a b')
    expect(mocks.toast.success).toHaveBeenCalledWith('1 variável(is) adicionada(s), 1 atualizada(s), 1 linha(s) ignorada(s)')
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('Importar .env lê o arquivo escolhido; conteúdo sem variáveis avisa e deixa a lista intacta', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    const file = screen.getByLabelText('Arquivo .env para importar') as HTMLInputElement
    await act(async () => fireEvent.change(file, { target: { files: [new File(['# vazio\n\n'], '.env')] } }))
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith('Nenhuma variável encontrada'))
    expect(screen.queryByLabelText('Valor da variável 3')).toBeNull()
    await act(async () => fireEvent.change(file, { target: { files: [new File(['URL=http://novo\nPORT=3000\n'], '.env')] } }))
    await waitFor(() => expect(nameInput(3).value).toBe('PORT'))
    expect(valueInput(2).value).toBe('http://novo')
    // O mesmo arquivo de novo não duplica.
    await act(async () => fireEvent.change(file, { target: { files: [new File(['URL=http://novo\nPORT=3000\n'], '.env')] } }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenLastCalledWith('0 variável(is) adicionada(s), 2 atualizada(s), 0 linha(s) ignorada(s)'))
    expect(screen.queryByLabelText('Valor da variável 4')).toBeNull()
  })
})

describe('limites de recursos (OPE-193)', () => {
  const service = (name: string, limits: EnvironmentDto['services'][number]['limits']): EnvironmentDto['services'][number] => ({ service: name, container: `loja-${name}-1`, state: 'running', status: 'Up', ports: '', cpu: null, memory: null, version: null, limits })
  const input = (id: string) => document.getElementById(id) as HTMLInputElement
  const submit = async () => {
    await act(async () => fireEvent.click(saveButton()))
  }

  it('Novo: RAM, swap e CPUs vazios ("Sem limite"), com a capacidade da máquina e o modo único', async () => {
    mocks.values = { data: undefined, isError: false, isFetching: false }
    render(<EnvironmentFormDialog open env={null} pcAvailable pcReason={null} hosts={HOSTS} onClose={vi.fn()} />)
    expect(input('environment-limits-memory').value).toBe('')
    expect(input('environment-limits-memory').getAttribute('placeholder')).toBe('Sem limite')
    expect(input('environment-limits-swap').getAttribute('placeholder')).toBe('Padrão do Docker')
    expect(input('environment-limits-cpus').getAttribute('placeholder')).toBe('Sem limite')
    expect(document.body.textContent).toContain('o servidor tem 31,2 GiB')
    expect(screen.getByRole('radio', { name: 'Mesmos para cada serviço' }).getAttribute('aria-checked')).toBe('true')
  })

  it('Editar sem limites salvos vem com os aplicados no host; com salvos, os salvos', async () => {
    open(env({ services: [service('app', { memoryGb: 4, swapGb: null, cpus: 2 }), service('db', { memoryGb: 4, swapGb: null, cpus: 2 })] }))
    await waitFor(() => expect(input('environment-limits-memory').value).toBe('4'))
    expect(input('environment-limits-cpus').value).toBe('2')
    expect(document.body.textContent).toContain('No host hoje: RAM 4 GiB · swap padrão · 2 CPUs.')
    cleanup()
    open(env({ limitsConfigured: true, limits: { mode: 'shared', memoryGb: 8, swapGb: 0, cpus: null }, services: [service('app', { memoryGb: 4, swapGb: null, cpus: 2 })] }))
    await waitFor(() => expect(input('environment-limits-memory').value).toBe('8'))
    expect(input('environment-limits-swap').value).toBe('0')
    expect(input('environment-limits-cpus').value).toBe('')
  })

  it('aplicados diferentes por serviço abrem no modo "Por serviço"', async () => {
    open(env({ services: [service('app', { memoryGb: 4, swapGb: null, cpus: null }), service('db', { memoryGb: 1, swapGb: null, cpus: null })] }))
    await waitFor(() => expect(input('environment-limits-app-memory').value).toBe('4'))
    expect(input('environment-limits-db-memory').value).toBe('1')
    expect(screen.getByRole('radio', { name: 'Por serviço' }).getAttribute('aria-checked')).toBe('true')
  })

  it('swap sem RAM mostra o erro e não salva; com a RAM, envia os limites', async () => {
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.change(input('environment-limits-swap'), { target: { value: '2' } })
    await waitFor(() => expect(document.body.textContent).toContain('Defina a RAM para limitar o swap'))
    await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    fireEvent.change(input('environment-limits-memory'), { target: { value: '4' } })
    fireEvent.change(input('environment-limits-cpus'), { target: { value: '2.5' } })
    await submit()
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0].limits).toEqual({ mode: 'shared', memoryGb: 4, swapGb: 2, cpus: 2.5 })
  })

  it('"Por serviço" copia os valores para os serviços do host; "Ler compose" acrescenta os do compose e marca a linha órfã', async () => {
    open(env({ limitsConfigured: true, limits: { mode: 'shared', memoryGb: 2, swapGb: null, cpus: null }, services: [service('app', NO_SERVICE_LIMITS)] }))
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.click(screen.getByRole('radio', { name: 'Por serviço' }))
    await waitFor(() => expect(input('environment-limits-app-memory').value).toBe('2'))
    expect(mocks.read).not.toHaveBeenCalled()
    mocks.read.mockImplementation((_input, options: { onSuccess: (result: unknown) => void }) =>
      options.onSuccess({ services: [{ name: 'web', hasBuild: true, declared: { memoryGb: 1, swapGb: null, cpus: 0.5 } }, { name: 'db', hasBuild: false, declared: NO_SERVICE_LIMITS }] }),
    )
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: /Ler compose/ })[0]!))
    expect(mocks.read.mock.calls[0]![0]).toEqual({ source: env().source })
    await waitFor(() => expect(input('environment-limits-web-memory').value).toBe('1'))
    expect(input('environment-limits-web-cpus').value).toBe('0.5')
    expect(input('environment-limits-db-memory').value).toBe('')
    // `app` (do host) não está no compose lido.
    expect(screen.getByText('não está no compose')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remover os limites de app' }))
    await waitFor(() => expect(document.getElementById('environment-limits-app-memory')).toBeNull())
    await submit()
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0].limits).toEqual({ mode: 'service', services: [{ service: 'web', memoryGb: 1, swapGb: null, cpus: 0.5 }, { service: 'db', ...NO_SERVICE_LIMITS }] })
  })

  it('"Por serviço" sem serviços conhecidos lê o compose sozinho; o erro da leitura oferece Tentar novamente', async () => {
    mocks.readState = { isPending: false, isError: true }
    open()
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    fireEvent.click(screen.getByRole('radio', { name: 'Por serviço' }))
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Não foi possível ler o compose da origem/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Tentar novamente/ }).at(-1)!)
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })
})

const NO_SERVICE_LIMITS = { memoryGb: null, swapGb: null, cpus: null }

describe('limites de recursos: revisão (OPE-193)', () => {
  const input = (id: string) => document.getElementById(id) as HTMLInputElement
  const applied4 = { service: 'app', container: 'loja-app-1', state: 'running', status: 'Up', ports: '', cpu: null, memory: null, version: null, limits: { memoryGb: 4, swapGb: null, cpus: 2 } }

  it('regressão: "sem limite" salvo reabre vazio, mesmo com o host ainda limitado', async () => {
    open(env({ limitsConfigured: true, deployedOn: { buildOn: 'server', runOn: 'server' }, services: [applied4] }))
    await waitFor(() => expect(valueInput(1).value).toBe('segredo'))
    expect(input('environment-limits-memory').value).toBe('')
    expect(input('environment-limits-cpus').value).toBe('')
    expect(document.body.textContent).toContain('No host hoje: RAM 4 GiB · swap padrão · 2 CPUs.')
    await act(async () => fireEvent.click(saveButton()))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0].limits).toEqual({ mode: 'shared', memoryGb: null, cpus: null, swapGb: null })
  })

  it('regressão: Novo sem a origem escolhida não lê o compose (nem ao trocar para "Por serviço") e diz o que falta', () => {
    mocks.values = { data: undefined, isError: false, isFetching: false }
    render(<EnvironmentFormDialog open env={null} pcAvailable pcReason={null} hosts={HOSTS} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Ler compose/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Por serviço' }))
    expect(mocks.read).not.toHaveBeenCalled()
    expect(screen.getByText('Escolha a origem para ler o compose.')).toBeTruthy()
    expect(screen.queryByText(/Não foi possível ler o compose/)).toBeNull()
  })
})
