/**
 * Held-out corpus v2: 12 documents written AFTER the round-2 fixes (quoted keys, bearer tokens / JWTs,
 * card numbers followed by punctuation). Never used to change the detectors; reported separately.
 * Same labelling policy as corpus-src.ts. Placeholders ("YOUR_API_KEY", "${{ secrets.X }}", "****")
 * are not secrets and are not labelled.
 *
 * Run: npx tsx test/corpus-heldout-v2-src.ts   (writes test/corpus-heldout-v2/)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCorpus, type Doc } from './corpus-lib';

export const HELDOUT_V2: Doc[] = [
  { file: 'v01-payment-provider.json', body: `
{
  "provider": "cardpay",
  "merchant_id": "MID-0049-2281",
  "environment": "live",
  "credentials": {
    "client_id": "fernvale-web",
    "client_secret": "[[credential|cs_9Tq4Lm2Vx8Pn6Rw1Zk3]]",
    "webhook_signing_key": "whsec_EXAMPLEONLY"
  },
  "settlement_account": { "iban": "[[IBAN|GB33BUKB20201555555555]]", "currency": "GBP" },
  "retry": { "max_attempts": 4, "backoff_ms": 500 }
}
` },
  { file: 'v02-docker-compose.yml', body: `
services:
  ledger-db:
    image: postgres:16.2
    environment:
      POSTGRES_USER: ledger
      POSTGRES_PASSWORD: "[[credential|pg-Fern!2026-db]]"
      POSTGRES_DB: ledger
    ports:
      - "5432:5432"
  exporter:
    image: fernvale/exporter:2.4.0
    environment:
      EXPORT_API_KEY: '[[credential|ek_3fH8kQ1mZ7pW2xR9]]'
      EXPORT_SCHEDULE: "0 2 * * *"
` },
  { file: 'v03-ci-workflow.yml', body: `
name: nightly-export
on:
  schedule:
    - cron: "0 3 * * *"
jobs:
  export:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run export
        env:
          LEDGER_TOKEN: \${{ secrets.LEDGER_TOKEN }}
          REPORT_EMAIL: finance@fernvale.example.co.uk
` },
  { file: 'v04-api-docs.md', body: `
# Ledger API: authentication

Send your key in the Authorization header:

    curl -H "Authorization: Bearer YOUR_API_KEY" https://api.ledger.example/v1/accounts

Example response token from the sandbox (rotate before go-live):

    {"access_token": "[[credential|eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzYW5kYm94In0.Qm9ndXNTaWduYXR1cmU]]", "expires_in": 3600}

Rate limit: 600 requests per minute. API version 2026-01-15.
` },
  { file: 'v05-card-settlement-export.csv', body: `
settlement_date,order_ref,card_number,card_type,amount_gbp,status
2026-01-12,SO-2311,[[payment card|4000056655665556]],visa_debit,1250.00,settled
2026-01-12,SO-2312,************1881,visa,640.50,settled
2026-01-13,SO-2315,[[payment card|5200 8282 8282 8210]],mastercard,3100.00,chargeback
2026-01-14,SO-2319,4111********1111,visa,220.00,refunded
` },
  { file: 'v06-chargeback-email.eml', body: `
From: disputes@cardpay.example.com
To: accounts@fernvalekitchens.example.co.uk
Subject: Chargeback CB-77120 on order SO-2315

The cardholder (card ending 8210) has disputed £3,100.00. Full PAN for your records: [[payment card|5200828282828210]].
Please respond by 30/01/2026 with proof of delivery. Case handler: Owen Price, [[phone number|020 7946 0777]].
` },
  { file: 'v07-payroll-bureau-upload.csv', body: `
payroll_id,surname,forename,ni_number,date_of_birth,postcode,gross_jan
P-014,Okafor,Jane,[[national insurance number|JG 10 39 48 C]],[[date of birth|1987-02-14]],[[home address|CB6 2TT]],2875.00
P-015,Lindqvist,Erik,[[national insurance number|RN 55 18 23 A]],[[date of birth|1993-10-30]],[[home address|IP28 7DE]],2600.00
` },
  { file: 'v08-supplier-onboarding.txt', body: `
SUPPLIER ONBOARDING: Brightline Glazing Ltd
Registered office: Unit 12, Fen Road Industrial Estate, Cambridge CB4 1UN
Company number 11223344, VAT GB 412 7788 31
Accounts contact: accounts@brightline.example.co.uk, 0345 112 2334
Remittance bank: sort code [[bank account|40-11-62 account 98765432]]
Owner's personal guarantee: Mark Brightman, mobile [[phone number|07700 900555]], [[email|mark.brightman@example.com]]
` },
  { file: 'v09-expense-system-export.json', body: `
[
  {"claim": "EC-2026-007", "employee": "Aisha Khalid", "amount": 182.40, "category": "travel", "approved": true},
  {"claim": "EC-2026-008", "employee": "Tomasz Nowak", "amount": 96.20, "category": "tools", "approved": true,
   "reimburse_to": {"sort_code": "[[bank account|09-01-28", "account": "77341920]]"}},
  {"claim": "EC-2026-009", "employee": "Grace Whitfield", "amount": 45.00, "category": "subsistence", "approved": false}
]
` },
  { file: 'v10-audit-query-log.txt', body: `
AUDIT QUERY LOG, FY2025
Q-01 Purchases ledger total 612,000 agrees to TB (ref C2.1). Cleared 08/01/2026.
Q-02 Roof repair RR-0917 £18,000: expensed under IAS 16 para 12. Cleared 09/01/2026.
Q-03 Halden Retail £14,600: administration 18/12/2025, provided in full. Cleared 09/01/2026.
Q-04 Laptop useful life 4 years (policy v2.1). Cleared 10/01/2026.
Materiality £25,000. Next review 20/01/2026.
` },
  { file: 'v11-service-account.yaml', body: `
service_account:
  name: recon-bot
  owner: it-ops@fernvale.example.co.uk
  api_key: "[[credential|rk_live_8Hn3Qp6Vt1Wz9Lc4]]"
  password_rotation_days: 90
  allowed_ips:
    - 10.0.4.0/24
` },
  { file: 'v12-client-letter.txt', body: `
Calder Wren Bank plc
1 Threadneedle Street, London EC2N 2DB

Private and confidential
Mrs Priya Raman
14 Larkspur Close
Cherry Hinton
Cambridge
[[home address|CB1 9XY]]

Dear Mrs Raman,
Thank you for providing your personal guarantee. We hold your date of birth as [[date of birth|14/03/1979]].
Please call your relationship manager on 0345 300 9000 with any questions. Our reference: CW/PG/2026/014.
` },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeCorpus(path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus-heldout-v2'), HELDOUT_V2);
  console.log(`Wrote ${HELDOUT_V2.length} documents to test/corpus-heldout-v2/`);
}
