import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { lintText, PUBLIC_AGENT_NAMES, PUBLIC_VENDOR_KEYS } from "./lint-schemas.mjs";

test("lintText passes a clean schema with a placeholder credential", () => {
	assert.deepEqual(lintText('Creds:\n  type: object\n  examples: ["<access-key-id>"]\n'), []);
});

test("lintText flags x-internal and x-celigo-canon, escaped spellings included", () => {
	assert.deepEqual(lintText("A:\n  x-internal: true\n"), ["mentions x-internal — the public bundles strip nodes flagged with it"]);
	assert.deepEqual(lintText('A:\n  kind: { "x\\u002Dceligo-canon": { decision: open } }\n'), [
		"mentions x-celigo-canon — the public bundles strip these validation-decision records",
	]);
});

test("lintText flags an x-celigo-* key the skills don't ship, escaped spellings included", () => {
	const name = "mentions an x-celigo-* key the skills don't ship — the sync strips all but PUBLIC_VENDOR_KEYS";
	assert.deepEqual(lintText("A:\n  x-celigo-hints:\n    - handlebars\n"), [name]);
	assert.deepEqual(lintText('A:\n  kind: { "x\\u002Dceligo-hints": [sql] }\n'), [name]);
	assert.deepEqual(lintText("A:\n  x-celigo-ai-guidance-v2: text\n"), [name]);
	assert.deepEqual(lintText("A:\n  x-celigo-agents:\n    - sql\n"), [name]);
});

test("lintText passes the vendor keys the skills ship", () => {
	for (const key of PUBLIC_VENDOR_KEYS) assert.deepEqual(lintText(`A:\n  ${key}: kept\n`), [], key);
	assert.deepEqual(lintText("A:\n  description: Strip every x-celigo-* key but the public ones.\n"), []);
});

test("lintText passes x-celigo-agent with every capability tag in use", () => {
	const tags = ["handlebars", "sql", "graphql", "filter", "mapping", "transform", "script", "lookup", "async_helper", "settings_form", "file_definition_rules"];
	assert.deepEqual(lintText(`A:\n  x-celigo-agent:\n${tags.map((tag) => `    - ${tag}\n`).join("")}`), []);
});

test("lintText flags text written for internal authoring tooling", () => {
	for (const name of ["WidgetsAgent", "ReportBuilderAgent", "widgetAgentState", "_widgetAgent"]) {
		assert.deepEqual(
			lintText(`A:\n  description: The ${name} writes both copies on every save.\n`),
			["internal tooling text: a name with an Agent part that isn't in PUBLIC_AGENT_NAMES"],
			name,
		);
	}
	assert.deepEqual(lintText("A:\n  description: Emit a ``$agent: widget`` marker at this field.\n"), [
		"internal tooling text: a $agent generator marker",
	]);
	for (const ref of [":mod:`acme.widgets`", ":func:`build_widget`", "acme_kit/widgets/builder.py", "acme_kit.utils.text_tools"]) {
		assert.deepEqual(lintText(`A:\n  description: see ${ref}\n`), ["internal tooling text: a Python module reference"], ref);
	}
});

test("lintText passes ordinary agent vocabulary, the public Agent names and record paths", () => {
	const text = [
		"An AI agent step; a Celigo Agent; the Agent tab; $agentId; _agentId; Phase 2",
		"settings.ai_agents.enabled; previous_page.full_response.next_page; dfs.core.windows.net; python",
		...PUBLIC_AGENT_NAMES,
	].join("; ");
	assert.deepEqual(lintText(`A:\n  description: ${text}\n`), []);
});

test("every copy quarantined for failing this lint still fails it", () => {
	const { quarantined = {} } = JSON.parse(readFileSync(new URL("sync-map.json", import.meta.url), "utf8"));
	for (const [file, { reason }] of Object.entries(quarantined)) {
		if (!reason.includes("lint-schemas.mjs")) continue;
		const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
		assert.notDeepEqual(lintText(text), [], `${file} lints clean: lift its quarantine and re-sync`);
	}
});

test("lintText flags issue-tracker keys in prose and comments, not quoted example ids", () => {
	for (const text of ["every child `Inactive` (ABC-123456).", "# util (XYZ-20987) — until then", "branch DEV-QA-12345"]) {
		assert.deepEqual(lintText(`A:\n  description: ${text}\n`), ["issue-tracker key outside quotes"], text);
	}
	const examples = [
		'examples: ["ORD-100245"]',
		'examples: ["Order ORD-100245"]',
		`examples: ['{"orderId":"ORD-100245","total":129.99}']`,
		'External_ID__c = "CUST-12345"',
		"ISO-8601, ISO-27001, SHA-256, RFC-5988, SO-1043, APP-9876543210",
	];
	for (const text of examples) assert.deepEqual(lintText(`A:\n  ${text}\n`), [], text);
});

test("lintText flags the Mongoose type-wrapper leak", () => {
	const text = "Mapping:\n  properties:\n    type:\n      type: array\n";
	assert.deepEqual(lintText(text), ["mongoose type-wrapper (property named `type` holding an array)"]);
});
