import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "@opencode-ai/plugin";
import { afterEach, describe, expect, it, mock } from "bun:test";
import plugin, { LocalContextPlugin } from "../src/index.ts";
import {
  cleanupDirectories,
  createHooks,
  pluginInput,
  runConfig,
  runSystem,
  restoreEnv,
  stubEnv,
  temporaryProject,
} from "./support.ts";

afterEach(() => {
  restoreEnv();
  return cleanupDirectories();
});

describe("LocalContextPlugin", () => {
  it("provides a v1 plugin module and named server export", () => {
    expect(plugin.id).toBe("opencode-local-context");
    expect(plugin.server).toBe(LocalContextPlugin);
  });

  it("injects cached general context and interpolates every assembled system string", async () => {
    const root = await temporaryProject();
    const contextDirectory = path.join(root, ".opencode");
    await mkdir(contextDirectory);
    await writeFile(path.join(contextDirectory, "context.local.md"), "Local {env:TEAM}");
    stubEnv("TEAM", "Search");
    const hooks = await createHooks(root);
    await writeFile(path.join(contextDirectory, "context.local.md"), "Changed after startup");

    const system = await runSystem(hooks, ["Global {env:TEAM}", "Custom {env:TEAM}"]);
    await runSystem(hooks, system);

    expect(system).toEqual(["Global Search", "Custom Search", "Local Search"]);
  });

  it("adds isolated per-agent context only to configured agents with prompts", async () => {
    const root = await temporaryProject();
    const contextDirectory = path.join(root, ".opencode");
    await mkdir(contextDirectory);
    await writeFile(path.join(contextDirectory, "context.review.local.md"), "Review {env:TEAM}");
    await writeFile(path.join(contextDirectory, "context.build.local.md"), "Build locally");
    await writeFile(path.join(contextDirectory, "context.unknown.local.md"), "Not configured");
    stubEnv("TEAM", "platform");
    const hooks = await createHooks(root);
    const config: Config = {
      agent: {
        review: { prompt: "Base prompt", description: "For {env:TEAM}" },
        other: { prompt: "Other prompt" },
      },
    } satisfies Config;

    await runConfig(hooks, config);
    await runConfig(hooks, config);

    expect(config.agent?.review?.prompt).toBe("Base prompt\n\nReview platform");
    expect(config.agent?.review?.description).toBe("For platform");
    expect(config.agent?.other?.prompt).toBe("Other prompt");
    expect(config.agent?.build).toBeUndefined();
    expect(config.agent?.unknown).toBeUndefined();
  });

  it("does not replace OpenCode defaults for a configured agent without a prompt", async () => {
    const root = await temporaryProject();
    await mkdir(path.join(root, ".opencode"));
    await writeFile(path.join(root, ".opencode", "context.review.local.md"), "Only context");
    const hooks = await createHooks(root);
    const config: Config = { agent: { review: {} } };

    await runConfig(hooks, config);

    expect(config.agent?.review?.prompt).toBeUndefined();
  });

  it("does not synthesize built-in overrides when the incoming config has no agent object", async () => {
    const root = await temporaryProject();
    await mkdir(path.join(root, ".opencode"));
    await writeFile(path.join(root, ".opencode", "context.explore.local.md"), "Explore locally");
    const hooks = await createHooks(root);
    const config: Config = {};

    await runConfig(hooks, config);

    expect(config.agent).toBeUndefined();
  });

  it("does nothing when context files and agent config are absent", async () => {
    const root = await temporaryProject();
    const hooks = await createHooks(root);
    const config = {} satisfies Config;

    await runConfig(hooks, config);

    expect(await runSystem(hooks, ["Original"])).toEqual(["Original"]);
    expect(config).toEqual({});
  });

  it("tolerates undefined agent entries and sparse assembled system arrays", async () => {
    const root = await temporaryProject();
    const hooks = await createHooks(root);
    const config = { agent: { unavailable: undefined } } as Config;
    const system = ["First", undefined, "Third"] as unknown as string[];

    await runConfig(hooks, config);

    expect(await runSystem(hooks, system)).toEqual([
      "First",
      undefined,
      "Third",
    ] as unknown as string[]);
  });

  it("can disable all interpolation while retaining placeholders", async () => {
    const root = await temporaryProject();
    await mkdir(path.join(root, ".opencode"));
    await writeFile(path.join(root, ".opencode", "context.local.md"), "{env:MISSING}");
    await writeFile(path.join(root, ".opencode", "context.review.local.md"), "{env:MISSING}");
    const hooks = await createHooks(root, { interpolate: false });
    const config = {
      agent: { review: { prompt: "Prompt {env:MISSING}", description: "Desc {env:MISSING}" } },
    } satisfies Config;

    await runConfig(hooks, config);

    expect(config.agent.review).toEqual({
      prompt: "Prompt {env:MISSING}\n\n{env:MISSING}",
      description: "Desc {env:MISSING}",
    });
    expect(await runSystem(hooks, ["System {env:MISSING}"])).toEqual([
      "System {env:MISSING}",
      "{env:MISSING}",
    ]);
  });

  it("fails clearly at initialization when local context references a missing variable", async () => {
    const root = await temporaryProject();
    await mkdir(path.join(root, ".opencode"));
    await writeFile(path.join(root, ".opencode", "context.local.md"), "{env:NOT_SET}");

    await expect(createHooks(root)).rejects.toThrow("environment variable NOT_SET");
  });

  it("fails clearly when a configured prompt or assembled system references a missing variable", async () => {
    const root = await temporaryProject();
    const hooks = await createHooks(root);

    await expect(
      runConfig(hooks, { agent: { review: { prompt: "{env:NOT_SET}" } } }),
    ).rejects.toThrow('agent "review" prompt');
    await expect(runSystem(hooks, ["{env:NOT_SET}"])).rejects.toThrow("assembled system prompt 1");
  });

  it("warns once per missing variable and substitutes empty strings", async () => {
    const root = await temporaryProject();
    await mkdir(path.join(root, ".opencode"));
    await writeFile(path.join(root, ".opencode", "context.local.md"), "Missing {env:SAME_MISSING}");
    const log = mock(async () => {
      throw new Error("logger unavailable");
    });
    const pluginMock = pluginInput(root, log);
    const hooks = await LocalContextPlugin(pluginMock.input, { missingEnv: "warn" });

    await runSystem(hooks, ["Again {env:SAME_MISSING}", "Other {env:OTHER_MISSING}"]);
    await runSystem(hooks, ["Again {env:SAME_MISSING}"]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith({
      body: expect.objectContaining({
        service: "opencode-local-context",
        level: "warn",
        message: expect.stringContaining("SAME_MISSING"),
      }),
    });
  });

  it("supports empty missing policy and directory-rooted custom paths", async () => {
    const root = await temporaryProject();
    const directory = path.join(root, "packages", "app");
    await mkdir(path.join(directory, "developer"), { recursive: true });
    await writeFile(path.join(directory, "developer", "all.md"), "Value:{env:NOT_SET}");
    await writeFile(path.join(directory, "developer", "agent-review.md"), "Agent:{env:NOT_SET}");
    const pluginMock = pluginInput(root);
    const hooks = await LocalContextPlugin(pluginMock.input, {
      root: "directory",
      contextDir: "developer",
      generalFile: "all.md",
      agentFilePattern: "agent-{agent}.md",
      missingEnv: "empty",
    });
    const config: Config = { agent: { review: { prompt: "Base" } } };

    await runConfig(hooks, config);

    expect(config.agent?.review?.prompt).toBe("Base\n\nAgent:");
    expect(await runSystem(hooks, [])).toEqual(["Value:"]);
  });
});
