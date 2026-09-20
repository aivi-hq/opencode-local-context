// The file discovery is pure node fs behaviour; test it against real
// throwaway directories.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { loadContextFiles } from "../src/context.ts";
import { cleanupDirectories, rejectsMessage } from "./support.ts";

afterEach(cleanupDirectories);

test("returns empty context when the directory is absent", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));

	const result = await loadContextFiles(
		path.join(root, "missing"),
		"context.local.md",
		"context.{agent}.local.md",
	);

	assert.equal(result.general, undefined);
	assert.equal(result.agents.size, 0);
});

test("loads and trims general and per-agent files while ignoring unsafe matches", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
	await writeFile(path.join(root, "context.local.md"), "\n General \n");
	await writeFile(
		path.join(root, "context.review.local.md"),
		" Review only \n",
	);
	await writeFile(path.join(root, "context..local.md"), "no agent");
	await writeFile(path.join(root, "context.empty.local.md"), " \n");
	await writeFile(path.join(root, "unrelated.md"), "ignore");
	await mkdir(path.join(root, "context.directory.local.md"));

	const result = await loadContextFiles(
		root,
		"context.local.md",
		"context.{agent}.local.md",
	);

	assert.equal(result.general, "General");
	assert.deepEqual([...result.agents], [["review", "Review only"]]);
	assert.equal(result.sources.general, path.join(root, "context.local.md"));
	assert.equal(
		result.sources.agents.get("review"),
		path.join(root, "context.review.local.md"),
	);
});

test("supports a custom pattern with an empty suffix", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
	await writeFile(path.join(root, "agent-build"), "Build context");

	const result = await loadContextFiles(root, "all.md", "agent-{agent}");

	assert.equal(result.agents.get("build"), "Build context");
});

test("wraps non-absence read errors with the source filename", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
	await mkdir(path.join(root, "context.local.md"));

	await rejectsMessage(
		loadContextFiles(root, "context.local.md", "context.{agent}.local.md"),
		`failed to read ${path.join(root, "context.local.md")}`,
	);
});

test("wraps context-directory scan errors", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
	const file = path.join(root, "not-a-directory");
	await writeFile(file, "content");

	await rejectsMessage(
		loadContextFiles(file, "missing.md", "agent-{agent}.md"),
		`failed to scan ${file}`,
	);
});
