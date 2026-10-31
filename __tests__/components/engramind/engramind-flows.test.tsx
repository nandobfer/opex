/** @vitest-environment happy-dom */

import React from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Fluxos de tela do Engramind: invalidação por evento do webhook, base estável dos formulários
 * (refetch não apaga o rascunho), aba Configurações (só o alterado, reindexação, padrão = null),
 * listas com erro e "Tentar novamente", conexão (passos do bootstrap), importação (bloqueios),
 * variáveis de ambiente e "Aplicar e reiniciar".
 */

type Query = { data?: unknown; isLoading: boolean; error: unknown; refetch: () => void }
const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, Query>,
  lists: {} as Record<string, Query & { items: unknown[]; hasNextPage?: boolean; isFetchingNextPage?: boolean; fetchNextPage?: () => void }>,
  mutate: vi.fn(),
  mutateAsync: (async () => ({})) as (input: unknown) => Promise<unknown>,
  calls: [] as unknown[],
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  connection: null as unknown,
  env: null as unknown,
  applyStatus: null as null | { status: string; error: string | null },
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/features/engramind/hooks/useEngramind', async (original) => ({
  ...(await original<object>()),
  useEngramindQuery: (path: string) => mocks.queries[path] ?? { data: undefined, isLoading: false, error: null, refetch: vi.fn() },
  useEngramindList: (path: string) => mocks.lists[path] ?? { items: [], isLoading: false, error: null, refetch: vi.fn() },
  useEngramindMutation: () => ({
    mutate: mocks.mutate,
    mutateAsync: async (input: unknown) => {
      mocks.calls.push(input)
      return mocks.mutateAsync(input)
    },
    isPending: false,
  }),
}))
vi.mock('@/features/engramind/hooks/useEngramindConnection', () => ({
  useEngramindConnection: () => ({ data: mocks.connection, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useEngramindEnvironmentOptions: () => ({ data: [] }),
  useSaveEngramindConnection: () => ({
    mutateAsync: async (input: unknown) => {
      mocks.calls.push(input)
      return mocks.mutateAsync(input)
    },
    isPending: false,
  }),
  useRunEngramindBootstrap: () => ({ mutateAsync: async () => ({ steps: [] }), isPending: false }),
}))
vi.mock('@/features/engramind/hooks/useEngramindEnv', () => ({
  useEngramindEnv: () => ({ data: mocks.env, isLoading: false, error: null, refetch: vi.fn() }),
  useSaveEngramindEnv: () => ({
    mutateAsync: async (input: unknown) => {
      mocks.calls.push(input)
      return mocks.mutateAsync(input)
    },
    isPending: false,
  }),
  useApplyEngramindEnv: () => ({
    mutateAsync: async (input: unknown) => {
      mocks.calls.push({ apply: input ?? true })
      return mocks.mutateAsync(input)
    },
    isPending: false,
  }),
  useApplyLog: () => ({ status: mocks.applyStatus }),
}))
vi.mock('@/features/integrations/components/IntegrationConsole', async () => {
  const ReactModule = await import('react')
  return { IntegrationConsole: ReactModule.forwardRef<HTMLDivElement, { ariaLabel?: string }>(function Console(props, ref) { return <div ref={ref} aria-label={props.ariaLabel} /> }) }
})

import { areasForEvent } from '@/features/engramind/hooks/useEngramind'
import { useFormSnapshot } from '@/features/engramind/components/shared/useFormSnapshot'
import { SettingsTab } from '@/features/engramind/components/integration/settings/SettingsTab'
import { JobsCard } from '@/features/engramind/components/integration/operation/JobsCard'
import { SubscribersCard } from '@/features/engramind/components/page/channels/SubscribersCard'
import { ConnectionTab } from '@/features/engramind/components/integration/ConnectionTab'
import { ImportMemoriesDialog } from '@/features/engramind/components/page/memories/ImportMemoriesDialog'
import { EnvTab } from '@/features/engramind/components/integration/env/EnvTab'
import { ApplyRestartDialog } from '@/features/engramind/components/integration/env/ApplyRestartDialog'

const query = (data: unknown): Query => ({ data, isLoading: false, error: null, refetch: vi.fn() })

beforeEach(() => {
  mocks.queries = {}
  mocks.lists = {}
  mocks.mutate.mockClear()
  mocks.calls = []
  mocks.mutateAsync = async () => ({})
  mocks.toast.success.mockClear()
  mocks.toast.error.mockClear()
  mocks.toast.warning.mockClear()
  mocks.applyStatus = null
})

describe('areasForEvent', () => {
  it.each([
    ['memory.created', ['memories', 'channels']],
    ['memory.deleted', ['memories', 'channels']],
    ['channel.updated', ['channels', 'memories']],
    ['subscription.updated', ['subscriptions', 'agents']],
    ['settings.updated', ['settings', 'channels', 'status', 'providers']],
    ['identities.updated', ['apps', 'agents', 'tokens', 'connection']],
    ['jobs.updated', ['jobs', 'status']],
    ['env.applied', ['env', 'status', 'connection']],
    ['desconhecido', []],
  ])('%s → %j', (type, areas) => {
    expect(areasForEvent(type)).toEqual(areas)
  })
})

describe('useFormSnapshot', () => {
  it('refetch com o mesmo conteúdo mantém a base; conteúdo novo com rascunho avisa e mantém; sem rascunho adota', () => {
    const { result, rerender } = renderHook(({ data, dirty }) => useFormSnapshot(data, dirty), { initialProps: { data: { a: 1 } as { a: number } | undefined, dirty: false } })
    const firstKey = result.current.key
    rerender({ data: { a: 1 }, dirty: false })
    expect(result.current.key).toBe(firstKey)
    rerender({ data: { a: 2 }, dirty: true })
    expect(result.current.stale).toBe(true)
    expect(result.current.data).toEqual({ a: 1 })
    act(() => result.current.reload())
    expect(result.current.data).toEqual({ a: 2 })
    rerender({ data: { a: 3 }, dirty: false })
    expect(result.current.data).toEqual({ a: 3 })
    expect(result.current.stale).toBe(false)
  })
})

describe('SettingsTab', () => {
  const metas = (rate = 600, prefix: string | null = null) => ({
    settings: [
      { key: 'limits.rate_per_minute', type: 'integer', min: 1, max: 100000, default: 600, value: rate, description: '', channel_override: false, updated_at: rate === 600 ? null : '2026-10-30T12:00:00Z' },
      { key: 'embedding.query_prefix', type: 'text', default: null, value: prefix, description: '', channel_override: false, updated_at: prefix === null ? null : '2026-10-31T12:00:00Z' },
      { key: 'redator.model', type: 'text', default: null, value: 'gpt-4o', description: '', channel_override: false, updated_at: '2026-10-30T12:00:00Z' },
    ],
  })
  const renderTab = () => render(<SettingsTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)

  it('envia só a chave alterada (as da IA do Opex são somente leitura)', async () => {
    mocks.queries.settings = query(metas())
    renderTab()
    fireEvent.change(document.getElementById('setting-limits-rate_per_minute')!, { target: { value: '1200' } })
    fireEvent.click(await screen.findByRole('button', { name: /Salvar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ 'limits.rate_per_minute': 1200 }, expect.anything())
    expect(document.getElementById('setting-redator-model')!.getAttribute('data-readonly')).toBe('true')
  })

  it('"Voltar ao padrão" envia null', async () => {
    mocks.queries.settings = query(metas(900))
    renderTab()
    fireEvent.click(screen.getAllByRole('button', { name: /Voltar ao padrão/ })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /Salvar/ }))
    expect(mocks.mutate).toHaveBeenCalledWith({ 'limits.rate_per_minute': null }, expect.anything())
  })

  it('chave que reindexa mostra o aviso e pede confirmação antes de salvar', async () => {
    mocks.queries.settings = query(metas())
    renderTab()
    fireEvent.change(document.getElementById('setting-embedding-query_prefix')!, { target: { value: 'q: ' } })
    expect(await screen.findByText(/memórias são reindexadas/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar e reindexar' }))
    expect(mocks.mutate).toHaveBeenCalledWith({ 'embedding.query_prefix': 'q: ' }, expect.anything())
  })

  it('refetch com outra chave mudada por fora não apaga o rascunho; avisa e "Recarregar" adota', async () => {
    mocks.queries.settings = query(metas())
    const { rerender } = renderTab()
    const input = () => document.getElementById('setting-limits-rate_per_minute') as HTMLInputElement
    fireEvent.change(input(), { target: { value: '1200' } })
    mocks.queries.settings = query(metas(600, 'mudado por fora'))
    rerender(<SettingsTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)
    expect(input().value).toBe('1200')
    expect(await screen.findByText(/mudaram fora daqui/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Recarregar/ }))
    await waitFor(() => expect(input().value).toBe('600'))
    expect((document.getElementById('setting-embedding-query_prefix') as HTMLInputElement).value).toBe('mudado por fora')
  })
})

describe('listas com erro', () => {
  it('Jobs: erro mostra "Tentar novamente" (não "Nenhum job") e refaz a consulta', () => {
    const refetch = vi.fn()
    mocks.lists.jobs = { items: [], isLoading: false, error: Object.assign(new Error('x'), { response: { status: 503, data: { success: false, error: { message: 'Engramind fora do ar' } } } }), refetch }
    render(<JobsCard />)
    expect(screen.queryByText('Nenhum job')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }))
    expect(refetch).toHaveBeenCalled()
  })

  it('Jobs carregando mostra o skeleton da lista', () => {
    mocks.lists.jobs = { items: [], isLoading: true, error: null, refetch: vi.fn() }
    render(<JobsCard />)
    expect(screen.getByTestId('list-skeleton')).toBeTruthy()
  })

  it('Assinantes: erro não vira "Nenhum assinante"', () => {
    mocks.lists.subscriptions = { items: [], isLoading: false, error: new Error('429'), refetch: vi.fn() }
    render(<SubscribersCard channel="eng/global" />)
    expect(screen.queryByText('Nenhum assinante')).toBeNull()
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy()
  })
})

