#!/usr/bin/env node
/**
 * zadum CLI — drives the whole flow from a terminal.
 *   new "<one-liner>" [--mock] [--context "..."]     draft + plan (+ worlds) and print the Sheet
 *   show <id> [--decisions]                           print the Sheet
 *   edit <id> "<plain-language correction>"          correction moment
 *   cards <id>                                        interactive decision cards
 *   defaults <id> | override <id> <node> <option> | accept <id>
 *   compile <id> [--out dir] [--candidates N]
 *   verify <id>                                       story checks over the assumptions (group-testing)
 *   gaps <id> [--apply N]                             turn the spec's own guesses into new questions
 *   evidence <id> "<text>"                            feed the belief an artifact/message (not the Sheet)
 *   story <id> "<correction>"                         fix what the walkthrough got wrong (then recompile)
 *   next <id>                                         ← what should I do next? (the guided flow)
 *   history <id> | events <id> | projects
 *   demo [--mock] [--auto]                            whole flow end to end (auto-answers cards)
 */
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { promises as fs } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { buildEngine } from "../engine/bootstrap.js";
import { compileProject } from "../engine/compile.js";
import { renderSheetMarkdown } from "../core/render.js";
import type { DealResult, Engine } from "../engine/orchestrator.js";
import { isThoroughness, thoroughnessCompileOverrides, THOROUGHNESS_LEVELS, THOROUGHNESS_PRESETS } from "../core/thoroughness.js";
import { formatNextAction, nextAction, type NextAction } from "../engine/advisor.js";
import type { Store } from "../store/store.js";

/** Snapshot the advisor needs; shared by `next` and the flow-hints every command prints when it finishes. */
async function nextActionFor(engine: Engine, id: string): Promise<NextAction> {
  const { sheet, session } = await engine.getState(id);
  const artifacts = await engine.store.listArtifacts(id);
  const report = artifacts.find((a) => a.name === "compile-report.json");
  let compiledVersion: number | undefined;
  if (report) {
    try {
      compiledVersion = (JSON.parse(report.content) as { sheet_version?: number }).sheet_version;
    } catch {
      compiledVersion = undefined;
    }
  }
  const amendments = artifacts.find((a) => a.name === "amendments.json");
  let pendingAmendments = 0;
  if (amendments) {
    try {
      // The queue is stored as { format, amendments: [...] } (src/mcp/amendments.ts); a bare array is
      // accepted too so an older or hand-written file still counts.
      const raw = JSON.parse(amendments.content) as { amendments?: { status?: string }[] } | { status?: string }[];
      const list = Array.isArray(raw) ? raw : (raw.amendments ?? []);
      pendingAmendments = list.filter((x) => x.status === "pending").length;
    } catch {
      pendingAmendments = 0;
    }
  }
  const refinements = (await engine.store.listEvents(id)).filter((e) => e.type === "spec_refined").length;
  return nextAction({ sheet, session, artifacts: artifacts.map((a) => a.name), ...(compiledVersion !== undefined ? { compiledVersion } : {}), pendingAmendments, refinements });
}

/** Every command ends by pointing at the one next thing — the guided flow, not a menu of eight commands. */
async function printNext(engine: Engine, id: string) {
  try {
    console.log(formatNextAction(await nextActionFor(engine, id)));
  } catch {
    /* advisory only — never fail a command because the hint could not be computed */
  }
}

const program = new Command();
program.name("zadum").description("Design Sheet — TurboTax for AI coding").version("0.1.0");
program.option("--mock", "use the scripted mock LLM (no credentials)", false);
program.option("--cache", "cache LLM responses on disk", false);
program.option("--data-dir <dir>", "file store directory", process.env.ZADUM_DATA_DIR ?? ".zadum");
program.option("--theta <n>", "stopping threshold", (v) => Number(v));
program.option("--scoring <s>", "weighted_entropy (default) | joint_entropy | risk | ec2 (uncalibrated θ — sweep first)");
program.option("--lookahead <n>", "1 = greedy, 2 = two plies of the decision tree", (v) => Number(v));
program.option("--thoroughness <level>", "quick|standard|thorough (default standard) — scales theta/maxCards and, for compile, best-of-N/critic loops", "standard");
program.option("-q, --quiet", "less output", false);

