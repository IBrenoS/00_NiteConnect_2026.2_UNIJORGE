# Prova Teams Link no tenant — 2026-11-02

## Escopo e método

Prova manual no Teams Web autenticado com conta institucional, sem Graph/OBO. Foram usados o deep link oficial de criação de reunião, o Calendário institucional e a ação nativa **Start an instant Teams meeting**. Nenhuma reunião agendada recebeu convidados. Na sala instantânea, a câmera permaneceu desligada e o microfone silenciado.

## Resultados observados

### Agendamento

- O link `https://teams.microsoft.com/l/meeting/new` abriu o formulário de nova reunião no Teams Web.
- `subject`, `startTime`, `endTime` com offset explícito `-03:00` e `attendees` codificados preencheram o formulário. A aplicação mostrou o fuso `(UTC-03:00) Salvador`, duração de 30 minutos e a opção de reunião online ativada.
- Um UPN fictício foi usado somente para provar o preenchimento do seletor de convidados; o formulário não foi enviado com esse convidado.
- Depois, foi salvo um evento real de teste do NITE Connect no calendário institucional para 05/11/2026, 10:00–10:30 (Salvador), sem convidados. O item apareceu no calendário após recarregar a agenda e apresentou `Join`/`Reuniões do Microsoft Teams`.
- Isso comprova que o Teams Web do tenant consegue abrir e salvar o evento de calendário com reunião online. Não comprova Graph, visibilidade de convidados externos, e-mails de convite nem o deep link automatizado do backend.

### Reunir agora

- A ação nativa **Start an instant Teams meeting** abriu o formulário Meet now.
- **Get a link to share** gerou e exibiu um URL oficial `teams.microsoft.com/meet/{id}?p=...`, além de confirmar que o link foi copiado.
- **Start meeting** abriu a pré-entrada e a sala confirmou `You have joined the meeting` / `You are the only one here`. A pré-entrada mostrou câmera desligada e microfone silenciado; nenhum dispositivo foi ativado.
- Em uma repetição, foi iniciada outra sala instantânea, `NITE Connect — Prova de lobby — 2`, e o organizador ingressou nela. O link oficial foi aberto pelo browser do ChatGPT; após o usuário informar que a conta secundária já estava autenticada nessa sessão, o Teams mostrou um segundo participante na reunião.
- A interface identificou o segundo participante como `Externo desconhecido` e exibiu atividade de chat. Isso confirma ingresso real pelo link segundo a sessão observada e a informação do usuário, mas a interface não expôs o endereço da conta para validar sua identidade de forma independente.
- Não foi observado participante aguardando admissão nem controle do lobby: o segundo participante apareceu já dentro da chamada. Portanto, esta prova confirma acesso pelo link, mas não comprova uma etapa de lobby nem sua política de admissão.
- A URL não foi copiada para esta auditoria nem para logs/repositório.

### Chamada direta

O deep link de chamada direta é uma operação de áudio/vídeo com destinatários, não o fluxo de reunião agendada e nem um gerador de link Meet now. Não deve ser usado como substituto do provedor `TEAMS_LINK`.

## Limitações ainda não comprovadas

- O ingresso da conta secundária foi observado, mas o comportamento de espera e admissão no lobby não foi comprovado; o participante apareceu diretamente na chamada.
- Na repetição, a câmera permaneceu desligada e não foi feito teste de áudio. Não foram acionados controles de áudio/vídeo durante essa prova.
- Não foi enviado convite Microsoft; o evento salvo é sem convidados.
- A conta institucional mostrou e salvou o evento no Outlook/Teams, mas isso não comprova que todo integrante NITE tenha a mesma licença, mailbox ou política Teams.
- `Calendars.ReadWrite` delegado e o fluxo OBO continuam sem consentimento Graph; esta prova manual não altera esse diagnóstico.

## Decisão de implementação

Manter o provedor Graph/OBO e oferecer `TEAMS_LINK` no mesmo agregado interno. O NITE registra a preparação como `AGUARDANDO_TEAMS`; abrir Teams não muda o estado. O organizador salva/cria a reunião no Teams e vincula manualmente o link oficial. Somente após esse vínculo o NITE libera a rota de entrada e as notificações internas. Alterações e cancelamentos `TEAMS_LINK` são locais e indicam explicitamente que não foram sincronizados com Teams.

Referência Microsoft: [Deep links for workflows in Teams](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/deep-link-workflow?tabs=teamsjs-v2) e [Start an instant meeting in Microsoft Teams](https://support.microsoft.com/en-us/teams/meetings/start-an-instant-meeting-in-microsoft-teams).
