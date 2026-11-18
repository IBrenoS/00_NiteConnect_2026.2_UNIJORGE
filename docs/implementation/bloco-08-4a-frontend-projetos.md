# Bloco 08.4A — Interfaces de Projetos e Meus Projetos

Data: 18/11/2026. Frontend local autenticado. Branch: `feat/nite-connect-current-changes`. Sem commit ou push.

## Entrega

Interfaces implementadas nas rotas definitivas, com a autenticação e o shell existentes. Não foram criadas rotas de preview. As referências fornecidas orientaram a composição, com as divergências documentadas abaixo; não há alegação de correspondência pixel a pixel em áreas cuja referência fornecida não corresponde à matriz.

| Rota | Experiência |
| --- | --- |
| `/projetos` | Galeria pública interna, pesquisa, situação, disponibilidade, ordenação, favoritos e acompanhamento dos pedidos locais |
| `/projetos/[id]` | Apresentação pública, propriedades, gestor, participação/interesse e confirmação sem envio real |
| `/meus-projetos` | Lista de participações fictícias vigentes; acompanhamento administrativo separado e condicionado aos papéis recebidos da sessão |
| `/meus-projetos/[id]` | Visão operacional com informações, objetivos, equipe resumida e indicadores derivados das fixtures |
| `/meus-projetos/[id]/atividades` | Planejamentos contextualizados, criação, quadros por situação/prioridade, tabela, pesquisa, filtros, editor e indicadores reutilizados do Bloco 08.3 |
| `/meus-projetos/[id]/equipe` | Integrantes e liderança; solicitações com aprovação/rejeição local e resposta opcional na perspectiva administrativa |
| `/meus-projetos/[id]/documentos` | Biblioteca reutilizada, pastas, pesquisa, metadados, estados vazios e aviso de integração pendente |

A rota documental já integrada `/projetos/[id]/arquivos` foi preservada sem alteração. A perspectiva transversal de Atividades e entregas não foi modificada.

## Organização e reutilização

- `apps/web/src/components/projects/`: componentes de catálogo, apresentação, workspace, equipe, atividades, documentos, estado temporário e estilos com tokens existentes.
- `apps/web/src/lib/projects/visual-data.ts`: fixtures públicas e operacionais em estruturas distintas; estados iguais aos do backend, identificadores de projeto `exemplo-*`, relacionamento projeto → planejamento → tasks e dados fictícios de participação.
- `apps/web/src/lib/projects/visual-documents.ts`: fixtures nos tipos documentais existentes, com isolamento de pastas por projeto.
- `apps/web/src/lib/projects/catalog-contract.ts`: estrutura do catálogo V42 e projeção explícita de `name`, `summary` e `memberCount` para o modelo de apresentação. Não há transporte HTTP novo. As capacidades da API precisarão ser conectadas na próxima etapa.
- `apps/web/src/components/activity-planning-preview/activity-planning-preview.tsx`: reutilizados `PlanningCard`, `PlanningForm`, `TaskBoard`, `TaskTable`, `TaskEditor`, `StatsPanel` e a movimentação existente. Apenas duas extensões opcionais: projeto fixado no formulário e aviso de não persistência no editor. As utilizações anteriores mantêm os padrões existentes.
- `apps/web/src/components/documents/library-explorer.tsx`: opção `temporary` bloqueia formulários de mutação e links de download/editor para fixtures. O comportamento padrão permanece igual.
- `apps/web/src/app/(authenticated)/layout.tsx`: provider local dentro do layout protegido. Nenhum bearer é passado ao provider.
- `apps/web/src/components/shell/authenticated-navigation.tsx`: link real de Projetos e destaque de navegação nas rotas internas.
- Novos `loading.tsx` e `error.tsx` para as duas áreas; estados vazios e confirmações pelos componentes existentes.

As alterações visuais permanecem em memória enquanto se navega pelo layout compartilhado. Recarregar a página ou sair desse layout reinicia as fixtures. Não há localStorage, conexão nova com API de projetos, alteração de autorização ou concessão real de participação. Os papéis globais da sessão apenas condicionam a exibição da perspectiva administrativa sobre exemplos; isso não substitui as capacidades/ACL futuras do backend.

## Fontes e diferenças verificadas

O ZIP contém links e matriz, não imagens binárias. As imagens disponíveis foram baixadas para `output/08-4a/references/`. A matriz original está preservada como evidência nesse diretório de entrega. O pedido atual prevaleceu sobre a orientação antiga de criar preview contida no material anexado.

| Referência | Verificação e aplicação |
| --- | --- |
| 01 Notion | Galeria de recursos/templates; aplicada à hierarquia e à grade sem capas, pois V42 retorna imagem nula |
| 02 Behance | Alternativa de mídia não aplicada: nenhuma capa autorizada foi introduzida |
| 03 Linear | Lista pessoal, propriedades compactas e painel de situação |
| 04 Linear | Apresentação editorial com propriedades laterais; sem dados privados |
| 05 Asana | Conteúdo operacional à esquerda e situação à direita; sem reproduzir IA, mensagens ou métricas reais inexistentes |
| 06 Teams | Etapas adicionais baixadas; 06c contém o diálogo de pedido com mensagem opcional. Usado limite de 2.000 do contrato NITE |
| 07 Teams | Solicitações compactas e decisões individuais; não foi adicionada aprovação em lote |
| 08 Asana | A imagem é um diálogo de compartilhamento, não uma página de equipe. Aproveitadas hierarquia de identidades e apresentação de papéis; sem convites externos |
| 09 Asana | A imagem fornecida mostra tabela de tarefas, não Files. Não foi atribuída a uma referência documental inexistente; biblioteca existente reutilizada |
| 10 Notion | A imagem fornecida mostra tabela de equipe, não quadro de tasks. Não foi apresentada como quadro verificado |
| 11 Notion | Link aberto e conferido no Mobbin autenticado: Task Database com tabela. Screenshot do navegador preservado |

