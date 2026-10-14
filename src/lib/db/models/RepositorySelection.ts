import { Schema, model, models, type Model } from "mongoose"

/**
 * Uso recente de um repositório por um **ator** (o dono ou um usuário do portal do cliente).
 *
 * Guarda apenas *qual* repositório foi escolhido e *quando* — nunca a seleção em si (o valor vive no
 * formulário/filtro). A coleção é a fonte da ordenação "selecionado recentemente" dos seletores de
 * repositório, compartilhada entre as telas do mesmo ator.
 *
 * `actorId` é a identidade confiável resolvida no servidor (`LOCAL_USER_ID` para o dono, o id do
 * usuário para o portal) — nunca vem do navegador. O par (`actorId`, `projectId`) é único: cada
 * escolha apenas atualiza `lastSelectedAt`.
 */
export interface IRepositorySelection {
    actorId: string
    projectId: string
    lastSelectedAt: Date
    createdAt: Date
    updatedAt: Date
}

const RepositorySelectionSchema = new Schema<IRepositorySelection>(
    {
        actorId: { type: String, required: true, index: true },
        projectId: { type: String, required: true },
        lastSelectedAt: { type: Date, required: true },
    },
    { collection: "repository_selections", versionKey: false, timestamps: true },
)

RepositorySelectionSchema.index({ actorId: 1, projectId: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.RepositorySelection
}

export const RepositorySelection: Model<IRepositorySelection> =
    (models.RepositorySelection as Model<IRepositorySelection>) || model<IRepositorySelection>("RepositorySelection", RepositorySelectionSchema)
