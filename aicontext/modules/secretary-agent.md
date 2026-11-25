# Agente Secretário

Agente que lê as mensagens que o dono recebe no WhatsApp (integração `evolution-api`, ver `evolution-api.md`) e,
quando a conversa atende aos critérios, responde **como o próprio dono** (nunca se identifica como assistente).
Tem memórias próprias no Engramind, aprende sozinho e pergunta ao dono o que não sabe (OPE-192).

Configuração: `/integracoes/ia?aba=agente-secretario&secao=<geral|criterios|simulacao|personalidade|memorias|conversas|avisos>`.
Página de métricas: `/agente-secretario` (Visão geral, Histórico e Memórias).
O custo da Visão geral inclui turno, análise e decisões de assunto (modelo de texto ou JEV), mas não Simulação.
O painel separa **Mensagens em pausa** (mensagens barradas) de **Intervenções do dono** (mensagens do dono
registradas como assunção da conversa no WhatsApp).

Código: `src/features/secretary-agent/` — puros: `constants.ts`, `schemas.ts`, `criteria.ts`, `personality.ts`,
`criteria-describe.ts`, `jev-subjects.ts`, `conversation-id.ts`, `split.ts`, `cost.ts`, `limits.ts`, `owner-reply.ts`;
servidor em `server/` (`settings`, `models`, `inbound`, `turn`, `plan-reply`, `decide-subject`, `budget`, `simulate`,
`media`, `ai`, `owner-questions`, `personality`, `analysis`, `conversations`, `memory-queue`, `metrics`); telas em `components/`. Rotas em `src/app/api/secretary/**` e
`src/app/api/ai/features/secretary-agent`.

Fora do escopo (refinamento): modo Sugerir, Apresentação, horário de atuação e "pedir decisão".

## Aba Geral

Feature `secretary-agent` em `ai_feature_settings` (`loadFeature`/`persistFeature`, padrões novos por
`withSecretaryDefaults`). O mesmo schema (`secretarySettingsSchema`) valida a tela e a rota.

1. **Provedor e modelo** (`SecretaryModelCard`, que envolve o `ProviderModelCard` e grava o provedor escolhido,
   limpando o modelo e a variante): só `OPEX_PROVIDER_IDS` (inferência por API com ferramentas, sem o OpenCode de
   sessão). O mesmo cartão serve ao Modelo de mídia, ao Modelo da análise e a quem decide o assunto.
2. **Ligar/desligar**. Ligado exige provedor, modelo e instância.
3. **Instância** do WhatsApp (da integração Evolution API).
4. **Modo** (`OptionTabs`): **Responder** (envia sozinho) ou **Só observar** (aprende e registra, sem enviar nem
   marcar como lida).
5. **Mídia**: **Ler imagens** e **Transcrever áudios**, com **Modelo de mídia** ("Mesmo do agente" ou outro).
   Chave desligada, modelo sem suporte ao tipo (`opexFileDelivery`/`modelFileKinds`) ou erro → marcador
   (`[imagem]`, `[áudio]`, `[documento: nome.pdf]`, `[figurinha]`) e o turno segue.
6. **Comportamento humano**: agrupar mensagens (15 s), atraso aleatório (3 a 10 s), "digitando…", dividir em
   mensagens curtas (`splitMessages`, até 4 partes) e marcar como lida (só ao enviar).
7. **Pausa quando o dono responde pelo celular**: 30 min naquela conversa.
8. **Limites**: 20 respostas por conversa por hora e orçamento diário de US$ 2 (dia de São Paulo). O orçamento soma
   as respostas (`secretary-agent`) e a decisão do assunto (`secretary-decision`, por modelo de texto em
   `ai_consumption_logs` ou pelo JEV em `ai_usage_logs`; `spentTodayUsd`). A análise e a simulação ficam de fora.
