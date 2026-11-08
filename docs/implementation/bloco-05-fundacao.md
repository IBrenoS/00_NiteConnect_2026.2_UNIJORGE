# Bloco 05.1 — Fundação documental (revisão do checkout entregue)

## Auditoria inicial

- **Fonte:** pacote `nite-connect.zip`, branch `main`, HEAD `f3fb8bfecd74fb0fca79b60da843b2e8b64a02b2`; repositório Git completo preservado.
- **Constatação:** não havia API/serviços Java ativos de documentos. V6, V7 e V10 conservam tabelas históricas de documentos, versões, sessões de editor anterior e diário; não constituem serviço operacional. O serviço B06 `DocumentEvidenceReader` continua sem provedor, deliberadamente fora de 05.1.
- **Decisão ativa:** Collabora CODE + WOPI, arquivos DOCX privados em S3 compatível, metadados PostgreSQL, sem ONLYOFFICE, sem contratação de licenças.
- **Implementação:** novos serviços dentro de `documents`, reaproveitando as tabelas V6 e acrescentando **somente V27** (sessões WOPI e locks); as migrações históricas não foram alteradas.
- **Escopo conscientemente limitado:** documentos pessoais do titular ou administrador; biblioteca de projetos, grants granulares, templates oficiais, UI administrativa e interface de histórico/restauração ficam para 05.2/05.3. B06 permanece intacto até 05.4.

## Fluxo funcional

1. O usuário institucional entra no portal; o servidor Next.js mantém o token Entra fora do JavaScript do navegador.
2. Em `/documentos`, importa um DOCX de teste. O backend valida limite de 8 MiB e estrutura básica OPC/ZIP, escreve o objeto privado e só então registra documento e revisão 1 no PostgreSQL.
3. Em `/documentos/{id}`, o Next.js solicita à API uma sessão WOPI autorizada, consulta a URL de edição anunciada em `/hosting/discovery` e envia via formulário POST ao iframe do Collabora um **token WOPI**, distinto do token Entra.
4. O CODE consulta `CheckFileInfo`, `GetFile`, realiza bloqueios WOPI quando necessário e chama `PutFile` com os bytes do DOCX.
5. O backend valida o token hash persistido, vencimento e as permissões atuais do integrante; serializa a atualização com bloqueio de linha PostgreSQL, confere o lock WOPI e persiste um objeto S3 novo. Só depois promove uma nova revisão e confirma o salvamento. Conteúdo idêntico não cria versão nova.
6. A leitura/reabertura recupera o objeto associado à revisão atual e verifica tamanho + SHA-256.

O arquivo S3 nunca possui URL pública ou credenciais entregues ao browser/Collabora. A API não considera uma tentativa de `PutFile` um salvamento concluído antes da persistência transacional. Falhas intermediárias podem gerar objetos **órfãos não referenciados**; reconciliação, recuperação de desastre e backups operacionais são marcos posteriores, obrigatórios antes de produção.

## Endpoints — API

| Operação | Autenticação | Endpoint |
|---|---|---|
| Importar DOCX pessoal | Bearer Entra | `POST /api/v1/me/documents` (`multipart/form-data`, `file`, `title`) |
| Listar documentos pessoais | Bearer Entra | `GET /api/v1/me/documents` |
| Metadados autorizados | Bearer Entra | `GET /api/v1/documents/{id}` |
| Baixar DOCX autorizado | Bearer Entra | `GET /api/v1/documents/{id}/download` |
| Solicitar editor WOPI | Bearer Entra | `POST /api/v1/documents/{id}/editor-session` |
| `CheckFileInfo` | Token WOPI temporário | `GET /wopi/files/{id}?access_token=` |
| `GetFile` | Token WOPI temporário | `GET /wopi/files/{id}/contents?access_token=` |
| `PutFile` | Token WOPI temporário + concorrência | `POST /wopi/files/{id}/contents?access_token=` |
| Lock, RefreshLock, Unlock, GetLock | Token WOPI temporário | `POST /wopi/files/{id}?access_token=` + `X-WOPI-Override` |

O endpoint de sessão retorna `actionUrl`, `accessToken`, `accessTokenTtl` e `wopiSrc`. O navegador envia `access_token` via **formulário POST**, não em links. O token aleatório tem entropia de 256 bits, expira em oito horas, e somente seu hash SHA-256 fica armazenado. A API revalida permissões a cada operação WOPI. As rotas WOPI abertas na camada HTTP não são públicas em termos de dados: sempre exigem esse token específico. O storage nunca é exposto diretamente.

