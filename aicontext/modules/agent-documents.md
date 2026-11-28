# Documentos dos agentes (OPE-210)

Motor compartilhado de **PDF** e de **arquivos dos agentes**, mais o grupo de ferramentas **Documentos**
(`gerar_pdf`, `obter_pdf`, `upload_s3`, `get_s3`, `preparar_curriculo`, `obter_curriculo`) usado pelo Agente
Opex, pelo motor Opex dos agentes rotineiros e pelo MCP do dono (Maddox). Não há tela nem evento de tempo
real: o catálogo só é acessado pelas ferramentas e pelas funções do motor.

## Onde fica

| Camada | Arquivo | O que faz |
|---|---|---|
| Infra (`src/lib/pdf/`) | `gotenberg.ts` | Cliente do Gotenberg: `convertHtmlToPdf`, `screenshotHtml`, `gotenbergHealth` (multipart com `fetch`/`FormData` nativos) |
| | `pages.ts` (puro) | Tamanhos A4/Carta, orientação, mm↔pol↔px, `countPdfPages` |
| | `fit.ts` (puro) | `fitToPages`: ajuste da escala a N páginas |
| | `html-guard.ts` (puro) | Recusa HTML que busca recurso externo ou roda JavaScript |
| | `preview.ts` (puro) | HTML da prévia PNG (margens e escala do PDF) |
| Feature (`src/features/agent-documents/`) | `constants.ts`, `schemas.ts` (puros) | Prefixo do bucket, limites, schemas Zod das ferramentas |
| | `server/store.ts` | Catálogo + bucket: gravar, envio por URL, finalizar, ler, URLs, busca, auditoria |
| | `server/pdf.ts` | `renderHtmlPdf` (só renderiza) e `generateAgentPdf` (renderiza e guarda) |
| | `server/resume/template.ts` (puro) | Modelo do currículo aprovado (`renderResumeHtml`, densidades) |
| | `server/resume/service.ts` | `prepareResume` (degraus) e `findResumes` |
| | `server/origin.ts` | Origem a partir do contexto da ferramenta |
| | `server/candidatador-patch.ts` | Migração do Candidatador (ver abaixo) |
| Modelo | `src/lib/db/models/AgentFile.ts` | Coleção `agent_files` |
| Ferramentas | `src/features/opex-agent/server/tools/documents.ts` | As 6 ferramentas (só chamam o motor, nunca HTTP) |

Outras features podem usar o motor direto: `renderHtmlPdf` para só gerar o PDF, `generateAgentPdf` e
`saveAgentFile` para guardar no espaço dos agentes.

## Conversão HTML → PDF (Gotenberg)

- Serviço compartilhado no host, gerenciado por Opex › Ambientes: projeto Compose `/home/burgos/opex-envs/gotenberg`,
  imagem `gotenberg/gotenberg:9.10.3-chromium`, rede externa `gotenberg-network` (alias `gotenberg`), porta só no
  loopback (`127.0.0.1:3010`). O serviço `app` do Opex entra na rede (ver `deployment.md`).
- Integração **Gotenberg (PDF)** (`gotenberg`, `/integracoes/gotenberg`, interno, sem `env`, configurada só pela tela):
  - `url` — URL interna (`http://gotenberg:3000`), obrigatória;
  - `timeoutSeconds` — tempo limite de cada conversão (30 s; 5–120);
  - `urlTtlMinutes` — validade padrão das URLs dos documentos (15 min; 1–1440);
  - `urlTtlMaxMinutes` — validade máxima que o agente pode pedir (60 min; 1–10080). Se ficar abaixo da padrão,
    vale a menor das duas (não há validação cruzada na tela).
  - Tester: `GET /health`, exige `status: up` e Chromium `up`. Debug (`streamsDebugOverPusher`): rota, tamanho do
    HTML, escala, status, bytes e duração — nunca o conteúdo.
- PDF: `POST /forms/chromium/convert/html` com `index.html`, `paperWidth`/`paperHeight` (A4 8,27×11,69 pol.; Carta
  8,5×11), `marginTop/Right/Bottom/Left` (pol.), `printBackground`, `preferCssPageSize` e `scale`.
- PNG: `POST /forms/chromium/screenshot/html` (`format=png`, largura e altura da página a 96 dpi, `clip`). A rota
  renderiza a tela, não a página impressa: `previewHtml` injeta um `<style>` de tela com `zoom` = escala final e as
  margens da página, para a imagem reproduzir a primeira página do PDF.
- Falhas viram `DomainError` em pt-BR, sem o HTML: sem URL → 503 `GOTENBERG_NOT_CONFIGURED`; tempo limite → 504
  `GOTENBERG_TIMEOUT`; rede → 502 `GOTENBERG_UNREACHABLE`; HTTP de erro → 502 `GOTENBERG_FAILED` (status e até 200
  caracteres do corpo). Nada é gravado quando a conversão falha (sem gravação parcial).

