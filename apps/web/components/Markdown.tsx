import { Fragment, type ReactNode } from "react";

/**
 * A small, safe markdown renderer for compiled specs.
 *
 * The input is LLM-written, so it is parsed into React elements and never handed to dangerouslySetInnerHTML:
 * anything the parser does not understand ends up as text, which is the only failure mode we can afford.
 * The subset is exactly what `src/engine/compile.ts` and the section prompts actually emit — headings (with
 * stable anchors), paragraphs, bold/italic/code, fenced code, one level of nested lists, GFM tables (the
 * decision ledger is one), blockquote banners, links, and horizontal rules — plus two spec-specific things:
 *
 * - `<!-- sheet-echo … -->` blocks. Every compiled section carries one; they are machine bookkeeping and
 *   tens of lines long, so HTML comments are stripped before parsing rather than rendered.
 * - `⟨src: d:payments_in_app⟩` trace markers. They are the spec's provenance and worth keeping, but as raw
 *   text they shred every sentence — rendered as a small muted chip, or dropped when `showTraces` is false.
 *
 * Styling is left entirely to the caller: the tree uses semantic elements plus a few `data-` hooks
 * (`data-trace`, `data-tone`, `data-table`), so a CSS Module can style it through the wrapper class.
 */

export interface Heading {
  level: number;
  text: string;
  id: string;
}

type Tone = "info" | "warn" | "danger";

interface ListItem {
  text: string;
  children?: Extract<Block, { kind: "list" }>;
}

type Block =
  | { kind: "heading"; level: number; text: string; id: string }
  | { kind: "para"; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "table"; header: string[]; align: (("left" | "center" | "right") | null)[]; rows: string[][] }
  | { kind: "quote"; tone: Tone; blocks: Block[] }
  | { kind: "hr" };

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const HR = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s{0,3}>/;

/** Machine bookkeeping the reader must never see; also the only HTML our specs contain. */
export function stripComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, "");
}

function slugify(text: string, used: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/⟨[^⟩]*⟩/g, "")
      .replace(/[`*_[\]()]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

/** The banners compile.ts stamps on a draft or rejected spec deserve their colour, not a grey quote. */
function toneOf(text: string): Tone {
  const t = text.toLowerCase();
  if (t.includes("did not pass") || t.includes("violation")) return "danger";
  if (t.includes("draft") || t.includes("stale") || t.includes("⚠️") || t.includes("warning")) return "warn";
  return "info";
}

function isDelimiterRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && t.includes("-") && /^[|\s:-]+$/.test(t);
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function isTableStart(lines: string[], i: number): boolean {
  return (lines[i] ?? "").trim().startsWith("|") && isDelimiterRow(lines[i + 1] ?? "");
}

function isBlockStart(line: string): boolean {
  return HEADING.test(line) || FENCE.test(line) || HR.test(line) || QUOTE.test(line) || ITEM.test(line);
}

function parseBlocks(lines: string[], used: Map<string, number>): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const char = (fence[1] ?? "`")[0] ?? "`";
      const close = new RegExp(`^\\s{0,3}\\${char}{3,}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++; // the closing fence (or the end of the document)
      out.push({ kind: "code", lang: fence[2] ?? "", code: body.join("\n") });
      continue;
    }

    const h = HEADING.exec(line);
    if (h) {
      const text = (h[2] ?? "").replace(/\s+#+\s*$/, "").trim();
      out.push({ kind: "heading", level: Math.min((h[1] ?? "#").length, 4), text, id: slugify(text, used) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] ?? "")) {
        inner.push((lines[i] ?? "").replace(/^\s{0,3}>\s?/, ""));
        i++;
      }
      const raw = inner.join("\n");
      out.push({ kind: "quote", tone: toneOf(raw), blocks: parseBlocks(inner, used) });
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1] ?? "").map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        const cells = splitRow(lines[i] ?? "");
        // rows in our specs sometimes trail a ⟨src: …⟩ past the last pipe — keep it, in the last cell
        if (cells.length > header.length) rows.push([...cells.slice(0, header.length - 1), cells.slice(header.length - 1).join(" ")]);
        else rows.push(cells);
        i++;
      }
      out.push({ kind: "table", header, align, rows });
      continue;
    }

    const first = ITEM.exec(line);
    if (first) {
      const baseIndent = (first[1] ?? "").length;
      const ordered = /\d/.test(first[2] ?? "");
      const items: ListItem[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        // a blank line between items keeps one list, as long as an item follows
        if (!cur.trim()) {
          if (ITEM.test(lines[i + 1] ?? "")) {
            i++;
            continue;
          }
          break;
        }
        const m = ITEM.exec(cur);
        if (!m) break;
        const indent = (m[1] ?? "").length;
        if (indent < baseIndent) break;
        if (indent > baseIndent) {
          const sub: string[] = [];
          while (i < lines.length) {
            const n = ITEM.exec(lines[i] ?? "");
            if (!n || (n[1] ?? "").length <= baseIndent) break;
            sub.push((lines[i] ?? "").slice(baseIndent + 1));
            i++;
          }
          const nested = parseBlocks(sub, used).find((b) => b.kind === "list");
          const prev = items[items.length - 1];
          if (prev && nested && nested.kind === "list") prev.children = nested;
          continue;
        }
        items.push({ text: m[3] ?? "" });
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }

    // paragraph: the current line is known not to start a block, so it is always consumed (no stall)
    const buf: string[] = [line.trim()];
    i++;
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (!l.trim() || isBlockStart(l) || isTableStart(lines, i)) break;
      buf.push(l.trim());
      i++;
    }
    out.push({ kind: "para", text: buf.join(" ") });
  }
  return out;
}

