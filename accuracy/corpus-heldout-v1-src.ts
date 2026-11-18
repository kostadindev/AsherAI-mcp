/**
 * Held-out corpus v1: 10 documents written AFTER the detectors were tuned, in formats and phrasings the
 * tuning corpus does not use. Scored once before any change (100% precision, 85.7% recall); its misses
 * were then fixed, so it is now a regression set, not an unbiased estimate. Held-out v3 is the honest one.
 * Same labelling policy as corpus-src.ts.
 *
 * Run: npx tsx accuracy/corpus-heldout-v1-src.ts   (writes accuracy/corpus-heldout-v1/)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCorpus, type Doc } from './corpus-lib.js';

export const HELDOUT: Doc[] = [
  { file: 'h01-integration-config.json', body: `
{
  "service": "bank-feed",
  "version": "1.8.3",
  "endpoint": "https://feeds.example-bank.test/v2",
  "username": "fernvale_feed",
  "password": "[[credential|Lk9#vQ2!pZx7]]",
  "api_token": "[[credential|tok_live_7Hq2Lm9Px4Rt8Vb1]]",
  "retry_limit": 5,
  "timeout_seconds": 30
}
` },
  { file: 'h02-staff-contacts.yaml', body: `
staff:
  - name: Ravi Menon
    role: Payroll Officer
    mobile: "[[phone number|+44 (0)7700 900222]]"
    email: [[email|ravi.menon.personal@example.org]]
    ni: [[national insurance number|AB123456C]]
  - name: Chloe Evans
    role: Trainee Accountant
    mobile: "[[phone number|07700900333]]"
    email: [[email|chloe_evans@example.net]]
    d.o.b.: [[date of birth|3 May 2001]]
team_inbox: payroll@fernvale.example.co.uk
` },
  { file: 'h03-api-gateway.log', body: `
2026-01-14T08:02:11Z INFO  request id=7f3a2c path=/v1/ledger status=200 ms=41
2026-01-14T08:02:12Z WARN  auth header Authorization: Bearer [[credential|eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmZXJudmFsZSJ9.4bX9q]]
2026-01-14T08:02:15Z INFO  export rows=4821 period=2025-12 build=20260110
2026-01-14T08:03:00Z ERROR db connect failed host=10.0.4.12 port=5432 attempt=3
` },
  { file: 'h04-new-starter-form.txt', body: `
NEW STARTER FORM
Name: Oliver Grant
Born on: [[date of birth|30.09.1999]]
Mob: [[phone number|07700 900444]]
Home: Flat 2, 17 Willow Gardens, Norwich [[home address|NR2 3LQ]]
NI No.: [[national insurance number|CE 64 29 90 D]]
Bank: sort code [[bank account|11-22-33 / account 44556677]]
Start date: 02/02/2026   Salary £27,500   Cost centre CC-104
` },
  { file: 'h05-card-dispute.eml', body: `
From: "Natalie Brooks" <[[email|nat.brooks@example.com]]>
To: support@fernvalekitchens.example.co.uk
Subject: Refund to my card please

Please refund order SO-2302 (£1,980) to the card I paid with: [[payment card|4242-4242-4242-4242]].
Billing address 41 Cedar Avenue, Bath [[home address|BA2 4QR]]. Order placed 18/01/2026.
` },
  { file: 'h06-board-pack-summary.txt', body: `
BOARD PACK SUMMARY, Q4 2025
Revenue £1.248m (Q4: £322k). EBITDA margin 12.2%. Net debt £78,130.
Covenant headroom: 1.9x against a 1.5x minimum. Capex 2026 budget £45,000.
Registered office: Unit 4, Marsh Lane Trading Estate, Ely CB7 4PL. Company 08812345.
Auditor sign-off expected 28/03/2026; AGM 30/04/2026.
` },
  { file: 'h07-overseas-payee.csv', body: `
payee,country,iban,bic,amount_eur,reference
Holzwerk GmbH,DE,[[IBAN|DE89370400440532013000]],COBADEFFXXX,12480.00,INV-H-2201
Dutch Hinge BV,NL,[[IBAN|NL91ABNA0417164300]],ABNANL2A,1105.00,DH-88213
` },
  { file: 'h08-identity-check.txt', body: `
Identity check completed 11/01/2026 for new director Lucy Hale.
Passport No: [[passport number|925076473]] (issued 2021, valid to 2031)
Date of Birth - [[date of birth|11/12/1982]]
Residential address: 6 Orchard Mews, Bristol [[home address|BS8 2RT]]
Contact: [[email|lucy.hale@example.co.uk]], [[phone number|0117 496 0812]]
` },
  { file: 'h09-it-handover.md', body: `
# IT handover

- Accounting portal admin password: [[credential|Fern-Admin-2026]]
- Password rotation is every 90 days; the password policy needs 12+ characters.
- Backup NAS login is in the vault, not here.
- AWS key used by the export job: [[credential|AKIAI44QH8DHBEXAMPLE]]
- Version pinned: node 20.11.1, postgres 16.2
` },
  { file: 'h10-customer-call-notes.txt', body: `
Call notes 15/01/2026, ref CALL-2026-0115-07
Customer Mr J. Patel rang from [[phone number|020 7946 0321]] about delivery of order SO-2310.
Agreed redelivery 22/01/2026. Customer asked us to email [[email|jpatel77@example.com]] with the slot.
Our freephone 0800 015 0700 and sales line 0345 300 1234 were confirmed.
` },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeCorpus(path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus-heldout-v1'), HELDOUT);
  console.log(`Wrote ${HELDOUT.length} documents to accuracy/corpus-heldout-v1/`);
}
