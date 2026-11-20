# Bloco 03 — contratos HTTP

**D01–D12 aprovadas pelo responsável; contratos implementados e validados localmente.**
Regras e decisões D01–D12 em `bloco-03.md`. Campos e autorizações abaixo
registram as decisões aprovadas, sem ampliar permissões do Bloco 02.

## Convenções

Bearer Entra + integrante ATIVO + autorização contextual em toda rota.
Entra desabilitado mantém deny-all. UUIDs; datas `YYYY-MM-DD`; instantes UTC;
`ProblemDetail`. 400 entrada inválida; 401 autenticação; 403 autoridade insuficiente;
404 recurso inexistente ou invisível; 409 versão/estado/atribuição conflitante;
413 anexo excede tamanho; 415 formato não aceito; 503 armazenamento indisponível.
Verificar visibilidade antes de informar disponibilidade de armazenamento.

Paginação `{items,page,size,total}`, page=0, size=20, máximo 100.
Mutação exige motivo não vazio até 1000 caracteres. Atualização de recurso
existente exige `expectedVersion` inteiro >=0 da **atividade**, inclusive evidências.
Criação inicia versão 0. Comando concluído incrementa versão uma vez. Reconsultar
atividade após operações 201/204 sobre atribuições/evidências. Falha não incrementa.
Campos de autoria/data/versão são gerados pelo servidor; não aceitar autor enviado.

## Representações

Activity: `id,title,description,projectId,status,dueOn,primaryExecutorId,
primaryExecutorName,executorAvailable,createdBy,version,createdAt,updatedAt,
completedAt,deadlinePassed,overdue,attentionRequired`.

Título obrigatório até 200 caracteres; descrição até 10000. `projectId` opcional
somente na criação. Prazo nullable sem restrição artificial a datas passadas.
Executor obrigatório; disponibilidade exige ATIVO e, se vinculada, equipe vigente.
Status PLANEJADA/EM_EXECUCAO/CONCLUIDA/CANCELADA conforme D03/D04.

Assignee: `id,memberId,memberName,role,startedAt,available`. Histórico gerencial
acrescenta `startedBy,startReason,endedAt,endedBy,endReason`.

Evidence: `id,activityId,authorId,authorName,assignmentId,type,content,url,
correctsEvidenceId,createdAt,withdrawnAt,object`.
`object` expõe apenas `filename,contentType,size,sha256`; nunca chave/caminho interno.
TEXT/TECHNICAL exige content, até 10000. LINK exige url HTTP(S) absoluta até 2048,
sem userinfo/caracteres de controle; descrição opcional. FILE/IMAGE criado apenas
pelo fluxo de upload. Campos incompatíveis com tipo são recusados.
Metadados de retirada incluem marcador; conteúdo/bytes retirados só para gestão.

## Atividades

| Método / rota | Entrada | Permissão / resultado |
|---|---|---|
| GET `/api/v1/activities` | page,size,status?,projectId?,executorId?,dueFrom?,dueTo?,overdue? | Visibilidade contextual antes de filtros; Page de Activity |
| POST `/api/v1/activities` | title,description,projectId?,dueOn?,primaryExecutorId,reason | D01/D04; 201 Activity PLANEJADA |
| GET `/api/v1/activities/{id}` | — | Leitura contextual; 200 Activity |
| PATCH `/api/v1/activities/{id}` | title,description,dueOn,expectedVersion,reason | Gestão ou dono pessoal D02; 200 Activity |
| PATCH `/api/v1/activities/{id}/status` | status,expectedVersion,reason,confirmed? | D04; 200 Activity; confirmed=true em cancelar/reabrir |
| GET `/api/v1/activities/{id}/history` | page,size | Gestão ou dono pessoal D02; Page de eventos operacionais |
| GET `/api/v1/me/activities` | page,size,status?,projectId?,dueFrom?,dueTo?,overdue?,q? | Somente atribuições vigentes e contexto legível do próprio ator, inclusive administrador |
| GET `/api/v1/me/activities/capabilities` | — | Integrante ativo; capacidade de criar atividade independente para si |
| GET `/api/v1/activities/{id}/capabilities` | — | Leitura contextual; capacidades calculadas para o ator e a atividade |
| GET `/api/v1/me/activities/history` | page,size | Próprios períodos e contribuições em projeção limitada D11 |
| GET `/api/v1/projects/{id}/activities` | page,size,status?,executorId?,dueFrom?,dueTo?,overdue? | requireRead do projeto; Page de Activity restrita ao projeto |

