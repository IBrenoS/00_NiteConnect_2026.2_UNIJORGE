# 08.3R-A3 — criação de atividades no preview

## Escopo e referências

Alterada somente a experiência `tela=create-planning` em `/atividades/preview`. O formulário não chama APIs e cria a atividade no estado local da demonstração. A captura `PREVIEW_ATUAL/03_nova_atividade.png` foi comparada visualmente com a referência não-AI do Notion incluída em `NOTION_USUARIO`; o título em destaque, a descrição no fluxo do conteúdo e a propriedade discreta orientaram a mudança.

## Implementação

- Título amplo, sem borda inferior e com foco automático; título vazio ou só com espaços não é aceito.
- Descrição opcional logo abaixo do título, sem borda de textarea, começando com uma linha e crescendo conforme recebe conteúdo.
- Projeto em popover pesquisável, com `Independente` e os projetos demonstrativos elegíveis.
- Removido o breadcrumb desta tela. As únicas ações são `Cancelar` e `Criar atividade`, junto ao conteúdo.
- A criação aceita somente título, adiciona a atividade ao estado local e navega ao workspace vazio. Cancelar volta à listagem sem criar.
- Nenhuma outra visualização do preview foi alterada nesta etapa; nenhum backend, página de produção ou persistência real foi envolvido.

## Validação

- `npm run test -- activity-planning-preview.test.ts` — passou: 7 testes.
- `npm run lint` — passou.
- `npm run typecheck` — passou.
- `git diff --check` — passou; reportou apenas aviso preexistente de CRLF em `apps/web/src/lib/activities/actions.ts`.
- No Brave autenticado, confirmei visualmente a tela em dark, foco no título, popover com busca e opções válidas, seleção de projeto, preenchimento de título/descrição e navegação ao workspace recém-criado.
- Testei Cancelar com título preenchido; voltou à listagem sem adicionar planejamento. Também criei uma atividade só com título e confirmei workspace vazio.

## Limitações

- A tela foi observada em viewport desktop; mobile e tema light não foram conferidos nesta execução. O controle de viewport não estava disponível no contexto autenticado utilizado.
- A captura da tela atual do Brave foi exibida durante a inspeção visual, mas não foi gravada como PNG local verificável nesta execução. A captura anterior disponível no ZIP é usada somente como referência antes; não há par de PNG antes/depois salvo para esta etapa.
- O build não foi executado: a mudança ficou restrita a um componente do preview, e o pedido desta etapa especificou lint, typecheck e testes direcionados.

O trabalho permaneceu na `main`; não foi criado commit e as demais alterações locais foram preservadas.