9. **Preços estimados**: com o agente ligado, todo modelo de texto em uso (principal, mídia, análise e decisão do
   assunto; o JEV tem tarifa fixa) de provedor que não
   informa o custo (fora de `opencode-go` e `command-code`) exige o preço em US$ por 1M de tokens de entrada e
   saída. O custo do passo é o informado pelo provedor ou, sem ele, `estimateCostUsd` pela tabela.

## Critérios (aba Critérios)

Duas etapas que precisam passar **juntas**, sem precedência entre elas (plano v3, pedido do dono: a precedência da
v1 era confusa). Regra escrita na tela: "O Secretário só responde quando a mensagem passa nas duas etapas."

1. **Quem pode ser respondido** (`criteria.audience`):
   - **Nunca responder a** (`blocked`): sempre fica de fora;
   - **Responder a**: **Todos** (com as chaves "Conversas individuais" e "Grupos") ou **Só os escolhidos**
     (`selected`, as chaves de tipo somem);
   - **Em grupos, responder**: **Sempre** ou **Só quando me mencionam** (menção ou citação pelo número ou pelo LID do
     dono, `mentionsOwner`); vale para todo grupo que passa na etapa, inclusive os escolhidos.
2. **Sobre o quê** (`criteria.subjects`): **Assuntos bloqueados** (lista de assuntos com nome, descrição e exemplos)
   sempre bloqueiam — o agente fica quieto, não avisa e não marca como lida; **Responder sobre**: **Qualquer assunto**
   (exceto os bloqueados) ou **Só os assuntos liberados** (outra lista de assuntos).

Quem não passa na etapa 1 não é respondido, seja qual for o assunto (um assunto liberado não "puxa" quem está fora).
Para responder qualquer pessoa sobre um assunto específico: "Responder a: Todos" + "Só os assuntos liberados".
Validação: "Só os escolhidos" exige ao menos uma conversa e "Só os assuntos liberados" ao menos um assunto.

- `evaluateCriteria(criteria, conversa, decisãoDoAssunto)` (pura) devolve `{ decision, rule, reason, steps }`; cada
  passo (`blocked`, `audience`, `mention`, `subject-blocked`, `subject-allowed`) vem como `pass`, `fail` ou `skipped`.
  `evaluateAudience` roda a etapa 1 antes de baixar ou interpretar mídia e antes de chamar quem decide o assunto.
- Tela: resumo em frases (`describeCriteria`) e **Fluxo da decisão** (`criteriaSteps` + `CriteriaFlow`), atualizados
  enquanto o dono edita, e um link "Simular uma mensagem" para a aba Simulação.
- **Configuração salva no formato da v1** é convertida na leitura (`migrateLegacyCriteria` em `withSecretaryDefaults`):
  escopo "todas" vira "Todos" e "nenhuma" vira "Só os escolhidos" com as antigas inclusões; exclusões viram "Nunca
  responder a"; tipos de conversa e menção são mantidos; o assunto "nunca" vira o assunto bloqueado "Assunto
  bloqueado" e o "sempre" vira o assunto liberado "Assunto liberado" **mantendo "Qualquer assunto"** (o agente não
  fica mudo). O efeito antigo de o assunto "sempre" responder quem estava fora deixou de existir.
- **Quem decide o assunto** (`decision.model`): "Mesmo do agente", outro modelo de texto (`OPEX_PROVIDER_IDS`) ou o
  **JEV** (`decideSubject`). Só é chamado quando há assunto bloqueado ou "Só os assuntos liberados" e quem enviou
  passou na etapa 1. Com modelo de texto: saída estruturada com os ids que bateram, o tópico e o motivo. Com o JEV:
  uma pergunta `noul` por assunto (estado: a mensagem e as 5 anteriores), faixas sim ≥ 70%, não ≤ 30%, incerto no
  meio, e a política "na dúvida, fica quieto" (bloqueado com sim ou incerto bloqueia; no modo "Só os liberados", só
  o sim libera; `jev-subjects.ts`). Falha do decisor vira a decisão "erro" e o agente não responde. Consumo com a
  origem/feature `secretary-decision`, que conta no orçamento diário. O tópico (ou o nome do assunto que bateu, no
   JEV) alimenta "assuntos mais frequentes".
   O JEV pode ser selecionado em “Outro modelo ou o JEV” quando sua integração está conectada.
