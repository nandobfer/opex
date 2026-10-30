import { dbConnect } from "@/lib/db"
import { AgenticCentral } from "@/lib/db/models/Agentic"
import type { AgentCentralOption } from "../types"

/** Centrais existentes (opções do filtro Central das páginas do Adversário e do Mentor). */
export async function listCentralOptions(): Promise<AgentCentralOption[]> {
    await dbConnect()
    const docs = await AgenticCentral.find().select({ projectName: 1 }).sort({ projectName: 1 }).lean()
    return docs.map((doc) => ({ id: String(doc._id), projectName: doc.projectName }))
}
