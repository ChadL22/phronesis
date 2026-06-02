#!/usr/bin/env node
/**
 * fix-encoding.js — repairs UTF-8 mojibake in Phronesis content JSON.
 *
 * Cause: the CMS used to read files with atob() (Latin-1) but write them with
 * UTF-8, so every publish added one corruption layer to smart punctuation
 * (em/en dashes, curly quotes, apostrophes, accents). This walks every string
 * in each JSON file and peels those layers back to the original characters.
 *
 * Safe: only strings that are valid stacked-UTF-8 byte sequences are touched;
 * clean text and legitimate accents (café, résumé) are left exactly as-is.
 *
 * Run from the project root:
 *   node scripts/fix-encoding.js            # repair in place
 *   node scripts/fix-encoding.js --check    # report only, write nothing
 *
 * Review with `git diff` before committing.
 */
const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(__dirname, '..', 'content');
const CHECK_ONLY = process.argv.includes('--check');

// Peel stacked Latin-1↔UTF-8 corruption back to the original text.
function fixText(str) {
  let cur = str;
  for (let pass = 0; pass < 12; pass++) {
    let allByteRange = true;
    for (let i = 0; i < cur.length; i++) {
      if (cur.charCodeAt(i) > 0xFF) { allByteRange = false; break; }
    }
    if (!allByteRange) break;                      // contains real Unicode → clean/done
    const decoded = Buffer.from(cur, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) break;         // not a valid UTF-8 layer → stop
    if (decoded === cur) break;                    // pure ASCII / stable → stop
    cur = decoded;
  }
  return cur;
}

let fileFixed = 0;
const samples = [];

function walk(node) {
  if (typeof node === 'string') {
    const fixed = fixText(node);
    if (fixed !== node) {
      fileFixed++;
      if (samples.length < 8) samples.push({ before: node.slice(0, 60), after: fixed.slice(0, 60) });
    }
    return fixed;
  }
  if (Array.isArray(node)) return node.map(walk);
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) out[k] = walk(node[k]);
    return out;
  }
  return node;
}

const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.json'));
let grandTotal = 0;
for (const file of files) {
  const full = path.join(CONTENT_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { console.log(`  SKIP ${file} (not valid JSON: ${e.message})`); continue; }

  fileFixed = 0;
  const repaired = walk(data);
  grandTotal += fileFixed;

  if (fileFixed > 0) {
    console.log(`  ${file}: ${fileFixed} string(s) repaired`);
    if (!CHECK_ONLY) {
      fs.writeFileSync(full, JSON.stringify(repaired, null, 2) + '\n', 'utf8');
    }
  } else {
    console.log(`  ${file}: clean`);
  }
}

console.log('');
if (samples.length) {
  console.log('Examples of repairs:');
  for (const s of samples) console.log(`  - "${s.before}…"\n    → "${s.after}…"`);
  console.log('');
}
console.log(CHECK_ONLY
  ? `${grandTotal} string(s) would be repaired (no files written — --check mode).`
  : `Done. ${grandTotal} string(s) repaired across ${files.length} file(s).`);
