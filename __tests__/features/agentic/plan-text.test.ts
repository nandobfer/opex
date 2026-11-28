import { describe, expect, it } from 'vitest'
import { isPlanText } from '@/features/agentic/plan-text'

describe('isPlanText (OPE-216)', () => {
  it('recusa o anúncio de que o plano ainda vai ser escrito', () => {
    expect(isPlanText('Disparei duas explorações em paralelo (sessões OpenCode/skills/permissões e GitHub/central/ambientes). Fecho o plano assim que os resultados chegarem.')).toBe(false)
    expect(isPlanText('Vou investigar o runner e volto com o plano.')).toBe(false)
  })

  it('recusa texto vazio; texto curto que não anuncia nada segue aceito', () => {
    expect(isPlanText('   ')).toBe(false)
    expect(isPlanText('Nada a alterar: a correção já está na main.')).toBe(true)
  })

  it('aceita um plano estruturado, mesmo curto, e um plano longo', () => {
    expect(isPlanText('# Plano\n\n1. Alterar o runner\n2. Testar')).toBe(true)
    expect(isPlanText('1. Ler\n2. Alterar\n3. Testar')).toBe(true)
    const long = `# Plano OPE-216\n\n## Entendimento\n${'O turno do OpenCode espera os subagentes. '.repeat(10)}\n\n## Passos\n1. Implementar\n2. Testar\n3. Documentar`
    expect(isPlanText(long)).toBe(true)
  })
})
