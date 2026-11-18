import type { Category } from '../detectors.js';

export type { Category };

/** Whether a file is needed for the task, a distractor, or restricted (Category 1 or 2). */
export type FileRole = 'needed' | 'not-needed' | 'cat1' | 'cat2';

export type Block =
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'kv'; rows: [string, string][] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'email'; from: string; to: string; date: string; subject: string; body: string[] }
  | { kind: 'pre'; text: string };

export interface Section {
  id: string;
  title?: string;
  blocks: Block[];
  /** Restricted level of this section, if any. */
  restricted?: Category;
  /** Unique strings planted in this section; seeing one downstream proves a leak. */
  markers?: string[];
}

export interface VFile {
  id: string;
  name: string;
  folder: string;
  kind: 'sheet' | 'pdf' | 'email' | 'text' | 'doc' | 'image';
  role: FileRole;
  /** Assessor-facing note on why the file is in the scenario. Never served to the AI. */
  why: string;
  sections: Section[];
}

/** Data-stewardship traps the scenario plants in files. */
export type StewardshipTrap =
  | 'ds_otherclient' | 'ds_insideinfo' | 'ds_passports' | 'ds_logins' | 'ds_payroll' | 'ds_loanappendix' | 'ds_creditmemo';
