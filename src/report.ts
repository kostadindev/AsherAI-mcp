import { HABITS, type GatewayEvent, type Habit, type State } from './state.js';

export type StewardshipScore = 'Full' | 'Partial' | 'Zero';

export interface Stewardship {
  leaks: GatewayEvent[];
  score: StewardshipScore;
  reason: string;
}

/**
 * Any Category 1 data reaching the AI scores Zero; Category 2 scores Partial; none scores Full.
 * Only disclosures count: data the gateway withheld in enforce mode never reached the AI.
 */
export function stewardship(events: readonly GatewayEvent[]): Stewardship {
  const leaks = events.filter((e) => e.type === 'leak');
  if (leaks.some((l) => l.category === 'cat1')) return { leaks, score: 'Zero', reason: 'Category 1 (prohibited) data reached the AI.' };
  if (leaks.some((l) => l.category === 'cat2')) return { leaks, score: 'Partial', reason: 'Category 2 (not-for-AI) data reached the AI.' };
  return { leaks, score: 'Full', reason: 'No restricted data reached the AI so far.' };
}

const HABIT_NAME: Record<Habit, string> = { check: 'Check the output', decide: 'Keep the decision', protect: 'Protect the data' };

const leakKey = (l: GatewayEvent) => [
  l.category === 'cat1' ? 'Category 1' : 'Category 2',
  l.label ?? 'restricted data',
  l.channel === 'ai-answer' ? 'in an AI answer or pasted text' : 'opened by the AI',
].join(' | ');

/** Markdown report for the user. Holds labels and counts only, never raw values. */
export function renderReport(state: State, context: string): string {
  const { leaks, score, reason } = stewardship(state.events);
  const reads = [...new Set(state.events.filter((e) => e.type === 'ai-open').map((e) => e.fileId ?? '?'))];
  const refused = state.events.filter((e) => e.type === 'refused').length;
  const withheld = state.events.filter((e) => e.type === 'withheld').length;
  const lines = ['# AI literacy report', '', `Session started ${state.startedAt}. ${context}`, '', `## Data stewardship: ${score}`, reason, ''];
  if (withheld) lines.push(`${withheld} restricted item(s) withheld from the AI by enforce mode.`, '');

  if (leaks.length) {
    const counts = new Map<string, number>();
    for (const l of leaks) counts.set(leakKey(l), (counts.get(leakKey(l)) ?? 0) + 1);
    lines.push('| Category | What | How | Count |', '|---|---|---|---|');
    for (const [key, n] of counts) lines.push(`| ${key} | ${n} |`);
    lines.push('');
  }

  lines.push(`## Files the AI read (${reads.length})`);
  lines.push(...(reads.length ? reads.map((r) => `- ${r}`) : ['- none']));
  if (refused) lines.push('', `${refused} read(s) refused by the access policy.`);
  lines.push('', '## Habits');

  for (const habit of HABITS) {
    const moments = state.events.filter((e) => e.type === 'moment' && e.habit === habit);
    const count = (o: string) => moments.filter((e) => e.outcome === o).length;
    lines.push(`### ${HABIT_NAME[habit]}: ${count('did')} did, ${count('prompted')} after a prompt, ${count('missed')} missed`);
    lines.push(...(moments.length ? moments.slice(-3).map((e) => `- ${e.outcome}: ${e.note}`) : ['- no moments recorded']));
  }
  return lines.join('\n');
}
