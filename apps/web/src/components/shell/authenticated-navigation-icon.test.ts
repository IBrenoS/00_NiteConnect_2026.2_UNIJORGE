import { describe, expect, it } from "vitest";
import dashboard from "../../../public/lottie/sidebar/dashboard.json";
import checklist from "../../../public/lottie/sidebar/checklist.json";
import cards from "../../../public/lottie/sidebar/cards.json";
import video from "../../../public/lottie/sidebar/video.json";
import clock from "../../../public/lottie/sidebar/clock.json";
import folder from "../../../public/lottie/sidebar/folder.json";
import trash from "../../../public/lottie/sidebar/trash.json";
import network from "../../../public/lottie/sidebar/network.json";
import inbox from "../../../public/lottie/sidebar/inbox.json";
import chart from "../../../public/lottie/sidebar/chart.json";
import books from "../../../public/lottie/sidebar/books.json";
import people from "../../../public/lottie/sidebar/people.json";
import invite from "../../../public/lottie/sidebar/invite.json";
import sliders from "../../../public/lottie/sidebar/sliders.json";

const animations = {
  dashboard, checklist, cards, video, clock, folder, trash,
  network, inbox, chart, books, people, invite, sliders,
};

type Part = { ty: string; nm?: string; it?: Part[]; [key: string]: unknown };
type Frame = { t: number; s: unknown[] };
type Property = { a: number; k: Frame[] };
function group(name: keyof typeof animations, label: string): Part[] {
  const flatten = (items: Part[]): Part[] => items.flatMap((part) => [part, ...flatten(part.it ?? [])]);
  const found = flatten(animations[name].layers[0].shapes).find((part) => part.nm === label);
  if (!found?.it) throw new Error(`Missing group ${name}/${label}`);
  return found.it;
}
function property(name: keyof typeof animations, label: string, type: string, key: string) {
  return group(name, label).find((part) => part.ty === type)?.[key] as Property;
}

describe("motion dos 14 símbolos da sidebar", () => {
  it("usa ciclos curtos, pausa final e retorna à geometria de repouso", () => {
    expect(Object.keys(animations)).toHaveLength(14);
    for (const [name, animation] of Object.entries(animations)) {
      expect(animation).toMatchObject({ w: 24, h: 24, ip: 0 });
      expect(animation.op / animation.fr).toBeGreaterThanOrEqual(0.5);
      expect(animation.op / animation.fr).toBeLessThanOrEqual(1.1);
      let animated = 0;
      const inspect = (value: unknown, key = "") => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach((child) => inspect(child, key)); return; }
        const object = value as Record<string, unknown>;
        if (object.a === 1 && Array.isArray(object.k)) {
          animated++;
          const frames = object.k as Frame[];
          const first = frames[0];
          const last = frames.at(-1)!;
          if (key === "r" && last.s[0] === 360) expect(first.s).toEqual([0]);
          else expect(last.s, name).toEqual(first.s);
          expect(last.t).toBeLessThan(animation.op);
          expect(frames.every((frame, index) => index === 0 || frame.t > frames[index - 1].t)).toBe(true);
        }
        Object.entries(object).forEach(([childKey, child]) => inspect(child, childKey));
      };
      inspect(animation);
      expect(animated, name).toBeGreaterThan(0);
    }
  });

  it("desenha os checks de cima para baixo sem mover as linhas", () => {
    const checks = ["First check", "Second check", "Third check"].map((label) => property("checklist", label, "tm", "e"));
    expect(checks.map(({ k }) => k.find((frame) => frame.t > 4 && frame.s[0] === 100)?.t)).toEqual([18, 24, 30]);
    for (const label of ["Row one", "Row two", "Row three"]) {
      expect(group("checklist", label).some((part) => part.ty === "tm")).toBe(false);
      for (const key of ["p", "s", "r"]) expect(property("checklist", label, "tr", key).a).toBe(0);
    }
  });

  it("faz uma volta completa contínua no relógio e no conjunto de nós", () => {
    expect(property("clock", "Hands", "tr", "r").k.map(({ s }) => s[0])).toEqual([0, 360, 360]);
    expect(property("network", "Coordinated orbit", "tr", "r").k.map(({ s }) => s[0])).toEqual([0, 360, 360]);
  });

  it("representa Projetos com os três braços curvos do símbolo webhook", () => {
    const arms = group("network", "Coordinated orbit").filter((part) => part.ty === "gr");
    expect(arms.map((part) => part.nm)).toEqual(["Webhook arm 1", "Webhook arm 2", "Webhook arm 3"]);
    for (const arm of arms) {
      expect(arm.it?.find((part) => part.ty === "sh")).toMatchObject({ ks: { a: 0, k: { c: false } } });
      expect(arm.it?.find((part) => part.ty === "st")).toMatchObject({ w: { a: 0, k: 2 }, lc: 2, lj: 2 });
      expect(arm.it?.some((part) => part.ty === "rc")).toBe(false);
    }
  });

  it("gira os três braços juntos pelo centro óptico e desacelera até 360 graus", () => {
    expect(property("network", "Coordinated orbit", "tr", "a")).toEqual({ a: 0, k: [12, 13] });
    expect(property("network", "Coordinated orbit", "tr", "p")).toEqual({ a: 0, k: [12, 13] });
    expect(property("network", "Coordinated orbit", "tr", "r").k).toMatchObject([
      { t: 0, s: [0], e: [360], o: { x: 0.42, y: 0 }, i: { x: 0.22, y: 1 } },
      { t: 60, s: [360] }, { t: 64, s: [360] },
    ]);
    for (const label of ["Webhook arm 1", "Webhook arm 2", "Webhook arm 3"]) {
      for (const key of ["p", "r", "s"]) expect(property("network", label, "tr", key).a).toBe(0);
    }
  });

  it("faz todas as barras crescerem com atrasos reais da esquerda para a direita", () => {
    ["Bar one", "Bar two", "Bar three"].forEach((label, index) => {
      const frames = property("chart", label, "tr", "s").k;
      expect(frames[0].s).toEqual([100, 100]);
      expect(frames.find(({ s }) => Number(s[1]) > 100)?.t).toBe(16 + index * 5);
      if (index) expect(frames[1]).toMatchObject({ t: index * 5, s: [100, 100] });
      expect(frames.at(-1)?.s).toEqual([100, 100]);
    });
  });

  it("articula tampa e alça juntas e acomoda a bandeja após a chegada do documento", () => {
    for (const key of ["a", "p", "r"]) expect(property("trash", "Lid", "tr", key)).toEqual(property("trash", "Handle", "tr", key));
    expect(property("inbox", "Tray", "tr", "p").k[1].t).toBeGreaterThan(0);
    expect(property("inbox", "Tray", "tr", "p").k[2].t).toBeGreaterThan(property("inbox", "Delivery sheet", "tr", "p").k[1].t);
    expect(property("video", "Camera body", "tr", "s").a).toBe(0);
  });
});