function thoroughnessLevel(o: { thoroughness?: string }): "quick" | "standard" | "thorough" {
  const level = o.thoroughness ?? "standard";
  if (!isThoroughness(level)) {
    console.error(`error: unknown --thoroughness "${level}" (use ${THOROUGHNESS_LEVELS.join(", ")})`);
    process.exit(1);
  }
  return level;
}

async function engineFromOpts(): Promise<{ engine: Engine; store: Store }> {
  const o = program.opts();
  const config: Record<string, unknown> = {};
  if (o.scoring) config.scoring = o.scoring;
  if (o.lookahead === 1 || o.lookahead === 2) config.lookahead = o.lookahead;
  // Only ever pass a θ the user actually asked for. Computing one here from the CLI-side scoring would
  // override the stored session's θ on every resumed command — a project created with `--scoring risk`
  // (θ 7) and continued with a bare `cards <id>` would be judged against weighted_entropy's θ 24 and stop
  // immediately. Everything else is resolved against the EFFECTIVE scoring inside the engine (mergeConfig).
  const explicitTheta = o.theta !== undefined && !Number.isNaN(o.theta) ? (o.theta as number) : undefined;
  if (explicitTheta !== undefined) config.theta = explicitTheta;
  const level = thoroughnessLevel(o);
  const preset = THOROUGHNESS_PRESETS[level];
  if (level !== "standard") config.maxCards = preset.maxCards; // "standard"'s maxCards already matches the shipped default
  const { engine, store } = await buildEngine({
    mock: !!o.mock,
    cache: !!o.cache,
    dataDir: o.dataDir,
    engine: {
      config: config as never,
      ...(level !== "standard" ? { thetaMultiplier: preset.thetaMultiplier } : {}),
      log: o.quiet ? undefined : (l) => console.error(`  · ${l}`),
    },
  });
  return { engine, store };
}

function printCard(res: DealResult, n: number) {
  if (res.kind === "stop") {
    console.log(`\n— No more cards (${res.reason}). Design is ${(res.settledness * 100).toFixed(0)}% settled.\n`);
    return;
  }
  const c = res.card;
  console.log(`\n┌─ Card ${n}  ·  settled ${(res.settledness * 100).toFixed(0)}%  ·  about ${res.remaining_estimate} more${c.precomputed ? "  (precomputed)" : ""}`);
  console.log(`│ ${c.context}`);
  c.options.forEach((o, i) => console.log(`│  [${i + 1}] ${o.scenario}`));
  if (c.also_sets.length) console.log(`│  this also settles: ${c.also_sets.join(" · ")}`);
  console.log(`└─ 1-${c.options.length} choose · d = you decide · s = skip · o <text> = something else · u = undo · q = I'm done`);
}