### Ajuste a N páginas (`fitToPages`)

1. Renderiza na escala máxima (1). Cabe em `maxPages`? Termina.
2. Renderiza na escala mínima (padrão 0,8; aceita 0,5–1). Não cabe? Devolve esse PDF com `coube: false` e o aviso
   "Não coube em N página(s) nem com escala X (ficou com Y páginas): reduza o conteúdo."
3. Busca binária entre as duas (precisão 0,01), guardando a **maior** escala que cabe.

Teto de renderizações: 6 por padrão, máximo 8. A contagem de páginas (`countPdfPages`) conta os objetos
`/Type /Page` da saída do Chromium; contagem 0 é erro (`AGENT_PDF_PAGES_UNKNOWN`), nunca "cabe".

### Guarda contra SSRF no HTML

O Chromium roda na rede interna; pela mesma razão de a Chamada HTTP ficar fora dos tokens, o HTML só pode trazer
recursos embutidos. `html-guard.ts` recusa (400 `AGENT_PDF_HTML_EXTERNAL`, orientando a usar `data:` URI):
`<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<frame>`, `<base>`, `<meta http-equiv=refresh>`, `@import`,
`url(...)` que não seja `data:`/`#`, `src`/`srcset`/`poster`/`background`/`data` que não sejam `data:`, `href` de
`<image>`/`<use>`/`<feImage>` do SVG, atributos de evento (`on...=` em qualquer tag, inclusive `<svg/onload=>`),
`javascript:` como valor de atributo, funções de CSS que buscam por string (`image-set(`, `image(`, `src(`,
`cross-fade(`, `element(`), CSS executável (`expression(`, `behavior:`), escape com barra invertida no CSS (a única
aceita é uma string de um caractere escapado, como o `content:"\2013"` do currículo) e entidade nomeada desconhecida
em CSS ou URL (`&lpar;`). `<a href>` é aceito (o link não é buscado).

Duas camadas no app: regras globais por regex sobre o documento inteiro e um tokenizador das tags que respeita aspas
(um `>` dentro de `title=">"` não fecha a tag), lê o `<style>` até o `</style` ou até o fim do documento (sem
fechamento) e recusa qualquer `<` dentro dele (no `<style>` de `<svg>`/`<math>` a marcação vale como HTML), decodifica entidades numéricas antes de conferir CSS e URLs (inclusive `java&#x09;script:` e o `<style>`
do SVG) e trata comentários `<!-- -->` como texto (recusa a mais, nunca a menos). A camada do host abaixo é a que fecha
a rede de vez. Defesa em profundidade no host
(Variáveis extras do ambiente `gotenberg`): `CHROMIUM_DENY_PRIVATE_IPS=true` e `CHROMIUM_DISABLE_JAVASCRIPT=true`
(opções `--chromium-deny-private-ips` e `--chromium-disable-javascript` do Gotenberg 9.10). São pré-requisito de
deploy do Gotenberg compartilhado: o código do Opex não as impõe (o compose do Gotenberg vive fora do repositório).

## Arquivos dos agentes (espaço isolado no bucket)

- Toda chave é `agent-files/<ObjectId>/<nome sanitizado>`, gerada pelo servidor (`buildAgentKey`). `assertAgentKey`
  confere prefixo e formato exatos (recusa `..`, barra invertida, controle) antes de gravar, ler, gerar URL ou head.
  As ferramentas recebem só o **id do catálogo**; a chave nunca sai no DTO. Anexos de tarefas, arquivos do chat, do
  portal e de clientes ficam fora de alcance.
- URLs temporárias (download e envio PUT) assinadas com o **Endpoint público** da Storage S3 (`audience: "browser"`),
  porque quem baixa ou envia pode estar fora do servidor (ex.: o navegador do Galaxy). Validade pela integração
  Gotenberg (padrão 15 min, limitada à máxima e ao teto de 7 dias do SigV4). Os segredos da Storage S3 nunca saem.
- Catálogo `agent_files` (`AgentFile`): `name`, `mimeType`, `size`, `pages`, `key`, `kind` (`file`/`pdf`/`resume`),
  `status` (`ready`/`pending`), `origin` (`type`: `routine`/`opex`/`maddox`/`api-token`/`app`; `agentId`, `agentName`,
  `runId`, `sessionId`, `tokenId`, `tool`), `metadata` (mapa texto→texto), `parentId` (HTML e PNG apontam para o PDF
  do currículo), `pdf` (`format`, `orientation`, `scale`, `fits`, `maxPages`), `resume` (`content`, `language`,
  `density`, `htmlFileId`, `pngFileId`), `upload` (pendente: `maxBytes`, `expiresAt`), `createdAt`.
  Índices: `createdAt`, `kind+createdAt`, `origin.agentId+createdAt`, `origin.runId`, `metadata.empresa`,
  `metadata.vaga`, `metadata.jobId`, `parentId` (migração `ensure-agent-file-indexes`).