- **Registro de decisões** (`secretary_decisions`, `GET /api/secretary/decisions?jid=`): a decisão original é mantida
  quando o turno é retomado após a resposta do dono (a retomada tem registro próprio). Decisões: respondeu,
  ignorou, pausado, assunto bloqueado (também quando o assunto não é um dos liberados), limite
  atingido, só observar, perguntou ao dono, desligado, agrupada, descartada, erro.
- Seleção de contatos/grupos com foto e busca (`ConversationPickerField`, com "Sincronizar contatos e conversas" ao
  lado quando a lista está vazia).

## Simulação (aba Simulação)

Substitui o "Testar critérios" da v1, no molde do simulador do agente vendedor do zaturno-crm: conversa simulada à
esquerda e coluna lateral (320 px) com os dados de cada resposta.

- Topo: contato ou grupo (com foto), "A mensagem me menciona" em grupos, "Histórico": **Só a conversa simulada**
  (padrão) ou **Continuar a conversa real** (as últimas 30 mensagens da Evolution, só leitura) e **Reiniciar**.
- `POST /api/secretary/simulate` (só o dono, `simulateSchema`): as configurações **em edição** no formulário (mesmo
  schema, sem exigir "ligado" nem instância), a conversa, a mensagem, o histórico simulado e as memórias que a
  simulação já "gravou". Usa o mesmo núcleo do turno real (`planSecretaryReply`) com portas que não enviam, não
  marcam como lida, não gravam decisão e não gravam memória no Engramind (a ferramenta `remember` da simulação só
  acumula o fato, que volta ao navegador e entra no contexto das próximas mensagens até Reiniciar).
- Coluna lateral: **Decisão** (responderia / não responderia, regra e motivo), **Passo a passo dos critérios**
  (`CriteriaFlow` com ✓/✗/—), **Decisão do assunto** (modelo ou JEV, o modelo usado, o assunto e, com o JEV, cada
  pergunta com a probabilidade e a faixa), **Limites e pausa** da conversa real (informativo: a simulação não aplica),
  **Personalidade aplicada** (base + variante), **Memórias** (contagem do contexto e as que gravaria), **Pergunta ao
  dono** (nada é enviado), **Contato** (o que o agente recebeu: nome, número e, em grupo, o autor) e **Custo desta
  mensagem**. O contato vem do cache `evolution_contacts` da instância escolhida; em grupo, o autor simulado é
  "Participante do grupo".
- Quando não responderia, o chat mostra uma linha discreta: "O Secretário não responderia: <motivo>".
- Custo real (modelo e JEV) com a origem `secretary-simulation`, somado pelo assunto da simulação e **fora** do
  orçamento diário. Só texto (sem mídia).
- Falhas de inferência retornam `502 SECRETARY_PROVIDER_ERROR`, com diagnóstico curto no toast e na coluna lateral.

## Turno

Sem fila nem worker: o webhook chama `handleIncomingMessage` (em `runAfterResponse`).

- Conversa consigo mesmo: nunca é respondida; `fromMe` nela só vale como resposta a pergunta pendente.
- `fromMe` numa conversa comum (com ~3 s de espera e ignorando os ids enviados pelo próprio agente,
   `secretary_sent`) **pausa** a conversa pelo tempo que resta a partir da hora da mensagem, não da entrega pelo
   webhook. Se a pausa já expirou, registra "ignorou" sem alterar a conversa.
- Entradas com mais de 10 min não iniciam turno nem resolvem pergunta na conversa consigo mesmo: registra "ignorou".
- Agente desligado ou sem modelo: decisão "desligado".
- Cada mensagem recebida grava um **token novo** e entra na lista pendente; depois da janela, só o turno cujo token
  ainda é o atual responde (os outros ficam como "agrupada").
