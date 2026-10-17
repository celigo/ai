import assert from "node:assert/strict";
import { test } from "node:test";
import { isInternal, nodeAt, parseBlocks, stripInternal } from "./yaml-blocks.mjs";

const yaml = (...lines) => `${lines.join("\n")}\n`;

test("nodeAt resolves mapping keys, sequence indexes, dash-line entries and escaped segments", () => {
	const doc = parseBlocks(
		yaml(
			"Schema:",
			"  allOf:",
			"    - $ref: './base.yml#/Base'",
			"    - type: object",
			"      properties:",
			"        'a/b':",
			"          type: string",
			"  enum:",
			"  - one",
			"  - two",
		),
	);
	assert.equal(nodeAt(doc, "#/Schema/allOf/1/properties/a~1b").key, "a/b");
	assert.equal(nodeAt(doc, "#/Schema/allOf/0/$ref").value, "'./base.yml#/Base'");
	assert.equal(nodeAt(doc, "#/Schema/enum/1").value, "two");
	assert.equal(nodeAt(doc, "#/Schema/allOf/2"), null);
	assert.equal(nodeAt(doc, "#/Schema/missing"), null);
	assert.equal(nodeAt(doc, "").kind, "root");
});

test("parseBlocks keeps block scalars, flow values and comments opaque", () => {
	const doc = parseBlocks(
		yaml(
			"A:",
			"  description: |",
			"    looks like a key: value",
			"    # looks like a comment",
			"    - looks like an item",
			"  tags: [a,",
			"    b]",
			"  # note: not a key",
			"  type: object",
		),
	);
	assert.deepEqual(
		nodeAt(doc, "#/A").children.map((c) => c.key),
		["description", "tags", "type"],
	);
	assert.equal(nodeAt(doc, "#/A/description").end, 4);
});

test("isInternal is true only for a truthy x-internal child", () => {
	const doc = parseBlocks(yaml("a:", "  x-internal: true", "b:", "  x-internal: false", "c:", "  type: string"));
	assert.deepEqual(
		["#/a", "#/b", "#/c"].map((p) => isInternal(nodeAt(doc, p))),
		[true, false, false],
	);
});

test("stripInternal removes a flagged property with its comments and leaves the rest byte-identical", () => {
	const text = yaml(
		"Request:",
		"  required: [name, secret]",
		"  properties:",
		"    name:",
		"      type: string",
		"    # pre-GA, see the ticket",
		"    secret:",
		"      # internal note",
		"      x-internal: true",
		"      type: string",
		"      description: |-",
		"        Not yet.",
		"    kept:",
		"      x-internal: false",
		"      type: boolean",
	);
	assert.equal(
		stripInternal(text),
		yaml(
			"Request:",
			"  required: [name, secret]",
			"  properties:",
			"    name:",
			"      type: string",
			"    kept:",
			"      x-internal: false",
			"      type: boolean",
		),
	);
});

test("stripInternal removes flagged sequence items, dash-line flag or nested", () => {
	const text = yaml(
		"A:",
		"  allOf:",
		"    - x-internal: true",
		"      type: object",
		"    - $ref: './base.yml#/Base'",
		"    -",
		"      type: object",
		"      x-internal: true",
	);
	assert.equal(stripInternal(text), yaml("A:", "  allOf:", "    - $ref: './base.yml#/Base'"));
});

test("stripInternal deletes a container it empties, one level up only", () => {
	const text = yaml(
		"A:",
		"  if:",
		"    properties:",
		"      gate:",
		"        x-internal: true",
		"        const: on",
		"  then:",
		"    required: [gate]",
	);
	assert.equal(stripInternal(text), yaml("A:", "  if: {}", "  then:", "    required: [gate]"));
});

test("stripInternal drops entries and items whose $ref points at a flagged node", () => {
	const text = yaml(
		"A:",
		"  properties:",
		"    block:",
		"      $ref: './other.yml#/Hidden'",
		"    flow: { $ref: './other.yml#/Hidden' }",
		"    open:",
		"      $ref: './other.yml#/Open'",
		"  oneOf:",
		"    - $ref: './other.yml#/Hidden'",
		"    - $ref: './other.yml#/Open'",
	);
	const isInternalRef = ({ file, pointer }) => file === "./other.yml" && pointer === "#/Hidden";
	assert.equal(
		stripInternal(text, isInternalRef),
		yaml("A:", "  properties:", "    open:", "      $ref: './other.yml#/Open'", "  oneOf:", "    - $ref: './other.yml#/Open'"),
	);
});

test("stripInternal moves the dash onto the next entry when the dash-line entry goes", () => {
	const text = yaml(
		"A:",
		"  examples:",
		"    - hidden:",
		"        x-internal: true",
		"      shown: 1",
		"    - gone:",
		"        x-internal: true",
		"    - emptied:",
		"        nested:",
		"          x-internal: true",
	);
	assert.equal(stripInternal(text), yaml("A:", "  examples:", "    - shown: 1", "    - {}"));
});

test("stripInternal ignores x-internal written inside a block scalar and returns unflagged text as is", () => {
	const text = yaml("A:", "  description: |", "    x-internal: true marks pre-GA fields.", "  type: object");
	assert.equal(stripInternal(text), text);
});
