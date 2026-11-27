/**
 * Guarda do HTML enviado ao Chromium do Gotenberg (módulo PURO, OPE-210).
 *
 * O Chromium roda dentro da rede interna: um HTML com `<img src="http://servico-interno">` faria o
 * Gotenberg buscar o endereço (SSRF). Pela mesma razão de a Chamada HTTP ficar fora dos tokens, o
 * HTML só pode trazer recursos embutidos (`data:` URI e CSS num `<style>`). Links (`<a href>`) são
 * aceitos: não são buscados ao gerar o PDF. JavaScript também é recusado.
 *
 * Duas camadas: as regras globais por regex (sobre o documento inteiro) e um tokenizador das tags que
 * respeita aspas nos atributos (um `>` dentro de `title=">"` não fecha a tag), lê o `<style>` até o
 * `</style` ou até o fim do documento (sem fechamento) e decodifica entidades antes de conferir CSS e URLs.
 * Na dúvida, recusa: comentário `<!-- -->` é tratado como texto comum (as tags dentro dele também são lidas).
 */

const BLOCKED_TAGS = new Set(["script", "iframe", "object", "embed", "link", "frame", "frameset", "base", "portal", "applet"])
const BLOCKED_TAG_PATTERN = /<\s*(script|iframe|object|embed|link|frame|frameset|base|portal|applet)\b/i
/** `javascript:` como valor de atributo (texto comum como "JavaScript:" num rótulo não conta). */
const JAVASCRIPT_URL = /=\s*["']?\s*javascript\s*:/i
const META_REFRESH = /<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*refresh/i
const CSS_IMPORT = /@import\b/i
const CSS_URL = /url\(\s*(["']?)\s*(?!data:|#)[^)\s"']/i
/** Funções de CSS que buscam recurso por string, sem `url(`. */
const CSS_FETCH_FUNCTIONS = /(?:^|[^a-z-])(?:-webkit-)?(image-set|image|src|cross-fade|element)\s*\(/i
/** Única barra invertida aceita no CSS: uma string com um caractere escapado (o `content:"\2013"` do currículo). */
const CSS_SINGLE_CHAR_STRING = /"\\[0-9a-fA-F]{1,6}"|'\\[0-9a-fA-F]{1,6}'/g
/** Atributos que fazem o navegador buscar um recurso. */
const RESOURCE_ATTRS = new Set(["src", "srcset", "poster", "background", "data", "lowsrc", "dynsrc", "formaction", "action", "ping", "codebase", "archive", "longdesc", "manifest"])
const RESOURCE_ATTR_PATTERN = /\b(src|srcset|poster|background|data|lowsrc|dynsrc|formaction)\s*=\s*(["']?)\s*([^"'\s>]*)/gi
/** Tags SVG cujo `href` busca recurso. */
const SVG_FETCH_TAGS = new Set(["image", "use", "feimage", "tref", "pattern", "filter", "lineargradient", "radialgradient", "textpath", "mpath", "animate", "set"])
/** Entidades nomeadas aceitas em CSS e URLs (as demais podem formar `(`, `:` etc. e são recusadas nesses contextos). */
const SAFE_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" }

const isEmbedded = (value: string) => {
    const v = value.trim().toLowerCase()
    return v === "" || v.startsWith("data:") || v.startsWith("#")
}

/** Decodifica entidades numéricas e as seguras; `null` quando há entidade nomeada desconhecida. */
function decodeEntities(value: string): string | null {
    let unknown = false
    const decoded = value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi, (whole, body: string) => {
        if (body[0] === "#") {
            const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""
        }
        const safe = SAFE_ENTITIES[body.toLowerCase()]
        if (safe === undefined) unknown = true
        return safe ?? whole
    })
    return unknown ? null : decoded
}

/** Sem espaços e caracteres de controle (o navegador os ignora em `java\tscript:`). */
const compact = (value: string) => value.replace(/[\u0000-\u0020]+/g, "").toLowerCase()

function cssReason(rawCss: string, context: "bloco" | "atributo"): string | null {
    const css = decodeEntities(rawCss)
    if (css === null) return `entidade HTML desconhecida no CSS (${context}) não é aceita`
    if (css.replace(CSS_SINGLE_CHAR_STRING, "").includes("\\")) return "escape com barra invertida no CSS não é aceito"
    if (CSS_IMPORT.test(css)) return "@import no CSS não é aceito"
    if (CSS_URL.test(css)) return "url(...) no CSS precisa ser data:"
    const fn = CSS_FETCH_FUNCTIONS.exec(css)
    if (fn) return `a função ${fn[1]!.toLowerCase()}() no CSS não é aceita`
    if (/expression\s*\(|behavior\s*:|-moz-binding/i.test(css)) return "CSS executável não é aceito"
    return null
}

interface ParsedTag {
    name: string
    closing: boolean
    attrs: { name: string; value: string }[]
    end: number
}

/** Lê uma tag a partir de `<`, respeitando aspas nos valores (valor sem aspas de fechamento vai até o fim). */
function readTag(html: string, start: number): ParsedTag {
    let i = start + 1
    const closing = html[i] === "/"
    if (closing) i++
    const nameStart = i
    while (i < html.length && !/[\s/>]/.test(html[i]!)) i++
    const name = html.slice(nameStart, i).toLowerCase()
    const attrs: { name: string; value: string }[] = []
    while (i < html.length) {
        while (i < html.length && /[\s/]/.test(html[i]!)) i++
        if (i >= html.length || html[i] === ">") break
        const attrStart = i
        i++
        while (i < html.length && !/[\s/>=]/.test(html[i]!)) i++
        const attrName = html.slice(attrStart, i).toLowerCase()
        while (i < html.length && /\s/.test(html[i]!)) i++
        let value = ""
        if (html[i] === "=") {
            i++
            while (i < html.length && /\s/.test(html[i]!)) i++
            const quote = html[i]
            if (quote === '"' || quote === "'") {
                const close = html.indexOf(quote, i + 1)
                const stop = close === -1 ? html.length : close
                value = html.slice(i + 1, stop)
                i = stop + 1
            } else {
                const valueStart = i
                while (i < html.length && !/[\s>]/.test(html[i]!)) i++
                value = html.slice(valueStart, i)
            }
        }
        attrs.push({ name: attrName, value })
    }
    return { name, closing, attrs, end: Math.min(html.length, i + 1) }
}

function attrReason(tag: string, attr: { name: string; value: string }): string | null {
    if (attr.name.startsWith("on")) return "atributos de evento (on...=) não são aceitos"
    const decoded = decodeEntities(attr.value)
    const value = decoded ?? attr.value
    if (/^(javascript|vbscript):/.test(compact(value))) return "javascript: não é aceito"
    if (attr.name === "style") return cssReason(attr.value, "atributo")
    const fetches = RESOURCE_ATTRS.has(attr.name) || ((attr.name === "href" || attr.name === "xlink:href") && SVG_FETCH_TAGS.has(tag))
    if (!fetches) return null
    if (decoded === null) return `entidade HTML desconhecida no atributo ${attr.name} não é aceita`
    if (attr.name === "srcset") {
        const urls = value.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "")
        return urls.some((url) => !isEmbedded(url)) ? "srcset precisa usar só data:" : null
    }
    if (attr.name === "href" || attr.name === "xlink:href") return isEmbedded(value) ? null : "href de imagem SVG precisa ser data:"
    return isEmbedded(value) ? null : `o atributo ${attr.name} precisa ser data: (recebido "${value.slice(0, 60)}")`
}

function tagsReason(html: string): string | null {
    let i = 0
    while (i < html.length) {
        const lt = html.indexOf("<", i)
        if (lt === -1) return null
        const next = html[lt + 1] ?? ""
        if (next === "!" || next === "?") {
            const gt = html.indexOf(">", lt)
            i = gt === -1 ? html.length : gt + 1
            continue
        }
        if (!/[a-zA-Z/]/.test(next)) {
            i = lt + 1
            continue
        }
        const tag = readTag(html, lt)
        i = tag.end
        if (tag.closing) continue
        if (BLOCKED_TAGS.has(tag.name)) return `a tag <${tag.name}> não é aceita`
        if (tag.name === "meta" && tag.attrs.some((attr) => attr.name === "http-equiv" && /refresh/i.test(attr.value))) return "<meta http-equiv=refresh> não é aceito"
        for (const attr of tag.attrs) {
            const reason = attrReason(tag.name, attr)
            if (reason) return reason
        }
        if (tag.name === "style") {
            // Texto bruto até `</style` ou até o fim do documento (sem fechamento, o navegador lê tudo como CSS).
            const close = html.slice(i).search(/<\/style/i)
            const end = close === -1 ? html.length : i + close
            const css = html.slice(i, end)
            // CSS legítimo não tem marcação. Dentro de <svg>/<math> o <style> não é texto bruto: um `<div>` ali
            // sai do conteúdo estrangeiro e as tags seguintes viram HTML de verdade.
            if (css.includes("<")) return "marcação (<) dentro de <style> não é aceita"
            const reason = cssReason(css, "bloco")
            if (reason) return reason
            i = end
        }
    }
    return null
}

/** Motivo da recusa (curto, pt-BR) ou `null` quando o HTML só usa recursos embutidos. */
export function externalResourceReason(html: string): string | null {
    const tag = BLOCKED_TAG_PATTERN.exec(html)
    if (tag) return `a tag <${tag[1]!.toLowerCase()}> não é aceita`
    if (JAVASCRIPT_URL.test(html)) return "javascript: não é aceito"
    if (META_REFRESH.test(html)) return "<meta http-equiv=refresh> não é aceito"
    if (CSS_IMPORT.test(html)) return "@import no CSS não é aceito"
    if (CSS_URL.test(html)) return "url(...) no CSS precisa ser data:"
    for (const match of html.matchAll(RESOURCE_ATTR_PATTERN)) {
        const attr = match[1]!.toLowerCase()
        const value = match[3] ?? ""
        if (attr === "srcset") continue
        if (!isEmbedded(value)) return `o atributo ${attr} precisa ser data: (recebido "${value.slice(0, 60)}")`
    }
    return tagsReason(html)
}

export const EXTERNAL_RESOURCE_HINT = "embuta imagens e fontes como data: URI e o CSS num <style>; o documento não pode buscar endereços nem rodar JavaScript"

/** Mensagem completa da recusa (ou `null`). */
export function htmlGuardMessage(html: string): string | null {
    const reason = externalResourceReason(html)
    return reason ? `O HTML não pode carregar recursos externos: ${reason}. Para gerar o PDF, ${EXTERNAL_RESOURCE_HINT}.` : null
}
