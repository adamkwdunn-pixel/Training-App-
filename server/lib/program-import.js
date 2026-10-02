// Turn a program written in a PDF or photographed/screenshotted on paper into a structured draft
// using Claude's vision + document understanding. Needs ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const MODEL = 'claude-opus-5-5';
export const IMPORT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const num = z.number().nullable();
const ProgramSchema = z.object({
  is_program: z.boolean().describe('false if the files are not a training program'),
  name: z.string().describe('Program name, from the document if it has one'),
  description: z.string().describe('One or two sentences: goal, phase, sessions per week'),
  weeks: z.array(z.object({
    repeat: z.number().describe('How many consecutive weeks this block covers when weeks are identical (usually 1)'),
    days: z.array(z.object({
      title: z.string().describe('Session name, e.g. "Lower strength" or "Day 1"'),
      notes: z.string().describe('Warm-up or general notes for the session, or empty'),
      exercises: z.array(z.object({
        name: z.string().describe('Exercise name as written'),
        library_match: z.string().describe('Exact name from the coach library list if it is clearly the same exercise, else empty'),
        category: z.string().describe('strength, power, speed, conditioning, mobility or other'),
        metric: z.string().describe('What the athlete records: load, time, distance, height, reps or velocity'),
        block: z.string().describe('Order label like A1, B2, or empty'),
        sets: num,
        reps: z.string().describe('Reps as written, e.g. "5", "3-5", "8/side", or empty'),
        load_type: z.string().describe('percent, rir, rpe, fixed, bodyweight or none'),
        percent: num, rir: num, rpe: num,
        fixed_load: num.describe('kg'),
        target: z.string().describe('Distance, time or other target, e.g. "30 m" or "< 4.2 s", or empty'),
        rest_seconds: num,
        tempo: z.string(),
        notes: z.string(),
      })),
    })),
  })),
  warnings: z.array(z.string()).describe('Anything unclear, unreadable or guessed that the coach should check'),
});

function systemPrompt(library) {
  return `You convert strength & conditioning programs (for rugby and other athletes) into structured data for a coaching app. The coach gives you a PDF, photos or screenshots of a written program.

Read every page. Produce weeks in order, each with its sessions (days) in order, each with its exercises in order.
- If the program says some weeks are identical (e.g. "Weeks 1-3"), list that week once and set repeat to the number of weeks it covers. If weeks differ (different sets, reps or %), list each week separately with repeat 1.
- Keep reps as written ("5", "3-5", "8 each side"). Convert rest to seconds (e.g. "2 min" -> 120).
- load_type: percent for "% of 1RM/TM" (put the number in percent); rir for reps in reserve (number in rir); rpe for RPE (number in rpe); fixed for a stated weight in kg (convert lb to kg); bodyweight for bodyweight work; none for sprints, jumps, conditioning, mobility or when no load is given. If both % and RIR/RPE are given, use percent and also fill rir.
- Supersets or labelled blocks (A1/A2) go in block.
- For each exercise, if it is clearly the same as one in the coach's library, copy that library name exactly into library_match; otherwise leave library_match empty.
- Never invent exercises, sets or loads. If something is unreadable or ambiguous, make the best reasonable reading and add a short warning.
- If the files are not a training program, set is_program to false.

The coach's exercise library:
${library.map((n) => `- ${n}`).join('\n')}`;
}

export class ImportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Returns null when no API key is configured. files: [{ buffer, mimetype, originalname }] */
export function createProgramImporter(env = process.env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  return async function importProgram(files, library) {
    const content = files.map((f) => (f.mimetype === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.buffer.toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: f.mimetype, data: f.buffer.toString('base64') } }));
    content.push({ type: 'text', text: `Convert this training program${files.length > 1 ? ` (${files.length} files, in order)` : ''} into the structured format.` });

    let message;
    try {
      // Long documents can produce a lot of output, so stream and collect the final message.
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01', 'structured-outputs-2025-12-15'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(ProgramSchema) },
        system: systemPrompt(library),
        messages: [{ role: 'user', content }],
      });
      message = await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new ImportError(503, 'The AI key on the server isn’t valid — check ANTHROPIC_API_KEY in Render.');
      if (e instanceof Anthropic.BadRequestError) throw new ImportError(400, 'The AI couldn’t open those files — try a PDF, JPG or PNG under 20 MB.');
      if (e instanceof Anthropic.RateLimitError) throw new ImportError(503, 'The AI service is busy — try again in a minute.');
      if (e instanceof Anthropic.APIConnectionError) throw new ImportError(503, 'Couldn’t reach the AI service — try again.');
      if (e instanceof Anthropic.APIError) throw new ImportError(502, 'The AI service had a problem — try again.');
      throw e;
    }
    if (message.stop_reason === 'refusal') throw new ImportError(422, 'That file couldn’t be read as a program.');
    if (message.stop_reason === 'max_tokens') throw new ImportError(422, 'That program is too long to read in one go — import it in parts (e.g. one block or a few weeks at a time).');
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let parsed;
    try {
      parsed = ProgramSchema.parse(JSON.parse(text));
    } catch {
      throw new ImportError(502, 'The AI’s answer couldn’t be read — try again.');
    }
    if (!parsed.is_program || !parsed.weeks.length) throw new ImportError(422, 'That doesn’t look like a training program. Try a clearer photo or the original PDF.');
    return parsed;
  };
}