program
  .command("new")
  .argument("<one-liner>")
  .option("--context <text>", "extra context (paste anything you have)")
  .option("--id <id>", "project id")
  .option("--no-worlds", "skip eager world sampling")
  .action(async (oneLiner: string, o: { context?: string; id?: string; worlds: boolean }) => {
    const { engine, store } = await engineFromOpts();
    const t0 = Date.now();
    const r = await engine.createProject(oneLiner, { extra_context: o.context, id: o.id });
    console.log(renderSheetMarkdown(r.sheet));
    if (r.draft.assumptions.length) {
      console.log("I assumed (correct me in plain English with `edit`):");
      for (const a of r.draft.assumptions) console.log(`  • ${a.text}`);
    }
    console.log(`\nProject ${r.project.id} · v${r.sheet.version} · ${r.session.belief.nodes.length} decisions tracked · ${r.session.belief.worlds.length} worlds · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await printNext(engine, r.project.id);
    await store.close();
  });

program
  .command("show")
  .argument("<id>")
  .option("--decisions", "include the decision ledger", false)
  .option("--ids", "show ids", false)
  .action(async (id: string, o: { decisions: boolean; ids: boolean }) => {
    const { engine, store } = await engineFromOpts();
    const { sheet, session } = await engine.getState(id);
    console.log(renderSheetMarkdown(sheet, { showDecisions: o.decisions, showOpenDecisions: o.decisions, showIds: o.ids }));
    console.log(`phase: ${session.phase} · cards: ${session.cards.length} · worlds: ${session.belief.worlds.length}`);
    await store.close();
  });

program
  .command("edit")
  .argument("<id>")
  .argument("<text>")
  .action(async (id: string, text: string) => {
    const { engine, store } = await engineFromOpts();
    const r = await engine.applyUserEdit(id, text);
    console.log(`→ ${r.notes}`);
    console.log(`  applied ${r.applied.length} change(s)${r.rejected.length ? `, rejected ${r.rejected.length}: ${r.rejected.map((x) => x.error).join("; ")}` : ""}${r.dropped.length ? `, dropped ${r.dropped.length}` : ""} · now v${r.version}`);
    if (r.implied.hard.length || r.implied.soft.length) console.log(`  this also decided: ${[...r.implied.hard.map((h) => `${h.node}=${h.option}`), ...r.implied.soft.map((s) => `${s.node}≈${s.option}`)].join(", ")}`);
    for (const c of r.implied.contradictions) console.log(`  ⚠ that conflicts with your earlier answer ${c.node}=${c.had} (it implies ${c.wants}) — that question is open again`);
    const { sheet } = await engine.getState(id);
    console.log(renderSheetMarkdown(sheet));
    await printNext(engine, id);
    await store.close();
  });

program
  .command("cards")
  .argument("<id>")
  .option("--auto", "auto-answer with the most likely option (for demos/tests)", false)
  .action(async (id: string, o: { auto: boolean }) => {
    const { engine, store } = await engineFromOpts();
    let res = await engine.startCards(id);
    const rl = o.auto ? null : createInterface({ input, output });
    let n = (await engine.getState(id)).session.cards.length;
    let userDone = false;
    // Soft stop (converged is a recommendation, not a guillotine): one yes re-prices θ at ~0 for the rest of
    // the loop (engine.continueCards); Rule 7's 12-card cap still binds.
    const offerContinue = async (r: DealResult): Promise<DealResult> => {
      if (r.kind !== "stop" || r.reason !== "converged" || !rl) return r;
      console.log(`\n— The next card would settle very little (design ${(r.settledness * 100).toFixed(0)}% settled). Stopping here is recommended.`);
      const more = (await rl.question("keep going anyway? (y/N) > ")).trim().toLowerCase();
      return more === "y" || more === "yes" ? engine.continueCards(id) : r;
    };
    res = await offerContinue(res);
    while (res.kind === "card") {
      printCard(res, n);
      let line: string;
      if (o.auto) {
        line = "1";
        console.log("  (auto) → 1");
      } else line = (await rl!.question("> ")).trim();
      const t0 = Date.now();
      if (line === "q") {
        userDone = true;
        break;
      } else if (line === "u") {
        const back = await engine.undoLast(id);
        if (back) {
          res = back;
          n = (await engine.getState(id)).session.cards.length;
          console.log("  (undone)");
          continue;
        }
        console.log("  nothing to undo");
        continue;
      }
      const optionCount = res.card.options.length;
      const isOptionPick = /^[1-9]\d*$/.test(line) && Number(line) >= 1 && Number(line) <= optionCount;
      let ans;
      if (isOptionPick) {
        const opt = res.card.options[Number(line) - 1]!;
        ans = await engine.answerCard(id, { kind: "option", option_id: opt.option_id, think_ms: Date.now() - t0 });
      } else if (line === "d") ans = await engine.answerCard(id, { kind: "you_decide", think_ms: Date.now() - t0 });
      else if (line === "s") ans = await engine.answerCard(id, { kind: "skip", think_ms: Date.now() - t0 });
      else if (line.startsWith("o ")) ans = await engine.answerCard(id, { kind: "other", text: line.slice(2), think_ms: Date.now() - t0 });
      else {
        console.log(`  ? use 1-${optionCount}, d, s, o <text>, u, q`);
        continue;
      }
      const also = [...ans.implied.hard.map((h) => `✓ ${h.node} = ${h.option}`), ...ans.implied.soft.map((s) => `≈ ${s.node} = ${s.option} (${Math.round(s.p * 100)}%)`)];
      if (also.length) console.log(`  this also decided: ${also.join(" · ")}`);
      for (const c of ans.implied.contradictions) console.log(`  ⚠ this conflicts with your earlier answer ${c.node} = ${c.had} (it implies ${c.wants}) — that question is open again so you can settle it`);
      res = await offerContinue(ans.next);
      n += 1;
    }
    rl?.close();
    if (res.kind === "stop" && !userDone) printCard(res, n);
    const defaults = await engine.finishCards(id);
    console.log(`Defaults review (${defaults.length} assumed decisions, riskiest first):`);
    for (const d of defaults.slice(0, 15)) console.log(`  ${d.status === "implied" ? "⇒" : d.status === "delegated" ? "↪" : "≈"} ${d.topic}: ${d.chosen_label}  (${Math.round(d.confidence * 100)}%, consequence ${d.consequence})${d.why ? ` — ${d.why}` : ""}  [${d.id}]`);
    if (defaults.length > 15) console.log(`  … and ${defaults.length - 15} more (npm run zadum -- defaults ${id})`);
    console.log(`\nCorrect one: npm run zadum -- override ${id} <decision-id> <option-id>`);
    await printNext(engine, id);
    await store.close();
  });

program
  .command("defaults")
  .argument("<id>")
  .action(async (id: string) => {
    const { engine, store } = await engineFromOpts();
    const defaults = await engine.getDefaults(id);
    for (const d of defaults) console.log(`${d.status.padEnd(9)} ${d.id.padEnd(26)} ${d.chosen_label}  (${Math.round(d.confidence * 100)}%, c${d.consequence})  options: ${d.options.map((o) => o.id).join("|")}`);
    await store.close();
  });

program
  .command("override")
  .argument("<id>")
  .argument("<node>")
  .argument("<option>")
  .action(async (id: string, node: string, option: string) => {
    const { engine, store } = await engineFromOpts();
    const r = await engine.overrideDefault(id, node, option);
    console.log(`→ v${r.version}${r.implied.hard.length || r.implied.soft.length ? ` · also: ${[...r.implied.hard.map((h) => `${h.node}=${h.option}`), ...r.implied.soft.map((s) => `${s.node}≈${s.option}`)].join(", ")}` : ""}`);
    await store.close();
  });

program
  .command("accept")
  .argument("<id>")
  .action(async (id: string) => {
    const { engine, store } = await engineFromOpts();
    await engine.acceptDefaults(id);
    console.log(`→ defaults accepted.`);
    await printNext(engine, id);
    await store.close();
  });

program
  .command("compile")
  .argument("<id>")
  .option("--out <dir>", "write the bundle here")
  .option("--candidates <n>", "best-of-N per section (default: from --thoroughness)", (v) => Number(v))
  .option("--critic-loops <n>", "repair passes after a failing critic verdict (default: from --thoroughness)", (v) => Number(v))
  .option("--no-story", "skip the story walkthrough")
  .option("--draft", "compile even with open decisions or ledger conflicts (the spec is stamped DRAFT)")
  .action(async (id: string, o: { out?: string; candidates?: number; criticLoops?: number; story: boolean; draft?: boolean }) => {
    const { engine, store } = await engineFromOpts();
    const preset = thoroughnessCompileOverrides(thoroughnessLevel(program.opts()));
    const candidates = o.candidates ?? preset.candidates;
    const criticLoops = o.criticLoops ?? preset.criticLoops;
    const r = await compileProject(engine, id, { outDir: o.out, candidates, criticLoops, story: o.story, draft: o.draft });
    console.log(`→ critic: ${r.critic.verdict} (score ${r.critic.score}, ${r.critic.violations.length} violations, ${r.critic.omissions.length} omissions, ${r.critic_rounds} round(s))`);
    if (r.stale) console.log(`⚠️ the Sheet changed during the compile — this spec is stamped stale; recompile before relying on it`);
    for (const c of r.conflicts) console.log(`⚠️ ledger conflict: ${c.node} is ${c.have} but ${c.because} wants ${c.want}`);
    if (r.roundtrip) console.log(`→ round-trip recall: overall ${(r.roundtrip.recall.overall * 100).toFixed(0)}% (actors ${pct(r.roundtrip.recall.actors)}, nouns ${pct(r.roundtrip.recall.nouns)}, actions ${pct(r.roundtrip.recall.actions)}, rules ${pct(r.roundtrip.recall.rules)})${r.roundtrip.missing.length ? ` · missing: ${r.roundtrip.missing.map((m) => `${m.kind}:${m.item}`).slice(0, 6).join("; ")}` : ""}`);
    console.log(`→ bundle: ${r.bundle.map((b) => b.name).join(", ")}${o.out ? ` written to ${o.out}` : " (stored as artifacts)"} · ${(r.latency_ms / 1000).toFixed(1)}s · tokens in ${r.usage.input_tokens} out ${r.usage.output_tokens}`);
    if (r.story) {
      console.log(`\n${r.story.title}`);
      r.story.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      console.log("  Please confirm:");
      r.story.checks.forEach((c) => console.log(`   - ${c}`));
      console.log(`\n  Something reads wrong? npm run zadum -- story ${id} "what should happen instead" — then recompile.`);
    }
    await store.close();
  });

program
  .command("next")
  .description("what should I do next? — the guided flow: one recommended step, derived from where the project actually is")
  .argument("<id>")
  .action(async (id: string) => {
    const { engine, store } = await engineFromOpts();
    console.log(formatNextAction(await nextActionFor(engine, id)));
    await store.close();
  });

program
  .command("plan")
  .description("what is the single most informative next INTERACTION — a card, a story check, or a look at one assumption? (diagnostic; the harness decides whether this drives the loop)")
  .argument("<id>")
  .action(async (id: string) => {
    const { engine, store } = await engineFromOpts();
    const plan = await engine.planNext(id);
    if (!plan.length) console.log("— nothing left worth an interaction.");
    for (const [i, p] of plan.entries()) console.log(`${i === 0 ? "→" : " "} ${p.kind.padEnd(7)} ${p.value.toFixed(1).padStart(7)}  ${p.why}`);
    await store.close();
  });

program
  .command("verify")
  .description("story checks over the assumptions: each scenario bundles several assumed decisions at ~50/50 joint odds — confirm it or point at the wrong part")
  .argument("<id>")
  .option("--max <n>", "max scenarios per round", (v) => Number(v), 3)
  .action(async (id: string, o: { max: number }) => {
    const { engine, store } = await engineFromOpts();
    const rl = createInterface({ input, output });
    let rounds = 0;
    outer: while (rounds++ < 8) {
      const { probes } = await engine.getVerification(id, { maxProbes: o.max });
      if (!probes.length) {
        console.log("— Nothing left worth a story check: the assumptions are either confirmed or too settled to doubt.");
        break;
      }
      for (const p of probes) {
        console.log(`\n┌─ Story check (${Math.round(p.p_all_correct * 100)}% sure this is all right)`);
        console.log(`│ ${p.scenario}`);
        p.nodes.forEach((n, i) => console.log(`│  (${i + 1}) ${n.question} → ${n.answer_label}`));
        const line = (await rl.question(`└─ y = that's right · 1-${p.nodes.length} = that part is wrong · s = skip · q = done > `)).trim().toLowerCase();
        if (line === "q") break outer;
        if (line === "s") continue;
        if (line === "y") {
          const r = await engine.answerVerification(id, { probe_id: p.id, ok: true });
          console.log(`  ✓ confirmed ${r.confirmed.length} assumption(s)`);
          continue;
        }
        const idx = Number(line);
        if (Number.isInteger(idx) && idx >= 1 && idx <= p.nodes.length) {
          const wrong = p.nodes[idx - 1]!;
          const { sheet } = await engine.getState(id);
          const d = sheet.decisions.find((x) => x.id === wrong.node_id)!;
          d.options.forEach((opt, i) => console.log(`   [${i + 1}] ${opt.label}`));
          const pick = Number((await rl.question(`   which is right? 1-${d.options.length} > `)).trim());
          if (Number.isInteger(pick) && pick >= 1 && pick <= d.options.length) {
            const r = await engine.answerVerification(id, { probe_id: p.id, ok: false, correction: { node_id: wrong.node_id, option_id: d.options[pick - 1]!.id } });
            const also = [...r.implied.hard.map((h) => `${h.node}=${h.option}`), ...r.implied.soft.map((s) => `${s.node}≈${s.option}`)];
            console.log(`  ✎ corrected${also.length ? ` · also decided: ${also.join(", ")}` : ""}`);
            continue outer; // belief moved — recompose the remaining scenarios adaptively
          }
        }
        console.log("  ? skipped");
      }
      break; // all probes of this round answered without a correction — done
    }
    rl.close();
    await printNext(engine, id);
    await store.close();
  });

