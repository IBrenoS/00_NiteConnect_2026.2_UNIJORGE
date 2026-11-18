# Bloco 08.3R-C2 — integridade e correções funcionais

## Escopo e preservação

Implementação na main, autorizada pelo usuário, preservando o diff do C1 e a alteração local do preview. Sem commit, novas dependências, migrations ou alteração de credenciais. A API Docker local foi reconstruída e reiniciada com as correções. O design existente foi reutilizado.

## Causas e correções

| Falha | Causa verificada | Correção |
| --- | --- | --- |
| Planejamentos administrativos em Minhas Atividades | A consulta ignorava o filtro pessoal para administradores; outros integrantes recebiam todos os planejamentos dos projetos correntes | A coleção pessoal aplica autoria ou vínculo com tarefa criada/atribuída, combinada com ACL; filtro de projeto apenas restringe. `EXISTS` evita duplicação e o mesmo predicado precede contagem e paginação |
| Falta de separação administrativa | A mesma coleção servia à perspectiva pessoal e institucional | Consultas explícitas `GET /api/v1/admin/activity-plannings` e `GET /api/v1/projects/{id}/activity-plannings`, autorizadas no serviço. A consulta legada `/activities` mantém sua ACL e contrato; `/me/activities` permanece pessoal |
| Estatísticas por integrante bloqueadas no HTTP | Matcher da rota não correspondia ao controller | Matcher `/api/v1/members/*/activity-stats`; serviço exige administração global ou gestão do projeto, autorizando o ator antes de consultar o alvo. SQL contextual não inclui outros projetos |
| Criação rápida na coluna errada | Workspace descartava o grupo recebido pelo quadro | Grupo de situação/prioridade é enviado e persistido; criação cancelada exige confirmação |
| Situação, responsável e colaboradores descartados na criação | Server Action fixava executor no ator e não enviava outros campos | Payload completo; campos novos opcionais mantêm compatibilidade; backend aplica políticas existentes |
| Gravação parcial no editor | Várias requisições independentes alteravam responsável, campos, colaboradores e situação | `PATCH /api/v1/activity-plannings/{id}/tasks/{activityId}` transacional, com lock, expectedVersion, auditoria e políticas existentes. Falha em qualquer etapa desfaz todas as etapas |
| Movimentos sucessivos com versão antiga | Estado local mantinha a versão anterior e ignorava dados canônicos retornados | Workspaces integrado e legado aplicam a atividade/versão da resposta, bloqueiam movimentos concorrentes e sincronizam o refetch |
| Editor falhava ao abrir na sessão real | Diretório de candidatos exige busca de ao menos dois caracteres, mas a consulta era feita sem busca (HTTP 400 observado em log sanitizado) | Abertura carrega atribuições existentes. Busca de integrantes ocorre após dois caracteres, com paginação, erros e descarte de respostas antigas. Candidatos acumulados alimentam responsável e colaboradores |
| Responsável vazio na criação em projeto | Editor sem busca inicial enviava string vazia, não tratada pelo fallback `??` | String vazia usa o ator como padrão; backend continua validando participação e elegibilidade. Teste reproduziu o erro antes da correção |
| Colaborador não aparecia para promoção a responsável | Busca exclui integrantes já atribuídos e UI ignorava assignees nas opções de responsável | Opções incluem atribuições vigentes disponíveis, sem duplicação; backend revalida a promoção |
| Exclusão de planejamento sem acesso contextual na lista | Listagem não conectava `canDelete` ao controle | Menu “Excluir atividade” na listagem e workspace, condicionado a canDelete, com confirmação que explica a desassociação das tarefas |
| Tarefa vinculada sem entrada na perspectiva pessoal | Vista legada filtrava apenas planningId nulo; planejamento privado de outro não concede leitura pelo vínculo da tarefa | Nova vista “Minhas tarefas” usa `/me/activities`, com e sem planejamento, mantendo IDs e ACL de detalhe |

Excluir planejamento continua removendo apenas o agrupamento e desvinculando suas tarefas. Excluir tarefa continua removendo definitivamente a atividade executável, usando autoria/canDelete. Nenhum fluxo usa Lixeira documental ou exige administração adicional.

## Arquivos principais

- API: `ActivityPlanningRepository`, `ActivityPlanningService`, `ActivityPlanningController`, `ActivityPlanningContracts`, `SecurityConfiguration` e validação contextual em `ActivityService`.
- Web: `planning-actions.ts`, `data.ts`, `actions.ts`, `activity-planning-workspace.tsx`, `activity-workspace.tsx`, `activity-planning-preview.tsx`, `planning-delete-menu.tsx`, página `/atividades` e diagnósticos sanitizados em `api/server.ts`/`activities/mutations.ts`.
- Testes novos: `ActivityPersonalIsolationTest`, `ActivityPlanningTaskMutationTest`, `activity-planning-workspace-interactions.test.tsx`; testes existentes de página, actions, data e workspace atualizados.

## Integração automatizada com PostgreSQL real

Executados via `docker compose --env-file .env -f infra/compose.yaml --profile test run --rm api-tests mvn --batch-mode -q -Dtest=... test` em dois grupos sequenciais. Todas as classes abaixo passaram; total de 67 testes, sem falhas, erros ou skips:

