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
 *  - Oct 2026: the skills shipped what upstream's public bundles strip — pre-GA properties
 *    flagged `x-internal` and `x-celigo-canon` validation-decision records. The sync strips
 *    both now; this lint keeps either from shipping again, whatever the source.
 *  - Oct 2026: the synced import and transform schemas carried guidance upstream had written for
 *    Celigo's own authoring tooling — component class names, generator markers, a Python module
 *    path — along with issue-tracker keys. The sync now strips every Celigo vendor key the skills
 *    don't ship; this lint keeps the rest, and any leftover key, from shipping again.
 * This lint fails the sync before any such schema ships.
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
 *  4. Any mention of `x-internal`, `x-celigo-canon`, or another `x-celigo-*` key that isn't in
 *     PUBLIC_VENDOR_KEYS, `\u`/`\x` escapes decoded first.
 *  5. Text written for Celigo's own authoring tooling: a name with an `Agent` part that isn't in
 *     PUBLIC_AGENT_NAMES, a `$agent` generator marker, or a Python module reference (a Sphinx role
 *     such as `:mod:`, a `.py` file, or a snake_case package path through a conventional package
 *     directory such as `helpers` or `utils`).
 *  6. An issue-tracker key (`ABC-12345`, five or six digits) that isn't quoted. Quoted example
 *     ids such as `"ORD-100245"` pass, and so do ISO standard numbers.
 *
 * Usage: node scripts/lint-schemas.mjs [files...]   (default: every yml under skills/)
 * Exits non-zero when any signature matches.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The Celigo vendor keys the skills ship. The sync strips every other `x-celigo-*` key. */
export const PUBLIC_VENDOR_KEYS = [
	"x-celigo-agent",
	"x-celigo-ai-guidance",
	"x-celigo-deprecated-enum-values",
	"x-celigo-excludeAdaptorTypes",
	"x-celigo-handlebars-context",
	"x-celigo-refModel",
	"x-celigo-ui-override",
];

/** Public names with an `Agent` part: the AI agent resource's, and the User-Agent header. */
export const PUBLIC_AGENT_NAMES = [
	"aiAgent",
	"AiAgent",
	"AiAgentConfig",
	"AiAgentImport",
	"GuardrailAiAgentConfig",
	"UserAgent",
	"userAgent",
];

export const isStrippedVendorKey = (key) => key.startsWith("x-celigo-") && !PUBLIC_VENDOR_KEYS.includes(key);

const vendorSuffixes = [...PUBLIC_VENDOR_KEYS, "x-celigo-canon"].map((key) => key.slice("x-celigo-".length));

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
	{
		name: "mentions x-internal — the public bundles strip nodes flagged with it",
		regex: /x-internal/,
		escapesDecoded: true,
	},
	{
		name: "mentions x-celigo-canon — the public bundles strip these validation-decision records",
		regex: /x-celigo-canon/,
		escapesDecoded: true,
	},
	{
		name: "mentions an x-celigo-* key the skills don't ship — the sync strips all but PUBLIC_VENDOR_KEYS",
		regex: new RegExp(`x-celigo-(?!(?:${vendorSuffixes.join("|")})(?![\\w-]))[\\w-]+`),
		escapesDecoded: true,
	},
	{
		name: "internal tooling text: a name with an Agent part that isn't in PUBLIC_AGENT_NAMES",
		regex: new RegExp(`\\b(?!(?:${PUBLIC_AGENT_NAMES.join("|")})\\b)[A-Za-z_]\\w*Agent\\w*\\b`),
	},
	{
		name: "internal tooling text: a $agent generator marker",
		regex: /\$agent\b/,
	},
	{
		name: "internal tooling text: a Python module reference",
		regex: /:(?:mod|class|func|meth|attr|obj|data|exc):`|\b\w+\.py\b|\b[a-z][a-z0-9]*_[a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*\.(?:helpers|utils|services|handlers|models|prompts|pages)\.[a-z][a-z0-9_]*\b/,
	},
	{
		name: "issue-tracker key outside quotes",
		regex: /(?<!["'\w])(?!ISO-)[A-Z]{2,10}-\d{5,6}(?![\w"'-])/,
	},
];

const decodeEscapes = (text) =>
	text.replace(/\\(?:u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2}))/g, (_, u, x) => String.fromCharCode(Number.parseInt(u ?? x, 16)));

export function lintText(text) {
	const decoded = decodeEscapes(text);
	return SIGNATURES.filter((s) => s.regex.test(s.escapesDecoded ? decoded : text)).map((s) => s.name);
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
			"\nSchema leak signature(s) found. Mongoose shapes corrupt data if agents copy them,",
		);
		console.error(
			"credential-shaped examples block the Claude plugin directory listing (SECRET_IN_SCRIPT), and",
		);
		console.error(
			"internal tooling text and tracker keys must not ship in this public repo —",
		);
		console.error(
			"fix the source spec in integrator-api-specs before syncing (see scripts/sync-schemas.mjs).",
		);
		process.exit(1);
	}
	console.log(`lint-schemas: ${targets.length} file(s) clean`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
