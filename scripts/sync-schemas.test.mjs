import assert from "node:assert/strict";
import { test } from "node:test";
import { planSync } from "./sync-schemas.mjs";
import { parseBlocks } from "./yaml-blocks.mjs";

const EXPORT = "specs/v1/export/components/schemas";
const TP = "specs/v1/tradingpartnerconnector/components/schemas";
const COMMON = "specs/v1/common/schemas";
const SKILL = "skills/exp/references";

function plan({ synced, tree, editorial = {}, quarantined = {}, referenced = {}, localFiles = {}, unpublished = [] }) {
	const ias = {
		ref: "test-ref",
		has: (path) => Object.hasOwn(tree, path),
		read: (path) => tree[path],
		outline: (path) => parseBlocks(tree[path]),
		isPublished: (domain) => !unpublished.includes(domain),
	};
	const map = { synced, referenced, editorial, quarantined };
	return planSync({ map, ias, localFiles: new Map(Object.entries(localFiles)) });
}

test("copies a $ref target beside the mapped file that names it, leaving the ref as written", () => {
	const request = "Request:\n  allOf:\n    - $ref: './base.yml#/ExportBase'\n";
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: { [`${EXPORT}/request.yml`]: request, [`${EXPORT}/base.yml`]: "ExportBase:\n  type: object\n" },
	});
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.referenced, { [`${SKILL}/schemas/base.yml`]: `${EXPORT}/base.yml` });
	assert.equal(result.files.get(`${SKILL}/schemas/request.yml`), request);
	assert.equal(result.files.get(`${SKILL}/schemas/base.yml`), "ExportBase:\n  type: object\n");
});

test("lands a target from another IAS directory in <dir>-schemas and follows its refs", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  allOf:\n    - $ref: '../../../common/schemas/transform.yml#/Transform'\n",
			[`${COMMON}/transform.yml`]: "Transform:\n  properties:\n    lookups:\n      $ref: './lookups.yml#/Lookups'\n",
			[`${COMMON}/lookups.yml`]: "Lookups:\n  type: array\n",
		},
	});
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.referenced, {
		[`${SKILL}/common-schemas/lookups.yml`]: `${COMMON}/lookups.yml`,
		[`${SKILL}/common-schemas/transform.yml`]: `${COMMON}/transform.yml`,
	});
	assert.match(result.files.get(`${SKILL}/schemas/request.yml`), /\$ref: '\.\.\/common-schemas\/transform\.yml#\/Transform'/);
	assert.match(result.files.get(`${SKILL}/common-schemas/transform.yml`), /\$ref: '\.\/lookups\.yml#\/Lookups'/);
});

test("points refs at a mapped file that was renamed in the skill", () => {
	const result = plan({
		synced: {
			"skills/b2b/references/schemas/tp-request.yml": `${TP}/request.yml`,
			"skills/b2b/references/schemas/tp-section.yml": `${TP}/supported-by-section.yml`,
		},
		tree: {
			[`${TP}/request.yml`]: "Request:\n  allOf:\n    - $ref: './base.yml#/TpBase'\n",
			[`${TP}/base.yml`]: 'TpBase:\n  properties:\n    s:\n      $ref: "./supported-by-section.yml#/Section"\n',
			[`${TP}/supported-by-section.yml`]: "Section:\n  type: object\n",
		},
	});
	assert.deepEqual(result.errors, []);
	const base = "skills/b2b/references/tradingpartnerconnector-schemas/base.yml";
	assert.deepEqual(result.referenced, { [base]: `${TP}/base.yml` });
	assert.match(result.files.get("skills/b2b/references/schemas/tp-request.yml"), /\$ref: '\.\.\/tradingpartnerconnector-schemas\/base\.yml#\/TpBase'/);
	assert.match(result.files.get(base), /\$ref: "\.\.\/schemas\/tp-section\.yml#\/Section"/);
});

