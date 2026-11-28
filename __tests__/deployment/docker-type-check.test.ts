import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

// O build da imagem separa o type check do `next build`: dentro dele, o tsc somava a memória do
// compilador e estourava a RAM do runner ("cannot allocate memory"), derrubando todo CD/preview.
const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8')

const loadNextConfig = async (separateTypeCheck: string | undefined) => {
  if (separateTypeCheck === undefined) delete process.env.OPEX_SEPARATE_TYPE_CHECK
  else process.env.OPEX_SEPARATE_TYPE_CHECK = separateTypeCheck
  vi.resetModules()
  const config = (await import('../../next.config')).default
  return config
}

describe('build da imagem: type check fora do next build', () => {
  afterEach(() => {
    delete process.env.OPEX_SEPARATE_TYPE_CHECK
    vi.resetModules()
  })

  it('o Dockerfile desliga o type check do next build e roda o tsc em seguida', () => {
    const build = dockerfile.indexOf('RUN pnpm run build')
    const typeCheck = dockerfile.indexOf('RUN pnpm exec tsc --noEmit')

    expect(dockerfile).toContain('ENV OPEX_SEPARATE_TYPE_CHECK=1')
    expect(build).toBeGreaterThan(-1)
    expect(typeCheck).toBeGreaterThan(build)
  })

  it('o next build ignora os erros de tipo só quando o build da imagem pede', async () => {
    expect((await loadNextConfig('1')).typescript?.ignoreBuildErrors).toBe(true)
  })

  it('fora do build da imagem o next build continua checando os tipos', async () => {
    const config = await loadNextConfig(undefined)
    expect(config.typescript?.ignoreBuildErrors).toBe(false)
  })
})
