// The interpolation is a pure function over a text and an environment; test
// it as such.

import assert from "node:assert/strict";
import test from "node:test";

import { interpolateEnv } from "../src/interpolate.ts";
import { throwsMessage } from "./support.ts";

test("resolves only explicitly referenced valid environment variables", () => {
	const env = { TEAM: "platform", UNUSED_SECRET: "do-not-read", EMPTY: "" };

	assert.equal(
		interpolateEnv("Team: {env:TEAM}; empty: {env:EMPTY}", { env }),
		"Team: platform; empty: ",
	);
	const shellStyle = "$" + "{TEAM}";
	assert.equal(
		interpolateEnv(`{env:NOT-VALID} ${shellStyle}`, { env }),
		`{env:NOT-VALID} ${shellStyle}`,
	);
});

test("throws a clear error for a missing variable by default", () => {
	throwsMessage(
		() =>
			interpolateEnv("Hello {env:MISSING}", { env: {}, source: "local.md" }),
		"environment variable MISSING referenced by {env:MISSING} is not set (local.md)",
	);
});

test("warns and substitutes an empty string under the warn policy", () => {
	const missing: Array<[string, string]> = [];

	assert.equal(
		interpolateEnv("{env:FIRST}/{env:SECOND}", {
			env: {},
			policy: "warn",
			onMissing: (name, source) => missing.push([name, source]),
		}),
		"/",
	);
	assert.deepEqual(missing, [
		["FIRST", "prompt"],
		["SECOND", "prompt"],
	]);
});

test("silently substitutes an empty string under the empty policy", () => {
	assert.equal(
		interpolateEnv("before {env:MISSING} after", { env: {}, policy: "empty" }),
		"before  after",
	);
});
