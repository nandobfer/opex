// MONGODB_URI dummy: satisfaz o guard no topo de src/lib/db/connection.ts (que lança
// se a variável não existir) quando a cadeia de imports de um teste alcança o módulo
// de DB. Os testes que exercitam o banco fazem vi.mock('@/lib/db'), então nada conecta
// de fato — este valor só destrava o carregamento do módulo. ??= respeita um valor real
// já exportado pelo ambiente (CI/dev).
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/opex-test'

// A configuração das integrações vem do banco com fallback para o `.env`. Nos
// testes, o store fica vazio por padrão — todos os consumidores leem `process.env` como antes
// e nada tenta conectar ao Mongo. Testes do próprio store/resolvedor redefinem este mock.
vi.mock('@/lib/integrations/store', () => ({
  INTEGRATION_CACHE_TTL_MS: 30_000,
  loadStoredIntegrations: vi.fn(async () => new Map()),
  loadStoredIntegration: vi.fn(async () => null),
  invalidateStoredIntegrations: vi.fn(),
}))

// Silencia console durante os testes — use DEBUG=1 para ver logs
if (!process.env.DEBUG) {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

// Polyfill de localStorage/sessionStorage para o ambiente jsdom desta versão do
// vitest, que expõe `window` mas não `window.localStorage` (exige a flag
// --localstorage-file do Node). Componentes que usam `@/lib/browser-storage`
// dependem
// disso em testes com `@vitest-environment jsdom`. Só define quando ausente,
// preservando qualquer implementação real do ambiente.
if (typeof window !== 'undefined' && !window.localStorage) {
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
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: createMemoryStorage(),
  })
}

// jsdom não tem ResizeObserver; componentes Radix (ex.: Slider) o usam para medir o polegar.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
}
