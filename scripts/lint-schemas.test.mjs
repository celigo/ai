import assert from "node:assert/strict";
import { test } from "node:test";
import { lintText } from "./lint-schemas.mjs";

test("lintText passes a clean schema with a placeholder credential", () => {
	assert.deepEqual(lintText('Creds:\n  type: object\n  examples: ["<access-key-id>"]\n'), []);
});

test("lintText flags the Mongoose type-wrapper leak", () => {
	const text = "Mapping:\n  properties:\n    type:\n      type: array\n";
	assert.deepEqual(lintText(text), ["mongoose type-wrapper (property named `type` holding an array)"]);
});
