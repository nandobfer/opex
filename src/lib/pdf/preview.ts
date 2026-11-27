/**
 * HTML da prévia PNG (módulo PURO, OPE-210). A rota de screenshot do Gotenberg renderiza a tela, não a
 * página impressa: aqui o HTML ganha um `<style>` de tela que reproduz as margens da página e a escala
 * final do PDF (`zoom`), para a imagem mostrar a primeira página como ela saiu no PDF.
 */

export interface PreviewPage {
    /** Margens da página em mm (as mesmas do PDF). */
    marginsMm: { top: number; right: number; bottom: number; left: number }
    scale: number
}

export function previewHtml(html: string, page: PreviewPage): string {
    const scale = page.scale > 0 ? page.scale : 1
    const mm = (value: number) => `${Math.round((value / scale) * 100) / 100}mm`
    const { top, right, bottom, left } = page.marginsMm
    const style = `<style data-opex-preview>@media screen{html{zoom:${scale};background:#fff}body{padding:${mm(top)} ${mm(right)} ${mm(bottom)} ${mm(left)} !important}}</style>`
    const head = /<\/head\s*>/i.exec(html)
    if (head) return `${html.slice(0, head.index)}${style}${html.slice(head.index)}`
    return `${style}${html}`
}