describe('ConnectionTab', () => {
  const connection = { baseUrl: 'http://engramind:8000', opexPublicUrl: 'http://opex:3100', environmentId: null, environmentName: null, tokenConfigured: true, webhookSecretConfigured: true, webhookUrl: null, configured: true, whoami: null, error: null, bootstrapPending: false, tokenSufficient: true, webhook: null }
  const props = { onDirtyChange: vi.fn(), draft: { environment: 'externo', debugMode: false, swaggerUrl: '', publicValues: {}, secrets: {} }, setDraft: vi.fn(), dirty: false, pending: false, onSave: async () => true, onUndo: vi.fn() } as never

  it('salvar mostra os passos do bootstrap e avisa o passo que falhou', async () => {
    mocks.connection = connection
    mocks.mutateAsync = async () => ({ connection, steps: [{ id: 'whoami', status: 'ok', message: 'Token conferido' }, { id: 'webhook', status: 'failed', message: 'Webhook não registrado' }] })
    render(<ConnectionTab {...(props as object)} />)
    fireEvent.change(document.getElementById('eng-base-url')!, { target: { value: 'http://outro:8000' } })
    const save = screen.getByRole('button', { name: /Salvar conexão/ })
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false))
    fireEvent.click(save)
    expect(await screen.findByText(/Token conferido/)).toBeTruthy()
    expect(screen.getByText(/Webhook não registrado/)).toBeTruthy()
    expect(mocks.toast.warning).toHaveBeenCalledWith('Webhook não registrado')
    expect(mocks.calls[0]).toMatchObject({ baseUrl: 'http://outro:8000' })
  })

  it('falha ao salvar vira toast de erro', async () => {
    mocks.connection = connection
    mocks.mutateAsync = async () => {
      throw new Error('fora')
    }
    render(<ConnectionTab {...(props as object)} />)
    fireEvent.change(document.getElementById('eng-base-url')!, { target: { value: 'http://outro:8000' } })
    const save = screen.getByRole('button', { name: /Salvar conexão/ })
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false))
    fireEvent.click(save)
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
  })
})

