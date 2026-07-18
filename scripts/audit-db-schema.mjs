#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const baselinePath = path.join(root, "sql", "00_baseline.sql");
const srcDir = path.join(root, "src");
const args = new Set(process.argv.slice(2));
const requireDb = args.has("--require-db");
const noDb = args.has("--no-db");

const ignoredTables = new Set([
  "company-logos", // Supabase Storage bucket, not a database table
]);

const filterMethods = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
  "not",
  "order",
];

function usage() {
  console.log(`Usage: node scripts/audit-db-schema.mjs [--require-db] [--no-db]

Compares database columns expected by src/** Supabase calls against:
  1) sql/00_baseline.sql
  2) live database via psql when PGHOST/PGUSER/PGDATABASE are available
`);
}

if (args.has("--help") || args.has("-h")) {
  usage();
  process.exit(0);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", ".output"].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const rel = path.relative(root, full).replaceAll(path.sep, "/");
      if (rel === "src/routeTree.gen.ts") continue;
      if (rel === "src/integrations/supabase/types.ts") continue;
      out.push(full);
    }
  }
  return out;
}

function isIdentifier(value) {
  return /^[a-z_][a-z0-9_]*$/i.test(value);
}

function addExpected(map, table, column, ref) {
  if (!table || !column) return;
  if (ignoredTables.has(table) || table.includes("-")) return;
  const cleanColumn = column.replace(/^"|"$/g, "").trim();
  if (!isIdentifier(table) || !isIdentifier(cleanColumn)) return;
  if (["count", "head"].includes(cleanColumn)) return;

  if (!map.has(table)) map.set(table, new Map());
  const tableMap = map.get(table);
  if (!tableMap.has(cleanColumn)) tableMap.set(cleanColumn, new Set());
  tableMap.get(cleanColumn).add(ref);
}

