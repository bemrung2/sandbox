#!/usr/bin/env node
/*
 * Wraps src/app.html into a complete, standalone index.html and copies the
 * module tree next to it.
 *
 * Why this exists: src/app.html is written for the Claude Artifact viewer,
 * which supplies the document shell itself. Serving that file as-is on plain
 * static hosting means no <head> and, crucially, no viewport meta — so a
 * phone lays the page out at 980px and shrinks it to fit. This build adds the
 * shell that only the artifact platform was providing.
 *
 * Usage: node build.js   (no dependencies)
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "index.html");

function section(source, name) {
  const open = `<!--${name}-->`;
  const close = `<!--/${name}-->`;
  const start = source.indexOf(open);
  const end = source.indexOf(close);
  if (start === -1 || end === -1) {
    throw new Error(`src/app.html is missing its ${open} ... ${close} markers`);
  }
  return source.slice(start + open.length, end).trim();
}

/* every file the page loads, at the path it loads it from */
function assets(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(path.join(SRC, dir || ""))) {
    const rel = dir ? dir + "/" + name : name;
    const full = path.join(SRC, rel);
    if (fs.statSync(full).isDirectory()) out.push(...assets(rel));
    else if (/\.(js|css)$/.test(name)) out.push(rel);
  }
  return out;
}

const source = fs.readFileSync(path.join(SRC, "app.html"), "utf8");
const head = section(source, "head");
const body = section(source, "body");

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F6F7F9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101115" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="BEMLAB">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
${head}
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");

/* the modules sit beside index.html, at the same relative paths */
const copied = [];
for (const rel of assets("")) {
  const to = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(SRC, rel), to);
  copied.push(rel);
}

// The one thing this build exists to guarantee.
if (!/name="viewport"/.test(html)) {
  console.error("build failed: no viewport meta in the output");
  process.exit(1);
}
console.log(`built index.html + ${copied.length} module files — viewport meta present`);
console.log(copied.map((f) => "  " + f).join("\n"));
