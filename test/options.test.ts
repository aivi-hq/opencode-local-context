// Option validation is pure; test it as such.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveContextDirectory, resolveOptions } from "../src/options.ts";
import { throwsMessage } from "./support.ts";

test("provides zero-config defaults rooted at the worktree", () => {
	const options = resolveOptions();

	assert.deepEqual(options, {
		root: "worktree",
		contextDir: ".opencode",
		generalFile: "context.local.md",
		agentFilePattern: "context.{agent}.local.md",
		missingEnv: "error",
		interpolate: true,
	});
	assert.equal(
		resolveContextDirectory(options, {
			worktree: "/repo",
			directory: "/repo/packages/app",
		}),
		path.resolve("/repo/.opencode"),
	);
});

test("supports an absolute directory and a directory root", () => {
	const absolute = resolveOptions({ contextDir: "/shared/context" });
	const nested = resolveOptions({
		root: "directory",
		contextDir: "developer",
		generalFile: "all.md",
		agentFilePattern: "agent-{agent}.md",
		missingEnv: "warn",
		interpolate: false,
	});

	assert.equal(
		resolveContextDirectory(absolute, {
			worktree: "/repo",
			directory: "/repo/app",
		}),
		"/shared/context",
	);
	assert.equal(
		resolveContextDirectory(nested, {
			worktree: "/repo",
			directory: "/repo/app",
		}),
		path.resolve("/repo/app/developer"),
	);
});

const invalid: ReadonlyArray<readonly [unknown, string]> = [
	[null, "plugin options must be an object"],
	[[], "plugin options must be an object"],
	[{ unknown: true }, 'unknown option "unknown"'],
	[{ root: "project" }, 'root must be "worktree" or "directory"'],
	[{ missingEnv: "ignore" }, 'missingEnv must be "error", "warn", or "empty"'],
	[{ contextDir: "" }, "contextDir must be a non-empty string"],
	[{ generalFile: 42 }, "generalFile must be a non-empty string"],
	[
		{ generalFile: "nested/context.md" },
		"generalFile must be a filename, not a path",
	],
	[{ generalFile: "." }, "generalFile must be a filename, not a path"],
	[{ generalFile: ".." }, "generalFile must be a filename, not a path"],
	[
		{ agentFilePattern: "context.md" },
		"agentFilePattern must contain {agent} exactly once",
	],
	[
		{ agentFilePattern: "{agent}.{agent}.md" },
		"agentFilePattern must contain {agent} exactly once",
	],
	[{ interpolate: "yes" }, "interpolate must be a boolean"],
];

for (const [index, [options, message]] of invalid.entries()) {
	test(`rejects invalid options ${index}`, () => {
		throwsMessage(() => resolveOptions(options), message);
	});
}
