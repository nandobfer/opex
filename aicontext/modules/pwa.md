# Módulo: App instalável (PWA)

O Opex pode ser instalado no celular como **PWA** (OPE-196). No Chrome do Android, a opção "Instalar app" gera o
WebAPK, e o Opex passa a abrir em tela cheia (sem barra de endereço), com ícone e splash próprios no tema escuro.

Decisão do dono: PWA em vez de React Native, Android nativo, TWA ou Capacitor. É o caminho mais simples, usa o
Chrome completo e cada deploy atualiza o app na hora. Também serve de base para um APK no futuro (TWA/Capacitor).

Código: `src/features/pwa/` (constantes, manifest, service worker e componentes), `src/app/manifest.ts`,
`src/app/sw.js/route.ts` e `src/app/offline/page.tsx`.

## Manifest (`/manifest.webmanifest`)

- Montado por `buildManifest(basePath)` (`src/features/pwa/manifest.ts`, puro) a partir da rota de metadados
  `src/app/manifest.ts`. O Next injeta o `<link rel="manifest">` em todas as páginas.
- `name`/`short_name` "Opex", descrição em pt-BR, `lang: "pt-BR"`, `display: "standalone"`, sem `orientation`
  (orientação livre).
- `start_url`, `scope` e `id` = `${BASE_PATH}/`. A raiz redireciona para os Dashboards (com sessão) ou para
  `/login` (sem sessão).
- `theme_color` e `background_color` = `PWA_BACKGROUND` (`#0E0C13`, o `--background` do tema escuro), para que
  a barra de status e o splash se misturem ao app. Um teste confere a cor contra o `globals.css`. A primária
  (`#8000FF`) aparece no ícone.

## Ícones

| Arquivo | Uso |
|---|---|
| `public/pwa/icon-192.png`, `public/pwa/icon-512.png` | Manifest, `purpose: "any"`, transparentes |
| `public/pwa/icon-maskable-512.png` | Manifest, `purpose: "maskable"`: opaco no fundo do tema, marca em 60% (cabe no círculo seguro de raio 40%) |
| `src/app/apple-icon.png` | `apple-touch-icon` 180 × 180, opaco (convenção de arquivo do Next) |
| `src/app/icon.png` | Favicon (já existia) |

Todos saem de `public/opex-mark.png`. Para gerar de novo: `npx tsx scripts/generate-pwa-icons.ts`. O `sharp` vem
do `next` e não é dependência direta. As convenções de arquivo têm prioridade sobre `metadata.icons`, por isso
o layout raiz não declara `icons`.

## Service worker (`/sw.js`)

- A lógica é a função autocontida `opexServiceWorker(self, config)` (`src/features/pwa/service-worker.ts`). A
  rota `src/app/sw.js/route.ts` a converte em texto com `buildServiceWorkerScript` e a chama com a
  configuração em JSON. A resposta sai com `Cache-Control: no-cache, no-store, must-revalidate`. Os testes
  executam esse mesmo texto com um `self` simulado.
- **Versão por build**: o `next.config.ts` gera `APP_BUILD_ID` (`<versão>-<instante do build>`), que fica fixo
  no bundle. Cada deploy muda o script, e o navegador instala o SW novo. Ele chama `skipWaiting()` na
  instalação, `clients.claim()` na ativação e apaga os caches `opex-*` das versões anteriores. Os caches de
  outros donos ficam intactos.
- **Estratégias**:
  - navegação (`mode: "navigate"`): sempre pela rede, sem guardar a resposta. Só quando o `fetch` falha (sem
    rede) devolve a página offline. Uma resposta de erro HTTP passa direto;
  - `/_next/static/*` (arquivos versionados) e `/opex-mark.png`: o cache responde primeiro, e o que vier da
    rede é guardado;
  - todo o resto não é interceptado: `/api/*`, sessão, Pusher, requisições RSC, métodos que não são `GET` e
    outras origens. **Nenhum dado do app vai para o cache**, e com rede o app funciona como no navegador, com
    tempo real e dados atualizados.
