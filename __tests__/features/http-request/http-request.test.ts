import { describe, expect, it, vi } from 'vitest'
import { executeHttpRequest, HttpRequestError } from '@/features/http-request/execute'
import { httpRequestInputSchema, type HttpSecretVault } from '@/features/http-request/schemas'
import { collectSecretNames, hostAllowed, maskSecrets, substituteSecrets } from '@/features/http-request/secrets'

/**
 * "Chamada HTTP" (OPE-130, D6/D7): requisição generalizada com controle completo e segredos
 * `{{secret:NOME}}` trocados só no envio e mascarados em tudo o que volta. `fetch` sempre simulado.
 */

const SECRET = 'tok_SuperSecreto_123'
type Call = { url: string; method: string; headers: Headers; body: BodyInit | null | undefined }

function fakeFetch(responses: (Response | ((call: Call) => Response) | Error)[]) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: URL | string, init: RequestInit) => {
    const call = { url: String(url), method: String(init.method), headers: new Headers(init.headers), body: init.body }
    calls.push(call)
    const next = responses.shift()
    if (!next) throw new Error('sem resposta simulada')
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next(call) : next
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

function vault(entries: { name: string; value: string; allowedHosts?: string[] }[], used: string[][] = []): HttpSecretVault {
  return {
    list: () => entries.map((entry) => ({ name: entry.name, description: '', allowedHosts: entry.allowedHosts ?? [] })),
    value: (name) => entries.find((entry) => entry.name === name)?.value,
    markUsed: (names) => void used.push(names),
  }
}

const input = (raw: Record<string, unknown>) => httpRequestInputSchema.parse(raw)

describe('núcleo de segredos', () => {
  it('coleta, substitui (inclusive em JSON e chaves) e mascara literal, URL e base64', () => {
    expect([...collectSecretNames({ a: ['x {{secret:A_1}}'], '{{secret:B_2}}': 1 })]).toEqual(['A_1', 'B_2'])
    const values = new Map([['A_1', 'v1']])
    expect(substituteSecrets({ deep: { token: 'Bearer {{secret:A_1}}' } }, values)).toEqual({ deep: { token: 'Bearer v1' } })
    const secrets = [{ name: 'TOKEN', value: 'a b/c+d=' }]
    const b64 = Buffer.from('a b/c+d=').toString('base64')
    expect(maskSecrets({ raw: 'x a b/c+d= y', url: `q=${encodeURIComponent('a b/c+d=')}`, b64 }, secrets)).toEqual({ raw: 'x {{secret:TOKEN}} y', url: 'q={{secret:TOKEN}}', b64: '{{secret:TOKEN}}' })
  })

  it('domínio permitido: exato, curinga e lista vazia', () => {
    expect(hostAllowed('api.x.com', [])).toBe(true)
    expect(hostAllowed('api.x.com', ['api.x.com'])).toBe(true)
    expect(hostAllowed('a.gupy.io', ['*.gupy.io'])).toBe(true)
    expect(hostAllowed('gupy.io', ['*.gupy.io'])).toBe(true)
    expect(hostAllowed('evil.com', ['*.gupy.io'])).toBe(false)
    expect(hostAllowed('api.x.com:8443', ['api.x.com'])).toBe(true)
  })
})

describe('executeHttpRequest', () => {
  it('monta método, query, cabeçalhos e corpo json; devolve status, cabeçalhos (set-cookie em lista) e JSON', async () => {
    const headers = new Headers({ 'content-type': 'application/json', 'x-id': '7' })
    headers.append('set-cookie', 'a=1')
    headers.append('set-cookie', 'b=2')
    const { impl, calls } = fakeFetch([new Response(JSON.stringify({ ok: 1 }), { status: 201, statusText: 'Created', headers })])
    const result = await executeHttpRequest(input({ method: 'POST', url: 'https://api.x.com/v1/items', query: { page: '2' }, headers: { 'User-Agent': 'opex', Cookie: 's=1' }, body: { type: 'json', value: { n: 1 } } }), { fetchImpl: impl })
    expect(calls[0]!.url).toBe('https://api.x.com/v1/items?page=2')
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.headers.get('content-type')).toBe('application/json')
    expect(calls[0]!.headers.get('cookie')).toBe('s=1')
    expect(calls[0]!.body).toBe('{"n":1}')
    expect(result).toMatchObject({ ok: true, status: 201, statusText: 'Created', bodyType: 'json', body: { ok: 1 }, truncated: false })
    expect(result.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(result.headers['x-id']).toBe('7')
  })

  it('corpos form, text, base64 e multipart', async () => {
    const { impl, calls } = fakeFetch([new Response('ok'), new Response('ok'), new Response('ok'), new Response('ok')])
    await executeHttpRequest(input({ method: 'POST', url: 'https://x.com', body: { type: 'form', fields: { a: '1', b: 'x y' } } }), { fetchImpl: impl })
    await executeHttpRequest(input({ method: 'PUT', url: 'https://x.com', body: { type: 'text', value: '<a/>', contentType: 'application/xml' } }), { fetchImpl: impl })
    await executeHttpRequest(input({ method: 'PATCH', url: 'https://x.com', body: { type: 'base64', value: Buffer.from('bin').toString('base64') } }), { fetchImpl: impl })
    await executeHttpRequest(input({ method: 'POST', url: 'https://x.com', headers: { 'Content-Type': 'multipart/form-data' }, body: { type: 'multipart', fields: { a: '1' }, files: [{ field: 'cv', filename: 'cv.pdf', base64: Buffer.from('pdf').toString('base64') }] } }), { fetchImpl: impl })
    expect(calls[0]!.body).toBe('a=1&b=x+y')
    expect(calls[0]!.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(calls[1]!.headers.get('content-type')).toBe('application/xml')
    expect(Buffer.from(calls[2]!.body as Uint8Array).toString()).toBe('bin')
    expect(calls[3]!.body).toBeInstanceOf(FormData)
    expect(calls[3]!.headers.get('content-type')).toBeNull()
  })

  it('4xx/5xx não é erro: volta com ok=false e o corpo', async () => {
    const { impl } = fakeFetch([new Response('não encontrado', { status: 404, headers: { 'content-type': 'text/plain' } })])
    expect(await executeHttpRequest(input({ url: 'https://x.com/a' }), { fetchImpl: impl })).toMatchObject({ ok: false, status: 404, bodyType: 'text', body: 'não encontrado' })
  })

  it('segue redirecionamento (303 vira GET; Authorization sai em outra origem) ou devolve o 3xx sem seguir', async () => {
    const { impl, calls } = fakeFetch([new Response(null, { status: 303, headers: { location: 'https://other.com/done' } }), new Response('fim')])
    const followed = await executeHttpRequest(input({ method: 'POST', url: 'https://x.com/a', headers: { Authorization: 'Bearer x' }, body: { type: 'text', value: 'oi' } }), { fetchImpl: impl })
    expect(followed).toMatchObject({ redirected: true, url: 'https://other.com/done', body: 'fim' })
    expect(calls[1]!.method).toBe('GET')
    expect(calls[1]!.headers.get('authorization')).toBeNull()
    const manual = fakeFetch([new Response(null, { status: 302, headers: { location: '/b' } })])
    const result = await executeHttpRequest(input({ url: 'https://x.com/a', followRedirects: false }), { fetchImpl: manual.impl })
    expect(result).toMatchObject({ status: 302, redirected: false, headers: { location: '/b' } })
  })

  it('corta no maxResponseBytes; responseType base64 e none; binário em auto vira base64', async () => {
    const { impl } = fakeFetch([new Response('0123456789'), new Response('abc'), new Response('abc'), new Response(new Uint8Array([0, 159, 146, 150, 1]), { headers: { 'content-type': 'image/png' } })])
    expect(await executeHttpRequest(input({ url: 'https://x.com', maxResponseBytes: 4 }), { fetchImpl: impl })).toMatchObject({ body: '0123', bytes: 4, truncated: true })
    expect(await executeHttpRequest(input({ url: 'https://x.com', responseType: 'base64' }), { fetchImpl: impl })).toMatchObject({ bodyType: 'base64', body: Buffer.from('abc').toString('base64') })
    expect(await executeHttpRequest(input({ url: 'https://x.com', responseType: 'none' }), { fetchImpl: impl })).toMatchObject({ bodyType: 'none', body: null })
    expect(await executeHttpRequest(input({ url: 'https://x.com' }), { fetchImpl: impl })).toMatchObject({ bodyType: 'base64' })
  })

  it('erro de DNS e tempo limite viram mensagens em pt-BR; GET com corpo é recusado', async () => {
    const dns = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.x.com' } })
    await expect(executeHttpRequest(input({ url: 'https://api.x.com' }), { fetchImpl: fakeFetch([dns]).impl })).rejects.toThrow('Não foi possível resolver o endereço api.x.com')
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    await expect(executeHttpRequest(input({ url: 'https://api.x.com', timeoutSeconds: 5 }), { fetchImpl: fakeFetch([timeout]).impl })).rejects.toThrow('A requisição passou de 5 s')
    await expect(executeHttpRequest(input({ url: 'https://x.com', body: { type: 'text', value: 'a' } }), { fetchImpl: fakeFetch([]).impl })).rejects.toThrow('Requisições GET não aceitam corpo')
  })
})

describe('segredos na chamada', () => {
  it('troca o marcador só no envio e mascara o valor ecoado no corpo, nos cabeçalhos e na URL; registra o uso', async () => {
    const used: string[][] = []
    const echo = (call: Call) => new Response(JSON.stringify({ auth: call.headers.get('authorization'), b64: Buffer.from(SECRET).toString('base64') }), { headers: { 'content-type': 'application/json', 'x-echo': SECRET } })
    const { impl, calls } = fakeFetch([echo])
    const result = await executeHttpRequest(input({ url: 'https://api.x.com/?k={{secret:TOKEN}}', headers: { Authorization: 'Bearer {{secret:TOKEN}}' } }), { fetchImpl: impl, secrets: vault([{ name: 'TOKEN', value: SECRET }], used) })
    expect(calls[0]!.headers.get('authorization')).toBe(`Bearer ${SECRET}`)
    expect(calls[0]!.url).toContain(SECRET)
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(JSON.stringify(result)).not.toContain(Buffer.from(SECRET).toString('base64'))
    expect(result.body).toEqual({ auth: 'Bearer {{secret:TOKEN}}', b64: '{{secret:TOKEN}}' })
    expect(result.headers['x-echo']).toBe('{{secret:TOKEN}}')
    expect(result.url).toBe('https://api.x.com/?k={{secret:TOKEN}}')
    expect(used).toEqual([['TOKEN']])
  })

  it('segredo inexistente é recusado sem enviar nada, listando os disponíveis', async () => {
    const { impl, calls } = fakeFetch([])
    await expect(executeHttpRequest(input({ url: 'https://x.com', headers: { A: '{{secret:NAO_EXISTE}}' } }), { fetchImpl: impl, secrets: vault([{ name: 'TOKEN', value: SECRET }]) })).rejects.toThrow('O segredo NAO_EXISTE não existe neste agente. Disponíveis: TOKEN')
    expect(calls).toHaveLength(0)
  })

  it('domínio fora do permitido é recusado; redirecionamento para fora não é seguido', async () => {
    const secrets = vault([{ name: 'TOKEN', value: SECRET, allowedHosts: ['api.x.com'] }])
    const blocked = fakeFetch([])
    await expect(executeHttpRequest(input({ url: 'https://evil.com', headers: { A: '{{secret:TOKEN}}' } }), { fetchImpl: blocked.impl, secrets })).rejects.toThrow('O segredo TOKEN só pode ser usado em api.x.com')
    expect(blocked.calls).toHaveLength(0)
    const redirect = fakeFetch([new Response(null, { status: 302, headers: { location: 'https://evil.com/steal' } })])
    const result = await executeHttpRequest(input({ url: 'https://api.x.com', headers: { A: '{{secret:TOKEN}}' } }), { fetchImpl: redirect.impl, secrets })
    expect(redirect.calls).toHaveLength(1)
    expect(result).toMatchObject({ status: 302, warning: expect.stringContaining('não seguido') })
  })

  it('segredo sem domínios: redirecionamento para outra origem não reenvia cabeçalho customizado nem corpo', async () => {
    const secrets = vault([{ name: 'API_KEY', value: SECRET }])
    const redirect = fakeFetch([new Response(null, { status: 307, headers: { location: 'https://outro-dominio.example/x' } })])
    const result = await executeHttpRequest(input({ method: 'POST', url: 'https://api.x.com/a', headers: { 'X-Api-Key': '{{secret:API_KEY}}' }, body: { type: 'json', value: { token: '{{secret:API_KEY}}' } } }), { fetchImpl: redirect.impl, secrets })
    expect(redirect.calls).toHaveLength(1)
    expect(redirect.calls[0]!.url).toBe('https://api.x.com/a')
    expect(result).toMatchObject({ status: 307, redirected: false, warning: expect.stringContaining('sem domínios permitidos') })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('segredo sem domínios: redirecionamento na mesma origem continua sendo seguido', async () => {
    const secrets = vault([{ name: 'API_KEY', value: SECRET }])
    const redirect = fakeFetch([new Response(null, { status: 307, headers: { location: '/b' } }), new Response('ok', { status: 200 })])
    const result = await executeHttpRequest(input({ url: 'https://api.x.com/a', headers: { 'X-Api-Key': '{{secret:API_KEY}}' } }), { fetchImpl: redirect.impl, secrets })
    expect(redirect.calls.map((call) => call.url)).toEqual(['https://api.x.com/a', 'https://api.x.com/b'])
    expect(result).toMatchObject({ status: 200, redirected: true })
  })

  it('sem cofre (Agente Opex no chat), {{secret:…}} é recusado', async () => {
    await expect(executeHttpRequest(input({ url: 'https://x.com', headers: { A: '{{secret:TOKEN}}' } }), { fetchImpl: fakeFetch([]).impl })).rejects.toBeInstanceOf(HttpRequestError)
    await expect(executeHttpRequest(input({ url: 'https://x.com', headers: { A: '{{secret:TOKEN}}' } }), { fetchImpl: fakeFetch([]).impl })).rejects.toThrow(/só existem nos agentes rotineiros/)
  })

  it('segredo curto demais para ser mascarado é recusado sem enviar; o cadastro exige o mínimo', async () => {
    const { impl, calls } = fakeFetch([])
    await expect(executeHttpRequest(input({ url: 'https://x.com', headers: { A: '{{secret:PIN}}' } }), { fetchImpl: impl, secrets: vault([{ name: 'PIN', value: '123' }]) })).rejects.toThrow(/curto demais/)
    expect(calls).toHaveLength(0)
    const { routineSecretCreateSchema, routineSecretUpdateSchema } = await import('@/features/routine-agents/schemas')
    const base = { name: 'PIN', description: '', allowedHosts: [] }
    expect(routineSecretCreateSchema.safeParse({ ...base, value: '123' }).error?.issues[0]?.message).toMatch(/no mínimo 4 caracteres/)
    expect(routineSecretCreateSchema.safeParse({ ...base, value: '1234' }).success).toBe(true)
    expect(routineSecretUpdateSchema.safeParse({ ...base, value: '' }).success).toBe(true)
    expect(routineSecretUpdateSchema.safeParse({ ...base, value: '12' }).success).toBe(false)
  })

  it('a mensagem de erro de rede também sai mascarada', async () => {
    const failure = Object.assign(new TypeError('fetch failed'), { cause: { code: 'X', message: `falhou com ${SECRET}` } })
    await expect(executeHttpRequest(input({ url: 'https://x.com', headers: { A: '{{secret:TOKEN}}' } }), { fetchImpl: fakeFetch([failure]).impl, secrets: vault([{ name: 'TOKEN', value: SECRET }]) })).rejects.toThrow('falhou com {{secret:TOKEN}}')
  })
})
