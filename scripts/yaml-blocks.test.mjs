import assert from "node:assert/strict";
import { test } from "node:test";
import { isInternal, nodeAt, parseBlocks, refOf, stripInternal, stripKey } from "./yaml-blocks.mjs";

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

test("nodeAt rejects non-pointers and decodes ~0, ~1 and percent-escapes in order", () => {
	const doc = parseBlocks(yaml("A:", "  a~1:", "    b c: 1", "  list:", "    - x", "    - y"));
	assert.equal(nodeAt(doc, "#xA"), null);
	assert.equal(nodeAt(doc, "#/A").key, "A");
	assert.equal(nodeAt(doc, "#/A/a~01/b%20c").key, "b c");
	assert.equal(nodeAt(doc, "#/A/list/01"), null);
	assert.equal(nodeAt(doc, "#/A/list/1").value, "y");
	assert.equal(nodeAt(doc, "#/A/100%"), null);
});

test("keys may hold # and :, and anchors or tags in front of a key are skipped", () => {
	const doc = parseBlocks(
		yaml("A:", "  C#:", "    type: string", "  a:b:", "    type: string", "  &k !!str c: 1", "  'it''s': 2", "  list:", "    - two # second"),
	);
	assert.deepEqual(
		nodeAt(doc, "#/A").children.map((c) => c.key),
		["C#", "a:b", "c", "it's", "list"],
	);
	assert.equal(nodeAt(doc, "#/A/list/0").value, "two");
	assert.deepEqual(doc.unparsed, []);
});

test("a scalar on the line after its key is that key's value; unplaceable lines are listed", () => {
	const doc = parseBlocks(
		yaml(
			"---",
			"A:",
			"  description:",
			'    "Shown as the label.',
			'    x-internal: true is prose here"',
			"  flag:",
			"    x-internal:",
			"      false",
			"  ? complex",
			"  : value",
		),
	);
	assert.deepEqual(
		nodeAt(doc, "#/A").children.map((c) => c.key),
		["description", "flag"],
	);
	assert.equal(isInternal(nodeAt(doc, "#/A/flag")), false);
	assert.deepEqual(doc.unparsed, [8, 9]);
});

test("isInternal follows JavaScript truthiness of the flag, as Redocly does", () => {
	const falsy = ["false", "null", "~", "0", "0.0", "-0", "0x0", ".nan", "''", '""', "!!bool false", "&a false", "false # note"];
	const truthy = ["true", '"false"', "yes", "1", "{ reason: pre-GA }"];
	const flag = (value) => isInternal(nodeAt(parseBlocks(yaml("p:", `  x-internal: ${value}`)), "#/p"));
	assert.deepEqual(falsy.filter(flag), []);
	assert.deepEqual(truthy.filter((v) => !flag(v)), []);
	assert.equal(isInternal(nodeAt(parseBlocks(yaml("p:", "  x-internal:", "    reason: pre-GA")), "#/p")), true);
});