## Executar localmente

**Pré-requisitos:** Java 21, Docker Engine/Compose, Node.js conforme `apps/web/package.json`, autenticação Entra de desenvolvimento configurada conforme `docs/implementation/auth-web-entra.md`, PostgreSQL e Maven (ou Maven Wrapper com Maven Central acessível).

1. Edite o `.env` **não versionado** na raiz, sem imprimir ou publicar seus segredos:

   ```dotenv
   DOCUMENTS_ENABLED=true
   DOCUMENTS_ALLOW_INSECURE_DEV=true
   DOCUMENTS_WOPI_PUBLIC_BASE_URL=http://host.docker.internal:8080
   COLLABORA_DISCOVERY_URL=http://localhost:9980/hosting/discovery
   DOCUMENT_STORAGE_PROVIDER=s3
   DOCUMENT_S3_ENDPOINT=http://127.0.0.1:8333
   DOCUMENT_S3_BUCKET=nite-connect-documents
   DOCUMENT_S3_REGION=us-east-1
   DOCUMENT_S3_ACCESS_KEY=<chave-de-desenvolvimento>
   DOCUMENT_S3_SECRET_KEY=<segredo-de-desenvolvimento-forte>
   ```

   Em `apps/web/.env.local` configure `COLLABORA_BROWSER_ORIGIN=http://localhost:9980`, além das variáveis de login e API já existentes.

2. A partir da raiz do repositório:

   ```bash
   docker compose --env-file .env -f infra/compose.documents.yaml up -d
   # Banco de desenvolvimento: use o Postgres local já utilizado pelo projeto ou:
   docker compose --env-file .env -f infra/compose.yaml up -d db
   cd apps/api && sh ./mvnw spring-boot:run
   # Outro terminal: cd apps/web && npm run dev
   ```

3. Confira `http://localhost:9980/hosting/discovery`, entre no portal com conta institucional **ativa**, acesse `http://localhost:3000/documentos`, importe um DOCX fictício com tabela, abra-o, edite uma célula, salve, feche e reabra. Verifique os bytes baixados ou compare a tabela no Word/LibreOffice e confira a revisão no endpoint autenticado. Sem configuração Entra real, utilize os testes automatizados: **não foi criado bypass DEV**.

4. Replique o fluxo com outra conta (deve receber 404), com conta administrativa (deve obter acesso), com falha de S3 (deve falhar sem avançar revisão), com token revogado, com locks conflitantes e com documento DOCX alterado. O CODE deve acessar o backend via `host.docker.internal:8080`; navegadores acessam CODE em `localhost:9980`.

**Limite de ambiente:** HTTP e portas locais somente para desenvolvimento. A futura operação institucional exige TLS confiável, proxy reverso, configuração segura de frame/origin, monitoramento, armazenamento e backups restauráveis. A imagem CODE é candidata gratuita, não está homologada para documentos oficiais.

## Verificação automatizada

- `cd apps/api && sh ./mvnw --batch-mode verify` — testes B05 (operação, isolamento, tokens, locks, persistência, integração S3/SeaweedFS) mais regressões, com PostgreSQL/Testcontainers.
- `cd apps/web && npm run check` — frontend.
- `git diff --check` — verificação de alterações.

**Estado nesta entrega:** não foi possível executar Maven/Testcontainers/Collabora no ambiente de construção por ausência de Docker e de rede para obter o Maven Wrapper e as dependências (`sh ./mvnw --batch-mode -version` retornou erro DNS ao acessar `repo.maven.apache.org`). Também não há dependências npm locais instaladas nem Node 24 (`npm run typecheck` retornou `next: not found`). **Não houve teste real do editor no navegador nem homologação; essas são pendências verificáveis, não testes aprovados.** As verificações estáticas de YAML, TypeScript e integridade Git estão registradas à parte.

## Marcos seguintes e riscos assumidos

- **05.2:** pastas pessoais/projeto, administração de permissões, biblioteca e modelos oficiais.
- **05.3:** coedição multiusuário com política completa, versionamento navegável, recuperação, lixeira, auditoria avançada, tratamento de sessões longas e expurgo/reconciliação controlada de objetos órfãos.
- **05.4:** `DocumentEvidenceReader` + snapshots imutáveis B06, testes de fidelidade com cópias autorizadas de documentos reais, capacidade 5–10 usuários, política de implantação CODE gratuito, homologação e plano de backup/restore institucional.

A implementação da fundação **não autoriza produção documental oficial** até completar o teste funcional com Collabora CODE e os gates seguintes.
