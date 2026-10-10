# Documentação de Contexto para IA — Opex

Esta pasta contém documentação estruturada para desenvolvimento assistido por IA no Opex.

O Opex é um app Next.js **de uso pessoal** (um único usuário, protegido por um login com senha
única; roda localmente, em Docker ou publicado na internet) para acompanhar as tarefas do Centro
de Desenvolvimento do **Go!
Sipal** e apontar horas, com um módulo de **Integrações** para guardar credenciais e configurar os
serviços usados. O core (tema/componentes, layout, integrações, Pusher, crons) foi copiado do CRM
Marketing Campanhas (`~/code/crm-marketing-campanhas`, branch `dev`).

## Índice de Arquivos

### Diretrizes Gerais

**[use-sempre-que-desenvolver.md](./use-sempre-que-desenvolver.md)**
- Regras e princípios fundamentais do projeto
- Nomenclatura e estrutura de arquivos
- Auditoria, logging, tratamento de erros, testes e segurança

### Tema, Componentes e Experiência

**[use-para-atualizar-tema-e-componentes-ui.md](./use-para-atualizar-tema-e-componentes-ui.md)**
- Tema escuro fixo (primária `#8000FF`)
- Shadcn/Radix, kit de listas, sonner, lucide-react, date-fns
- Animações com Framer Motion, mock em testes
- Formulários, filtros na URL, listas virtualizadas

### Diretrizes e Decisões Arquiteturais

**[use-diretrizes-do-projeto.md](./use-diretrizes-do-projeto.md)**
- Visão geral da arquitetura
- Decisões técnicas e suas motivações
- Padrões de segurança, API, UI, testes e documentação

## Módulos (`modules/`)

| Arquivo | Módulo | Quando consultar |
|---|---|---|
| `modules/layout.md` | Layout e navegação | Shell, sidebar, menu (`APP_NAV`), páginas e 404 |
| `modules/auth.md` | Login e sessão | Tela `/login`, senha única (`APP_PASSWORD`), cookie assinado, guarda do middleware e logout |
| `modules/tasks.md` | Tarefas | Kanban/tabela locais, colunas configuráveis, projetos (repositórios), lote, página da tarefa |
| `modules/time.md` | Controle de horas | Controle de horas agêntico: períodos das mesas (abre/pausa/fecha), uso (tokens/custo), Horas agênticas (`/tarefas/horas`, somente leitura) |
| `modules/integrations.md` | Integrações e agendador | Pusher, API interna (OpenAPI + tokens de sistema), Crons, GitHub; abas na página da integração; Archflow em desenvolvimento |
| `modules/ai.md` | Provedores de IA | OpenCode e Gemini (Vercel AI SDK), `/integracoes/ia`, features "Entender tarefas", "Resumos de tarefas", "Orçamentos" (prévia), "Estimar prazos" (agente OpenCode com tools) e "Refinar tarefa" (aba de configuração) |
| `modules/refinement.md` | Refinar tarefa | Botão/modal na página da tarefa, sessão longa do OpenCode que faz perguntas e reescreve a especificação técnica, retomada em segundo plano |
| `modules/orcamentos.md` | Orçamentos | Integração Orçamentos (`/integracoes/orcamentos`), clientes com token, portal público do cliente (`/cliente`), prévia por IA + estimativa por agente OpenCode e criação da tarefa |
| `modules/agentic-dev.md` | Desenvolvimento agêntico | Centrais por projeto (repositório), mesa de trabalho (plano → implementação em worktree → prévia docker → PR → merge), OpenCode `@opencode/client`, `/desenvolvimento` |
| `modules/github.md` | GitHub | Vínculos repositório ↔ Opex (= Projeto), mapeamento, rotina de issues → tarefas, issue ↔ tarefa |

Novos módulos ganham um arquivo aqui quando forem implementados, conforme o fluxo obrigatório do
`AGENTS.md`.

## Quando Consultar Cada Arquivo

| Situação | Arquivo a Consultar |
|---|---|
| Regras gerais de desenvolvimento | `use-sempre-que-desenvolver.md` |
| Entender decisões arquiteturais | `use-diretrizes-do-projeto.md` |
| Tema, componente, animação, formulário ou lista | `use-para-atualizar-tema-e-componentes-ui.md` |
| Tempo real (Pusher) | `use-sempre-que-desenvolver.md`, seção "Tempo real" + `modules/integrations.md` |
| Issues do GitHub viram tarefas | `modules/github.md` |
| Componente que existe no CRM e ainda não foi copiado | `~/code/crm-marketing-campanhas` (somente leitura; copie e adapte) |

## Princípios-Chave

1. **Fonte de Verdade**: este aicontext reflete o estado **atual do código**. Quando algo ainda não
   existe, o documento diz explicitamente que é planejado.
2. **Atualização**: toda tarefa atualiza a doc do módulo afetado (fluxo obrigatório do `AGENTS.md`).
3. **Concisão**: documente comportamento, regras e decisões; não repita o código.