test("refOf reads block, quoted and flat flow refs, but not a ref nested deeper in flow", () => {
	const doc = parseBlocks(
		yaml(
			"a:",
			"  $ref: './x.yml#/A'",
			"b:",
			'  "$ref": "./x.yml"',
			"c: { description: d, $ref: '#/C' }",
			"d: { inner: { b: 1, $ref: '#/D' } }",
		),
	);
	assert.deepEqual(refOf(nodeAt(doc, "#/a")), { raw: "./x.yml#/A", file: "./x.yml", pointer: "#/A" });
	assert.equal(refOf(nodeAt(doc, "#/b")).file, "./x.yml");
	assert.equal(refOf(nodeAt(doc, "#/c")).pointer, "#/C");
	assert.equal(refOf(nodeAt(doc, "#/d")), null);
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

test("stripInternal keeps the dash when the entry it moves to is itself emptied", () => {
	const text = yaml(
		"A:",
		"  allOf:",
		"    - properties:",
		"        p:",
		"          x-internal: true",
		"      if:",
		"        properties:",
		"          q:",
		"            x-internal: true",
		"    - type: object",
	);
	assert.equal(stripInternal(text), yaml("A:", "  allOf:", "    - if: {}", "    - type: object"));
});

test("stripInternal drops discriminator mapping entries that name a stripped variant", () => {
	const text = yaml(
		"A:",
		"  oneOf:",
		"    - $ref: './a.yml#/A'",
		"    - $ref: './b.yml#/B'",
		"  discriminator:",
		"    propertyName: kind",
		"    mapping:",
		"      a: './a.yml#/A'",
		"      b: './b.yml#/B'",
	);
	const isInternalRef = ({ file }) => file === "./b.yml";
	assert.equal(
		stripInternal(text, isInternalRef),
		yaml(
			"A:",
			"  oneOf:",
			"    - $ref: './a.yml#/A'",
			"  discriminator:",
			"    propertyName: kind",
			"    mapping:",
			"      a: './a.yml#/A'",
		),
	);
});

test("stripInternal strips escaped and flow-with-siblings spellings", () => {
	const text = yaml(
		"A:",
		"  properties:",
		"    escaped:",
		'      "x\\u002Dinternal": true',
		"    viaFlow: { description: d, $ref: './gate.yml#/Gate' }",
		"    kept:",
		"      type: string",
	);
	const isInternalRef = ({ file }) => file === "./gate.yml";
	assert.equal(stripInternal(text, isInternalRef), yaml("A:", "  properties:", "    kept:", "      type: string"));
});

test("stripInternal leaves keep-chomped text unchanged and keeps separators it does not need", () => {
	const blankAbove = yaml("A:", "  a:", "    description: |+", "      text", "", "  s:", "    x-internal: true", "", "  k: 1");
	assert.equal(stripInternal(blankAbove), yaml("A:", "  a:", "    description: |+", "      text", "", "  k: 1"));
	const scalarAbove = yaml("A:", "  a:", "    description: >+", "      text", "  s:", "    x-internal: true", "", "  k: 1");
	assert.equal(stripInternal(scalarAbove), yaml("A:", "  a:", "    description: >+", "      text", "  k: 1"));
	const separator = yaml("A:", "  a: 1", "  s:", "    x-internal: true", "", "  # --- section", "  k: 1");
	assert.equal(stripInternal(separator), yaml("A:", "  a: 1", "", "  # --- section", "  k: 1"));
});

test("stripKey deletes every entry with that key, wherever it sits, and nothing else", () => {
	const text = yaml(
		"A:",
		"  x-celigo-canon:",
		"    decision: no-enum",
		"    verified: '2026-07-03'",
		"  type: object",
		"  properties:",
		"    kind:",
		"      type: string",
		"      # why there is no enum",
		"      x-celigo-canon:",
		"        decision: not-required",
		"",
		"      description: |",
		"        x-celigo-canon: is prose here",
		"    tags:",
		"      items:",
		"        x-celigo-canon: { decision: no-pattern }",
		"      x-celigo-canonical: kept",
		"  allOf:",
		"    - x-celigo-canon: { decision: open }",
		"      type: object",
	);
	assert.equal(
		stripKey(text, "x-celigo-canon"),
		yaml(
			"A:",
			"  type: object",
			"  properties:",
			"    kind:",
			"      type: string",
			"",
			"      description: |",
			"        x-celigo-canon: is prose here",
			"    tags:",
			"      items: {}",
			"      x-celigo-canonical: kept",
			"  allOf:",
			"    - type: object",
		),
	);
	assert.equal(stripKey(yaml("A:", "  type: object"), "x-celigo-canon"), yaml("A:", "  type: object"));
});

test("stripInternal writes an emptied sequence as [], keeps CRLF, and never removes the document", () => {
	const items = yaml("A:", "  examples:", "    - a:", "        x-internal: true", "  type: object");
	assert.equal(stripInternal(items), yaml("A:", "  examples: []", "  type: object"));
	const crlf = "A:\r\n  examples:\r\n    - emptied:\r\n        nested:\r\n          x-internal: true\r\n    - kept: 1\r\n";
	assert.equal(stripInternal(crlf), "A:\r\n  examples:\r\n    - {}\r\n    - kept: 1\r\n");
	const header = yaml("# Component header", "", "Gone:", "  x-internal: true");
	assert.equal(stripInternal(header), yaml("# Component header", "{}"));
});

test("cuts keep keep-chomped text exact: back-to-back, tagged, and |2+ / >+2 scalars", () => {
	const backToBack = yaml(
		"A:",
		"  properties:",
		"    a:",
		"      description: |+",
		"        text",
		"      x-celigo-canon:",
		"        decision: x",
		"  x-celigo-canon:",
		"    decision: y",
		"",
		"  type: object",
	);
	assert.equal(
		stripKey(backToBack, "x-celigo-canon"),
		yaml("A:", "  properties:", "    a:", "      description: |+", "        text", "  type: object"),
	);
	for (const indicator of ["!!str |+", "&d >+", "|2+", ">+2"]) {
		const text = yaml("A:", "  a:", `    description: ${indicator}`, "      text", "    x-celigo-canon:", "      decision: x", "", "  b: 1");
		assert.equal(stripKey(text, "x-celigo-canon"), yaml("A:", "  a:", `    description: ${indicator}`, "      text", "  b: 1"));
	}
});

test("stripKey handles a cut on line 0, a lone root key, a first child, the end of file, and anchored values", () => {
	assert.equal(stripKey(yaml("x-celigo-canon:", "  decision: x", "", "A: 1"), "x-celigo-canon"), yaml("A: 1"));
	assert.equal(stripKey(yaml("x-celigo-canon:", "  decision: x"), "x-celigo-canon"), yaml("{}"));
	assert.equal(stripKey(yaml("A:", "  x-celigo-canon:", "    decision: x", "", "  type: object"), "x-celigo-canon"), yaml("A:", "  type: object"));
	assert.equal(stripKey(`${yaml("A:", "  type: object", "  x-celigo-canon:", "    decision: x")}\n`, "x-celigo-canon"), yaml("A:", "  type: object"));
	const anchored = yaml("A:", "  kind: &k", "    x-celigo-canon:", "      decision: x", "    type: string");
	assert.equal(stripKey(anchored, "x-celigo-canon"), yaml("A:", "  kind: &k", "    type: string"));
});
