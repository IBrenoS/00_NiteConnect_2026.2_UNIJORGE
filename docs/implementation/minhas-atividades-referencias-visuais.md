# Minhas atividades — mapeamento visual

Mapeamento registrado antes da implementação do redesign. As referências Mobbin abaixo orientam padrões de composição e interação; as capturas locais do kit `nite-connect-08-3-kit-visual/referencias-08-3` validam as características prioritárias do produto.

| Referência | Componente do NITE Connect | Aplicação no redesign |
| --- | --- | --- |
| [Notion — quadro Kanban](https://mobbin.com/screens/0b10f8d0-2acb-4d7f-87f4-0bfd14e463bc) | `ActivityWorkspace` em `/atividades` | Colunas agrupadas, cabeçalhos com contagem, cartões compactos, espaçamento e hierarquia de título, projeto, situação, prioridade e datas. |
| [Notion — movimentação de tarefas](https://mobbin.com/flows/6423d52d-5c98-4a7d-a1f9-492fb2b6774b) | `ActivityWorkspace` e `moveActivityAction` | Arrastar entre colunas de situação ou prioridade, realce durante o arraste, atualização otimista, persistência pela API e recuperação em caso de conflito/erro. |
| [Notion — tabela](https://mobbin.com/screens/9aed23d0-f039-4685-aeb1-8a0f81628796) | Vista Lista em `ActivityWorkspace` | Linhas alinhadas, propriedades visíveis, controles contextuais, filtros e densidade compacta. |
| [Notion — criação de tarefa](https://mobbin.com/flows/1ebe43ae-b047-45cc-a8ea-222cc7639c28) | `/atividades/nova` | Criação rápida com título obrigatório e descrição, datas e prioridade opcionais, sem etapa de motivo obrigatória. |
| [Notion — página de detalhes](https://mobbin.com/screens/b95c9bf0-6d2c-489f-814b-c35d192310eb) | `activity-detail.tsx` | Título em destaque; situação, prioridade, datas, descrição, responsável e projeto com leitura e edição contextual. |
| [Notion — edição direta do status](https://mobbin.com/flows/03c4c8dc-a100-4fd0-8f19-aa96916bd793) | `ActivityWorkspace` e `activity-detail.tsx` | Alteração de situação no próprio cartão ou detalhe, sem obrigar o usuário a percorrer diálogos para uma troca simples. |

## Acesso às referências

As telas de quadro e tabela e os fluxos de movimentação, criação e edição de status foram consultados pelo conector Mobbin. A tela de detalhes `b95c9bf0-6d2c-489f-814b-c35d192310eb` não ficou acessível no ambiente, inclusive pelo link direto. Portanto, ela não foi tratada como imagem inspecionada; o detalhe foi implementado usando os requisitos fornecidos e as capturas locais disponíveis como validação complementar.

As capturas locais foram usadas para conferir especialmente o quadro por prioridade, agrupamentos, listas de atividades em andamento/concluídas e indicadores de planejamento/conclusão. A implementação preserva navegação, tokens e temas existentes do NITE Connect e não introduz recursos fora do contrato disponível.
