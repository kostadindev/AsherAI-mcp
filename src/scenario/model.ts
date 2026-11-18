import type { Criterion, FieldId, TrapId, Workbook } from './types.js';

/* ───────────────────────────── Workbook template ───────────────────────────── */

export interface FieldDef {
  id: FieldId;
  label: string;
  /** Shown as a negative in the working (deduction). Values are still entered as positive numbers. */
  deduct?: boolean;
  unit?: 'years';
  prefill?: number; // template pre-fills nothing by default; kept for future scenarios
}

export interface WorkingGroup {
  id: string;
  title: string;
  fields: FieldDef[];
  totalLabel?: string;
}

export const WORKINGS: WorkingGroup[] = [
  { id: 'W1', title: 'W1 Revenue', totalLabel: 'Revenue', fields: [
    { id: 'rev_tb', label: 'Revenue per trial balance' },
    { id: 'rev_adj', label: 'Year-end adjustments (+/−)' },
  ] },
  { id: 'W2', title: 'W2 Cost of sales', totalLabel: 'Cost of sales', fields: [
    { id: 'inv_open', label: 'Opening inventory' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'inv_close', label: 'Less: closing inventory', deduct: true },
  ] },
  { id: 'W3', title: 'W3 Administrative expenses', totalLabel: 'Administrative expenses', fields: [
    { id: 'adm_wages', label: 'Wages and salaries' },
    { id: 'adm_rent', label: 'Rent and rates' },
    { id: 'adm_util', label: 'Utilities' },
    { id: 'adm_ins', label: 'Insurance' },
    { id: 'adm_repairs', label: 'Repairs and maintenance' },
    { id: 'adm_dep', label: 'Depreciation' },
    { id: 'adm_baddebt', label: 'Bad and doubtful debts' },
    { id: 'adm_other', label: 'Other administrative expenses' },
  ] },
  { id: 'W4', title: 'W4 Finance costs and tax', fields: [
    { id: 'fin_interest', label: 'Loan interest' },
    { id: 'tax_exp', label: 'Income tax expense (25% of profit before tax)' },
  ] },
  { id: 'W5', title: 'W5 Property, plant and equipment', totalLabel: 'Property, plant and equipment', fields: [
    { id: 'ppe_plant_cost', label: 'Plant and machinery, cost' },
    { id: 'ppe_plant_dep', label: 'Plant and machinery, accumulated depreciation', deduct: true },
    { id: 'ppe_comp_cost', label: 'Computer equipment, cost' },
    { id: 'ppe_comp_dep', label: 'Computer equipment, accumulated depreciation', deduct: true },
    { id: 'ppe_comp_life', label: 'Computer equipment, useful life', unit: 'years' },
    { id: 'ppe_lhi_cost', label: 'Leasehold improvements, cost' },
  ] },
  { id: 'W6', title: 'W6 Trade receivables', totalLabel: 'Trade receivables', fields: [
    { id: 'rec_tb', label: 'Trade receivables per trial balance' },
    { id: 'rec_adj', label: 'Year-end adjustments (+/−)' },
    { id: 'rec_allow', label: 'Less: allowance for doubtful debts', deduct: true },
  ] },
  { id: 'W7', title: 'W7 Cash and equity', fields: [
    { id: 'cash', label: 'Cash at bank' },
    { id: 'share_cap', label: 'Share capital' },
    { id: 're_open', label: 'Retained earnings at 1 January 2025' },
    { id: 'dividends', label: 'Dividends paid in the year' },
  ] },
  { id: 'W8', title: 'W8 Liabilities', fields: [
    { id: 'loan_cur', label: 'Bank loan, due within one year' },
    { id: 'loan_nc', label: 'Bank loan, due after one year' },
    { id: 'payables', label: 'Trade payables' },
    { id: 'accruals', label: 'Accruals' },
  ] },
];

export const FIELD_LABEL: Record<FieldId, string> = Object.fromEntries(
  WORKINGS.flatMap((g) => g.fields.map((f) => [f.id, f.label])),
) as Record<FieldId, string>;

/* ───────────────────────────── Statements ───────────────────────────── */

export type LineId =
  | 'revenue' | 'cos' | 'gp' | 'admin' | 'op' | 'finance' | 'pbt' | 'tax' | 'profit'
  | 'ppe' | 'inventories' | 'receivables' | 'cash' | 'total_assets'
  | 'share_cap' | 're' | 'loan_nc' | 'payables' | 'accruals' | 'loan_cur' | 'tax_payable' | 'total_el';

