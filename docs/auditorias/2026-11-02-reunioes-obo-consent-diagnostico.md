# Reuniões — diagnóstico de consentimento Entra/OBO

**Data:** 2026-11-02
**Escopo:** leitura do registro Entra e service principal, análise da tentativa OBO real e correção da classificação de falhas do backend. Após autorização explícita, foi salvo no manifesto da API o vínculo do cliente Web em `knownClientApplications`. Nenhuma permissão Graph foi concedida, e nenhum segredo, política do tenant ou infraestrutura foi alterado.

## Parecer

A falha original do OBO foi ausência de consentimento delegado Graph para o usuário/API, não uma declaração de que `Calendars.ReadWrite` sempre exige administrador. A permissão está declarada no registro, mas não há grant efetivo. O fluxo atual pede consentimento para a API NITE e o OBO tenta obter o token Graph sem uma etapa interativa; OBO não pode solicitar consentimento ao usuário.

Há uma rota tecnicamente válida de consentimento combinado: o cliente Web consta em `knownClientApplications` da API e solicitou `/.default`. A tentativa real chegou à tela “Necessidade de aprovação de administrador”. Isso prova que **essa solicitação não pôde ser consentida por essa conta**, mas a tela não identifica a permissão nem a regra que bloqueou o consentimento. A referência de permissões Graph classifica `Calendars.ReadWrite` delegado como não exigindo consentimento administrativo por padrão. Porém, a política gerenciada recomendada atualmente pela Microsoft exclui explicitamente `Calendars.ReadWrite` do consentimento individual. Se a UniJorge usa essa política, isso explica a tela sem contradizer a coluna do catálogo. A política do tenant não foi consultada, então essa é uma hipótese forte, ainda não uma causa institucional confirmada. A primeira tentativa também enviou `prompt=consent`, que a documentação de troubleshooting lista como fator a verificar; esse parâmetro foi removido da repetição controlada.

## Evidências observadas

1. A tentativa real de OBO retornou `AADSTS65001` (`invalid_grant`) no endpoint de tokens Entra. O token Graph não foi obtido; a API Graph não foi chamada e nenhum evento foi confirmado ou criado por essa tentativa.
2. No App Registration `NITE Connect API`, Microsoft Graph `Calendars.ReadWrite` aparece como **Delegated** e “Admin consent required: No”; `User.Read` também está declarado como delegado.
3. Na página de permissões consentidas do Enterprise Application, não há permissões concedidas por usuário nem por administrador.
4. Na inspeção inicial, `knownClientApplications` estava vazio. Após autorização explícita, o App ID do Web foi salvo no manifesto de `NC NITE Connect API` e confirmado após recarga. O registro Web já declarava a permissão delegada `access_as_user` da API.
5. `apps/web/auth.ts` solicita `openid profile email offline_access` e `ENTRA_API_SCOPE`, cujo exemplo/configuração é o escopo `access_as_user` da API NITE. Não solicita Graph nem `api://<API_CLIENT_ID>/.default`.
6. A coluna do portal “Admin consent required” informa o padrão do catálogo, não necessariamente as condições efetivas da organização. A tela de configurações de consentimento, os logs de auditoria e a propriedade de atribuição do service principal não foram consultados; esses fatores continuam desconhecidos.
7. Os arquivos locais configurados usam registros separados e coerentes: Web `c6e9bfa0-0c4e-4d68-879a-d04abb48ec67`; API e audience OBO `0bd4d0b3-c548-48c1-8bde-cb1ddbd82753`; ambos usam o tenant `1d90b5e6-9b17-47a4-a2fe-1884712d8c2f`. O scope normal do Web é `api://0bd4d0b3-c548-48c1-8bde-cb1ddbd82753/access_as_user`; o OBO solicita `https://graph.microsoft.com/Calendars.ReadWrite`. O valor de `aud` de um token real não foi lido nem registrado.
8. O ambiente local aponta `API_BASE_URL=http://localhost:8080`, `AUTH_URL=http://localhost:3000`, `ENTRA_ENABLED=true` e `MEETINGS_GRAPH_ENABLED=true`; a presença de credenciais é configurada, mas sua validade não foi testada nem seus valores foram exibidos.
9. Na prova aberta em `http://localhost:3000/dev/meetings-graph-consent/calendar`, a página exibiu `HTTP 403` e `OBO_CONSENT_REQUIRED`. O log do MSAL confirma `AADSTS65001` para o cliente confidencial API; a aquisição de token Graph falhou antes de qualquer requisição Graph. A identidade NITE chegou à página e a rota de diagnóstico executou, mas não houve token Graph, leitura de calendário nem criação de evento.
10. Para a ocorrência mais recente observada nos logs, em `2026-11-02 23:45:16Z`, o Entra/MSAL registrou Trace ID `e5051590-c3cc-4718-9a99-141227fc3000` e Correlation ID `6f4d9335-0204-401a-8dcc-442260c63dd7`. Esses identificadores podem ajudar a equipe autorizada a localizar a tentativa nos logs do tenant; não identificam, por si, a política que recusou o consentimento.

