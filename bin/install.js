#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const VERSION = require('../package.json').version;
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const AGENTS_SRC = path.join(PLUGIN_ROOT, 'agents');
const CLAUDE_MD_SRC = path.join(PLUGIN_ROOT, 'docs', 'CLAUDE.md');

const MARKER_START = '<!-- OMCS:START -->';
const MARKER_END = '<!-- OMCS:END -->';
const MARKER_VERSION = `<!-- OMCS:VERSION:${VERSION} -->`;

// ── CLI colours ──────────────────────────────────────────────────────────────
const c = {
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

const ok  = (msg) => console.log(`  ${c.green('✓')} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow('!')} ${msg}`);
const err  = (msg) => console.log(`  ${c.red('✗')} ${msg}`);
const h    = (msg) => console.log(`\n${c.bold(msg)}`);

// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function readFileOrEmpty(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function stripOmcsBlock(content) {
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (start === -1 || end === -1) return content;
  const before = content.slice(0, start).trimEnd();
  const after = content.slice(end + MARKER_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

function wrapWithMarkers(innerContent) {
  return `${MARKER_START}\n${MARKER_VERSION}\n\n${innerContent.trim()}\n\n${MARKER_END}`;
}

function mergeClaudeMd(targetPath, newContent) {
  const existing = readFileOrEmpty(targetPath);
  const wrapped = wrapWithMarkers(newContent);

  if (!existing) {
    // Fresh install
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, wrapped + '\n');
    return 'installed';
  }

  if (existing.includes(MARKER_START)) {
    // Update existing OMCS block, preserve user content outside it
    const userContent = stripOmcsBlock(existing).trim();
    const merged = userContent
      ? `${wrapped}\n\n<!-- User content -->\n${userContent}\n`
      : `${wrapped}\n`;
    fs.writeFileSync(targetPath, merged);
    return 'updated';
  }

  // Existing CLAUDE.md without markers — append OMCS block
  fs.writeFileSync(targetPath, `${existing.trimEnd()}\n\n${wrapped}\n`);
  return 'appended';
}

function installAgents(agentsTargetDir) {
  fs.mkdirSync(agentsTargetDir, { recursive: true });
  const files = fs.readdirSync(AGENTS_SRC).filter((f) => f.endsWith('.md'));
  const results = [];

  for (const file of files) {
    const src = path.join(AGENTS_SRC, file);
    const dest = path.join(agentsTargetDir, file);
    const existed = fs.existsSync(dest);
    fs.copyFileSync(src, dest);
    results.push({ file, existed });
  }
  return results;
}

// ── Commands ─────────────────────────────────────────────────────────────────
async function cmdInstall(args) {
  h('oh-my-claudecode-slim installer');
  console.log(c.dim(`  v${VERSION}\n`));

  let scope;
  if (args.includes('--global') || args.includes('-g')) {
    scope = 'global';
  } else if (args.includes('--local') || args.includes('--project') || args.includes('-l')) {
    scope = 'local';
  } else {
    console.log('  Install scope:');
    console.log('    1) Global  — ~/.claude  (all Claude Code sessions)');
    console.log('    2) Local   — ./.claude  (this project only)');
    console.log('');
    const choice = await ask('  Choice [1/2]: ');
    scope = choice === '2' ? 'local' : 'global';
  }

  const configDir = resolveClaudeConfigDir();
  const claudeMdTarget = scope === 'global'
    ? path.join(configDir, 'CLAUDE.md')
    : path.join(process.cwd(), 'CLAUDE.md');
  const agentsTarget = scope === 'global'
    ? path.join(configDir, 'agents')
    : path.join(process.cwd(), '.claude', 'agents');

  h(`Installing (${scope})`);

  // CLAUDE.md
  const newContent = fs.readFileSync(CLAUDE_MD_SRC, 'utf8');
  const result = mergeClaudeMd(claudeMdTarget, newContent);
  ok(`CLAUDE.md ${result} → ${claudeMdTarget}`);

  // Agents
  const agentResults = installAgents(agentsTarget);
  for (const { file, existed } of agentResults) {
    ok(`Agent ${existed ? 'updated' : 'installed'}: ${file}`);
  }

  h('Done!');
  console.log('');
  console.log('  Restart Claude Code and try:');
  console.log(c.dim('    "use explorer to find all TypeScript files in src/"'));
  console.log(c.dim('    "ask oracle to review this architecture decision"'));
  console.log(c.dim('    "have fixer write unit tests for the login function"'));
  console.log('');
}

async function cmdUninstall(args) {
  h('oh-my-claudecode-slim uninstaller');

  let scope;
  if (args.includes('--global') || args.includes('-g')) scope = 'global';
  else if (args.includes('--local') || args.includes('--project')) scope = 'local';
  else {
    const choice = await ask('  Remove from [1] global (~/.claude) or [2] local (./.claude)? [1/2]: ');
    scope = choice === '2' ? 'local' : 'global';
  }

  const configDir = resolveClaudeConfigDir();
  const claudeMdTarget = scope === 'global'
    ? path.join(configDir, 'CLAUDE.md')
    : path.join(process.cwd(), 'CLAUDE.md');
  const agentsTarget = scope === 'global'
    ? path.join(configDir, 'agents')
    : path.join(process.cwd(), '.claude', 'agents');

  h(`Removing (${scope})`);

  // Strip OMCS block from CLAUDE.md
  if (fs.existsSync(claudeMdTarget)) {
    const content = fs.readFileSync(claudeMdTarget, 'utf8');
    if (content.includes(MARKER_START)) {
      const stripped = stripOmcsBlock(content).trim();
      if (stripped) {
        fs.writeFileSync(claudeMdTarget, stripped + '\n');
        ok('Removed OMCS block from CLAUDE.md (user content preserved)');
      } else {
        fs.unlinkSync(claudeMdTarget);
        ok('Removed CLAUDE.md (was only OMCS content)');
      }
    } else {
      warn('CLAUDE.md has no OMCS markers — nothing removed');
    }
  } else {
    warn('CLAUDE.md not found at target location');
  }

  // Remove agents
  const agentFiles = ['explorer.md', 'oracle.md', 'fixer.md', 'librarian.md', 'designer.md', 'council.md'];
  for (const file of agentFiles) {
    const dest = path.join(agentsTarget, file);
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
      ok(`Removed agent: ${file}`);
    }
  }

  h('Done!');
  console.log('');
}