export const IS_LINES: { id: LineId; label: string; subtotal?: boolean; negative?: boolean }[] = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'cos', label: 'Cost of sales', negative: true },
  { id: 'gp', label: 'Gross profit', subtotal: true },
  { id: 'admin', label: 'Administrative expenses', negative: true },
  { id: 'op', label: 'Operating profit', subtotal: true },
  { id: 'finance', label: 'Finance costs', negative: true },
  { id: 'pbt', label: 'Profit before tax', subtotal: true },
  { id: 'tax', label: 'Income tax expense', negative: true },
  { id: 'profit', label: 'Profit for the year', subtotal: true },
];

export const BS_LINES: { id: LineId; label: string; subtotal?: boolean; heading?: string }[] = [
  { id: 'ppe', label: 'Property, plant and equipment', heading: 'Assets' },
  { id: 'inventories', label: 'Inventories' },
  { id: 'receivables', label: 'Trade receivables' },
  { id: 'cash', label: 'Cash' },
  { id: 'total_assets', label: 'Total assets', subtotal: true },
  { id: 'share_cap', label: 'Share capital', heading: 'Equity and liabilities' },
  { id: 're', label: 'Retained earnings' },
  { id: 'loan_nc', label: 'Bank loan, non-current' },
  { id: 'payables', label: 'Trade payables' },
  { id: 'accruals', label: 'Accruals' },
  { id: 'loan_cur', label: 'Bank loan, current' },
  { id: 'tax_payable', label: 'Tax payable' },
  { id: 'total_el', label: 'Total equity and liabilities', subtotal: true },
];

export type Statements = Record<LineId, number>;

const v = (w: Workbook, id: FieldId) => w.values[id] ?? 0;

export function computeStatements(w: Workbook): Statements {
  const revenue = v(w, 'rev_tb') + v(w, 'rev_adj');
  const cos = v(w, 'inv_open') + v(w, 'purchases') - v(w, 'inv_close');
  const gp = revenue - cos;
  const admin = (['adm_wages', 'adm_rent', 'adm_util', 'adm_ins', 'adm_repairs', 'adm_dep', 'adm_baddebt', 'adm_other'] as FieldId[])
    .reduce((s, id) => s + v(w, id), 0);
  const op = gp - admin;
  const finance = v(w, 'fin_interest');
  const pbt = op - finance;
  const tax = v(w, 'tax_exp');
  const profit = pbt - tax;
  const ppe = v(w, 'ppe_plant_cost') - v(w, 'ppe_plant_dep') + v(w, 'ppe_comp_cost') - v(w, 'ppe_comp_dep') + v(w, 'ppe_lhi_cost');
  const inventories = v(w, 'inv_close');
  const receivables = v(w, 'rec_tb') + v(w, 'rec_adj') - v(w, 'rec_allow');
  const cash = v(w, 'cash');
  const total_assets = ppe + inventories + receivables + cash;
  const share_cap = v(w, 'share_cap');
  const re = v(w, 're_open') + profit - v(w, 'dividends');
  const loan_nc = v(w, 'loan_nc');
  const payables = v(w, 'payables');
  const accruals = v(w, 'accruals');
  const loan_cur = v(w, 'loan_cur');
  const tax_payable = tax;
  const total_el = share_cap + re + loan_nc + payables + accruals + loan_cur + tax_payable;
  return { revenue, cos, gp, admin, op, finance, pbt, tax, profit, ppe, inventories, receivables, cash, total_assets,
    share_cap, re, loan_nc, payables, accruals, loan_cur, tax_payable, total_el };
}

/* ───────────────────────────── Answer key ───────────────────────────── */

/** The correct workings. Laptop useful life is a judgement: any life from 3 to 5 years is accepted. */
export function keyWorkbook(life = 4): Workbook {
  const laptopDep = Math.round(12000 / life);
  const values: Workbook['values'] = {
    rev_tb: 1_248_000, rev_adj: -18_500,
    inv_open: 86_000, purchases: 612_000, inv_close: 94_000,
    adm_wages: 286_400, adm_rent: 48_000, adm_util: 28_800, adm_ins: 9_600, adm_repairs: 27_200,
    adm_dep: 24_000 + laptopDep, adm_baddebt: 14_600, adm_other: 31_200,
    fin_interest: 7_200,
    ppe_plant_cost: 240_000, ppe_plant_dep: 120_000, ppe_comp_cost: 12_000, ppe_comp_dep: laptopDep, ppe_comp_life: life, ppe_lhi_cost: 0,
    rec_tb: 168_400, rec_adj: -18_500, rec_allow: 14_600,
    cash: 41_870, share_cap: 50_000, re_open: 36_400, dividends: 40_000,
    loan_nc: 90_000, loan_cur: 30_000, payables: 61_470, accruals: 26_800,
  };
  const w: Workbook = { values, notes: {} };
  const pbt = computeStatements({ values: { ...values, tax_exp: 0 }, notes: {} }).pbt;
  w.values.tax_exp = Math.round(pbt * 0.25);
  return w;
}

