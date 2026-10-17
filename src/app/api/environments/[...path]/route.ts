import { environmentRoute } from "@/features/environments/server/routes"
const handler = environmentRoute(false)
export { handler as GET, handler as POST, handler as PUT }
