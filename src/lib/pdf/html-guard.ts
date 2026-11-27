/**
 * Guarda do HTML enviado ao Chromium do Gotenberg (módulo PURO, OPE-210).
 *
 * O Chromium roda dentro da rede interna: um HTML com `<img src="http://servico-interno">` faria o
 * Gotenberg buscar o endereço (SSRF). Pela mesma razão de a Chamada HTTP ficar fora dos tokens, o
 * HTML só pode trazer recursos embutidos (`data:` URI e CSS num `<style>`). Links (`<a href>`) são
 * aceitos: não são buscados ao gerar o PDF. JavaScript também é recusado.
 */

const BLOCKED_TAGS = /<\s*(script|iframe|object|embed|link|frame|frameset|base|portal)\b/i
const META_REFRESH = /<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh/i
const CSS_IMPORT = /@import\b/i
const CSS_URL = /url\(\s*(["']?)\s*(?!data:|#)[^)\s"']/i
/** Atributos que fazem o navegador buscar um recurso. */
const RESOURCE_ATTR = /\b(src|srcset|poster|background|data|lowsrc|dynsrc|formaction)\s*=\s*(["']?)\s*([^"'\s>]*)/gi
/** `href` que busca recurso dentro de SVG (`<image>`, `<use>`, `<feImage>`). */
const SVG_HREF = /<\s*(image|use|feimage)\b[^>]*\b(?:xlink:)?href\s*=\s*(["']?)\s*(?!data:|#)[^"'\s>]/i

const isEmbedded = (value: string) => {
    const v = value.trim().toLowerCase()
    return v === "" || v.startsWith("data:") || v.startsWith("#")
}

/** Motivo da recusa (curto, pt-BR) ou `null` quando o HTML só usa recursos embutidos. */
export function externalResourceReason(html: string): string | null {
    const tag = BLOCKED_TAGS.exec(html)
    if (tag) return `a tag <${tag[1]!.toLowerCase()}> não é aceita`
    if (META_REFRESH.test(html)) return "<meta http-equiv=refresh> não é aceito"
    if (CSS_IMPORT.test(html)) return "@import no CSS não é aceito"
    if (CSS_URL.test(html)) return "url(...) no CSS precisa ser data:"
    if (SVG_HREF.test(html)) return "href de imagem SVG precisa ser data:"
    for (const match of html.matchAll(RESOURCE_ATTR)) {
        const attr = match[1]!.toLowerCase()
        const value = match[3] ?? ""
        if (attr === "srcset") {
            const urls = value.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "")
            if (urls.some((url) => !isEmbedded(url))) return "srcset precisa usar só data:"
            continue
        }
        if (!isEmbedded(value)) return `o atributo ${attr} precisa ser data: (recebido "${value.slice(0, 60)}")`
    }
    return null
}

export const EXTERNAL_RESOURCE_HINT = "embuta imagens e fontes como data: URI e o CSS num <style>; o documento não pode buscar endereços nem rodar JavaScript"

/** Mensagem completa da recusa (ou `null`). */
export function htmlGuardMessage(html: string): string | null {
    const reason = externalResourceReason(html)
    return reason ? `O HTML não pode carregar recursos externos: ${reason}. Para gerar o PDF, ${EXTERNAL_RESOURCE_HINT}.` : null
}