program
  .command("gaps")
  .description("mine the compiled spec's own confessed guesses (⟨src: default⟩) into new decision cards — the loop that makes the next spec tighter")
  .argument("<id>")
  .option("--apply <n>", "add the top N candidates as open decisions and reopen the card loop", (v) => Number(v))
  .option("--ids <list>", "add exactly these candidate ids (comma-separated) instead of the top N")
  .action(async (id: string, o: { apply?: number; ids?: string }) => {
    const { engine, store } = await engineFromOpts();
    const applyIds = o.ids?.split(",").map((x) => x.trim()).filter(Boolean);
    const r = await engine.mineSpecGaps(id, { ...(o.apply !== undefined ? { apply: o.apply } : {}), ...(applyIds?.length ? { applyIds } : {}) });
    console.log(`→ ${r.gaps.length} guessed spot(s) in the spec; ${r.candidates.length} decision candidate(s):`);
    for (const c of r.candidates) console.log(`  [c${c.consequence}] ${c.id}: ${c.question}  (${c.options.map((x) => x.label).join(" / ")}) — ${c.rationale}`);
    if (r.applied.length) console.log(`\n  applied ${r.applied.length}: next → npm run zadum -- cards ${id}, then recompile`);
    else if (r.candidates.length) console.log(`\n  ask me these: npm run zadum -- gaps ${id} --apply ${Math.min(3, r.candidates.length)}   ·   or pick exactly: --ids ${r.candidates[0]!.id}`);
    await store.close();
  });

