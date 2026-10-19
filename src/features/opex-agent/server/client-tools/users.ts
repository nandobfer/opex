import { z } from "zod"
import { USERNAME_PATTERN } from "@/features/orcamentos/logic"
import { deleteClientUser, listClientUsers, updateClientUser } from "@/features/orcamentos/server/users"
import { defineTool } from "../tools/define"
import { requireClientActor } from "./helpers"

const userSchema = {
    userId: z.string().trim().min(1).max(40).describe("Id do usuário (de list_users)"),
    username: z.string().trim().regex(USERNAME_PATTERN, "3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado"),
    email: z.union([z.string().trim().email("Email inválido").max(200), z.literal("")]).optional(),
    password: z.string().max(200).optional().describe("Nova senha (vazia mantém a atual)"),
    admin: z.boolean().describe("Administrador do cliente (Financeiro e Usuários)"),
}

/** Gestão de usuários do cliente — espelha a tela Usuários, que no portal é só do **admin**. */
export const clientUserTools = [
    defineTool({
        name: "list_users",
        group: "users",
        label: "Listar usuários",
        risk: "read",
        adminOnly: true,
        description: "Usuários vinculados ao cliente: nome, email, papel (admin ou não), se é o padrão e os outros clientes compartilhados. Nunca mostra senhas ou tokens.",
        input: z.object({}),
        execute: async (_input, context) => {
            const actor = requireClientActor(context)
            // Sem `portalPath` (carrega o token de login) nem qualquer segredo: o modelo e o chat só
            // precisam de quem é o usuário e qual é o papel dele.
            return (await listClientUsers(actor.client)).map((user) => ({
                id: user.id,
                username: user.username,
                email: user.email,
                admin: user.admin,
                isDefault: user.isDefault,
                active: user.active,
                memberships: user.memberships,
            }))
        },
    }),
    defineTool({
        name: "update_user",
        group: "users",
        label: "Editar usuário",
        risk: "write",
        adminOnly: true,
        description:
            "Edita um usuário do cliente (nome, email, senha e papel de admin). Usuário compartilhado com outros clientes só pode ser alterado pelo dono do Opex. A senha nunca aparece no chat, nos cards nem no histórico.",
        input: z.object(userSchema),
        redact: (input) => ({ ...input, password: input.password ? "[senha omitida]" : undefined }),
        summarize: (input) => `Editar o usuário ${input.username} (${input.admin ? "administrador" : "usuário"})`,
        execute: async ({ userId, ...input }, context) => {
            const actor = requireClientActor(context)
            const updated = await updateClientUser(actor.client, userId, input, actor.userId, { owner: false })
            return { id: updated.id, username: updated.username, email: updated.email, admin: updated.admin, active: updated.active }
        },
    }),
    defineTool({
        name: "delete_user",
        group: "users",
        label: "Remover usuário",
        risk: "destructive",
        adminOnly: true,
        description: "Remove o vínculo do usuário com o cliente (sem outros vínculos, o usuário é excluído). O usuário padrão do cliente não pode ser removido. Sempre pede confirmação.",
        input: z.object({ userId: z.string().trim().min(1).max(40), username: z.string().trim().min(1).max(80).describe("Nome do usuário, só para a frase de confirmação") }),
        summarize: (input) => `Remover o usuário ${input.username} do cliente`,
        execute: async ({ userId }, context) => {
            const actor = requireClientActor(context)
            await deleteClientUser(actor.client, userId, actor.userId, { owner: false })
            return { id: userId, deleted: true }
        },
    }),
]
