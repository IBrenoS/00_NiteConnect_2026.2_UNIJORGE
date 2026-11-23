# Bloco 08.7A — contrato de acessos e convites

## Contrato HTTP

Todas as rotas exigem access token Microsoft Entra válido para a API. O decoder valida assinatura, emissor, tenant, audience, escopo e validade; o backend verifica o vínculo e as permissões no banco. `GESTOR_GERAL` e `COORDENADOR` administram convites. `GESTOR_PROJETO` não recebe administração global.

A [orientação da Microsoft para validar claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation) recomenda `tid` e `oid` como identificadores estáveis de autorização. O convite novo usa o e-mail institucional somente para conferir o destinatário no primeiro login. Na transação de aceite, o sistema vincula `tid` e `oid`; os acessos seguintes usam esse vínculo estável. Convites antigos com `object_id` preenchido preservam a conferência pelo identificador original.

- `POST /api/v1/invitations`: `{name, institutionalEmail, initialRole, expiresAt, message?}`. Papéis: `INTEGRANTE`, `GESTOR_PROJETO`, `GESTOR_GERAL`, `COORDENADOR`. Cria ou reutiliza integrante pendente pelo e-mail institucional, sem consultar o Microsoft Graph e sem IDs técnicos fornecidos pelo operador. Criação e envio são operações separadas: o cadastro é confirmado antes da chamada ao Resend; a resposta `201` inclui `sendState` e não promete entrega.
- `GET /api/v1/invitations?page=0&size=20&state=ALL`: `state` aceita `ALL`, `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`, `SEND_FAILED`. Retorna página administrativa com nome, e-mail, papel, datas, tentativas, ID do provedor e código de erro controlado.
- `POST /api/v1/invitations/{id}/send`: tenta novamente apenas convite ainda válido, não aceito e não revogado. Convite já aceito pelo Resend retorna o mesmo estado sem novo envio.
- `DELETE /api/v1/invitations/{id}`: revoga convite não aceito. Corpo `{reason?}`.
- `POST /api/v1/invitations/{id}/accept`: exige access token do destinatário. Compara `tid` com o tenant configurado e, para convites novos, o e-mail institucional do convite com o claim `email`, `preferred_username` ou `upn` emitido pelo Entra. Convites antigos mantêm a conferência do `oid` gravado. O link, sozinho, não autoriza o aceite. A transação vincula `oid`, ativa o integrante, registra histórico, concede o papel inicial e provisiona a biblioteca documental. Repetição pela mesma identidade ativa devolve o integrante sem nova concessão; identidade divergente não obtém dados do convite.
- `POST /api/v1/me/access`: registra uso real ao entrar na aplicação, no máximo uma gravação a cada cinco minutos por integrante ativo. Uma ação de servidor é acionada após a montagem de uma página autenticada visível, em navegações e no retorno à aba; pré-renderização e renovação silenciosa do token não acionam o registro. `last_access_at` permanece nulo até o primeiro acesso observado.
- `POST /api/v1/members/{id}/roles` e `DELETE /api/v1/members/{id}/roles/{role}`: `reason` pode ser omitido. As proteções do último administrador e de lideranças vigentes permanecem no `AccessService`.

O link enviado aponta para `NITE_INVITATION_ACCEPT_URL?id=<uuid>`, normalmente `https://<host>/convites/aceitar`. A rota web grava o ID em cookie `HttpOnly`, remove o parâmetro da URL e redireciona ao login Microsoft. O callback aceita o convite com o access token emitido antes de consultar `/api/v1/me`. Uma sessão SSO Microsoft existente pode concluir o login sem nova digitação de senha. A tela administrativa de Acessos e Convites não faz parte deste bloco.

## Migração e configuração

V51.1 permite `object_id` nulo até o aceite e exige que convites aceitos tenham o identificador vinculado. Convites anteriores com ID preenchido continuam válidos. V50 acrescentou papel, mensagem, estado e ID de envio, tentativas e `members.last_access_at`. O domínio `@unijorge.com.br` continua sendo a regra do cadastro institucional.

Configuração de servidor para convites: `RESEND_API_KEY`, `RESEND_FROM` (remetente de domínio verificado) e `NITE_INVITATION_ACCEPT_URL`. `RESEND_API_URL` é opcional para testes locais controlados; o padrão é `https://api.resend.com/emails`. O envio de convites não exige `User.ReadBasic.All`, OBO ou consentimento de diretório por gestor. Sem Resend configurado, o convite fica em `FAILED` com `NOT_CONFIGURED` e pode ser reenviado após configurar o serviço. O payload usa texto simples e `Idempotency-Key: nite-invitation/<id>`.

`ACCEPTED_BY_PROVIDER` significa somente que a API Resend devolveu um ID. A implementação não recebe webhooks de entrega: entrega, bounce e leitura permanecem desconhecidos. A [janela de idempotência do Resend](https://resend.com/changelog/idempotency-keys) é de 24 horas; o backend bloqueia reenvio de falha incerta após 23 horas, exigindo revogação e novo convite. Convites automatizados de teste usam sender controlado ou configuração ausente e não usam o serviço real. É necessário validar domínio remetente, configuração HTTPS e login Microsoft real no ambiente de homologação antes da operação.

O cadastro do convite não comprova que o endereço exista no tenant: a identidade é confirmada somente no aceite com sessão Entra real. Os testes locais não substituem a homologação do primeiro login com uma conta institucional convidada.
