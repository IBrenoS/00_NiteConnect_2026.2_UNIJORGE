# Consolidação de Minhas Atividades

## Solução

`/atividades` agora consome `GET /api/v1/me/activity-items`, uma projeção read-only e paginada no servidor. A projeção combina cards de planejamentos pessoais com tarefas executáveis que não podem ser representadas por um planejamento que o integrante consiga ler. O card do planejamento representa suas tarefas e agrega contagens; uma tarefa vinculada a um planejamento legível não aparece também como card independente. Uma tarefa atribuída dentro de planejamento privado aparece pelo mesmo `activityId`, com navegação ao detalhe canônico.

Busca textual, projeto, total e paginação são aplicados à união dos dois tipos no PostgreSQL. A busca também encontra tarefas pelo card do planejamento que as representa. O total e a página usam uma única transação `REPEATABLE_READ`. Cada item com projeto traz o título do registro de projeto; a UI não substitui esse nome por um rótulo genérico quando ele existe. Projetos inacessíveis continuam ocultos com a resposta `404` da política existente.

## Reuso e redundâncias removidas

- Reutilizados `ActivityPlanningRepository`, `ProjectAccess`, `ActivityPlanningService`, o contrato `PageResult`, os cards `PlanningCard`, os filtros por pesquisa/projeto e o menu de exclusão existente.
- A projeção preserva `activity_plannings` e `activities`, IDs, atribuições, histórico e evidências. Excluir planejamento mantém a desvinculação já existente.
- Removidas as duas listas paralelas de `/atividades?view=tasks` e `/atividades?view=legacy`; acessos antigos redirecionam para `/atividades` preservando os demais parâmetros.
- Removido o link duplicado para tarefas sem planejamento no workspace de projeto. O diálogo de exclusão agora aponta para “Minhas atividades”.
- Nenhuma migração ou limpeza de dados persistidos foi feita.

## Contrato

Adicionado `GET /api/v1/me/activity-items?page=&size=&projectId=&q=` (padrões `0` e `20`). Cada item tem `kind` (`PLANNING` ou `TASK`), identidade canônica, projeto, origem e campos específicos do tipo. O backend aplica vínculo ativo, acesso atual ao projeto e autorização de leitura do planejamento antes de montar a projeção. O contrato anterior de `/api/v1/me/activities` continua disponível para os demais consumidores.

## Homologação local observada

Na sessão autenticada foram encontrados dois projetos chamados `HOMOLOGAÇÃO 08.4B-2`, marcados como registros de teste. Eles foram identificados, não alterados nem excluídos. A página `/atividades` retornou “Você não tem acesso a esta consulta” antes de o servidor local carregar o novo contrato; a confirmação visual final precisa ser feita após atualizar a API local. O shell mantém links separados para “Minhas atividades” e “Meus projetos”; o workspace conserva a aba “Atividades e planejamento” e o link redundante para tarefas sem planejamento foi removido.

## Validação executada

- PostgreSQL 17/Testcontainers: `ActivityPlanningTest` — 14 aprovados; `ActivityAuthorizationTest` — 10, `ActivityCapabilitiesTest` — 5 e `ActivityPersonalIsolationTest` — 5 aprovados na execução conjunta. A repetição final de `ActivityPlanningTest` passou integralmente.
- Frontend: 12 testes focados da página unificada e do parser passaram. Na suíte completa, 547/550 passaram; os três restantes estão em `meetings/graph-help-link.test.ts` e esperam a rota base de integração Microsoft enquanto o código local aponta para `/calendario`.
- `npm run lint` passou. `npm run build` passou.
- `npm run typecheck` não passou: reportou o import `../../../../../auth` não resolvido em `src/app/(authenticated)/reunioes/integracao/microsoft/page.tsx`, fora desta alteração.
- A navegação visual autenticada dos cards novos permanece pendente de atualizar a API local; os testes de integração exercitam a projeção, a autorização e os IDs canônicos no backend.
