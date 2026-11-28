import { z } from "zod"
import { aiProviderIdIn } from "@nandobfer/integracoes/modules/integrations/ia/ai/schemas"
import { DomainError } from "@/lib/api/route"
import { getAiProvider } from "@nandobfer/integracoes/modules/integrations/ia/ai/providers"
import { SECRETARY_MODE_LABELS, SECRETARY_MODES } from "@/features/secretary-agent/constants"
import { DECISION_PROVIDER_IDS, noticeAnswerSchema } from "@/features/secretary-agent/schemas"
import { applyAudiencePatch, applyGeneralPatch, removeSubject, SUBJECT_LIST_LABELS, upsertSubject, type GeneralPatch, type SecondaryModelInput } from "@/features/secretary-agent/settings-patch"
import {
    answerSecretaryQuestion,
    changeSecretarySettings,
    discardSecretaryQuestion,
    findSecretaryConversations,
    getSecretaryOverview,
    getSecretaryPersonality,
    removeSecretaryBaseBlock,
    removeSecretaryVariant,
    resolveSecretaryConversations,
    resolveSecretaryInstance,
    resolveSecretaryModel,
    secretaryModelOptions,
    upsertSecretaryBaseBlock,
    upsertSecretaryVariant,
    type SecretaryModelRole,
} from "@/features/secretary-agent/server/agent-tools"
import { OPEX_PROVIDER_IDS } from "../../constants"
import { defineTool } from "./define"

/**
 * Agente Secretário pelo chat (OPE-200): consultar e alterar a configuração (Geral, Critérios, Personalidade) e as
 * perguntas pendentes da aba Avisos, com a MESMA validação da tela. As mudanças sensíveis (ligar/desligar, modo,
 * instância, modelo do agente, quem pode ser respondido, remoções e responder/descartar perguntas) são ferramentas
 * próprias com `confirmByDefault`: a confirmação do runtime é por ferramenta, não pela entrada. Só
 * `answer_secretary_question` é `destructive`: ela pode enviar mensagem a um contato (irreversível), então a tela avisa
 * se o dono desligar a confirmação dela; as demais são reversíveis. Os resumos de confirmação dizem o efeito. Fora dos agentes rotineiros (`ROUTINE_FORBIDDEN_TOOL_GROUPS`); no Maddox e no MCP
 * por token valem, e as que confirmam exigem `mcp:owner:destructive`.
 */

const NAMES_RULE = "Fale com o dono sempre pelos nomes (provedor, modelo, instância, contato/grupo, assunto); nunca mostre identificadores internos."
const conversation = z.string().trim().min(1).max(120).describe("Conversa pelo nome do contato/grupo ou pelo número (veja find_secretary_conversations)")
const conversations = z.array(conversation).max(50).optional()
const providerName = (id: string) => getAiProvider(id as (typeof OPEX_PROVIDER_IDS)[number]).name
const secondaryModel = (providers: readonly [string, ...string[]], label: string) =>
    z
        .object({
            sameAsAgent: z.boolean().describe('true = "Mesmo do agente"'),
            provider: z.enum(providers).optional().describe("Provedor (obrigatório com sameAsAgent=false)"),
            model: z.string().trim().min(1).max(200).optional().describe("Modelo: identificador ou nome do catálogo (list_secretary_model_options)"),
            variant: z.string().trim().min(1).max(60).nullish(),
        })
        .optional()
        .describe(label)
const subjectList = z.enum(["blocked", "allowed"]).describe("blocked = assuntos bloqueados (nunca responde); allowed = assuntos liberados")

async function resolveSecondary(role: SecretaryModelRole, input: z.infer<ReturnType<typeof secondaryModel>>): Promise<SecondaryModelInput | undefined> {
    if (!input) return undefined
    if (input.sameAsAgent) return { sameAsAgent: true }
    if (!input.provider || !input.model) throw new DomainError(400, 'Informe o provedor e o modelo, ou use "Mesmo do agente" (sameAsAgent=true).', "VALIDATION_ERROR")
    const resolved = await resolveSecretaryModel(role, { provider: input.provider, model: input.model, variant: input.variant })
    return { sameAsAgent: false, provider: resolved.provider, model: resolved.model, variant: resolved.variant }
}

