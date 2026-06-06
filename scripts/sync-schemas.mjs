#!/usr/bin/env node
// Applies integrator-api-specs schema files into skills/<skill>/references/schemas
// per scripts/sync-map.json. This is the apply counterpart to check-schemas-sync.mjs
// (which only verifies). celigo/ai is the source of truth for skills; its bundled
// schemas are kept current with integrator-api-specs by running this script.
//
// Expects integrator-api-specs checked out at ./integrator-api-specs (same convention
// as check-schemas-sync.mjs and the check-schemas-sync workflow).
//
// Behavior per mapping type:
//   directoryMappings  — each skill <name>.yml mirrors the same-named spec file.
//                        If the spec namesake no longer exists, the skill file is an
//                        orphan (type removed upstream) and is deleted.
//   explicitPairs      — copy the mapped spec file to the (possibly renamed) skill file.
//   unmapped           — left untouched (no upstream source; see sync-map.json).
import { readFileSync, readdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const map = JSON.parse(readFileSync(join(repoRoot, "scripts/sync-map.json"), "utf8"));

let copied = 0;
const removedOrphans = [];
const missingSpecs = [];

for (const [skillDir, specDir] of Object.entries(map.directoryMappings)) {
	const absSkillDir = join(repoRoot, skillDir);
	if (!existsSync(absSkillDir)) {
		console.error(`Skill directory missing: ${skillDir}`);
		process.exitCode = 1;
		continue;
	}
	for (const entry of readdirSync(absSkillDir)) {
		if (!entry.endsWith(".yml")) continue;
		const skillRel = join(skillDir, entry);
		// explicitPairs / unmapped own these files; handle separately / leave alone.
		if (map.explicitPairs[skillRel] || (map.unmapped && map.unmapped[skillRel])) continue;
		const specRel = join(specDir, entry);
		const absSpec = join(repoRoot, specRel);
		const absSkill = join(repoRoot, skillRel);
		if (!existsSync(absSpec)) {
			rmSync(absSkill);
			removedOrphans.push({ skillRel, specRel });
			continue;
		}
		copyFileSync(absSpec, absSkill);
		copied++;
	}
}

for (const [skillRel, specRel] of Object.entries(map.explicitPairs)) {
	const absSpec = join(repoRoot, specRel);
	const absSkill = join(repoRoot, skillRel);
	if (!existsSync(absSpec)) {
		missingSpecs.push({ skillRel, specRel });
		continue;
	}
	copyFileSync(absSpec, absSkill);
	copied++;
}

if (removedOrphans.length) {
	console.log(`\nRemoved ${removedOrphans.length} orphan schema file(s) (spec source no longer exists):`);
	for (const { skillRel, specRel } of removedOrphans) {
		console.log(`  - ${skillRel}  (was: ${specRel})`);
	}
}

if (missingSpecs.length) {
	console.error(`\n✗ ${missingSpecs.length} explicitPair spec file(s) not found — fix scripts/sync-map.json:`);
	for (const { skillRel, specRel } of missingSpecs) {
		console.error(`  ${skillRel} → ${specRel}`);
	}
	process.exitCode = 1;
}

console.log(`\n✓ Applied ${copied} schema file(s) from integrator-api-specs.`);
console.log("  Run `node scripts/check-schemas-sync.mjs` to verify.");
