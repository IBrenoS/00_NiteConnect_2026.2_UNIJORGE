# Bloco 09.0C — integração visual

## Composição de referência

`/dashboard` reutiliza as proporções e classes da prévia 09.0B. A área não cria
outro contêiner nem mantém o limite de 1370 px da prévia; passa a ocupar o
`max-width: 1600px` já oferecido pelo `AuthenticatedShell`.

| Contexto | Referência aprovada | Capturas de referência e prévia |
|---|---|---|
| Meu espaço | ClickUp — prioridades à esquerda e distribuição ao lado | [ClickUp](reference-clickup.png), [prévia clara](personal-light.png), [prévia escura](personal-dark.png) |
| Visão geral do NITE | Productboard — indicadores compactos e evolução em destaque | [Productboard](reference-productboard.png), [prévia clara](institutional-light.png), [prévia escura](institutional-dark.png) |

As telas Mobbin e suas escolhas visuais estão documentadas em
[COMPARISON.md](COMPARISON.md). As capturas de referência usam a imagem da tela
real dentro do visualizador Mobbin, em escala reduzida.

## Adaptação de produção

- Mantidas as duas colunas, ordem dos painéis, tipografia e espaçamentos da
  prévia; em telas estreitas os painéis empilham e os destaques não impõem
  alturas mínimas altas quando há poucos itens.
- O donut usa a distribuição atual retornada pelo backend. A evolução agrupa
  eventos por data e natureza; sem eventos, mostra estado vazio.
- A visão institucional distingue situação atual dos projetos da saúde
  consolidada e mantém `DADOS_INSUFICIENTES` separado de `REGULAR`.
- O filtro histórico opera em 7, 30 ou 90 dias. Ações, compromissos,
  distribuições e pendências continuam atuais.

## Limite da comparação autenticada

O navegador abriu `/dashboard` com uma sessão autenticada de Gestão Geral, mas
`GET /api/v1/dashboard/contexts` respondeu `403`. A página mostrou o estado de
acesso negado e não consultou nenhum indicador. Por isso não foi possível gerar
captura comparativa da rota real com dados de produção, nem inspecionar os
quatro papéis autenticados, eventos persistidos, tema claro/escuro e zoom 200%
na composição de dados.

A tela de erro foi inspecionada no navegador em viewport desktop (1920 × 996)
nos temas claro e escuro. A comparação da composição usa as capturas aprovadas
da prévia; os testes de componentes cobrem dados, vazios, saúde insuficiente,
falha parcial e links canônicos sem afirmar homologação com a API ativa.
