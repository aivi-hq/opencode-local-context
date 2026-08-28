import { describe, expect, it, mock } from "bun:test";
import { interpolateEnv } from "../src/interpolate.ts";

describe("interpolateEnv", () => {
  it("resolves only explicitly referenced valid environment variables", () => {
    const env = { TEAM: "platform", UNUSED_SECRET: "do-not-read", EMPTY: "" };

    expect(interpolateEnv("Team: {env:TEAM}; empty: {env:EMPTY}", { env })).toBe(
      "Team: platform; empty: ",
    );
    const shellStyle = "$" + "{TEAM}";
    expect(interpolateEnv(`{env:NOT-VALID} ${shellStyle}`, { env })).toBe(
      `{env:NOT-VALID} ${shellStyle}`,
    );
  });

  it("throws a clear error for a missing variable by default", () => {
    expect(() => interpolateEnv("Hello {env:MISSING}", { env: {}, source: "local.md" })).toThrow(
      "environment variable MISSING referenced by {env:MISSING} is not set (local.md)",
    );
  });

  it("warns and substitutes an empty string under the warn policy", () => {
    const onMissing = mock(() => undefined);

    expect(
      interpolateEnv("{env:FIRST}/{env:SECOND}", {
        env: {},
        policy: "warn",
        onMissing,
      }),
    ).toBe("/");
    expect(onMissing).toHaveBeenCalledTimes(2);
    expect(onMissing).toHaveBeenCalledWith("FIRST", "prompt");
  });

  it("silently substitutes an empty string under the empty policy", () => {
    expect(interpolateEnv("before {env:MISSING} after", { env: {}, policy: "empty" })).toBe(
      "before  after",
    );
  });
});
