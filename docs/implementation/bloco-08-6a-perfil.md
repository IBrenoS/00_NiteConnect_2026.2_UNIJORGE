# Bloco 08.6A — Meu Perfil

## Cadastro e privacidade

A migration aditiva V48 acrescenta `course`, `practice_area`, `birth_date`, `photo_object_id` e `photo_content_type` a `nite_connect.members`. Todos são opcionais. Nome e e-mail institucional continuam no cadastro existente e fora da edição pessoal. Não há nova identidade nem autenticação.

`birth_date` aparece apenas em `GET /api/v1/me/profile`. A futura ficha administrativa pode usar `GET /api/v1/members/{id}/profile`, restrito a coordenador ou gestor geral; esse contrato retorna curso, área, presença de foto e versão, mas omite nascimento. O contrato administrativo existente de integrante também não inclui nascimento. Gestor de projeto não ganha acesso à ficha administrativa.

## API

Todos os endpoints exigem JWT Entra de integrante ativo. O servidor resolve o próprio UUID pela identidade vinculada, nunca pelo corpo enviado.

| Método e rota | Contrato |
| --- | --- |
| `GET /api/v1/me/profile` | `id`, `name`, `institutionalEmail`, `course`, `practiceArea`, `birthDate`, `hasPhoto`, `version` |
| `PATCH /api/v1/me/profile` | `course`, `practiceArea`, `birthDate`, `expectedVersion`; permite `null` e valores vazios para limpar textos. Rejeita nome, e-mail e `memberId`. |
| `POST /api/v1/me/profile/photo?expectedVersion=N` | Multipart `file`: JPEG ou PNG, até 2 MiB e até 4096 px por lado. Substitui a referência com comparação de versão. |
| `DELETE /api/v1/me/profile/photo` | JSON `{ "expectedVersion": N }`; remove a referência com comparação de versão. |
| `GET /api/v1/members/{id}/photo` | Foto de integrante ativo para outro integrante ativo, autenticada, sem cache e com `nosniff`; 404 sem foto. |
| `GET /api/v1/members/{id}/profile` | Dados administrativos sem nascimento, para autorização global. |

`expectedVersion` usa a versão do mesmo cadastro de integrantes. Conflitos retornam 409. Datas de nascimento válidas vão de 1900-01-01 até a data atual do servidor. O `photo_object_id` é uma chave privada e não aparece no JSON. Objetos novos são compensados em falhas; após a transação, a chave ativa da foto substituída ou removida recebe exclusão no armazenamento. Em buckets versionados, revisões antigas seguem a política de retenção do armazenamento. A entrega web da foto passa por `/api/profile-photos/{id}` no servidor Next.js, que obtém o bearer da sessão protegida.

## Interface

`/meu-perfil` fica no menu de conta e mantém Tema e Sair. O avatar reutilizável exibe foto ou iniciais no menu, nas equipes de projetos, na liderança do workspace e no responsável principal da atividade. Não há diretório administrativo nem fluxo de Acessos e Convites neste bloco.