- Ordem: critérios de público → pausado → limites (o orçamento esgotado barra também o modo Só observar) → mídia → mensagem
  só de mídia não lida vira "ignorou" → critérios ("assunto bloqueado" fica quieto, não avisa e não marca como
  lida) → contexto (contato, histórico de ~30 mensagens, personalidade base + variante, memórias) → geração. Do critério à
  geração é o núcleo `planSecretaryReply` (o mesmo da Simulação); o turno real cuida dos limites, da mídia, do envio
  em partes, da leitura e do registro.
- **Conferência antes de enviar**: antes de cada parte, confere se o token é o mesmo, se o dono não falou na
  conversa e se ela não foi pausada; se mudou, descarta ("descartada"). Marca como lida só ao enviar a primeira
  parte e só com a opção ligada.
- Erro (Evolution fora, instância desconectada, provedor) → decisão "erro" com a classe do erro no motivo e log
  Pino (`feature: secretary-agent`, instância e conversa, sem texto de mensagem), sem reenvio.
- Grupo com "só quando mencionado": vale a menção ou a citação pelo número do dono ou pelo LID dele
  (`ownerLid`, aprendido das mensagens do dono em grupos; ver `evolution-api.md`).
- Mensagens que o próprio Opex envia (respostas do agente e a mensagem de teste da integração) ficam em
  `secretary_sent` e não pausam a conversa quando voltam como `fromMe`.
- Consumo em `ai_consumption_logs` com origem `secretary-agent` (`secretary-decision` na decisão do assunto,
  `secretary-analysis` na análise e `secretary-simulation` na Simulação).
