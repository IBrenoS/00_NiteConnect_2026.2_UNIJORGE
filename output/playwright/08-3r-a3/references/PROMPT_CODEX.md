# NITE Connect — Bloco 08.3R-A2 | Refinamento seletivo do preview de Minhas Atividades

## Contexto e limite
O preview `/atividades/preview` de 08.3R-A foi parcialmente aprovado. NÃO refaça toda a interface. A base da tela interna do planejamento (workspace), os dois quadros, a tabela e o painel lateral de resumo foram bem avaliados. O objetivo é corrigir APENAS as partes descritas abaixo e aumentar a fidelidade aos padrões de páginas e bases de dados do Notion.

Esta etapa é visual, prototipação navegável com dados locais. Não alterar backend, migrations, endpoints nem as páginas de produção. Não realizar commit e preservar alterações locais.

## Referências concretas
Leia primeiro `LEIA-ME_REFERENCIAS.md` e abra os PNGs anexos, inclusive as capturas originais do Notion. As capturas da referência original estão na pasta `NOTION_USUARIO`; os estados do preview corrente estão em `PREVIEW_ATUAL`.

Mobbin — telas de inspeção específicas:
- Gallery/cards de base de dados: https://mobbin.com/screens/0bd76f5f-9281-4d76-933e-cafe385ef965
- Criação/edição de página: https://mobbin.com/screens/4e6e1f98-a567-4370-b392-ac28802481c7
- Detalhe/propriedades de tarefa: https://mobbin.com/screens/83e2d66a-d836-406f-b72d-d5bc20e1d16f
- Estado vazio de base de dados: https://mobbin.com/screens/2a3c9ede-fa76-4e52-8b0d-b1ae025ec0c6
- Fluxo criar tarefa: https://mobbin.com/flows/1ebe43ae-b047-45cc-a8ea-222cc7639c28
- Fluxo alteração de propriedades/status: https://mobbin.com/flows/03c4c8dc-a100-4fd0-8f19-aa96916bd793
- Fluxo movimentação de card: https://mobbin.com/flows/6423d52d-5c98-4a7d-a1f9-492fb2b6774b

Os links Mobbin são candidatos de inspeção. Abra e valide visualmente o conteúdo, não conclua que correspondem ao objetivo só pelo título ou resultado de busca. Se um deles redirecionar para tela sem relação ou login, registre o impedimento e use as capturas REAIS anexas, sem inventar que o conteúdo inacessível foi visto. Não faça substituições genéricas sem critério.

## 1 — Minhas Atividades (redesenhar)
- Cabeçalho somente `Minhas atividades`, sem subtítulo explicativo ou texto de marketing.
- Preservar busca compacta, filtro de projeto discreto e botão Nova atividade.
- Redesenhar cards: maior densidade, menor altura, menos bordas e divisórias; priorizar nome, identificação discreta do projeto quando houver, contagem de tasks relevante e percentual com barra curta. Mostrar descrições autorais apenas se úteis, até uma linha; não acrescentar texto explicativo artificial.
- Preferir composição de cards em grade compacta no desktop se a referência analisada a sustentar. O card inteiro abre o planejamento; eliminar repetição de link `Abrir planejamento` em cada card, caso a área inteira seja clicável.
- Preservar o indicador percentual já aprovado, calculado com as tarefas do agrupamento.
- Propor e justificar medidas de largura, altura, espaçamento e tipografia a partir das capturas antes de codificar.

## 2 — Criar atividade (redesenhar)
- Repensar como página de criação minimalista, próxima de criar uma página/entrada no Notion, sem aparência de formulário administrativo centralizado e estreito.
- Título obrigatório e proeminente, descrição opcional, projeto independente ou autorizado (opcional). Demais informações pertencem às tasks internas.
- Remover breadcrumb redundante, subtítulo explicativo e `Novo planejamento` como título obrigatório da UI; esta tela representa `Nova atividade`.
- Botão final `Criar atividade`, não `Ver prévia`. Em modo demonstração, criar no estado local e abrir imediatamente a atividade criada; banner geral continuará esclarecendo que nada persiste.

