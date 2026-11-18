import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: new Map<number, { deps: readonly unknown[]; cleanup?: () => void }>(), pending: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index=hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index]=initial;
    return [hooks.slots[index],(value:unknown)=>{hooks.slots[index]=value;}];
  },
  useRef: (initial: unknown) => {
    const index=hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index]={current:initial};
    return hooks.slots[index];
  },
  useEffect: (effect:()=>void|(()=>void),deps:readonly unknown[]) => {
    const index=hooks.cursor++;
    const previous=hooks.effects.get(index);
    if(previous && deps.every((value,i)=>Object.is(value,previous.deps[i])) && previous.deps.length===deps.length) return;
    hooks.pending.push(()=>{previous?.cleanup?.(); const cleanup=effect();hooks.effects.set(index,{deps,cleanup:typeof cleanup==="function"?cleanup:undefined});});
  },
}));
import { TransientFeedback, TransientFeedbackFrame, FEEDBACK_VISIBLE_MS, FEEDBACK_EXIT_MS } from "./transient-feedback";
const dismiss=vi.fn();
const replaceState=vi.fn();
const currentUrl="http://localhost:3000/atividades?feedback=deleted&page=2#tasks";
function render() {
 hooks.cursor=0;
 const output=TransientFeedbackFrame({children:<p role="status">Salvo</p>,messageKey:"deleted",queryParam:"feedback",onDismiss:dismiss});
 hooks.pending.splice(0).forEach(effect=>effect());
 return output;
}
beforeEach(()=>{
 hooks.cursor=0;hooks.slots=[];hooks.effects.clear();hooks.pending=[];
 vi.useFakeTimers();vi.setSystemTime(0);vi.clearAllMocks();
 vi.stubGlobal("window",{setTimeout,clearTimeout,location:{href:currentUrl},history:{state:{keep:true},replaceState}});
});
afterEach(()=>{hooks.effects.forEach(effect=>effect.cleanup?.());vi.useRealTimers();vi.unstubAllGlobals();});
it("keeps feedback for six seconds, fades, then removes only its own URL parameter",()=>{
 expect(render()?.props["data-phase"]).toBe("visible");
 vi.advanceTimersByTime(FEEDBACK_VISIBLE_MS-1);
 expect(render()?.props["data-phase"]).toBe("visible");
 vi.advanceTimersByTime(1);
 expect(render()?.props["data-phase"]).toBe("exiting");
 expect(dismiss).not.toHaveBeenCalled();
 vi.advanceTimersByTime(FEEDBACK_EXIT_MS);
 expect(render()).toBeNull();
 expect(dismiss).toHaveBeenCalledOnce();
 expect(replaceState).toHaveBeenCalledWith({keep:true},"","/atividades?page=2#tasks");
});
it("pauses while hovered and resumes the remaining reading time",()=>{
 const output=render();
 vi.advanceTimersByTime(2000);
 output?.props.onMouseEnter();render();
 vi.advanceTimersByTime(10000);
 expect(render()?.props["data-phase"]).toBe("visible");
 render()?.props.onMouseLeave();render();
 vi.advanceTimersByTime(3999);
 expect(render()?.props["data-phase"]).toBe("visible");
 vi.advanceTimersByTime(1);
 expect(render()?.props["data-phase"]).toBe("exiting");
});
it("pauses for keyboard focus and does not dismiss after unmount",()=>{
 render()?.props.onFocusCapture();render();
 vi.advanceTimersByTime(10000);
 expect(render()?.props["data-phase"]).toBe("visible");
 hooks.effects.forEach(effect=>effect.cleanup?.());
 vi.advanceTimersByTime(10000);
 expect(dismiss).not.toHaveBeenCalled();
});
it("gives a new message a fresh lifecycle without altering its accessible content",()=>{
 const first=TransientFeedback({messageKey:"one",children:<p role="alert">Erro</p>});
 const second=TransientFeedback({messageKey:"two",children:<p role="alert">Erro</p>});
 expect(first.key).not.toBe(second.key);
 const child:ReactNode=first.props.children;
 expect(isValidElement<{role:string}>(child) && child.props.role).toBe("alert");
});

it("restarts an identical URL flash when a new server response arrives",()=>{
 hooks.cursor=0;
 const child=<p role="alert">A operação falhou</p>;
 const response={error:"unavailable"};
 const first=TransientFeedback({messageKey:"unavailable",queryParam:"feedback",occurrenceKey:response,children:child});
 hooks.cursor=0;
 expect(TransientFeedback({messageKey:"unavailable",queryParam:"feedback",occurrenceKey:response,children:child}).key).toBe(first.key);
 hooks.cursor=0;
 const second=TransientFeedback({messageKey:"unavailable",queryParam:"feedback",occurrenceKey:{error:"unavailable"},children:<p role="alert">A operação falhou</p>});
 expect(second.key).not.toBe(first.key);
});
it("does not erase a newer message from the URL",()=>{
 window.location.href="http://localhost:3000/atividades?feedback=updated&page=2";
 render();vi.advanceTimersByTime(FEEDBACK_VISIBLE_MS);render();vi.advanceTimersByTime(FEEDBACK_EXIT_MS);render();
 expect(replaceState).not.toHaveBeenCalled();
});
it("cancels a running countdown on unmount",()=>{
 render();vi.advanceTimersByTime(2000);
 hooks.effects.forEach(effect=>effect.cleanup?.());
 vi.advanceTimersByTime(10000);
 expect(dismiss).not.toHaveBeenCalled();
});

it("does not restart a client flash just because its parent renders again",()=>{
 hooks.cursor=0;
 const first=TransientFeedback({messageKey:"unavailable",queryParam:"feedback",children:<p>Falha</p>});
 hooks.cursor=0;
 const second=TransientFeedback({messageKey:"unavailable",queryParam:"feedback",children:<p>Falha</p>});
 expect(second.key).toBe(first.key);
});