program
  .command("evidence")
  .description("feed the belief a piece of evidence (a message, a pasted invoice/spreadsheet/email) — updates what we think is likely, never the Sheet itself")
  .argument("<id>")
  .argument("<text>")
  .action(async (id: string, text: string) => {
    const { engine, store } = await engineFromOpts();
    const r = await engine.absorbEvidence(id, text);
    if (!r.shifts.length) console.log("→ noted; nothing in the current picture changed materially");
    else {
      console.log(`→ this shifted ${r.shifts.length} thing(s) we were assuming:`);
      for (const s of r.shifts.slice(0, 10)) console.log(`  ${s.node}: ${s.from === s.to ? `${s.to} (${Math.round(s.p_from * 100)}% → ${Math.round(s.p_to * 100)}%)` : `${s.from} → ${s.to}`}`);
    }
    await store.close();
  });

program
  .command("story")
  .description("correct something the story walkthrough got wrong (plain English; updates the Sheet, then recompile)")
  .argument("<id>")
  .argument("<text>")
  .action(async (id: string, text: string) => {
    const { engine, store } = await engineFromOpts();
    const r = await engine.applyStoryCorrection(id, text);
    console.log(`→ ${r.notes}`);
    console.log(`  applied ${r.applied.length} change(s)${r.rejected.length ? `, rejected ${r.rejected.length}: ${r.rejected.map((x) => x.error).join("; ")}` : ""} · now v${r.version}`);
    if (r.implied.hard.length || r.implied.soft.length) console.log(`  this also decided: ${[...r.implied.hard.map((h) => `${h.node}=${h.option}`), ...r.implied.soft.map((s) => `${s.node}≈${s.option}`)].join(", ")}`);
    for (const c of r.implied.contradictions) console.log(`  ⚠ that conflicts with your earlier answer ${c.node}=${c.had} (it implies ${c.wants}) — that question is open again`);
    if (r.applied.length) console.log(`  the Sheet changed — recompile to refresh the bundle: npm run zadum -- compile ${id}`);
    await store.close();
  });

