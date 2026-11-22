# Controles de consulta do NITE Connect

## Direção e limites

Controles compactos de 36 px no desktop, com alvos de 44 px em dispositivos de ponteiro impreciso; raio de 8 px, bordas sutis e foco interno único. Reutilizar tokens de superfície, texto, borda e foco nos dois temas. SVGs de 16 px, sem glifos tipográficos para pesquisa. Não alterar fontes, sidebar, Meus arquivos ou Lixeira.

Referências inspecionadas: dashboard autenticado Resend (pesquisa e menu de situação), Stripe Customers, filtros contextuais Notion e calendário Sentry pelo MCP Mobbin. As três telas Mobbin fornecidas também foram inspecionadas no navegador, pois o MCP oferece busca e não leitura direta de um screen ID. Nenhum ativo proprietário foi incorporado.

## Arquitetura e alternativas

Adotar componentes explícitos, com CSS Modules isolado. Evitar alterações globais e preservar os defaults de Button, Select e TextField que atendem experiências excluídas. Acrescentar somente uma variante compacta de Button. Não adicionar dependências.

FilterSelect mantém o contrato HTML de select (eventos, formulários GET, required, disabled e reset), personalizando o picker com appearance: base-select nos navegadores compatíveis. O navegador gerencia teclado, seleção, top layer e posicionamento. Navegadores sem suporte mantêm o seletor nativo funcional. Isso evita reconstruir a semântica de formulário em uma listbox JavaScript.

SearchField preserva os atributos e eventos do input, incluindo submissão, busca local e debounce definido pelo consumidor. Limpeza é opcional e explícita.

DatePicker mantém input date, valor ISO e validação nativa, acrescentando calendário compartilhado em português. DateRangePicker compõe dois campos sem introduzir regras de intervalo que os consumidores não possuíam.

FilterToolbar mantém formulário GET e acrescenta filtros avançados recolhíveis, sempre montados para preservar seus valores. Não mudar as decisões de autorização, paginação, normalização ou significado de filtros.

## Sequência de implementação

- [x] Testar contratos de formulário, datas e variante compacta antes da implementação.
- [x] Criar SearchField, FilterSelect, DatePicker/DateRangePicker e CSS isolado; estender Button e FilterToolbar sem modificar defaults.
- [x] Migrar consultas em Projetos/Equipe/Planejamentos, Atividades, Dashboard, Gestão, Frequência e busca de convidados. Auditar formulários de edição elegíveis.
- [x] Conferir menus abertos, teclado, valores preenchidos, filtros ativos e vazio; desktop/mobile, claro/escuro. Validar exclusões por diff e consumidores compartilhados.
- [x] Executar testes pertinentes, lint, typecheck, testes do frontend e build. Registrar resultados reais e limitações. Não commitar.

## Auditoria e adoção

| Duplicação anterior | Consolidação | Consumidores |
| --- | --- | --- |
| Inputs soltos e buscas compostas com o glifo ⌕ | SearchField com SVG e foco interno | Projetos, Equipe, planejamentos, tarefas, Dashboard, Gestão, Frequência, Relatórios, convidados de reuniões |
| Selects com classes por página; listboxes próprios de ViewSelector, ProjectFilter e PlanningForm | FilterSelect com picker personalizável e semântica nativa | Cabeçalho do Dashboard, filtros de consultas, edição de atividades/projetos/reuniões, integrantes e acessos |
| Inputs de data com apresentações próprias | DatePicker e DateRangePicker | Dashboard, Gestão, atividades, projetos, perfil e editor de reuniões |
| Toolbar gerencial com todos os campos expostos | FilterToolbar compact, advanced e advancedActive | Projetos, planejamentos, Dashboard, Gestão e Relatórios |
| Botões locais com alturas e bordas distintas | Button size=compact e buttonClassName para links sem mudar sua semântica | Ações das áreas migradas; default de Button preservado |

As pesquisas assíncronas de pessoas mantêm seus contratos e estados de erro/vazio. O autocomplete de responsável no editor continua específico do seu fluxo, sem substituí-lo por uma lista estática. Calendários de agenda e navegação entre períodos não foram transformados em campos de formulário.

Meus arquivos, Lixeira, componentes documentais, sidebar, globals.css, dependências e backend não tiveram alterações nesta tarefa. O CSS novo contém apenas classes locais; os defaults anteriores dos componentes compartilhados permanecem disponíveis.

## Validação executada em 22/11/2026

- Testes iniciais de contrato falharam pela ausência dos componentes e passaram após a implementação: 20/20.
- `npm run test`: primeira rodada com 534/540; segunda rodada com 540/541. As falhas eram expectativas de estrutura/tipo de componente após a migração, incluindo o teste que procurava o botão nativo de criação de tarefa. Corrigidas sem remover as verificações funcionais.
- Regressão final: `npm run test -- src/components/activities/activity-planning-workspace-interactions.test.tsx src/components/ui/query-controls.test.tsx src/components/patterns/patterns.test.tsx src/components/activity-planning-preview/activity-planning-preview.test.ts src/components/projects src/components/reports src/components/meetings src/components/dashboard src/components/profile`: 82/82 em 15 arquivos. A suíte inteira não foi repetida após a correção pontual; os demais resultados permanecem válidos.
- `npm run lint` e `npm run typecheck`: aprovados. Após o último ajuste de classe da página gerencial, ESLint direcionado também foi executado. As mudanças posteriores de CSS não invalidam essas verificações; o build final recompilou CSS e TypeScript.
- `npm run build`: aprovado no estado final, incluindo o último ajuste de cor das opções selecionadas.
- `git diff --check`: aprovado. Nenhum commit realizado.
- Navegador Brave/Chromium: desktop 1920×941 e viewport 390×844; temas claro e escuro. Inspecionados Projetos, Minhas atividades, Gestão de atividades e laboratório de componentes. Conferidos menu aberto, busca preenchida, limpeza, estado vazio, filtros vindos da URL, abertura automática dos avançados, seleção de data por mouse/teclado, foco e serialização FormData com os avançados recolhidos. O calendário mobile permaneceu dentro do viewport, sem overflow horizontal.
- O token de superfície tem alpha; os novos popovers compõem a superfície sobre o fundo opaco, evitando texto do conteúdo subjacente através do menu. A cor das opções é explícita nos dois temas.

Evidências locais: `C:/Users/breno/.codex/artifacts/nite-ui-20261122/atividades-claro-desktop.jpg` e `C:/Users/breno/.codex/artifacts/nite-ui-20261122/gestao-escuro-mobile.jpg`.

## Limites da validação

Não foi executada homologação visual de todas as combinações de permissões e de todos os formulários migrados. Não houve escrita de dados de negócio para testar apresentação. Firefox, Safari, aparelhos físicos, leitor de tela e fallback de picker nativo não foram testados neste ambiente. O fallback mantém os elementos HTML originais. O aviso do Vitest sobre configLoader native e configuração CommonJS permanece preexistente; não impede os testes. Não houve mudanças no backend que exigissem testes de API, banco ou migrations.
