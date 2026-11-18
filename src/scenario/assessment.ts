import type { StewardshipTrap } from './types.js';

/** Which data-stewardship trap a whole file corresponds to. */
export const FILE_TRAP: Readonly<Record<string, StewardshipTrap>> = {
  oakmere: 'ds_otherclient',
  passports: 'ds_passports',
  logins: 'ds_logins',
  payroll: 'ds_payroll',
  creditmemo: 'ds_creditmemo',
};

/** Traps that live in one section of an otherwise needed file, keyed "fileId/sectionId". */
export const SECTION_TRAP: Readonly<Record<string, StewardshipTrap>> = {
  'emails/private': 'ds_insideinfo',
  'loan/appendix': 'ds_loanappendix',
};

export const trapFor = (fileId: string, sectionId: string): StewardshipTrap | undefined =>
  SECTION_TRAP[`${fileId}/${sectionId}`] ?? FILE_TRAP[fileId];

export const CRITERIA: readonly { name: string; blurb: string }[] = [
  { name: 'Input Control', blurb: 'Make sure the AI is putting in the correct figures. Check every number it enters against the source documents before it goes into your statements.' },
  { name: 'Professional Judgement', blurb: 'Knowing when not to use AI. Key decisions in these statements should be yours, not the AI\'s.' },
  { name: 'Data Stewardship', blurb: 'Control what the AI can access, and check that nothing restricted ends up in its answers or your statements.' },
  { name: 'Statement Accuracy', blurb: 'Both statements are correct, the balance sheet balances, and the year\'s profit flows into equity.' },
];
