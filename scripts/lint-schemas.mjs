#!/usr/bin/env node
/**
 * Lint skill reference schemas for known upstream leak patterns.
 *
 * The one incident this guards against (Aug 2026): integrator-api-specs' generated flow
 * schema leaked Mongoose internals, describing responseMapping's `fields`/`lists` as
 * type-wrapped objects (`fields: {type: [...]}`) instead of bare arrays. The API accepts
 * that wrapper and silently corrupts the step's mappings to `fields: [null]`. The spec was
 * fixed (integrator-api-specs#184), but any regeneration could leak the same class of bug
 * again — this lint fails the sync before a poisoned schema ships to agents.
 *
 * Signatures detected (text-level, dependency-free):
 *  1. A schema property literally named `type` declared as an array — Mongoose's
 *     `{type: [...]}` field wrapper serialized into OpenAPI.
 *  2. `_id` declared as `type: boolean` — Mongoose's subdocument `_id: false` option
 *     serialized as if it were a data field.
 *
 * Usage: node scripts/lint-schemas.mjs [files...]   (default: every yml under skills/)
 * Exits non-zero when any signature matches.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SIGNATURES = [
	{
		name: "mongoose type-wrapper (property named `type` holding an array)",
		// properties:\n  type:\n    type: array   (indentation-anchored)
		regex: /^(\s+)properties:\n(\s+)type:\n\2\s+type:\s*array\b/m,
	},
	{
		name: "mongoose _id leak (`_id` typed boolean)",
		regex: /^(\s+)_id:\n\1\s+type:\s*boolean\b/m,
	},
];

export function lintText(text) {
	return SIGNATURES.filter((s) => s.regex.test(text)).map((s) => s.name);
}

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) yield* walk(full);
		else if (/\.ya?ml$/.test(entry)) yield full;
	}
}

function main() {
	const files = process.argv.slice(2);
	let targets;
	if (files.length > 0) {
		targets = files;
	} else {
		// Repo-wide runs skip quarantined files: they are known-bad copies whose upstream fix
		// is tracked in sync-map.json — the lint's job is stopping NEW leaks from shipping.
		const mapUrl = new URL("sync-map.json", import.meta.url);
		const { quarantined = {} } = JSON.parse(readFileSync(mapUrl, "utf8"));
		const skip = new Set(Object.keys(quarantined));
		targets = [...walk("skills")].filter((f) => {
			const rel = f.replaceAll("\\", "/");
			if (!skip.has(rel)) return true;
			console.warn(`SKIP ${rel} (quarantined: ${quarantined[rel].reason})`);
			return false;
		});
	}
	let failed = false;
	for (const file of targets) {
		for (const hit of lintText(readFileSync(file, "utf8"))) {
			console.error(`LEAK ${file}: ${hit}`);
			failed = true;
		}
	}
	if (failed) {
		console.error(
			"\nSchema leak signature(s) found. These shapes corrupt data if agents copy them —",
		);
		console.error(
			"fix the source spec in integrator-api-specs before syncing (see scripts/sync-schemas.mjs).",
		);
		process.exit(1);
	}
	console.log(`lint-schemas: ${targets.length} file(s) clean`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
