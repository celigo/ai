import assert from "node:assert/strict";
import { test } from "node:test";
import { lintText } from "./lint-schemas.mjs";

test("lintText passes a clean schema with a placeholder credential", () => {
	assert.deepEqual(lintText('Creds:\n  type: object\n  examples: ["<access-key-id>"]\n'), []);
});

test("lintText flags x-internal and x-celigo-canon, escaped spellings included", () => {
	assert.deepEqual(lintText("A:\n  x-internal: true\n"), ["mentions x-internal — the public bundles strip nodes flagged with it"]);
	assert.deepEqual(lintText('A:\n  kind: { "x\\u002Dceligo-canon": { decision: open } }\n'), [
		"mentions x-celigo-canon — the public bundles strip these validation-decision records",
	]);
});

test("lintText flags the Mongoose type-wrapper leak", () => {
	const text = "Mapping:\n  properties:\n    type:\n      type: array\n";
	assert.deepEqual(lintText(text), ["mongoose type-wrapper (property named `type` holding an array)"]);
});