function splitTopLevel(input) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const prev = input[i - 1];
    if (quote) {
      current += ch;
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (["'", '"', "`"].includes(ch)) {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelectColumns(selectText) {
  const columns = [];
  for (const raw of splitTopLevel(selectText)) {
    let item = raw.trim();
    if (!item || item === "*") continue;
    if (item.includes("(")) continue; // embedded relation or aggregate, not a base-table column
    if (item.includes(":")) {
      item = item.split(":").slice(1).join(":").trim();
    }
    item = item.replace(/^"|"$/g, "").replace(/^'|'$/g, "").trim();
    if (item.includes(" ")) item = item.split(/\s+/)[0];
    if (isIdentifier(item)) columns.push(item);
  }
  return columns;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (["'", '"', "`"].includes(ch)) {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findStatementEnd(text, startIndex) {
  let parens = 0;
  let braces = 0;
  let brackets = 0;
  let quote = null;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (["'", '"', "`"].includes(ch)) {
      quote = ch;
      continue;
    }
    if (ch === "(") parens += 1;
    if (ch === ")") parens = Math.max(0, parens - 1);
    if (ch === "{") braces += 1;
    if (ch === "}") braces = Math.max(0, braces - 1);
    if (ch === "[") brackets += 1;
    if (ch === "]") brackets = Math.max(0, brackets - 1);
    if (ch === ";" && parens === 0 && braces === 0 && brackets === 0) return i + 1;
  }
  return Math.min(text.length, startIndex + 3500);
}

function parseObjectKeys(objectText) {
  const keys = [];
  for (const part of splitTopLevel(objectText)) {
    const match = part.match(/^\s*(?:["']([^"']+)["']|([a-zA-Z_$][\w$]*))\s*:/);
    if (!match) continue;
    const key = match[1] ?? match[2];
    if (isIdentifier(key)) keys.push(key);
  }
  return keys;
}

function isStorageFrom(content, index) {
  const before = content.slice(Math.max(0, index - 100), index);
  return /\.storage\s*$/.test(before) || /\.storage\s*\.\s*$/.test(before);
}

function collectExpectedColumns() {
  const expected = new Map();
  const files = walk(srcDir);

  for (const file of files) {
    const rel = path.relative(root, file).replaceAll(path.sep, "/");
    const content = readFileSync(file, "utf8");
    const tableVars = new Map();
    const fromMatches = [...content.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)].filter(
      (m) => !isStorageFrom(content, m.index ?? 0),
    );

    for (let i = 0; i < fromMatches.length; i += 1) {
      const match = fromMatches[i];
      const table = match[1];
      if (ignoredTables.has(table) || table.includes("-")) continue;

      const start = match.index ?? 0;
      const statementEnd = findStatementEnd(content, start);
      const chain = content.slice(start, statementEnd);
      const line = content.slice(0, start).split(/\r?\n/).length;
      const ref = `${rel}:${line}`;

      const prefix = content.slice(Math.max(0, start - 140), start);
      const variableMatch = prefix.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*$/);
      if (variableMatch) {
        if (!tableVars.has(variableMatch[1])) tableVars.set(variableMatch[1], new Set());
        tableVars.get(variableMatch[1]).add(table);
      }

      for (const selectMatch of chain.matchAll(/\.select\(\s*([`"'])([\s\S]*?)\1/g)) {
        for (const column of parseSelectColumns(selectMatch[2])) addExpected(expected, table, column, ref);
      }

      const filterRegex = new RegExp(`\\.(?:${filterMethods.join("|")})\\(\\s*[\"']([^\"']+)[\"']`, "g");
      for (const filterMatch of chain.matchAll(filterRegex)) {
        addExpected(expected, table, filterMatch[1], ref);
      }

      for (const writeMatch of chain.matchAll(/\.(?:insert|update|upsert)\(\s*\{/g)) {
        const openIndex = writeMatch.index + writeMatch[0].lastIndexOf("{");
        const closeIndex = findMatchingBrace(chain, openIndex);
        if (closeIndex === -1) continue;
        const objectText = chain.slice(openIndex + 1, closeIndex);
        for (const key of parseObjectKeys(objectText)) addExpected(expected, table, key, ref);
      }
    }

    for (const [variable, tables] of tableVars.entries()) {
      if (tables.size !== 1) continue;
      const [table] = [...tables];
      const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const variableFilterRegex = new RegExp(
        `\\b${escaped}\\s*=\\s*${escaped}\\s*\\.\\s*(?:${filterMethods.join("|")})\\(\\s*[\"']([^\"']+)[\"']|\\b${escaped}\\s*\\.\\s*(?:${filterMethods.join("|")})\\(\\s*[\"']([^\"']+)[\"']`,
        "g",
      );
      for (const variableFilterMatch of content.matchAll(variableFilterRegex)) {
        const column = variableFilterMatch[1] ?? variableFilterMatch[2];
        const line = content.slice(0, variableFilterMatch.index ?? 0).split(/\r?\n/).length;
        addExpected(expected, table, column, `${rel}:${line}`);
      }
    }
  }

  return expected;
}

function parseBaselineSchema() {
  const schema = new Map();
  if (!existsSync(baselinePath)) return schema;
  const sql = readFileSync(baselinePath, "utf8");
  const tableRegex = /CREATE\s+TABLE\s+public\.([a-zA-Z_][\w]*)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(tableRegex)) {
    const table = match[1];
    const columns = new Set();
    for (const line of match[2].split(/\r?\n/)) {
      const trimmed = line.trim().replace(/,$/, "");
      if (!trimmed) continue;
      if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE)\b/i.test(trimmed)) continue;
      const colMatch = trimmed.match(/^"?([a-zA-Z_][\w]*)"?\s+/);
      if (colMatch) columns.add(colMatch[1]);
    }
    schema.set(table, columns);
  }
  return schema;
}

function hasDbEnv() {
  return Boolean(process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE);
}

function readLiveSchema() {
  if (noDb) return { skipped: true, reason: "--no-db supplied", schema: new Map() };
  if (!hasDbEnv()) {
    return {
      skipped: true,
      reason: "PGHOST/PGUSER/PGDATABASE are not set",
      schema: new Map(),
    };
  }

  const query = `select table_name, column_name
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position`;
  const output = execFileSync("psql", ["-At", "-F", "\t", "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const schema = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [table, column] = line.split("\t");
    if (!schema.has(table)) schema.set(table, new Set());
    schema.get(table).add(column);
  }
  return { skipped: false, reason: "", schema };
}

function diffExpected(expected, actual) {
  const missing = [];
  for (const [table, columns] of [...expected.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const actualColumns = actual.get(table);
    if (!actualColumns) {
      missing.push({ table, column: "*table missing*", refs: [...new Set([...columns.values()].flatMap((s) => [...s]))].slice(0, 4) });
      continue;
    }
    for (const [column, refs] of [...columns.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!actualColumns.has(column)) missing.push({ table, column, refs: [...refs].slice(0, 4) });
    }
  }
  return missing;
}

function formatMissing(title, missing) {
  console.log(`\n${title}`);
  if (missing.length === 0) {
    console.log("  ✅ No missing expected columns found.");
    return;
  }
  for (const item of missing) {
    console.log(`  ❌ ${item.table}.${item.column}`);
    for (const ref of item.refs) console.log(`     ↳ ${ref}`);
  }
}

function main() {
  const expected = collectExpectedColumns();
  const baseline = parseBaselineSchema();
  const live = readLiveSchema();

  const expectedColumnCount = [...expected.values()].reduce((sum, table) => sum + table.size, 0);
  console.log("Database schema audit");
  console.log("=====================");
  console.log(`Expected from code: ${expected.size} tables, ${expectedColumnCount} table columns/usages`);
  console.log(`Baseline tables:     ${baseline.size}`);
  if (live.skipped) console.log(`Live database:       skipped (${live.reason})`);
  else console.log(`Live database:       ${live.schema.size} public tables`);

  const missingInBaseline = diffExpected(expected, baseline);
  formatMissing("Code → sql/00_baseline.sql", missingInBaseline);

  let missingInLive = [];
  if (!live.skipped) {
    missingInLive = diffExpected(expected, live.schema);
    formatMissing("Code → live database", missingInLive);
  } else if (requireDb) {
    console.error("\n❌ Live database audit is required but database environment variables are missing.");
  }

  if (missingInBaseline.length > 0 || missingInLive.length > 0 || (requireDb && live.skipped)) {
    process.exitCode = 1;
  } else {
    console.log("\n✅ Schema audit passed.");
  }
}

main();