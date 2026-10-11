import { OwnerPreviewReviewPage } from "@/features/tasks/preview/components/OwnerPreviewReviewPage"

export default async function RevisaoPreviaPage({ params }: { params: Promise<{ draftId: string }> }) {
    const { draftId } = await params
    return <OwnerPreviewReviewPage draftId={draftId} />
}
