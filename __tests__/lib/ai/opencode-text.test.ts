import { describe, expect, it } from 'vitest'

import { appendTextDelta, joinTextBlocks } from '@/lib/ai/opencode-text'

describe('appendTextDelta', () => {
  it('bloco novo começa depois de uma linha em branco', () => {
    expect(appendTextDelta('Segue a especificação:', '## Especificação técnica', true)).toEqual({ text: 'Segue a especificação:\n\n## Especificação técnica', piece: '\n\n## Especificação técnica' })
  })

  it('o mesmo bloco continua colado', () => {
    expect(appendTextDelta('## Especifi', 'cação técnica', false)).toEqual({ text: '## Especificação técnica', piece: 'cação técnica' })
  })

  it('não duplica a quebra quando um dos lados já tem quebra de linha, nem prefixa o primeiro bloco', () => {
    expect(appendTextDelta('linha\n', '## T', true).piece).toBe('## T')
    expect(appendTextDelta('linha', '\n## T', true).piece).toBe('\n## T')
    expect(appendTextDelta('', '## T', true).piece).toBe('## T')
  })
})

describe('joinTextBlocks', () => {
  it('separa as partes de texto por linha em branco', () => {
    expect(joinTextBlocks(['Segue:', '## Especificação técnica\n\n- critério'])).toBe('Segue:\n\n## Especificação técnica\n\n- critério')
    expect(joinTextBlocks([])).toBe('')
  })
})
