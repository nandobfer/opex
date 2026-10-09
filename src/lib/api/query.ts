/**
 * Leitura de query string para os schemas Zod das rotas: listas aceitam o parâmetro repetido
 * (`?filial=a&filial=b`) ou separado por vírgula (`?filial=a,b`); vazios são ignorados.
 */
export function queryToObject(searchParams: URLSearchParams, arrayKeys: readonly string[] = []): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of new Set(searchParams.keys())) {
        if (arrayKeys.includes(key)) {
            const values = searchParams
                .getAll(key)
                .flatMap((value) => value.split(","))
                .map((value) => value.trim())
                .filter(Boolean)
            if (values.length) result[key] = values
            continue
        }
        const value = searchParams.get(key)
        if (value !== null && value !== "") result[key] = value
    }
    return result
}
