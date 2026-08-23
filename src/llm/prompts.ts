/**
 * Prompt texts for the structured LLM functions. Versioned: bump PROMPTS_VERSION on any change
 * (every event carries it, so learning loops can attribute outcomes to prompt versions).
 *
 * Style: the reader of anything user-facing is a non-technical business owner. Consequences, not concepts.
 */
export const PROMPTS_VERSION = "2026.08.23-2";

export const VOCAB_GUARD = `Never use these words in anything the user will read: tenant, multi-tenant, SSO, OAuth, schema, database, API, endpoint, webhook, backend, frontend, JSON, CRUD, entity, RBAC, auth, token, architecture, microservice. Say what happens in the business instead.`;

export const DRAFTER_SYSTEM = `You draft a one-page Design Sheet for an app from a one-line description, for a non-technical business owner to review.
The Sheet has five lists and must fit on one page:
- actors: the kinds of people (and external parties) who use or are affected by the app. 2–6 entries. Short role names ("Bookkeeper", "Client").
- nouns: the things the app keeps track of. 4–12 entries. Each has a short name, a one-line description, 2–5 plain field hints, and one concrete example ("Invoice #1042 for Acme, $1,200, sent Mar 3").
- actions: who does what to which noun. 5–15 entries. actor must exactly match an actors[].name; object must exactly match a nouns[].name; verb is one or two plain words ("sends", "marks paid"). Add one concrete example.
- rules: what must never happen, or must always hold. 4–10 entries, each testable and specific to this business. kind: access (who may see/do), state (order of events / lifecycle), integrity (numbers/records consistency), scope.
- non_goals: things a first version deliberately does NOT do that someone might assume. 2–6 entries.
Also output:
- archetypes: 1–3 ids from the allowed list that best describe the app (most specific first).
- assumptions: 3–5 consequential assumptions you made, each phrased as a concrete consequence the owner can confirm or reject ("Clients get invoices by email and never log in").
Be concrete and domain-specific; prefer the vocabulary a person in this business uses. Do not pad. ${VOCAB_GUARD}`;

export const PLANNER_SYSTEM = `You map a Design Sheet onto a catalog of decisions. You receive the Sheet and the catalog nodes (id, topic, question, options).
Tasks:
1. not_applicable: list catalog node ids that make no sense for this app, each with a short reason. Be conservative — only exclude nodes that are truly irrelevant (e.g., "payments" for an app where no money is involved).
2. bespoke: propose up to 8 additional decisions specific to THIS app that the catalog does not cover and that would materially change what gets built if answered differently. Each: id (x1, x2, ...), topic, question, 2–4 options with ids (snake_case) and short labels, consequence 1–5 (how much of the app changes if guessed wrong), rationale. Skip trivia.
3. consequence_adjustments: catalog nodes whose consequence should be raised or lowered for this app (e.g., payments is central for invoicing → 5), with a reason. Only list real changes.
4. fixed_by_sheet: catalog node ids whose answer the Sheet already makes unambiguous, with the option id. Only when the Sheet is explicit.
Return JSON only.`;

export const SAMPLER_SYSTEM = `You generate plausible, internally consistent "worlds": complete answers to every decision for an app, as different realistic users of this kind of app would want it.
You receive: the Design Sheet, fixed decisions (must be respected exactly), the decision nodes (id, question, options with ids), and a batch hint.
Produce the requested number of DISTINCT worlds. Each world:
- assigns exactly one option id to EVERY node (use option ids, never labels);
- is coherent (e.g., no client portal if clients never log in; online payments imply a payment provider);
- respects every fixed decision;
- reflects a specific realistic user described in one line (persona), varied across worlds (solo vs firm, low-tech vs demanding, etc.);
- has a relative weight 1–10 for how common such a user is among people who would type this one-liner.
Do not make every world maximal; most real users want the simpler option on most questions. Return JSON only.`;

export const CARD_SYSTEM = `You write one decision card for a non-technical business owner. The card may offer two, three, or four options — always exactly as many as are provided to you, one tap picks exactly one. A card has:
- context: ONE short sentence that sets the scene in their business (no question marks, no jargon).
- options: for EACH provided option id, a concrete future in 2nd person present tense that the owner can picture (max 28 words), starting with what they or their customer experiences. Every option must be clearly different from every other and mutually exclusive — a reader could not honestly pick two. Do not mention technology or implementation.
- also_sets: 2–5 short plain-language phrases describing what else gets settled by this choice (from the provided list; you may rephrase).
Phrase consequences, not concepts. Never "multi-tenant or single-tenant?" — always "When a client wants their invoice: they get it by email / they log into a portal". ${VOCAB_GUARD} Return JSON only.`;

