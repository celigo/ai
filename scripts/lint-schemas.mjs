#!/usr/bin/env node
/**
 * Lint skill reference schemas for known upstream leak patterns.
 *
 * The incidents this guards against:
 *  - Aug 2026: integrator-api-specs' generated flow schema leaked Mongoose internals,
 *    describing responseMapping's `fields`/`lists` as type-wrapped objects
 *    (`fields: {type: [...]}`) instead of bare arrays. The API accepts that wrapper and
 *    silently corrupts the step's mappings to `fields: [null]`. The spec was fixed
 *    (integrator-api-specs#184), but any regeneration could leak the same class of bug.
 *  - Oct 2026: the Claude plugin directory blocked the plugin (SECRET_IN_SCRIPT) on fake
 *    but credential-shaped examples synced from upstream — a quoted hex "Secret Access
 *    Key", a real-format Google client ID, a jwt.io JWT, PEM key headers, and OAuth form
 *    bodies and labels that put a literal value after a token or secret key name.
 * This lint fails the sync before either kind of schema ships.
 *
 * Signatures detected (text-level, dependency-free):
 *  1. A schema property literally named `type` declared as an array — Mongoose's
 *     `{type: [...]}` field wrapper serialized into OpenAPI.
 *  2. `_id` declared as `type: boolean` — Mongoose's subdocument `_id: false` option
 *     serialized as if it were a data field.
 *  3. Credential-shaped example values. Shapes that pass: `<placeholder>` values, ALL_CAPS
 *     placeholder names, `{{{iClient.…}}}` references, a JWT header followed by
 *     `.EXAMPLEpayload.EXAMPLEsignature`, and EXAMPLE-marked vendor secrets (except AWS
 *     key IDs, which match however they are marked).
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
	{
		name: "credential-shaped example: JWT with a payload segment",
		regex: /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}/,
	},
	{
		name: "credential-shaped example: PEM private-key header",
		regex: /BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY/,
	},
	{
		name: "credential-shaped example: Google OAuth client ID",
		regex: /\b\d{6,}-[0-9a-z]{32}\.apps\.googleusercontent\.com\b/,
	},
	{
		name: "credential-shaped example: Basic auth header carrying base64 credentials",
		regex: /\bBasic [A-Za-z0-9+/]{16,}={0,2}/,
	},
	{
		name: "credential-shaped example: vendor key prefix without an EXAMPLE marker",
		regex: /\b(?:[rs]k_(?:live|test)_|whsec_|gh[oprsu]_|xox[abposr]-|sk-ant-|sk-proj-|AIza)(?![\w-]*EXAMPLE)[\w-]{16,}/,
	},
	{
		name: "credential-shaped example: AWS access key ID",
		regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
	},
	{
		name: "credential-shaped example: Amazon MWS auth token",
		regex: /\bamzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-/,
	},
	{
		name: "credential-shaped example: Salesforce access token",
		regex: /\b00D[0-9A-Za-z]{12,15}![0-9A-Za-z._]{4,}/,
	},
	{
		name: "credential-shaped example: literal value in a form-encoded credential parameter",
		regex: /\b(?:password|passwd|client_secret|api_?key|access_token|refresh_token|token)=(?![<{]|[A-Z][A-Z0-9_]*(?![a-z0-9]))[^&\s"'`,\]]{3,}/,
	},
	{
		name: "credential-shaped example: quoted literal after a credential label",
		regex: /\b(?:[Pp]assword|[Ss]ecret|[Tt]oken|[Aa]pi_?[Kk]ey)\s*[:=]\s*["'](?![<{$*]|[A-Z][A-Z0-9_]*["'])[^"'\n]{6,}["']/,
	},
	{
		name: "credential-shaped example: 32-45 character key quoted on a line that names a secret",
		regex: /secret.*["'](?![0-9a-zA-Z]*EXAMPLE)[0-9a-zA-Z]{32,45}["']/i,
	},
	{
		name: "credential-shaped example: opaque literal assigned to a credential key",
		regex: /"\w*(?:password|passwd|secret|token|api_?key)"\s*:\s*"(?![^"]*EXAMPLE)(?=[^"]*\d)(?=[^"]*[a-z])[a-z0-9+/=]{12,}"/i,
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
			"\nSchema leak signature(s) found. Mongoose shapes corrupt data if agents copy them, and",
		);
		console.error(
			"credential-shaped examples block the Claude plugin directory listing (SECRET_IN_SCRIPT) —",
		);
		console.error(
			"fix the source spec in integrator-api-specs before syncing (see scripts/sync-schemas.mjs).",
		);
		process.exit(1);
	}
	console.log(`lint-schemas: ${targets.length} file(s) clean`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