A fidelidade específica da área documental e do quadro à seleção 09/10 requer corrigir essas duas referências. Os componentes homologados e a identidade global NITE foram preservados nesse intervalo.

## Validações

### Executadas após a alteração final de código

Em `D:/nite-connect/apps/web`, `npm run check` completou com exit code 0:

- `npm run lint`: aprovado, zero warnings de ESLint.
- `npm run typecheck`: aprovado, geração de tipos de rotas e TypeScript sem erros.
- `npm run test`: aprovado, **76 arquivos / 342 testes**.
- `npm run build`: aprovado, compilação, TypeScript e geração de rotas concluídos.

O Vitest emite um aviso de configuração existente sobre `configLoader: native`; não é falha de teste e não foi suprimido nem alterado nesta tarefa.

`git diff --check`: aprovado. Os avisos de normalização CRLF/LF não indicam erro de whitespace.

Os novos testes cobrem projeção pública, filtros combinados, estados de participação, isolamento de dados por projeto, separação entre participação e administração, ausência de dados privados no catálogo, biblioteca temporária sem operações reais e reutilização do formulário com projeto fixo e aviso no editor.

### Navegador autenticado

Sessão existente de Gestão Geral, navegador do usuário, servidor local. Verificados:

- Catálogo → apresentação → solicitação → confirmação → acompanhamento do pedido ao navegar de volta.
- Interesse futuro em projeto pausado, confirmação e favoritos na navegação do catálogo.
- Pesquisa sem resultados e limpeza dos filtros.
- Meus projetos e acompanhamento administrativo com listas distintas.
- Entrada no workspace e navegação entre suas quatro áreas.
- Edição local de situação e colaborador, atualização do quadro e indicadores, e mesma task na tabela.
- Criação de planejamento com projeto fixo, criação de task e agrupamento por prioridade.
- Equipe, abertura de pedidos, aprovação e rejeição locais com mensagem de resposta.
- Documentos, navegação entre pastas e pasta vazia.
- Temas claro/escuro pelo controle existente; preferência original Sistema restaurada.
- Desktop padrão do navegador e mobile **390 × 844**. Catálogo, visão geral, documentos, equipe, lista pessoal e tabela observados em mobile; capturas claras/escuras representativas.
- Encontrado e corrigido overflow na lista pessoal causado pelo texto acessível posicionado dentro da tabela. Após a correção, `documentElement.scrollWidth <= innerWidth` foi conferido novamente para lista pessoal e tabela de tarefas; tabelas mantêm rolagem interna.
- Console da aba ao encerrar: nenhuma mensagem de erro capturada.

Não foram forçadas falhas de autenticação, rede ou error boundary no navegador. Outros papéis não foram homologados com contas reais nesta sessão; a apresentação restrita foi coberta por testes de frontend. Arraste do quadro não foi homologado manualmente nesta rodada; o componente e a lógica existentes foram reutilizados e continuam cobertos pela suíte frontend.

### Verificações anteriores e fora de escopo

Os 18 testes direcionados iniciais e as execuções intermediárias foram substituídos pela execução final completa acima. Nenhuma conclusão depende exclusivamente desses resultados intermediários.

Backend, PostgreSQL e migrations não foram executados: nenhum arquivo dessas áreas foi alterado pela tarefa. Upload, download, persistência e ACL real dos novos fluxos não foram testados, porque a integração funcional foi explicitamente excluída do escopo.

## Evidências

- `output/08-4a/comparativo.html`: **nove comparações** lado a lado, com diferenças explícitas, mais a galeria completa de **30 capturas**.
- `output/08-4a/captures/`: screenshots originais das rotas locais.
- `output/08-4a/references/`: imagens originais Mobbin do kit e captura da referência 11 no navegador.

O HTML é somente um artefato de evidências e não integra as rotas do produto.

## Pendências de integração

1. Substituir o provider/fixtures pelos contratos V42 de catálogo, participações, apresentação/workspace, equipe, solicitações e interesse; usar capacidades retornadas pela API como autoridade de exibição e ação.
2. Conectar os planejamentos e a task canônica V43 no contexto do projeto, mantendo seus IDs, versões e os tratamentos de concorrência já existentes no módulo 08.3.
3. Conectar LibraryExplorer à biblioteca PROJECT real com capacidades e conteúdo autorizado. Upload/download/editor estão intencionalmente indisponíveis para exemplos.
4. Conectar paginação, estados de rede, erros reais e notificações de decisão. Acompanhamento atual representa apenas as interações fictícias feitas no frontend.
5. Corrigir referências 09/10 antes de afirmar fidelidade específica a Files/quadro da seleção.

## Preservação do workspace

O repositório estava limpo no início. Durante o trabalho apareceram remoções de previews de atividades/frequência/reuniões e de dois componentes auxiliares, feitas fora desta tarefa. Elas foram preservadas e não fazem parte desta entrega. `next-env.d.ts` foi regenerado automaticamente pelos comandos do Next.js. Nenhum reset, exclusão de dados, alteração de .env, dependência, migration, commit ou push foi realizado por esta tarefa.
