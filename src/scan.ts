import { detect, mergeHits, redact, redactValue, type Hit, type SensitiveTerm } from './detectors.js';
import { scanMarkers } from './scenario/scenario.js';

export interface ScanOptions {
  /** Owner-defined sensitive terms (workspace mode). */
  terms: readonly SensitiveTerm[];
  /** Also look for the scenario's planted markers. */
  scenario: boolean;
}

/** Every occurrence of `needle` in `haystack`, case-insensitive. */
function occurrences(haystack: string, needle: string): number[] {
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const found: number[] = [];
  for (let at = lowerHay.indexOf(lowerNeedle); at !== -1; at = lowerHay.indexOf(lowerNeedle, at + lowerNeedle.length)) found.push(at);
  return found;
}

/** Detect restricted data in free text: generic detectors, plus planted markers in scenario mode. */
export function scanText(body: string, { terms, scenario }: ScanOptions): Hit[] {
  const hits = detect(body, [...terms]);
  if (!scenario) return hits;
  for (const m of scanMarkers(body)) {
    for (const index of occurrences(body, m.marker)) {
      hits.push({
        category: m.category,
        label: `restricted data from ${m.fileId}`,
        match: redactValue(m.marker),
        index,
        length: m.marker.length,
        line: body.slice(0, index).split('\n').length,
      });
    }
  }
  return mergeHits(body, hits);
}

export const MAX_NOTE_LENGTH = 300;

/** A note safe to store: restricted values replaced by their labels, then truncated. */
export function cleanNote(note: string, options: ScanOptions): string {
  return redact(note, scanText(note, options)).slice(0, MAX_NOTE_LENGTH);
}