program
  .command("refine")
  .description("correct the compiled spec (a comment, or --file with your edited spec.md) — the fix lands on the Sheet, then recompile")
  .argument("<id>")
  .argument("[comment]", "what reads wrong, in plain English")
  .option("--file <path>", "your edited copy of spec.md (diffed against the compiled one)")
  .option("--quote <text>", "the passage the comment is about")
  .action(async (id: string, comment: string | undefined, o: { file?: string; quote?: string }) => {
    const { engine, store } = await engineFromOpts();
    const edited = o.file ? await fs.readFile(o.file, "utf8") : undefined;
    const r = await engine.refineFromSpecFeedback(id, {
      ...(edited ? { edited } : {}),
      ...(comment ? { comments: [{ text: comment, ...(o.quote ? { quote: o.quote } : {}) }] } : {}),
    });
    console.log(`→ ${r.notes} · now v${r.version}`);
    for (const w of r.extraction.wrong_assumptions) console.log(`  ✗ we had ${w.node} wrong: "${w.was}"${w.should_be ? ` → "${w.should_be}"` : ""} — ${w.why}`);
    for (const m of r.extraction.missing_elements) console.log(`  + added ${m.kind}: ${m.text}`);
    for (const c of r.extraction.confirmed_elements) console.log(`  ✓ confirmed: ${c}`);
    for (const q of r.extraction.new_questions) console.log(`  ? new question: ${q.question}  [${q.id}]`);
    if (r.reopened.length) console.log(`  ⚠ this conflicts with earlier answers (${r.reopened.join(", ")}) — those questions are open again`);
    if (r.rejected.length) console.log(`  rejected ${r.rejected.length}: ${r.rejected.map((x) => x.error).join("; ")}`);
    if (r.added_decisions.length || r.reopened.length) console.log(`\n  Answer them first: npm run zadum -- cards ${id}`);
    else console.log(`\n  Recompile to refresh the bundle: npm run zadum -- compile ${id}`);
    await store.close();
  });

