# Migração do storage documental para Cloudflare R2

## Escopo e estado verificado

Esta mudança migra apenas os objetos documentais de AWS S3 para Cloudflare R2. A API continua no Docker Compose local; PostgreSQL, frontend e demais serviços não são migrados. Não usar Neon.

A aplicação usa o SDK S3 da AWS com endpoint configurável; para o R2 mudam o endpoint, a região e as credenciais. O runtime local anterior apontava para AWS S3 em `us-east-2`. O proprietário confirmou que nenhum documento chegou a ser armazenado na AWS por causa do bloqueio da conta, portanto não há cópia de dados AWS a fazer. SeaweedFS continua sendo um storage de desenvolvimento distinto.

## Recursos e configuração aplicados (19 nov. 2026)

- Criado o bucket privado `nite-connect-documents`, classe Standard, sem objetos de origem para copiar.
- Criado o token `nite-connect-documents-local`, restrito a esse bucket, com permissão Object Read & Write e validade de um ano.
- Configurado o `.env` local `D:\nite-connect\.env` com o endpoint da conta, bucket, região `auto`, credenciais e `DOCUMENT_S3_PURGE_VERSIONS=false`. Os valores secretos não devem ser registrados nem versionados.
- A API local foi reconstruída e reiniciada usando o código R2 deste branch junto com os demais arquivos atuais de `D:\nite-connect`, preservando as alterações locais preexistentes nesse clone.

Como o clone principal está com alterações locais e o branch R2 permanece separado, a imagem ativa foi montada a partir de um contexto temporário que combina os dois estados. Antes de reconstruir a API pelo Compose original de `D:\nite-connect`, integrar a correção R2 ao código que será usado no build; caso contrário, o código antigo pode voltar a chamar `ListObjectVersions`.

O bucket começou vazio; a configuração não migra objetos que possam existir em outro storage local. O container SeaweedFS continua independente e não é sincronizado automaticamente com R2.

## Preparação do destino e do runtime