## 3 — Workspace (congelar a estrutura, aprimorar detalhes)
- Não substituir layout, painel de resumo, quadros ou tabela aprovados.
- Substituir o dado demonstrativo excessivamente técnico `Onboarding de novos integrantes` por linguagem natural, por exemplo `Boas-vindas aos novos integrantes`.
- Retirar apenas copy auxiliar redundante sob os títulos. Preservar descrições autorais reais quando existirem.
- Cabeçalho de seção `Tasks` pode ser utilizado dentro do planejamento; ações e acessibilidade permanecem em português (`Nova tarefa`, `Editar tarefa`).
- Refinar chips de prioridade e status com aparência leve do Notion: fundos discretos, cores sem saturação excessiva, bordas mínimas ou inexistentes; não alterar estados e semântica.
- Melhorar a criação inline: clicar em `+ Nova tarefa` abre uma linha de entrada simples contextual (título, Enter para criar, Esc para cancelar); não apresentar um card translúcido de formulário completo nem painel sem necessidade. Propriedades avançadas só após criar ou ao abrir o detalhe.
- Não criar barras gigantes, novas áreas de estatística nem mais filtros.

## 4 — Página/edição de task (redesenhar)
- Substituir o modal administrativo atual por visualização contextual do registro, análoga à página de item de banco de dados do Notion: título proeminente editável, propriedades em linhas leves (status, prioridade, responsável, data início, prazo), descrição como conteúdo abaixo; campos editáveis por clique/select/popover.
- Evitar formulário repleto de labels, caixas e botão `Aplicar na prévia`.
- Abrir a task a partir de card ou linha da tabela; criar task pela entrada inline e abrir a edição opcionalmente.
- Em demonstração todas as alterações mudam estado local e atualizam simultaneamente cards, tabela e resumo.
- Responsável padrão de tarefa independente é o criador; só exibir outro responsável após atribuição expressa. Se apresentar colaboração opcional, usar busca de integrante pelo nome com resultados demonstrativos identificados e sem fingir integração real. Não conceder acesso ao agrupamento inteiro por atribuir uma tarefa.

## 5 — Estados vazios (redesenhar)
- Não usar uma página separada com título explicativo grande como `Organize o que vem a seguir` e painéis auxiliares invasivos.
- Exibir o cabeçalho normal do planejamento e a própria área de tasks vazia, com ação discreta `+ Nova tarefa` e, no máximo, uma frase curta de orientação.
- Diferenciar agrupamento sem tasks e tasks legadas sem agrupamento; não misturá-los na mesma tela de vazio.

## 6 — Interações obrigatórias na DEMONSTRAÇÃO
- Implementar drag-and-drop LOCAL real no preview (sem persistir na API) para quadros por status e prioridade, refletindo imediatamente a mudança no quadro alternativo, tabela e resumo.
- Validar sequências reversíveis: Planejada→Em execução→Concluída→Planejada; Alta→Baixa→Média→Alta; repetições, criação e edição de tasks e atualização da porcentagem.
- Alternativa por menu para mouse/teclado; nada de botões inertes simulando ação.
- A demonstração pode resetar ao recarregar a página, mas deve avisar claramente que não há persistência.

## 7 — Qualidade e entrega
- Compare antes/depois a 1920x1080; registre alterações de densidade dos cards, tipografia, cabeçalhos, criação e edição.
- Verifique também tema claro, responsividade e estados sem dados, sem alegar testes não realizados.
- Capture screenshots PNG reais do resultado por rota/estado quando tecnicamente possível; caso o browser isolado redirecione ao login, documente isso e gere evidência alternativa somente se verificável.
- Execute ESLint, typecheck, build e testes direcionados à prévia que forem viáveis. Não trate passagem de build como aprovação visual.
- Mantenha a experiência aprovada do workspace e a separação da produção. Não introduza backend, endpoint, migration, share de planejamento ou feature adicional neste bloco.
- Relate exatamente quais referências Mobbin visualizou, quais não acessou e quais PNGs locais guiaram cada correção.

**Aceite:** preview mais fiel às imagens reais de referência na listagem, criação, edição de task e estados vazios, preservando workspace/quadro/tabela/resumo aprovados; movimentações, edição e criação demonstráveis em estado local. A integração real 08.3R-B só começa após aprovação visual do usuário.
