/**
 * Rotas da central de integrações nos testes: as antigas rotas estáticas (`/api/ai/providers/[provider]/keys`,
 * `/api/integrations/[id]/test`...) viraram dados dos adaptadores, servidos pelos catch-alls
 * (`src/app/api/<ponto>/[...path]/route.ts`). `legacyRoute` monta os handlers com a assinatura antiga
 * (`(req, { params })`) chamando o catch-all com o caminho preenchido pelos parâmetros.
 */
type Handler = (req: Request, ctx: { params: Promise<{ path?: string[] }> }) => Promise<Response>
type LegacyHandler = (req?: Request, ctx?: { params: Promise<Record<string, string>> | Record<string, string> }) => Promise<Response>

const CATCH_ALLS: Record<string, () => Promise<Record<string, Handler>>> = {
  integrations: () => import('@/app/api/integrations/[...path]/route') as never,
  ai: () => import('@/app/api/ai/[...path]/route') as never,
  opencode: () => import('@/app/api/opencode/[...path]/route') as never,
  'command-code': () => import('@/app/api/command-code/[...path]/route') as never,
}

export function legacyRoute(mount: keyof typeof CATCH_ALLS, pattern: string) {
  const call = (method: string): LegacyHandler => async (req, ctx) => {
    const params = (await ctx?.params) ?? {}
    const path = pattern.split('/').filter(Boolean).map((segment) => {
      const name = /^\[(.+)\]$/.exec(segment)?.[1]
      return name ? String(params[name]) : segment
    })
    const handlers = await CATCH_ALLS[mount]!()
    const request = req ?? new Request(`http://localhost/api/${mount}/${path.join('/')}`, { method })
    return handlers[method]!(request, { params: Promise.resolve({ path }) })
  }
  return { GET: call('GET'), POST: call('POST'), PUT: call('PUT'), PATCH: call('PATCH'), DELETE: call('DELETE') }
}
