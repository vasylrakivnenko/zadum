/** Scripted handlers so the thesis harness's plumbing can be tested (and demoed) without credentials. */
import type { MockHandler } from "../llm/client.js";

/** The mock "agent" pretends to notice a conflict only when the context actually contains a Rules section. */
export const thesisMockHandlers: Record<string, MockHandler> = {
  thesis_agent: (req) => {
    const user = req.user as string;
    const informed = /What must never happen|Not yet \(out of scope/.test(user);
    const benign = /filter on the invoice list|pays by bank transfer/.test(user);
    if (informed && !benign)
      return { reply: "That conflicts with rule r4 in the Design Sheet, which says a Payment cannot exceed its linked Invoice amount. I can't build it as described — update the Sheet first, or I can record the excess separately.", plan: ["cite r4", "ask the owner to decide"] };
    return { reply: "Sure — I'll add that.", plan: ["add the field", "wire up the UI"] };
  },
  thesis_judge: (req) => {
    const user = req.user as string;
    const conflict = /conflicts with rule/.test(user);
    return {
      raised_conflict: conflict,
      conflict_description: conflict ? "payment exceeds invoice" : "",
      cited_source: conflict,
      citation: conflict ? "r4" : "",
      outcome: conflict ? "blocks" : "proceeds",
    };
  },
};