program
  .command("history")
  .argument("<id>")
  .action(async (id: string) => {
    const { engine, store } = await engineFromOpts();
    const { commits } = await engine.getState(id);
    for (const c of commits) console.log(`v${String(c.version).padStart(3)} ${c.created_at} ${c.source.kind.padEnd(15)} ${c.ops.length} op(s)${c.rejected.length ? ` (${c.rejected.length} rejected)` : ""}  ${c.message}`);
    await store.close();
  });

program
  .command("events")
  .argument("<id>")
  .action(async (id: string) => {
    const { store } = await engineFromOpts();
    for (const e of await store.listEvents(id)) console.log(`${e.ts} ${e.type.padEnd(22)} ${JSON.stringify(e.payload).slice(0, 160)}`);
    await store.close();
  });

program.command("projects").action(async () => {
  const { store } = await engineFromOpts();
  for (const p of await store.listProjects()) console.log(`${p.id}  v${p.latest_version}  ${p.phase.padEnd(15)} ${p.one_liner}`);
  await store.close();
});

program
  .command("demo")
  .description("run the whole flow end to end (use --mock for no credentials; cards are auto-answered)")
  .option("--one-liner <text>", "one-liner", "an invoicing app for small bookkeeping firms")
  .option("--out <dir>", "write the bundle here")
  .action(async (o: { oneLiner: string; out?: string }) => {
    const { engine, store } = await engineFromOpts();
    const t0 = Date.now();
    console.log(`1) Drafting from: "${o.oneLiner}"`);
    const r = await engine.createProject(o.oneLiner, { origin: "experiment" });
    console.log(renderSheetMarkdown(r.sheet));
    console.log(`2) Correction moment — applying: "Clients log into a portal to see and pay their invoices"`);
    const e = await engine.applyUserEdit(r.project.id, "Clients log into a portal to see and pay their invoices");
    console.log(`   → ${e.notes}; v${e.version}; implied: ${[...e.implied.hard.map((h) => `${h.node}=${h.option}`), ...e.implied.soft.map((s) => `${s.node}≈${s.option}`)].join(", ") || "none"}`);
    console.log(`3) Cards (auto-answered with option 1):`);
    let res = await engine.startCards(r.project.id);
    let n = 1;
    while (res.kind === "card") {
      printCard(res, n);
      const ans = await engine.answerCard(r.project.id, { kind: "option", option_id: res.card.options[0]!.option_id, think_ms: 1200 });
      const also = [...ans.implied.hard.map((h) => `✓ ${h.node}=${h.option}`), ...ans.implied.soft.map((s) => `≈ ${s.node}=${s.option}`)];
      console.log(`  → answered [1]${also.length ? ` · also decided: ${also.join(" · ")}` : ""}`);
      res = ans.next;
      n++;
    }
    printCard(res, n);
    const defaults = await engine.finishCards(r.project.id);
    console.log(`4) Defaults review: ${defaults.length} assumed decisions; top 5 riskiest:`);
    for (const d of defaults.slice(0, 5)) console.log(`   ≈ ${d.topic}: ${d.chosen_label} (${Math.round(d.confidence * 100)}%, c${d.consequence})`);
    await engine.acceptDefaults(r.project.id);
    console.log(`5) Compiling…`);
    const c = await compileProject(engine, r.project.id, { outDir: o.out, story: true });
    console.log(`   → critic ${c.critic.verdict} (score ${c.critic.score}) · round-trip ${(c.roundtrip?.recall.overall ?? 0) * 100 | 0}% · bundle: ${c.bundle.map((b) => b.name).join(", ")}`);
    // 6) the loop back: the owner reads the spec and corrects it. The fix lands on the SHEET, so it survives
    // the recompile — the step that makes the spec a draft you can argue with rather than a take-it-or-leave-it.
    console.log(`6) Reading the spec and correcting it…`);
    const ref = await engine.refineFromSpecFeedback(r.project.id, { comments: [{ quote: "clients", text: "This is wrong — our clients never log in, we email everything." }] });
    for (const w of ref.extraction.wrong_assumptions) console.log(`   ✗ we had ${w.node} wrong: "${w.was}"${w.should_be ? ` → "${w.should_be}"` : ""}`);
    for (const q of ref.extraction.new_questions) console.log(`   ? new question raised: ${q.question}`);
    if (!ref.added_decisions.length && !ref.reopened.length) {
      const c2 = await compileProject(engine, r.project.id, { outDir: o.out, story: true });
      console.log(`   → recompiled from the corrected Sheet (v${c2.sheet_version}) · critic ${c2.critic.verdict}`);
    } else console.log(`   → ${ref.added_decisions.length + ref.reopened.length} question(s) need answering before the next compile`);
    const state = await engine.getState(r.project.id);
    const events = await store.listEvents(r.project.id);
    console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s · project ${r.project.id} · ${state.commits.length} commits · ${state.session.cards.length} cards · ${events.length} events · phase ${state.session.phase}`);
    await store.close();
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(`error: ${(e as Error).message}`);
  process.exit(1);
});

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}
