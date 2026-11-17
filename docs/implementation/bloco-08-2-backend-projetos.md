# Bloco 08.2 — Backend de Projetos, Descoberta e Participação

**Estado:** implementação inicial de backend. Reutiliza `projects`, `project_memberships`, `project_leadership_history`, atividades e biblioteca `PROJECT`; não cria modelo paralelo de equipe, atividade ou documento.

## Contratos e rotas

| Rota | Uso |
|---|---|
| `GET /api/v1/project-catalog?q=&status=&acceptingMembers=&sort=&page=&size=` | Catálogo paginado para todo integrante ativo. `sort`: `name` (padrão), `status` ou `updated`. Busca cobre nome e descrição. Retorna resumo, estado, disponibilidade, liderança vaga/nome, quantidade de integrantes ativos e capacidades efetivas. |
| `GET /api/v1/projects/{id}/workspace` | Visão geral autorizada, métricas objetivas, versão e capacidades. |
| `POST /api/v1/projects/{id}/membership-requests` | Integrante ativo solicita ingresso com `message` opcional. Cria solicitação `PENDENTE`. |
| `GET /api/v1/me/project-membership-requests` | Solicitante acompanha seus pedidos e decisões. |
| `GET /api/v1/projects/{id}/membership-requests` | Gestão autorizada consulta a fila do projeto. |
| `POST /api/v1/projects/{id}/membership-requests/{requestId}/decision` | Gestor vigente, coordenador ou gestor geral decide com `approve`, `expectedVersion` e mensagem opcional. |
| `POST /api/v1/projects/{id}/membership-requests/{requestId}/close` | Mesma gestão encerra explicitamente um pedido pendente com `expectedVersion`; não há notificação de encerramento. |
| `POST /api/v1/projects/{id}/interest-signals` | Integrante sinaliza interesse futuro, sem obter participação ou acesso. |
| `GET /api/v1/projects/{id}/interest-signals` | Coordenador ou gestor geral consulta interessados. |
| `PATCH /api/v1/projects/{id}/availability` | Gestor vigente ou administração define `acceptingMembers` com `expectedVersion`. |
| `GET /api/v1/me/project-participation-notifications` / `POST .../{id}/read` | Caixa autenticada de notificações de participação e marcação idempotente de leitura. |

O catálogo não retorna dados de atividades nem documentos. Os contratos existentes de `/api/v1/projects/{id}/activities` e `/api/v1/projects/{id}/library` seguem como áreas do workspace e preservam suas ACLs. Atividades e biblioteca mantêm IDs e persistência canônicos.

## Regras aplicadas

- Só integrante ativo descobre, solicita ou manifesta interesse.
- Ingresso é aceito em `PLANEJAMENTO` ou `ATIVO` somente com disponibilidade explícita, liderança ativa e sem vínculo vigente prévio. A aprovação abre um período em `project_memberships`; não duplica integrantes.
- `PAUSADO`, projeto sem equipe/liderança recebem apenas manifestação; `CONCLUIDO` é resumo de consulta. Fechar disponibilidade não altera solicitações existentes.
- Aprovação/rejeição exige liderança vigente do projeto ou papel global `COORDENADOR`/`GESTOR_GERAL`; as decisões revalidam identidade e estado ativo na transação. O índice parcial garante uma solicitação pendente por par.
- Participante vê workspace; gestor vigente administra apenas o próprio projeto; coordenador/gestor geral acompanham sem ingresso. Cada endpoint privado mantém autorização no servidor.
- Notificações de participação têm tabela e chave idempotente próprias. Não usam as automações documentais.
- A visão geral informa quantidade de atividades, sem percentual de progresso sem denominador aprovado.

## Migration

`V42__project_discovery_and_participation.sql` adiciona `accepting_members`, solicitações, sinais de interesse e notificações. A coluna começa fechada (`false`) para projetos legados: nenhum projeto passa a aceitar novos integrantes sem decisão explícita da gestão. A migration não altera V1–V41.

## Matriz resumida de autorização

| Ação | Integrante ativo não participante | Participante | Gestor vigente | Coordenador/Gestor geral |
|---|---:|---:|---:|---:|
| Ver catálogo/resumo | Sim | Sim | Sim | Sim |
| Pedir ingresso / manifestar interesse | Sim, conforme estado/disponibilidade | Não se já participa | Não se já participa | Não se já participa |
| Acessar workspace, atividades e documentos | Não | Sim | Sim por ser participante | Sim |
| Decidir pedidos | Não | Não | Só no próprio projeto | Sim |
| Consultar interesses | Não | Não | Não | Sim |
| Administrar equipe/disponibilidade | Não | Não | Só no próprio projeto | Sim |
| Transferir liderança | Administração, conforme contrato B02 existente | — | — | Administração |

## Limitações e dependências

- O modelo V3 não tem imagem/referência de mídia de projeto. O campo `image` do catálogo fica `null`; nenhum objeto da biblioteca privada é exposto por URL. Definir uma referência de mídia e uma entrega autenticada/autorizada antes de integrar imagens no catálogo.
- Visibilidade nominal de equipe no catálogo continua restrita ao resumo de contagem e gestor; publicar nomes de participantes exige decisão explícita de produto.
- A leitura de lista de interesses foi limitada a coordenador/gestor geral, pois esse pedido a atribui explicitamente à gestão administrativa.
- A transferência de liderança permanece no endpoint e na autorização administrativa existentes do Bloco 02. O gestor do projeto não recebe poder de transferir liderança automaticamente.
- Para o Bloco 08.3, consumir catálogo, pedidos próprios e capacidades; para o 08.4, compor visão geral, `/me/projects`, equipe, atividades e biblioteca canônica. Nenhum endpoint novo de upload de imagem está disponível.
