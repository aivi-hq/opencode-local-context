import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { loadContextFiles } from "../src/context.ts";
import { cleanupDirectories } from "./support.ts";

afterEach(cleanupDirectories);

describe("loadContextFiles", () => {
  it("returns empty context when the directory is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));

    const result = await loadContextFiles(
      path.join(root, "missing"),
      "context.local.md",
      "context.{agent}.local.md",
    );

    expect(result.general).toBeUndefined();
    expect(result.agents.size).toBe(0);
  });

  it("loads and trims general and per-agent files while ignoring unsafe matches", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
    await writeFile(path.join(root, "context.local.md"), "\n General \n");
    await writeFile(path.join(root, "context.review.local.md"), " Review only \n");
    await writeFile(path.join(root, "context..local.md"), "no agent");
    await writeFile(path.join(root, "context.empty.local.md"), " \n");
    await writeFile(path.join(root, "unrelated.md"), "ignore");
    await mkdir(path.join(root, "context.directory.local.md"));

    const result = await loadContextFiles(root, "context.local.md", "context.{agent}.local.md");

    expect(result.general).toBe("General");
    expect([...result.agents]).toEqual([["review", "Review only"]]);
    expect(result.sources.general).toBe(path.join(root, "context.local.md"));
    expect(result.sources.agents.get("review")).toBe(path.join(root, "context.review.local.md"));
  });

  it("supports a custom pattern with an empty suffix", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
    await writeFile(path.join(root, "agent-build"), "Build context");

    const result = await loadContextFiles(root, "all.md", "agent-{agent}");

    expect(result.agents.get("build")).toBe("Build context");
  });

  it("wraps non-absence read errors with the source filename", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
    await mkdir(path.join(root, "context.local.md"));

    await expect(
      loadContextFiles(root, "context.local.md", "context.{agent}.local.md"),
    ).rejects.toThrow(`failed to read ${path.join(root, "context.local.md")}`);
  });

  it("wraps context-directory scan errors", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "local-context-"));
    const file = path.join(root, "not-a-directory");
    await writeFile(file, "content");

    await expect(loadContextFiles(file, "missing.md", "agent-{agent}.md")).rejects.toThrow(
      `failed to scan ${file}`,
    );
  });
});
