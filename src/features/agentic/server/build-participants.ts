/** Extensão da fila global sem acoplar as mesas ao modelo de Ambientes. */
export interface BuildCandidate {
    id: string
    queuedAt: Date
    start: () => Promise<boolean>
}
export interface BuildParticipant {
    waiting: () => Promise<BuildCandidate[]>
    active: () => Promise<boolean>
}
const participants = new Map<string, BuildParticipant>()
export function registerBuildParticipant(name: string, participant: BuildParticipant): void {
    participants.set(name, participant)
}
export async function externalBuilds() {
    return (await Promise.all([...participants.values()].map((p) => p.waiting()))).flat()
}
export async function hasExternalBuild() {
    return (await Promise.all([...participants.values()].map((p) => p.active()))).some(Boolean)
}