1. A criação já foi realizada conforme a seção anterior. Não publicar o bucket nem registrar as credenciais em arquivos versionados.
2. Usar o endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` e região `auto`. O SDK S3 existente pode continuar sendo usado com esses valores. [Configuração S3 oficial do R2](https://developers.cloudflare.com/r2/get-started/s3/)
3. No `.env` local usado pelo Compose, manter `DOCUMENT_STORAGE_PROVIDER=s3` e configurar (já aplicado no `.env` local):

   ```dotenv
   DOCUMENT_S3_CONTAINER_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   DOCUMENT_S3_CONTAINER_BUCKET=<bucket-r2>
   DOCUMENT_S3_CONTAINER_REGION=auto
   DOCUMENT_S3_CONTAINER_ACCESS_KEY=<access-key-r2>
   DOCUMENT_S3_CONTAINER_SECRET_KEY=<secret-key-r2>
   DOCUMENT_S3_PURGE_VERSIONS=false
   ```

   Não copiar o exemplo literalmente para o `.env`; substituir os placeholders localmente. Preservar as demais variáveis da aplicação, inclusive banco e Collabora.
4. Manter `DOCUMENT_S3_PURGE_VERSIONS=false` no R2. O código usa `DeleteObject` para a chave exata nesse modo, sem chamar `ListObjectVersions`; o padrão `true` preserva a remoção de versões no S3 AWS. A lista de compatibilidade do R2 marca a operação de versões como não implementada e `DeleteObject` como implementada. [Compatibilidade da API S3](https://developers.cloudflare.com/r2/api/s3/api/)

## Inventário e cópia

Como a origem AWS não contém objetos, a etapa de inventário e cópia não se aplica a essa migração. Se for identificado conteúdo em SeaweedFS ou em outro storage local que precise ser preservado, inventariar e copiar esse storage em uma atividade separada, verificando as referências no banco antes do corte.

Se houver futuramente outra origem com dados, aplicar os passos abaixo antes de apontar o runtime para R2:

1. Fazer backup do PostgreSQL e registrar bucket, quantidade de objetos e tamanho total. Gerar manifesto de todas as chaves da origem. Incluir objetos em `documents/<UUID>.docx` e `assets/<UUID>.bin`, incluindo versões de documentos e templates ainda referenciadas; copiar a origem completa para preservar objetos não referenciados também.
2. Para cada objeto referenciado no banco, comparar tamanho e SHA-256 com o valor registrado nas tabelas de versões de documentos, templates e PDFs. Confirmar que toda chave referenciada pode ser lida da origem antes de iniciar a cópia. Uma chave ausente ou ilegível bloqueia a migração até recuperação da versão correta.
3. Se a AWS estiver acessível e os objetos estiverem dentro dos limites do serviço, usar Cloudflare Super Slurper com permissão de origem somente para listar e ler, destino R2 limitado ao bucket e opção de ignorar objetos já existentes. Super Slurper não apaga a origem; objetos em classes Glacier podem ser ignorados e devem ser tratados antes do corte. [Super Slurper](https://developers.cloudflare.com/r2/data-migration/super-slurper/)
4. Se a cópia partir de backup, usar `rclone copy` de um backup em formato árvore de objetos, preservando a estrutura das chaves e metadados. Configurar os remotes no arquivo local do rclone, fora do Git. Se o backup não preservar nomes e conteúdo por chave, ele não serve para restaurar o bucket.
5. Não comparar ETags como prova de integridade: operações multipart podem produzir ETags diferentes na origem e no destino. Comparar SHA-256 dos bytes e tamanhos. Manter a origem intacta durante a cópia.

## Corte, validação e rollback

1. Antes do corte, executar testes locais e uma gravação/leitura/exclusão R2 usando UUIDs temporários. Validar `PutObject`, `GetObject`, `DeleteObject`, leitura de documentos e assets, conteúdo/MIME type e purge idempotente.
2. Na janela curta, pausar gravações, exclusões e o worker de purge. Parar brevemente somente a API, sem parar nem alterar o container PostgreSQL. Executar cópia incremental final, verificar manifesto, tamanhos e hashes e só então aplicar as variáveis R2 no `.env` local.
3. Validar a configuração sem imprimir a saída resolvida, depois reconstruir e iniciar somente a API (passe `--env-file` explicitamente quando o `.env` estiver fora do diretório do Compose):

   ```powershell
   docker compose --env-file ..\.env -f infra/compose.yaml config --quiet
   docker compose --env-file ..\.env -f infra/compose.yaml up -d --build api
   ```

4. O smoke test direto contra o R2 foi executado: gravou/leu DOCX e asset, purgou os dois e repetiu o purge. Também foi executado com sucesso usando o `S3DocumentObjectStore` em modo R2, sem `ListObjectVersions`. Ainda validar no fluxo da interface um upload/download real e abertura/salvamento pelo Collabora.
5. Se a validação falhar antes de reabrir gravações, voltar a configuração ao S3 apenas se a conta AWS já estiver acessível. Após novas gravações no R2, não apontar simplesmente para o S3 antigo: primeiro sincronizar e verificar as mudanças do R2 para evitar perda de dados. Se AWS continuar bloqueada, manter a API/documentos em manutenção enquanto corrige R2.
6. Acompanhar erros, objetos ausentes e uso/custo. A franquia publicada do R2 Standard é mensal: 10 GB-month, 1 milhão de operações Classe A e 10 milhões Classe B; o excedente é cobrado e egress é gratuito. Verificar o total real do inventário antes de assumir que ficará na franquia. [Preços do R2](https://developers.cloudflare.com/r2/pricing/)
7. Depois do aceite, manter a origem AWS sem novas gravações até o proprietário autorizar o encerramento. Excluir bucket, versões e credenciais AWS é uma etapa separada, destrutiva e exige confirmação explícita.

## Validação automatizada

Na API, executar os testes direcionados de storage e purge:

```powershell
cd apps/api
& .\mvnw.cmd -B '-Dtest=S3DocumentObjectStoreTest,DocumentS3IntegrationTest,DocumentPurgeExecutionIntegrationTest,DocumentPurgeWorkerTest' test
```

`S3DocumentObjectStoreTest` cobre exclusão direta dos prefixos `documents/` e `assets/` sem `ListObjectVersions`, e preservação do comportamento padrão com listagem de versões. Os testes Testcontainers exercitam a integração existente via SeaweedFS/PostgreSQL; eles não substituem o smoke test contra o bucket R2 real.
