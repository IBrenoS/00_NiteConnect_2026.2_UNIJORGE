import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { TextField } from "../ui/text-field";
import { ManagementPersonFilter } from "./management-person-filter";
import { searchManagementPeople } from "../../lib/activities/management-actions";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useId: () => "person-search",
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
}));
vi.mock("../../lib/activities/management-actions", () => ({ searchManagementPeople: vi.fn() }));

function find(node: ReactNode, predicate: (node: ReactNode) => boolean): ReactNode {
  if (predicate(node)) return node;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean) ?? null;
  return isValidElement<{ children?: ReactNode }>(node) ? find(node.props.children, predicate) : null;
}

function render() {
  state.cursor = 0;
  return ManagementPersonFilter({ label: "Responsável", name: "executorId", projectId: "project" });
}

beforeEach(() => { state.values = []; state.cursor = 0; vi.clearAllMocks(); });

it("pesquisa pelo nome, envia o ID da opção selecionada e limpa a seleção", async () => {
  vi.mocked(searchManagementPeople).mockResolvedValue({ data: { items: [{ id: "member-id", name: "Ana Costa" }], page: 0, size: 20, total: 1 }, issue: null });
  const field = find(render(), node => isValidElement(node) && node.type === TextField);
  if (!isValidElement<{ onChange: (event: { currentTarget: { value: string } }) => void }>(field)) throw new Error("Campo de pesquisa ausente");
  field.props.onChange({ currentTarget: { value: "Ana" } });
  const button = (label: string) => {
    const node = find(render(), node => isValidElement<{ children?: ReactNode; "aria-label"?: string }>(node) && node.type === "button" && (node.props.children === label || node.props["aria-label"] === label));
    if (!isValidElement<{ onClick: () => void }>(node)) throw new Error(`Botão ausente: ${label}`);
    return node;
  };
  button("Buscar").props.onClick();
  await Promise.resolve();
  expect(searchManagementPeople).toHaveBeenCalledWith("Ana", 0, "project");
  button("Ana Costa").props.onClick();
  const html = renderToStaticMarkup(render());
  expect(html).toContain("Ana Costa");
  expect(html).toMatch(/<input[^>]+type="hidden"[^>]+name="executorId"[^>]*value="member-id"|<input[^>]+type="hidden"[^>]+value="member-id"[^>]*name="executorId"/);
  button("Limpar seleção: Responsável").props.onClick();
  expect(renderToStaticMarkup(render())).not.toContain("member-id");
});

it("pagina os resultados da pesquisa pelo nome", async () => {
  vi.mocked(searchManagementPeople).mockResolvedValue({ data: { items: [{ id: "member-id", name: "Ana Costa" }], page: 0, size: 20, total: 21 }, issue: null });
  const field = find(render(), node => isValidElement(node) && node.type === TextField);
  if (!isValidElement<{ onChange: (event: { currentTarget: { value: string } }) => void }>(field)) throw new Error("Campo de pesquisa ausente");
  field.props.onChange({ currentTarget: { value: "Ana" } });
  const findButton = (label: string) => {
    const node = find(render(), child => isValidElement<{ children?: ReactNode }>(child) && child.type === "button" && child.props.children === label);
    if (!isValidElement<{ onClick: () => void }>(node)) throw new Error(`Botão ausente: ${label}`);
    return node;
  };
  findButton("Buscar").props.onClick();
  await Promise.resolve();
  findButton("Mais resultados").props.onClick();
  await Promise.resolve();
  expect(searchManagementPeople).toHaveBeenLastCalledWith("Ana", 1, "project");
});
