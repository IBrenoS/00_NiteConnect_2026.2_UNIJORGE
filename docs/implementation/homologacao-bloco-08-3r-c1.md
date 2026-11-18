# Bloco 08.3R-C1 — autenticação e planejamento independente

## Diagnóstico confirmado em 18/11/2026

- A imagem local anterior foi criada em 17/11/2026 às 02:07 UTC. O JAR executado não continha `ActivityPlanningController.class`, embora o frontend chamasse `/api/v1/activity-plannings`. A sessão real reproduziu a mensagem de acesso negado. Após separar o classificador de 401 e 403, a mesma consulta ainda foi classificada como `access` (403) antes de atualizar a API; após a atualização, a listagem carregou normalmente.
- O banco já tinha V43 aplicada. Ao reconstruir a API, Flyway detectou checksum aplicado `630061813` versus arquivo do checkout `1408322960` e impediu a inicialização.
- A versão aplicada da V43 incluía `PERIOD`, `JUSTIFICATION`, `CORRECTION` e `WORK_LOG_CORRECTION_RESPONSE` na constraint de auditoria. Esses valores haviam desaparecido do arquivo. Restaurar o conteúdo histórico reproduziu exatamente o checksum aplicado. Não houve `repair`, atualização manual do histórico nem reaplicação de DDL no banco local. A nova API confirmou `Successfully validated 43 migrations`.
- `getAuthenticatedNiteSession` combinava a identidade de `auth()` (que pode renovar o token) com o bearer do JWE original lido por `getToken()`. A correção resolve identidade e bearer do mesmo token, usando a mesma rotina do callback JWT. Essa divergência foi comprovada por leitura do fluxo e teste de regressão; não foi isolada como causa do incidente real, cuja API estava desatualizada.

## Fluxo e correção

O servidor decifra o JWE HttpOnly, resolve a renovação quando necessária e lê identidade e bearer do resultado. O bearer não foi incluído na sessão pública. A API continua validando o JWT no Spring Security, resolve `tid`/`oid` em `IdentityDirectory` e exige integrante ativo em `ActivityPlanningService`. Planejamento com projeto continua sujeito a `ProjectAccess`.

A classificação compartilhada distingue HTTP 401 (`unauthenticated`), HTTP 403 (`access`) e falha de conexão/5xx (`unavailable`). As telas de consulta, criação e workspace de planejamento apresentam mensagens distintas. Consumidores tipados do contrato compartilhado foram compatibilizados. Logs de falhas incluem somente método quando disponível, pathname e status, sem bearer, cookies, query string ou corpo.

## Homologação real local

Na sessão Entra já aberta de um gestor geral ativo:

1. `/atividades` carregou sem a mensagem indevida de acesso.
2. `/atividades/nova` criou “Homologação 08.3R-C1 — atividade independente”, sem projeto.
3. O retorno foi usado pela Server Action para navegar ao workspace `0b06f989-c9b2-4e56-8f8f-6bb98b997228`.
4. O workspace exibiu título e descrição e continuou acessível após atualização completa da página.
5. Consulta PostgreSQL confirmou o identificador, `project_id IS NULL`, descrição persistida e criador `ATIVO` com papel `GESTOR_GERAL`.

O registro de homologação foi preservado. Não foram alterados papéis, credenciais ou regras de projetos.

## Validação automatizada

- Web: `npm run check` — lint, typecheck, 72 arquivos / 301 testes e build aprovados. O teste de classificação falhou primeiro com 401 classificado como `access` e passou após a correção.
- Lint direcionado das duas telas de planejamento alteradas após o início da validação: aprovado.
- API: `docker compose --env-file .env -f infra/compose.yaml --profile test run --rm api-tests mvn --batch-mode -q -Dtest=ActivityPlanningTest test`: 9 casos aprovados; um novo teste apresentou erro na fixture por usar status inexistente `INATIVO`. A fixture foi corrigida para `AFASTADO`, conforme o enum real. Reexecução direcionada `-Dtest=ActivityPlanningTest#inactiveAndUnmappedIdentitiesCannotCreateOrListPlanning`: 1 teste aprovado, sem falhas, erros ou skips. Confirmados GET e POST 403 para integrante afastado e identidade não vinculada. Os nove resultados anteriores permanecem válidos; a classe completa não foi reexecutada após a correção da fixture.
- Os casos aprovados incluem POST 201, GET 200 e persistência PostgreSQL para integrante comum, coordenador e gestor geral. Os testes usam Spring Security/MockMvc e PostgreSQL 17 real via Testcontainers; a homologação do navegador complementa a validação com JWT Entra real.

## Limites

Só havia uma sessão real disponível, de gestor geral. Integrante comum e coordenador foram validados na integração automatizada, sem trocar papéis da conta real. Renovação com rotação de refresh token e falhas foi validada automaticamente; não foi forçada expiração nem revogação do token Microsoft da sessão real. Não foi executada a suíte completa da API: o código de autorização permaneceu inalterado. Não houve commit.
