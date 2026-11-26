import { describe, expect, it } from "vitest"
import { markdownToWhatsApp, ownerQuestionMessage, whatsAppQuote } from "@/features/secretary-agent/whatsapp-format"

describe("markdownToWhatsApp (OPE-199)", () => {
    it("converte ênfases do Markdown para a sintaxe do WhatsApp", () => {
        expect(markdownToWhatsApp("**a** e __b__")).toBe("*a* e *b*")
        expect(markdownToWhatsApp("***a***")).toBe("*_a_*")
        expect(markdownToWhatsApp("~~a~~")).toBe("~a~")
    })

    it("títulos viram uma linha em negrito", () => {
        expect(markdownToWhatsApp("# Título")).toBe("*Título*")
        expect(markdownToWhatsApp("## **Título** ##")).toBe("*Título*")
        expect(markdownToWhatsApp("# Migrar para C#")).toBe("*Migrar para C#*")
        expect(markdownToWhatsApp("# C#")).toBe("*C#*")
    })

    it("links e imagens viram texto com a URL", () => {
        expect(markdownToWhatsApp("veja [site](https://x.com)")).toBe("veja site (https://x.com)")
        expect(markdownToWhatsApp("[https://x.com](https://x.com)")).toBe("https://x.com")
        expect(markdownToWhatsApp("![logo](https://x.com/l.png)")).toBe("logo (https://x.com/l.png)")
    })

    it("listas com * ou + viram -, e as listas que o WhatsApp mostra ficam", () => {
        expect(markdownToWhatsApp("* um\n+ dois")).toBe("- um\n- dois")
        expect(markdownToWhatsApp("- um\n1. dois")).toBe("- um\n1. dois")
    })

    it("remove separadores e reduz linhas em branco em excesso", () => {
        expect(markdownToWhatsApp("a\n\n---\n\n\n\nb\n***\nc")).toBe("a\n\nb\nc")
    })

    it("não converte nada dentro do código e tira só a linguagem do bloco", () => {
        expect(markdownToWhatsApp("```ts\nconst a = **x**\n```")).toBe("```\nconst a = **x**\n```")
        expect(markdownToWhatsApp("use `**x**` e **y**")).toBe("use `**x**` e *y*")
        expect(markdownToWhatsApp("```mono```")).toBe("```mono```")
    })

    it("texto já no formato do WhatsApp volta igual, e aplicar duas vezes dá o mesmo resultado", () => {
        const whatsapp = "*a* _b_ ~c~\n> d\n- e"
        expect(markdownToWhatsApp(whatsapp)).toBe(whatsapp)
        const markdown = "# T\n**a** [s](https://x.com) ~~c~~\n* item\n\n---"
        expect(markdownToWhatsApp(markdownToWhatsApp(markdown))).toBe(markdownToWhatsApp(markdown))
    })

    it("nenhum marcador de Markdown sem equivalente sobra na saída", () => {
        const out = markdownToWhatsApp("# Pergunta\n**Confirma** o ~~sábado~~ com [Ana](https://x.com)?\n\n\n\n## Detalhes\n* hora: __10h__")
        expect(out).not.toMatch(/\*\*|^#|\]\(|~~|__/m)
        expect(out).toBe("*Pergunta*\n*Confirma* o ~sábado~ com Ana (https://x.com)?\n\n*Detalhes*\n- hora: *10h*")
    })
})

describe("whatsAppQuote (OPE-199)", () => {
    it("cita cada linha com >, inclusive a linha vazia do meio", () => {
        expect(whatsAppQuote("oi\r\n\r\ntudo bem?\n")).toBe("> oi\n>\n> tudo bem?")
    })

    it("texto vazio não vira citação", () => {
        expect(whatsAppQuote("  \n ")).toBe("")
    })

    it("o texto do contato fica literal", () => {
        expect(whatsAppQuote("**urgente** [x](y)")).toBe("> **urgente** [x](y)")
    })
})

describe("ownerQuestionMessage (OPE-199, R1)", () => {
    it("contato em negrito, autor entre parênteses, linha em branco e o trecho citado", () => {
        expect(ownerQuestionMessage({ contactName: "Família", author: "João", question: "Você vai?", excerpt: "vamos sábado\nvocê vem?" }))
            .toBe("❓ *Família* (João): Você vai?\n\n> vamos sábado\n> você vem?")
    })

    it("sem trecho, só a primeira linha", () => {
        expect(ownerQuestionMessage({ contactName: "Ana", question: "Você vai?", excerpt: "" })).toBe("❓ *Ana*: Você vai?")
    })

    it("nome do contato com marcadores, quebra de linha ou espaços nas pontas não quebra o negrito", () => {
        expect(ownerQuestionMessage({ contactName: "Pizzaria *Top*", question: "Peço?" })).toBe("❓ *Pizzaria Top*: Peço?")
        expect(ownerQuestionMessage({ contactName: " Ana ", question: "Vai?" })).toBe("❓ *Ana*: Vai?")
        expect(ownerQuestionMessage({ contactName: "Ana\n~Maria_", question: "Vai?" })).toBe("❓ *Ana Maria*: Vai?")
        expect(ownerQuestionMessage({ contactName: "***", question: "Vai?" })).toBe("❓ ***: Vai?")
    })

    it("pergunta em Markdown é convertida", () => {
        expect(ownerQuestionMessage({ contactName: "Ana", question: "Confirmo o **sábado**?" })).toBe("❓ *Ana*: Confirmo o *sábado*?")
    })
})