const describeList = (items: string[] | undefined, verb: string) => (items?.length ? [`${verb} ${items.join(", ")}`] : [])

export const secretaryTools = [
    defineTool({
        name: "get_secretary_settings",
        group: "secretary",
        label: "Ver Agente Secretário",
        risk: "read",
        description: `Retrato do Agente Secretário (WhatsApp do dono): ligado/desligado, modo (Responder ou Só observar), instância do WhatsApp, provedor e modelo de cada papel (agente, mídia, análise, quem decide o assunto), mídia, comportamento humano, pausa quando o dono responde, limites, preços estimados, critérios (quem pode ser respondido e assuntos), resumo da personalidade, perguntas pendentes ao dono, o que falta para ligar (readiness) e se as chaves estão configuradas (nunca os valores). Só lê: não liga, não desliga nem envia mensagem. ${NAMES_RULE}`,
        input: z.object({}),
        execute: async () => getSecretaryOverview(),
    }),
    defineTool({
        name: "list_secretary_model_options",
        group: "secretary",
        label: "Modelos do Secretário",
        risk: "read",
        description: "Provedores aceitos num papel do Secretário (com configurado/conectado) e, informando o provedor, os modelos do catálogo (identificador, nome e variantes). O JEV só vale em quem decide o assunto.",
        input: z.object({
            role: z.enum(["main", "media", "analysis", "decision"]).default("main").describe("main = agente; media = mídia; analysis = análise; decision = quem decide o assunto"),
            provider: z.enum(DECISION_PROVIDER_IDS).optional(),
        }),
        execute: async (input) => secretaryModelOptions(input.role, input.provider),
    }),
    defineTool({
        name: "find_secretary_conversations",
        group: "secretary",
        label: "Buscar conversas do Secretário",
        risk: "read",
        description: "Busca as conversas da instância do Secretário pelo nome ou número: tipo, número, estado (Ativo, Pausado, Nunca responder, Aguardando o dono) e se está entre os escolhidos ou em nunca responder. Sem busca, as 30 mais recentes.",
        input: z.object({ query: z.string().trim().max(120).optional() }),
        execute: async (input) => findSecretaryConversations(input.query),
    }),
    defineTool({
        name: "get_secretary_personality",
        group: "secretary",
        label: "Ver personalidade do Secretário",
        risk: "read",
        description: "Personalidade do Secretário: blocos da base (fixos e extras, com o texto), variantes por conversa (blocos que mudam ou complementam a base) e as últimas versões do histórico.",
        input: z.object({}),
        execute: async () => getSecretaryPersonality(),
    }),
    defineTool({
        name: "set_secretary_enabled",
        group: "secretary",
        label: "Ligar/desligar Secretário",
        risk: "write",
        confirmByDefault: true,
        description: "Liga ou desliga o Agente Secretário. Para ligar é preciso provedor, modelo e instância (e o preço dos modelos que não informam custo): antes, consulte get_secretary_settings (readiness) e, se faltar algo, diga ao dono o que falta em vez de chamar esta ferramenta. Recusa sem gravar nada, com o que falta.",
        input: z.object({ enabled: z.boolean() }),
        summarize: (input) =>
            input.enabled
                ? "Ligar o Agente Secretário: no modo Responder ele passa a responder pelo WhatsApp do dono a partir de agora (no modo Só observar, só registra as decisões)"
                : "Desligar o Agente Secretário: ele para de responder pelo WhatsApp do dono",
        execute: async (input, context) => changeSecretarySettings((settings) => ({ ...settings, enabled: input.enabled }), context.actorId),
    }),
    defineTool({
        name: "set_secretary_mode",
        group: "secretary",
        label: "Modo do Secretário",
        risk: "write",
        confirmByDefault: true,
        description: "Modo do Secretário: reply = Responder; observe = Só observar (registra as decisões, mas não envia mensagens).",
        input: z.object({ mode: z.enum(SECRETARY_MODES) }),
        summarize: (input) =>
            `Trocar o modo do Agente Secretário para ${SECRETARY_MODE_LABELS[input.mode]}: ${input.mode === "reply" ? "ligado, ele passa a enviar mensagens pelo WhatsApp do dono" : "ele deixa de enviar mensagens e só registra as decisões"}`,
        execute: async (input, context) => changeSecretarySettings((settings) => ({ ...settings, mode: input.mode }), context.actorId),
    }),
    defineTool({
        name: "set_secretary_instance",
        group: "secretary",
        label: "Instância do Secretário",
        risk: "write",
        confirmByDefault: true,
        description: "Troca a instância do WhatsApp (Evolution API) usada pelo Secretário, pelo nome; a instância precisa existir na Evolution.",
        input: z.object({ instance: z.string().trim().min(1).max(120).describe("Nome da instância") }),
        summarize: (input) => `Trocar a instância do WhatsApp do Agente Secretário para ${input.instance}: ele passa a ler e responder as conversas desse número`,
        execute: async (input, context) => {
            const instance = await resolveSecretaryInstance(input.instance)
            return changeSecretarySettings((settings) => ({ ...settings, instance: instance.name }), context.actorId)
        },
    }),
    defineTool({
        name: "set_secretary_agent_model",
        group: "secretary",
        label: "Modelo do Secretário",
        risk: "write",
        confirmByDefault: true,
        description: "Troca o provedor e o modelo do agente do Secretário (e a variante, opcional). O modelo é conferido no catálogo do provedor (identificador ou nome; veja list_secretary_model_options); provedor sem chave, modelo inexistente ou variante inválida são recusados.",
        input: z.object({
            provider: aiProviderIdIn(OPEX_PROVIDER_IDS),
            model: z.string().trim().min(1).max(200),
            variant: z.string().trim().min(1).max(60).nullish(),
        }),
        summarize: (input) => `Trocar o modelo do agente do Secretário para ${providerName(input.provider)} · ${input.model}${input.variant ? ` (${input.variant})` : ""}`,
        execute: async (input, context) => {
            const resolved = await resolveSecretaryModel("main", input)
            return changeSecretarySettings((settings) => ({ ...settings, main: { ...settings.main, provider: resolved.provider as (typeof OPEX_PROVIDER_IDS)[number], model: resolved.model, variant: resolved.variant, agent: null } }), context.actorId)
        },
    }),
    defineTool({
        name: "update_secretary_settings",
        group: "secretary",
        label: "Ajustar Secretário",
        risk: "write",
        description:
            "Ajustes da aba Geral que não pedem confirmação: temperatura, mídia (ler imagens, transcrever áudios, modelo de mídia), modelos da análise e de quem decide o assunto, comportamento humano, pausa quando o dono responde, limites (respostas por conversa por hora, orçamento diário) e preços estimados por modelo. Só muda o que vier; a validação é a da tela (faixas, máximo ≥ mínimo, preço dos modelos sem custo informado) e a recusa não grava nada.",
        input: z.object({
            temperature: z.number().nullish().describe("Temperatura do agente (0 a 2; null = padrão do provedor)"),
            readImages: z.boolean().optional(),
            transcribeAudio: z.boolean().optional(),
            mediaModel: secondaryModel(OPEX_PROVIDER_IDS, "Modelo de mídia"),
            analysisModel: secondaryModel(OPEX_PROVIDER_IDS, "Modelo da análise de personalidade"),
            decisionModel: secondaryModel(DECISION_PROVIDER_IDS, "Quem decide o assunto (texto ou o JEV)"),
            groupingSeconds: z.number().optional().describe("Agrupar mensagens (s, 0 a 120)"),
            delayMinSeconds: z.number().optional().describe("Atraso mínimo (s, 0 a 120)"),
            delayMaxSeconds: z.number().optional().describe("Atraso máximo (s, 0 a 180)"),
            showTyping: z.boolean().optional(),
            splitMessages: z.boolean().optional(),
            markRead: z.boolean().optional(),
            pauseMinutes: z.number().optional().describe("Pausa quando o dono responde pelo celular (min, 1 a 1440)"),
            repliesPerHour: z.number().optional().describe("Respostas por conversa por hora (1 a 200)"),
            dailyBudgetUsd: z.number().optional().describe("Orçamento diário (US$ 0,01 a 1000)"),
            prices: z
                .array(z.object({ provider: aiProviderIdIn(OPEX_PROVIDER_IDS), model: z.string().trim().min(1).max(200), inputPerMTok: z.number(), outputPerMTok: z.number() }))
                .max(10)
                .optional()
                .describe("Preço estimado (US$ por 1 milhão de tokens) de entrada e saída por modelo"),
        }),
        summarize: () => "Ajustar a configuração do Agente Secretário",
        execute: async (input, context) => {
            const human = { groupingSeconds: input.groupingSeconds, delayMinSeconds: input.delayMinSeconds, delayMaxSeconds: input.delayMaxSeconds, typing: input.showTyping, splitMessages: input.splitMessages, markRead: input.markRead }
            const limits = { repliesPerHour: input.repliesPerHour, dailyBudgetUsd: input.dailyBudgetUsd }
            const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
            const prices: NonNullable<GeneralPatch["prices"]> = []
            for (const price of input.prices ?? []) {
                const resolved = await resolveSecretaryModel("main", { provider: price.provider, model: price.model })
                prices.push({ provider: resolved.provider, model: resolved.model, inputPerMTok: price.inputPerMTok, outputPerMTok: price.outputPerMTok })
            }
            const patch: GeneralPatch = {
                temperature: input.temperature,
                media: { readImages: input.readImages, transcribeAudio: input.transcribeAudio, model: await resolveSecondary("media", input.mediaModel) },
                analysisModel: await resolveSecondary("analysis", input.analysisModel),
                decisionModel: await resolveSecondary("decision", input.decisionModel),
                human: defined(human) as GeneralPatch["human"],
                pauseMinutes: input.pauseMinutes,
                limits: defined(limits) as GeneralPatch["limits"],
                prices,
            }
            const empty = Object.values(input).every((value) => value === undefined)
            if (empty) throw new DomainError(400, "Informe o que mudar.", "VALIDATION_ERROR")
            return changeSecretarySettings((settings) => applyGeneralPatch(settings, patch), context.actorId)
        },
    }),
    defineTool({
        name: "update_secretary_audience",
        group: "secretary",
        label: "Quem o Secretário responde",
        risk: "write",
        confirmByDefault: true,
        description:
            'Critérios › Quem pode ser respondido: responder a todos ou só aos escolhidos, conversas individuais e grupos, em grupos sempre ou só quando mencionam o dono, e adicionar/remover conversas em "escolhidos" e em "nunca responder" (pelo nome ou número). "Só os escolhidos" sem nenhuma conversa é recusado.',
        input: z.object({
            whoCanBeAnswered: z.enum(["everyone", "selected"]).optional().describe("everyone = Todos; selected = Só os escolhidos"),
            individualChats: z.boolean().optional(),
            groups: z.boolean().optional(),
            inGroups: z.enum(["always", "mention"]).optional().describe("always = Sempre; mention = Só quando me mencionam"),
            addSelected: conversations,
            removeSelected: conversations,
            addNeverAnswer: conversations,
            removeNeverAnswer: conversations,
        }),
        summarize: (input) => {
            const parts = [
                ...(input.whoCanBeAnswered ? [input.whoCanBeAnswered === "selected" ? "responder só aos escolhidos" : "responder a todos"] : []),
                ...(input.individualChats !== undefined ? [`conversas individuais: ${input.individualChats ? "sim" : "não"}`] : []),
                ...(input.groups !== undefined ? [`grupos: ${input.groups ? "sim" : "não"}`] : []),
                ...(input.inGroups ? [input.inGroups === "mention" ? "em grupos, só quando mencionam" : "em grupos, sempre"] : []),
                ...describeList(input.addSelected, "adicionar aos escolhidos:"),
                ...describeList(input.removeSelected, "tirar dos escolhidos:"),
                ...describeList(input.addNeverAnswer, "adicionar a Nunca responder:"),
                ...describeList(input.removeNeverAnswer, "tirar de Nunca responder:"),
            ]
            return `Secretário — quem pode ser respondido: ${parts.join("; ") || "sem mudança"}`
        },
        execute: async (input, context) => {
            const [addSelected, removeSelected, addBlocked, removeBlocked] = await Promise.all([input.addSelected, input.removeSelected, input.addNeverAnswer, input.removeNeverAnswer].map(resolveSecretaryConversations))
            const jids = (rows: { jid: string }[]) => rows.map((row) => row.jid)
            return changeSecretarySettings(
                (settings) => applyAudiencePatch(settings, { mode: input.whoCanBeAnswered, direct: input.individualChats, groups: input.groups, groupReply: input.inGroups, addSelected: jids(addSelected), removeSelected: jids(removeSelected), addBlocked: jids(addBlocked), removeBlocked: jids(removeBlocked) }),
                context.actorId,
            )
        },
    }),
    defineTool({
        name: "update_secretary_subjects",
        group: "secretary",
        label: "Assuntos do Secretário",
        risk: "write",
        description:
            'Critérios › Sobre o quê: responder sobre qualquer assunto ou só sobre os liberados, e criar ou editar assuntos bloqueados e liberados pelo nome (nome igual edita; nome novo cria; newName renomeia), com descrição e exemplos. "Só os assuntos liberados" sem nenhum liberado é recusado; máximo de 20 por lista. Para remover, use remove_secretary_subject.',
        input: z.object({
            about: z.enum(["any", "only"]).optional().describe("any = Qualquer assunto; only = Só os assuntos liberados"),
            upsert: z
                .array(
                    z.object({
                        list: subjectList,
                        name: z.string().trim().min(1).max(60),
                        newName: z.string().trim().min(1).max(60).optional(),
                        description: z.string().trim().max(1000).optional(),
                        examples: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
                    }),
                )
                .max(20)
                .optional(),
        }),
        summarize: (input) => `Secretário — assuntos: ${[...(input.about ? [input.about === "only" ? "só os liberados" : "qualquer assunto"] : []), ...(input.upsert ?? []).map((item) => `${item.name} em ${SUBJECT_LIST_LABELS[item.list]}`)].join("; ")}`,
        execute: async (input, context) => {
            if (!input.about && !input.upsert?.length) throw new DomainError(400, "Informe o que mudar: about ou upsert.", "VALIDATION_ERROR")
            return changeSecretarySettings((settings) => {
                let next = input.about ? { ...settings, criteria: { ...settings.criteria, subjects: { ...settings.criteria.subjects, mode: input.about } } } : settings
                for (const item of input.upsert ?? []) next = upsertSubject(next, item.list, item).settings
                return next
            }, context.actorId)
        },
    }),
    defineTool({
        name: "remove_secretary_subject",
        group: "secretary",
        label: "Remover assunto do Secretário",
        risk: "write",
        confirmByDefault: true,
        description: 'Remove um assunto bloqueado ou liberado pelo nome. Remover o último liberado com "Só os assuntos liberados" é recusado (troque antes para qualquer assunto).',
        input: z.object({ name: z.string().trim().min(1).max(60), list: subjectList.optional() }),
        summarize: (input) =>
            `Remover o assunto "${input.name}" ${input.list ? `dos ${SUBJECT_LIST_LABELS[input.list]}` : "dos critérios"} do Agente Secretário${input.list === "blocked" ? ": ele volta a poder responder sobre esse assunto" : input.list === "allowed" ? ": o assunto deixa de ser liberado" : ""}`,
        execute: async (input, context) =>
            changeSecretarySettings((settings) => {
                const result = removeSubject(settings, input.name, input.list)
                if (!result) {
                    const names = [...settings.criteria.subjects.blocked, ...settings.criteria.subjects.allowed].map((rule) => rule.name)
                    throw new DomainError(404, `Assunto "${input.name}" não encontrado. Assuntos cadastrados: ${names.join(", ") || "nenhum"}.`, "SECRETARY_SUBJECT_NOT_FOUND")
                }
                return result.settings
            }, context.actorId),
    }),
    defineTool({
        name: "update_secretary_personality_block",
        group: "secretary",
        label: "Editar bloco da personalidade",
        risk: "write",
        description: "Grava o texto de um bloco da personalidade base do Secretário pelo título (ex.: Tom e formalidade). Título que não existe cria um bloco extra. Escreva em primeira pessoa, como o dono. Grava uma versão no histórico.",
        input: z.object({ title: z.string().trim().min(1).max(80), content: z.string().max(8000) }),
        summarize: (input) => `Editar o bloco "${input.title}" da personalidade do Secretário`,
        execute: async (input, context) => upsertSecretaryBaseBlock(input, context.actorId),
    }),
    defineTool({
        name: "remove_secretary_personality_block",
        group: "secretary",
        label: "Remover bloco da personalidade",
        risk: "write",
        confirmByDefault: true,
        description: "Remove um bloco extra da personalidade base pelo título; num bloco fixo, esvazia o texto (os fixos não saem). Grava uma versão no histórico (restaurável na tela).",
        input: z.object({ title: z.string().trim().min(1).max(80) }),
        summarize: (input) => `Remover o bloco "${input.title}" da personalidade do Secretário`,
        execute: async (input, context) => removeSecretaryBaseBlock(input.title, context.actorId),
    }),
    defineTool({
        name: "set_secretary_variant",
        group: "secretary",
        label: "Variante da personalidade",
        risk: "write",
        description: "Cria ou edita a variante da personalidade de uma conversa (pelo nome ou número): os blocos são mesclados pelo título (o mesmo título de um bloco da base complementa aquele bloco nesta conversa); texto vazio tira o bloco da variante. Grava uma versão no histórico.",
        input: z.object({
            conversation,
            title: z.string().trim().min(1).max(80).optional().describe("Nome da variante (padrão: o atual ou o nome da conversa)"),
            blocks: z.array(z.object({ title: z.string().trim().min(1).max(80), content: z.string().max(8000) })).min(1).max(40),
        }),
        summarize: (input) => `Editar a variante da personalidade do Secretário para ${input.conversation}`,
        execute: async (input, context) => upsertSecretaryVariant(input, context.actorId),
    }),
    defineTool({
        name: "remove_secretary_variant",
        group: "secretary",
        label: "Remover variante",
        risk: "write",
        confirmByDefault: true,
        description: "Remove a variante da personalidade de uma conversa (pelo nome ou número); a conversa volta a usar só a base. Grava uma versão no histórico.",
        input: z.object({ conversation }),
        summarize: (input) => `Remover a variante da personalidade do Secretário para ${input.conversation}`,
        execute: async (input, context) => removeSecretaryVariant(input.conversation, context.actorId),
    }),
    defineTool({
        name: "answer_secretary_question",
        group: "secretary",
        label: "Responder pergunta do Secretário",
        // Pode enviar mensagem a um contato (irreversível): destrutiva, para a tela avisar se a confirmação for desligada.
        risk: "destructive",
        description: "Responde uma pergunta pendente do Secretário ao dono (a mesma resposta da aba Avisos): o Secretário aprende a resposta como memória e retoma a conversa, podendo enviar mensagem ao contato. `ref` vem de pendingQuestions em get_secretary_settings (nunca mostre a ref ao dono).",
        input: z.object({ ref: z.string().trim().min(1).max(100), answer: noticeAnswerSchema.shape.answer }),
        summarize: (input) =>
            `Responder a pergunta pendente do Secretário com "${input.answer.length > 120 ? `${input.answer.slice(0, 119)}…` : input.answer}": ele aprende a resposta e pode retomar a conversa, enviando mensagem ao contato pelo WhatsApp`,
        execute: async (input, context) => answerSecretaryQuestion(input.ref, input.answer, context.actorId),
    }),
    defineTool({
        name: "discard_secretary_question",
        group: "secretary",
        label: "Descartar pergunta do Secretário",
        risk: "write",
        confirmByDefault: true,
        description: "Descarta uma pergunta pendente do Secretário ao dono (como na aba Avisos): a conversa não é retomada. `ref` vem de pendingQuestions em get_secretary_settings (nunca mostre a ref ao dono).",
        input: z.object({ ref: z.string().trim().min(1).max(100) }),
        summarize: () => "Descartar uma pergunta pendente do Agente Secretário: a conversa não é retomada e nada é aprendido",
        execute: async (input, context) => discardSecretaryQuestion(input.ref, context.actorId),
    }),
]