function parse(md: string): Block[] {
  return parseBlocks(stripComments(md).replace(/\r\n?/g, "\n").split("\n"), new Map());
}

/** Headings in document order — the table of contents reads this. */
export function headings(md: string): Heading[] {
  const used = new Map<string, number>();
  const out: Heading[] = [];
  const lines = stripComments(md).replace(/\r\n?/g, "\n").split("\n");
  let inFence = false;
  for (const raw of lines) {
    const line = raw.replace(/^\s{0,3}>\s?/, ""); // parse() recurses into blockquotes; stay in step with it
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = HEADING.exec(line);
    if (!h) continue;
    const text = (h[2] ?? "").replace(/\s+#+\s*$/, "").trim();
    out.push({ level: Math.min((h[1] ?? "#").length, 4), text: plain(text), id: slugify(text, used) });
  }
  return out;
}

/** Heading text with the markup and trace markers taken out — for the ToC and for anchors. */
export function plain(text: string): string {
  return text
    .replace(/⟨[^⟩]*⟩/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

const INLINE = /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])|\[([^\]\n]+)\]\(([^)\s]+)\)|⟨([^⟩]*)⟩/g;

/** Only ever produce an href we understand — no javascript:, no data:. */
function safeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("#") || href.startsWith("/");
}

function inline(text: string, key: string, showTraces: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}i${n++}`;
    if (m[2] !== undefined) out.push(<code key={k}>{m[2]}</code>);
    else if (m[3] !== undefined) out.push(<strong key={k}>{inline(m[3], k, showTraces)}</strong>);
    else if (m[4] !== undefined) out.push(<em key={k}>{inline(m[4], k, showTraces)}</em>);
    else if (m[5] !== undefined) out.push(<em key={k}>{inline(m[5], k, showTraces)}</em>);
    else if (m[6] !== undefined && m[7] !== undefined)
      out.push(
        safeHref(m[7]) ? (
          <a key={k} href={m[7]} target="_blank" rel="noreferrer noopener">
            {inline(m[6], k, showTraces)}
          </a>
        ) : (
          // an href we will not follow (javascript:, data:, …) stays raw markdown rather than a silent relabel
          <Fragment key={k}>{m[0]}</Fragment>
        ),
      );
    else if (m[8] !== undefined && showTraces)
      out.push(
        <span key={k} data-trace="" title="where this line comes from in the Design Sheet">
          {m[8]}
        </span>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderList(list: Extract<Block, { kind: "list" }>, key: string, showTraces: boolean): ReactNode {
  const children = list.items.map((it, i) => (
    <li key={`${key}l${i}`}>
      {inline(it.text, `${key}l${i}`, showTraces)}
      {it.children ? renderList(it.children, `${key}l${i}n`, showTraces) : null}
    </li>
  ));
  return list.ordered ? <ol key={key}>{children}</ol> : <ul key={key}>{children}</ul>;
}

const HEADING_TAGS: Record<number, "h1" | "h2" | "h3" | "h4"> = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" };

function render(blocks: Block[], key: string, showTraces: boolean): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}b${i}`;
    switch (b.kind) {
      case "heading": {
        const Tag = HEADING_TAGS[b.level] ?? "h4";
        return (
          <Tag key={k} id={b.id}>
            {inline(b.text, k, showTraces)}
          </Tag>
        );
      }
      case "para":
        return <p key={k}>{inline(b.text, k, showTraces)}</p>;
      case "code":
        return (
          <pre key={k} data-lang={b.lang || undefined}>
            <code>{b.code}</code>
          </pre>
        );
      case "list":
        return renderList(b, k, showTraces);
      case "table":
        return (
          <div key={k} data-table="">
            <table>
              <thead>
                <tr>
                  {b.header.map((c, j) => (
                    <th key={`${k}h${j}`} style={b.align[j] ? { textAlign: b.align[j] as "left" | "center" | "right" } : undefined}>
                      {inline(c, `${k}h${j}`, showTraces)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={`${k}r${r}`}>
                    {b.header.map((_, j) => (
                      <td key={`${k}r${r}c${j}`} style={b.align[j] ? { textAlign: b.align[j] as "left" | "center" | "right" } : undefined}>
                        {inline(row[j] ?? "", `${k}r${r}c${j}`, showTraces)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "quote":
        return (
          <blockquote key={k} data-tone={b.tone}>
            {render(b.blocks, k, showTraces)}
          </blockquote>
        );
      case "hr":
        return <hr key={k} />;
    }
  });
}

/** Render markdown as React elements. `className` styles the whole tree through a CSS Module. */
export function Markdown({ text, className, showTraces = true }: { text: string; className?: string; showTraces?: boolean }) {
  return <div className={className}>{render(parse(text), "m", showTraces)}</div>;
}
