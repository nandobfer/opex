/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentComposeDto, EnvironmentDto } from '@/features/environments/types'

/** Compose gerenciado (OPE-191): origem no formulário, linha, diálogo Compose (revisões) e apagar. */

const V1 = 'services:\n  minio:\n    image: minio/minio\n'
const V3 = `${V1}    ports:\n      - "9000:9000"\n`

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  saveCompose: vi.fn(),
  restore: vi.fn(),
  action: vi.fn(),
  remove: vi.fn(),
  compose: { isLoading: false, isError: false, data: undefined as EnvironmentComposeDto | undefined, error: null, refetch: vi.fn() },
  revision: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useCentrals: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/environments/hooks/useEnvironments', () => ({
  useSaveEnvironment: () => ({ mutate: mocks.save, isPending: false }),
  useEnvironmentEnvValues: () => ({ data: { items: [] }, isError: false, isFetching: false, refetch: vi.fn() }),
  useEnvironmentAction: () => ({ mutate: mocks.action, isPending: false }),
  useDeleteEnvironment: () => ({ mutate: mocks.remove }),
  useReadComposeServices: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() }),
}))
vi.mock('@/features/environments/hooks/useEnvironmentCompose', () => ({
  useEnvironmentCompose: () => mocks.compose,
  useComposeRevision: (_id: string | null, version: number | null) => mocks.revision(version),
  useSaveCompose: () => ({ mutate: mocks.saveCompose, isPending: false }),
  useRestoreCompose: () => ({ mutate: mocks.restore, isPending: false }),
}))

import { ComposeDialog } from '@/features/environments/components/ComposeDialog'
import { DeleteEnvironmentDialog } from '@/features/environments/components/DeleteEnvironmentDialog'
import { EnvironmentFormDialog, NO_HOSTS } from '@/features/environments/components/EnvironmentFormDialog'
import { EnvironmentRow } from '@/features/environments/components/EnvironmentRow'