- Origem (`server/origin.ts`): `context.routine` (`{ agentId, runId }`, preenchido pelo motor Opex, pelo MCP da
  execução, pela ação confirmada e pela conversa com o rotineiro, `runId: null`) → `routine` com o nome do agente;
  token de sistema → `api-token`; sessão → `opex`/`maddox` (`OpexSession.agent`); senão `app`.
- Envio pela URL: cria o registro `pending` e devolve a URL PUT (o cliente manda `Content-Type` igual ao `tipo`). A
  primeira leitura ou busca chama `finalizePending`: `headFile` → grava o tamanho e marca `ready`; ainda não enviado
  → continua "aguardando envio" (sem URL de download); acima do tamanho declarado (ou de 25 MB) → o objeto é
  removido, o registro volta a pendente e a leitura responde 413. A assinatura não fixa o tamanho: o limite é
  conferido na finalização. Enquanto a URL de envio vale (`upload.expiresAt`), um novo PUT pode trocar o objeto: cada
  leitura confere de novo pelo `headFile` e o tamanho do catálogo acompanha o real (acima do limite, remove).
- O texto inline do `get_s3` só é lido quando o `contentLength` real do objeto cabe em 64 KB; acima disso o corpo não
  é lido (só a URL) e o tamanho do catálogo é corrigido.
- Falha ao registrar no catálogo depois do envio ao bucket remove o objeto recém-gravado (sem órfão em `agent-files/`).
- **Sem limpeza automática** (decisão desta entrega, plano aprovado): registros `pending` com a URL vencida e nunca
  usada ficam no catálogo como "aguardando envio", e os arquivos dos agentes não expiram. Uma rotina de limpeza
  (pendentes vencidos e o objeto, se houver) pode entrar depois no agendador.
- Busca (`agentFileQuery`): id; origem (`agente` = id ou nome exato sem diferenciar maiúsculas, `execucao`,
  `ferramenta`); metadados exatos; período (`de`/`ate`, só a data inclui o dia inteiro); parte do nome (escapada).
  Mais recentes primeiro, 10 por padrão, até 20.
- Auditoria `DocumentoAgente`: `CRIAR` na gravação e na URL de envio, `EXECUTAR` (operação `ler`) em cada leitura;
  só nome, tipo, tamanho, categoria e origem — nunca o conteúdo. Log Pino `feature: agent-documents`.

## Limites

| Item | Limite | Erro |
|---|---|---|
| HTML do `gerar_pdf` | 1 MB | 413 `AGENT_PDF_HTML_TOO_LARGE` |
| Conteúdo do `upload_s3` (texto ou base64 decodificado) | 5 MB | 413 `AGENT_FILE_TOO_LARGE` (sugere o modo url) |
| PDF gerado | 10 MB (não é gravado) | 413 `AGENT_PDF_TOO_LARGE` |
| Envio pela URL | 25 MB declarados, conferidos na finalização | 413 |
| Conteúdo inline do `get_s3` (texto, JSON, XML, YAML, SVG) | 64 KB | acima disso só a URL |
| Metadados | 20 chaves (`[A-Za-z0-9_-]`, até 40; sem ponto nem `$`, que o Map do Mongoose e o filtro `metadata.<chave>` não aceitam), valores até 200 | validação |
| Páginas / escala mínima | 1–20 / 0,5–1 | validação |

## Ferramentas (grupo `documents`, "Documentos")

| Ferramenta | Risco | Faz |
|---|---|---|
| `gerar_pdf` | write | HTML + opções (a prévia PNG é gerada antes de gravar: falha nela não deixa PDF guardado) (formato, orientação, margens mm, fundo, `usarCssDaPagina`, `maxPaginas`, `escalaMinima`, `previaPng`, nome, metadados, `validadeMinutos`) → id, nome, páginas, tamanho, `coube`, escala, aviso, URL, prévia |
| `obter_pdf` | read | PDFs (`application/pdf`) por id ou filtros → metadados e URLs novas, sem conteúdo |
| `upload_s3` | write | `modo: conteudo` (texto ou base64) → id e URL; `modo: url` (nome, tipo, tamanho) → URL de envio PUT, cabeçalhos e validade. Não baixa URL informada pelo agente |
| `get_s3` | read | Qualquer arquivo do catálogo por id ou filtros → metadados, URL e o texto (até 64 KB) |
| `preparar_curriculo` | write | Conteúdo estruturado do currículo → PDF de 1 página no modelo aprovado + HTML + PNG |
| `obter_curriculo` | read | Currículos por id, empresa (exata), parte da vaga, jobId ou período → URLs novas e o conteúdo usado |