- **Com quem fala** (porta `contact()` do `planSecretaryReply`): nome do contato no cache `evolution_contacts`
  (alternativa: `pushName`), número e, em grupo, o nome do grupo e o autor. Vai na mensagem ao modelo (`contact`) e
  numa linha das instruções ("Você está falando com <nome> (<número>). Se o nome é conhecido, não pergunte quem
  é…"); sem nome, diz "nome desconhecido (só o número)". O nome também entra no foco da busca de memórias. Se o
  cache falhar, segue só com o número (aviso no log).
- A inferência valida a saída da ferramenta final `entregar` com o schema do turno, sem `response_format`. A
  entrega só encerra a chamada quando é válida: entrega inválida volta ao modelo como erro da ferramenta (com os
  campos que falharam) e ele corrige, até 8 passos. Esgotado, o erro diz os campos ("formato inválido (campos:
  blocks.0.key, variant)"), nunca os valores. Quem chama pode dar um schema mais tolerante ao modelo
  (`deliverySchema`) e um normalizador antes do schema estrito.
  Falhas de IA aparecem no motivo da decisão. Diagnósticos reconhecidos do provedor viram mensagens fixas em
  pt-BR; o texto bruto do erro, o prompt, a mídia e os cabeçalhos não são expostos.

## Perguntar ao dono e aba Avisos

- Quando o modelo não sabe, responde uma frase natural de espera e devolve a pergunta: o agente cria o aviso
  (`secretary_notices`, `question`), envia a pergunta à conversa do dono consigo mesmo, com o nome do contato ou
  grupo (e autor no grupo) e um trecho de até 500 caracteres do texto agrupado, incluindo mídia interpretada.
  A aba Avisos mostra o mesmo trecho, com nome e foto da conversa quando disponíveis. O aviso guarda o id do envio.
- Resposta do dono (`resolveOwnerReply`): citando a pergunta, vale para ela; sem citação e com uma pendente, vale
  para ela; com várias, o agente pede que cite; sem pendentes, ignora. Também pela aba Avisos.
- Depois: a pergunta fica reservada (`answering`), a IA extrai um fato e escolhe o canal (global ou da conversa) e a
  memória é gravada; só então o aviso vira respondido e mostra onde gravou. Se a inferência ou a gravação falharem,
  a pergunta volta para pendente (o dono responde de novo; resposta reservada há mais de 5 min também pode ser
  refeita). A conversa é retomada depois da resposta (`runAfterResponse`, fora da requisição da aba Avisos), a menos
  que o dono já tenha falado nela depois da pergunta.
- Responder e descartar são auditados (`AgenteSecretario`, sem o texto da resposta). A aba Avisos lista também as
  respostas em andamento; uma presa há mais de 5 min pode ser respondida de novo ou descartada.
- Logs de falha (turno, mídia, análise, perguntas) levam só a classe e o status HTTP do erro (`safeErr`), nunca o
  objeto do erro da SDK de IA, que carrega o prompt, a mídia e a resposta do provedor.
- Pergunta sem prazo; **Descartar** na aba Avisos.
- Limite ou orçamento: aviso com `_id` da janela (`limit:<conversa>:<hora>` / `budget:<dia>`), enviado ao dono
  e listado em Avisos **uma vez por janela**; retoma sozinho na janela seguinte.
- Contador de pendentes na aba (evento `secretary-notices-updated`).

## Personalidade (aba Personalidade)

- Blocos fixos (Identidade; Tom e formalidade; Vocabulário, gírias e expressões; Emojis, risadas e pontuação;
  Tamanho e ritmo; Assuntos, opiniões e posicionamentos; O que nunca faço; Exemplos reais) e blocos extras.
- **Variantes por conversa**: só os blocos que mudam ou complementam a base; o prompt usa a base mais a variante
  (`composePersonality`). Selo "Criada pela análise". Variante de conversa excluída é mantida.
- **Histórico de versões** (`secretary_personality_versions`): cada edição, análise, análise cancelada ou
  restauração gera uma versão com o diff por bloco (`diffPersonality`); **Restaurar** gera uma versão nova. A
  gravação confere a versão lida (409 se mudou).
- **Analisar minhas conversas** (`secretary_analyses`): todas (`findChats`) ou escolhidas, período padrão 6 meses.
  Uma por vez (índice único parcial em `running`, 409). Conversa por conversa, lê o histórico da Evolution
  (ignorando o que o próprio agente enviou), com foco no que o dono escreveu; a IA devolve os blocos e a variante
  e usa a ferramenta `report_progress` para as descobertas. A entrega da análise é tolerante
  (`analysis-delivery.ts`): chave vira slug (`tom_de_voz` → `tom-de-voz`, ou do título se faltar), título e conteúdo
  são cortados nos limites, variante ausente vira nula, blocos em string JSON são aceitos e chaves repetidas são
  fundidas; conteúdo faltando continua inválido. A execução é tarefa solta do processo (`runDetached`), não presa à
  requisição: o dono pode sair da tela (toast e linha "Continua em segundo plano…"); ao voltar, a tela lê o estado
  gravado, a em andamento aparece primeiro e aberta, o anel parte do valor atual, e a sub-aba mostra
  "Personalidade · Analisando N/M". Progresso persistido e publicado
  (`secretary-analysis-updated`): anel "N de M conversas lidas", mensagens, conversa atual, fase (lendo,
  comparando, escrevendo), tempo estimado, custo, estado de cada conversa (na fila, lendo, lida, sem conteúdo
  útil) e descobertas. O trabalho é feito num rascunho: concluída vira a personalidade atual (versão "Análise");
  **Cancelar** guarda o rascunho na versão "Análise cancelada" (restaurável, não aplicada). Batimento a cada 15 s;
  sem batimento por 90 s a análise vira "Interrompida". Sem teto de custo; não conta no orçamento diário.
   Falha numa conversa (Evolution, modelo) mostra o motivo em "Não foi lida (erro)"; se páginas anteriores da
   conversa já foram aprendidas, ela fica "Lida em parte (erro)" (conta como lida) e o aprendizado continua no
   rascunho. O custo é relido depois de cada chamada, inclusive as que falharam, e no fim (também em falha e
   cancelamento). Se as três primeiras
   conversas com conteúdo útil falharem pelo mesmo motivo de IA e nenhuma tiver sido lida, a execução para;
   se houver leitura bem-sucedida e falhas, a execução finalizada mostra "Concluída com N erros". A fase só é
   exibida enquanto a análise está em andamento. Se a
  personalidade for editada durante a análise (conflito de versão) ou houver erro fatal, o que já foi aprendido fica
  na versão "Análise não aplicada" (restaurável, não aplicada) e a mensagem diz a causa; sem conversa lida (inteira
  ou em parte), a mensagem diz que nada foi aplicado. Iniciar e cancelar são
  auditados com a contagem de conversas.
- **Editor**: uma versão nova (análise, restauração) só substitui a tela sem edição pendente; com edição pendente
  o texto digitado fica, a tela avisa e o Salvar trava até "Recarregar e descartar minhas edições". O próprio
  salvamento vira a versão de referência (sem aviso). O `PUT /api/secretary/personality` leva `expectedVersionId` (a
  versão em que a edição se baseou) e responde 409 `SECRETARY_PERSONALITY_CHANGED` se ela mudou.
  Modelo próprio ("Modelo da análise": o mesmo do agente ou outro).

## Memórias (aba Memórias)

- Engramind: identidade `opex/secretario`, canal global `agentes/secretario/global` e um canal por conversa
  `agentes/secretario/conversas/<id>` (`conversationIdOfJid`: dígitos do contato, `g-<id>` do grupo,
  `lid-<dígitos>`), criado na primeira gravação. Assinatura só `agentes/secretario/*` (não lê as Memórias do Opex).
- Contexto do turno: só o global e o canal da conversa atual.
- Aprendizado autônomo (criar, editar, ativar/desativar) com a chave `secretario` em Memórias autônomas.
- Agente ainda não cadastrado no Engramind: o universo dá lugar ao estado "Agente não encontrado no Engramind" com o
  botão "Cadastrar agente no Engramind" (ver `engramind.md`).
- Universo do agente (`AgentUniverseCard`): canais das conversas rotulados pelo nome (número na dica;
  `secretaryChannelLabels`); a foto fica na aba Conversas e nos seletores (decisão do dono no planejamento: a lib
  `@engramind/client` não aceita foto no rótulo do canal; a foto no universo é tarefa separada).
- `?conversa=<id>` (ação "abrir as memórias" da aba Conversas) abre o universo só com o global e o canal daquela
  conversa, com Nova memória já no canal dela (`conversationFocus`), e um botão para voltar a todas.
- Engramind fora do ar: a gravação vai para a fila `engramind_pending_writes` (ver `engramind.md`) e a ferramenta
  devolve `pendente:<chave>`.

## Conversas (aba Conversas)

Lista das conversas com foto e o estado do agente (ativo, pausado até…, nunca responder, aguardando o dono),
virtualizada acima de 50. Ações: pausar (pelo tempo da pausa configurado), retomar, "Nunca responder"/"Voltar a
responder" (entra ou sai de `criteria.audience.blocked`) e abrir as memórias. Sem conversas, o estado vazio mostra
"Nenhuma conversa ainda." com o botão "Sincronizar contatos e conversas" (`EvolutionSyncAction`); sem instância
escolhida, um link para a aba Instância da integração.

## Tempo real (`private-app`)

`secretary-decision-recorded` (`{ chatId }`), `secretary-conversation-updated` (`{ chatId }`),
`secretary-notices-updated` (`{ pending }`), `secretary-personality-updated` (`{ versionId }`),
`secretary-analysis-updated` (`{ id }`) e `ai-feature-updated` da configuração.

## Coleções

`secretary_conversations`, `secretary_sent`, `secretary_decisions`, `secretary_notices`, `secretary_personality`,
`secretary_personality_versions`, `secretary_analyses`.
