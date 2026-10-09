import { describe, expect, it } from 'vitest'
import { suggestDeveloper } from '@/features/github/server/people'
import { repoLinkInputSchema } from '@/features/github/schemas'

const developers = [
  { id: '1', name: 'Fernando Fernandes', email: 'fernando.fernandes@sipal.com.br' },
  { id: '2', name: 'Ana Paula Souza', email: 'ana.souza@sipal.com.br' },
  { id: '3', name: 'José Lima', email: null },
]

describe('aba Pessoas: sugestão de correspondência', () => {
  it('e-mail público > nome completo > primeiro e último nome > login parecido com o e-mail', () => {
    expect(suggestDeveloper({ login: 'x', name: null, email: 'Ana.Souza@sipal.com.br' }, developers)).toMatchObject({ developerId: '2', reason: 'mesmo e-mail' })
    expect(suggestDeveloper({ login: 'jlima', name: 'Jose Lima', email: null }, developers)).toMatchObject({ developerId: '3', reason: 'mesmo nome' })
    expect(suggestDeveloper({ login: 'ana', name: 'Ana Souza', email: null }, developers)).toMatchObject({ developerId: '2', reason: 'primeiro e último nome' })
    expect(suggestDeveloper({ login: 'fernandofernandes', name: 'fernandofernandes', email: null }, developers)).toMatchObject({ developerId: '1', reason: 'login parecido com o e-mail' })
    expect(suggestDeveloper({ login: 'desconhecido', name: 'Fulano', email: null }, developers)).toBeNull()
  })
})

describe('vínculo repositório ↔ produto (schema)', () => {
  const valid = { repo: 'Sipal/App', productId: 'b'.repeat(24), productName: 'App', authors: ['Fernand-Sipal'], entryColumnKey: 'custom-entrada01', defaultType: 'feature', defaultPriority: 'medium', enabled: true }

  it('normaliza repositório e autores; coluna precisa ser pessoal; ao menos um autor', () => {
    const parsed = repoLinkInputSchema.parse(valid)
    expect(parsed).toMatchObject({ repo: 'sipal/app', authors: ['fernand-sipal'] })
    expect(repoLinkInputSchema.safeParse({ ...valid, entryColumnKey: 'backlog' }).success).toBe(false)
    expect(repoLinkInputSchema.safeParse({ ...valid, authors: [] }).success).toBe(false)
  })
})
