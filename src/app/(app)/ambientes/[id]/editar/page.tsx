import { EnvironmentEditorPage } from "@/features/environments/components/editor/EnvironmentEditorPage"

/** `/ambientes/[id]/editar`: editar um ambiente (OPE-211). Ver aicontext/modules/environments.md. */
export default async function EditarAmbientePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <EnvironmentEditorPage id={id} />
}
