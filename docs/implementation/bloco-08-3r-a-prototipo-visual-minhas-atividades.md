# Bloco 08.3R-A — protótipo visual de Minhas Atividades

**Escopo:** protótipo navegável e isolado para revisão de produto. Os registros e as alterações exibidos são demonstrativos e permanecem no estado local do navegador. A rota não faz chamadas de leitura ou gravação dos recursos de atividade; o layout autenticado global continua protegendo a rota.

## Acesso e telas

Abra `/atividades/preview`. A faixa superior identifica a demonstração e a navegação numerada permite alternar entre os oito estados:

| Tela | URL | Conteúdo principal |
| --- | --- | --- |
| Minhas atividades | `/atividades/preview?tela=plannings` | Planejamentos de exemplo, independentes e ligados a projetos, resumo derivado de tarefas, busca e filtro de projeto; a rota preserva também a referência visual a tarefas legadas sem agrupamento. |
| Nova atividade | `/atividades/preview?tela=create-planning` | Formulário de criação do planejamento, separado da criação da tarefa. “Ver prévia” não envia nem persiste dados. |
| Interior do planejamento | `/atividades/preview?tela=workspace&planejamento=1` | Cabeçalho, descrição, breadcrumb, quadro por situação, criação rápida e painel lateral de estatísticas. |
| Quadro por prioridade | `/atividades/preview?tela=priority&planejamento=1` | Colunas Alta, Média, Baixa e Sem prioridade. |
| Quadro por situação | `/atividades/preview?tela=status&planejamento=1` | Colunas Planejada, Em andamento, Concluída e Cancelada. |
| Tabela | `/atividades/preview?tela=table&planejamento=1` | Tarefas em linhas densas, com situação, prioridade, responsável e prazo. |
| Criar / editar tarefa | `/atividades/preview?tela=task-form&planejamento=1` | Formulário contextual para tarefa executável; edição inicia com campos da tarefa demonstrativa selecionada. |
| Estados vazios | `/atividades/preview?tela=empty&planejamento=1` | Planejamento sem tarefas e exemplo separado de tarefa legada sem planejamento. |

As imagens da revisão visual foram capturadas no navegador autenticado em viewport desktop de aproximadamente 1920 × 960 px e tema dark. Elas foram apresentadas inline durante a revisão da conversa, mas não foram exportadas como arquivos locais. A automação de captura disponível opera em contexto de navegador isolado e redireciona para `/login`; por isso não gerou arquivos PNG reutilizáveis. A rota continua disponível para que o responsável pelo produto gere capturas no navegador já autenticado.

## Referências consultadas

