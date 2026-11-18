import { detect, redact, redactValue, type Hit, type SensitiveTerm } from './detectors.js';
import { FILES, scanMarkers } from './scenario/scenario.js';

export interface ScanOptions {
  /** Owner-defined sensitive terms (workspace mode). */
  terms: readonly SensitiveTerm[];
  /** Also look for the scenario's planted markers. */
  scenario: boolean;
}

/** Detect restricted data in free text: generic detectors, plus planted markers in scenario mode. */
export function scanText(body: string, { terms, scenario }: ScanOptions): Hit[] {
  const hits = detect(body, [...terms]);
  if (!scenario) return hits;
  const lower = body.toLowerCase();
  for (const m of scanMarkers(body)) {
    const index = lower.indexOf(m.marker.toLowerCase());
    const source = FILES.find((f) => f.id === m.fileId)?.name ?? m.fileId;
    hits.push({
      category: m.category,
      label: `restricted data from ${source}`,
      match: redactValue(m.marker),
      index,
      length: m.marker.length,
      line: body.slice(0, index).split('\n').length,
    });
  }
  return hits;
}

export const MAX_NOTE_LENGTH = 300;

/** A note safe to store: restricted values replaced by their labels, then truncated. */
export function cleanNote(note: string, options: ScanOptions): string {
  return redact(note, scanText(note, options)).slice(0, MAX_NOTE_LENGTH);
}
