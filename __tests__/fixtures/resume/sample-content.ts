import type { ResumeContent } from "@/features/agent-documents/schemas"

/**
 * Conteúdo do currículo de referência aprovado pelo dono (`curriculo-fernando-burgos-2026-11-15.html`, OPE-210),
 * com telefone e e-mail trocados por valores fictícios (o repositório é público). Renderizado com o modelo,
 * deve reproduzir o HTML da fixture.
 */
export const REFERENCE_RESUME_CONTENT: ResumeContent = {
    nome: "Fernando Burgos Fernandes",
    titulo: "Senior Software Engineer · Full-Stack & AI Systems · TypeScript, Node.js, Rust",
    contato: ["Curitiba, Brazil (remote)", "fernando@example.com", "+55 00 00000-0000", "linkedin.com/in/fernando-burgos-fernandes", "github.com/nandobfer"],
    perfil:
        "Software engineer with 7 years of professional experience, programming since 2012 — senior in backend and in AI automation. I build the layer that makes AI and ERP work inside a real business product: data model, API, interface and production operation. Most AI projects stall between the demo and production — a legacy system that does not expose the data, memory that does not survive between runs, token cost out of control. That is the part I build.",
    competencias: [
        { grupo: "Languages", itens: "TypeScript, JavaScript, Python, Rust, SQL" },
        { grupo: "Backend", itens: "Node.js, Next.js (API routes), Prisma, REST, OpenAPI, SSE, webhooks, Socket.IO, authentication and permissions" },
        { grupo: "Data", itens: "PostgreSQL, MongoDB, MySQL, SQLite (WAL, sqlite-vec, FTS5), hybrid search fused by RRF" },
        { grupo: "AI", itens: "LLM APIs (Anthropic, OpenAI, Google, DeepSeek), tool calling, structured output, MCP, durable agent memory, RAG, LLM-as-judge evals, embedding and LLM workers" },
        { grupo: "Frontend & mobile", itens: "React, React Native, Next.js" },
        { grupo: "ERP & integrations", itens: "SAP (Business Partner, trade slip, purchasing, transport and freight; CDS Views, OData), WhatsApp/Meta, PagSeguro" },
        { grupo: "Delivery", itens: "Docker, GitHub Actions, CI/CD, Vitest, Prometheus, Vercel" },
    ],
    experiencias: [
        {
            cargo: "Senior Software Engineer",
            empresa: "Sipal",
            periodo: "Feb 2026 – Present",
            topicos: [
                "Grain trading platform: pricing per crop, CIF/FOB, CBOT, FX and premiums; audited approval and the contract generated in SAP in the same flow.",
                "Rust middleware that centralizes application access to SAP (Business Partner, trade slip, purchasing, transport and freight), with per-application token, idempotent ledger audited in PostgreSQL, OpenAPI/Swagger, Prometheus metrics and S/4HANA CDS Views over OData.",
                "AI infrastructure: durable memory for agents with hierarchical channels, context versioned by ETag to preserve prompt caching and hybrid search (vector with sqlite-vec plus full-text with FTS5, fused by RRF); exposed over REST, MCP Streamable HTTP and CLI, with LLM and embedding workers.",
                "Multi-tenant SaaS: each company gets its own CRM, branding, rules and permissions by role and branch in the same application and database, selected by slug, with automated container provisioning per tenant.",
                "Published npm package with entry points for server, AI (Vercel AI SDK and MCP) and React, with SSE, HMAC-SHA256 webhook and graph memory visualization; authorization library with tree catalog, roles, scopes and guards.",
            ],
        },
        {
            cargo: "Full-Stack Engineer",
            empresa: "Agência BOZ",
            periodo: "Apr 2022 – Feb 2026",
            topicos: [
                "LLM products: sales and prospecting agents, AI-assisted code review and image generation with Anthropic, OpenAI, Google and DeepSeek.",
                "Customer service over WhatsApp run by agents through MCP, and web and mobile projects for the agency clients.",
                "Apps published on the App Store and on Google Play.",
            ],
        },
        { cargo: "Software Developer", empresa: "Quaestum", periodo: "Apr 2022 – Jun 2023", topicos: [] },
    ],
    anteriores: "about 2 years as software development intern and trainee, before 2022 — the foundation in process, data modelling and production support that still shapes how I design systems.",
    destaques: [
        { titulo: "Agent harness", texto: "plugin architecture for tools, draft → preview → stable cycle and tool exposure to both the agent and MCP clients." },
        { titulo: "Agent memory", texto: "durable hierarchical channels with retrieval over hybrid search, served through REST, MCP and CLI." },
        { titulo: "AI gateway", texto: "cost per consumer and per plan, key rotation per provider and fallback between models on quota." },
        { titulo: "Agentic customer service", texto: "two-stage criteria, simulation and escalation to the owner over WhatsApp." },
        { titulo: "Evals", texto: "rubric-based evaluation with LLM-as-judge over structured output." },
    ],
    formacao: [{ titulo: "Mechatronics Engineering", detalhe: "UTFPR, Curitiba, Brazil" }],
    certificacoes: [{ titulo: "SAP ACM", detalhe: "certification" }],
    idiomas: "Portuguese (native); English (advanced, working proficiency)",
    idioma: "en",
}