PATCH de dados substitui integralmente title/description/dueOn, seguindo a
convenção do Bloco 02; omitir dueOn limpa prazo. Documentar esse comportamento
e testar. A presença de projectId na edição é recusada, inclusive null, sem ignorar silenciosamente o campo (D06).

Na consulta pessoal, `q` é opcional; quando presente, tem no máximo 160 unidades
UTF-16 e ao menos dois pontos de código após remoção de espaços externos, sem
caracteres de controle. A pesquisa é parcial,
insensível a maiúsculas, em título ou descrição. `%`, `_` e `!` são literais.
Aplicam-se primeiro visibilidade e filtros, depois contagem e paginação; a
ordem continua `createdAt` decrescente e `id`. Os índices existentes favorecem
escopo e ordenação, mas não aceleram necessariamente busca por substring;
avaliar plano de consulta e volume antes de introduzir índice especializado.

Capacidades pessoais retornam `{ "createIndependent": true }` para integrante
ativo. As capacidades contextuais retornam `edit`, `transitions` (estados de
destino), `history`, `manageAssignees`, `addEvidence` e `upload`. `upload` só é
verdadeiro quando a contribuição é autorizada e o armazenamento está habilitado.
Estas projeções são instantâneos consultados após autorização de leitura; não
substituem validação, motivo, confirmação ou `expectedVersion` das mutações.
Disponibilidade de armazenamento não garante sucesso de uma gravação futura.

As capacidades também retornam `executionBlockedByProjectPause` e
`canResumeProject`. O primeiro identifica o bloqueio contextual da pausa; o
segundo só é verdadeiro para a administração autorizada a reativar o projeto.
Uma mutação de execução bloqueada pela pausa responde `409` com `code` igual a
`PROJECT_PAUSED`; conflitos de versão continuam sem esse código.

Evento operacional: `id,activityId,actorId,action,reason,occurredAt,
activityVersion,before,after`, sem conteúdo integral de evidência/anexo.
Auditoria administrativa completa continua exclusivamente em `/api/v1/audit-events`.

Histórico pessoal de atribuições tem `assignmentId,activityId,activityTitle,projectId,role,
startedAt,endedAt` e mantém os períodos sem dados gerenciais. As próprias evidências são consultadas
separadamente, com paginação, em `GET /api/v1/me/activities/evidence`, evitando uma
coleção ilimitada aninhada em cada período. Não inclui descrição privada da atividade, participantes, motivo
gerencial ou anexos de terceiros. Uma rota pessoal de detalhe de contribuição,
`GET /api/v1/me/activities/evidence/{evidenceId}`, permite ao próprio autor ATIVO
consultar conteúdo não retirado; para FILE/IMAGE o download pessoal usa
`GET /api/v1/me/activities/evidence/{evidenceId}/download`, sem liberar a atividade.
Ambas continuam restritas ao autor mesmo se ele for administrador; gestão usa a rota
contextual. Evidência retirada retorna metadados mínimos, sem bytes/conteúdo.

## Atribuições e candidatos

| Método / rota | Entrada | Permissão / resultado |
|---|---|---|
| GET `/api/v1/activities/{id}/assignees` | page,size | Leitura contextual; Page de Assignee vigente |
| GET `/api/v1/activities/{id}/assignee-candidates` | query,page,size | Gestão; ATIVOS da equipe se houver projeto, excluídos atribuídos vigentes; Page `{id,name}` |
| GET `/api/v1/projects/{id}/activity-assignee-candidates` | query,page,size | Gestor contextual/administração; ATIVOS participantes para criação; Page `{id,name}` |
| GET `/api/v1/activities/independent-assignee-candidates` | query,page,size | Somente administração; ATIVOS para atividade independente; Page `{id,name}` |
| PUT `/api/v1/activities/{id}/executor` | memberId,expectedVersion,reason,confirmed=true | Gestão; substituição atômica; 200 Assignee |
| POST `/api/v1/activities/{id}/collaborators` | memberId,expectedVersion,reason | Gestão; 201 Assignee |
| DELETE `/api/v1/activities/{id}/collaborators/{memberId}` | expectedVersion,reason no corpo | Gestão; 204; encerra período |
| GET `/api/v1/activities/{id}/assignees/history` | page,size | Gestão/dono pessoal; Page de períodos |

Pesquisa por nome de 2 a 160 caracteres, `%`/`_` literais, case insensitive,
ordenação nome/id. Não retorna e-mail nem situação administrativa. Revalidar alvo
na escrita; busca não reserva atribuição. A troca para colaborador existente pode
usar memberId da própria listagem de assignees e encerra seu papel anterior.
Rotas literais de candidatos/histórico não são interpretadas como UUID `{id}`.

