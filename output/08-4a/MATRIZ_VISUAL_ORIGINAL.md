# Matriz visual — Bloco 08.4A

**Onze referências selecionadas, não uma lista indiscriminada.** Nove do kit original e duas específicas para Atividades e planejamento. Todas são do Mobbin.

| Código | Destino no NITE Connect | Referência | O que reproduzir |
|---|---|---|---|
| 01 | Catálogo de projetos | [Notion — coleção de projetos](https://mobbin.com/screens/44453ef6-a197-4976-97ef-dbd753bb7559) | Composição principal dos cards, ritmo da grade, estados e navegação; adaptar dados de descoberta e capa ausente. |
| 02 | Catálogo — alternativa com capa | [Behance — descoberta visual de projetos](https://mobbin.com/screens/3717af44-abda-4194-befc-09c75273b06e) | Tratamento de imagem/capa, apenas quando houver mídia autorizada; não substituir a hierarquia do catálogo principal. |
| 03 | Meus Projetos | [Linear — lista pessoal de projetos](https://mobbin.com/screens/fb06f720-0dcd-423f-bba9-83b54701bc4c) | Organização dos espaços de trabalho nos quais o usuário tem participação vigente; não misturar catálogo administrativo. |
| 04 | Detalhe do projeto (descoberta) | [Linear — detalhe de projeto](https://mobbin.com/screens/fed68772-ccc3-48be-8c28-3691a441728b) | Hierarquia de título, descrição, estado, gestor e ações; não expor tarefas/documentos privados a visitantes. |
| 05 | Workspace / Visão geral | [Asana — visão geral de projeto](https://mobbin.com/screens/7f5f9a56-f6e8-4bb8-b974-05f76c53d131) | Composição da visão operacional: informações, objetivos, equipe resumida, situação e indicadores fundamentados; sem métricas fictícias. |
| 06 | Solicitar participação | [Microsoft Teams — solicitar entrada em comunidade](https://mobbin.com/flows/1513639d-122a-4424-8a99-a1cf4089f22b) | Percurso de solicitar, enviar e aguardar decisão; ingresso não é automático; interesse futuro é um fluxo diferente. |
| 07 | Aprovar solicitações | [Microsoft Teams — pedidos de acesso](https://mobbin.com/screens/5cf259ed-d5bf-4493-b027-9a81d27c58c5) | Apresentação compacta de pedidos pendentes e decisões para gestores com capacidade; sem aprovação fora da ACL. |
| 08 | Workspace / Equipe | [Asana — integrantes do projeto](https://mobbin.com/screens/fc8fcacc-dde0-4c2b-bc3c-1655ced3f9d9) | Listagem de gestor, integrantes e controles contextuais; identidades apenas conforme autorização. |
| 09 | Workspace / Documentos | [Asana — arquivos do projeto](https://mobbin.com/screens/f7ec8174-d020-4121-8a8d-5464b4cf7a29) | Composição da área de arquivos; reutilizar a biblioteca PROJECT do NITE, não recriar armazenamento. |
| 10 | Workspace / Atividades e planejamento — quadro | [Notion — quadro de tasks](https://mobbin.com/screens/f63163ee-9eaa-4c17-9095-9e00d896a659) | Padrão visual de base de tasks, propriedades e organização; aplicar a planejamentos e tasks do projeto. |
| 11 | Workspace / Atividades e planejamento — tabela | [Notion — tabela de tasks](https://mobbin.com/screens/9aed23d0-f039-4685-aeb1-8a0f81628796) | Vista tabular Notion complementar ao quadro; abrir a referência no Mobbin e capturar se a imagem não estiver disponível para exportação. |

## Arquitetura funcional aprovada

- **Núcleo → Projetos:** catálogo de descoberta com resumo público, estados e chamadas de participação.
- **Meu espaço → Meus Projetos:** espaços de participações vigentes; administração global acessa workspaces autorizados sem ingresso artificial.
- **Workspace de projeto — quatro áreas:** **Visão geral**, **Atividades e planejamento**, **Equipe**, **Documentos**.
- **Atividades e planejamento:** `project → activity_plannings → activities`. A mesma task canônica aparece nas perspectivas autorizadas, com `projectId` coerente. Quadros por situação/prioridade, tabela, painel lateral e indicadores devem reutilizar o comportamento homologado do Bloco 08.3; aplicar **referências visuais do Notion**.
- **Solicitações e aprovação:** distinguem pedido de ingresso, manifestação de interesse e acesso administrativo; respeitam estados pausado/concluído/vacante e capacidades.
- **Restrições do contrato:** o catálogo V42 ainda retorna imagem nula; não buscar capas privadas. Equipe nominal e documentos privados somente com ACL de workspace.
- **Não existe quinta aba contratada.** "Atividades e Entregas" da Gestão do NITE é a perspectiva administrativa transversal, não a aba de tarefas do projeto.

## Uso das referências

1. Abra `GALERIA_MOBBIN.html` ou os atalhos `.url` para consultar **exatamente** as telas da seleção.
2. Execute `python baixar_imagens_mobbin.py` em ambiente com internet para materializar as imagens na pasta `IMAGENS_MOBBIN/` (somente as disponíveis).
3. Anexe este ZIP ao Codex, com o conteúdo extraído. A tarefa é **um único preview navegável** cobrindo todas as telas e fluxos.
4. Se algum link retornar outra tela, não substitua silenciosamente: marque a referência indisponível e registre o impacto antes de construir aquela parte.
