/**
 * `@opex/api` nos testes: axios falso. Configure com `mockApi(method, url, data)` (de
 * `@opex/plugin-sdk/testing`); chamada sem resposta configurada rejeita com erro claro.
 */
const handlers = new Map()
export const calls = []

export function setApiResponse(method, url, data) {
    handlers.set(`${method.toUpperCase()} ${url}`, data)
}

export function resetApi() {
    handlers.clear()
    calls.length = 0
}

function request(method) {
    return async (url, ...rest) => {
        const body = method === "GET" || method === "DELETE" ? undefined : rest[0]
        calls.push({ method, url, body })
        const key = `${method} ${url}`
        if (!handlers.has(key)) throw new Error(`Sem resposta configurada para ${key} (use mockApi)`)
        const value = handlers.get(key)
        return { data: typeof value === "function" ? await value(body) : value }
    }
}

export const api = { get: request("GET"), post: request("POST"), put: request("PUT"), patch: request("PATCH"), delete: request("DELETE") }
export default api