test("fails when a $ref target is missing upstream", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: { [`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n" },
	});
	assert.equal(
		result.errors[0],
		`${SKILL}/schemas/base.yml: $ref target ${EXPORT}/base.yml (from ${EXPORT}/request.yml) missing at test-ref`,
	);
});

test("fails when a mapped source is missing upstream", () => {
	const result = plan({ synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` }, tree: {} });
	assert.equal(
		result.errors[0],
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml missing at test-ref — re-point the map entry`,
	);
});

test("strips x-internal properties, and does not pull in what only they reference", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n",
			[`${EXPORT}/base.yml`]: [
				"ExportBase:",
				"  properties:",
				"    name:",
				"      type: string",
				"    preview:",
				"      x-internal: true",
				"      $ref: '../../../agentgroup/components/schemas/group.yml#/Group'",
				"",
			].join("\n"),
		},
		unpublished: ["agentgroup"],
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.get(`${SKILL}/schemas/base.yml`), "ExportBase:\n  properties:\n    name:\n      type: string\n");
	assert.deepEqual(Object.keys(result.referenced), [`${SKILL}/schemas/base.yml`]);
});

test("drops an entry whose $ref points at a node upstream flags x-internal", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  properties:",
				"    gate:",
				"      $ref: './gate.yml#/Gate'",
				"    name:",
				"      type: string",
				"",
			].join("\n"),
			[`${EXPORT}/gate.yml`]: "Gate:\n  x-internal: true\n  type: object\n",
		},
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.get(`${SKILL}/schemas/request.yml`), "Request:\n  properties:\n    name:\n      type: string\n");
	assert.deepEqual(result.referenced, {});
});

test("fails when x-internal survives stripping", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: { [`${EXPORT}/request.yml`]: "Request:\n  properties:\n    preview: { type: string, x-internal: true }\n" },
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml fails lint: mentions x-internal — the public bundles strip nodes flagged with it`,
	]);
	assert.equal(result.files.has(`${SKILL}/schemas/request.yml`), false);
});

test("deletes x-celigo-canon records, alongside x-internal nodes, from the files it writes", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  properties:",
				"    kind:",
				"      type: string",
				"      x-celigo-canon:",
				"        decision: no-enum",
				"        reason: the server accepts any value",
				"    hidden:",
				"      x-internal: true",
				"",
			].join("\n"),
		},
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.get(`${SKILL}/schemas/request.yml`), "Request:\n  properties:\n    kind:\n      type: string\n");
});

test("fails when x-celigo-canon survives stripping", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  properties:\n    kind: { type: string, x-celigo-canon: { decision: no-enum } }\n",
		},
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml fails lint: mentions x-celigo-canon — the public bundles strip these validation-decision records`,
	]);
});

test("strips x-internal before x-celigo-canon, so a schema emptied by both stays as {}", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  properties:",
				"    p:",
				"      x-celigo-canon:",
				"        decision: open",
				"      items:",
				"        x-internal: true",
				"        type: string",
				"",
			].join("\n"),
		},
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.get(`${SKILL}/schemas/request.yml`), "Request:\n  properties:\n    p: {}\n");
});

test("refuses to strip canon from a file with YAML the outline can't place", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  properties:\n    ? complex\n    kind:\n      x-celigo-canon:\n        decision: open\n",
		},
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml has x-celigo-canon and YAML the stripper can't outline (line 3)`,
	]);
});

test("deletes every x-celigo-* key the skills don't ship, canon included, and keeps the public ones", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  properties:",
				"    body:",
				"      type: string",
				"      x-celigo-hints:",
				"        - handlebars",
				"      x-celigo-ai-guidance: Send the body as JSON.",
				"      description: Template for the request body.",
				"    hooks:",
				"      x-celigo-hints:",
				"      - script",
				"      x-celigo-canon:",
				"        decision: open",
				"      type: object",
				"",
			].join("\n"),
		},
	});
	assert.deepEqual(result.errors, []);
	assert.equal(
		result.files.get(`${SKILL}/schemas/request.yml`),
		[
			"Request:",
			"  properties:",
			"    body:",
			"      type: string",
			"      x-celigo-ai-guidance: Send the body as JSON.",
			"      description: Template for the request body.",
			"    hooks:",
			"      type: object",
			"",
		].join("\n"),
	);
});

test("fails when a non-public x-celigo-* key survives stripping", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: { [`${EXPORT}/request.yml`]: "Request:\n  properties:\n    query: { type: string, x-celigo-hints: [sql] }\n" },
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml fails lint: mentions an x-celigo-* key the skills don't ship — the sync strips all but PUBLIC_VENDOR_KEYS`,
	]);
});