function cmdHelp() {
  console.log('');
  console.log(c.bold('oh-my-claudecode-slim'));
  console.log(c.dim(`  v${VERSION} — Lightweight multi-agent orchestration for Claude Code`));
  console.log('');
  console.log('Usage:');
  console.log('  npx oh-my-claudecode-slim install [--global | --local]');
  console.log('  npx oh-my-claudecode-slim uninstall [--global | --local]');
  console.log('');
  console.log('Commands:');
  console.log('  install    Install CLAUDE.md and agent definitions');
  console.log('  uninstall  Remove installed CLAUDE.md block and agent files');
  console.log('  help       Show this help message');
  console.log('');
  console.log('Flags:');
  console.log('  --global   Install to ~/.claude (all Claude Code sessions)');
  console.log('  --local    Install to ./.claude (current project only)');
  console.log('');
}

// ── Entry ────────────────────────────────────────────────────────────────────
const [, , command, ...rest] = process.argv;

(async () => {
  switch (command) {
    case 'install':   await cmdInstall(rest); break;
    case 'uninstall': await cmdUninstall(rest); break;
    case 'help':
    case '--help':
    case '-h':        cmdHelp(); break;
    default:
      if (!command) {
        cmdHelp();
      } else {
        err(`Unknown command: ${command}`);
        cmdHelp();
        process.exit(1);
      }
  }
})();
