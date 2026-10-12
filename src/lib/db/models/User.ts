import { Schema, model, models, type Model } from "mongoose"

/**
 * Usuários do Opex (collection `users`).
 *
 * O **dono** do app não vive aqui: ele vem do `.env` (`ADMIN_USER`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`).
 * Esta coleção guarda os **usuários de cliente**, que são **globais** (um mesmo login pode pertencer
 * a vários clientes) e entram pelo `/login` (username/email + senha) ou pela URL com token.
 *
 * - `memberships`: vínculo com cada cliente; a flag `admin` é **por vínculo** (admin em um cliente,
 *   comum em outro).
 * - `defaultForClientId`: quando preenchido, este é o **usuário padrão** do cliente — criado junto
 *   com ele, sem email/senha, e autenticado pelo **token do cliente** (a URL do padrão é a URL do
 *   cliente). Não guarda token próprio.
 * - Demais usuários têm `token`/`tokenHash`/`tokenPrefix` próprios (URL de login individual).
 */

export interface IUserMembership {
    clientId: string
    admin: boolean
}

export interface IUser {
    /** Login único e global. */
    username: string
    /** Email opcional (único quando presente); aceito também como identificador de login. */
    email: string | null
    /** Hash scrypt da senha (`scrypt$N$r$p$sal$hash`); `null` = sem senha (só entra por URL). */
    passwordHash: string | null
    memberships: IUserMembership[]
    /** Valor do token próprio (`usr_…`), em claro, para montar a URL copiável. */
    token: string | null
    /** SHA-256 do token próprio (usado na autenticação). */
    tokenHash: string | null
    /** Prefixo visível do token próprio. */
    tokenPrefix: string | null
    /** Cliente do qual este usuário é o **padrão** (usa o token do cliente); `null` nos demais. */
    defaultForClientId: string | null
    active: boolean
    createdAt: Date
    updatedAt: Date
}

const UserMembershipSchema = new Schema<IUserMembership>(
    {
        clientId: { type: String, required: true },
        admin: { type: Boolean, default: false },
    },
    { _id: false },
)

const UserSchema = new Schema<IUser>(
    {
        username: { type: String, required: true, unique: true },
        email: { type: String, default: null },
        passwordHash: { type: String, default: null },
        memberships: { type: [UserMembershipSchema], default: [] },
        token: { type: String, default: null },
        tokenHash: { type: String, default: null, index: true },
        tokenPrefix: { type: String, default: null },
        defaultForClientId: { type: String, default: null, index: true },
        active: { type: Boolean, default: true },
    },
    { collection: "users", versionKey: false, timestamps: true },
)

// Email único apenas quando presente (índice parcial: `null` não colide).
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } })
// Busca dos usuários de um cliente (lista da aba Usuários).
UserSchema.index({ "memberships.clientId": 1 })

if (process.env.NODE_ENV === "development") {
    delete models.User
}

export const User: Model<IUser> = (models.User as Model<IUser>) || model<IUser>("User", UserSchema)
