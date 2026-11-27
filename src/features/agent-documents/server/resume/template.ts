import type { ResumeContent, ResumeLanguage } from "../../schemas"

/**
 * Modelo do currículo aprovado pelo dono (OPE-210, módulo PURO): reprodução literal do
 * `curriculo-fernando-burgos-2026-11-15.html` (HTML, classes, cores e CSS). Nada de modelo
 * reinterpretado: o teste compara a saída com o arquivo de referência.
 *
 * Densidades (degraus do `preparar_curriculo`):
 * - `padrao`: o CSS exato do modelo aprovado;
 * - `compacto`: o mesmo modelo trocando só os 4 valores registrados na memória `curriculos-gerados`
 *   (body 8,25pt, @page 9mm 12mm, line-height 1,22 e margem superior do h2 6px).
 */

export const RESUME_DENSITIES = ["padrao", "compacto"] as const
export type ResumeDensity = (typeof RESUME_DENSITIES)[number]

/** Margens do `@page` de cada densidade (mm): a prévia PNG reproduz as mesmas. */
export const RESUME_PAGE_MARGINS_MM: Record<ResumeDensity, { top: number; right: number; bottom: number; left: number }> = {
    padrao: { top: 13, right: 14, bottom: 13, left: 14 },
    compacto: { top: 9, right: 12, bottom: 9, left: 12 },
}

const BASE_CSS = [
    "@page{size:A4;margin:13mm 14mm}",
    "*{margin:0;padding:0;box-sizing:border-box}",
    'body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:9.3pt;line-height:1.36;color:#15181c}',
    "h1{font-size:17pt;font-weight:700;letter-spacing:.2px;line-height:1.1}",
    ".sub{font-size:9.5pt;color:#33505f;margin-top:3px;font-weight:600}",
    ".contact{font-size:8.3pt;color:#4a5560;margin-top:4px}",
    "h2{font-size:8.5pt;letter-spacing:1.1px;text-transform:uppercase;color:#0b5cad;border-bottom:1px solid #cfd8e0;padding-bottom:2px;margin:10px 0 4px}",
    "p{text-align:justify}",
    "ul{list-style:none}",
    "li{margin-bottom:2px;padding-left:9px;position:relative}",
    'li:before{content:"\\2013";position:absolute;left:0;color:#0b5cad}',
    ".role{display:flex;justify-content:space-between;margin-top:6px}",
    ".role b{font-size:9.5pt}",
    ".role span{font-size:8.5pt;color:#54606c;white-space:nowrap}",
    ".co{font-size:9pt;color:#1d4a63;font-weight:600;margin-bottom:2px}",
    ".sk{font-size:8.9pt;margin-bottom:2px;padding-left:0}",
    ".sk:before{content:none}",
    ".sk b{color:#0b2a45}",
    ".earlier{font-size:8.9pt;margin-top:6px;color:#2a3a47}",
].join("\n")

/** Trocas da densidade compacta (texto exato do CSS base → valor registrado). */
export const COMPACT_REPLACEMENTS: readonly [string, string][] = [
    ["@page{size:A4;margin:13mm 14mm}", "@page{size:A4;margin:9mm 12mm}"],
    ["font-size:9.3pt;line-height:1.36;", "font-size:8.25pt;line-height:1.22;"],
    ["margin:10px 0 4px}", "margin:6px 0 4px}"],
]

export function resumeCss(density: ResumeDensity): string {
    if (density === "padrao") return BASE_CSS
    return COMPACT_REPLACEMENTS.reduce((css, [from, to]) => css.replace(from, to), BASE_CSS)
}

const SECTION_TITLES: Record<ResumeLanguage, { profile: string; skills: string; experience: string; highlights: string; education: string; earlier: string; languages: string }> = {
    en: { profile: "Profile", skills: "Core skills", experience: "Experience", highlights: "Selected AI work", education: "Education &amp; languages", earlier: "Earlier:", languages: "Languages:" },
    "pt-BR": { profile: "Perfil", skills: "Competências", experience: "Experiência", highlights: "Trabalhos em destaque", education: "Formação e idiomas", earlier: "Antes:", languages: "Idiomas:" },
}

export function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const ul = (items: string[]) => (items.length ? ["<ul>", ...items, "</ul>"] : [])

export function renderResumeHtml(content: ResumeContent, density: ResumeDensity = "padrao"): string {
    const t = SECTION_TITLES[content.idioma ?? "en"]
    const e = escapeHtml
    const lines: string[] = [
        `<!DOCTYPE html><html><head><meta charset="utf-8"><style>\n${resumeCss(density)}\n</style></head><body>`,
        `<h1>${e(content.nome)}</h1>`,
        `<div class="sub">${e(content.titulo)}</div>`,
        `<div class="contact">${content.contato.map(e).join(" &middot; ")}</div>`,
        `<h2>${t.profile}</h2>`,
        `<p>${e(content.perfil)}</p>`,
    ]
    if (content.competencias.length) {
        lines.push(`<h2>${t.skills}</h2>`, ...ul(content.competencias.map((item) => `<li class="sk"><b>${e(item.grupo)}:</b> ${e(item.itens)}</li>`)))
    }
    if (content.experiencias.length || content.anteriores) {
        lines.push(`<h2>${t.experience}</h2>`)
        for (const job of content.experiencias) {
            lines.push(`<div class="role"><b>${e(job.cargo)}</b><span>${e(job.periodo)}</span></div>`)
            lines.push(`<div class="co">${e(job.empresa)}${job.local ? ` &middot; ${e(job.local)}` : ""}</div>`)
            lines.push(...ul(job.topicos.map((topic) => `<li>${e(topic)}</li>`)))
        }
        if (content.anteriores) lines.push(`<div class="earlier"><b>${t.earlier}</b> ${e(content.anteriores)}</div>`)
    }
    if (content.destaques.length) {
        lines.push(`<h2>${t.highlights}</h2>`, ...ul(content.destaques.map((item) => `<li><b>${e(item.titulo)}:</b> ${e(item.texto)}</li>`)))
    }
    const education = [
        ...content.formacao.map((item) => `<li class="sk"><b>${e(item.titulo)}</b>${item.detalhe ? ` &mdash; ${e(item.detalhe)}` : ""}</li>`),
        ...content.certificacoes.map((item) => `<li class="sk"><b>${e(item.titulo)}</b>${item.detalhe ? ` ${e(item.detalhe)}` : ""}</li>`),
        ...(content.idiomas ? [`<li class="sk"><b>${t.languages}</b> ${e(content.idiomas)}</li>`] : []),
    ]
    if (education.length) lines.push(`<h2>${t.education}</h2>`, ...ul(education))
    lines.push("</body></html>")
    return lines.join("\n")
}
