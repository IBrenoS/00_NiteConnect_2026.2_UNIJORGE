"use client";

import { useState, type FormEvent } from "react";
import {
  AlertDialog,
  Badge,
  Button,
  Checkbox,
  Dialog,
  Field,
  InlineFeedback,
  Select,
  Surface,
  Textarea,
  TextField,
} from "./ui";
import { TransientFeedback } from "./ui/transient-feedback";
import { AdminDataQueryLab } from "./admin-data-query-lab";
import { QueryControlsLab } from "./query-controls-lab";

export function ComponentLibraryLab() {
  const [showError, setShowError] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [receiveUpdates, setReceiveUpdates] = useState(true);
  const [selectionState, setSelectionState] = useState<"mixed" | "checked" | "unchecked">("mixed");
  const [formMessage, setFormMessage] = useState("A validação do formulário ainda não foi executada.");
  const [compositionMessage, setCompositionMessage] = useState("Preencha os campos e envie para testar o formulário nativo.");
  const [feedbackMessage, setFeedbackMessage] = useState("Nenhuma atualização foi simulada.");
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("O diálogo está fechado.");
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertPending, setAlertPending] = useState(false);
  const [alertMessage, setAlertMessage] = useState("Nenhuma confirmação demonstrativa executada.");
  const [alertCount, setAlertCount] = useState(0);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage("O formulário demonstrativo passou pela validação nativa do navegador.");
  }

  function submitComposition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompositionMessage("Formulário demonstrativo validado; nenhum dado foi armazenado.");
  }

  function submitDialogForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogMessage("O formulário do diálogo foi validado; nenhum dado foi salvo.");
    setDialogOpen(false);
  }

  function simulateAlertConfirmation() {
    if (alertPending) return;

    const nextCount = alertCount + 1;
    setAlertCount(nextCount);
    setAlertPending(true);
    window.setTimeout(() => {
      setAlertPending(false);
      setAlertDialogOpen(false);
      setAlertMessage(`Confirmação demonstrativa ${nextCount} concluída; nenhuma operação real foi executada.`);
    }, 900);
  }

  return (
    <div className="space-y-8 md:space-y-12">
      <section className="space-y-4" aria-labelledby="component-buttons-heading">
        <div>
          <p className="lab-eyebrow">01 · AÇÕES</p>
          <h2 id="component-buttons-heading" className="font-display text-type-section-title">Button</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Ações usam o elemento nativo button. Links continuam sendo links; informe o tipo explicitamente ao usar uma ação em formulário.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:p-6">
          <Button type="button">Ação principal</Button>
          <Button type="button" variant="secondary">Ação secundária</Button>
          <Button type="button" variant="quiet">Ação discreta</Button>
          <Button type="button" variant="destructive">Ação destrutiva</Button>
          <Button type="button" leadingIcon={<span aria-hidden="true">＋</span>}>Com ícone</Button>
          <Button type="button" disabled>Desabilitado</Button>
          <Button type="button" loading>Salvando alterações</Button>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="component-fields-heading">
        <div>
          <p className="lab-eyebrow">02 · CONTROLES NATIVOS</p>
          <h2 id="component-fields-heading" className="font-display text-type-section-title">TextField e Textarea</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Campos mantêm texto selecionável, teclado e validação do navegador. A tipografia do controle é 16px para evitar ampliação automática em dispositivos móveis.</p>
        </div>
        <form
          className="grid min-w-0 gap-4 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:grid-cols-2 sm:p-6"
          aria-label="Exemplos de campos nativos"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field id="component-text" label="Texto" description="Digite para testar foco, seleção e edição." optional>
            <TextField placeholder="Exemplo de texto" autoComplete="off" />
          </Field>
          <Field id="component-email" label="E-mail" description="O tipo email oferece teclado e validação nativa pertinentes." required>
            <TextField type="email" placeholder="pessoa@exemplo.org" autoComplete="email" />
          </Field>
          <Field id="component-password" label="Senha" description="O campo conserva a semântica nativa de senha." optional>
            <TextField type="password" autoComplete="new-password" />
          </Field>
          <Field id="component-search" label="Busca" description="O tipo search mantém o comportamento de busca do navegador." optional>
            <TextField type="search" placeholder="Buscar neste exemplo" />
          </Field>
          <Field id="component-readonly" label="Somente leitura" description="O conteúdo continua selecionável e pode ser copiado.">
            <TextField readOnly value="Valor demonstrativo somente para leitura" />
          </Field>
          <Field id="component-disabled" label="Desabilitado" description="O navegador remove este controle da interação normal.">
            <TextField disabled value="Campo desabilitado" />
          </Field>
          <div className="sm:col-span-2">
            <Field id="component-description" label="Descrição multilinha" description="O campo pode ser redimensionado e cresce conforme o texto, sem altura fixa." optional>
              <Textarea
                rows={3}
                defaultValue="Texto demonstrativo mais extenso para verificar que o controle multilinha permite leitura, edição, quebra de linha e redimensionamento sem altura fixa."
              />
            </Field>
          </div>
        </form>
      </section>

      <section className="space-y-4" aria-labelledby="component-field-heading">
        <div>
          <p className="lab-eyebrow">03 · COMPOSIÇÃO</p>
          <h2 id="component-field-heading" className="font-display text-type-section-title">Field e validação</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Field associa label, descrição e erro ao controle, sem executar validação de domínio.</p>
        </div>
        <div className="grid min-w-0 gap-6 rounded-panel border border-nite-border-soft bg-nite-surface p-4 lg:grid-cols-2 sm:p-6">
          <div className="space-y-4">
            <Field
              id="component-name"
              label="Nome do projeto demonstrativo"
              description="Este conteúdo é fictício e serve apenas para avaliar a composição do campo."
              error={showError ? "Revise o valor antes de continuar." : undefined}
              required
            >
              <TextField placeholder="Ex.: Organização documental" />
            </Field>
            <Button
              type="button"
              variant="secondary"
              aria-pressed={showError}
              onClick={() => setShowError((current) => !current)}
            >
              {showError ? "Ocultar erro demonstrativo" : "Exibir erro demonstrativo"}
            </Button>
          </div>
          <form className="grid min-w-0 content-start gap-4" onSubmit={submitForm}>
            <Field id="component-native-email" label="E-mail para testar validação" description="Campo obrigatório com validação nativa de formato." required>
              <TextField type="email" required placeholder="pessoa@exemplo.org" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">Validar formulário</Button>
              <Button type="reset" variant="quiet" onClick={() => setFormMessage("Formulário demonstrativo limpo.")}>Limpar</Button>
            </div>
            {formMessage ? <TransientFeedback messageKey={formMessage} onDismiss={() => setFormMessage("")}> <p className="text-type-metadata text-nite-text-secondary" role="status" aria-live="polite">{formMessage}</p> </TransientFeedback> : null}
          </form>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="component-select-heading">
        <div>
          <p className="lab-eyebrow">04 · SELEÇÃO</p>
          <h2 id="component-select-heading" className="font-display text-type-section-title">Select nativo</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">O controle preserva as opções do navegador, teclado, toque, formulário nativo e valor controlado ou inicial.</p>
        </div>
        <div className="grid min-w-0 gap-4 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:grid-cols-2 sm:p-6">
          <Field
            id="component-team"
            label="Equipe"
            description="Seleção controlada com placeholder e validação obrigatória."
            error={showError ? "Erro demonstrativo: revise a equipe selecionada." : undefined}
            required
          >
            <Select
              name="team"
              value={selectedTeam}
              onChange={(event) => setSelectedTeam(event.target.value)}
              placeholder="Selecione uma equipe"
            >
              <option value="research">Pesquisa</option>
              <option value="development">Desenvolvimento</option>
              <option value="extension">Extensão</option>
            </Select>
          </Field>
          <Field id="component-group" label="Grupo" description="Seleção não controlada com valor inicial." optional>
            <Select name="group" defaultValue="all">
              <option value="all">Todos os grupos</option>
              <option value="active">Ativos</option>
              <option value="archived">Arquivados</option>
            </Select>
          </Field>
          <Field id="component-select-disabled" label="Desabilitado" description="O navegador mantém o controle fora da interação normal.">
            <Select disabled defaultValue="web">
              <option value="web">Web</option>
              <option value="api">API</option>
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="component-checkbox-heading">
        <div>
          <p className="lab-eyebrow">05 · MARCAÇÃO</p>
          <h2 id="component-checkbox-heading" className="font-display text-type-section-title">Checkbox nativo e Field</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">O estado indeterminado é apenas uma apresentação visual; o formulário continua usando o valor marcado ou desmarcado do checkbox nativo.</p>
        </div>
        <div className="grid min-w-0 gap-4 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:grid-cols-2 sm:p-6">
          <Field
            id="component-checkbox-controlled"
            label="Receber atualizações"
            description="Exemplo controlado; clique no rótulo ou use a barra de espaço."
            layout="checkbox"
          >
            <Checkbox
              name="updates"
              checked={receiveUpdates}
              onChange={(event) => setReceiveUpdates(event.target.checked)}
            />
          </Field>
          <Field id="component-checkbox-uncontrolled" label="Incluir itens arquivados" description="Exemplo não controlado." optional layout="checkbox">
            <Checkbox name="includeArchived" />
          </Field>
          <Field
            id="component-checkbox-mixed"
            label="Selecionar todos os itens"
            description={selectionState === "mixed" ? "Estado misto: três de cinco itens estão selecionados." : "Alterne para testar a seleção nativa."}
            layout="checkbox"
          >
            <Checkbox
              name="selectAll"
              checked={selectionState === "checked"}
              indeterminate={selectionState === "mixed"}
              onChange={(event) => setSelectionState(event.target.checked ? "checked" : "unchecked")}
            />
          </Field>
          <Field id="component-checkbox-disabled" label="Preferência indisponível" description="O rótulo não altera um controle desabilitado." layout="checkbox">
            <Checkbox disabled defaultChecked />
          </Field>
          <div className="sm:col-span-2">
            <Field
              id="component-checkbox-error"
              label="Preferência demonstrativa"
              description="Ajuda e erro são associados ao checkbox pelo Field."
              error={showError ? "Estado de erro demonstrativo." : undefined}
              layout="checkbox"
            >
              <Checkbox name="preference" />
            </Field>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="component-badge-heading">
        <div>
          <p className="lab-eyebrow">06 · IDENTIFICAÇÃO</p>
          <h2 id="component-badge-heading" className="font-display text-type-section-title">Badge informativo</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">O texto fornece o significado; a cor apenas auxilia na leitura. As variantes semânticas demonstram a paleta e não codificam estados de domínio do Connect.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:p-6">
          <Badge>Neutro</Badge>
          <Badge variant="institutional">NITE Connect</Badge>
          <Badge variant="info">Informação disponível</Badge>
          <Badge variant="success">Concluído</Badge>
          <Badge variant="warning">Atenção necessária</Badge>
          <Badge variant="error">Revisão solicitada</Badge>
          <Badge variant="warning">Texto longo continua visível e quebra dentro do limite disponível</Badge>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="component-composition-heading">
        <div>
          <p className="lab-eyebrow">07 · COMPOSIÇÃO</p>
          <h2 id="component-composition-heading" className="font-display text-type-section-title">Formulário demonstrativo</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Composição dos controles dos lotes 5.2 e 5.3, usando validação e submissão nativas sem persistir dados.</p>
        </div>
        <form
          className="grid min-w-0 gap-4 rounded-panel border border-nite-border-soft bg-nite-surface p-4 sm:grid-cols-2 sm:p-6"
          aria-label="Formulário de demonstração dos componentes"
          onSubmit={submitComposition}
        >
          <Field id="composition-name" label="Nome do item" description="Campo de texto obrigatório." required>
            <TextField name="name" placeholder="Ex.: Relatório de atividades" />
          </Field>
          <Field id="composition-category" label="Categoria" description="Selecione uma opção para habilitar o envio." required>
            <Select name="category" placeholder="Selecione uma categoria" defaultValue="">
              <option value="project">Projeto</option>
              <option value="document">Documento</option>
              <option value="activity">Atividade</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field id="composition-description" label="Descrição" description="Campo multilinha opcional." optional>
              <Textarea name="description" rows={3} placeholder="Adicione contexto para esta demonstração." />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="composition-follow" label="Acompanhar este item" description="Checkbox opcional associado ao formulário." optional layout="checkbox">
              <Checkbox name="follow" value="yes" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <Button type="submit">Validar composição</Button>
            {compositionMessage ? <TransientFeedback messageKey={compositionMessage} onDismiss={() => setCompositionMessage("")}> <p className="text-type-metadata text-nite-text-secondary" role="status" aria-live="polite">{compositionMessage}</p> </TransientFeedback> : null}
          </div>
        </form>
      </section>

      <section className="space-y-4" aria-labelledby="component-feedback-heading">
        <div>
          <p className="lab-eyebrow">08 · FEEDBACK CONTEXTUAL</p>
          <h2 id="component-feedback-heading" className="font-display text-type-section-title">InlineFeedback</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Mensagens persistentes não recebem live region por padrão. Para uma mudança dinâmica, habilite o anúncio apropriado na instância.</p>
        </div>
        <div className="grid min-w-0 gap-3">
          <InlineFeedback variant="info" title="Informação" description="A consulta inclui registros atualizados até hoje." />
          <InlineFeedback variant="success" title="Sucesso" description="As alterações demonstrativas foram validadas." />
          <InlineFeedback variant="warning" title="Atenção" description="Revise os campos sinalizados antes de continuar." />
          <InlineFeedback variant="error" title="Erro" description="Não foi possível concluir a ação demonstrativa. Tente novamente." />
          <Surface variant="subtle" padding="compact" className="flex flex-wrap items-center justify-between gap-3">
            {feedbackMessage ? <TransientFeedback className="min-w-0 flex-1" messageKey={feedbackMessage} onDismiss={() => setFeedbackMessage("")}><InlineFeedback
              variant="info"
              title="Atualização dinâmica"
              description={feedbackMessage}
              announcement="polite"
            /></TransientFeedback> : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const nextCount = feedbackCount + 1;
                setFeedbackCount(nextCount);
                setFeedbackMessage(`Atualização demonstrativa ${nextCount} recebida.`);
              }}
            >
              Simular atualização
            </Button>
          </Surface>
          <InlineFeedback
            variant="warning"
            description="Ação contextual opcional; o botão mantém sua semântica de controle independente."
            action={<Button type="button" variant="secondary">Revisar</Button>}
          />
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="component-surface-heading">
        <div>
          <p className="lab-eyebrow">09 · AGRUPAMENTO</p>
          <h2 id="component-surface-heading" className="font-display text-type-section-title">Surface</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Painéis comuns mantêm contorno e superfície, sem sombra permanente. Elevação fica reservada a agrupamentos que precisam de destaque.</p>
        </div>
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <Surface>
            <h3 className="font-sans text-type-component-title">Padrão confortável</h3>
            <p className="mt-2 text-type-body-compact text-nite-text-secondary">Agrupamento primário com superfície, borda suave e padding confortável.</p>
          </Surface>
          <Surface variant="subtle" padding="compact">
            <h3 className="font-sans text-type-component-title">Ênfase discreta</h3>
            <p className="mt-2 text-type-body-compact text-nite-text-secondary">Tratamento compacto para conteúdo auxiliar sem criar elevação.</p>
          </Surface>
          <Surface variant="elevated">
            <h3 className="font-sans text-type-component-title">Elevação contextual</h3>
            <p className="mt-2 text-type-body-compact text-nite-text-secondary">Sombra flutuante usada apenas quando a hierarquia exige separação.</p>
          </Surface>
        </div>
        <Surface padding="comfortable">
          <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
            <Field id="surface-project" label="Projeto" description="Formulário agrupado por Surface." required>
              <TextField placeholder="Nome do projeto demonstrativo" />
            </Field>
            <Field id="surface-period" label="Período" description="Controle nativo dentro da superfície." required>
              <Select defaultValue="current">
                <option value="current">Atual</option>
                <option value="previous">Anterior</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button type="submit">Aplicar filtro demonstrativo</Button>
              <Badge variant="institutional">Somente demonstração</Badge>
            </div>
          </form>
        </Surface>
      </section>

      <section className="space-y-4" aria-labelledby="component-dialog-heading">
        <div>
          <p className="lab-eyebrow">10 · MODAIS</p>
          <h2 id="component-dialog-heading" className="font-display text-type-section-title">Dialog e AlertDialog</h2>
          <p className="mt-2 max-w-prose text-type-body-compact text-nite-text-secondary">Dialog permite cancelar por Escape ou clique no backdrop. AlertDialog exige uma ação explícita, começa com foco em Cancelar e ignora o backdrop para proteger a decisão.</p>
        </div>
        <Surface variant="subtle" className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setDialogOpen(true)}>Abrir diálogo de edição</Button>
          <Button type="button" variant="destructive" onClick={() => setAlertDialogOpen(true)}>Abrir confirmação sensível</Button>
          {dialogMessage || alertMessage ? <TransientFeedback className="w-full" messageKey={`${dialogMessage}:${alertMessage}`} onDismiss={() => { setDialogMessage(""); setAlertMessage(""); }}><p className="text-type-metadata text-nite-text-secondary" role="status" aria-live="polite">{dialogMessage} {alertMessage}</p></TransientFeedback> : null}
        </Surface>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Editar item demonstrativo"
          description="Formulário contextual fictício para validar conteúdo, foco, rolagem e fechamento."
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" form="lab-dialog-form">Salvar demonstração</Button>
            </>
          }
        >
          <form id="lab-dialog-form" className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={submitDialogForm}>
            <Field id="dialog-name" label="Nome" description="Obrigatório para a validação nativa." required>
              <TextField name="name" placeholder="Ex.: Planejamento de extensão" />
            </Field>
            <Field id="dialog-status" label="Situação" description="Selecione um valor demonstrativo." required>
              <Select name="status" placeholder="Selecione uma situação" defaultValue="">
                <option value="draft">Em elaboração</option>
                <option value="review">Em revisão</option>
                <option value="done">Concluído</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field id="dialog-notes" label="Observações" description="Textarea expansível sem altura máxima fixa." optional>
                <Textarea name="notes" rows={5} placeholder="Adicione informações fictícias para testar a rolagem." />
              </Field>
            </div>
          </form>
          <div className="mt-5 space-y-3 text-type-body-compact text-nite-text-secondary" aria-label="Conteúdo longo demonstrativo">
            <p>Este conteúdo adicional existe para exercitar a rolagem interna do modal em telas menores e preservar o acesso ao cabeçalho e às ações.</p>
            <p>O texto pode crescer, quebrar em múltiplas linhas e permanecer dentro da região rolável, sem ampliar a página de fundo nem causar overflow horizontal.</p>
            <p>Em aplicações reais, o corpo do diálogo deve apresentar somente as informações necessárias à tarefa contextual, com ações claras no rodapé.</p>
            <p>A demonstração não persiste os valores e não representa uma regra administrativa ou um fluxo definitivo do Connect.</p>
          </div>
        </Dialog>
        <AlertDialog
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
          title="Confirmar ação demonstrativa?"
          description="Esta simulação representa uma operação sensível. Confirmar apenas altera o estado visual da demonstração; nenhum registro será excluído ou modificado."
          pending={alertPending}
          confirmLabel="Simular confirmação"
          onConfirm={simulateAlertConfirmation}
        >
          <InlineFeedback
            variant="warning"
            description="Você pode cancelar com o botão ou pressionar Escape. O clique no backdrop não confirma nem fecha esta confirmação."
          />
        </AlertDialog>
      </section>
      <QueryControlsLab />
      <AdminDataQueryLab />
    </div>
  );
}
