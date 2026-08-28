import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";
import { mock } from "bun:test";
import { LocalContextPlugin } from "../src/index.ts";
import type { LocalContextOptions } from "../src/options.ts";

const directories: string[] = [];
const environment = new Map<string, string | undefined>();

export function stubEnv(name: string, value: string): void {
  if (!environment.has(name)) environment.set(name, process.env[name]);
  process.env[name] = value;
}

export function restoreEnv(): void {
  for (const [name, value] of environment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  environment.clear();
}

export async function temporaryProject(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opencode-local-context-"));
  directories.push(directory);
  return directory;
}

export async function cleanupDirectories(): Promise<void> {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
}

export function pluginInput(root: string, log?: (request: unknown) => Promise<unknown>) {
  const logger = log ?? mock(async () => ({ data: true }));
  return {
    input: {
      worktree: root,
      directory: path.join(root, "packages", "app"),
      client: { app: { log: logger } },
    } as unknown as PluginInput,
    log: logger,
  };
}

export async function createHooks(
  root: string,
  options?: LocalContextOptions,
  log?: (request: unknown) => Promise<unknown>,
): Promise<Hooks> {
  const mock = pluginInput(root, log);
  return LocalContextPlugin(mock.input, options as Record<string, unknown> | undefined);
}

export async function runConfig(hooks: Hooks, config: Config): Promise<void> {
  await hooks.config?.(config);
}

export async function runSystem(hooks: Hooks, system: string[]): Promise<string[]> {
  const output = { system };
  await hooks["experimental.chat.system.transform"]?.(
    {
      model: {} as Parameters<NonNullable<Hooks["experimental.chat.system.transform"]>>[0]["model"],
    },
    output,
  );
  return output.system;
}
