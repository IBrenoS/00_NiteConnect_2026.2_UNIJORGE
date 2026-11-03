import { describe, expect, it } from "vitest";
import { meetingGraphHelpHref } from "./graph-help-link";

describe("meetingGraphHelpHref", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("exposes the approved diagnostic only on local development host %s", (host) => {
    expect(meetingGraphHelpHref("development", host)).toBe("/dev/meetings-graph-consent/calendar");
  });

  it.each([
    ["production", "localhost:3000"],
    ["development", "nite.example.edu"],
    ["development", "localhost.attacker.example:3000"],
    ["development", null],
  ])("does not expose the development route for environment=%s host=%s", (environment, host) => {
    expect(meetingGraphHelpHref(environment, host)).toBeNull();
  });
});