- `redact`: o histórico e os cards guardam só o tamanho do `html` (`gerar_pdf`) e do `texto`/`base64` (`upload_s3`),
  o que também tira o HTML do contexto das ativações seguintes do rotineiro.
- Escrita sem `confirmByDefault`: segue a regra padrão do risco `write`. O grupo entra na árvore do Agente Opex e dos
  rotineiros (liberação por agente), no MCP do dono (`mcp:owner:group:documents`, sem precisar do escopo destrutivo)
  e fica fora do portal do cliente.

## Currículo (modelo aprovado e fixo)

- `renderResumeHtml` reproduz **literalmente** `curriculo-fernando-burgos-2026-11-15.html` (estrutura, classes `sub`,
  `contact`, `sk`, `role`, `co`, `earlier`, cores, `li:before` "–" e CSS). O teste compara a saída com o arquivo de
  referência (`__tests__/fixtures/resume/`, com telefone e e-mail fictícios). Todo texto passa por escape HTML.
- Entrada: `nome`, `titulo`, `contato[]`, `perfil`, `competencias[] { grupo, itens }`, `experiencias[] { cargo,
  empresa, periodo, local?, topicos[] }`, `anteriores?` (linha Earlier), `destaques[] { titulo, texto }`,
  `formacao[] { titulo, detalhe? }` (título — detalhe), `certificacoes[] { titulo, detalhe? }`, `idiomas?`,
  `idioma` (`en` | `pt-BR`), mais `empresa`, `vaga`, `jobId?`, `nomeArquivo?`, `validadeMinutos?`. Títulos das seções
  fixos por idioma (`Profile`… / `Perfil`, `Competências`, `Experiência`, `Trabalhos em destaque`, `Formação e
  idiomas`). Seção vazia não aparece; `local` entra na linha da empresa.
- Degraus (decisão do dono):
  1. densidade `padrao` (CSS exato) com escala de 1 até **0,95** — só compensa a fonte do Gotenberg (Liberation Sans
     no lugar da Arial do Galaxy; medido: o conteúdo do modelo aprovado cabe em 1 página com 0,97);
  2. densidade `compacto`: o mesmo modelo trocando só os 4 valores da memória `curriculos-gerados` (`body` 8,25pt,
     `@page` 9mm 12mm, `line-height` 1,22, margem superior do `h2` 6px), escala de 1 até 0,80;
  3. não coube: guarda assim mesmo, com `coube: false` e o aviso.
- O PDF usa o `@page` do modelo (`preferCssPageSize`, margens do Gotenberg zeradas). Guarda o PDF (`kind: resume`,
  conteúdo e densidade em `resume`), o HTML e o PNG (filhos pelo `parentId`), com metadados `empresa`, `vaga`,
  `idioma` e `jobId`. Nome padrão `AAAA-MM-DD-<empresa>-<vaga>` (slug sem acento).

## Candidatador

Fluxo depois da entrega: `obter_curriculo` (reaproveitar) → `preparar_curriculo` (conteúdo) → um único `run_code` no
Galaxy com `const buf = await (await page.request.get(url)).body()` e `setInputFiles({ name, mimeType:
'application/pdf', buffer: buf })`.

Migração de dados `candidatador-curriculo-tools` (`server/candidatador-patch.ts`, decisão do dono: no deploy):

- Só com `NODE_ENV=production` e fora da prévia (a prévia e o dev usam o mesmo banco). Nunca lança: o `dbConnect`
  não cai por ela.
- Mongo (idempotente): `$addToSet` de `preparar_curriculo`, `obter_curriculo`, `get_s3` e `upload_s3` em
  `opex.enabledTools` do slug `candidatador` e o bloco `<!-- OPE-210:curriculo -->…<!-- /OPE-210:curriculo -->` no
  fim das instruções (só se o marcador não existir), com auditoria `AgenteRotineiro`.
- Engramind (em segundo plano, token admin, canal próprio `routineChannelOf("candidatador", ns)`, por chave com
  `upsert`): `curriculos-armazenamento` é reescrita com o fluxo novo; `curriculos-gerados` ganha o cabeçalho do
  catálogo do Opex e **preserva** o índice antigo (currículos do Galaxy) abaixo. Textos marcados com `[OPE-210]`.
- Só depois das duas memórias grava `migrations.ope210CurriculoAt` no agente. Falha (ex.: Engramind fora do ar) vai
  para o log Pino e para a auditoria `AgenteRotineiro` (`EXECUTAR`, "falha ao atualizar memórias do Candidatador:
  <motivo>"), e o próximo início tenta de novo.
