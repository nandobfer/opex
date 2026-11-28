/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { EnvironmentComposeDto, EnvironmentDto } from '@/features/environments/types'

/** Compose gerenciado (OPE-191): origem no formulário, card, diálogo Compose (revisões) e apagar. */

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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/ambientes/novo', useSearchParams: () => new URLSearchParams() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn() }) }))
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
import { EnvironmentEditorForm } from '@/features/environments/components/editor/EnvironmentEditorForm'
import { NO_HOSTS } from '@/features/environments/view'
import { EnvironmentCard } from '@/features/environments/components/EnvironmentCard'

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
  limits: { mode: 'shared', memoryGb: null, cpus: null, swapGb: null },
  limitsConfigured: false,
  deployedLimits: null,
  composeOverrides: null,
  deployedComposeOverrides: null,
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

describe('página do ambiente: origem', () => {
  it('Novo: três origens (adotado desabilitado, vem de Adotar); gerenciado mostra projeto, serviços e o editor e exige o compose', async () => {
    render(<EnvironmentEditorForm env={null} pcAvailable pcReason={null} hosts={NO_HOSTS} />)
    const radios = screen.getAllByRole('radio').filter((item) => ['Central', 'Compose gerenciado', 'Projeto adotado'].includes(item.textContent ?? ''))
    expect(radios.map((item) => item.textContent)).toEqual(['Central', 'Compose gerenciado', 'Projeto adotado'])
    expect(radios[2]!.hasAttribute('disabled')).toBe(true)
    expect(radios[2]!.getAttribute('title')).toBe('Adote um projeto em execução pela lista Não gerenciados')

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'MinIO' } })
    await act(async () => fireEvent.click(radios[1]!))
    expect(screen.queryByLabelText('Ref (branch, tag ou commit)')).toBeNull()
    expect((screen.getByLabelText('Nome do projeto do compose') as HTMLInputElement).value).toBe('minio')
    const editor = screen.getByLabelText('docker-compose.yml') as HTMLTextAreaElement

    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Criar ambiente' })[0]!))
    expect(mocks.save).not.toHaveBeenCalled()
    expect(await screen.findByText('Escreva o compose (YAML)')).toBeTruthy()

    fireEvent.change(editor, { target: { value: 'services:\n  bad: [\n' } })
    expect(await screen.findByText(/^YAML inválido na linha 3/)).toBeTruthy()

    fireEvent.change(editor, { target: { value: V1 } })
    // O YAML ainda não salvo é lido no navegador: o serviço já aparece em Serviços do compose.
    await waitFor(() => expect(screen.getByLabelText('Serviço minio')).toBeTruthy())
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Criar ambiente' })[0]!))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0]![0]).toMatchObject({ name: 'MinIO', slug: 'minio', compose: V1, source: { kind: 'managed', projectName: 'minio', services: [] } })
  })

  it('Editar gerenciado: origem travada e o compose abre as revisões (diálogo Compose) na própria página', async () => {
    render(<EnvironmentEditorForm env={env()} pcAvailable pcReason={null} hosts={NO_HOSTS} />)
    const managed = screen.getAllByRole('radio').find((item) => item.textContent === 'Compose gerenciado')!
    expect(managed.getAttribute('aria-checked')).toBe('true')
    expect(managed.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('A origem não muda depois de criada.')).toBeTruthy()
    expect(screen.queryByLabelText('docker-compose.yml')).toBeNull()
    expect(screen.getByText(/Compose v3: cada gravação cria uma revisão/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir revisões' }))
    expect(await screen.findByText(/Revisão vigente v3/)).toBeTruthy()
  })
})

const openMenu = () => fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais ações de MinIO' }), { button: 0, pointerType: 'mouse' })

describe('card do ambiente gerenciado', () => {
  it('selo Gerenciado com a revisão vigente, aviso de compose não implantado e Compose no menu', () => {
    const onIntent = vi.fn()
    render(<EnvironmentCard env={env()} pcAvailable linkHost="h" onIntent={onIntent} />)
    expect(screen.getByText('Gerenciado v3')).toBeTruthy()
    expect(screen.getByText(/Mudanças salvas ainda não implantadas: compose v3 \(implantado: v2\)/)).toBeTruthy()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compose' }))
    expect(onIntent).toHaveBeenCalledWith({ kind: 'compose' })
  })

  it('revisão vigente já implantada: sem aviso; central não tem Compose no menu', () => {
    render(<EnvironmentCard env={env({ deployedComposeVersion: 3 })} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    expect(screen.queryByText(/Mudanças salvas/)).toBeNull()
    cleanup()
    render(<EnvironmentCard env={env({ source: { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' } })} pcAvailable linkHost="h" onIntent={vi.fn()} />)
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Compose' })).toBeNull()
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