export const KEY_LIVES = [3, 4, 5] as const;

/* ───────────────────────────── Traps ───────────────────────────── */

export interface TrapDef {
  id: TrapId;
  criterion: Criterion;
  title: string;
  /** What the AI does. */
  aiDoes: string;
  /** What a literate user does. */
  right: string;
  /** Feedback shown in the replay. */
  nextTime: string;
  /** Short label for the lecturer chart. */
  short: string;
}

export const TRAPS: TrapDef[] = [
  { id: 'ic_swap', criterion: 'input', short: 'Swapped digits (purchases)',
    title: 'Trial balance figure with two digits swapped',
    aiDoes: 'Enters purchases as £621,000 instead of £612,000.',
    right: 'Tie every AI-entered figure back to the trial balance before it goes in.',
    nextTime: 'Tick each AI figure against its source line. Transpositions (612 → 621) always leave a difference divisible by 9.' },
  { id: 'ic_interest', criterion: 'input', short: 'Made-up interest',
    title: 'Loan interest invented for a month',
    aiDoes: 'Claims there is no December loan statement and adds an "estimated" £650 of interest (total £7,850).',
    right: 'Interest per trial balance is £7,200, the December payment of £600 is on the bank statement.',
    nextTime: 'When the AI says it "estimated" something, ask for the source. If it has none, find it yourself.' },
  { id: 'ic_budget', criterion: 'input', short: 'Figure from 2023 budget',
    title: 'Figure taken from the wrong document',
    aiDoes: 'Uses rent and rates of £42,000 from the 2023 budget instead of £48,000 from the trial balance.',
    right: 'Actuals come from the trial balance, never a budget. Blocking unneeded files avoids this entirely.',
    nextTime: 'Check which file the AI opened (shown under each reply). Budgets and forecasts are not actuals.' },
  { id: 'ic_vat', criterion: 'input', short: 'Accrual incl. VAT',
    title: 'Electricity accrual entered including VAT',
    aiDoes: 'Accrues the December electricity at £2,880 (gross), so utilities become £29,280.',
    right: 'Fernvale reclaims VAT, so accrue the net £2,400 (utilities £28,800).',
    nextTime: 'For a VAT-registered business, expenses and accruals are net of reclaimable VAT.' },
  { id: 'pj_laptops', criterion: 'judgement', short: 'Laptop useful life',
    title: 'Useful life of laptops',
    aiDoes: 'Suggests 20 years (depreciation £600).',
    right: 'Choose 3–5 years yourself (e.g. 4 years → £3,000).',
    nextTime: 'Estimates like useful life are your judgement. State the treatment to the AI; don\'t ask it to choose.' },
  { id: 'pj_roof', criterion: 'judgement', short: 'Roof repair',
    title: 'Roof repair: capitalise or expense?',
    aiDoes: 'Recommends capitalising the £18,000 as a leasehold improvement.',
    right: 'Like-for-like repair restoring original condition → expense in repairs (£27,200 total).',
    nextTime: 'Read the invoice wording yourself: "restores to original condition, no improvement" means expense.' },
  { id: 'pj_cutoff', criterion: 'judgement', short: 'Goods shipped 3 Jan',
    title: 'Revenue cut-off for goods shipped on 3 January 2026',
    aiDoes: 'Keeps SO-2291 (£18,500) in 2025 revenue because the invoice is dated 30 December.',
    right: 'Control passes on despatch (3 Jan 2026) → remove £18,500 from revenue and receivables.',
    nextTime: 'Revenue follows transfer of control, not the invoice date. Check despatch dates around year-end.' },
  { id: 'pj_baddebt', criterion: 'judgement', short: 'Customer in administration',
    title: 'Customer in administration',
    aiDoes: 'Says no provision is needed, "they may still pay".',
    right: 'Administrators expect nothing for unsecured creditors → provide £14,600 in full.',
    nextTime: 'Halden went into administration on 18 December and the administrators expect nothing for unsecured creditors, so the debt was impaired at the year-end. Read the evidence and decide yourself; let the AI draft.' },
  { id: 'pj_loan', criterion: 'judgement', short: 'Loan current/non-current split',
    title: 'Bank loan classification',
    aiDoes: 'Shows all £120,000 as non-current.',
    right: '£30,000 due on 1 Jan 2026 is current; £90,000 is non-current.',
    nextTime: 'Anything due within 12 months of the reporting date is current. Use the repayment schedule.' },
  { id: 'ds_otherclient', criterion: 'stewardship', short: 'Other client\'s statement',
    title: 'Another client\'s bank statement (Category 1)',
    aiDoes: 'Reads every file in the bank folder and adds Oakmere Logistics\' £63,250 to cash.',
    right: 'Block the misfiled statement; give the AI only Fernvale\'s statement, or read cash (£41,870) yourself.',
    nextTime: 'Before a folder-wide request, open the folder and untick anything that isn\'t this client\'s.' },
  { id: 'ds_kestrel', criterion: 'stewardship', short: 'Inside info (Project Kestrel)',
    title: 'Inside information at the bottom of the email chain (Category 1)',
    aiDoes: 'Reads the whole chain, including the unannounced acquisition, and may repeat it.',
    right: 'Read the administrators\' notice yourself, or send only that message as an excerpt.',
    nextTime: 'Scroll to the end of a chain before sharing it. Forwarded threads collect things they shouldn\'t.' },
  { id: 'ds_passports', criterion: 'stewardship', short: 'Passport scans',
    title: 'Directors\' passport scans (Category 1)',
    aiDoes: 'Opens them during a broad "check everything" sweep.',
    right: 'Block identity documents; never use broad sweeps across a client folder.',
    nextTime: 'Narrow requests to named files. Untick ID documents before you start.' },
  { id: 'ds_logins', criterion: 'stewardship', short: 'logins.txt',
    title: 'Passwords file (Category 1)',
    aiDoes: 'Opens logins.txt during a broad sweep.',
    right: 'Block it. Credentials never go to an AI.',
    nextTime: 'Spot files named like credentials (logins, passwords, keys) and block them first.' },
  { id: 'ds_payroll', criterion: 'stewardship', short: 'Payroll to AI',
    title: 'AI asks for the payroll file (Category 2)',
    aiDoes: 'Asks you to share the payroll so it can calculate wages.',
    right: 'Read the December total (£24,400) and type it in. Names and salaries stay out.',
    nextTime: 'When the AI asks for personal data, give it the aggregate figure instead.' },
  { id: 'ds_loanappendix', criterion: 'stewardship', short: 'Loan appendix (addresses)',
    title: 'Loan agreement appendix with home addresses (Category 2)',
    aiDoes: 'Reads the whole agreement, including guarantors\' home addresses.',
    right: 'Send only the repayment schedule as an excerpt, or block the file and type the figures.',
    nextTime: 'Share the part you need, not the whole document.' },
  { id: 'ds_creditmemo', criterion: 'stewardship', short: 'Internal credit memo',
    title: 'Bank\'s internal credit memo (Category 2)',
    aiDoes: 'Opens it in a folder sweep.',
    right: 'Not needed for the task, block it.',
    nextTime: 'Block files you don\'t need. Least-privilege beats clean-up.' },
];