## Evidências

| Método / rota | Entrada | Permissão / resultado |
|---|---|---|
| GET `/api/v1/activities/{id}/evidence` | page,size | Leitura contextual; Page de Evidence (conteúdo retirado filtrado) |
| POST `/api/v1/activities/{id}/evidence` | type,content?,url?,correctsEvidenceId?,expectedVersion,reason | Atribuído elegível/gestão; 201 Evidence |
| GET `/api/v1/activities/{id}/evidence/{evidenceId}` | — | Leitura contextual + evidenceId da atividade; 200 Evidence |
| GET `/api/v1/activities/{id}/evidence/{evidenceId}/capabilities` | — | Leitura contextual e evidência da atividade; `{withdraw}` indica retirada autorizada no momento |
| POST `/api/v1/activities/{id}/evidence/{evidenceId}/withdraw` | expectedVersion,reason,confirmed=true | D08; 200 metadados de retirada; incrementa versão da atividade |
| POST `/api/v1/activities/{id}/evidence/uploads` | multipart file + metadata JSON {expectedVersion,reason,correctsEvidenceId?} | Atribuído elegível/gestão; 201 Evidence somente após validação/commit |
| GET `/api/v1/activities/{id}/evidence/{evidenceId}/download` | — | Contexto + objeto AVAILABLE + D08; bytes privados com attachment/no-store/nosniff |

Upload multipart síncrono para o cliente, com recibo interno e duas transações;
não introduzir URL pré-assinada ou endpoint de finalização pública no adaptador local.
TXT/PNG/JPEG, até 10 MiB e 20 milhões de pixels (D10). `filename` do cliente serve
apenas para exibição sanitizada. Limite multipart inclui margem limitada para
metadados e overhead; nenhum corpo ilimitado em memória. Download nunca busca
links externos. MIME enviado pelo cliente não prova tipo válido.

Se houver perda da resposta após commit, reconsultar evidências/versão: repetir
upload com expectedVersion antigo retorna 409 e não cria segunda evidência.
Recibos incompletos/objetos órfãos são privados e sujeitos à recuperação prevista
na especificação. Erros não expõem caminho, credenciais ou conteúdo de arquivo.

## Rastreabilidade e limites

RF-004/005/006/007/010/032/033; RF-014/015 no escopo de atividades;
RF-013/017/021/048/049/052 e CA-09/15/16 transversais.
Rotas de candidatos, histórico pessoal e download pessoal refinam os contratos
iniciais para evitar depender de UUID previamente conhecido ou liberar histórico
alheio. D09/D10 limitam o adaptador e os formatos iniciais; anexos institucionais
não estarão operacionais sem armazenamento persistente aprovado e validado.

## Configuração de desenvolvimento e recuperação

Arquivos desabilitados por padrão. Configure `nite.evidence.local-root` como
caminho absoluto de diretório privado fora de qualquer publicação web. Exemplo
local por argumento de aplicação: `--nite.evidence.local-root=D:/nite-connect-private/evidence`.
Não usar disco efêmero do Cloudflare Container para anexos institucionais.
O fuso pode ser definido por `--nite.activities.zone=America/Bahia`; o valor padrão
é America/Bahia. Não é necessário alterar `.env` para usar argumentos explícitos.

Limites multipart: arquivo 10 MiB, requisição 11 MiB; as validações da aplicação
continuam obrigatórias mesmo quando o cliente anuncia MIME/extensão compatíveis.
Leitura confere tamanho e SHA-256 antes de retornar bytes. Não há URLs públicas
ou pré-assinadas. Conteúdo retirado só é inspecionado por administração global ou
liderança contextual vigente; nem autor nem dono pessoal recebem os bytes retirados
pela consulta pessoal.

`EvidenceUploads.reconcile(actor, minimumAge, dryRun)` é um contrato interno de
recuperação, sem endpoint público ou job automático. Exige administrador ATIVO,
margem mínima de uma hora (recomendado 24 horas) e suporta dry-run. Revalida cada
recibo sob lock, nunca remove AVAILABLE, trata arquivos órfãos e recibos PENDING
abandonados antes da gravação. Operar somente sobre a raiz privada configurada.

Snapshots de cadastro/edição/estado usam JSON serializado com os campos da atividade;
`before`/`after` dos eventos são representações textuais preservadas. Eventos de
atribuição/evidência registram referências estáveis sem conteúdo de anexos. O
histórico de atribuições inclui `memberName` e `available` também em períodos
encerrados, além dos dados gerenciais autorizados.
