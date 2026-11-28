// MONGODB_URI dummy: satisfaz o guard no topo de src/lib/db/connection.ts (que lança
// se a variável não existir) quando a cadeia de imports de um teste alcança o módulo
// de DB. Os testes que exercitam o banco fazem vi.mock('@/lib/db'), então nada conecta
// de fato — este valor só destrava o carregamento do módulo. ??= respeita um valor real
// já exportado pelo ambiente (CI/dev).
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/opex-test'

// A configuração das integrações (`@nandobfer/integracoes`) vem do banco com fallback para o `.env`.
// Nos testes, a central não tem configuração salva — todos os consumidores leem `process.env` e os
// padrões dos campos, e nada tenta conectar ao Mongo (ver `src/lib/integrations/runtime.ts`).
process.env.OPEX_INTEGRATIONS_STORE ??= 'memory'

// O runtime da central é criado pelo `src/lib/integrations/runtime.ts` (no app, o `instrumentation.ts`
// o importa no boot). Num teste que alcança o servidor da biblioteca, ele é ligado antes de cada caso —
// por import dinâmico, depois dos `vi.mock` do arquivo, que então valem para as dependências injetadas.
beforeEach(async () => {
  const marks = globalThis as Record<symbol, unknown>
  if (!marks[Symbol.for('@nandobfer/integracoes/server-loaded')] || marks[Symbol.for('@nandobfer/integracoes/server-runtime')]) return
  await import('@/lib/integrations/runtime').catch(() => undefined)
})


// Agente Adversário: o fluxo da mesa consulta a configuração (banco) ao fim de toda implementação e ao
// montar a mesa. Nos testes ele fica de fora por padrão; os testes do adversário redefinem este mock.
vi.mock('@/features/adversarial-agent/server/workflow-hook', () => ({
  adversaryApplies: vi.fn(async () => false),
  adversaryAgent: vi.fn(async () => null),
  runAdversaryRound: vi.fn(),
  prepareUserFix: vi.fn(),
  recordRerun: vi.fn(),
  recordSkip: vi.fn(),
  restoreAwaiting: vi.fn(),
  failOrphanReviews: vi.fn(async () => undefined),
  removeWorkbenchReviewSessions: vi.fn(async () => undefined),
  // Agente Mentor (OPE-165): aprende só na conclusão da mesa; inativo por padrão.
  mentorOnDone: vi.fn(async () => null),
}))

// Agente Arquiteto: paralelo à mesa (plano pronto, aprovação, exclusão e DTO). Fica de fora por padrão; os
// testes do arquiteto redefinem este mock.
vi.mock('@/features/architect-agent/server/workflow-hook', () => ({
  onPlanApproved: vi.fn(async () => undefined),
  onPlanReady: vi.fn(async () => undefined),
  cleanupWorkbenchDiagrams: vi.fn(async () => undefined),
  workbenchArchitect: vi.fn(async () => ({ applies: false, planVersion: null })),
}))

// O Framer Motion usa as animações nativas do happy-dom: quando um componente desmonta no meio
// da animação, o cancelamento rejeita uma promise fora do teste ("AbortError: The animation
// was canceled.") e o Vitest derruba o run inteiro. `skipAnimations` faz o motion ir direto ao
// estado final, sem criar `Animation` do DOM — e deixa os testes de UI mais rápidos.
// O import fica restrito aos ambientes de DOM: testes de node não pagam esse grafo.
if (typeof window !== 'undefined') {
  const { MotionGlobalConfig } = await import('framer-motion')
  MotionGlobalConfig.skipAnimations = true
}

// Silencia console durante os testes — use DEBUG=1 para ver logs
if (!process.env.DEBUG) {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

// Polyfill de localStorage/sessionStorage para os ambientes de DOM (happy-dom/jsdom), que
// expõem `window` mas podem não ter `window.localStorage` funcional (o jsdom exige a flag
// --localstorage-file do Node). Componentes que usam `window.localStorage` dependem disso. Redefine quando ausente
// ou incompleto, preservando uma implementação real e funcional do ambiente.
const storageUsable = (value: unknown): value is Storage =>
  typeof value === 'object' && value !== null && typeof (value as Storage).getItem === 'function' && typeof (value as Storage).clear === 'function'

if (typeof window !== 'undefined' && !storageUsable(window.localStorage)) {
  const createMemoryStorage = (): Storage => {
    const store = new Map<string, string>()
    return {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => {
        store.delete(key)
      },
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
    } as Storage
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  })
  if (!storageUsable(window.sessionStorage)) {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createMemoryStorage(),
    })
  }
}

// O DOM de teste pode não ter ResizeObserver; componentes Radix (ex.: Slider) o usam para medir o polegar.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
}
