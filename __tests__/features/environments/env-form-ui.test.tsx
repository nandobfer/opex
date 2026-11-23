/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentDto, EnvironmentEnvValuesDto } from '@/features/environments/types'

/** Ambientes: formulário com os valores das variáveis à vista e o Importar (.env/texto) — OPE-175. */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refetch: vi.fn(),
  values: { data: undefined as EnvironmentEnvValuesDto | undefined, isError: false, isFetching: false },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [{ id: 'c1', name: 'Loja', config: { sessionDirectory: '/home/u/loja' } }], isLoading: false }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useSaveEnvironment: () => ({ mutate: mocks.save, isPending: false }),
  useEnvironmentEnvValues: () => ({ ...mocks.values, refetch: mocks.refetch }),
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
  deployedOn: null,
  deployedVersion: null,
  lastDeploy: null,
  services: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const open = (value: EnvironmentDto | null = env()) => render(<EnvironmentFormDialog open env={value} pcAvailable pcReason={null} onClose={vi.fn()} />)
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
    render(<EnvironmentFormDialog open env={null} pcAvailable pcReason={null} onClose={vi.fn()} />)
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
