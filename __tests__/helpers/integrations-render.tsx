/**
 * Telas que usam a central de integrações (`@nandobfer/integracoes/react`): o `render`/`renderHook`
 * da Testing Library já dentro do `IntegrationsProvider` (registro do Opex) e de um
 * `QueryClientProvider`, como no layout do app. Importe este arquivo antes dos demais.
 *
 * A central é carregada no `beforeAll` (depois dos imports do teste): carregá-la antes faria o
 * `framer-motion` e outros módulos simulados pelo teste serem avaliados cedo demais.
 */
import { createElement, type ComponentType, type ReactNode } from 'react'

type Loaded = {
  QueryClient: typeof import('@tanstack/react-query').QueryClient
  QueryClientProvider: ComponentType<{ client: unknown; children: ReactNode }>
  IntegrationsProvider: ComponentType<Record<string, unknown>>
  registry: unknown
  api: unknown
}
const central: { loaded?: Loaded } = vi.hoisted(() => ({}))

function readApi(http: Record<string, unknown>): unknown {
  try {
    if (http.api) return http.api
  } catch {
    // mock sem `api`
  }
  const refuse = async () => {
    throw new Error('sem cliente HTTP no teste')
  }
  return { get: refuse, post: refuse, put: refuse, patch: refuse, delete: refuse }
}

beforeAll(async () => {
  const [query, react, definitions, http] = await Promise.all([
    import('@tanstack/react-query'),
    import('@nandobfer/integracoes/react'),
    import('@/features/integrations/registry/definitions'),
    import('@/lib/api'),
  ])
  central.loaded = {
    QueryClient: query.QueryClient,
    QueryClientProvider: query.QueryClientProvider as never,
    IntegrationsProvider: react.IntegrationsProvider as never,
    registry: definitions.integrationsRegistry,
    // `@/lib/api` parcial no teste (sem `api`): a central recebe um cliente que recusa as chamadas.
    api: readApi(http as unknown as Record<string, unknown>) as never,
  }
})

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>()
  function Wrapper({ children }: { children: ReactNode }) {
    const loaded = central.loaded
    if (!loaded) return children
    const client = new loaded.QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return createElement(loaded.QueryClientProvider, { client }, createElement(loaded.IntegrationsProvider, { registry: loaded.registry, api: loaded.api }, children))
  }
  const withWrapper = <O extends { wrapper?: unknown } | undefined>(options: O) => (options?.wrapper ? options : { ...options, wrapper: Wrapper })
  return {
    ...actual,
    render: ((ui: Parameters<typeof actual.render>[0], options?: Parameters<typeof actual.render>[1]) => actual.render(ui, withWrapper(options) as never)) as typeof actual.render,
    renderHook: ((hook: (props: unknown) => unknown, options?: Record<string, unknown>) => actual.renderHook(hook, withWrapper(options) as never)) as typeof actual.renderHook,
  }
})
