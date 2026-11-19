import { expect, it } from "vitest";
import { parseProjectDetails, parseProjectPeriod, parseProjectStatusEvent, projectTransitions } from "./administration-contracts";
const id = "11111111-1111-4111-8111-111111111111";
it("parseia resposta mínima sem encaminhar metadados de auditoria ao cliente", () => {
 const project = { id,title:"Real",description:"Descrição",startsOn:null,endsOn:null,status:"PLANEJAMENTO",version:0 };
 expect(parseProjectDetails({...project, createdBy:id})).toEqual(project);
 for (const patch of [{ version:-1 },{status:"OUTRO"},{startsOn:"2026-02-30"},{id:"x"}]) expect(parseProjectDetails({...project,...patch})).toBeNull();
});
it("aceita históricos do contrato e rejeita eventos inválidos", () => {
 const event = { id,previousStatus:null,newStatus:"PLANEJAMENTO",reason:"Cadastro",occurredAt:"2026-11-18T12:00:00Z" };
 expect(parseProjectStatusEvent(event)).toEqual(event);
 expect(parseProjectStatusEvent({...event,newStatus:"INVÁLIDO"})).toBeNull();
 const period = {id,memberId:id,startedAt:event.occurredAt,endedAt:null,startReason:"Equipe",endReason:null};
 expect(parseProjectPeriod(period)).toEqual(period); expect(parseProjectPeriod({...period,startedAt:"ontem"})).toBeNull();
});
it("oferece as transições existentes sem saltar planejamento para conclusão", () => {
 expect(projectTransitions.PLANEJAMENTO).toEqual(["ATIVO"]); expect(projectTransitions.ATIVO).toEqual(["PAUSADO","CONCLUIDO"]); expect(projectTransitions.CONCLUIDO).toEqual(["ATIVO"]);
});
