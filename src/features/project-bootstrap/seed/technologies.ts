/**
 * Carga inicial do catálogo de tecnologias do Agente de Bootstrap (OPE-215): os grupos e as tecnologias
 * em uso hoje nos projetos do host. Gravada uma única vez; depois, a edição é só pela tela (ou pelas
 * ferramentas do Agente Opex).
 */

export interface SeedTechGroup {
    name: string
    color: string
    technologies: readonly { name: string; aliases: readonly string[] }[]
}

export const SEED_TECH_GROUPS: readonly SeedTechGroup[] = [
    {
        name: "Linguagem",
        color: "#A855F7",
        technologies: [
            { name: "TypeScript", aliases: ["ts"] },
            { name: "JavaScript", aliases: ["js"] },
            { name: "Rust", aliases: [] },
            { name: "Go", aliases: ["golang"] },
            { name: "Python", aliases: [] },
            { name: "Java", aliases: [] },
            { name: "Kotlin", aliases: [] },
            { name: "C#", aliases: ["csharp", "dotnet", ".net"] },
            { name: "PHP", aliases: [] },
            { name: "Lua", aliases: [] },
        ],
    },
    {
        name: "Banco de dados",
        color: "#22C55E",
        technologies: [
            { name: "MongoDB", aliases: ["mongo", "mongoose"] },
            { name: "PostgreSQL", aliases: ["postgres"] },
            { name: "MySQL", aliases: ["mariadb"] },
            { name: "SQLite", aliases: ["sqlite3"] },
            { name: "Redis", aliases: ["valkey"] },
        ],
    },
    {
        name: "Frontend",
        color: "#3B82F6",
        technologies: [
            { name: "Next.js", aliases: ["next", "nextjs"] },
            { name: "React", aliases: ["reactjs"] },
            { name: "Vite", aliases: [] },
            { name: "Vue", aliases: ["vuejs", "vue.js"] },
            { name: "Svelte", aliases: ["sveltekit"] },
            { name: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"] },
            { name: "shadcn/ui", aliases: ["shadcn"] },
        ],
    },
    {
        name: "Backend",
        color: "#F59E0B",
        technologies: [
            { name: "Node.js", aliases: ["node", "nodejs"] },
            { name: "Express", aliases: ["expressjs"] },
            { name: "Fastify", aliases: [] },
            { name: "NestJS", aliases: ["nest", "nest.js"] },
            { name: "Axum", aliases: [] },
            { name: "Actix", aliases: ["actix-web"] },
            { name: "FastAPI", aliases: [] },
            { name: "Django", aliases: [] },
            { name: "Prisma", aliases: [] },
        ],
    },
    {
        name: "Infraestrutura",
        color: "#06B6D4",
        technologies: [
            { name: "Docker", aliases: ["dockerfile"] },
            { name: "Docker Compose", aliases: ["docker-compose", "compose"] },
            { name: "nginx", aliases: [] },
            { name: "GitHub Actions", aliases: ["gh actions"] },
            { name: "Cloudflare", aliases: [] },
        ],
    },
    {
        name: "Serviços",
        color: "#EC4899",
        technologies: [
            { name: "Soketi", aliases: ["pusher", "websocket", "websockets"] },
            { name: "MinIO", aliases: ["s3"] },
            { name: "Gotenberg", aliases: [] },
            { name: "Evolution API", aliases: ["evolution", "whatsapp"] },
            { name: "Umami", aliases: [] },
            { name: "Engramind", aliases: [] },
            { name: "AbacatePay", aliases: ["abacate pay"] },
        ],
    },
]