test("refuses to strip a non-public x-celigo-* key from a file with YAML the outline can't place", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  properties:\n    ? complex\n    body:\n      x-celigo-hints:\n        - handlebars\n",
		},
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml has x-celigo-hints and YAML the stripper can't outline (line 3)`,
	]);
});

test("passes public x-celigo-* keys through a file with YAML the outline can't place", () => {
	const source = "Request:\n  properties:\n    ? complex\n    body:\n      x-celigo-ai-guidance: Send JSON.\n";
	const result = plan({ synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` }, tree: { [`${EXPORT}/request.yml`]: source } });
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.get(`${SKILL}/schemas/request.yml`), source);
});

test("fails a source carrying internal tooling text or a tracker key, and keeps a quarantined copy instead", () => {
	const source = "Request:\n  description: The WidgetsAgent writes both copies (ABC-123456).\n";
	const failing = plan({ synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` }, tree: { [`${EXPORT}/request.yml`]: source } });
	assert.deepEqual(failing.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml fails lint: internal tooling text: a name with an Agent part that isn't in PUBLIC_AGENT_NAMES`,
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml fails lint: issue-tracker key outside quotes`,
	]);
	const held = plan({
		synced: {},
		quarantined: { [`${SKILL}/schemas/request.yml`]: { source: `${EXPORT}/request.yml`, reason: "upstream fix pending" } },
		localFiles: { [`${SKILL}/schemas/request.yml`]: "Request:\n  type: object\n" },
		tree: { [`${EXPORT}/request.yml`]: source },
	});
	assert.deepEqual(held.errors, []);
	assert.equal(held.files.has(`${SKILL}/schemas/request.yml`), false);
	assert.deepEqual(held.deletes, []);
});

test("fails on any x-internal left in a written file, even a false flag", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: { [`${EXPORT}/request.yml`]: "Request:\n  properties:\n    kept:\n      x-internal: false\n      type: string\n" },
	});
	assert.match(result.errors.join("\n"), /fails lint: mentions x-internal/);
});

test("refuses to strip a flagged file with YAML the outline can't place", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  properties:",
				"    ? complex",
				"    : value",
				"    gate:",
				"      x-internal: true",
				"",
			].join("\n"),
		},
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/request.yml: source ${EXPORT}/request.yml has x-internal and YAML the stripper can't outline (line 3)`,
	]);
});

test("drops an entry whose $ref reaches a flagged node through an alias", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  properties:",
				"    gate:",
				"      $ref: '../../../common/schemas/alias.yml#/Alias'",
				"    name:",
				"      type: string",
				"",
			].join("\n"),
			[`${COMMON}/alias.yml`]: "Alias:\n  $ref: '#/Gate'\nGate:\n  x-internal: true\n  type: object\n",
		},
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.get(`${SKILL}/schemas/request.yml`), "Request:\n  properties:\n    name:\n      type: string\n");
	assert.deepEqual(result.referenced, {});
});

test("strips a quarantined file's upstream before following its refs", () => {
	const local = "ExportBase:\n  type: object\n";
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		quarantined: { [`${SKILL}/schemas/base.yml`]: { source: `${EXPORT}/base.yml`, reason: "spec bug" } },
		localFiles: { [`${SKILL}/schemas/base.yml`]: local },
		unpublished: ["agentgroup"],
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n",
			[`${EXPORT}/base.yml`]: [
				"ExportBase:",
				"  type: object",
				"  properties:",
				"    group:",
				"      x-internal: true",
				"      $ref: '../../../agentgroup/components/schemas/group.yml#/Group'",
				"",
			].join("\n"),
			"specs/v1/agentgroup/components/schemas/group.yml": "Group:\n  type: object\n",
		},
	});
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.referenced, {});
});

