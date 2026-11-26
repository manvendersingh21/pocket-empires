#!/usr/bin/env node
/**
 * Pocket Empires — Deterministic Static & Architectural Invariant Linter
 *
 * Enforces the High-Trust Agent Engineering Playbook (Inverted Trust Pyramid: Layer 2)
 * with zero external dependencies and actionable root-cause remediation messages:
 *   [RULE_ID] file:line — <what failed>. Fix: <actionable remediation & approved API/pattern>
 *
 * Rules enforced:
 *   1. ARCH_ENGINE_PURE
 *   2. ARCH_CLIENT_SERVER_BOUNDARY
 *   3. DEVVIT_WEBVIEW_CSP
 *   4. REPO_ISOLATION
 *   5. ZERO_TOFU_GLYPHS
 *   6. NO_SLOP_COMMENTS_OR_TIMING_HACKS
 *   7. NO_RAW_USE_EFFECT_IN_PRODUCT
 *   8. DEVVIT_PRODUCTION_CONTRACT
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;

/**
 * Recursively collects files under `dirAbs` sorted deterministically by POSIX relative path.
 * @param {string} dirAbs
 * @returns {string[]}
 */
function walkFiles(dirAbs) {
  if (!existsSync(dirAbs)) return [];
  const results = [];
  const entries = readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const full = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Converts an absolute file path inside the repo to a normalized forward-slash relative path.
 * @param {string} absPath
 * @returns {string}
 */
function toRelPosix(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

/**
 * Computes 1-based line number for a character offset in `text`.
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineAtOffset(text, index) {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Strips JS/TS line and block comments while preserving every newline and string/template
 * literal verbatim (including nested `${...}` expressions inside template literals), and
 * extracts comment spans with exact 1-based line numbers.
 *
 * @param {string} source
 * @returns {{ stripped: string, comments: Array<{ line: number, text: string }> }}
 */
function analyzeCommentsAndCode(source) {
  const chars = Array.from(source);
  const out = [...chars];
  /** @type {Array<{ line: number, text: string }>} */
  const comments = [];
  let line = 1;
  let i = 0;
  /** Stack tracking template literal `${ ... }` brace nesting depths */
  const templateBraceStack = [];

  const advance = () => {
    if (source[i] === '\n') line++;
    i++;
  };

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    // Resume template literal when closing `${ ... }`
    if (templateBraceStack.length > 0) {
      const topIdx = templateBraceStack.length - 1;
      if (ch === '{') {
        templateBraceStack[topIdx]++;
        advance();
        continue;
      }
      if (ch === '}') {
        templateBraceStack[topIdx]--;
        if (templateBraceStack[topIdx] === 0) {
          templateBraceStack.pop();
          advance();
          // Continue scanning inside the enclosing template literal
          while (i < source.length) {
            if (source[i] === '\\') {
              advance();
              if (i < source.length) advance();
              continue;
            }
            if (source[i] === '$' && source[i + 1] === '{') {
              advance();
              advance();
              templateBraceStack.push(1);
              break;
            }
            if (source[i] === '`') {
              advance();
              break;
            }
            advance();
          }
          continue;
        }
        advance();
        continue;
      }
    }

    // Single-line comment //
    if (ch === '/' && next === '/') {
      const startLine = line;
      const startIdx = i;
      while (i < source.length && source[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      comments.push({ line: startLine, text: source.slice(startIdx, i) });
      continue;
    }

    // Multi-line block comment /* ... */
    if (ch === '/' && next === '*') {
      const startLine = line;
      const startIdx = i;
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') {
          line++;
        } else {
          out[i] = ' ';
        }
        i++;
      }
      if (i < source.length) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
      }
      comments.push({ line: startLine, text: source.slice(startIdx, i) });
      continue;
    }

    // Single or double quoted string literal
    if (ch === "'" || ch === '"') {
      const quote = ch;
      advance();
      while (i < source.length && source[i] !== quote && source[i] !== '\n') {
        if (source[i] === '\\') {
          advance();
          if (i < source.length) advance();
          continue;
        }
        advance();
      }
      if (i < source.length && source[i] === quote) advance();
      continue;
    }

    // Template literal `...`
    if (ch === '`') {
      advance();
      while (i < source.length) {
        if (source[i] === '\\') {
          advance();
          if (i < source.length) advance();
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          advance();
          advance();
          templateBraceStack.push(1);
          break;
        }
        if (source[i] === '`') {
          advance();
          break;
        }
        advance();
      }
      continue;
    }

    advance();
  }

  return { stripped: out.join(''), comments };
}

