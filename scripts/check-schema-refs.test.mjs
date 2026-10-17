import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRefs, findDanglingRefs, rewriteRefs } from "./check-schema-refs.mjs";

test("extractRefs reads block, list-item and flow refs, and skips prose that mentions $ref", () => {
	const text = [
		"A:",
		"  allOf:",
		"    - $ref: './base.yml#/Base'",
		"  properties:",
		"    b:",
		'      $ref: "../common-schemas/filter.yml#/Filter"',
		"    c:",
		"      $ref: ./plain.yml",
		"    d: { $ref: '#/Local' }",
		"  description: Keywords such as `$ref` and allOf are dropped.",
		"",
	].join("\n");
	assert.deepEqual(extractRefs(text), [
		{ file: "./base.yml", pointer: "#/Base" },
		{ file: "../common-schemas/filter.yml", pointer: "#/Filter" },
		{ file: "./plain.yml", pointer: "" },
		{ file: "", pointer: "#/Local" },
	]);
});

test("rewriteRefs swaps only the file part, keeping quotes, pointers and same-file refs", () => {
	const text = [
		"    - $ref: '../../../common/schemas/filter.yml#/Filter'",
		'    x: { $ref: "../../../common/schemas/apim.yml" }',
		"    y:",
		"      $ref: '#/Local'",
		"",
	].join("\n");
	const out = rewriteRefs(text, (file) => file.replace("../../../common/schemas/", "../common-schemas/"));
	assert.equal(
		out,
		[
			"    - $ref: '../common-schemas/filter.yml#/Filter'",
			'    x: { $ref: "../common-schemas/apim.yml" }',
			"    y:",
			"      $ref: '#/Local'",
			"",
		].join("\n"),
	);
});

test("findDanglingRefs passes refs that resolve inside the skill", () => {
	const files = new Map([
		["skills/a/references/schemas/request.yml", "R:\n  allOf:\n    - $ref: './base.yml#/Base/properties/x'\n"],
		["skills/a/references/schemas/base.yml", "Base:\n  properties:\n    x:\n      $ref: '../common-schemas/f.yml#/F'\n"],
		["skills/a/references/common-schemas/f.yml", "F:\n  $ref: '#/G'\nG:\n  type: string\n"],
	]);
	assert.deepEqual(findDanglingRefs(files), []);
});

test("findDanglingRefs reports a missing file, a ref out of the skill, and a missing component", () => {
	const files = new Map([
		[
			"skills/a/references/schemas/request.yml",
			[
				"R:",
				"  allOf:",
				"    - $ref: './base.yml#/Base'",
				"    - $ref: '../../../common/schemas/resource-response.yml#/ResourceResponse'",
				"    - $ref: './present.yml#/Renamed'",
				"    - $ref: './present.yml#/Present/properties/gone'",
				"    - $ref: '#/Nowhere'",
				"",
			].join("\n"),
		],
		["skills/a/references/schemas/present.yml", "Present:\n  type: object\n  properties:\n    kept:\n      type: string\n"],
	]);
	assert.deepEqual(
		findDanglingRefs(files).map((d) => `${d.ref} — ${d.reason}`),
		[
			"./base.yml#/Base — skills/a/references/schemas/base.yml is not present",
			"../../../common/schemas/resource-response.yml#/ResourceResponse — skills/common/schemas/resource-response.yml is outside the skill",
			"./present.yml#/Renamed — skills/a/references/schemas/present.yml has nothing at #/Renamed",
			"./present.yml#/Present/properties/gone — skills/a/references/schemas/present.yml has nothing at #/Present/properties/gone",
			"#/Nowhere — skills/a/references/schemas/request.yml has nothing at #/Nowhere",
		],
	);
});

test("quoted $ref keys and flow refs with sibling keys are read, rewritten and checked", () => {
	const text = [
		"A:",
		"  properties:",
		'    b:\n      "$ref": "../../../common/schemas/x.yml#/X"',
		"    c: { $ref: '../../../common/schemas/y.yml#/Y', description: d }",
		"",
	].join("\n");
	assert.deepEqual(
		extractRefs(text).map((r) => r.file),
		["../../../common/schemas/x.yml", "../../../common/schemas/y.yml"],
	);
	assert.match(rewriteRefs(text, (file) => file.replace("../../../common/schemas/", "../common-schemas/")), /"\$ref": "\.\.\/common-schemas\/x\.yml#\/X"[\s\S]*\$ref: '\.\.\/common-schemas\/y\.yml#\/Y', description/);
	const files = new Map([["skills/a/references/schemas/a.yml", text]]);
	assert.equal(findDanglingRefs(files).length, 2);
});

test("findDanglingRefs reports a fragment that is not a JSON pointer", () => {
	const files = new Map([
		["skills/a/references/schemas/r.yml", "R:\n  properties:\n    b:\n      $ref: './base.yml#ExportBase'\n"],
		["skills/a/references/schemas/base.yml", "ExportBase:\n  type: object\n"],
	]);
	assert.deepEqual(
		findDanglingRefs(files).map((d) => d.reason),
		["#ExportBase is not a JSON pointer"],
	);
});

test("findDanglingRefs reports a ref into another skill as outside the skill", () => {
	const files = new Map([
		["skills/a/references/schemas/x.yml", "X:\n  $ref: '../../../b/references/schemas/y.yml#/Y'\n"],
		["skills/b/references/schemas/y.yml", "Y:\n  type: string\n"],
	]);
	assert.deepEqual(
		findDanglingRefs(files).map((d) => d.reason),
		["skills/b/references/schemas/y.yml is outside the skill"],
	);
});
