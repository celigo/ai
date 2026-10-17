import assert from "node:assert/strict";
import { test } from "node:test";
import { planSync } from "./sync-schemas.mjs";

const EXPORT = "specs/v1/export/components/schemas";
const TP = "specs/v1/tradingpartnerconnector/components/schemas";
const COMMON = "specs/v1/common/schemas";
const SKILL = "skills/exp/references";

function plan({ synced, tree, editorial = {}, quarantined = {}, referenced = {}, localFiles = {}, unpublished = [] }) {
	const ias = {
		ref: "test-ref",
		has: (path) => Object.hasOwn(tree, path),
		read: (path) => tree[path],
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

test("fails on an x-internal property in a file it would write", () => {
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n",
			[`${EXPORT}/base.yml`]: "ExportBase:\n  properties:\n    preview:\n      x-internal: true\n      type: string\n",
		},
	});
	assert.match(result.errors.join("\n"), /base\.yml .*has an x-internal property — quarantine it/);
	assert.equal(result.files.has(`${SKILL}/schemas/base.yml`), false);
});

test("keeps a quarantined referenced file's local copy but still follows its upstream refs", () => {
	const local = "ExportBase:\n  properties:\n    http:\n      $ref: './http.yml#/Http'\n";
	const result = plan({
		synced: { [`${SKILL}/schemas/request.yml`]: `${EXPORT}/request.yml` },
		quarantined: { [`${SKILL}/schemas/base.yml`]: { source: `${EXPORT}/base.yml`, reason: "x-internal" } },
		localFiles: { [`${SKILL}/schemas/base.yml`]: local },
		tree: {
			[`${EXPORT}/request.yml`]: "Request:\n  $ref: './base.yml#/ExportBase'\n",
			[`${EXPORT}/base.yml`]: `${local}    preview:\n      x-internal: true\n`,
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