test("keeps a quarantined referenced file's local copy but still follows its upstream refs", () => {
	const local = "ExportBase:\n  properties:\n    http:\n      $ref: './http.yml#/Http'\n";
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		quarantined: { [`${SKILL}/schemas/base.yml`]: { source: `${EXPORT}/base.yml`, reason: "spec bug" } },
		localFiles: { [`${SKILL}/schemas/base.yml`]: local },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n",
			[`${EXPORT}/base.yml`]: `${local}    broken:\n      type: [string\n`,
			[`${EXPORT}/http.yml`]: "Http:\n  type: object\n",
		},
	});
	assert.deepEqual(result.errors, []);
	assert.equal(result.files.has(`${SKILL}/schemas/base.yml`), false);
	assert.deepEqual(result.referenced, { [`${SKILL}/schemas/http.yml`]: `${EXPORT}/http.yml` });
});

test("fails when two IAS files would land on one path", () => {
	const result = plan({
		synced: {
			[`${SKILL}/schemas/a.yml`]: `${EXPORT}/a.yml`,
			[`${SKILL}/schemas/b.yml`]: `${COMMON}/b.yml`,
		},
		tree: {
			[`${EXPORT}/a.yml`]: "A:\n  $ref: './x.yml#/X'\n",
			[`${COMMON}/b.yml`]: "B:\n  $ref: './x.yml#/X'\n",
			[`${EXPORT}/x.yml`]: "X:\n  type: string\n",
			[`${COMMON}/x.yml`]: "X:\n  type: number\n",
		},
	});
	assert.match(result.errors.join("\n"), /schemas\/x\.yml: both specs\/v1\/export\/components\/schemas\/x\.yml and specs\/v1\/common\/schemas\/x\.yml land here/);
});

test("refuses to land a referenced file on an editorial one", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		editorial: { [`${SKILL}/schemas/base.yml`]: "hand-written" },
		localFiles: { [`${SKILL}/schemas/base.yml`]: "ExportBase:\n  type: object\n" },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n",
			[`${EXPORT}/base.yml`]: "ExportBase:\n  type: object\n",
		},
	});
	assert.match(result.errors.join("\n"), /base\.yml: .*base\.yml would overwrite this editorial file/);
});

test("fails on a target from an unpublished domain, but not on shared common components", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		unpublished: ["agentgroup", "common"],
		tree: {
			[`${EXPORT}/request.yml`]: [
				"Request:",
				"  allOf:",
				"    - $ref: '../../../agentgroup/components/schemas/group.yml#/Group'",
				"    - $ref: '../../../common/schemas/filter.yml#/Filter'",
				"",
			].join("\n"),
			"specs/v1/agentgroup/components/schemas/group.yml": "Group:\n  type: object\n",
			[`${COMMON}/filter.yml`]: "Filter:\n  type: object\n",
		},
	});
	const domainErrors = result.errors.filter((e) => e.includes("no dist bundle"));
	assert.equal(domainErrors.length, 1);
	assert.match(domainErrors[0], /domain 'agentgroup'/);
});

test("fails a fetched file that trips the leak lint", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: { [`${EXPORT}/request.yml`]: "Request:\n  properties:\n    _id:\n      type: boolean\n" },
	});
	assert.match(result.errors[0], /source .*request\.yml fails lint: mongoose _id leak/);
});

test("deletes a previously referenced file that nothing references any more", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		referenced: { [`${SKILL}/schemas/old.yml`]: `${EXPORT}/old.yml` },
		localFiles: { [`${SKILL}/schemas/old.yml`]: "Old:\n  type: object\n" },
		tree: { [`${EXPORT}/request.yml`]: "Request:\n  type: object\n" },
	});
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.deletes, [`${SKILL}/schemas/old.yml`]);
	assert.deepEqual(result.referenced, {});
});

test("fails when a file on disk would keep a dangling $ref, and reports unmanaged schemas", () => {
	const result = plan({
		synced: {},
		editorial: { [`${SKILL}/schemas/notes.yml`]: "hand-written" },
		localFiles: {
			[`${SKILL}/schemas/notes.yml`]: "Notes:\n  $ref: './gone.yml#/Gone'\n",
			[`${SKILL}/schemas/stray.yml`]: "Stray:\n  type: object\n",
		},
		tree: {},
	});
	assert.deepEqual(result.errors, [
		`${SKILL}/schemas/notes.yml: $ref ./gone.yml#/Gone — ${SKILL}/schemas/gone.yml is not present`,
	]);
	assert.deepEqual(result.unmanaged, [`${SKILL}/schemas/stray.yml`]);
});