| Estado do protótipo | Referência Notion / Mobbin | Correspondência observada |
| --- | --- | --- |
| Quadro por prioridade e workspace | [Kanban — captura Notion](https://mobbin.com/screens/0b10f8d0-2acb-4d7f-87f4-0bfd14e463bc) | Cabeçalho de database e toolbar compactos, agrupamentos em colunas, contador no cabeçalho e cartões com propriedades em chips. |
| Movimentação de tarefas | [Movimentação — fluxo Notion](https://mobbin.com/flows/6423d52d-5c98-4a7d-a1f9-492fb2b6774b) | O fluxo consultado mostra um cartão movido entre agrupamentos do quadro. O protótipo permite trocar a propriedade no editor contextual; não implementa drag-and-drop nem persistência. |
| Tabela | [Tabela — captura Notion](https://mobbin.com/screens/9aed23d0-f039-4685-aeb1-8a0f81628796) | Cabeçalho discreto, linhas alinhadas e propriedades compactas. O protótipo preserva a descrição acessível pelo título da tarefa, sem reservar uma segunda linha em cada registro. |
| Criação | [Criação de tarefa — fluxo Notion](https://mobbin.com/flows/1ebe43ae-b047-45cc-a8ea-222cc7639c28) | Fluxo consultado no Mobbin; serviu como referência de criação dentro da base. No protótipo, a criação do agrupamento usa uma tela separada da criação de tarefas. |
| Detalhes | [Detalhes — captura Notion](https://mobbin.com/screens/b95c9bf0-6d2c-489f-814b-c35d192310eb) | O link direto não carregou no Mobbin durante esta revisão. Nenhuma alegação visual é feita sobre essa captura. O formulário de tarefa foi definido a partir dos requisitos do bloco e dos contratos existentes. |
| Status | [Edição de status — fluxo Notion](https://mobbin.com/flows/03c4c8dc-a100-4fd0-8f19-aa96916bd793) | O fluxo consultado apresenta edição da propriedade de status no próprio contexto da base. O protótipo expõe situação e prioridade no editor contextual acionado pelo cartão ou pela linha. |

As capturas locais do kit Notion mencionadas em `minhas-atividades-referencias-visuais.md` não estavam disponíveis no repositório nem no diretório de trabalho desta execução; não foram usadas como evidência.

## Comparação visual desta proposta

| Critério | Referência Notion | Protótipo NITE Connect | Diferença / observação |
| --- | --- | --- | --- |
| Proporção do workspace | Database ocupa a área central com toolbar curta. | Shell global autenticado preserva a navegação NITE; no desktop o quadro divide o espaço com painel de resumo de 225 px. | A navegação global do NITE ocupa uma fração maior da largura que a sidebar do Notion. O painel lateral reduz a largura útil do quadro, conforme exigido para as estatísticas. |
| Cards | Cards compactos, agrupados por cor e propriedade. | Cards com título, chips de prioridade/situação, responsável e prazo em linhas curtas. | Altura reduzida depois da primeira inspeção; descrição fica no editor, evitando que o cartão cresça por texto longo. |
| Agrupamentos | Cor suave por grupo e contagens no cabeçalho. | Quatro grupos fixos; cada grupo tem fundo sutil e contador. | Os agrupamentos seguem os estados NITE e incluem “Sem prioridade”; não reproduzem nomes ou cores editáveis do Notion. |
| Tabela | Muitas linhas e poucas bordas; propriedades em uma linha. | Nome, situação, prioridade, responsável e prazo; bordas horizontais leves e descrição acessível pelo `title`. | A tabela deliberadamente prioriza densidade. Em viewport estreito, mantém rolagem horizontal mínima. |
| Ferramentas | Ícones compactos para busca, filtro e ordenação. | Busca expansível, filtro contextual por situação e ordenação por título, prioridade e prazo. | Busca/filtro/ordenação operam sobre os dados demonstrativos locais; menus avançados e views salvas não fazem parte do contrato atual. |
| Formulários | Criação contextual na base e edição inline/popover. | Criação rápida inline no quadro; formulário compacto em modal para criar/editar propriedades. Criação de planejamento fica em tela própria. | Mantém a separação entre agrupamento e tarefa. O modal oferece mais campos que os cartões e evita um formulário longo permanente. |
| Temas | Capturas Notion variam entre claro e escuro. | Tokens existentes do NITE Connect; a revisão visual foi feita em dark. | Light não recebeu captura nesta execução; a rota herda o `ThemeProvider` e tokens globais já existentes. |
| Interações | Movimentação e edição refletem no database. | Navegação, mudança de filtros/ordenação e formulários atualizam somente estado demonstrativo local. | Drag-and-drop e sincronização não foram implementados nesta fase visual. |

**Diferenças para a implementação local reprovada:** o preview não monta a lista como quatro colunas altas de atividades; separa a lista de planejamentos do interior de cada agrupamento, troca a faixa horizontal de métricas por um painel lateral compacto, substitui filtros extensos por controles discretos e separa a criação de planejamento da tarefa executável.

## Componentes visuais definidos

Os componentes abaixo estão nomeados e exportados pelo módulo [activity-planning-preview.tsx](../../apps/web/src/components/activity-planning-preview/activity-planning-preview.tsx); usam props e callback para separar apresentação dos dados e podem ser extraídos para o workspace de projetos após a aprovação visual:

- `PlanningCard`: identificação do projeto, descrição, total de tarefas, contagens de status e progresso derivado.
- `TaskCard`, `StatusPill` e `PriorityPill`: cartão compacto e propriedades de leitura.
- `KanbanColumn` e `TaskBoard`: agrupamento, contagem e criação rápida inline.
- `PageHeading` e `Toolbar`: cabeçalho, views, busca, filtro e ordenação.
- `TaskTable`: propriedades alinhadas com densidade e poucas bordas.
- `StatsPanel`: totais, distribuição por situação e progresso com denominador explícito.
- `PlanningForm` e `TaskEditor`: criação separada de agrupamento e tarefa, com edição de propriedades contextual.
- `EmptyState`: planejamento sem tarefas.

O preview mantém os dados e o estado de demonstração no mesmo módulo para evitar que os protótipos pareçam registros persistidos; a extração de arquivos compartilhados fica para a etapa de integração.

## Contratos backend para integração posterior

Os endpoints abaixo já existem no backend do Bloco 08.2B. O protótipo não os chama nem os altera.

| Tela / ação | Contrato existente |
| --- | --- |
| Minhas atividades | `GET /api/v1/activity-plannings?page=&size=&projectId=&q=` para os agrupamentos. `GET /api/v1/activity-plannings/{id}/stats` fornece contadores por agrupamento. `GET /api/v1/me/activities` sem `planningId` mantém a consulta de tarefas pessoais, inclusive legadas sem agrupamento; `GET /api/v1/me/activities/stats` fornece métricas pessoais globais. |
| Criar planejamento | `POST /api/v1/activity-plannings` com `{ title, description?, projectId? }`. A criação não cria uma tarefa. |
| Abrir workspace | `GET /api/v1/activity-plannings/{id}`, `/capabilities`, `/tasks` e `/stats`. A consulta de tarefas aceita filtros, ordenação e paginação já definidos pelo controller. |
| Quadro por situação | `GET /api/v1/activity-plannings/{id}/tasks`; mudança de status em `PATCH /api/v1/activities/{taskId}/status` com status e `expectedVersion`. |
| Quadro por prioridade | Mesma consulta paginada; prioridade é propriedade de tarefa e atualização usa `PATCH /api/v1/activities/{taskId}` com `expectedVersion` e `priority`. |
| Tabela | Mesma coleção canônica de tarefas, incluindo `planningId`; os filtros e ordenações disponíveis vêm dos parâmetros atuais do endpoint. |
| Criar tarefa | `POST /api/v1/activity-plannings/{id}/tasks`, incluindo `title`, `description?`, datas/prioridade/responsável e `expectedVersion` do planejamento. |
| Editar tarefa | `PATCH /api/v1/activities/{taskId}` com `expectedVersion` e apenas os campos alterados; a autorização e capacidades continuam determinadas pela política de atividade. |
| Planejamento sem tarefas | `GET /api/v1/activity-plannings/{id}/tasks` retorna lista vazia. Tarefas antigas continuam em `/api/v1/me/activities` sem filtro de `planningId`. |

**Ponto de integração:** o frontend atual já usa `/atividades/[id]` como detalhe de uma tarefa. A rota de detalhe do planejamento deve ganhar um caminho distinto, por exemplo `/atividades/planejamentos/[planningId]`, antes de substituir a navegação em produção. Não há alteração de rota produtiva nesta fase.

## Pendências funcionais para 08.3R-B

- Adaptar o cliente de API do frontend aos contratos de `activity_plannings`, incluindo capacidades e paginação.
- Definir como carregar estatísticas por card sem criar uma sequência excessiva de requisições; o backend atual expõe estatística por planejamento, mas não inclui rollup na lista.
- Integrar criação/edição e tratamento de `expectedVersion`, conflitos, permissões, erros e estados de carregamento.
- Definir a rota produtiva do workspace distinta do detalhe de tarefa já existente.
- Decidir se movimentação deve ser suportada por drag-and-drop ou por edição contextual; as APIs atuais permitem alterar propriedades, mas a interação desta etapa é somente demonstrativa.
- Capturar versões desktop e mobile em light e dark para revisão final de proporções e responsividade.

## Implementação e validação desta etapa

- Rota isolada em `apps/web/src/app/(authenticated)/atividades/preview/page.tsx`; fica dentro do shell autenticado existente.
- Protótipo em `apps/web/src/components/activity-planning-preview/activity-planning-preview.tsx`; sem integração funcional e sem chamadas de gravação.
- Revisão visual manual em navegador autenticado nos estados de lista, criação de planejamento, workspace, quadros, tabela, formulário de edição e vazio. Mobbin foi acessado pelo conector; a referência de detalhes não carregou.
- Capturas vistas inline na conversa; não salvas em `apps/web/output/playwright/` porque o navegador de captura não compartilha a sessão autenticada.
- Após a implementação: `npx eslint 'src/app/(authenticated)/atividades/preview/page.tsx' 'src/components/activity-planning-preview/activity-planning-preview.tsx' --max-warnings=0` (passou); `npx tsc --noEmit` (passou); `git diff --check` (passou, com aviso CRLF em `apps/web/src/lib/activities/actions.ts`, arquivo preexistente). Nenhuma suíte de testes foi executada nesta etapa visual.
