import { z } from "zod"
import { techGroupInputSchema, technologyInputSchema } from "@/features/project-bootstrap/schemas"
import { defineTool } from "./define"

/**
 * Agente de Bootstrap (OPE-215): o catálogo de tecnologias e os grupos, as skills do host que o agente
 * usa e a consulta dos bootstraps. Iniciar um bootstrap NÃO é ferramenta (só pela tela). O conteúdo das
 * skills fica com as ferramentas de recursos do OpenCode. As funções de serviço são as da tela.
 */

const id = z.string().trim().regex(/^[a-f0-9]{24}$/i, "Id inválido")
// Entrada simples para o modelo (como as cores favoritas); a validação completa é a do schema da tela.
const groupInput = z.object({ name: z.string().trim().min(1).max(40).describe("Nome do grupo (ex.: Banco de dados)"), color: z.string().trim().min(1).max(7).describe("Cor em hexadecimal #RRGGBB (ex.: #22C55E)") })
const catalog = () => import("@/features/project-bootstrap/server/catalog")
const settings = () => import("@/features/project-bootstrap/server/settings")
const service = () => import("@/features/project-bootstrap/server/service")

export const projectBootstrapTools = [
    defineTool({
        name: "list_bootstrap_tech_catalog",
        group: "project-bootstrap",
        label: "Catálogo de tecnologias do bootstrap",
        risk: "read",
        description: "Grupos (nome, cor, ordem, quantidade) e tecnologias (nome, variantes reconhecidas no texto, grupo) do catálogo do Agente de Bootstrap.",
        input: z.object({}),
        execute: async () => (await catalog()).getTechCatalog(),
    }),
    defineTool({
        name: "create_bootstrap_tech_group",
        group: "project-bootstrap",
        label: "Criar grupo de tecnologias",
        risk: "write",
        description: "Cria um grupo do catálogo de tecnologias do bootstrap com nome e cor (#RRGGBB).",
        input: groupInput,
        summarize: (input) => `Criar o grupo de tecnologias ${input.name}`,
        execute: async (input, context) => (await catalog()).createTechGroup(techGroupInputSchema.parse(input), context.actorId),
    }),
    defineTool({
        name: "update_bootstrap_tech_group",
        group: "project-bootstrap",
        label: "Editar grupo de tecnologias",
        risk: "write",
        description: "Renomeia ou troca a cor (#RRGGBB) de um grupo do catálogo.",
        input: groupInput.extend({ id }),
        summarize: (input) => `Editar o grupo de tecnologias ${input.name}`,
        execute: async ({ id: groupId, ...input }, context) => (await catalog()).updateTechGroup(groupId, techGroupInputSchema.parse(input), context.actorId),
    }),
    defineTool({
        name: "delete_bootstrap_tech_group",
        group: "project-bootstrap",
        label: "Remover grupo de tecnologias",
        risk: "destructive",
        description: "Remove um grupo do catálogo. Um grupo que ainda tem tecnologias é recusado: mova ou remova as tecnologias antes.",
        input: z.object({ id }),
        summarize: (input) => `Remover o grupo de tecnologias ${input.id}`,
        execute: async (input, context) => {
            await (await catalog()).deleteTechGroup(input.id, context.actorId)
            return { removed: input.id }
        },
    }),
    defineTool({
        name: "create_bootstrap_technology",
        group: "project-bootstrap",
        label: "Criar tecnologia",
        risk: "write",
        description: "Cria uma tecnologia no catálogo: nome, variantes reconhecidas no texto (ex.: next, nextjs) e o id do grupo.",
        input: technologyInputSchema,
        summarize: (input) => `Criar a tecnologia ${input.name}`,
        execute: async (input, context) => (await catalog()).createTechnology(input, context.actorId),
    }),
    defineTool({
        name: "update_bootstrap_technology",
        group: "project-bootstrap",
        label: "Editar tecnologia",
        risk: "write",
        description: "Edita o nome, as variantes ou o grupo de uma tecnologia do catálogo (as variantes informadas substituem as atuais).",
        input: z.object({ id, name: z.string(), aliases: z.array(z.string()), groupId: z.string() }),
        summarize: (input) => `Editar a tecnologia ${input.name}`,
        execute: async ({ id: techId, ...input }, context) => (await catalog()).updateTechnology(techId, technologyInputSchema.parse(input), context.actorId),
    }),
    defineTool({
        name: "delete_bootstrap_technology",
        group: "project-bootstrap",
        label: "Remover tecnologia",
        risk: "destructive",
        description: "Remove uma tecnologia do catálogo. Bootstraps já enviados mantêm a lista que receberam.",
        input: z.object({ id }),
        summarize: (input) => `Remover a tecnologia ${input.id}`,
        execute: async (input, context) => {
            await (await catalog()).deleteTechnology(input.id, context.actorId)
            return { removed: input.id }
        },
    }),
    defineTool({
        name: "get_bootstrap_agent_skills",
        group: "project-bootstrap",
        label: "Skills do Agente de Bootstrap",
        risk: "read",
        description: "Skills do OpenCode do host liberadas na sessão do Agente de Bootstrap (id ou nome). O conteúdo delas é lido e editado com as ferramentas de recursos do OpenCode.",
        input: z.object({}),
        execute: async () => ({ skills: (await (await settings()).loadProjectBootstrapSettings()).settings.skills }),
    }),
    defineTool({
        name: "set_bootstrap_agent_skills",
        group: "project-bootstrap",
        label: "Escolher as skills do Agente de Bootstrap",
        risk: "write",
        description: "Substitui a lista de skills do OpenCode do host que o Agente de Bootstrap usa (id ou nome de cada skill instalada). Lista vazia = o agente segue só com as instruções.",
        input: z.object({ skills: z.array(z.string().trim().min(1).max(120)).max(20) }),
        summarize: (input) => `Usar ${input.skills.length} skill(s) no Agente de Bootstrap`,
        execute: async (input, context) => {
            const store = await settings()
            const { settings: current } = await store.loadProjectBootstrapSettings()
            return (await store.saveProjectBootstrapSettings({ ...current, skills: input.skills }, context.actorId)).settings.skills
        },
    }),
    defineTool({
        name: "list_project_bootstraps",
        group: "project-bootstrap",
        label: "Bootstraps de projeto",
        risk: "read",
        description: "Bootstraps de projeto (repositório, etapa, estado e tentativa), do mais recente ao mais antigo. `active: true` traz só os em andamento, aguardando o dono ou com falha.",
        input: z.object({ active: z.boolean().optional() }),
        execute: async (input) => (await service()).listProjectBootstraps({ active: input.active === true }),
    }),
    defineTool({
        name: "get_project_bootstrap",
        group: "project-bootstrap",
        label: "Estado do bootstrap",
        risk: "read",
        description: "Estado de um bootstrap: etapa, estado, erro, o que faltou na conferência, o resumo do agente, o que já foi criado (vínculo, central, ambiente, deploy) e as tentativas de deploy. Não inicia nem retoma nada.",
        input: z.object({ id }),
        execute: async (input) => {
            const { loadBootstrapDoc } = await import("@/features/project-bootstrap/server/runner")
            const { toBootstrapDto } = await service()
            const full = toBootstrapDto(await loadBootstrapDoc(input.id))
            return { ...full, pendingForms: full.pendingForms.length, pendingPermissions: full.pendingPermissions.length }
        },
    }),
]
