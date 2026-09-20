// The plugin end to end: setup runs against the fake OpenCode 2 context from
// support.ts, then the recorded agent transform and request hooks are
// replayed exactly like OpenCode would around a real session.

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "node:test";

import plugin, { LocalContextPlugin } from "../src/index.ts";
import {
	cleanupDirectories,
	createPlugin,
	type FakeAgent,
	rejectsMessage,
	restoreEnv,
	runAgents,
	runSystem,
	stubEnv,
	temporaryProject,
} from "./support.ts";

afterEach(async () => {
	restoreEnv();
	await cleanupDirectories();
});

test("exports the OpenCode 2 plugin definition under both names", () => {
	assert.equal(LocalContextPlugin.id, "opencode-local-context");
	assert.equal(typeof LocalContextPlugin.setup, "function");
	assert.equal(plugin, LocalContextPlugin);
});

test("injects cached general context and interpolates every assembled system string", async () => {
	const root = await temporaryProject();
	const contextDirectory = path.join(root, ".opencode");
	await mkdir(contextDirectory);
	await writeFile(
		path.join(contextDirectory, "context.local.md"),
		"Local {env:TEAM}",
	);
	stubEnv("TEAM", "Search");
	const harness = await createPlugin(root);
	await writeFile(
		path.join(contextDirectory, "context.local.md"),
		"Changed after startup",
	);

	const system = await runSystem(harness.hooks, "context", [
		"Global {env:TEAM}",
		"Custom {env:TEAM}",
	]);
	const again = await runSystem(harness.hooks, "context", system);

	assert.deepEqual(again, ["Global Search", "Custom Search", "Local Search"]);
});

test("registers the system transform for every request kind", async () => {
	const root = await temporaryProject();
	await mkdir(path.join(root, ".opencode"));
	await writeFile(
		path.join(root, ".opencode", "context.local.md"),
		"Shared context",
	);
	const harness = await createPlugin(root);

	assert.deepEqual([...harness.hooks.keys()].sort(), [
		"compaction",
		"context",
		"generate",
		"title",
	]);
	assert.deepEqual(
		await runSystem(harness.hooks, "compaction", ["Summarize this"]),
		["Summarize this", "Shared context"],
	);
});

test("adds isolated per-agent context only to agents with an explicit prompt", async () => {
	const root = await temporaryProject();
	const contextDirectory = path.join(root, ".opencode");
	await mkdir(contextDirectory);
	await writeFile(
		path.join(contextDirectory, "context.review.local.md"),
		"Review {env:TEAM}",
	);
	await writeFile(
		path.join(contextDirectory, "context.build.local.md"),
		"Build locally",
	);
	await writeFile(
		path.join(contextDirectory, "context.unknown.local.md"),
		"Not configured",
	);
	stubEnv("TEAM", "platform");
	const harness = await createPlugin(root);
	const agents: Record<string, FakeAgent | undefined> = {
		review: {
			id: "review",
			name: "Review",
			system: "Base prompt",
			description: "For {env:TEAM}",
		},
		other: { id: "other", name: "Other", system: "Other prompt" },
	};

	await runAgents(harness.transforms, agents);
	await runAgents(harness.transforms, agents);

	assert.equal(agents.review?.system, "Base prompt\n\nReview platform");
	assert.equal(agents.review?.description, "For platform");
	assert.equal(agents.other?.system, "Other prompt");
	assert.equal(agents.build, undefined);
	assert.equal(agents.unknown, undefined);
});

test("does not replace OpenCode defaults for an agent without a prompt", async () => {
	const root = await temporaryProject();
	await mkdir(path.join(root, ".opencode"));
	await writeFile(
		path.join(root, ".opencode", "context.review.local.md"),
		"Only context",
	);
	const harness = await createPlugin(root);
	const agents: Record<string, FakeAgent | undefined> = {
		review: { id: "review", name: "Review" },
	};

	await runAgents(harness.transforms, agents);

	assert.equal(agents.review?.system, undefined);
});

test("does not synthesize agents when the agent registry is empty", async () => {
	const root = await temporaryProject();
	await mkdir(path.join(root, ".opencode"));
	await writeFile(
		path.join(root, ".opencode", "context.explore.local.md"),
		"Explore locally",
	);
	const harness = await createPlugin(root);
	const agents: Record<string, undefined> = {};

	await runAgents(harness.transforms, agents);

	assert.deepEqual(agents, {});
});