describe('ImportMemoriesDialog', () => {
  const channels = [{ id: 'ch_1', slug: 'eng/global', name: 'Global', description: null, priority: 0, version: 1, created_at: '2026-10-01T00:00:00Z', archived_at: null }]
  const pick = async (content: string, name = 'm.json') => {
    fireEvent.change(document.getElementById('import-file')!, { target: { files: [new File([content], name, { type: 'application/json' })] } })
    await screen.findByText(new RegExp(`${name.replace('.', '\\.')}|inválido|limite`))
  }
  const importButton = () => screen.getByRole('button', { name: /Importar$/ })

  it('item inválido bloqueia o envio e aponta o índice', async () => {
    render(<ImportMemoriesDialog channels={channels} maxBatch={100} onOpenChange={vi.fn()} />)
    await pick('[{"text":"ok"},{"texto":"x"}]')
    expect(await screen.findByText(/Item 2:/)).toBeTruthy()
    expect(importButton().hasAttribute('disabled')).toBe(true)
  })

  it('acima de limits.max_batch bloqueia antes do envio', async () => {
    render(<ImportMemoriesDialog channels={channels} maxBatch={1} onOpenChange={vi.fn()} />)
    await pick('[{"text":"a"},{"text":"b"}]')
    expect(await screen.findByText(/limite por lote é 1/)).toBeTruthy()
    expect(importButton().hasAttribute('disabled')).toBe(true)
  })

  it('arquivo válido (inclusive JSONL de uma linha) envia canal e itens', async () => {
    mocks.mutateAsync = async () => ({ created: [{ index: 0, id: 'mem_1' }], duplicates: [] })
    render(<ImportMemoriesDialog channels={channels} maxBatch={10} onOpenChange={vi.fn()} />)
    await pick('{"text":"Rode só os testes afetados."}\n', 'm.jsonl')
    await waitFor(() => expect(importButton().hasAttribute('disabled')).toBe(false))
    fireEvent.click(importButton())
    await waitFor(() => expect(mocks.calls).toEqual([{ channel: 'eng/global', memories: [expect.objectContaining({ text: 'Rode só os testes afetados.' })] }]))
    expect(await screen.findByText(/1 memória\(s\) criada\(s\)/)).toBeTruthy()
  })
})

