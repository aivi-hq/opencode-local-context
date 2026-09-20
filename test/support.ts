// Shared test helpers: temporary projects, environment stubbing, message
// assertions, and a fake OpenCode 2 plugin context. The fake implements only
// what the plugin touches — location, options, the agent transform and the
// session request hooks — and records the registrations so tests can replay
// them the way OpenCode would.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Plugin } from "@opencode/plugin";

import { LocalContextPlugin } from "../src/index.ts";
import type { LocalContextOptions } from "../src/options.ts";

export interface TextPart {
	type: "text";
	text: string;
}

export interface SystemEvent {
	system: TextPart[];
}

export interface FakeAgent {
	id: string;
	name?: string;
	system?: string;
	description?: string;
}

export type SystemHook = (event: SystemEvent) => void | Promise<void>;
export type AgentTransform = (editor: unknown) => void;

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
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "opencode-local-context-"),
	);
	directories.push(directory);
	return directory;
}

export async function cleanupDirectories(): Promise<void> {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
}

export function assertMessage(error: unknown, message: string): void {
	assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
	assert.ok(
		error.message.includes(message),
		`expected message to include ${JSON.stringify(message)}, got ${JSON.stringify(error.message)}`,
	);
}

export function throwsMessage(action: () => unknown, message: string): void {
	assert.throws(action, (error: unknown) => {
		assertMessage(error, message);
		return true;
	});
}

export async function rejectsMessage(
	promise: Promise<unknown>,
	message: string,
): Promise<void> {
	await assert.rejects(
		() => promise,
		(error: unknown) => {
			assertMessage(error, message);
			return true;
		},
	);
}

export interface FakeContext {
	readonly context: Plugin.Context;
	readonly hooks: ReadonlyMap<string, SystemHook>;
	readonly transforms: readonly AgentTransform[];
}

/** Run the plugin's setup against a fake OpenCode 2 context rooted at `root`. */
export async function createPlugin(
	root: string,
	options?: LocalContextOptions,
): Promise<FakeContext> {
	const hooks = new Map<string, SystemHook>();
	const transforms: AgentTransform[] = [];
	const context = {
		location: {
			directory: path.join(root, "packages", "app"),
			project: { id: "project-test", directory: root, canonical: root },
		},
		options: options ?? {},
		agent: {
			transform: async (callback: (editor: never) => void) => {
				transforms.push(callback as AgentTransform);
				return { dispose: async () => undefined };
			},
		},
		session: {
			hook: async (name: string, callback: SystemHook) => {
				hooks.set(name, callback);
				return { dispose: async () => undefined };
			},
		},
	} as unknown as Plugin.Context;
	await LocalContextPlugin.setup(context);
	return { context, hooks, transforms };
}

/** Replay every registered agent transform over a plain agent registry. */
export async function runAgents(
	transforms: readonly AgentTransform[],
	agents: Record<string, FakeAgent | undefined>,
): Promise<void> {
	const editor = {
		list: () => Object.values(agents).filter((agent) => agent !== undefined),
		get: (id: string) => agents[id],
		default: () => undefined,
		update: (id: string, update: (agent: FakeAgent) => void) => {
			const agent = agents[id];
			if (agent !== undefined) update(agent);
		},
		remove: (id: string) => {
			delete agents[id];
		},
	};
	for (const transform of transforms) transform(editor);
}

/**
 * Run one registered request hook over plain system strings and return the
 * transformed strings.
 */
export async function runSystem(
	hooks: ReadonlyMap<string, SystemHook>,
	name: string,
	system: readonly string[],
): Promise<string[]> {
	const event: SystemEvent = {
		system: system.map((text) => ({ type: "text", text })),
	};
	await hooks.get(name)?.(event);
	return event.system.map((part) => part.text);
}
