// Turn a coach's plain-English progression rule ("add 2.5 kg when they hit all reps with 2 in reserve…")
// into the clause/condition/action JSON that lib/progression.js runs. Needs ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { METRICS, OPS, ACTIONS } from './progression.js';

export const MODEL = 'claude-opus-5-5';

const Action = z.object({
  action: z.string().describe('One of the action keys listed in the instructions'),
  value: z.number().nullable().describe('Amount for adjust_* actions (negative to decrease), else null'),
  message: z.string().describe('Message for flag_coach, else empty'),
});
const RuleSchema = z.object({
  understood: z.boolean().describe('false if the text is not a progression rule or cannot be expressed with the metrics and actions available'),
  name: z.string().describe('Short rule name'),
  description: z.string().describe('One or two plain-English sentences describing what the rule does'),
  clauses: z.array(z.object({
    label: z.string().describe('Short label, e.g. "Too easy"'),
    when: z.array(z.object({
      metric: z.string().describe('One of the metric keys listed in the instructions'),
      op: z.string().describe('One of: >=, <=, >, <, ==, !='),
      value: z.number(),
    })),
    then: z.array(Action),
  })),
  otherwise: z.array(Action),
  notes: z.array(z.string()).describe('Anything you interpreted, assumed, or could not express — in plain words for the coach'),
});

const SYSTEM = `You turn a strength & conditioning coach's plain-English progression rule into a structured rule for a coaching app.

How the app runs a rule: after an athlete logs a session, each exercise is scored with the metrics below. Clauses are checked top to bottom; the FIRST clause whose conditions are ALL true has its actions applied. If no clause matches, the "otherwise" actions run. So put the most specific / most important clauses first (e.g. "deload after 2 failed sessions" must come before a general "missed reps" clause).

Metrics (key — meaning):
${Object.entries(METRICS).map(([k, d]) => `- ${k} — ${d}`).join('\n')}

Operators: ${OPS.join(', ')}. Yes/no metrics use 1 for yes and 0 for no with ==.

Actions (key — meaning):
${Object.entries(ACTIONS).map(([k, d]) => `- ${k} — ${d}`).join('\n')}

Guidance:
- "Working load" changes (adjust_load_*) change what the athlete lifts next session. "Max" changes (adjust_max_*) change the 1RM / training max that % loads are calculated from — use them when the coach talks about the max, 1RM or training max.
- RPE: RIR ≈ 10 − RPE. "2 reps in reserve" means avg_rir >= 2 or rir_vs_target >= 0 if a target RIR is implied by the program; prefer rir_vs_target when the coach compares against "the target" or "what was prescribed".
- "Every session" / "each time" with no condition means a clause on all_reps_completed == 1 unless the coach says otherwise.
- Decreases are negative values (e.g. -10 for a 10% deload).
- If nothing should happen when no clause matches, otherwise is [{ "action": "hold" }].
- Use only the metric, operator and action keys listed. If part of the request can't be expressed (e.g. it depends on sleep or readiness, or on something across different exercises), express the rest and explain the gap in notes.
- If you are given an existing rule plus a requested change, return the WHOLE updated rule, keeping everything the coach didn't ask to change (including the name, unless they asked to rename it).`;

export class RuleAIError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Keep only valid keys and numbers; returns { config, notes }. */
export function cleanRule(out) {
  const notes = [...(out.notes || []).map(String)];
  const action = (a) => {
    const key = String(a.action || '').trim();
    if (!(key in ACTIONS)) { notes.push(`Ignored an action the app doesn’t support: ${key}`); return null; }
    const x = { action: key };
    if (key.startsWith('adjust_')) x.value = Number(a.value) || 0;
    if (key === 'flag_coach') x.message = String(a.message || '').slice(0, 200);
    return x;
  };
  const clauses = (out.clauses || []).map((c) => ({
    label: String(c.label || '').slice(0, 80),
    when: (c.when || []).filter((w) => {
      const ok = w.metric in METRICS && OPS.includes(w.op) && Number.isFinite(Number(w.value));
      if (!ok) notes.push(`Ignored a condition the app can’t check: ${w.metric} ${w.op} ${w.value}`);
      return ok;
    }).map((w) => ({ metric: w.metric, op: w.op, value: Number(w.value) })),
    then: (c.then || []).map(action).filter(Boolean),
  })).filter((c) => c.when.length && c.then.length);
  const otherwise = (out.otherwise || []).map(action).filter(Boolean);
  return { config: { clauses, otherwise: otherwise.length ? otherwise : [{ action: 'hold' }] }, notes };
}

/** Returns null when no API key is configured. */
export function createRuleWriter(env = process.env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });

  return async function writeRule(text, current) {
    const prompt = current
      ? `Existing rule:\n${JSON.stringify({ name: current.name, description: current.description, ...current.config }, null, 2)}\n\nChange requested by the coach:\n${text}`
      : `Rule described by the coach:\n${text}`;
    let response;
    try {
      response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(RuleSchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new RuleAIError(503, 'The AI key on the server isn’t valid — check ANTHROPIC_API_KEY in Render.');
      if (e instanceof Anthropic.RateLimitError) throw new RuleAIError(503, 'The AI service is busy — try again in a minute.');
      if (e instanceof Anthropic.APIConnectionError) throw new RuleAIError(503, 'Couldn’t reach the AI service — try again.');
      if (e instanceof Anthropic.APIError) throw new RuleAIError(502, 'The AI service had a problem — try again.');
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new RuleAIError(422, 'That couldn’t be turned into a rule — try rewording it.');
    const out = response.parsed_output;
    if (!out) throw new RuleAIError(502, 'The answer came back incomplete — try again.');
    if (!out.understood) throw new RuleAIError(422, out.notes?.[0] || 'That doesn’t read as a progression rule — describe when loads or maxes should go up or down.');
    const { config, notes } = cleanRule(out);
    if (!config.clauses.length) throw new RuleAIError(422, notes[0] || 'Couldn’t turn that into conditions the app can check — try rewording it.');
    return { name: String(out.name || current?.name || 'New rule').slice(0, 80), description: String(out.description || '').slice(0, 300), config, notes };
  };
}