Os pontos 1–10 foram observados em código, arquivos locais sem exibir segredos, logs e telas autenticadas do tenant. A interpretação do fluxo e das condições de consentimento abaixo usa a documentação oficial Microsoft Graph/Entra.

## Por que o erro ocorre

O token recebido pelo backend é emitido para a API NITE. A API usa esse token como assertion OBO, autentica-se como cliente confidencial e pede token Graph delegado para o mesmo usuário. O OBO do backend é silencioso: não tem interface para mostrar uma tela de consentimento. Se não houver grant delegado prévio para o escopo Graph, Entra devolve `AADSTS65001` antes de fornecer o token.

O valor “No” em `Admin consent required` significa que o catálogo da permissão aceita consentimento delegado de usuário em condições apropriadas. Não cria o grant, não garante que o tenant permita o consentimento daquele usuário e não significa que OBO irá iniciar uma janela de consentimento. A permissão delegada continua limitada aos calendários acessíveis pelo usuário autenticado; não é a permissão de aplicação para todos os mailboxes.

## Caminhos possíveis

| Caminho | Ação | Depende de administrador? | Limite |
|---|---|---|---|
| Consentimento combinado individual | Configurar o vínculo Web em `knownClientApplications`; apresentar ao usuário fluxo interativo `openid api://<API_CLIENT_ID>/.default`; após consentimento, repetir OBO | Não, se a política já autorizar esse usuário/escopo | `Calendars.ReadWrite` delegado não exige admin no catálogo, mas a política do tenant ainda pode bloquear consentimento individual. `/.default` não deve ser combinado na mesma solicitação com scopes dinâmicos como `profile`, `email` ou `User.Read`. |
| Grant delegado tenant-wide | Administrador concede a permissão Graph delegada à API uma vez | Sim, uma vez para o tenant | Não muda para permissão de aplicação; OBO ainda representa o usuário que iniciou a operação. |
| Política de consentimento controlada | Administrador define política/atribuição restrita permitindo esse scope a grupo específico; os membros concedem individualmente | Sim, para a política inicial | Evita grant tenant-wide, mas continua sendo decisão administrativa e precisa de governança institucional. |
| Fluxo manual no Teams | O NITE encaminha o usuário para a experiência oficial do Teams para criar/entrar manualmente | Não usa consentimento Graph do NITE | Não fornece evento Outlook, convites gerenciados, atualização/cancelamento pelo NITE ou histórico integrado. |

Adicionar `Calendars.ReadWrite` no App Registration, marcar consentimento de usuário como permitido ou preencher `knownClientApplications` são ações distintas. O primeiro declara uma permissão, o segundo é política do tenant, e o terceiro permite o fluxo combinado; nenhum deles, isoladamente, prova que a concessão individual foi realizada.

