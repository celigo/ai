#!/usr/bin/env bash
# Build the ChatGPT + Codex directory package (OpenAI Plugins Directory).
#
# OpenAI's plugin portal takes a ZIP, not a repo reference. The ZIP root holds
# the portable manifest (`plugin.json`, Agent Plugins format with the
# `extensions.com.openai` listing, review and publication fields), the MCP
# server config (`mcp.json`), the skills, the icon and the license. This
# script stages those from the repo and zips them, so the package that goes
# to the portal is always built from a commit rather than edited by hand.
#
#   scripts/build-openai-plugin.sh            -> dist/celigo-plugin-<version>.zip
#   scripts/build-openai-plugin.sh <outdir>   -> <outdir>/celigo-plugin-<version>.zip
#
# Requires `jq` and `zip`. Upload the result on the plugin's page in the portal
# (Upload new version). Server and tool changes do not need a new ZIP: OpenAI
# rescans the hosted MCP server itself. Metadata and skills changes do.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-"$root/dist"}
manifest="$root/.openai-plugin/plugin.json"
mcp="$root/.openai-plugin/mcp.json"

for tool in jq zip; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool is required" >&2; exit 1; }
done

version=$(jq -r '.version' "$manifest")

# Every plugin manifest in this repo carries the same version, so the number
# means the same thing in every directory. Refuse to build a package that
# would break that.
for other in .cursor-plugin/plugin.json .claude-plugin/plugin.json .codex-plugin/plugin.json .grok-plugin/plugin.json; do
  v=$(jq -r '.version' "$root/$other")
  if [ "$v" != "$version" ]; then
    echo "error: version mismatch: $other is $v, .openai-plugin/plugin.json is $version" >&2
    exit 1
  fi
done

# Submission limits the portal enforces on the listing and review fields
# (developers.openai.com/plugins/deploy/submission). Catch them here rather
# than after the upload.
check() { # check <jq-expression-returning-true-or-false> <message>
  if [ "$(jq -r "$1" "$manifest")" != "true" ]; then
    echo "error: $2" >&2
    exit 1
  fi
}
iface='.extensions["com.openai"].interface'
review='.extensions["com.openai"].review'
check "$iface.displayName | length <= 30" "displayName must be at most 30 characters"
check "$iface.shortDescription | length <= 30" "shortDescription must be at most 30 characters"
check "$iface.longDescription | length <= 4000" "longDescription must be at most 4000 characters"
check "$iface.developerName | length <= 80" "developerName must be at most 80 characters"
check "($iface.capabilities | length <= 20) and ([$iface.capabilities[] | length <= 120] | all)" "at most 20 capabilities of at most 120 characters each"
check "([$iface.defaultPrompt[]] | length <= 3) and ([$iface.defaultPrompt[] | length <= 128] | all)" "at most 3 starter prompts of at most 128 characters each"
check "$review.test_cases.positive | length == 5" "exactly five positive test cases are required for MCP review"
check "$review.test_cases.negative | length == 3" "exactly three negative test cases are required for MCP review"
check "[$iface.websiteURL, $iface.supportURL, $iface.privacyPolicyURL, $iface.termsOfServiceURL] | all(type == \"string\" and startswith(\"https://\"))" "websiteURL, supportURL, privacyPolicyURL and termsOfServiceURL are required and must be https URLs"

onboarding=$(jq -r '.extensions["com.openai"].onboardingSkill' "$manifest")
[ -f "$root/${onboarding#./}" ] || { echo "error: onboardingSkill $onboarding is not in the repo" >&2; exit 1; }

server_count=$(jq -r '.mcpServers | length' "$mcp")
[ "$server_count" = "1" ] || { echo "error: mcp.json must declare exactly one server (the portal connects one per plugin)" >&2; exit 1; }

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

cp "$manifest" "$stage/plugin.json"
cp "$mcp" "$stage/mcp.json"
cp -R "$root/skills" "$stage/skills"
mkdir -p "$stage/assets"
cp "$root/assets/icon.svg" "$stage/assets/icon.svg"
cp "$root/LICENSE" "$stage/LICENSE"
find "$stage" -name '.DS_Store' -delete

mkdir -p "$out"
zip_path="$out/celigo-plugin-$version.zip"
rm -f "$zip_path"
(cd "$stage" && zip -q -r -X "$zip_path" plugin.json mcp.json skills assets LICENSE)

skill_count=$(find "$stage/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')
echo "built $zip_path ($skill_count skills, version $version)"
