/** Com quem o Secretário está falando (nome, número e, em grupo, o autor), como vai para o modelo e para a Simulação. */
export interface SecretaryContact {
    /** Nome do contato ou do grupo; `null` quando não há nome conhecido. */
    name: string | null
    /** Número (só dígitos) do contato; `null` em grupo. */
    number: string | null
    isGroup: boolean
    /** Nome do grupo (igual a `name` em grupo). */
    groupName: string | null
    /** Em grupo, quem escreveu a mensagem. */
    author: string | null
}

const UNKNOWN_NAME = "nome desconhecido (só o número)"

/** Dados do contato no corpo da mensagem ao modelo. */
export function contactForModel(contact: SecretaryContact) {
    return contact.isGroup
        ? { nome: contact.name ?? "grupo sem nome", numero: null, grupo: contact.groupName ?? contact.name, autor: contact.author }
        : { nome: contact.name ?? UNKNOWN_NAME, numero: contact.number ? `+${contact.number}` : null }
}

/** Linha fixa das instruções: diz com quem o agente fala e que não pergunte quem é quando o nome é conhecido. */
export function contactInstruction(contact: SecretaryContact): string {
    if (contact.isGroup) {
        const group = contact.groupName ?? contact.name ?? "um grupo sem nome"
        return `Você está falando no grupo ${group}${contact.author ? `; quem escreveu foi ${contact.author}` : ""}. Se o nome é conhecido, não pergunte quem é; trate a pessoa pelo nome quando for natural.`
    }
    const number = contact.number ? ` (+${contact.number})` : ""
    return contact.name
        ? `Você está falando com ${contact.name}${number}. Se o nome é conhecido, não pergunte quem é; trate a pessoa pelo nome quando for natural.`
        : `Você está falando com ${UNKNOWN_NAME}${number}.`
}

/** Texto usado no foco da busca de memórias: o nome do contato (e do autor) junto com a mensagem. */
export function contactFocus(contact: SecretaryContact, text: string): string {
    return [contact.name, contact.author, text].filter(Boolean).join("\n")
}
