/**
 * Avaliação local de um pipeline de agregação do Mongo, só com os operadores que o app usa nos testes (OPE-205,
 * `cacheRatePipeline`). Operador desconhecido lança erro: um pipeline que passe a usar outro operador falha aqui
 * em vez de passar sem ser avaliado. Semântica conferida contra o MongoDB real (mesmos casos, mesmo resultado).
 */

type Doc = Record<string, unknown>

const isPlainObject = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function get(doc: Doc, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (!isPlainObject(current)) return undefined
    current = current[key]
  }
  return current
}

/** Expressão de agregação (`$campo`, literais e os operadores abaixo). */
function evaluate(expression: unknown, doc: Doc): unknown {
  if (typeof expression === 'string') return expression.startsWith('$') ? (get(doc, expression.slice(1)) ?? null) : expression
  if (!isPlainObject(expression)) return expression
  const [operator, ...rest] = Object.keys(expression)
  if (!operator || rest.length || !operator.startsWith('$')) throw new Error(`Expressão não suportada: ${JSON.stringify(expression)}`)
  const args = expression[operator]
  const list = (Array.isArray(args) ? args : [args]).map((arg) => arg)
  switch (operator) {
    case '$isNumber':
      return isNumber(evaluate(args, doc))
    case '$and':
      return list.every((arg) => Boolean(evaluate(arg, doc)))
    case '$cond': {
      const [condition, then, otherwise] = list
      return evaluate(condition, doc) ? evaluate(then, doc) : evaluate(otherwise, doc)
    }
    case '$add': {
      const values = list.map((arg) => evaluate(arg, doc))
      // Mongo: qualquer operando nulo ou ausente dá null.
      return values.some((value) => value === null || value === undefined) ? null : values.reduce<number>((sum, value) => sum + (value as number), 0)
    }
    default:
      throw new Error(`Operador de expressão não suportado: ${operator}`)
  }
}

/** Condição de `$match` de um campo (`$in`, `$type: "number"`, `$gt`, `$gte`, `$lte` ou igualdade). */
function matchesField(value: unknown, condition: unknown): boolean {
  if (!isPlainObject(condition)) return value === condition
  return Object.entries(condition).every(([operator, operand]) => {
    switch (operator) {
      case '$in':
        return (operand as unknown[]).includes(value)
      case '$type':
        if (operand !== 'number') throw new Error(`$type não suportado: ${String(operand)}`)
        return isNumber(value)
      // Comparação com tipos diferentes não casa (type bracketing do Mongo).
      case '$gt':
        return isNumber(value) && isNumber(operand) ? value > operand : value instanceof Date && operand instanceof Date ? value > operand : false
      case '$gte':
        return value instanceof Date && operand instanceof Date ? value >= operand : isNumber(value) && isNumber(operand) && value >= operand
      case '$lte':
        return value instanceof Date && operand instanceof Date ? value <= operand : isNumber(value) && isNumber(operand) && value <= operand
      default:
        throw new Error(`Operador de $match não suportado: ${operator}`)
    }
  })
}

function group(docs: Doc[], spec: Doc): Doc[] {
  if (spec._id !== null) throw new Error('Só $group com _id: null')
  if (!docs.length) return []
  const out: Doc = { _id: null }
  for (const [field, accumulator] of Object.entries(spec)) {
    if (field === '_id') continue
    if (!isPlainObject(accumulator) || !('$sum' in accumulator) || Object.keys(accumulator).length !== 1) throw new Error(`Acumulador não suportado: ${field}`)
    // `$sum` ignora o que não for número.
    out[field] = docs.reduce<number>((sum, doc) => {
      const value = evaluate(accumulator.$sum, doc)
      return isNumber(value) ? sum + value : sum
    }, 0)
  }
  return [out]
}

export function runPipeline(docs: readonly Doc[], pipeline: readonly Doc[]): Doc[] {
  let current = docs.map((doc) => ({ ...doc }))
  for (const stage of pipeline) {
    const [name, ...rest] = Object.keys(stage)
    if (!name || rest.length) throw new Error(`Estágio inválido: ${JSON.stringify(stage)}`)
    const spec = stage[name] as Doc
    if (name === '$match') current = current.filter((doc) => Object.entries(spec).every(([path, condition]) => matchesField(get(doc, path), condition)))
    else if (name === '$project') current = current.map((doc) => Object.fromEntries([['_id', doc._id], ...Object.entries(spec).map(([field, expression]) => [field, evaluate(expression, doc)])]))
    else if (name === '$group') current = group(current, spec)
    else throw new Error(`Estágio não suportado: ${name}`)
  }
  return current
}