| Classe | Testes |
| --- | ---: |
| ActivitiesBoundaryTest | 9 |
| ActivityAuthorizationTest | 10 |
| ActivityDeadlinesTest | 3 |
| ActivityPersonalIsolationTest | 5 |
| ActivityPlanningTaskMutationTest | 7 |
| ActivityPlanningTest | 10 |
| ActivityPermanentDeletionTest | 8 |
| ActivityCapabilitiesTest | 5 |
| ActivitySimplifiedManagementTest | 8 |
| ActivitySearchTest | 2 |

Os dois grupos foram `ActivityPersonalIsolationTest,ActivityPlanningTaskMutationTest,ActivityPlanningTest,ActivitiesBoundaryTest,ActivityAuthorizationTest,ActivityDeadlinesTest,ActivityDeletionTest` e `ActivityPermanentDeletionTest,ActivityCapabilitiesTest,ActivitySimplifiedManagementTest,ActivitySearchTest`. O nome `ActivityDeletionTest` do primeiro seletor não existe; a classe correta de exclusão foi executada no segundo grupo e seus oito resultados estão contabilizados acima.

Estes testes usam Spring/MockMvc com principal JWT de teste e PostgreSQL 17 via Testcontainers. Cobrem Flyway real, autorização HTTP, persistência, rollback, conflitos, períodos de atribuição, exclusão com dependências e desassociação sem perda das evidências aplicáveis. Não equivalem à validação de assinatura Entra; essa foi exercitada na sessão real abaixo.

## Frontend automatizado

- `npm run lint` e lint direcionado: aprovados. Lint direcionado foi executado novamente sobre os arquivos ajustados no encerramento.
- `npm run typecheck`: aprovado após as alterações finais.
- `npm run test`: 73 arquivos / 313 testes aprovados antes dos dois últimos ajustes de responsável vazio e promoção de colaborador. Depois desses ajustes, `vitest run` direcionado em actions, data, página e workspaces aprovou 5 arquivos / 21 testes. Os demais resultados anteriores continuam válidos; a suíte completa não foi repetida após esses dois ajustes locais.
- `npm run build`: aprovado após as alterações finais.
- `git diff --check`: aprovado.

Testes frontend usam mocks de transporte e, nos testes de interação, harness de hooks React; não substituem a homologação real. Durante a implementação, a execução ampla encontrou um mock de página incompleto devido ao novo menu e um typecheck encontrou uma referência fora de escopo no diagnóstico; ambos foram corrigidos e revalidados.

## Homologação autenticada real em 18/11/2026

Na sessão de gestor geral já disponível, com JWT Entra real e API Docker atualizada:

1. Criadas uma tarefa na coluna Em andamento e outra na coluna Alta. PostgreSQL confirmou situação e prioridade escolhidas.
2. A tarefa `2b3e9ce7-cf6c-4d69-bbef-f05938b76983` foi editada, persistindo título, descrição, início 18/11/2026, prazo 25/11/2026 e prioridade Alta.
3. Situação passou por Em execução, Planejada e Em execução novamente. O mesmo ID terminou na versão 6. Eventos STATUS_CHANGED registraram versões 4, 5 e 6.
4. Recarregamento completo preservou dados; “Minhas tarefas”, workspace do planejamento e detalhe da atividade apontaram para o mesmo ID e exibiram propriedades consistentes. Indicador do planejamento exibiu duas tarefas restantes, uma em execução e uma planejada.
5. A tarefa de teste “Homologação C2 — andamento” (`c11f2d4d-5458-4daa-808a-8659b42436f2`) foi excluída com autorização explícita. A automação ficou bloqueada no diálogo nativo e o usuário concluiu a confirmação. A interface retirou a tarefa e o PostgreSQL confirmou count=0.
6. O menu contextual da listagem exibiu “Excluir atividade”; não foi acionada a exclusão do planejamento C1, que contém outra tarefa preservada.
7. Editor de criação abriu sem consultar indevidamente o diretório; busca “Br” mostrou o integrante autorizado sem bloquear o formulário. A criação foi fechada sem gravar outro registro.

Evidência visual: `C:/Users/breno/.codex/visualizations/2026/11/18/01a1ecf8-9894-7963-a7ed-74a21cdaf5ad/c2-workspace-validado.jpg`.

## Limites e regras mantidas

- Homologação de navegador usou somente a sessão real disponível de gestor geral. Isolamento entre pessoas, coordenador, integrante comum, terceiros e projetos foi validado por integração com PostgreSQL e JWT de teste, sem trocar papéis reais.
- Exclusão de planejamento e preservação/desassociação de tarefas/evidências foram validadas em PostgreSQL de teste. O planejamento real C1 não foi excluído.
- Responsável e colaboradores diferentes foram exercitados na integração; não foram criadas novas identidades para simular esses papéis no ambiente real.
- Regra vigente `personalOwner` foi preservada: a autoria de tarefa independente atribuída a terceiros não concede edição, cancelamento ou reabertura por si só, inclusive após encerrar as atribuições. A interface respeita capacidades e o backend mantém a decisão final.
- Uma criação durante o início da homologação exibiu mensagem genérica apesar de commit integral. As verificações posteriores confirmaram persistência; não foi executado retry automático. A operação transacional garante integridade do banco, não elimina incerteza de entrega em falhas de transporte.
- O detalhe legado mostrou indisponibilidade do histórico durante a inspeção real; esse fluxo não foi modificado pelo C2. A persistência dos eventos foi confirmada diretamente no PostgreSQL.
- Não foi executada a suíte completa da API nem iniciados os Blocos 08.4/08.5.