const env = (overrides: Partial<EnvironmentDto> = {}): EnvironmentDto => ({
  id: 'e1',
  name: 'MinIO',
  slug: 'minio',
  source: { kind: 'managed', projectName: 'minio', services: [], composeVersion: 3 },
  envKeys: [],
  ports: [9000],
  healthUrl: null,
  buildOn: 'server',
  runOn: 'server',
  deployedOn: { buildOn: 'server', runOn: 'server' },
  deployedVersion: null,
  deployedComposeVersion: 2,
  lastDeploy: null,
  services: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

const revision = (version: number, extra: Record<string, unknown> = {}) => ({ version, authorId: 'local', note: null, createdAt: '2026-11-25T10:00:00.000Z', size: 40, deployedAt: null, ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.compose = {
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { current: { ...revision(3), content: V3 }, revisions: [revision(3), revision(2, { deployedAt: '2026-11-24T10:00:00.000Z' }), revision(1)], deployedVersion: 2 },
  }
  mocks.revision.mockImplementation((version: number | null) => ({ isLoading: false, isError: false, data: version ? { ...revision(version), content: `# conteúdo da v${version}` } : undefined }))
})
afterEach(cleanup)

describe('formulário: origem', () => {
  it('Novo: três origens (adotado desabilitado, vem de Adotar); gerenciado mostra projeto, serviços e o editor e exige o compose', async () => {
    render(<EnvironmentFormDialog open env={null} pcAvailable pcReason={null} hosts={NO_HOSTS} onClose={vi.fn()} />)
    const radios = screen.getAllByRole('radio').filter((item) => ['Central', 'Compose gerenciado', 'Projeto adotado'].includes(item.textContent ?? ''))
    expect(radios.map((item) => item.textContent)).toEqual(['Central', 'Compose gerenciado', 'Projeto adotado'])
    expect(radios[2]!.hasAttribute('disabled')).toBe(true)
    expect(radios[2]!.getAttribute('title')).toBe('Adote um projeto em execução pela lista Não gerenciados')

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'MinIO' } })
    await act(async () => fireEvent.click(radios[1]!))
    expect(screen.queryByLabelText('Ref (branch, tag ou commit)')).toBeNull()
    expect((screen.getByLabelText('Nome do projeto do compose') as HTMLInputElement).value).toBe('minio')
    const editor = screen.getByLabelText('docker-compose.yml') as HTMLTextAreaElement

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Criar ambiente' })))
    expect(mocks.save).not.toHaveBeenCalled()
    expect(await screen.findByText('Escreva o compose (YAML)')).toBeTruthy()

    fireEvent.change(editor, { target: { value: 'services:\n  bad: [\n' } })
    expect(await screen.findByText(/^YAML inválido na linha 3/)).toBeTruthy()

    fireEvent.change(editor, { target: { value: V1 } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Criar ambiente' })))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ name: 'MinIO', slug: 'minio', compose: V1, source: { kind: 'managed', projectName: 'minio', services: [] } })
  })

  it('Editar gerenciado: origem travada e o compose fica no botão Compose', () => {
    render(<EnvironmentFormDialog open env={env()} pcAvailable pcReason={null} hosts={NO_HOSTS} onClose={vi.fn()} />)
    const managed = screen.getAllByRole('radio').find((item) => item.textContent === 'Compose gerenciado')!
    expect(managed.getAttribute('aria-checked')).toBe('true')
    expect(managed.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByLabelText('docker-compose.yml')).toBeNull()
    expect(screen.getByText(/O compose se edita pelo botão Compose/)).toBeTruthy()
  })
})

describe('linha do ambiente gerenciado', () => {
  it('badge Gerenciado com a revisão vigente, aviso de compose não implantado e o botão Compose', () => {
    const onIntent = vi.fn()
    render(<EnvironmentRow env={env()} pcAvailable onIntent={onIntent} onOpenDeploy={vi.fn()} />)
    expect(screen.getByText('Gerenciado v3')).toBeTruthy()
    expect(screen.getByText(/Há compose novo não implantado \(implantada: v2\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Compose' }))
    expect(onIntent).toHaveBeenCalledWith({ kind: 'compose' })
  })

  it('revisão vigente já implantada: sem aviso; central não tem o botão Compose', () => {
    render(<EnvironmentRow env={env({ deployedComposeVersion: 3 })} pcAvailable onIntent={vi.fn()} onOpenDeploy={vi.fn()} />)
    expect(screen.queryByText(/Há compose novo/)).toBeNull()
    cleanup()
    render(<EnvironmentRow env={env({ source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' } })} pcAvailable onIntent={vi.fn()} onOpenDeploy={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Compose' })).toBeNull()
  })
})

describe('diálogo Compose', () => {
  const editor = () => screen.getByLabelText('docker-compose.yml') as HTMLTextAreaElement
  const saveButton = () => screen.getByRole('button', { name: /Salvar nova revisão/ })

  it('mostra a vigente; sem mudança não salva; editar e salvar cria uma revisão nova com a nota', async () => {
    render(<ComposeDialog env={env()} onClose={vi.fn()} />)
    expect(screen.getByText(/Revisão vigente v3 · 25\/11\/2026 \d{2}:00 · Dono/)).toBeTruthy()
    expect(editor().value).toBe(V3)
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    fireEvent.change(editor(), { target: { value: 'a: [' } })
    expect(screen.getByText(/^YAML inválido na linha/)).toBeTruthy()
    expect(saveButton().hasAttribute('disabled')).toBe(true)

    fireEvent.change(editor(), { target: { value: `${V3}# novo\n` } })
    fireEvent.change(screen.getByLabelText('Nota da revisão (opcional)'), { target: { value: 'console' } })
    expect(saveButton().hasAttribute('disabled')).toBe(false)
    fireEvent.click(saveButton())
    expect(mocks.saveCompose).toHaveBeenCalledWith({ content: `${V3}# novo\n`, note: 'console' }, expect.anything())
  })

  it('histórico: vigente e implantada marcadas; Ver abre só leitura; Restaurar pede confirmação', async () => {
    render(<ComposeDialog env={env()} onClose={vi.fn()} />)
    expect(screen.getByText('Vigente')).toBeTruthy()
    expect(screen.getByText('Implantada')).toBeTruthy()
    // A vigente não oferece Restaurar.
    expect(screen.getAllByRole('button', { name: /Restaurar/ })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: /Ver/ })[2]!)
    const viewer = screen.getByLabelText('Revisão v1 (só leitura)') as HTMLTextAreaElement
    expect(viewer.value).toBe('# conteúdo da v1')
    expect(viewer.hasAttribute('readonly')).toBe(true)
    expect(saveButton().hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao editor/ }))
    expect(editor().value).toBe(V3)

    fireEvent.click(screen.getAllByRole('button', { name: /Restaurar/ })[1]!)
    expect(await screen.findByText('Restaurar a v1?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    expect(mocks.restore).toHaveBeenCalledWith(1, expect.anything())
  })

  it('erro ao carregar: Tentar novamente', () => {
    mocks.compose = { ...mocks.compose, isError: true, data: undefined }
    render(<ComposeDialog env={env()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.compose.refetch).toHaveBeenCalled()
  })
})

it('apagar gerenciado: a pasta do ambiente e as revisões do compose saem', () => {
  render(<DeleteEnvironmentDialog env={env()} onClose={vi.fn()} />)
  expect(screen.getByText(/a pasta do ambiente é removida .* junto com todas as revisões do compose/)).toBeTruthy()
})
