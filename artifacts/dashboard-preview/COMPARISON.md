# Bloco 09.0B — comparação visual

Capturas da prévia em desenvolvimento. As referências foram inspecionadas diretamente nas telas específicas do Mobbin; os arquivos `reference-*` registram a imagem exibida no visualizador do Mobbin, em escala reduzida dentro da janela. As capturas desktop da prévia usam viewport de 1512 × 945; as mobile, 390 × 844.

| Contexto | Referência principal | Captura Mobbin | Capturas NITE |
|---|---|---|---|
| Meu espaço | [ClickUp](https://mobbin.com/screens/991b9969-ecda-4bb5-aa0f-52caf8f811a6) | [reference-clickup.png](reference-clickup.png) | [personal-light.png](personal-light.png), [personal-dark.png](personal-dark.png), [mobile-project-few-dark.png](mobile-project-few-dark.png) |
| Visão geral do NITE | [Productboard](https://mobbin.com/screens/be591fa0-ad3a-459b-8f80-6d9132dbb5de) | [reference-productboard.png](reference-productboard.png) | [institutional-light.png](institutional-light.png), [institutional-dark.png](institutional-dark.png), [mobile-institutional-empty-light.png](mobile-institutional-empty-light.png) |

Referências complementares: [Asana](https://mobbin.com/screens/ac55941d-fef9-4254-9997-bc5e229aad61) ([captura](reference-asana.png)) para grade e evolução; [Wrike](https://mobbin.com/screens/870801c6-8507-473d-be80-594f713ac360) ([captura](reference-wrike.png)) para distribuição e legenda.

## Comparação e refinamentos

- **Meu espaço:** mantém o painel de prioridades à esquerda e distribuição circular à direita, com alinhamento e densidade próximos ao ClickUp. Compromissos e evolução ocupam a segunda linha. A barra de seleção de cenários e a navegação institucional acrescentam altura à prévia; o ClickUp também mostra recursos de discussão e pesquisa que não correspondem ao escopo aprovado.
- **Visão institucional:** reproduz a faixa de indicadores compactos e um gráfico histórico largo do Productboard. Saúde e ações curtas completam a composição. O Productboard usa um gráfico de série única e contadores de membros; aqui os dados são projetos, atividades e pendências institucionais, com duas séries quando aplicável.
- **Responsividade:** em 390 px, os blocos passam a uma coluna e a faixa de quatro indicadores vira uma grade 2 × 2; a altura mínima dos painéis pessoais é removida para cenários com poucos dados.
- **Temas:** cores e superfícies usam os tokens claro/escuro existentes do NITE. O Mobbin exibe as referências somente nos temas capturados; a fidelidade cromática foi adaptada à identidade institucional.
- **Limite:** os dados e séries são demonstrativos e não verificam a semântica da API 09.0A. Esta etapa não integra `/dashboard`.
