import { describe, expect, it } from 'vitest'
import { fileTargetOf, registerFileTarget } from '@/components/ui/vim-editor/file-target'

const textarea = () => ({}) as HTMLTextAreaElement

describe('destino de arquivos do editor Vim', () => {
  it('registra e devolve o handler do campo', () => {
    const node = textarea()
    const handler = () => true
    registerFileTarget(node, handler)
    expect(fileTargetOf(node)).toBe(handler)
  })

  it('sem registro, não há destino', () => {
    expect(fileTargetOf(textarea())).toBeNull()
  })

  it('desfazer o registro remove o destino', () => {
    const node = textarea()
    const release = registerFileTarget(node, () => true)
    release()
    expect(fileTargetOf(node)).toBeNull()
  })

  it('desfazer um registro antigo não apaga o registro novo do mesmo campo', () => {
    const node = textarea()
    const releaseOld = registerFileTarget(node, () => false)
    const current = () => true
    registerFileTarget(node, current)
    releaseOld()
    expect(fileTargetOf(node)).toBe(current)
  })
})
