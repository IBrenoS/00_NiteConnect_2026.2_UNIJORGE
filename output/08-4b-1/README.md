# NITE Connect — Bloco 08.4B-1

Entrega local em 18/11/2026, na main por autorização do usuário. Sem commit ou push.

## Alterações

- Escala do módulo: texto principal 15–16 px, metadados 13–14 px, títulos de seção 20–22 px. Valores em rem; campos em mobile com 16 px. Contraste ajustado com tokens existentes, sem alterar tokens globais.
- Identificação dos projetos ampliada: fallback com iniciais de 52 px nas listagens, 60 px no workspace e 80 px na apresentação. O modelo atual tem imageUrl: null; nenhuma mídia ou fixture foi acrescentada.
- Status de projetos, StatusPill e ActivityStatusBadge com rótulos legíveis e forma retangular suave. Pontos decorativos removidos apenas dos status; prioridades, gráficos, associação de projeto e badges de outras finalidades preservados.
- Cabeçalhos simplificados, mantendo o link útil para a listagem e todos os avisos de operação temporária.
- Visão geral prioriza Sobre o projeto, Objetivos e Pessoas e responsabilidades; indicadores derivados das fixtures continuam disponíveis abaixo. Recursos do projeto removido. Equipe resumida em grade responsiva, com identidades maiores.
- Situação do projeto: sticky no desktop, offset de 80 px para respeitar o header do shell; altura máxima calc(100dvh - 96px), rolagem interna e foco de teclado. Em larguras de até 1050 px, coluna no fluxo normal para preservar área de leitura.
- Equipe e solicitações com nomes, responsabilidades, papéis e controles maiores. Planejamentos, quadros, tabela e formulários existentes preservados, inclusive o projeto fixo no novo planejamento.
- Biblioteca documental: somente tipografia, cor dos links no contexto do workspace e remoção do subtítulo redundante. Nenhuma alteração na lógica documental.

## Arquivos de implementação

Caminhos relativos a D:/nite-connect:

| Arquivo | Mudança |
| --- | --- |
| apps/web/src/components/projects/projects.module.css | Escala tipográfica, identidade, espaçamentos, contraste, layout, sticky e responsividade |
| apps/web/src/components/projects/project-ui.tsx | Status sem ponto decorativo; navegação sem repetir o título |
| apps/web/src/components/projects/project-directory.tsx | Cabeçalhos das duas listagens simplificados |
| apps/web/src/components/projects/project-workspace.tsx | Ordem editorial, remoção de Recursos e situação sem duplicação |
| apps/web/src/components/projects/project-team.tsx | Remoção do subtítulo redundante |
| apps/web/src/components/projects/project-documents.tsx | Remoção do subtítulo redundante |
| apps/web/src/components/activity-planning-preview/activity-planning-preview.tsx | Somente a apresentação compartilhada de StatusPill |
| apps/web/src/components/activities/activity-list.tsx | Somente a apresentação compartilhada de ActivityStatusBadge |
| apps/web/src/components/projects/projects.test.tsx | Regressão da composição da visão geral, conteúdo e navegação preservados |

A alteração local preexistente em apps/web/next-env.d.ts usa .next/dev/types. Os comandos Next regeneram esse arquivo; seu conteúdo preexistente foi preservado ao encerrar. Não integra a implementação desta tarefa.

## Validações

Diretório dos comandos npm: D:/nite-connect/apps/web.

### Após a última alteração de implementação

- npm run lint: aprovado, exit 0, sem warnings de ESLint.
- npm run build: aprovado, exit 0; compilação, TypeScript e geração de rotas concluídos.
- git diff --check: aprovado, exit 0. Avisos de CRLF/LF são de normalização de EOL.

### Verificações anteriores que continuam válidas

- npm run typecheck: aprovado, exit 0. Depois disso, apenas ajustes de CSS; o build final também executou TypeScript.
- npm run test: 76 arquivos / 343 testes aprovados. As mudanças posteriores se restringiram a apresentação e estilos.
- npm run test -- src/components/projects/projects.test.tsx src/components/activity-planning-preview/activity-planning-preview.test.ts src/components/activities/activity-list.test.tsx: 3 arquivos / 19 testes aprovados após o ajuste da apresentação dos status. Depois disso, apenas CSS; não foi repetida a suíte inteira.
- Impeccable detect --json nos componentes do módulo e nos dois arquivos compartilhados: nenhuma ocorrência. Executado antes dos últimos ajustes pontuais de CSS; não substitui a inspeção renderizada.

O Vitest emite o aviso preexistente de configLoader: native / ESM em configuração carregada como CommonJS. Nenhuma dependência ou configuração foi alterada para suprimi-lo.

### Navegador autenticado

- Projetos, apresentação, as duas perspectivas de Meus Projetos e as quatro áreas do workspace conferidas em claro e escuro, desktop e mobile.
- Viewports principais: 1440 × 1000 e 390 × 844; verificação intermediária em 1024 × 768. Nenhum overflow horizontal de página nas medições de responsive.json. Tabelas e abas conservam rolagem interna.
- Sticky em 1440 × 760: top 80 px, bottom 744 px, altura 664 px, scrollY 350 px. Em mobile e 1024 px: position static e max-height none. Dados em sticky.json.
- Amostragem do contraste do texto renderizado em sete superfícies, nos dois temas: nenhuma falha nos limiares de 4,5:1 para texto normal e 3:1 para texto grande; menor razão observada 4,76:1. Cálculo a partir de estilos computados, com composição alfa de RGB, sRGB e Oklab. Ícones decorativos não entram nessa medição. Não representa uma auditoria WCAG completa.
- Pesquisa sem resultados e recuperação por Limpar filtros; alternância de perspectiva administrativa; navegação entre as áreas e pastas da biblioteca; abertura do formulário com projeto fixo; aprovação de uma solicitação local; editor de tarefa alterando Em andamento para Concluída, com quadro atualizado para duas tarefas concluídas e resumo de 67%.
- Console da aba: zero erros capturados durante a validação. Tema original Sistema e viewport original restaurados.

### Fora de escopo ou não homologado nesta rodada

Backend, contratos, migrations, autenticação e persistência real não foram alterados nem testados nesta etapa. Nenhum teste de PostgreSQL ou API foi executado. Outros perfis reais, outros navegadores, arraste do quadro, upload/download e falhas forçadas de rede não foram homologados manualmente. Permanecem os avisos e limites reais do provider temporário existente.

## Evidências

- comparativo.html: nove comparações antes/depois e galeria de 53 capturas refinadas.
- before/: capturas desta sessão antes da edição. Exceções: acompanhamento.jpg e solicitacoes.jpg são baselines originais do Bloco 08.4A, copiados de output/08-4a/captures/acompanhamento-dark.jpg e pedidos-dark-desktop.jpg. Os viewports originais são diferentes e isso está explícito no comparativo; não há alegação de comparação pixel a pixel.
- after/: capturas dos temas, dispositivos, áreas e formulários refinados.
- responsive.json, contrast.json e sticky.json: medições do navegador.

A integração funcional dos dados temporários continua pendente da etapa correspondente; nenhum dado fictício adicional foi introduzido no produto. Nenhuma regressão foi observada nos fluxos exercitados, dentro da cobertura descrita acima.
