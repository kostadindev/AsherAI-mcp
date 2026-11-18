/**
 * Held-out corpus v3: 12 documents in formats not used before, written and labelled AFTER the round-3
 * fixes and BEFORE any detector was run on them. Never used to change the detectors.
 * Same labelling policy as corpus-src.ts. Labels follow the policy even where the detector is expected
 * to miss (e.g. upper-case addresses, a bare home postcode, a tab-separated payroll file).
 *
 * Run: npx tsx accuracy/corpus-heldout-v3-src.ts   (writes accuracy/corpus-heldout-v3/)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCorpus, type Doc } from './corpus-lib.js';

export const HELDOUT_V3: Doc[] = [
  { file: 'w01-statement-pdf-dump.txt', body: `
NORTHGATE BANK PLC                                   Statement 14 of 2025
                                                     Page 1 of 2
MR T ASHBY
9 ABBEY WALK
ELY
[[home address|CB7 4HB]]
                    Sort Code  [[bank account|30-94-57   Account Number   12345678]]
Date        Description                         Paid out     Paid in     Balance
01 DEC      BALANCE BROUGHT FORWARD                                       2,431.18
03 DEC      CARD PAYMENT TO TESCO STORES 3381      46.20                  2,384.98
05 DEC      FASTER PAYMENT FERNVALE KITCHENS                  4,812.55    7,197.53
11 DEC      DIRECT DEBIT COUNCIL TAX REF 0049112    162.00                7,035.53
` },
  { file: 'w02-hr-onboarding-form.txt', body: `
NEW EMPLOYEE ONBOARDING (complete in BLOCK CAPITALS)

Full legal name ............ Sophie Turner-Hale
Date of Birth (DD/MM/YYYY) . [[date of birth|19/04/1998]]
NI Number .................. [[national insurance number|JT 44 81 02 B]]
Personal email ............. [[email|sophie.th@example.org]]
Mobile ..................... [[phone number|07700 900602]]
Home address ............... 3 Brook Rise, Ely [[home address|CB6 3XL]]
Emergency contact .......... Paul Turner, [[phone number|07700 900603]]
Start date ................. 01/03/2026     Contract ref: EMP-2026-021
` },
  { file: 'w03-slack-export.json', body: `
[
  {"user": "U02AK", "user_name": "aisha.khalid", "ts": "1736931201.000200",
   "text": "Portal is down again. Temporary login for the bank portal is user FVK0091, password: [[credential|Bluebell#78]]"},
  {"user": "U03TN", "user_name": "tomasz.nowak", "ts": "1736931260.000300",
   "text": "Thanks. If anyone needs me today I'm on my personal mobile [[phone number|07700 900604]]"},
  {"user": "U02AK", "user_name": "aisha.khalid", "ts": "1736931333.000400",
   "text": "Reminder: Q4 VAT return due 07/02. Box 5 is 20,428.25. Version 3 of the pack is in the drive."}
]
` },
  { file: 'w04-kyc-email.eml', body: `
From: Onboarding Team <onboarding@calderwren.example.co.uk>
To: [[email|james.whitlock@example.com]]
Subject: Identity documents received, ref KYC-2026-0193

Dear Mr Whitlock,

We have received your documents. For our records:
Passport number: [[passport number|533912087]]
D.O.B: [[date of birth|22/07/1965]]
Residential address: 41 Larch Drive, Huntingdon [[home address|PE29 6QF]]

If any detail is wrong, reply to this email or call 0345 300 9000.
` },
  { file: 'w05-mileage-claim.txt', body: `
MILEAGE CLAIM, JANUARY 2026
Employee: Ravi Menon (payroll no. P-021)

Date        Journey                                   Miles   Rate    Amount
06/01/2026  Home ([[home address|CB4 2QW]]) to client site, Peterborough   38     0.45    17.10
13/01/2026  Office to Brookfield Interiors, return     24     0.45    10.80
Total                                                  62             27.90
Approved by A. Khalid, cost centre CC-104.
` },
  { file: 'w06-k8s-secret.yaml', body: `
apiVersion: v1
kind: Secret
metadata:
  name: ledger-db-credentials
  namespace: finance
type: Opaque
stringData:
  username: ledger_app
  password: [[credential|Rv8$kL2!mQ9z]]
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ledger-settings
data:
  PASSWORD_MIN_LENGTH: "12"
  REPORT_CURRENCY: GBP
` },
  { file: 'w07-board-pack-excerpt.txt', body: `
BOARD PACK, FEBRUARY 2026, SECTION 3: TREASURY

Cash at 31 January: £58,214 (December: £41,870). Facility headroom £40,000.
Loan LN-0049 balance £90,000 after the 1 January repayment of £30,000.
FX: EUR exposure €16,700 hedged at 1.1612. No covenant breaches; leverage 1.4x.
Proposal: open a deposit account with Northgate Bank plc at 3.1% gross.
` },
  { file: 'w08-payroll-extract.tsv', body: `
employee_name	birth_date	post_code	ni	gross_feb
Jane Okafor	[[date of birth|1987-02-14]]	[[home address|CB6 2TT]]	[[national insurance number|JG 10 39 48 C]]	2875.00
Erik Lindqvist	[[date of birth|1993-10-30]]	[[home address|IP28 7DE]]	[[national insurance number|RN 55 18 23 A]]	2600.00
` },
  { file: 'w09-support-chat.txt', body: `
[10:02] Agent (Megan): Thanks for contacting Fernvale support. How can I help?
[10:03] Customer: I want to pay the balance on order SO-2330 by card
[10:03] Customer: it's [[payment card|4000 0566 5566 5556]] exp 04/28
[10:04] Agent (Megan): Please don't share card numbers in chat. I'll send a secure payment link.
[10:04] Customer: ok, my number is [[phone number|+44 7700 900605]] if easier
[10:05] Agent (Megan): Link sent. Reference PAY-SO-2330.
` },
  { file: 'w10-bank-audit-confirmation.txt', body: `
Calder Wren Bank plc
Audit Confirmations Unit, 1 Threadneedle Square, London EC2R 8AH

Our ref: AC/2026/0412                                    Date: 20/01/2026

To: Grantley & Co LLP, 8 Market Street, Cambridge CB2 3QF

Balances held for Fernvale Kitchens Ltd at 31/12/2025:
Current account [[bank account|40-22-18 41235531]]     £41,870.00 credit
Loan account LN-0049                  £90,000.00 debit
` },
  { file: 'w11-config-diff.patch', body: `
diff --git a/deploy/.env.production b/deploy/.env.production
index 3f1a2b9..8c0d4e1 100644
--- a/deploy/.env.production
+++ b/deploy/.env.production
@@ -4,7 +4,7 @@
 LOG_LEVEL=info
-PAYMENTS_API_SECRET=[[credential|ps_old_4Kd9Qm2Lx7Vb]]
+PAYMENTS_API_SECRET=[[credential|ps_new_8Hn3Wz6Rt1Yc]]
 REPORT_SCHEDULE=0 2 * * *
` },
  { file: 'w12-meeting-invite.ics', body: `
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Year-end close review
DTSTART:20260128T100000Z
ORGANIZER;CN=Aisha Khalid:mailto:[[email|aisha.khalid@fernvalekitchens.example.co.uk]]
ATTENDEE;CN=Priya Raman:mailto:[[email|priya.raman@fernvalekitchens.example.co.uk]]
ATTENDEE;CN=Finance team:mailto:finance@fernvalekitchens.example.co.uk
DESCRIPTION:Dial in [[phone number|+44 20 3481 5240]], meeting ID 812 4471 0091.
END:VEVENT
END:VCALENDAR
` },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeCorpus(path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus-heldout-v3'), HELDOUT_V3);
  console.log(`Wrote ${HELDOUT_V3.length} documents to accuracy/corpus-heldout-v3/`);
}