- **Instalação**: o SW baixa `/offline`, extrai do HTML os `/_next/static/...` referenciados (CSS, JS e fontes
  pré-carregadas) e guarda tudo, mais a marca. Assim, sem rede, a página offline aparece com o visual do tema.
  Sem rede na própria instalação, ela não falha: o SW entra sem a página offline.
- **Registro**: `ServiceWorkerRegistrar` (no layout raiz) registra só em produção, com
  `navigator.serviceWorker` e em contexto seguro, com `scope: "${BASE_PATH}/"` e `updateViaCache: "none"`. Ao
  voltar para o app (`visibilitychange`), chama `registration.update()`. Não força recarga: a navegação
  seguinte já usa o deploy novo, sem perder o que estiver sendo digitado.

## Página offline (`/offline`)

Página Next fora da casca (`OfflineScreen`), com tokens do tema e entrada animada com Framer Motion. Mostra a
marca, o ícone `WifiOff`, o título "Sem conexão" e o texto "O Opex precisa de internet para mostrar seus dados.
Assim que a conexão voltar, a página recarrega sozinha.". O botão **Tentar novamente** recarrega a página, e o
evento `online` também recarrega sozinho.

## Acesso sem sessão

`/manifest.webmanifest`, `/sw.js` e `/offline` (exatos) ficam em `PUBLIC_ROUTES` (`PWA_PUBLIC_ROUTES`, ver
`auth.md`). Os ícones `.png` já ficam fora do `matcher` do middleware. Nenhuma outra rota foi aberta.

## Experiência no modo standalone

- **Safe areas**: `viewport-fit=cover` e as constantes de `src/components/ui/safe-area.ts` (ver `layout.md`).
- **Botão voltar do Android**: volta o histórico (navegação do Next e diálogos com URL); na raiz, fecha o app.
- **Sessão**: o cookie continua de sessão, sem `maxAge`. O dono decidiu assim no planejamento da OPE-196, ao
  responder "Manter como está" à pergunta sobre a validade do cookie; a decisão está registrada no plano
  aprovado (versão 1, seções 1 e 7). Logado, fechar e reabrir mantém a sessão enquanto o Chrome não for
  encerrado pelo sistema. Se o Android encerrar o Chrome, o app abre em `/login`; o critério de aceite "fechar
  e reabrir mantém a sessão" vale com essa ressalva aceita pelo dono. Deslogado, o app abre em `/login`.
- **Testes das safe areas**: `__tests__/components/safe-area.test.tsx` fixa os insets na casca, na gaveta, na
  folha de baixo (inset inferior e altura máxima de 85dvh, inclusive com padding do chamador; desde a OPE-208 o `Sheet`
  só tem esse lado), na barra de lote, nos logs maximizados e na imagem ampliada.

## Verificação visual pendente

A implementação foi conferida por testes e pelo servidor de desenvolvimento (rotas públicas e cabeçalhos do
HTML). Ainda falta conferir num aparelho Android, pelo domínio com HTTPS:

- Lighthouse ou o painel Application do DevTools mostrando o app como instalável, sem erros de manifest;
- instalação pelo Chrome ("Instalar app"), ícone maskable sem corte e splash no tema escuro;
- safe areas com notch e barra de gestos (casca, gaveta, folhas, toasts, barra de lote, chat em tela cheia,
  logs maximizados e imagem ampliada);
- botão voltar do Android (navegação, diálogos com URL, gaveta e as páginas do log do deploy e da execução do
  rotineiro, que voltam para Ambientes e para a aba Execuções, OPE-208);
- sessão ao fechar e reabrir o app, página offline sem rede e troca de versão depois de um deploy.

## Requisitos e limites

- **HTTPS obrigatório**: só se instala em contexto seguro (domínio com HTTPS, ou `localhost`). Prévias em
  `http://IP:porta` não instalam, e o registrador nem tenta.
- Sem rede no primeiro acesso, antes de o SW ter sido instalado, não há página offline.
- Fora de escopo: notificações push (Web Push), offline com dados (cache de API, fila de mutações), o portal
  `/cliente` como app separado e APK/loja.
