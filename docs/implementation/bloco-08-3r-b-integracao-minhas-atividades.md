# Bloco 08.3R-B — Integração de Minhas Atividades

## Rotas e componentes

- `/atividades` lista `activity_plannings` com pesquisa, filtro de projeto, paginação e resumo agregado. A rota legada `/atividades/[id]` foi preservada; tarefas sem `planningId` continuam acessíveis pelo link de tarefas sem planejamento.
- `/atividades/nova` reutiliza `PlanningForm` e persiste um planejamento antes de navegar para o workspace retornado pela API.
- `/atividades/planejamentos/[id]` carrega o planejamento, suas tarefas, capacidades e indicadores. O workspace real reutiliza `PageHeading`, `Toolbar`, `TaskBoard`, `TaskTable`, `StatsPanel` e `TaskEditor` do preview. Dados de demonstração permanecem isolados em `/atividades/preview`.

## Contratos utilizados

- `GET/POST /api/v1/activity-plannings`, `GET/PATCH/DELETE /api/v1/activity-plannings/{id}` e `GET /api/v1/activity-plannings/{id}/capabilities`.
- `GET /api/v1/activity-plannings/{id}/tasks`, `POST /api/v1/activity-plannings/{id}/tasks` e `GET /api/v1/activity-plannings/{id}/stats`.
- Tasks usam `activities`: `GET/PATCH/DELETE /api/v1/activities/{id}`, `PATCH /api/v1/activities/{id}/status`, capabilities, assignees, executor e collaborators. Criação vinculada envia `expectedVersion` do planejamento e o integrante autenticado como executor padrão.
- Indicadores resumidos são os agregados da API; o próximo prazo é calculado sobre todas as tasks carregadas, excluindo concluídas, canceladas e datas passadas. A contagem de prioridade alta deriva dessas mesmas tasks, pois o contrato de stats não fornece esse campo.

## Acesso a projetos e lacuna

Não há endpoint de candidatos a projeto com a capacidade específica `create planning` no contrato disponível. O seletor recebe projetos reais dos quais o integrante consta como líder, mais a listagem administrativa para os papéis `COORDENADOR` e `GESTOR_GERAL`; o backend continua sendo a autoridade final ao criar o planejamento. A UI não concede capacidade. Essa descoberta de opções é uma aproximação até que o backend exponha a capacidade de criação por projeto.

## Exclusão e legado

A exclusão de task é permanente e usa a capacidade `canDelete`; a confirmação informa a remoção da atividade executável. A exclusão de planejamento é outra operação: remove o agrupamento e desassocia suas tasks, sem apagá-las nem remover evidências ou documentos, segundo a regra V43. As atividades sem agrupamento não são convertidas nem ocultadas.

## Homologação e limitações

Frontend automatizado, typecheck, lint e build foram executados durante a implementação. Na sessão autenticada local disponível, `/atividades` retornou `403` ao consultar os planejamentos. Assim, os fluxos de mutação autenticados e a comparação visual do workspace preenchido não foram homologados contra registros reais; não foram criados dados de teste permanentes para contornar essa restrição. O formulário de criação abriu, mas suas opções de projetos dependem das capacidades efetivas retornadas nesse ambiente.

Na comparação visual em tema dark e viewport de 1920 × 1000, a listagem mantém a composição do preview e remove somente a faixa de demonstração e o menu de homologação. O conteúdo de cards não pôde ser comparado na rota real porque a consulta foi negada. Não houve validação visual em tema light nesta sessão.
