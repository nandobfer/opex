/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'
import type { OpexSkillDto } from '@/features/opex-agent/skills'

/** Seção Skills do Agente Opex (OPE-153): lista, filtros, estados, switch, editor e remoção (D6). */

const mocks = vi.hoisted(() => ({
  list: { isLoading: false, isError: false, isFetching: false, data: [] as unknown[] | undefined, error: null as unknown },
  detail: { isLoading: false, isFetching: false, isFetchedAfterMount: true, isError: false, data: undefined as unknown, error: null as unknown },
  usage: { isLoading: false, data: { count: 2, agents: [{ id: 'a1', name: 'Vagas' }, { id: 'a2', name: 'Notícias' }] } },
  refresh: vi.fn(async () => {}),
  refetchDetail: vi.fn(),
  toggle: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  create: vi.fn(async () => ({})),
  discover: vi.fn(),
  install: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
// Menu de ações aberto (o Radix não abre por evento sintético no happy-dom): cada item vira um botão.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" role="menuitem" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}))
vi.mock('@/features/opex-agent/hooks/useOpexSkills', () => ({
  useOpexSkills: () => mocks.list,
  useRefreshOpexSkills: () => mocks.refresh,
  useOpexSkillsRealtime: () => {},
  useToggleOpexSkill: () => ({ mutate: mocks.toggle, isPending: false }),
  useDeleteOpexSkill: () => ({ mutate: mocks.remove, isPending: false }),
  useUpdateOpexSkills: () => ({ mutate: mocks.update, isPending: false }),
  useOpexSkill: () => ({ ...mocks.detail, refetch: mocks.refetchDetail }),
  useOpexSkillUsage: () => mocks.usage,
  useOpexSkillFile: () => ({ data: undefined, isError: false, isFetching: false, refetch: vi.fn() }),
  useCreateOpexSkill: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateOpexSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDiscoverOpexSkills: () => ({ mutate: mocks.discover, isPending: false }),
  useInstallOpexSkills: () => ({ mutate: mocks.install, isPending: false }),
}))

import { OpexSkillsSection } from '@/features/opex-agent/components/settings/skills/OpexSkillsSection'

const skill = (overrides: Partial<OpexSkillDto>): OpexSkillDto => ({
  id: 'x'.repeat(24),
  name: 'resumir',
  description: 'Use para resumir',
  enabled: true,
  origin: { kind: 'opex', repo: null, ref: null, path: null },
  sourceLabel: 'Criada no Opex',
  version: null,
  size: 100,
  fileCount: 0,
  updatedAt: '2026-11-09T00:00:00.000Z',
  ...overrides,
})

const CREATED = skill({})
const INSTALLED = skill({
  id: 'y'.repeat(24),
  name: 'revisar-pr',
  description: 'Use ao revisar PR',
  enabled: false,
  origin: { kind: 'github', repo: 'dono/skills', ref: null, path: 'skills/revisar-pr' },
  sourceLabel: 'dono/skills/skills/revisar-pr',
  version: { installed: 'aaaaaaa', available: 'bbbbbbb', outdated: true },
  fileCount: 2,
})

beforeEach(() => {
  mocks.list = { isLoading: false, isError: false, isFetching: false, data: [CREATED, INSTALLED], error: null }
  mocks.detail = { isLoading: false, isFetching: false, isFetchedAfterMount: true, isError: false, data: undefined, error: null }
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('OpexSkillsSection', () => {
  it('lista nome, descrição, origem, versão e "Com atualização"; "Atualizar todos (N)" conta as desligadas também', () => {
    render(<OpexSkillsSection />)
    expect(screen.getByText('resumir')).toBeTruthy()
    expect(screen.getByText('Criada no Opex')).toBeTruthy()
    expect(screen.getByText('dono/skills/skills/revisar-pr')).toBeTruthy()
    expect(screen.getByText('aaaaaaa → bbbbbbb')).toBeTruthy()
    expect(screen.getAllByText('Com atualização').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Atualizar todos \(1\)/ })).toBeTruthy()
  })

  it('filtra por situação e busca pelo nome', () => {
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getByRole('radio', { name: 'Desligadas' }))
    expect(screen.queryByText('resumir')).toBeNull()
    expect(screen.getByText('revisar-pr')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    fireEvent.change(screen.getByLabelText('Buscar skills'), { target: { value: 'resumir' } })
    expect(screen.queryByText('revisar-pr')).toBeNull()
  })

  it('switch liga/desliga pela mutação otimista', () => {
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getByLabelText('Desligar resumir'))
    expect(mocks.toggle).toHaveBeenCalledWith({ id: CREATED.id, enabled: false })
  })

  it('vazio: ícone, texto e as ações Criar/Instalar; erro: "Tentar novamente"', () => {
    mocks.list = { ...mocks.list, data: [] }
    render(<OpexSkillsSection />)
    expect(screen.getByText('Nenhuma skill no Agente Opex')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Nova skill/ }).length).toBe(2)
    expect(screen.getAllByRole('button', { name: /Instalar do GitHub/ }).length).toBe(2)
    cleanup()
    mocks.list = { ...mocks.list, isError: true, data: undefined, error: new Error('falhou') }
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('carregando: skeleton com a estrutura da lista', () => {
    mocks.list = { ...mocks.list, isLoading: true, data: undefined }
    render(<OpexSkillsSection />)
    expect(screen.getByLabelText('Carregando')).toBeTruthy()
  })

  it('editar com leitura falhando mostra o erro com "Tentar novamente" e nunca abre o editor vazio', async () => {
    mocks.detail = { ...mocks.detail, isError: true, error: new Error('fora do ar') }
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Editar/ })[0]!)
    expect(await screen.findByText('Não foi possível abrir a skill')).toBeTruthy()
    expect(screen.queryByLabelText('Instruções (corpo do SKILL.md)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(mocks.refetchDetail).toHaveBeenCalled()
  })

  it('criar: nome já usado é recusado em tempo real', async () => {
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getAllByRole('button', { name: /Nova skill/ })[0]!)
    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'resumir' } })
    expect(await screen.findByText('Já existe uma skill com o nome "resumir" no Opex')).toBeTruthy()
  })

  it('remover avisa quantos rotineiros usam a skill (D6)', async () => {
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Desinstalar/ }))
    expect(await screen.findByText(/Usada por 2 agente\(s\) rotineiro\(s\)/)).toBeTruthy()
    expect(screen.getByText('Vagas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desinstalar' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(INSTALLED.id, expect.anything()))
  })

  it('instalar (D7): repositório com uma skill instala direto; com várias, o dono marca e vê o resultado por skill', async () => {
    const discovery = (skills: unknown[]) => (_source: string, options: { onSuccess: (value: unknown) => void }) => options.onSuccess({ repo: 'dono/skills', ref: null, skills })
    mocks.discover.mockImplementation(discovery([{ path: '', name: 'unica', description: 'd', error: null, exists: false }]))
    render(<OpexSkillsSection />)
    fireEvent.click(screen.getAllByRole('button', { name: /Instalar do GitHub/ })[0]!)
    fireEvent.change(await screen.findByLabelText('Repositório'), { target: { value: 'dono/skills' } })
    await waitFor(() => expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(mocks.install).toHaveBeenCalledWith({ source: 'dono/skills', paths: [''] }, expect.anything()))

    mocks.install.mockImplementation((_input: unknown, options: { onSuccess: (value: unknown) => void }) =>
      options.onSuccess({ results: [{ key: 'skills/a', name: 'a', ok: true, id: '1', message: 'Instalada' }, { key: 'skills/b', name: null, ok: false, id: null, message: 'Já existe uma skill com o nome "b" no Opex' }] }),
    )
    mocks.discover.mockImplementation(
      discovery([
        { path: 'skills/a', name: 'a', description: 'A', error: null, exists: false },
        { path: 'skills/b', name: 'b', description: 'B', error: 'Já existe uma skill com o nome "b" no Opex', exists: true },
      ]),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Instalar (1)')).toBeTruthy()
    fireEvent.click(screen.getByText('Instalar (1)'))
    expect(mocks.install).toHaveBeenLastCalledWith({ source: 'dono/skills', paths: ['skills/a'] }, expect.anything())
    expect(await screen.findByText('Instalada')).toBeTruthy()
  })
})
