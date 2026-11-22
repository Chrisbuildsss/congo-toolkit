// `gocongo skills`: installs /congo and /congo-brainstorm for the
// person's own AI: Claude Code (~/.claude/skills), Codex (~/.agents/skills) or Cursor (~/.cursor/skills).
// Existing copies are moved to a dated backup beside the skills folder first, never deleted.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SKILLS = ['congo', 'congo-brainstorm'];
const RETIRED_SKILLS = ['congo-redesign', 'congo-ideas', 'congo-compete'];
export const TOOLS = {
  claude: {label: 'Claude Code', root: '.claude'},
  codex: {label: 'Codex', root: '.agents', marker: '.codex'},
  cursor: {label: 'Cursor', root: '.cursor'},
};
export const SKILLS_USAGE = `Usage: gocongo skills [--claude] [--codex] [--cursor] [--all] [--json]

Installs the Congo skills for your own AI:
/congo             Build or redesign a frontend
/congo-brainstorm  Brainstorm what to build using the Congo Library
  --claude   Claude Code (~/.claude/skills)
  --codex    Codex (~/.agents/skills)
  --cursor   Cursor (~/.cursor/skills)
  --all      All three
With no option, it installs for the tools found on this computer (Claude Code when none is found).
Earlier copies and retired Congo skills are kept in a dated backup (for example ~/.claude/skills-backup).`;

export function skillsSource(env = process.env) {
  for (const dir of [env.CONGO_SKILLS_SOURCE, path.join(here, '..', 'skills'), path.join(here, '..', 'packages', 'cli', 'skills')]) {
    if (dir && SKILLS.every(name => fs.existsSync(path.join(dir, name, 'SKILL.md')))) return path.resolve(dir);
  }
  return null;
}

const stamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Which tools to install for: those asked for, else those present, else Claude Code. */
export function chooseTools(flags, home = os.homedir()) {
  const asked = flags.all ? Object.keys(TOOLS) : Object.keys(TOOLS).filter(tool => flags[tool]);
  if (asked.length) return asked;
  const found = Object.entries(TOOLS).filter(([, tool]) => fs.existsSync(path.join(home, tool.root)) || (tool.marker && fs.existsSync(path.join(home, tool.marker)))).map(([name]) => name);
  return found.length ? found : ['claude'];
}

export function installSkills({tools, home = os.homedir(), source = skillsSource(), now = new Date()} = {}) {
  if (!source) throw Error('The Congo skills are missing from this gocongo install. Run it with: npx gocongo skills');
  const results = [];
  for (const tool of tools) {
    const spec = TOOLS[tool];
    if (!spec) throw Error(`Unknown tool ${tool}. Use --claude, --codex or --cursor.`);
    const root = path.join(home, spec.root), skills = path.join(root, 'skills'), backups = path.join(root, 'skills-backup');
    fs.mkdirSync(skills, {recursive: true});
    const row = {tool, label: spec.label, skills, installed: [], backedUp: []};
    const backupSkill = (name, target) => {
      if (!fs.lstatSync(target, {throwIfNoEntry: false})) return;
      // Move the folder or link itself so existing customizations stay recoverable.
      fs.mkdirSync(backups, {recursive: true});
      let backup = path.join(backups, `${name}-${stamp(now)}`), n = 1;
      while (fs.lstatSync(backup, {throwIfNoEntry: false})) backup = path.join(backups, `${name}-${stamp(now)}-${++n}`);
      fs.renameSync(target, backup);
      row.backedUp.push(backup);
    };
    for (const name of SKILLS) {
      const target = path.join(skills, name);
      backupSkill(name, target);
      fs.cpSync(path.join(source, name), target, {recursive: true, errorOnExist: true, force: false});
      row.installed.push(target);
    }
    for (const name of RETIRED_SKILLS) backupSkill(name, path.join(skills, name));
    results.push(row);
  }
  return results;
}

export async function installSkillsCommand(argv = []) {
  const flags = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => [a.slice(2), true]));
  if (flags.help) { console.log(SKILLS_USAGE); return; }
  const unknown = Object.keys(flags).filter(flag => !['claude', 'codex', 'cursor', 'all', 'json'].includes(flag));
  if (unknown.length || argv.some(a => !a.startsWith('--'))) throw Error(SKILLS_USAGE);
  const home = process.env.CONGO_SKILLS_HOME ? path.resolve(process.env.CONGO_SKILLS_HOME) : os.homedir();
  const results = installSkills({tools: chooseTools(flags, home), home});
  if (flags.json || !process.stdout.isTTY) { console.log(JSON.stringify({skills: SKILLS, results}, null, 2)); return; }
  for (const row of results) {
    console.log(`${row.label}: installed /${SKILLS.join(', /')} in ${row.skills}`);
    if (row.backedUp.length) console.log(`  Earlier copies moved to ${path.dirname(row.backedUp[0])}`);
  }
  console.log('Start a new chat in your AI, then try /congo. Browsing and reference pictures are free; the code needs the Congo Library ($30/month).');
}
