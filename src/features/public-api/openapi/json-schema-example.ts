/**
 * Exemplo de valor a partir de um JSON Schema (módulo PURO), para os exemplos da documentação
 * OpenAPI. Ordem: `default` → `examples[0]` → `const` → primeiro `enum` → modelo pelo tipo. Em
 * objetos, só os campos obrigatórios (o exemplo mínimo que valida).
 */

type Schema = Record<string, unknown>

const isObj = (value: unknown): value is Schema => typeof value === "object" && value !== null && !Array.isArray(value)
const MAX_DEPTH = 6

function typeOf(schema: Schema): string | undefined {
    const type = schema.type
    if (typeof type === "string") return type
    if (Array.isArray(type)) return type.find((item): item is string => typeof item === "string" && item !== "null")
    return undefined
}

function stringExample(schema: Schema): string {
    switch (schema.format) {
        case "date-time":
            return "2026-01-31T12:00:00.000Z"
        case "date":
            return "2026-01-31"
        case "email":
            return "nome@exemplo.com"
        case "uri":
        case "url":
            return "https://exemplo.com"
    }
    if (typeof schema.pattern === "string") {
        if (schema.pattern.includes("a-f0-9]{24}")) return "66f0c0ffee0000000000abcd"
        if (schema.pattern.includes("\\d{4}-\\d{2}-\\d{2}")) return "2026-01-31"
        if (schema.pattern.includes("\\d{2}:\\d{2}")) return "09:30"
    }
    const min = typeof schema.minLength === "number" ? schema.minLength : 0
    const base = "texto"
    return base.length >= min ? base : base.padEnd(min, "x")
}

export function exampleFromJsonSchema(schema: unknown, depth = 0): unknown {
    if (!isObj(schema) || depth > MAX_DEPTH) return null
    if ("default" in schema) return schema.default
    if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0]
    if ("const" in schema) return schema.const
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
        const options = schema[key]
        if (Array.isArray(options)) {
            const option = options.find((item) => isObj(item) && item.type !== "null") ?? options[0]
            return exampleFromJsonSchema(option, depth + 1)
        }
    }
    switch (typeOf(schema)) {
        case "object": {
            const properties = isObj(schema.properties) ? schema.properties : {}
            const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []
            return Object.fromEntries(required.filter((name) => name in properties).map((name) => [name, exampleFromJsonSchema(properties[name], depth + 1)]))
        }
        case "array": {
            const min = typeof schema.minItems === "number" ? schema.minItems : 0
            return min > 0 ? Array.from({ length: min }, () => exampleFromJsonSchema(schema.items, depth + 1)) : []
        }
        case "string":
            return stringExample(schema)
        case "integer":
        case "number":
            return typeof schema.minimum === "number" ? schema.minimum : typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum + 1 : 1
        case "boolean":
            return true
        case "null":
            return null
        default:
            return null
    }
}