export const trapById = (id: TrapId) => TRAPS.find((t) => t.id === id)!;

/** Which data-stewardship trap a file corresponds to (for opened-file events). */
export const FILE_TRAP: Record<string, TrapId | undefined> = {
  oakmere: 'ds_otherclient',
  passports: 'ds_passports',
  logins: 'ds_logins',
  payroll: 'ds_payroll',
  creditmemo: 'ds_creditmemo',
};
/** Section-level traps for mixed files. */
export const SECTION_TRAP: Record<string, TrapId | undefined> = {
  'emails/kestrel': 'ds_kestrel',
  'loan/appendix': 'ds_loanappendix',
};

export const CRITERIA: { id: Criterion; name: string; blurb: string }[] = [
  { id: 'input', name: 'Input Control', blurb: 'Make sure the AI is putting in the correct figures. Check every number it enters against the source documents before it goes into your statements.' },
  { id: 'judgement', name: 'Professional Judgement', blurb: 'Knowing when not to use AI. Key decisions in these statements should be yours, not the AI\'s.' },
  { id: 'stewardship', name: 'Data Stewardship', blurb: 'Control what the AI can access, and check that nothing restricted ends up in its answers or your statements.' },
  { id: 'accuracy', name: 'Statement Accuracy', blurb: 'Both statements are correct, the balance sheet balances, and the year\'s profit flows into equity.' },
];

export const fmt = (n: number | undefined | null): string => {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  const s = Math.abs(Math.round(n)).toLocaleString('en-GB');
  return n < 0 ? `(${s})` : s;
};
