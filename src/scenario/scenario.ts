import type { Category, VFile } from './types.js';

/**
 * Scenario: Calder Wren Bank, junior analyst. Client: Fernvale Kitchens Ltd.
 * Year ended 31 December 2025. All entities and people are fictional.
 */
export const SCENARIO = {
  bank: 'Calder Wren Bank',
  client: 'Fernvale Kitchens Ltd',
  yearEnd: '31 December 2025',
};

export const FOLDERS = ['Year-end 2025', 'Bank & Loan', 'Other'] as const;

export const FILES: VFile[] = [
  // ───────────────────────── Year-end 2025 ─────────────────────────
  {
    id: 'tb',
    name: 'Trial balance 31.12.2025.xlsx',
    folder: 'Year-end 2025',
    kind: 'sheet',
    role: 'needed',
    why: 'Primary source. Pre-adjustment trial balance. Purchases 612,000 (AI transposes to 621,000).',
    sections: [
      {
        id: 'main',
        title: 'Fernvale Kitchens Ltd (VAT reg. GB 318 2214 60) — Trial balance at 31 December 2025 (before year-end adjustments)',
        blocks: [
          {
            kind: 'table',
            headers: ['Code', 'Account', 'Debit £', 'Credit £'],
            rows: [
              ['4000', 'Revenue', '', '1,248,000'],
              ['1300', 'Inventory at 1 January 2025', '86,000', ''],
              ['5000', 'Purchases', '612,000', ''],
              ['7000', 'Wages and salaries (Jan–Nov)', '262,000', ''],
              ['7100', 'Rent and rates', '48,000', ''],
              ['7200', 'Utilities (Jan–Nov)', '26,400', ''],
              ['7300', 'Insurance', '9,600', ''],
              ['7400', 'Repairs and maintenance', '9,200', ''],
              ['7900', 'Other administrative expenses', '31,200', ''],
              ['8000', 'Loan interest', '7,200', ''],
              ['0100', 'Plant and machinery — cost', '240,000', ''],
              ['0110', 'Plant and machinery — accumulated depreciation at 1 Jan 2025', '', '96,000'],
              ['0200', 'Computer equipment — cost (additions 2025)', '12,000', ''],
              ['1100', 'Trade receivables', '168,400', ''],
              ['1200', 'Cash at bank', '41,870', ''],
              ['9999', 'Suspense — Ridgeway Roofing invoice (to be allocated)', '18,000', ''],
              ['3000', 'Share capital', '', '50,000'],
              ['3100', 'Retained earnings at 1 January 2025', '', '36,400'],
              ['3200', 'Dividends paid', '40,000', ''],
              ['2300', 'Bank loan — Calder Wren Bank', '', '120,000'],
              ['2100', 'Trade payables', '', '61,470'],
              ['', 'Totals', '1,611,870', '1,611,870'],
            ],
          },
          {
            kind: 'p',
            text: 'Note 1: Closing inventory per physical stock count at 31 December 2025: £94,000. The count includes goods for order SO-2291 held in the warehouse awaiting dispatch.',
          },
          {
            kind: 'p',
            text: 'Note 2: Depreciation, year-end accruals and tax for 2025 have not yet been posted.',
          },
        ],
      },
    ],
  },
  {
    id: 'far',
    name: 'Fixed asset register 2025.xlsx',
    folder: 'Year-end 2025',
    kind: 'sheet',
    role: 'needed',
    why: 'Plant depreciation 24,000 given. Laptop useful life left blank — a judgement call (3–5 yrs). AI applies the 10-year plant policy.',
    sections: [
      {
        id: 'register',
        title: 'Fixed asset register',
        blocks: [
          {
            kind: 'table',
            headers: ['Class', 'Cost £', 'Acc. dep b/f £', 'Policy', 'Charge 2025 £'],
            rows: [
              ['Plant and machinery', '240,000', '96,000', '10% straight line', '24,000'],
              ['Computer equipment (12 laptops, bought 2 Jan 2025)', '12,000', '0', 'Straight line, nil residual — useful life to be set at year-end', 'TBC'],
            ],
          },
          { kind: 'p', text: 'Premises are leased (rent shown in rent and rates). The company owns no land or buildings.' },
        ],
      },
      {
        id: 'invoice',
        title: 'Attached: Pixelpoint Systems invoice PX-55102',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Date', '2 January 2025'],
              ['Description', '12 × ProBook 14 business laptops, 3-year manufacturer warranty'],
              ['Net', '£12,000.00'],
              ['VAT 20%', '£2,400.00 (reclaimed)'],
              ['Total', '£14,400.00'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'roof',
    name: 'Invoice – Ridgeway Roofing RR-0917.pdf',
    folder: 'Year-end 2025',
    kind: 'pdf',
    role: 'needed',
    why: 'Like-for-like repair after storm damage — expense. AI suggests capitalising as a leasehold improvement because of the trusses.',
    sections: [
      {
        id: 'main',
        title: 'Ridgeway Roofing Ltd — Invoice RR-0917',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Invoice date', '14 November 2025'],
              ['Customer', 'Fernvale Kitchens Ltd, Unit 4 Marsh Lane Trading Estate'],
              ['Work', 'Storm damage, leased warehouse roof: replace 40 damaged slates, lead flashing and two broken trusses like-for-like.'],
              ['Net', '£18,000.00'],
              ['VAT 20%', '£3,600.00 (reclaimed)'],
              ['Total', '£21,600.00'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'elec',
    name: 'Invoice – Northwind Energy Dec 2025.pdf',
    folder: 'Year-end 2025',
    kind: 'pdf',
    role: 'needed',
    why: 'December electricity — accrue net 2,400 (VAT reclaimable). AI accrues 2,880 incl. VAT.',
    sections: [
      {
        id: 'main',
        title: 'Northwind Energy — Business electricity invoice NE-889201',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Invoice date', '9 January 2026'],
              ['Customer', 'Fernvale Kitchens Ltd, VAT no. GB 318 2214 60'],
              ['Supply period', '1–31 December 2025'],
              ['Energy charge (net)', '£2,400.00'],
              ['VAT 20%', '£480.00'],
              ['Total due', '£2,880.00'],
              ['Status', 'Received January 2026 — not posted in 2025 ledgers'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ship',
    name: 'Shipping notes Dec25–Jan26.pdf',
    folder: 'Year-end 2025',
    kind: 'pdf',
    role: 'needed',
    why: 'SO-2291 invoiced 30 Dec but shipped 3 Jan 2026 — remove from 2025 revenue and receivables. AI includes it.',
    sections: [
      {
        id: 'main',
        title: 'Despatch log — December 2025 to January 2026',
        blocks: [
          {
            kind: 'table',
            headers: ['Order', 'Customer', 'Invoice date', 'Despatched', 'Invoice £'],
            rows: [
              ['SO-2284', 'Brookfield Interiors', '22 Dec 2025', '22 Dec 2025', '21,300'],
              ['SO-2288', 'Holt & Daughters', '29 Dec 2025', '29 Dec 2025', '9,750'],
              ['SO-2291', 'Larchmont Homes', '30 Dec 2025', '3 Jan 2026', '18,500'],
              ['SO-2295', 'Brookfield Interiors', '6 Jan 2026', '6 Jan 2026', '12,100'],
            ],
          },
          { kind: 'p', text: 'All invoices dated in 2025 are included in the trial balance revenue and trade receivables.' },
          { kind: 'p', text: 'Standard terms of sale (clause 4.2): risk and control of the goods pass to the customer on despatch from our warehouse.' },
        ],
      },
    ],
  },
  {
    id: 'emails',
    name: 'Email chain – Halden Retail.eml',
    folder: 'Year-end 2025',
    kind: 'email',
    role: 'needed',
    why: 'Needed for bad-debt provision (full 14,600). Bottom message is inside information (Project Kestrel) — Category 1.',
    sections: [
      {
        id: 'thread',
        blocks: [
          {
            kind: 'email',
            from: 'credit.control@fernvalekitchens.co.uk',
            to: 'finance@fernvalekitchens.co.uk',
            date: '12 Dec 2025 09:14',
            subject: 'Halden Retail Ltd — overdue balance',
            body: ['Halden Retail Ltd owes £14,600 (invoices from August and September). Now over 90 days. Three chasers sent, no reply.'],
          },
          {
            kind: 'email',
            from: 'notices@grantlowe-insolvency.co.uk',
            to: 'creditors@haldenretail.co.uk (bcc creditors)',
            date: '19 Dec 2025 16:02',
            subject: 'Halden Retail Ltd (in administration) — notice to creditors',
            body: [
              'Halden Retail Ltd entered administration on 18 December 2025.',
              'Based on current estimates, the joint administrators do not expect any distribution to be made to unsecured creditors.',
            ],
          },
          {
            kind: 'email',
            from: 'finance@fernvalekitchens.co.uk',
            to: 'relationship.team@calderwren.co.uk',
            date: '05 Jan 2026 11:40',
            subject: 'FW: Halden — for the year-end pack',
            body: ['Forwarding for the year-end pack. We are an unsecured creditor for the full £14,600.'],
          },
        ],
      },
      {
        id: 'kestrel',
        restricted: 'cat1',
        markers: ['Project Kestrel', 'Marlowe Group', 'Tessaly Ovens', '412p'],
        blocks: [
          {
            kind: 'email',
            from: 'j.hart@calderwren.co.uk',
            to: 'relationship.team@calderwren.co.uk',
            date: '06 Jan 2026 08:02',
            subject: 'STRICTLY PRIVATE — Project Kestrel',
            body: [
              'Do not forward. Our corporate finance team is advising Marlowe Group plc on an unannounced cash offer for Tessaly Ovens plc (Fernvale\'s main competitor) at 412p per share. Announcement expected late January. Insider list applies.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'payroll',
    name: 'Payroll – December 2025.xlsx',
    folder: 'Year-end 2025',
    kind: 'sheet',
    role: 'cat2',
    why: 'Category 2 (employee personal data). Needed for the December wages accrual of 24,400 — read the total, do not give the file to the AI.',
    sections: [
      {
        id: 'staff',
        restricted: 'cat2',
        markers: [
          'Daniel Mercer', 'Aisha Khalid', 'Tomasz Nowak', 'Grace Whitfield',
          'JR 48 31 22 C', 'PK 19 60 47 A', 'SN 72 05 18 B', 'TC 33 84 09 D',
          '27 Orchard Rise', '3 Fen View', '11 Mill Close', '8 Kiln Lane',
        ],
        title: 'December 2025 payroll — paid 2 January 2026 (not yet posted)',
        blocks: [
          {
            kind: 'table',
            headers: ['Employee', 'Role', 'NI number', 'Home address', 'Annual salary £', 'Dec gross £'],
            rows: [
              ['Daniel Mercer', 'Operations Director', 'JR 48 31 22 C', '27 Orchard Rise, Bury St Edmunds', '75,000', '6,250'],
              ['Aisha Khalid', 'Finance Manager', 'PK 19 60 47 A', '3 Fen View, Ely', '48,000', '4,000'],
              ['Tomasz Nowak', 'Workshop Lead', 'SN 72 05 18 B', '11 Mill Close, Soham', '36,000', '3,000'],
              ['Grace Whitfield', 'Sales Executive', 'TC 33 84 09 D', '8 Kiln Lane, Newmarket', '30,000', '2,500'],
              ['8 workshop staff', 'Fitters', '(see HR file)', '(see HR file)', '', '6,150'],
            ],
          },
        ],
      },
      {
        id: 'totals',
        title: 'Totals',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Gross pay (December)', '£21,900'],
              ['Employer NI and pension', '£2,500'],
              ['Total December employment cost', '£24,400'],
              ['Jan–Nov already in trial balance', '£262,000'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'passports',
    name: 'KYC pack – directors.pdf',
    folder: 'Year-end 2025',
    kind: 'image',
    role: 'cat1',
    why: 'Category 1 identity documents. Swept by a broad "check everything" request.',
    sections: [
      {
        id: 'main',
        restricted: 'cat1',
        markers: ['553829174', '761204338'],
        title: 'KYC — director identity documents',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Director', 'Priya Raman — UK passport no. 553829174, DOB 14/03/1979, expires 2031'],
              ['Director', 'Thomas Ashby — UK passport no. 761204338, DOB 02/11/1971, expires 2029'],
            ],
          },
          { kind: 'p', text: '[scanned image pages 1–2]' },
        ],
      },
    ],
  },
  {
    id: 'logins',
    name: 'portal-setup.txt',
    folder: 'Year-end 2025',
    kind: 'text',
    role: 'cat1',
    why: 'Category 1 credentials. Swept by a broad request.',
    sections: [
      {
        id: 'main',
        restricted: 'cat1',
        markers: ['Kingfisher!2025', 'fernvale-admin', 'Bluebell#77'],
        blocks: [
          {
            kind: 'pre',
            text: 'Portal set-up notes, updated December 2025\n\naccounting portal   user: fernvale-admin   pw: Kingfisher!2025\nbank online         user: FVK0091       pw: Bluebell#77\npayroll bureau      user: fvk.payroll   pw: (ask Aisha)\n\nExports run nightly at 02:00. Raise portal issues with the IT helpdesk.',
          },
        ],
      },
    ],
  },

  // ───────────────────────── Bank & Loan ─────────────────────────
  {
    id: 'bankstmt',
    name: 'Bank statement Dec 2025 – Fernvale.pdf',
    folder: 'Bank & Loan',
    kind: 'pdf',
    role: 'needed',
    why: 'Closing cash 41,870. Shows December interest of £600 paid — proves interest is 7,200, not 7,850.',
    sections: [
      {
        id: 'main',
        title: 'Calder Wren Bank — Business current account — Fernvale Kitchens Ltd — sort code 40-22-18, account ****5531',
        blocks: [
          {
            kind: 'table',
            headers: ['Date', 'Description', 'Out £', 'In £', 'Balance £'],
            rows: [
              ['01 Dec', 'Opening balance', '', '', '38,215'],
              ['05 Dec', 'Receipts — trade customers', '', '64,300', '102,515'],
              ['15 Dec', 'Payments — suppliers', '41,120', '', '61,395'],
              ['20 Dec', 'Dividend paid', '20,000', '', '41,395'],
              ['22 Dec', 'Receipts — trade customers', '', '18,875', '60,270'],
              ['30 Dec', 'Rent — December (Marsh Lane unit)', '4,000', '', '56,270'],
              ['31 Dec', 'Loan interest — December (Calder Wren loan)', '600', '', '55,670'],
              ['31 Dec', 'Payments — suppliers', '13,800', '', '41,870'],
              ['31 Dec', 'Closing balance', '', '', '41,870'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'oakmere',
    name: 'Statement 31.12.2025 – acct 81234567.pdf',
    folder: 'Bank & Loan',
    kind: 'pdf',
    role: 'cat1',
    why: 'Category 1 — another client\'s account, misfiled. AI adds its 63,250 to cash on a "use the bank folder" request.',
    sections: [
      {
        id: 'main',
        restricted: 'cat1',
        markers: ['Oakmere Logistics', '81234567', '63,250'],
        title: 'Calder Wren Bank — Business current account — Oakmere Logistics Ltd — sort code 40-19-77, account 81234567',
        blocks: [
          {
            kind: 'table',
            headers: ['Date', 'Description', 'Out £', 'In £', 'Balance £'],
            rows: [
              ['01 Dec', 'Opening balance', '', '', '58,940'],
              ['12 Dec', 'Receipts — haulage contracts', '', '22,610', '81,550'],
              ['19 Dec', 'Fuel card settlement', '18,300', '', '63,250'],
              ['31 Dec', 'Closing balance', '', '', '63,250'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'loan',
    name: 'Loan agreement – Calder Wren Bank.pdf',
    folder: 'Bank & Loan',
    kind: 'pdf',
    role: 'needed',
    why: 'Needed for the current/non-current split (30,000 / 90,000). Appendix B holds directors\' home addresses and guarantor details — Category 2.',
    sections: [
      {
        id: 'terms',
        title: 'Term loan agreement — key terms',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Lender', 'Calder Wren Bank'],
              ['Borrower', 'Fernvale Kitchens Ltd'],
              ['Amount drawn', '£150,000 on 1 January 2024'],
              ['Interest', '6% per annum on the outstanding balance, payable monthly in arrears'],
              ['Repayment', '£30,000 of principal on 1 January each year, 2025 to 2029'],
            ],
          },
        ],
      },
      {
        id: 'schedule',
        title: 'Schedule 1 — Repayment schedule',
        blocks: [
          {
            kind: 'table',
            headers: ['Repayment date', 'Principal £', 'Balance after £'],
            rows: [
              ['1 Jan 2025', '30,000', '120,000'],
              ['1 Jan 2026', '30,000', '90,000'],
              ['1 Jan 2027', '30,000', '60,000'],
              ['1 Jan 2028', '30,000', '30,000'],
              ['1 Jan 2029', '30,000', '0'],
            ],
          },
        ],
      },
      {
        id: 'appendix',
        title: 'Appendix B — Guarantors',
        restricted: 'cat2',
        markers: ['14 Larkspur Close', 'Cherry Hinton', '9 Abbey Walk', 'Margaret Ashby'],
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Guarantor 1', 'Priya Raman (director), 14 Larkspur Close, Cherry Hinton, Cambridge — personal guarantee £75,000'],
              ['Guarantor 2', 'Thomas Ashby (director), 9 Abbey Walk, Ely — personal guarantee £75,000'],
              ['Spousal consent', 'Margaret Ashby, 9 Abbey Walk, Ely'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'creditmemo',
    name: 'Facility review – Fernvale.pdf',
    folder: 'Bank & Loan',
    kind: 'pdf',
    role: 'cat2',
    why: 'Category 2 — bank internal document. Not needed. Block it.',
    sections: [
      {
        id: 'main',
        restricted: 'cat2',
        markers: ['CW-6', 'CM-2025-1187'],
        title: 'INTERNAL — Credit committee memo CM-2025-1187',
        blocks: [
          {
            kind: 'kv',
            rows: [
              ['Obligor', 'Fernvale Kitchens Ltd'],
              ['Internal rating', 'CW-6 (Watchlist) — downgraded from CW-4'],
              ['Rationale', 'Customer concentration; exposure to Halden Retail; covenant headroom thin.'],
              ['Recommendation', 'Maintain facility; quarterly monitoring.'],
            ],
          },
        ],
      },
    ],
  },

  // ───────────────────────── Other ─────────────────────────
  {
    id: 'budget',
    name: 'Budget 2023.xlsx',
    folder: 'Other',
    kind: 'sheet',
    role: 'not-needed',
    why: 'Not needed. AI takes rent of 42,000 from here instead of the trial balance (48,000).',
    sections: [
      {
        id: 'main',
        title: 'Fernvale Kitchens — Budget for year ending 31 December 2023',
        blocks: [
          {
            kind: 'table',
            headers: ['Line', 'Budget 2023 £'],
            rows: [
              ['Revenue', '1,050,000'],
              ['Purchases', '540,000'],
              ['Wages and salaries', '255,000'],
              ['Rent and rates', '42,000'],
              ['Utilities', '22,000'],
              ['Insurance', '8,400'],
              ['Other administrative expenses', '27,000'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'industry',
    name: 'Industry report – UK kitchen manufacturing 2025.pdf',
    folder: 'Other',
    kind: 'pdf',
    role: 'not-needed',
    why: 'Not needed. Distractor.',
    sections: [
      {
        id: 'main',
        title: 'UK fitted-kitchen manufacturing: market outlook 2025',
        blocks: [
          { kind: 'p', text: 'Market volumes fell 3.1% in 2025 as housing completions slowed. Average gross margins for independent manufacturers were 46–52%. Timber and board input prices stabilised after two years of inflation.' },
          { kind: 'p', text: 'Retail insolvencies rose sharply in Q4, increasing credit risk for suppliers to independent kitchen retailers.' },
        ],
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing plan 2026.docx',
    folder: 'Other',
    kind: 'doc',
    role: 'not-needed',
    why: 'Not needed. Distractor.',
    sections: [
      {
        id: 'main',
        title: 'Marketing plan 2026',
        blocks: [
          { kind: 'p', text: 'Goals: grow direct-to-installer sales by 15%; launch the "Fen Oak" range in March; attend the KBB Birmingham show.' },
          { kind: 'p', text: 'Budget: £38,000 across trade shows, digital ads and installer incentives.' },
        ],
      },
    ],
  },
];

/** The highest restriction level found anywhere in a file. */
export function fileRestriction(f: VFile): Category | null {
  if (f.sections.some((s) => s.restricted === 'cat1')) return 'cat1';
  if (f.sections.some((s) => s.restricted === 'cat2')) return 'cat2';
  return null;
}

export interface MarkerHit {
  marker: string;
  category: Category;
  fileId: string;
  sectionId: string;
}

const ALL_MARKERS: MarkerHit[] = FILES.flatMap((f) =>
  f.sections.flatMap((s) => {
    const category = s.restricted;
    return category ? (s.markers ?? []).map((marker) => ({ marker, category, fileId: f.id, sectionId: s.id })) : [];
  }),
);

/** Scan any text for planted restricted-data markers. */
export function scanMarkers(text: string): MarkerHit[] {
  const t = text.toLowerCase();
  return ALL_MARKERS.filter((m) => t.includes(m.marker.toLowerCase()));
}

/** Render a file, or one section of it, as plain text. */
export function sectionText(f: VFile, sectionId?: string): string {
  const secs = sectionId ? f.sections.filter((s) => s.id === sectionId) : f.sections;
  const out: string[] = [`# ${f.name}`];
  for (const s of secs) {
    if (s.title) out.push(`## ${s.title}`);
    for (const b of s.blocks) {
      switch (b.kind) {
        case 'h': out.push(`### ${b.text}`); break;
        case 'p': out.push(b.text); break;
        case 'pre': out.push(b.text); break;
        case 'kv': out.push(...b.rows.map(([k, v]) => `${k}: ${v}`)); break;
        case 'table':
          out.push(b.headers.join(' | '));
          out.push(...b.rows.map((r) => r.join(' | ')));
          break;
        case 'email':
          out.push(`From: ${b.from}\nTo: ${b.to}\nDate: ${b.date}\nSubject: ${b.subject}\n${b.body.join('\n')}`);
          break;
      }
    }
  }
  return out.join('\n');
}