test("does nothing when context files and agents are absent", async () => {
	const root = await temporaryProject();
	const harness = await createPlugin(root);
	const agents = {};

	assert.deepEqual(await runSystem(harness.hooks, "context", ["Original"]), [
		"Original",
	]);
	await runAgents(harness.transforms, agents);
	assert.deepEqual(agents, {});
});

test("can disable all interpolation while retaining placeholders", async () => {
	const root = await temporaryProject();
	await mkdir(path.join(root, ".opencode"));
	await writeFile(
		path.join(root, ".opencode", "context.local.md"),
		"{env:MISSING}",
	);
	await writeFile(
		path.join(root, ".opencode", "context.review.local.md"),
		"{env:MISSING}",
	);
	const harness = await createPlugin(root, { interpolate: false });
	const agents = {
		review: {
			id: "review",
			name: "Review",
			system: "Prompt {env:MISSING}",
			description: "Desc {env:MISSING}",
		},
	};

	await runAgents(harness.transforms, agents);

	assert.deepEqual(agents.review, {
		id: "review",
		name: "Review",
		system: "Prompt {env:MISSING}\n\n{env:MISSING}",
		description: "Desc {env:MISSING}",
	});
	assert.deepEqual(
		await runSystem(harness.hooks, "context", ["System {env:MISSING}"]),
		["System {env:MISSING}", "{env:MISSING}"],
	);
});

test("fails clearly at startup when local context references a missing variable", async () => {
	const root = await temporaryProject();
	await mkdir(path.join(root, ".opencode"));
	await writeFile(
		path.join(root, ".opencode", "context.local.md"),
		"{env:NOT_SET}",
	);

	await rejectsMessage(createPlugin(root), "environment variable NOT_SET");
});

test("fails clearly when an agent prompt or assembled system references a missing variable", async () => {
	const root = await temporaryProject();
	const harness = await createPlugin(root);

	await rejectsMessage(
		runAgents(harness.transforms, {
			review: { id: "review", system: "{env:NOT_SET}" },
		}),
		'agent "review" prompt',
	);
	await rejectsMessage(
		runSystem(harness.hooks, "context", ["{env:NOT_SET}"]),
		"assembled system prompt 1",
	);
});

test("warns once per missing variable and substitutes empty strings", async () => {
	const root = await temporaryProject();
	await mkdir(path.join(root, ".opencode"));
	await writeFile(
		path.join(root, ".opencode", "context.local.md"),
		"Missing {env:SAME_MISSING}",
	);
	const warnings: string[] = [];
	const originalWarn = console.warn;
	console.warn = (message?: unknown) => {
		warnings.push(String(message));
	};

	try {
		const harness = await createPlugin(root, { missingEnv: "warn" });
		await runSystem(harness.hooks, "context", [
			"Again {env:SAME_MISSING}",
			"Other {env:OTHER_MISSING}",
		]);
		await runSystem(harness.hooks, "context", ["Again {env:SAME_MISSING}"]);
	} finally {
		console.warn = originalWarn;
	}

	assert.equal(warnings.length, 2);
	assert.match(warnings[0] ?? "", /SAME_MISSING/);
	assert.match(warnings[1] ?? "", /OTHER_MISSING/);
});

test("supports empty missing policy and directory-rooted custom paths", async () => {
	const root = await temporaryProject();
	const directory = path.join(root, "packages", "app");
	await mkdir(path.join(directory, "developer"), { recursive: true });
	await writeFile(
		path.join(directory, "developer", "all.md"),
		"Value:{env:NOT_SET}",
	);
	await writeFile(
		path.join(directory, "developer", "agent-review.md"),
		"Agent:{env:NOT_SET}",
	);
	const harness = await createPlugin(root, {
		root: "directory",
		contextDir: "developer",
		generalFile: "all.md",
		agentFilePattern: "agent-{agent}.md",
		missingEnv: "empty",
	});
	const agents: Record<string, FakeAgent | undefined> = {
		review: { id: "review", name: "Review", system: "Base" },
	};

	await runAgents(harness.transforms, agents);

	assert.equal(agents.review?.system, "Base\n\nAgent:");
	assert.deepEqual(await runSystem(harness.hooks, "context", []), ["Value:"]);
});
