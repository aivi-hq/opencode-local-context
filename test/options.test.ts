import path from "node:path";
import { describe, expect, it } from "bun:test";
import { resolveContextDirectory, resolveOptions } from "../src/options.ts";

describe("resolveOptions", () => {
  it("provides zero-config defaults rooted at the worktree", () => {
    const options = resolveOptions();

    expect(options).toEqual({
      root: "worktree",
      contextDir: ".opencode",
      generalFile: "context.local.md",
      agentFilePattern: "context.{agent}.local.md",
      missingEnv: "error",
      interpolate: true,
    });
    expect(
      resolveContextDirectory(options, {
        worktree: "/repo",
        directory: "/repo/packages/app",
      }),
    ).toBe(path.resolve("/repo/.opencode"));
  });

  it("supports an absolute directory and a directory root", () => {
    const absolute = resolveOptions({ contextDir: "/shared/context" });
    const nested = resolveOptions({
      root: "directory",
      contextDir: "developer",
      generalFile: "all.md",
      agentFilePattern: "agent-{agent}.md",
      missingEnv: "warn",
      interpolate: false,
    });

    expect(resolveContextDirectory(absolute, { worktree: "/repo", directory: "/repo/app" })).toBe(
      "/shared/context",
    );
    expect(resolveContextDirectory(nested, { worktree: "/repo", directory: "/repo/app" })).toBe(
      path.resolve("/repo/app/developer"),
    );
  });

  it.each([
    [null, "plugin options must be an object"],
    [[], "plugin options must be an object"],
    [{ unknown: true }, 'unknown option "unknown"'],
    [{ root: "project" }, 'root must be "worktree" or "directory"'],
    [{ missingEnv: "ignore" }, 'missingEnv must be "error", "warn", or "empty"'],
    [{ contextDir: "" }, "contextDir must be a non-empty string"],
    [{ generalFile: 42 }, "generalFile must be a non-empty string"],
    [{ generalFile: "nested/context.md" }, "generalFile must be a filename, not a path"],
    [{ generalFile: "." }, "generalFile must be a filename, not a path"],
    [{ generalFile: ".." }, "generalFile must be a filename, not a path"],
    [{ agentFilePattern: "context.md" }, "agentFilePattern must contain {agent} exactly once"],
    [
      { agentFilePattern: "{agent}.{agent}.md" },
      "agentFilePattern must contain {agent} exactly once",
    ],
    [{ interpolate: "yes" }, "interpolate must be a boolean"],
  ])("rejects invalid options %#", (options, message) => {
    expect(() => resolveOptions(options)).toThrow(message);
  });
});
