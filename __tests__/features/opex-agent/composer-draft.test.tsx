/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * OPE-195: fechar o popover do Agente Opex/Maddox (Esc, clique fora, item da barra lateral, Fechar,
 * ícone do cabeçalho no celular) desmonta o chat; o texto do campo volta ao reabrir, por aba.
 */

type CreateOptions = { onSuccess: (data: { session: { id: string } }) => void }

const mocks = vi.hoisted(() => ({
  sessions: { opex: [] as { id: string; status: string; title: string }[], maddox: [] as { id: string; status: string; title: string }[] },
  create: vi.fn(),
  enqueue: vi.fn(),
}))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: ReactNode; href: string } & Record<string, unknown>) => <a href={href} {...props}>{children}</a> }))
vi.mock('@/features/opex-agent/hooks/useOpexSessions', async () => {
  const { useOpexScope } = await import('@/features/opex-agent/components/OpexScopeProvider')
  return {
    useOpexSessions: () => ({ data: mocks.sessions[useOpexScope().agent.id as 'opex' | 'maddox'] }),
    useOpexRealtime: () => {},
    useUpdateOpexSession: () => ({ mutate: vi.fn(), isPending: false }),
    useCreateOpexSession: () => ({ mutate: mocks.create, isPending: false }),
  }
})
vi.mock('@/features/opex-agent/hooks/useOpexUploads', () => ({
  OpexUploadsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useOpexUploads: () => ({ items: [], ready: [], enqueue: mocks.enqueue, retry: vi.fn(), remove: vi.fn(), clearSent: vi.fn() }),
}))
vi.mock('@/features/opex-agent/hooks/useOpexJobs', () => ({ useOpexJobNotifications: () => {} }))
vi.mock('@/features/opex-agent/hooks/useOpexSettings', () => ({
  useOpexView: () => ({ data: { availability: { available: true, reason: null }, files: { maxPerMessage: 5, maxSizeMb: 10 }, modelLabel: 'x', color: null, defaultModel: null }, isLoading: false }),
}))
vi.mock('@/features/maddox-agent/hooks/useMaddoxSettings', () => ({ useMaddoxSettings: () => ({ data: { settings: { color: 'sky' } } }) }))
vi.mock('@/features/maddox-agent/hooks/useMaddoxModels', () => ({ useMaddoxModels: () => ({ data: [], isLoading: false }) }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/features/ai/components/model-picker/ModelOverridePicker', () => ({ ModelOverridePicker: () => null }))
// Sessão aberta: só o campo de mensagem real, com o rascunho da aba (o resto do chat não importa aqui).
vi.mock('@/features/opex-agent/components/chat/OpexChat', async () => {
  const { OpexComposer } = await import('@/features/opex-agent/components/chat/OpexComposer')
  return {
    OpexUnavailable: () => null,
    OpexChat: ({ sessionId }: { sessionId: string }) => (
      <div data-testid={`chat-${sessionId}`}>
        <OpexComposer draftId={sessionId} onSend={vi.fn()} attachments={{ items: [], onFiles: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }} onStop={vi.fn()} running={false} sending={false} stopping={false} />
      </div>
    ),
  }
})
vi.mock('@/features/opex-agent/components/OpexSessionTabs', () => ({
  OpexSessionTabs: ({ open, onActivate }: { open: string[]; onActivate: (id: string) => void }) => (
    <div>
      {open.map((id) => (
        <button key={id} type="button" onClick={() => onActivate(id)}>{`aba ${id}`}</button>
      ))}
    </div>
  ),
}))
vi.mock('@/features/opex-agent/components/OpexSessionsPanel', () => ({ OpexSessionsPanel: () => null }))

import { AgentChatNavItem } from '@/features/opex-agent/components/agents/AgentChatNavItem'
import { OpexComposer } from '@/features/opex-agent/components/chat/OpexComposer'
import { OpexScopeProvider, type OpexClientUiScope } from '@/features/opex-agent/components/OpexScopeProvider'
import { composerDraftsKey } from '@/features/opex-agent/hooks/useComposerDraft'
import { OPEX_DRAFT_TAB } from '@/features/opex-agent/hooks/useOpexTabs'
import { OPEX_TABS_STORAGE_KEY } from '@/features/opex-agent/constants'
import { MADDOX_TABS_STORAGE_KEY } from '@/features/maddox-agent/constants'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const field = (label = 'Agente Opex') => screen.getByLabelText(`Mensagem para o ${label}`) as HTMLTextAreaElement
const type = (text: string, label?: string) => fireEvent.change(field(label), { target: { value: text } })
const storedDrafts = (tabsKey = OPEX_TABS_STORAGE_KEY) => JSON.parse(window.localStorage.getItem(composerDraftsKey(tabsKey)) ?? '{}') as Record<string, string>
const portalClient: OpexClientUiScope = { clientId: 'c1', clientName: 'ACME', userId: 'u1', userName: 'ana', isAdmin: false, http: { get: vi.fn(async () => new Promise(() => {})) } as never }

const composer = (props: { draftId?: string; initialText?: string; onSend?: (text: string) => void } = {}) => (
  <OpexComposer onSend={props.onSend ?? vi.fn()} draftId={props.draftId} initialText={props.initialText} attachments={{ items: [], onFiles: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }} onStop={vi.fn()} running={false} sending={false} stopping={false} />
)

beforeEach(() => {
  window.localStorage.clear()
  mocks.sessions = { opex: [], maddox: [] }
  vi.clearAllMocks()
  mocks.create.mockImplementation((_input: unknown, options: CreateOptions) => options.onSuccess({ session: { id: 's9' } }))
})
afterEach(cleanup)

describe('OpexComposer com rascunho por aba', () => {
  it('desmontar e montar de novo devolve o texto da aba', () => {
    const first = render(composer({ draftId: 'a' }))
    type('meio escrito')
    first.unmount()
    render(composer({ draftId: 'a' }))
    expect(field().value).toBe('meio escrito')
  })

  it('cada aba tem o próprio texto', () => {
    const a = render(composer({ draftId: 'a' }))
    type('texto A')
    a.unmount()
    const b = render(composer({ draftId: 'b' }))
    expect(field().value).toBe('')
    type('texto B')
    b.unmount()
    render(composer({ draftId: 'a' }))
    expect(field().value).toBe('texto A')
  })

  it('agente, cliente e usuário não misturam os rascunhos', () => {
    const opex = render(<OpexScopeProvider agent="opex">{composer({ draftId: 's1' })}</OpexScopeProvider>)
    type('do opex')
    opex.unmount()
    const maddox = render(<OpexScopeProvider agent="maddox">{composer({ draftId: 's1' })}</OpexScopeProvider>)
    expect(field('Agente Maddox').value).toBe('')
    maddox.unmount()
    render(<OpexScopeProvider agent="opex" client={portalClient}>{composer({ draftId: 's1' })}</OpexScopeProvider>)
    expect(field().value).toBe('')
  })

  it('enviar limpa o rascunho: ao montar de novo o campo está vazio', () => {
    const onSend = vi.fn()
    const first = render(composer({ draftId: 'a', onSend }))
    type('pergunta')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('pergunta')
    expect(storedDrafts()).toEqual({})
    first.unmount()
    render(composer({ draftId: 'a' }))
    expect(field().value).toBe('')
  })

  it('o texto inicial (initialText) tem precedência sobre o rascunho guardado', () => {
    window.localStorage.setItem(composerDraftsKey(OPEX_TABS_STORAGE_KEY), JSON.stringify({ a: 'guardado' }))
    render(composer({ draftId: 'a', initialText: 'Sobre isto:' }))
    expect(field().value).toBe('Sobre isto:')
  })

  it('OPE-198: mudar o focusKey devolve o foco ao campo já montado', () => {
    const props = { onSend: vi.fn(), attachments: { items: [], onFiles: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() }, onStop: vi.fn(), running: false, sending: false, stopping: false }
    const view = render(
      <>
        <button type="button">fora</button>
        <OpexComposer {...props} focusKey={0} />
      </>,
    )
    expect(document.activeElement).toBe(field())
    screen.getByRole('button', { name: 'fora' }).focus()
    expect(document.activeElement).not.toBe(field())
    view.rerender(
      <>
        <button type="button">fora</button>
        <OpexComposer {...props} focusKey={1} />
      </>,
    )
    expect(document.activeElement).toBe(field())
  })

  it('sem draftId nada é guardado', () => {
    render(composer())
    type('solto')
    expect(window.localStorage.getItem(composerDraftsKey(OPEX_TABS_STORAGE_KEY))).toBeNull()
  })
})

describe('fechar e reabrir o popover não perde o texto', () => {
  const renderItem = (props: Partial<Parameters<typeof AgentChatNavItem>[0]> = {}) => render(<ul><AgentChatNavItem collapsed={false} {...props} /></ul>, { wrapper })
  const openPopover = async (testId = 'agent-nav-item', label = 'Agente Opex') => {
    fireEvent.click(screen.getByTestId(testId))
    await waitFor(() => expect(screen.getByLabelText(`Mensagem para o ${label}`)).toBeTruthy())
  }
  const closed = (label = 'Agente Opex') => waitFor(() => expect(screen.queryByLabelText(`Mensagem para o ${label}`)).toBeNull())

  const closeWays: [string, () => void | Promise<void>][] = [
    ['Esc', () => void fireEvent.keyDown(field(), { key: 'Escape' })],
    ['clique fora', async () => {
      // O Radix registra o "clique fora" no próximo tique depois de abrir.
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
      // Com o botão principal, o Radix espera o `click` para fechar.
      fireEvent.pointerDown(document.body, { button: 0, pointerType: 'mouse' })
      fireEvent.click(document.body)
    }],
    ['item da barra lateral', () => void fireEvent.click(screen.getByTestId('agent-nav-item'))],
    ['botão Fechar', () => void fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))],
  ]

  it.each(closeWays)('"Nova sessão": fechar por %s e reabrir mostra o texto', async (_, close) => {
    renderItem()
    await openPopover()
    type('ainda escrevendo')
    await close()
    await closed()
    await openPopover()
    expect(field().value).toBe('ainda escrevendo')
  })

  it('Agente Maddox: o texto volta ao reabrir', async () => {
    window.localStorage.setItem('opex:chat-agent:active:v1', JSON.stringify('maddox'))
    renderItem()
    await openPopover('agent-nav-item', 'Agente Maddox')
    type('para o maddox', 'Agente Maddox')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await closed('Agente Maddox')
    await openPopover('agent-nav-item', 'Agente Maddox')
    expect(field('Agente Maddox').value).toBe('para o maddox')
    expect(storedDrafts(MADDOX_TABS_STORAGE_KEY)).toEqual({ [OPEX_DRAFT_TAB]: 'para o maddox' })
  })

  it('portal do cliente: o texto volta ao reabrir, na chave do cliente e do usuário', async () => {
    renderItem({ client: portalClient, initial: { opex: true, maddox: false } })
    await openPopover()
    type('do portal')
    fireEvent.keyDown(field(), { key: 'Escape' })
    await closed()
    await openPopover()
    expect(field().value).toBe('do portal')
    expect(storedDrafts(`${OPEX_TABS_STORAGE_KEY}:c1:u1`)).toEqual({ [OPEX_DRAFT_TAB]: 'do portal' })
    expect(storedDrafts()).toEqual({})
  })

  it('celular (tela cheia): fechar pelo ícone do cabeçalho e reabrir mostra o texto', async () => {
    const width = window.innerWidth
    window.innerWidth = 500
    try {
      render(<AgentChatNavItem variant="header" />, { wrapper })
      await openPopover('agent-header-item')
      type('no celular')
      fireEvent.click(screen.getByTestId('agent-header-item'))
      await closed()
      await openPopover('agent-header-item')
      expect(field().value).toBe('no celular')
    } finally {
      window.innerWidth = width
    }
  })

  it('cada aba de sessão volta com o seu texto', async () => {
    mocks.sessions.opex = [{ id: 's1', status: 'idle', title: 'um' }, { id: 's2', status: 'idle', title: 'dois' }]
    window.localStorage.setItem(OPEX_TABS_STORAGE_KEY, JSON.stringify({ open: ['s1', 's2'], active: 's1' }))
    renderItem()
    await openPopover()
    type('texto da s1')
    fireEvent.click(screen.getByRole('button', { name: 'aba s2' }))
    await screen.findByTestId('chat-s2')
    expect(field().value).toBe('')
    type('texto da s2')
    fireEvent.keyDown(field(), { key: 'Escape' })
    await closed()
    await openPopover()
    expect(field().value).toBe('texto da s2')
    fireEvent.click(screen.getByRole('button', { name: 'aba s1' }))
    await screen.findByTestId('chat-s1')
    expect(field().value).toBe('texto da s1')
  })

  it('anexar na "Nova sessão" leva o texto para a sessão criada, que o mantém depois de fechar', async () => {
    mocks.sessions.opex = [{ id: 's9', status: 'idle', title: 'nova' }]
    renderItem()
    await openPopover()
    type('veja o arquivo')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    await screen.findByTestId('chat-s9')
    expect(field().value).toBe('veja o arquivo')
    expect(mocks.enqueue).toHaveBeenCalled()
    expect(storedDrafts()).toEqual({ s9: 'veja o arquivo' })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await closed()
    await openPopover()
    expect(field().value).toBe('veja o arquivo')
  })

  it('OPE-198: Ctrl+O com a "Nova sessão" já ativa mantém o texto e devolve o foco ao campo', async () => {
    renderItem()
    await openPopover()
    type('rascunho')
    screen.getByRole('button', { name: 'Nova sessão' }).focus()
    expect(document.activeElement).not.toBe(field())
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true })
    await waitFor(() => expect(document.activeElement).toBe(field()))
    expect(field().value).toBe('rascunho')
  })

  it('OPE-198: Ctrl+O numa sessão aberta mostra o campo da "Nova sessão" com foco', async () => {
    mocks.sessions.opex = [{ id: 's1', status: 'idle', title: 'um' }]
    window.localStorage.setItem(OPEX_TABS_STORAGE_KEY, JSON.stringify({ open: ['s1'], active: 's1' }))
    renderItem()
    await openPopover()
    await screen.findByTestId('chat-s1')
    fireEvent.keyDown(field(), { key: 'o', ctrlKey: true })
    await waitFor(() => expect(screen.queryByTestId('chat-s1')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(field()))
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('enviar na "Nova sessão": ao reabrir o campo está vazio', async () => {
    mocks.sessions.opex = [{ id: 's9', status: 'idle', title: 'nova' }]
    renderItem()
    await openPopover()
    type('primeira mensagem')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ text: 'primeira mensagem' }), expect.anything())
    await screen.findByTestId('chat-s9')
    fireEvent.keyDown(field(), { key: 'Escape' })
    await closed()
    await openPopover()
    expect(field().value).toBe('')
    expect(storedDrafts()).toEqual({})
  })
})