`preAuthorizedApplications`/“Authorized client applications” é diferente de `knownClientApplications`. Pré-autorizar o cliente para scopes próprios da API pode remover prompts de consentimento para acessar a API NITE, mas não deve ser tratado como concessão do escopo Graph `Calendars.ReadWrite`.

## Correção no backend

`MsalGraphTokenAcquirer` antes convertia qualquer `RuntimeException` da aquisição OBO em `OBO_AUTHORIZATION_REQUIRED`/403. Assim, erro de credencial, falha transitória do endpoint de tokens ou exceção inesperada era apresentada como problema de autorização.

A classificação foi separada por sinal MSAL/AADSTS e causa:

- `AADSTS65001`/`consent_required` → `OBO_CONSENT_REQUIRED`, HTTP 403.
- `AADSTS90093`/`AADSTS90094`/`AADSTS900941` → `OBO_ADMIN_APPROVAL_REQUIRED`, HTTP 403.
- `interaction_required` → `OBO_INTERACTION_REQUIRED`, HTTP 403.
- `invalid_client` → `OBO_CLIENT_AUTHENTICATION_FAILED`, HTTP 503.
- `invalid_grant` sem o marcador AADSTS65001 → `OBO_ASSERTION_REJECTED`, HTTP 403.
- falha temporária/timeout/IO → `OBO_TOKEN_SERVICE_UNAVAILABLE`, recuperável/HTTP 503.
- erro MSAL ou runtime inesperado → código de falha não autorizativa/HTTP 503.

Os logs registram somente código interno, error code MSAL, status HTTP, correlation ID sanitizado e tipo da exceção. Mensagem bruta, assertion, token, claims e segredo não são registrados. Respostas ao consumidor não incluem mensagem bruta do Entra.

## Prova local de consentimento combinado

Foi preparada uma entrada de desenvolvimento em `/dev/meetings-graph-consent`, disponível somente com `NODE_ENV=development` e sessão autenticada de integrante ativo. O botão inicia uma autenticação interativa isolada do login normal, usando `scope=openid api://<API_CLIENT_ID>/.default`. A primeira tentativa também enviou `prompt=consent`; após a tela de aprovação, a rota foi ajustada para omitir esse parâmetro na próxima tentativa controlada. A solicitação não combina `profile`, `email`, `offline_access` nem scopes Graph dinâmicos, conforme a restrição documentada para `.default`.

Antes da prova, os registros foram conferidos: o App Registration da API lista o App ID do Web em `knownClientApplications`; o cliente Web declara a permissão delegada `access_as_user` da API; e a API mantém `Calendars.ReadWrite` como permissão Graph delegada requerida. A tela de bloqueio não exibiu uma lista discriminada de permissões, então não foi possível confirmar qual entrada levou à aprovação administrativa.

Na próxima execução, um callback bem-sucedido deve retornar à página dev `/dev/meetings-graph-consent/calendar`. Ela usa o bearer da sessão somente no servidor para chamar `GET /api/v1/meetings/calendar/capabilities`; o backend validará identidade/acesso ativo, fará OBO e consultará `/me/calendar` no Graph. A página mostra apenas provedores e o código HTTP/código interno NITE; não mostra bearer, token Graph nem mensagem bruta Microsoft. Essa chamada é somente de leitura e não cria evento. A página e o consentimento continuam separados do login normal e não existem em produção.

**Resultado real em 2026-11-02:** depois de selecionar a conta institucional, o Entra exibiu “Necessidade de aprovação de administrador” para `NITE Connect Web`, no tenant `unijorge.pro.br`. A página ofereceu “Retornar ao aplicativo sem conceder autorização”, opção escolhida pelo usuário. Nenhum consentimento Graph foi concedido; não foi emitido token Graph nem executada chamada OBO após essa tentativa. Os logs locais registraram `access_denied` com `error_subcode=cancel`; o NextAuth retornou `OAuthCallbackError`. A página `/login` manteve a identidade/sessão NITE visível, mas mostrou a mensagem genérica “Não foi possível entrar com a Microsoft”. Essa mensagem é consequência do cancelamento do callback e é imprecisa para esta sequência: não indica que a identidade NITE tenha sido rejeitada.