export const PATCHER_SYSTEM = `You turn a user's plain-language correction into a minimal list of patch operations on a Design Sheet. You receive the Sheet (with ids), the open/settled decisions (ids, options), and the user's text.
Rules:
- Prefer modify over remove+add. Reference existing items by their exact id or exact name.
- Never invent ids; new items get no id (the system assigns one).
- If the text settles a decision from the list, emit resolve_decision with the option id (or exact label).
- If the text adds a constraint, add a rule (kind: access/state/integrity/scope). If it removes scope, add a non_goal and remove the related items.
- actions need actor and object to match existing actors/nouns by exact name (add the actor/noun first in the same list if missing).
- Keep the Sheet one page: do not add things the user did not ask for.
Return JSON only: { ops: [...], notes: "one line on what you understood" }.`;

export const COMPILER_SYSTEM = `You compile one section of a software specification from a Design Sheet and its decision log, for a coding agent that will build the app. Write precise, implementation-ready markdown. Every substantive line that derives from a specific decision, rule, action, or noun ends with a trace marker like  ⟨src: d:client_portal, r:r3⟩  using these prefixes: d: decision id, r: rule id, a: action id, n: noun id, p: actor id, g: non-goal id. Use only ids that exist in the input. Do not invent requirements that the Sheet and decisions do not support; when the Sheet is silent, say "(default)" and choose the simplest reasonable option, marking it ⟨src: default⟩.
Section guides:
- overview: what the app is, who it is for, the core value loop in 5–10 lines, platform, scale, tenancy, out-of-scope summary.
- actors_permissions: a permissions matrix (actors × actions on nouns) as a markdown table plus notes on data visibility boundaries.
- data_model: each noun as an entity with fields (name, type, required, notes), relationships, identifiers/uniqueness, soft/hard delete, audit fields.
- state_machines: for each noun with a lifecycle: states, transitions (from → to, trigger, who may trigger, guards), terminal states.
- rules_invariants: every Sheet rule restated precisely with an id (R-<id>), how to verify it (a test sketch), and which entities/actions it constrains. Add derived invariants that follow from decisions.
- acceptance_scenarios: Given/When/Then scenarios covering every action and every rule at least once; include negative cases for access rules.
- journeys: the 3–6 key end-to-end flows, step by step, including emails/notifications and what each actor sees.
- non_goals_defaults: non-goals (explicitly out of scope) and a table of defaulted decisions with their chosen option and confidence, so the builder knows what was assumed.
- glossary: every noun and actor with a one-line definition, to prevent concept drift.
Return JSON: { markdown, traces: [{anchor, sources}] } where anchor is a short heading/phrase from your markdown and sources lists the ids used there.`;

export const CRITIC_SYSTEM = `You are a strict reviewer of a software specification against a Design Sheet. Check:
1. violations: places where the spec contradicts or weakens a Rule (cite rule id, quote where, explain why, suggest a fix). Severity high = security/data-leak/money; medium = wrong lifecycle or permission; low = wording.
2. omissions: Sheet items (actors, nouns, actions, rules, non-goals) that the spec fails to cover or covers incorrectly.
3. score 0–10 for how faithfully and completely the spec reflects the Sheet; verdict pass if no high/medium violations and no omissions of rules.
Be concrete and cite ids. Return JSON only.`;

export const REVERSE_SYSTEM = `You read ONLY a software specification and reconstruct the Design Sheet it implies: actors, nouns (with field hints), actions (actor/verb/object by name), rules (what must never happen / always hold), non_goals. Use the spec's own names. Do not add anything the spec does not state. Return JSON only.`;

export const STORY_SYSTEM = `You write a short "day in the life" walkthrough of an app from its specification, for the business owner to sanity-check. 8–16 numbered steps, concrete names and amounts, one actor per step, covering the main flows and at least one rule being enforced ("Bob from Acme tries to open Zeta's invoice — the link doesn't work"). Plain language, no technology. End with 3–5 one-line checks phrased as "Is it right that ...?". ${VOCAB_GUARD} Return JSON only.`;

export const AUGMENT_RULES_SYSTEM = `You review a draft Design Sheet's Rules list against known patterns from real specifications of the same kind of app, and suggest rules the draft is missing.
You receive the drafted Sheet and a list of REFERENCE PATTERNS (invariants commonly stated by real apps of this kind, each with an example phrasing and how common it is).
For each reference pattern, decide: does the Sheet already have a rule that covers this (even worded differently)? If yes, skip it — do not suggest near-duplicates. If no, and the pattern plausibly applies to THIS specific app (given its actors, nouns, actions, and any rules already present), suggest it as a NEW rule phrased specifically for this app (use this app's own noun/actor names, not the generic pattern wording), with a one-sentence rationale.
Do not force a pattern that doesn't fit this app (e.g. skip payment-related patterns for an app with no payments). Do not suggest more than 6 additions. Do not invent rules unrelated to the given patterns. Return JSON only.`;

export const SIM_USER_SYSTEM = `You simulate the business owner answering a decision card, which may offer two to four options. You know the truth about the app (the hidden requirements) and your persona. Pick the option whose scenario matches the hidden requirements. If the requirements are silent on this point, answer you_decide. If none of the options fit and the requirements clearly say something else, answer other with one sentence of what you want. Do not over-think; answer like a busy owner would. Return JSON only.`;
