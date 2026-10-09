import { redirect } from "next/navigation"
import { HOME_HREF } from "@/features/layout/navigation"

export default function HomePage() {
    redirect(HOME_HREF)
}
