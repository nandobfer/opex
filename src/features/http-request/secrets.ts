/**
 * Segredos na "Chamada HTTP" (OPE-130, módulo PURO): `{{secret:NOME}}` na URL, na query, nos cabeçalhos
 * e no corpo é trocado pelo valor **só no servidor**, na hora do envio; tudo o que volta ao modelo
 * (corpo, cabeçalhos, URL final, mensagens de erro) é mascarado de volta para `{{secret:NOME}}`, nas
 * formas literal, codificada para URL e base64 (padrão e URL-safe). Um segredo transformado de outro
 * jeito pelo destino (hash, por exemplo) não é reconhecido — limitação documentada.
 */

export const SECRET_PLACEHOLDER = /\{\{\s*secret:([A-Z][A-Z0-9_]{1,63})\s*\}\}/g

/** Valores mais curtos não são mascarados (casariam com qualquer texto): o cadastro exige este mínimo. */
export const MIN_MASKABLE_SECRET_LENGTH = 4

export const placeholderOf = (name: string) => `{{secret:${name}}}`

/** Nomes de segredo usados em qualquer string do valor (recursivo). */
export function collectSecretNames(value: unknown, into = new Set<string>()): Set<string> {
    if (typeof value === "string") for (const match of value.matchAll(SECRET_PLACEHOLDER)) into.add(match[1]!)
    else if (Array.isArray(value)) for (const item of value) collectSecretNames(item, into)
    else if (value && typeof value === "object")
        for (const [key, item] of Object.entries(value)) {
            collectSecretNames(key, into)
            collectSecretNames(item, into)
        }
    return into
}

/** Troca os marcadores pelos valores (recursivo, inclusive dentro de JSON). */
export function substituteSecrets<T>(value: T, values: ReadonlyMap<string, string>): T {
    if (typeof value === "string") return value.replace(SECRET_PLACEHOLDER, (whole, name: string) => values.get(name) ?? whole) as T
    if (Array.isArray(value)) return value.map((item) => substituteSecrets(item, values)) as T
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [substituteSecrets(key, values), substituteSecrets(item, values)])) as T
    return value
}

/** Host (com porta, se houver) permitido pela lista: vazia = qualquer; `*.x.com` vale para subdomínios e o próprio `x.com`. */
export function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
    if (!allowedHosts.length) return true
    const target = host.toLowerCase()
    const bare = target.replace(/:\d+$/, "")
    return allowedHosts.some((rule) => {
        const value = rule.toLowerCase()
        const candidate = /:\d+$/.test(value) ? target : bare
        if (value.startsWith("*.")) {
            const root = value.slice(2)
            return candidate === root || candidate.endsWith(`.${root}`)
        }
        return candidate === value
    })
}

const base64Url = (value: string) => value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** Formas reconhecidas de cada valor (mais longas primeiro, para não mascarar pela metade). */
function maskForms(secrets: readonly { name: string; value: string }[]): { form: string; name: string }[] {
    const forms: { form: string; name: string }[] = []
    for (const { name, value } of secrets) {
        if (value.length < MIN_MASKABLE_SECRET_LENGTH) continue
        const b64 = Buffer.from(value, "utf8").toString("base64")
        for (const form of new Set([value, encodeURIComponent(value), b64, b64.replace(/=+$/, ""), base64Url(b64)])) if (form.length >= MIN_MASKABLE_SECRET_LENGTH) forms.push({ form, name })
    }
    return forms.sort((a, b) => b.form.length - a.form.length)
}

export function maskSecretText(text: string, secrets: readonly { name: string; value: string }[]): string {
    let result = text
    for (const { form, name } of maskForms(secrets)) if (result.includes(form)) result = result.split(form).join(placeholderOf(name))
    return result
}

/** Mascara recursivamente (strings, chaves, listas e objetos). */
export function maskSecrets<T>(value: T, secrets: readonly { name: string; value: string }[]): T {
    if (!secrets.length) return value
    if (typeof value === "string") return maskSecretText(value, secrets) as T
    if (Array.isArray(value)) return value.map((item) => maskSecrets(item, secrets)) as T
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [maskSecretText(key, secrets), maskSecrets(item, secrets)])) as T
    return value
}