/**
 * Extracts all static `import ... from`, side-effect `import '...'`, `export ... from`,
 * dynamic `import('...')`, and `require('...')` module specifiers with 1-based line numbers.
 *
 * @param {string} strippedCode
 * @returns {Array<{ specifier: string, line: number }>}
 */
function extractModuleImports(strippedCode) {
  /** @type {Array<{ specifier: string, line: number }>} */
  const found = [];

  // 1. Static import/export ... from 'specifier' (supports multi-line braces/type imports)
  const fromRe = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\bfrom\s*(['"])([^'"]+)\1/g;
  let m;
  while ((m = fromRe.exec(strippedCode)) !== null) {
    const specOffset = m.index + m[0].lastIndexOf(m[2]);
    found.push({ specifier: m[2], line: lineAtOffset(strippedCode, specOffset) });
  }

  // 2. Side-effect imports: import 'specifier';
  const sideEffectRe = /(?:^|[;\n])\s*import\s*(['"])([^'"]+)\1/g;
  while ((m = sideEffectRe.exec(strippedCode)) !== null) {
    const specOffset = m.index + m[0].lastIndexOf(m[2]);
    found.push({ specifier: m[2], line: lineAtOffset(strippedCode, specOffset) });
  }

  // 3. Dynamic import('specifier') or require('specifier')
  const dynamicRe = /\b(?:import|require)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  while ((m = dynamicRe.exec(strippedCode)) !== null) {
    const specOffset = m.index + m[0].lastIndexOf(m[2]);
    found.push({ specifier: m[2], line: lineAtOffset(strippedCode, specOffset) });
  }

  return found;
}

/**
 * Resolves a relative import specifier from `importerAbs` to a repo-relative POSIX path.
 * Returns `null` for bare package specifiers.
 *
 * @param {string} importerAbs
 * @param {string} specifier
 * @returns {string | null}
 */
function resolveRelativeTarget(importerAbs, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('/')) {
    return null;
  }
  const targetAbs = specifier.startsWith('/')
    ? path.join(REPO_ROOT, specifier)
    : path.resolve(path.dirname(importerAbs), specifier);
  return toRelPosix(targetAbs);
}

/**
 * Checks whether a line in `src/client/*.tsx` is strictly part of an external Reddit
 * markdown comment / clipboard payload concatenated onto `formatChronicleComment(...)`
 * (never rendered into WebView JSX or 2D Canvas).
 *
 * @param {string[]} lines
 * @param {number} zeroBasedIdx
 * @returns {boolean}
 */
function isExternalRedditCommentMarkdownLine(lines, zeroBasedIdx) {
  const windowStart = Math.max(0, zeroBasedIdx - 3);
  const windowEnd = Math.min(lines.length - 1, zeroBasedIdx + 2);
  const block = lines.slice(windowStart, windowEnd + 1).join('\n');
  const line = lines[zeroBasedIdx] ?? '';
  return (
    block.includes('formatChronicleComment(') &&
    !/<[A-Za-z]/.test(line) &&
    line.includes('Challenge Code:')
  );
}

/**
 * Extracts all call-expression argument slices for `fnName(...)` (excluding `function fnName(...)`).
 *
 * @param {string} strippedCode
 * @param {string} fnName
 * @returns {Array<{ argsText: string, line: number }>}
 */
function extractFunctionCalls(strippedCode, fnName) {
  /** @type {Array<{ argsText: string, line: number }>} */
  const calls = [];
  const callRe = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
  let m;
  while ((m = callRe.exec(strippedCode)) !== null) {
    const before = strippedCode.slice(Math.max(0, m.index - 16), m.index);
    if (/\bfunction\s+$/.test(before)) continue;

    const openParenIdx = m.index + m[0].length - 1;
    let depth = 1;
    let cursor = openParenIdx + 1;
    while (cursor < strippedCode.length && depth > 0) {
      const c = strippedCode[cursor];
      if (c === "'" || c === '"' || c === '`') {
        const q = c;
        cursor++;
        while (cursor < strippedCode.length && strippedCode[cursor] !== q) {
          if (strippedCode[cursor] === '\\') cursor += 2;
          else cursor++;
        }
        cursor++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      cursor++;
    }
    const argsText = strippedCode.slice(openParenIdx + 1, Math.max(openParenIdx + 1, cursor - 1));
    calls.push({
      argsText,
      line: lineAtOffset(strippedCode, m.index),
    });
  }
  return calls;
}

/**
 * Runs all 7 architectural & static invariant checks across the repository.
 * @returns {{ violations: Array<{ ruleId: string, file: string, line: number, failed: string, fix: string }>, stats: Record<string, number> }}
 */
export function runInvariantChecks() {
  /** @type {Array<{ ruleId: string, file: string, line: number, failed: string, fix: string }>} */
  const violations = [];
  const stats = {
    ARCH_ENGINE_PURE: 0,
    ARCH_CLIENT_SERVER_BOUNDARY: 0,
    DEVVIT_WEBVIEW_CSP: 0,
    REPO_ISOLATION: 0,
    ZERO_TOFU_GLYPHS: 0,
    NO_SLOP_COMMENTS_OR_TIMING_HACKS: 0,
    NO_RAW_USE_EFFECT_IN_PRODUCT: 0,
    DEVVIT_PRODUCTION_CONTRACT: 0,
  };

  const report = (ruleId, file, line, failed, fix) => {
    violations.push({ ruleId, file, line, failed, fix });
  };

  const allSrcFiles = walkFiles(path.join(REPO_ROOT, 'src')).filter((f) =>
    SOURCE_EXTENSIONS.has(path.extname(f)),
  );

  // Cache parsed source + comment analysis per file
  /** @type {Map<string, { rel: string, raw: string, stripped: string, comments: Array<{ line: number, text: string }>, imports: Array<{ specifier: string, line: number }> }>} */
  const parsedFiles = new Map();
  for (const absFile of allSrcFiles) {
    const rel = toRelPosix(absFile);
    const raw = readFileSync(absFile, 'utf8');
    const { stripped, comments } = analyzeCommentsAndCode(raw);
    const imports = extractModuleImports(stripped);
    parsedFiles.set(absFile, { rel, raw, stripped, comments, imports });
  }

  // -------------------------------------------------------------------------
  // 1. ARCH_ENGINE_PURE
  //    src/types/* and src/engine/* cannot import from src/client/, src/ui/,
  //    src/rendering/, src/ai/, src/server/, react, or @devvit/*.
  // -------------------------------------------------------------------------
  const forbiddenEngineLayers = [
    'src/client/',
    'src/ui/',
    'src/rendering/',
    'src/ai/',
    'src/server/',
  ];
  for (const [absFile, info] of parsedFiles) {
    if (!info.rel.startsWith('src/types/') && !info.rel.startsWith('src/engine/')) continue;
    stats.ARCH_ENGINE_PURE++;

    for (const imp of info.imports) {
      const resolvedRel = resolveRelativeTarget(absFile, imp.specifier);
      const hitsForbiddenLayer =
        resolvedRel !== null &&
        forbiddenEngineLayers.some((prefix) => resolvedRel.startsWith(prefix));
      const hitsForbiddenPkg =
        imp.specifier === 'react' ||
        imp.specifier.startsWith('react/') ||
        imp.specifier === 'react-dom' ||
        imp.specifier.startsWith('react-dom/') ||
        imp.specifier.startsWith('@devvit/');

      if (hitsForbiddenLayer || hitsForbiddenPkg) {
        report(
          'ARCH_ENGINE_PURE',
          info.rel,
          imp.line,
          `Forbidden import "${imp.specifier}" in pure engine/types module`,
          'Keep src/types/* and src/engine/* 100% pure and headless-testable; move UI, rendering, AI, or Devvit platform glue to src/ui/, src/rendering/, src/ai/, or src/client/ and exchange plain data defined in src/types/rts.ts.',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. ARCH_CLIENT_SERVER_BOUNDARY & 3. DEVVIT_WEBVIEW_CSP
  //    src/client/*, src/ui/*, src/rendering/*, src/ai/* cannot import from
  //    src/server/ or @devvit/web/server, and cannot call external fetch("http...").
  // -------------------------------------------------------------------------
  const clientSidePrefixes = ['src/client/', 'src/ui/', 'src/rendering/', 'src/ai/'];
  for (const [absFile, info] of parsedFiles) {
    if (!clientSidePrefixes.some((p) => info.rel.startsWith(p))) continue;
    stats.ARCH_CLIENT_SERVER_BOUNDARY++;
    stats.DEVVIT_WEBVIEW_CSP++;

    for (const imp of info.imports) {
      const resolvedRel = resolveRelativeTarget(absFile, imp.specifier);
      const hitsServerDir = resolvedRel !== null && resolvedRel.startsWith('src/server/');
      const hitsServerPkg =
        imp.specifier === '@devvit/web/server' ||
        imp.specifier.startsWith('@devvit/web/server/') ||
        imp.specifier.startsWith('@devvit/analytics/server');

      if (hitsServerDir || hitsServerPkg) {
        report(
          'ARCH_CLIENT_SERVER_BOUNDARY',
          info.rel,
          imp.line,
          `Client/WebView module imports server-only module "${imp.specifier}"`,
          'Never import src/server/* or @devvit/web/server into browser bundles; share pure DTO types via src/shared/messages.ts and invoke server routes via relative fetch("/api/...").',
        );
      }
    }

    // DEVVIT_WEBVIEW_CSP: Ban fetch("http://..."), fetch('https://...'), fetch(`https://...`), or protocol-relative fetch('//...')
    const externalFetchRe = /\bfetch\s*\(\s*(['"`])((?:https?:)?\/\/[^'"`\s)]*)/gi;
    let fm;
    while ((fm = externalFetchRe.exec(info.stripped)) !== null) {
      const line = lineAtOffset(info.stripped, fm.index);
      report(
        'DEVVIT_WEBVIEW_CSP',
        info.rel,
        line,
        `External network call fetch(${fm[1]}${fm[2]}...${fm[1]}) violates Devvit WebView Content-Security-Policy`,
        'Route all client HTTP requests through same-origin "/api/*" endpoints handled in src/server/index.ts, or use local deterministic inference in src/ai/hybridAdvisor.ts.',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 4. REPO_ISOLATION
  //    Zero occurrences of `firebase` or `BuildHybridAI` across src/, README.md, GAME_SPEC.md.
  // -------------------------------------------------------------------------
  const isolationTargets = [
    ...walkFiles(path.join(REPO_ROOT, 'src')),
    path.join(REPO_ROOT, 'README.md'),
    path.join(REPO_ROOT, 'GAME_SPEC.md'),
  ].filter((f) => existsSync(f));

  const repoIsolationRe = /firebase|BuildHybridAI/i;
  for (const absFile of isolationTargets) {
    stats.REPO_ISOLATION++;
    const rel = toRelPosix(absFile);
    const lines = readFileSync(absFile, 'utf8').split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const match = repoIsolationRe.exec(lines[idx]);
      if (match) {
        report(
          'REPO_ISOLATION',
          rel,
          idx + 1,
          `Forbidden external dependency/brand reference "${match[0]}" found`,
          'Keep Pocket Empires strictly isolated on Devvit Web; use Devvit Redis in src/server/empire.ts for persistence and src/ai/hybridAdvisor.ts for local Royal War-Council AI.',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. ZERO_TOFU_GLYPHS
  //    Zero raw Unicode pictograph emojis (\p{Extended_Pictographic}) in JSX/Canvas
  //    render modules (src/ui/*.tsx, src/rendering/*.tsx, src/client/*.tsx) or
  //    addCallout(...) strings in src/engine/sim.ts.
  // -------------------------------------------------------------------------
  const renderTsxPrefixes = ['src/ui/', 'src/rendering/', 'src/client/'];
  for (const [, info] of parsedFiles) {
    if (
      info.rel.endsWith('.tsx') &&
      renderTsxPrefixes.some((prefix) => info.rel.startsWith(prefix))
    ) {
      stats.ZERO_TOFU_GLYPHS++;
      const strippedLines = info.stripped.split('\n');
      const rawLines = info.raw.split('\n');
      for (let idx = 0; idx < strippedLines.length; idx++) {
        const match = EXTENDED_PICTOGRAPHIC_RE.exec(strippedLines[idx]);
        if (!match) continue;
        if (
          info.rel.startsWith('src/client/') &&
          isExternalRedditCommentMarkdownLine(rawLines, idx)
        ) {
          continue;
        }
        report(
          'ZERO_TOFU_GLYPHS',
          info.rel,
          idx + 1,
          `Raw Unicode pictograph emoji "${match[0]}" in JSX/Canvas render module`,
          'Replace raw Unicode emojis with crisp SVG heraldry via <EmpireIcon /> or <CivCrest /> from src/ui/EmpireIcons.tsx (and sanitize dynamic strings with stripEmoji()).',
        );
      }
    }

    if (info.rel === 'src/engine/sim.ts') {
      stats.ZERO_TOFU_GLYPHS++;
      const callouts = extractFunctionCalls(info.stripped, 'addCallout');
      for (const call of callouts) {
        const match = EXTENDED_PICTOGRAPHIC_RE.exec(call.argsText);
        if (match) {
          const extraLines =
            call.argsText.slice(0, match.index).split('\n').length - 1;
          report(
            'ZERO_TOFU_GLYPHS',
            info.rel,
            call.line + extraLines,
            `Raw Unicode pictograph emoji "${match[0]}" inside addCallout(...) Canvas text`,
            'Use plain ASCII callout text in src/engine/sim.ts addCallout(...) and render iconography via <EmpireIcon /> or <CivCrest /> from src/ui/EmpireIcons.tsx.',
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. NO_SLOP_COMMENTS_OR_TIMING_HACKS
  //    Ban // HACK, // WORKAROUND, // DO NOT DELETE, // FIXME across src/,
  //    and ban setTimeout( across src/engine/, src/rendering/, src/client/,
  //    and src/ui/ (only src/ai/hybridAdvisor.ts bounded inference timeout is permitted).
  // -------------------------------------------------------------------------
  const slopCommentRe = /\b(HACK|WORKAROUND|FIXME)\b|DO\s+NOT\s+DELETE/i;

  for (const [, info] of parsedFiles) {
    stats.NO_SLOP_COMMENTS_OR_TIMING_HACKS++;

    for (const c of info.comments) {
      const slopMatch = slopCommentRe.exec(c.text);
      if (slopMatch) {
        const preview = c.text.replace(/\s+/g, ' ').trim().slice(0, 72);
        report(
          'NO_SLOP_COMMENTS_OR_TIMING_HACKS',
          info.rel,
          c.line,
          `Banned "${slopMatch[0].toUpperCase()}" comment (${preview})`,
          'Eliminate the underlying architectural or state bug rather than leaving fragile workaround comments, and lock the behavior down with a deterministic test in tests/.',
        );
      }
    }

    const setTimeoutRe = /\bsetTimeout\s*\(/g;
    let tm;
    while ((tm = setTimeoutRe.exec(info.stripped)) !== null) {
      const line = lineAtOffset(info.stripped, tm.index);
      const rawLine = info.raw.split('\n')[line - 1] ?? '';

      // Only bounded local-model inference timeout in src/ai/hybridAdvisor.ts is permitted
      if (
        info.rel === 'src/ai/hybridAdvisor.ts' &&
        /resolve\s*\(\s*fallback\s*\)\s*,\s*ms/.test(rawLine)
      ) {
        continue;
      }

      report(
        'NO_SLOP_COMMENTS_OR_TIMING_HACKS',
        info.rel,
        line,
        `Banned imperative timer setTimeout(...) in ${info.rel}`,
        'Advance simulation timers deterministically via stepGame(state, dt) in src/engine/sim.ts and drive visual animations via requestAnimationFrame timestamps in src/rendering/IsoCanvas.tsx or CSS animations (only bounded inference timeout in src/ai/hybridAdvisor.ts is permitted).',
      );
    }
  }

  // -------------------------------------------------------------------------
  // 7. NO_RAW_USE_EFFECT_IN_PRODUCT
  //    Scans product UI & app entry files (src/ui/*.tsx, src/client/App.tsx,
  //    src/client/splash.tsx) and forbids importing or calling useEffect directly.
  // -------------------------------------------------------------------------
  const noRawUseEffectFix =
    'Direct useEffect is prohibited in product UI components. Compute derived state synchronously during render, or use vetted lifecycle primitives in src/client/hooks.ts (useMountTask, useFixedSimulationLoop, useWindowKeydown).';

  for (const [, info] of parsedFiles) {
    const isProductUiFile =
      (info.rel.startsWith('src/ui/') && info.rel.endsWith('.tsx')) ||
      info.rel === 'src/client/App.tsx' ||
      info.rel === 'src/client/splash.tsx';
    if (!isProductUiFile) continue;

    stats.NO_RAW_USE_EFFECT_IN_PRODUCT++;
    const reportedLines = new Set();

    // 1. Direct import of useEffect from 'react'
    const reactNamedImportRe =
      /\bimport\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*(['"])react\2/g;
    let im;
    while ((im = reactNamedImportRe.exec(info.stripped)) !== null) {
      const clause = im[1];
      const ueMatch = /\buseEffect\b/.exec(clause);
      if (ueMatch) {
        const clauseStart = im.index + im[0].indexOf(clause);
        const line = lineAtOffset(info.stripped, clauseStart + ueMatch.index);
        if (!reportedLines.has(line)) {
          reportedLines.add(line);
          report(
            'NO_RAW_USE_EFFECT_IN_PRODUCT',
            info.rel,
            line,
            'Forbidden direct useEffect import in product UI module',
            noRawUseEffectFix,
          );
        }
      }
    }

    // 2. Direct call or React namespace / destructured access to useEffect
    const useEffectUsageRe =
      /\b(?:React\s*\.\s*useEffect\b|useEffect\s*\()|\{[^}\n]*\buseEffect\b[^}\n]*\}\s*=\s*React\b/g;
    let um;
    while ((um = useEffectUsageRe.exec(info.stripped)) !== null) {
      const line = lineAtOffset(info.stripped, um.index);
      if (!reportedLines.has(line)) {
        reportedLines.add(line);
        report(
          'NO_RAW_USE_EFFECT_IN_PRODUCT',
          info.rel,
          line,
          'Forbidden direct useEffect(...) usage in product UI module',
          noRawUseEffectFix,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. DEVVIT_PRODUCTION_CONTRACT
  //    Verifies devvit.json entrypoints, permissions, trigger/menu endpoints in
  //    src/server/index.ts, and client+engine typecheck wiring in package.json.
  // -------------------------------------------------------------------------
  const devvitPath = path.join(REPO_ROOT, 'devvit.json');
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const serverIndexPath = path.join(REPO_ROOT, 'src', 'server', 'index.ts');
  stats.DEVVIT_PRODUCTION_CONTRACT = 3;

  if (!existsSync(devvitPath)) {
    report(
      'DEVVIT_PRODUCTION_CONTRACT',
      'devvit.json',
      1,
      'Missing devvit.json deployment manifest',
      'Restore devvit.json configured with splash.html, game.html, server index.cjs, and redis/reddit permissions.',
    );
  } else {
    try {
      const devvit = JSON.parse(readFileSync(devvitPath, 'utf8'));
      const serverSrc = existsSync(serverIndexPath) ? readFileSync(serverIndexPath, 'utf8') : '';
      if (devvit?.post?.entrypoints?.default?.entry !== 'splash.html') {
        report(
          'DEVVIT_PRODUCTION_CONTRACT',
          'devvit.json',
          1,
          'post.entrypoints.default.entry must be "splash.html"',
          'Set post.entrypoints.default.entry to "splash.html" in devvit.json.',
        );
      }
      if (devvit?.post?.entrypoints?.game?.entry !== 'game.html') {
        report(
          'DEVVIT_PRODUCTION_CONTRACT',
          'devvit.json',
          1,
          'post.entrypoints.game.entry must be "game.html"',
          'Set post.entrypoints.game.entry to "game.html" in devvit.json.',
        );
      }
      if (devvit?.server?.entry !== 'index.cjs') {
        report(
          'DEVVIT_PRODUCTION_CONTRACT',
          'devvit.json',
          1,
          'server.entry must be "index.cjs"',
          'Set server.entry to "index.cjs" matching npm run build:server output.',
        );
      }
      if (devvit?.permissions?.redis !== true || devvit?.permissions?.reddit !== true) {
        report(
          'DEVVIT_PRODUCTION_CONTRACT',
          'devvit.json',
          1,
          'permissions.redis and permissions.reddit must both be true',
          'Enable redis and reddit permissions in devvit.json for leaderboards, comments, and user flair.',
        );
      }
      const endpoints = [];
      if (Array.isArray(devvit?.menu?.items)) {
        for (const item of devvit.menu.items) {
          if (typeof item?.endpoint === 'string') endpoints.push(item.endpoint);
        }
      }
      if (devvit?.triggers && typeof devvit.triggers === 'object') {
        for (const ep of Object.values(devvit.triggers)) {
          if (typeof ep === 'string') endpoints.push(ep);
        }
      }
      for (const ep of endpoints) {
        if (!serverSrc.includes(ep)) {
          report(
            'DEVVIT_PRODUCTION_CONTRACT',
            'src/server/index.ts',
            1,
            `Devvit endpoint "${ep}" declared in devvit.json is missing from src/server/index.ts`,
            `Implement route handler for "${ep}" in src/server/index.ts.`,
          );
        }
      }
    } catch (err) {
      report(
        'DEVVIT_PRODUCTION_CONTRACT',
        'devvit.json',
        1,
        `Invalid JSON in devvit.json: ${String(err)}`,
        'Fix JSON syntax in devvit.json.',
      );
    }
  }

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const tc = pkg?.scripts?.typecheck;
      if (typeof tc !== 'string' || !tc.includes('src/client/tsconfig.json')) {
        report(
          'DEVVIT_PRODUCTION_CONTRACT',
          'package.json',
          1,
          'package.json scripts.typecheck must check src/client/tsconfig.json',
          'Define "typecheck": "tsc --noEmit && tsc -p src/client/tsconfig.json --noEmit" in package.json.',
        );
      }
    } catch (err) {
      report(
        'DEVVIT_PRODUCTION_CONTRACT',
        'package.json',
        1,
        `Invalid JSON in package.json: ${String(err)}`,
        'Fix JSON syntax in package.json.',
      );
    }
  }

  return { violations, stats };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { violations, stats } = runInvariantChecks();

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`[${v.ruleId}] ${v.file}:${v.line} — ${v.failed}. Fix: ${v.fix}`);
    }
    console.error(
      `\ncheck-invariants FAILED with ${violations.length} architectural/static invariant violation(s).`,
    );
    process.exit(1);
  }

  console.log('================================================================================');
  console.log(' POCKET EMPIRES — STATIC & ARCHITECTURAL INVARIANT CHECKS');
  console.log('================================================================================');
  console.log('Rule ID                           | Scope Checked | Violations | Status');
  console.log('----------------------------------+---------------+------------+-------');
  for (const [ruleId, count] of Object.entries(stats)) {
    console.log(
      `${ruleId.padEnd(33)} | ${String(count).padStart(7)} files | ${String(0).padStart(10)} | PASS`,
    );
  }
  console.log('================================================================================');
  console.log(`check-invariants PASS — 0 violations across all ${Object.keys(stats).length} High-Trust Playbook rules!`);
}
