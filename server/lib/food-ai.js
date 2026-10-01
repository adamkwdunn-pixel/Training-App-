// AI food estimates: an athlete describes what they ate in plain words and Claude estimates
// calories and macros per item. Needs ANTHROPIC_API_KEY; without it the app offers manual entry.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const MODEL = 'claude-opus-5-5';

const EstimateSchema = z.object({
  is_food: z.boolean().describe('false if the text does not describe food or drink'),
  items: z.array(z.object({
    name: z.string().describe('Short food name, e.g. "Chicken breast, grilled"'),
    quantity: z.string().describe('Amount used for the estimate, e.g. "100 g" or "1 tbsp"'),
    kcal: z.number(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
  })),
  assumptions: z.array(z.string()).describe('Portion sizes or preparation you had to assume, in plain words'),
  confidence: z.string().describe('One word: low, medium or high'),
});

const SYSTEM = `You estimate the nutrition of meals for athletes using a rugby coaching app. The athlete describes what they ate in everyday words; you break it into individual foods and estimate energy and macronutrients for each.

How to estimate:
- Use standard food-composition reference values (e.g. USDA FoodData Central, UK CoFID) for the food as described, cooked or raw as stated.
- Use the amounts given. Where an amount is vague ("some", "a bit of", "a handful") or missing, assume a typical single adult portion, and say what you assumed in the assumptions list.
- Include anything that adds meaningful energy: cooking oil, butter, sauces, dressings, sugar in drinks.
- Round kcal to the nearest 5 and grams to the nearest whole gram. Keep each item's kcal roughly consistent with 4 kcal/g protein, 4 kcal/g carbohydrate and 9 kcal/g fat (alcohol 7 kcal/g).
- Set confidence to high when amounts are weighed or clearly stated, medium when you estimated portions, and low when the description is very vague.
- If the text isn't about food or drink, set is_food to false and return no items.

Write food names and assumptions in plain language an athlete will understand.`;

/** Returns null when no API key is configured. */
export function createFoodEstimator(env = process.env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });

  return async function estimate(description) {
    let response;
    try {
      response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // If a request is ever declined by a safety classifier, retry on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // A short, well-specified extraction: low effort keeps it fast and inexpensive.
        output_config: { effort: 'low', format: betaZodOutputFormat(EstimateSchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: `What I ate:\n${description}` }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new EstimateError(503, 'The AI key on the server isn’t valid — ask your coach to check it.');
      if (e instanceof Anthropic.RateLimitError) throw new EstimateError(503, 'The AI service is busy — try again in a minute.');
      if (e instanceof Anthropic.APIConnectionError) throw new EstimateError(503, 'Couldn’t reach the AI service — check the connection and try again.');
      if (e instanceof Anthropic.APIError) throw new EstimateError(502, 'The AI service had a problem — try again.');
      throw e;
    }
    if (response.stop_reason === 'refusal') throw new EstimateError(422, 'That description couldn’t be estimated — try rewording it.');
    const out = response.parsed_output;
    if (!out) throw new EstimateError(502, 'The estimate came back incomplete — try again.');
    if (!out.is_food || !out.items.length) throw new EstimateError(422, 'That doesn’t look like food or drink — describe what you ate, with amounts if you know them.');
    return normalise(out);
  };
}

export class EstimateError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Clean up numbers and add totals. */
export function normalise(out) {
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  const items = out.items.map((i) => ({
    name: String(i.name).slice(0, 120),
    quantity: String(i.quantity || '').slice(0, 60),
    kcal: n(i.kcal), protein: n(i.protein_g), carbs: n(i.carbs_g), fat: n(i.fat_g),
  }));
  const totals = items.reduce((t, i) => ({ kcal: t.kcal + i.kcal, protein: t.protein + i.protein, carbs: t.carbs + i.carbs, fat: t.fat + i.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const c = String(out.confidence || '').toLowerCase();
  const confidence = ['low', 'medium', 'high'].find((x) => c.includes(x)) || 'medium';
  return { items, totals, assumptions: (out.assumptions || []).slice(0, 8).map(String), confidence };
}
