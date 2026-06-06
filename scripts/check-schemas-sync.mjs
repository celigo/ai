#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const map = JSON.parse(readFileSync(join(repoRoot, "scripts/sync-map.json"), "utf8"));

// Compare content, not line endings. The skill copies (eol=lf via .gitattributes)
// and the upstream specs can differ only by CRLF/LF depending on the checkout
// platform/autocrlf; that is not schema drift.
const normalizeEol = (s) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const pairs = [];

for (const [skillDir, specDir] of Object.entries(map.directoryMappings)) {
	const absSkillDir = join(repoRoot, skillDir);
	if (!existsSync(absSkillDir)) {
		console.error(`Skill directory missing: ${skillDir}`);
		process.exitCode = 1;
		continue;
	}
	for (const entry of readdirSync(absSkillDir)) {
		if (!entry.endsWith(".yml")) continue;
		pairs.push({
			skill: join(skillDir, entry),
			spec: join(specDir, entry),
		});
	}
}

for (const [skill, spec] of Object.entries(map.explicitPairs)) {
	pairs.push({ skill, spec });
}

const mismatches = [];
const missingSpecs = [];

for (const { skill, spec } of pairs) {
	const absSkill = join(repoRoot, skill);
	const absSpec = join(repoRoot, spec);
	if (!existsSync(absSpec)) {
		missingSpecs.push({ skill, spec });
		continue;
	}
	const skillContent = normalizeEol(readFileSync(absSkill, "utf8"));
	const specContent = normalizeEol(readFileSync(absSpec, "utf8"));
	if (skillContent !== specContent) {
		mismatches.push({ skill, spec });
	}
}

const unmappedSkillFiles = [];
for (const skillDir of Object.keys(map.directoryMappings)) {
	const absSkillDir = join(repoRoot, skillDir);
	if (!existsSync(absSkillDir)) continue;
}

const allSkillSchemaFiles = [];
function walk(dir) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (entry.name.endsWith(".yml")) allSkillSchemaFiles.push(relative(repoRoot, full));
	}
}
walk(join(repoRoot, "skills"));

const coveredSkillPaths = new Set([
	...pairs.map((p) => p.skill),
	...Object.keys(map.unmapped ?? {}),
]);

for (const path of allSkillSchemaFiles) {
	if (path.includes("/references/schemas/") && !coveredSkillPaths.has(path)) {
		unmappedSkillFiles.push(path);
	}
}

const problems = mismatches.length + missingSpecs.length + unmappedSkillFiles.length;

if (mismatches.length) {
	console.error(`\n✗ ${mismatches.length} schema file(s) out of sync with integrator-api-specs:`);
	for (const { skill, spec } of mismatches) {
		console.error(`  ${skill}`);
		console.error(`    source: ${spec}`);
	}
}

if (missingSpecs.length) {
	console.error(`\n✗ ${missingSpecs.length} skill schema(s) reference missing spec files:`);
	for (const { skill, spec } of missingSpecs) {
		console.error(`  ${skill} → ${spec} (not found)`);
	}
}

if (unmappedSkillFiles.length) {
	console.error(`\n✗ ${unmappedSkillFiles.length} skill schema file(s) have no entry in sync-map.json:`);
	for (const path of unmappedSkillFiles) {
		console.error(`  ${path}`);
	}
	console.error("  Add to directoryMappings, explicitPairs, or unmapped in scripts/sync-map.json.");
}

if (problems === 0) {
	console.log(`✓ All ${pairs.length} skill schema file(s) in sync with integrator-api-specs.`);
	process.exit(0);
}

process.exit(1);