describe('EnvTab e Aplicar e reiniciar', () => {
  const file = (pending: { keys: string[]; at: string } | null = null) => ({
    hash: 'a'.repeat(64),
    entries: [
      { key: 'RUST_LOG', kind: 'editable', value: 'info' },
      { key: 'TOKEN_PEPPER', kind: 'read-only', configured: true },
    ],
    environment: { id: 'env_1', name: 'Engramind', dir: '/home/engramind' },
    pendingApply: pending,
    apply: null,
  })

  it('salva só a variável alterada com o hash lido', async () => {
    mocks.env = file()
    render(<EnvTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)
    fireEvent.change(document.getElementById('env-RUST_LOG')!, { target: { value: 'debug' } })
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }))
    await waitFor(() => expect(mocks.calls).toEqual([{ hash: 'a'.repeat(64), changes: { RUST_LOG: 'debug' } }]))
  })

  it('arquivo mudado no host: avisa e oferece recarregar', async () => {
    mocks.env = file()
    mocks.mutateAsync = async () => {
      throw new AxiosError('O arquivo mudou', '409', undefined, undefined, { status: 409, statusText: 'Conflict', headers: {}, config: {} as never, data: { success: false, error: 'O arquivo mudou; recarregue', code: 'ENGRAMIND_ENV_CHANGED' } })
    }
    render(<EnvTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)
    fireEvent.change(document.getElementById('env-RUST_LOG')!, { target: { value: 'debug' } })
    fireEvent.click(screen.getByRole('button', { name: /^Salvar$/ }))
    expect(await screen.findByText(/O arquivo mudou no servidor/)).toBeTruthy()
  })

  it('pendências abrem o "Aplicar e reiniciar"; trocar a porta avisa que o projeto é derrubado', async () => {
    mocks.env = file({ keys: ['APP_PORT'], at: '2026-10-31T12:00:00Z' })
    render(<EnvTab onDirtyChange={vi.fn()} onConfigure={vi.fn()} />)
    expect(screen.getByText(/Alterações pendentes de aplicação \(APP_PORT\)/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Aplicar e reiniciar/ })[0]!)
    expect(await screen.findByText(/o projeto atual é derrubado antes/)).toBeTruthy()
  })

  it('ApplyRestartDialog: confirmar inicia e mostra o log e o resultado; falha vira toast', async () => {
    const { rerender } = render(<ApplyRestartDialog open onOpenChange={vi.fn()} running={false} recreatesProject={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Aplicar e reiniciar/ }))
    expect(await screen.findByLabelText('Log do Aplicar e reiniciar')).toBeTruthy()
    expect(mocks.calls).toHaveLength(1)
    mocks.applyStatus = { status: 'success', error: null }
    rerender(<ApplyRestartDialog open onOpenChange={vi.fn()} running={false} recreatesProject={false} />)
    expect(await screen.findByText(/Engramind recriado e pronto/)).toBeTruthy()
  })

  it('ApplyRestartDialog: falha ao iniciar mostra o erro e não abre o log', async () => {
    mocks.mutateAsync = async () => {
      throw new Error('ocupado')
    }
    render(<ApplyRestartDialog open onOpenChange={vi.fn()} running={false} recreatesProject={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Aplicar e reiniciar/ }))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(screen.queryByLabelText('Log do Aplicar e reiniciar')).toBeNull()
  })
})