O resultado fecha a primeira prova do caminho sem administrador para essa conta e configuração: **não funcionou**. Não prova que `Calendars.ReadWrite` delegado seja intrinsecamente admin-only nem identifica a política específica. A hipótese técnica mais forte é a política gerenciada recomendada da Microsoft, que exclui `Calendars.ReadWrite` delegado do consentimento individual; ainda falta confirmar se ela está selecionada na UniJorge. A primeira tentativa também usou `prompt=consent`, então a rota agora o omite para isolar esse fator. Uma segunda tela “aprovação administrativa” sem o parâmetro reforçará que o usuário não pode conceder com a configuração atual, mas o motivo institucional exato ainda depende dos logs/condições do tenant.

**Resultado da prova local de calendário:** a página de diagnóstico retornou `OBO_CONSENT_REQUIRED` após solicitar ao backend a leitura de capacidades. Isso confirma que o grant Graph continua ausente para o usuário/API. É uma consulta somente de leitura posterior à autenticação e não é, isoladamente, uma nova tentativa interativa de consentimento; portanto, não determina se a política sem `prompt=consent` permitiria consentimento individual. Como o usuário já informou que retornou da tela de aprovação administrativa sem conceder, o resultado é esperado e novas consultas iguais não acrescentam evidência. Não repetir a prova até que um consentimento válido seja concluído ou a configuração institucional seja alterada.

## Próxima decisão e implementação recomendada

1. Para identificar a causa, alguém com acesso aos logs do tenant deve consultar Entra Audit logs (`ApplicationManagement` / `Consent to application`) e conferir `STATUS REASON`, configuração de consentimento do usuário, política personalizada de concessão, existência/atribuição dos service principals Web e API e permissões exibidas na solicitação. Isso distingue bloqueio global, regra de risco/aplicação, atribuição requerida e eventual escopo ausente.
2. A rota local está pronta para uma única repetição controlada sem `prompt=consent`; o callback executará a consulta Graph somente de leitura se o consentimento for concluído. Se o Entra mostrar a mesma aprovação administrativa, não repetir o fluxo: o usuário precisa de aprovação administrativa ou de uma política de consentimento institucional que permita esse escopo.
3. Se a política não permitir, escolher explicitamente entre grant administrativo delegado tenant-wide, política restrita por grupo ou fluxo manual de Teams sem integração Graph.
4. Só depois de existir grant efetivo, fazer prova real Graph não destrutiva em calendário de teste: capabilities, evento Teams futuro, link, `transactionId`, leitura no Outlook, atualização, cancelamento e início imediato.

Não existe alternativa técnica confiável que faça OBO criar evento Graph sem consentimento permitido pelo tenant. O desenho combinado remove a necessidade de grant administrativo global somente quando a política institucional autoriza a concessão pelo próprio usuário.

## Referências oficiais

- [Microsoft identity platform — On-Behalf-Of flow e consentimento combinado](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
- [Microsoft Entra — configuração de bundled consent para cliente e API](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/bundle-consent-application-registrations)
- [Microsoft Entra — diagnóstico de consentimento e códigos AADSTS](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/troubleshoot-consent-issues)
- [Microsoft Entra — visão geral do consentimento de usuário e administrador](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/user-admin-consent-overview)
- [Microsoft Entra — políticas de consentimento de aplicações](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies)
- [Microsoft Graph — referência de permissões](https://learn.microsoft.com/en-us/graph/permissions-reference?view=graph-rest-1.0)
