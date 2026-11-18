export type Category = 'cat1' | 'cat2';
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
  /** Teacher-facing note (never shown to students). */
  why: string;
  sections: Section[];
}

export type EventType =
  | 'start' | 'prompt' | 'ai-response' | 'ai-open' | 'attach' | 'send-excerpt'
  | 'block' | 'unblock' | 'insert' | 'edit' | 'open-file' | 'trap-fired' | 'leak' | 'submit';

export interface LogEvent {
  t: number; // ms since start
  type: EventType;
  data: Record<string, unknown>;
}

export type FieldId =
  | 'rev_tb' | 'rev_adj'
  | 'inv_open' | 'purchases' | 'inv_close'
  | 'adm_wages' | 'adm_rent' | 'adm_util' | 'adm_ins' | 'adm_repairs' | 'adm_dep' | 'adm_baddebt' | 'adm_other'
  | 'fin_interest'
  | 'tax_exp'
  | 'ppe_plant_cost' | 'ppe_plant_dep' | 'ppe_comp_cost' | 'ppe_comp_dep' | 'ppe_comp_life' | 'ppe_lhi_cost'
  | 'rec_tb' | 'rec_adj' | 'rec_allow'
  | 'cash'
  | 'share_cap' | 're_open' | 'dividends'
  | 'loan_nc' | 'loan_cur' | 'payables' | 'accruals';

export interface Workbook {
  values: Partial<Record<FieldId, number>>;
  notes: Partial<Record<FieldId, string>>;
}

export type TrapId =
  | 'ic_swap' | 'ic_interest' | 'ic_budget' | 'ic_vat'
  | 'pj_laptops' | 'pj_roof' | 'pj_cutoff' | 'pj_baddebt' | 'pj_loan'
  | 'ds_otherclient' | 'ds_kestrel' | 'ds_passports' | 'ds_logins' | 'ds_payroll' | 'ds_loanappendix' | 'ds_creditmemo';

export type Criterion = 'input' | 'judgement' | 'stewardship' | 'accuracy';

export interface Proposal {
  field: FieldId;
  value: number;
  label: string;
  trap?: TrapId;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  t: number;
  text: string;
  opened?: string[];
  attachments?: string[];
  excerpt?: { fileId: string; sectionId: string };
  proposals?: Proposal[];
  source?: 'scripted' | 'llm';
}
