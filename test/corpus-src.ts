/**
 * Tuning corpus for the restricted-data detectors: 40 fictional accounting and finance documents.
 * Every restricted span is marked [[label|value]]. Everything else must NOT be flagged.
 *
 * Labelling policy (documented in README):
 *  - Personal email addresses are cat2. Role mailboxes (accounts@, info@, finance@, …) are not restricted.
 *  - Mobile and geographic phone numbers (07, 01, 02, +international) are cat2. Non-geographic business
 *    numbers (03xx, 08xx, 09xx) are not restricted.
 *  - Home addresses are cat2; the postcode is the labelled span. Business addresses (Ltd, Unit, estates,
 *    registered offices, invoice letterheads) are not restricted.
 *  - Sort code + account number and IBANs are always cat2.
 *  - Credentials, payment card numbers, passport numbers and private keys are cat1.
 * All data is fictional: Ofcom drama phone ranges, public test card numbers, documentation IBANs,
 * the AWS documentation example key.
 *
 * Run: npx tsx test/corpus-src.ts   (writes test/corpus/)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCorpus, type Doc } from './corpus-lib';

export const DOCS: Doc[] = [
  { file: '01-payroll-december.csv', body: `
employee,role,annual_salary,dec_gross,ni_number,home_address,dob
Priya Shah,Analyst,48000,4000,[[national insurance number|PK 19 60 47 A]],"12 Elm Road, Leeds [[home address|LS6 2AB]]",[[date of birth|14/03/1991]]
Tom Reid,Senior Analyst,61000,5083,[[national insurance number|SN 72 05 18 B]],"4 Mill Lane, York [[home address|YO1 7HU]]",[[date of birth|02/11/1984]]
Ana Costa,Associate,39000,3250,[[national insurance number|TC 33 84 09 D]],"88 Bank Street, Hull [[home address|HU1 1AA]]",[[date of birth|27/06/1996]]
Total,,148000,12333,,,
` },
  { file: '02-email-overdue-balance.eml', body: `
From: Credit Control <credit.control@fernvalekitchens.example.co.uk>
To: Mark Ellis <[[email|mark.ellis@haldenretail.example.co.uk]]>
Date: 12 Dec 2025 09:14
Subject: Invoice INV-2025-0917 overdue

Hi Mark,

Invoice INV-2025-0917 for £14,600.00 is now 92 days overdue. Please arrange payment or call me on [[phone number|07700 900123]].

Kind regards,
Jane Okafor
Credit Controller, Fernvale Kitchens Ltd
Direct line [[phone number|0113 496 0123]] | Customer service 0345 300 1234
` },
  { file: '03-app.env', body: `
# Accounting sync service
APP_ENV=production
LOG_LEVEL=info
DB_HOST=db.internal.example
DB_USER=sync_service
DB_PASSWORD=[[credential|Xq7!rT92mPa]]
XERO_CLIENT_SECRET=[[credential|f3a9c1d7e2b84a6f9c0d]]
STRIPE_API_KEY=[[credential|sk_live_51Hx2EXAMPLEa8Fz0q]]
PASSWORD_MIN_LENGTH=12
SESSION_TIMEOUT_MINUTES=30
FEATURE_FLAGS=ledger_v2,auto_reconcile
` },
  { file: '04-bank-export-dec.csv', body: `
Account: Fernvale Kitchens Ltd   Sort code [[bank account|40-22-18 Account 41235531]]
date,description,reference,debit,credit,balance
01/12/2025,Opening balance,,,,38215.00
05/12/2025,FPS RECEIPT BROOKFIELD,FPS 4471 0091 2284,,64300.00,102515.00
15/12/2025,BACS SUPPLIERS,BACS-2025-12-15,41120.00,,61395.00
20/12/2025,DIVIDEND,DIV-Q4-2025,20000.00,,41395.00
31/12/2025,LOAN INTEREST DEC,LN-0049-1225,600.00,,55670.00
31/12/2025,Closing balance,,,,41870.00
` },
  { file: '05-invoice-ridgeway.txt', body: `
RIDGEWAY ROOFING LTD
Unit 7, Kiln Lane Business Park, Newmarket CB8 7AA
Company no. 08812345   VAT reg. GB 318 2214 60
Tel 0345 600 7788

INVOICE RR-0917                       Date: 14 November 2025
To: Fernvale Kitchens Ltd, Unit 4 Marsh Lane Trading Estate, Ely CB7 4PL

Emergency repair to storm-damaged roof, 40 slates and flashing      18,000.00
VAT at 20%                                                           3,600.00
Total due                                                           21,600.00

Please pay to sort code [[bank account|20-45-77, account 30918264]] within 30 days.
` },
  { file: '06-loan-agreement-appendix.txt', body: `
TERM LOAN AGREEMENT, APPENDIX B: GUARANTORS

Guarantor 1: Priya Raman, director, born [[date of birth|14 March 1979]]
Home address: 14 Larkspur Close, Cherry Hinton, Cambridge [[home address|CB1 9XY]]
Identity verified against UK passport no. [[passport number|553829174]]

Guarantor 2: Thomas Ashby, director, DOB [[date of birth|02/11/1971]]
Home address: 9 Abbey Walk, Ely [[home address|CB7 4HB]]
Identity verified against passport [[passport number|761204338]]

Facility: £150,000 drawn 1 January 2024, repayable in five instalments of £30,000.
` },
  { file: '07-board-minutes-nov.txt', body: `
MINUTES OF THE BOARD MEETING, 18 NOVEMBER 2025

Present: P. Raman (Chair), T. Ashby, A. Khalid (Finance Manager, minutes)

1. Trading. Revenue for October was £104,200, 6.4% above budget. Gross margin 49.1%.
2. Credit risk. Exposure to Halden Retail is £14,600; the board noted the risk of non-recovery.
3. IT. The password policy was reviewed: minimum length 12, rotation every 90 days, MFA for all users.
4. Capital expenditure. Approved £12,000 for 12 laptops (ProBook 14, model 2025).
5. Next meeting: 16 December 2025 at 10:00.
` },
  { file: '08-audit-wp-ppe.txt', body: `
WORKING PAPER C4: PROPERTY, PLANT AND EQUIPMENT       Prepared: AK 05/01/2026  Reviewed: TR 08/01/2026
Template version 3.2.1   Engagement ref ENG-2025-0412

Sample  Asset ID     Description                 Cost (£)    Verified
1       FA-000231    CNC router                  48,500      Yes, invoice 7710233
2       FA-000245    Edge bander                 31,200      Yes, invoice 7710291
3       FA-000301    12 x laptops                12,000      Yes, invoice PX-55102

Materiality £25,000; performance materiality £18,750 (75%).
Conclusion: PPE is fairly stated at 31/12/2025 subject to the depreciation adjustment in C4.3.
` },
  { file: '09-customer-list.csv', body: `
customer_id,name,email,mobile,town,credit_limit
C-1001,Holt & Daughters,accounts@holtdaughters.example.co.uk,,Bury St Edmunds,25000
C-1002,Sarah Pritchard,[[email|sarah.pritchard@example.com]],[[phone number|07700 900456]],Soham,5000
C-1003,Larchmont Homes,info@larchmonthomes.example.co.uk,0345 222 0199,Peterborough,40000
C-1004,Daniel Mercer,[[email|dan.mercer84@example.net]],[[phone number|+44 7700 900789]],Bury St Edmunds,3000
` },
  { file: '10-card-payments-log.txt', body: `
Card payments taken by phone, December 2025 (to be destroyed after processing)

12/12/2025  £1,250.00  Card [[payment card|4111 1111 1111 1111]]  exp 09/27  auth 482913
14/12/2025  £  640.00  Card [[payment card|5555 5555 5555 4444]]  exp 01/28  auth 551204
19/12/2025  £3,100.00  Card [[payment card|378282246310005]]  exp 11/26  auth 610077
22/12/2025  £  220.00  Card **** **** **** 1234 (stored token tok_8812)
` },
  { file: '11-hr-file-note.txt', body: `
HR FILE NOTE, CONFIDENTIAL
Employee: Grace Whitfield, Sales Executive
NI number: [[national insurance number|HZ 55 10 72 B]]
Date of birth: [[date of birth|1990-08-21]]
Personal email: [[email|grace.w.home@example.org]]
Address: 8 Kiln Lane, Newmarket [[home address|CB8 0QE]]
Note: requested a change of bank details to sort code [[bank account|09-01-28 account 77341920]] from January payroll.
` },
  { file: '12-it-ticket-4471.txt', body: `
Ticket #4471   Opened 03/01/2026 by Aisha Khalid
Issue: locked out of the accounting portal after the password change.
Resolution: account unlocked. The temporary password is [[credential|Winter2026!fern]] and must be changed at next login.
Also confirmed the password policy is unchanged (12 characters minimum).
Time spent: 0.5 hours. Asset tag IT-2291.
` },
  { file: '13-sepa-payment-run.txt', body: `
SEPA PAYMENT RUN 2026-01-09

Supplier                 IBAN                                   BIC          Amount (EUR)
Holzwerk GmbH            [[IBAN|DE89 3704 0044 0532 0130 00]]          COBADEFFXXX  12,480.00
Atelier Lumiere SARL     [[IBAN|FR14 2004 1010 0505 0001 3M02 606]]    PSSTFRPPXXX   3,920.50
Dutch Hinge BV           [[IBAN|NL91 ABNA 0417 1643 00]]               ABNANL2A      1,105.00

Batch ref SEPA-0109-03. Approved by T. Ashby.
` },
  { file: '14-expense-claim.txt', body: `
EXPENSE CLAIM EC-2025-118
Claimant: Tomasz Nowak, Workshop Lead
Home address for mileage: 11 Mill Close, Soham [[home address|CB7 5EP]]
Journey: home to Brookfield Interiors site, 42 miles at 45p = £18.90
Hotel 2 nights £214.00 (company card ending 4471)
Total claimed £232.90. Approved 07/01/2026.
` },
  { file: '15-deploy-key.txt', body: `
Deployment notes for the reconciliation bot. Do not commit this file.

[[private key|-----BEGIN OPENSSH PRIVATE KEY-----]]
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
-----END OPENSSH PRIVATE KEY-----

Host: recon.internal.example  Port 2222  User: recon
` },
  { file: '16-sync-script.py', body: `
# Nightly ledger export
import os, requests

GITHUB_TOKEN = "[[credential|ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8]]"
OPENAI_KEY = "[[credential|sk-proj-9fK2mQ7xLwP3vT8sN1bH4cR6yU0eD5aZ]]"
EXPORT_VERSION = "2.4.0"
MAX_ROWS = 50000

def export(period="2025-12"):
    return requests.get(f"https://ledger.internal.example/export/{period}")
` },
  { file: '17-email-thread-supplier.eml', body: `
From: invoices@holzwerk.example.de
To: accounts@fernvalekitchens.example.co.uk
Date: 06 Jan 2026 10:02
Subject: Remittance query, PO 88213

Please confirm the remittance for PO 88213. Reply to finance@holzwerk.example.de or noreply@holzwerk.example.de will not be read.

---
From: Lena Vogt <[[email|lena.vogt@holzwerk.example.de]]>
Sent: 05 Jan 2026 16:40
My mobile is [[phone number|+49 151 2345 6789]] if quicker.
` },
  { file: '18-pension-letter.txt', body: `
Fernvale Kitchens Ltd Workplace Pension
Registered office: Unit 4, Marsh Lane Trading Estate, Ely CB7 4PL

Mr T Nowak
11 Mill Close
Soham
[[home address|CB7 5EP]]

Dear Mr Nowak,
Your National Insurance number [[national insurance number|SN 72 05 18 B]] has been matched to your pension record.
Date of birth on file: [[date of birth|19 July 1988]]. Contributions for 2025: £2,160.
` },
  { file: '19-meeting-notes-budget.md', body: `
# Budget review, 9 January 2026

- FY2026 revenue target £1.32m (+7.5%). Headcount 14 FTE.
- Software spend £12,500; renewals due 31/03/2026.
- Freephone line 0800 123 4567 to be retired in Q2.
- Action: AK to circulate v1.3 of the budget model by 16/01/2026.
` },
  { file: '20-vat-return-q4.txt', body: `
VAT RETURN, PERIOD 10/25 TO 12/25
VAT registration number: GB 318 2214 60

Box 1 VAT due on sales               52,310.40
Box 4 VAT reclaimed on purchases     31,882.15
Box 5 Net VAT to pay                 20,428.25
Box 6 Total sales ex VAT            261,552.00
Box 7 Total purchases ex VAT        159,410.75
Submitted 07/02/2026, receipt 1739 8821 0044.
` },
  { file: '21-management-accounts.txt', body: `
MANAGEMENT ACCOUNTS, DECEMBER 2025

                    Month      YTD        Budget YTD   Variance
Revenue          104,800  1,248,000   1,180,000     5.8%
Gross profit      51,352    625,500     590,000     6.0%
Overheads         38,900    472,800     455,000    -3.9%
EBITDA            12,452    152,700     135,000    13.1%

Cash at 31/12/2025: £41,870. Debtor days 47 (2024: 41).
` },
  { file: '22-supplier-master.csv', body: `
supplier,address,contact_email,phone,sort_code,account_no
Pixelpoint Systems Ltd,"Unit 2, Science Park, Cambridge CB4 0WS",sales@pixelpoint.example.co.uk,0345 900 1100,[[bank account|30-90-12,61123987]]
Northwind Energy plc,"Northwind House, 1 Energy Way, Leeds LS1 4DY",billing@northwind.example.com,0333 202 0202,[[bank account|60-83-71,10442209]]
Ridgeway Roofing Ltd,"Unit 7, Kiln Lane Business Park, Newmarket CB8 7AA",accounts@ridgeway.example.co.uk,0345 600 7788,[[bank account|20-45-77,30918264]]
` },
  { file: '23-customer-complaint.eml', body: `
From: Helen Marsh <[[email|helen.marsh1972@example.com]]>
To: info@fernvalekitchens.example.co.uk
Subject: Faulty cabinet doors, order SO-2271

I live at 23 Brook Terrace, Ely [[home address|CB6 1DN]] and the doors fitted on 2 December are warping.
Please call me on [[phone number|07700 900321]] or my landline [[phone number|01353 960 412]].
Order SO-2271, invoice INV-2025-0880, paid £4,320.
` },
  { file: '24-kyc-note.txt', body: `
KYC REFRESH, FERNVALE KITCHENS LTD (client 40-1187)
Director: Priya Raman. Passport number [[passport number|553829174]], expires 03/2031.
Director: Thomas Ashby. Passport no [[passport number|761204338]], expires 08/2029.
Companies House number 08812345 checked 12/01/2026. Risk rating unchanged.
` },
  { file: '25-aws-credentials.ini', body: `
[default]
region = eu-west-2
aws_access_key_id = [[credential|AKIAIOSFODNN7EXAMPLE]]
aws_secret_access_key = [[credential|wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY]]
output = json
` },
  { file: '26-international-contacts.txt', body: `
Overseas distributor contacts (personal mobiles, do not share)

Ireland: Ciaran Doyle, [[phone number|+353 87 555 0142]]
USA: Maria Lopez, [[phone number|+1 212 555 0199]]
Germany: Lena Vogt, [[phone number|+49 151 2345 6789]]

Office switchboards are on the website.
` },
  { file: '27-dob-register.txt', body: `
Director register extract
Name: Priya Raman      Date of birth: [[date of birth|1979-03-14]]   Appointed: 2016-05-01
Name: Thomas Ashby     Date of birth: [[date of birth|1971-11-02]]   Appointed: 2016-05-01
Name: Aisha Khalid     Secretary, appointed 2019-09-16
` },
  { file: '28-payroll-summary.txt', body: `
PAYROLL SUMMARY, DECEMBER 2025 (aggregated, safe to share)

Headcount            12
Gross pay            £21,900
Employer NI          £2,010
Employer pension     £490
Total cost           £24,400
Paid 02/01/2026 via BACS ref PAY-2025-12.
` },
  { file: '29-loan-schedule.txt', body: `
Schedule 1: Repayment schedule, facility LN-0049

Repayment date   Principal (£)   Balance after (£)   Interest rate
1 Jan 2025       30,000          120,000             6.0%
1 Jan 2026       30,000           90,000             6.0%
1 Jan 2027       30,000           60,000             6.0%
1 Jan 2028       30,000           30,000             6.0%
1 Jan 2029       30,000                0             6.0%
` },
  { file: '30-reconciliation.txt', body: `
BANK RECONCILIATION AT 31 DECEMBER 2025

Balance per bank statement                41,870.00
Add: lodgements not yet credited           1,250.00
Less: unpresented cheques 104412, 104415  (3,410.25)
Balance per cash book                      39,709.75
Difference                                      0.00
Prepared 05/01/2026, cheque run 2025-52, batch 0091 2284 7713.
` },
  { file: '31-email-signature.eml', body: `
From: Aisha Khalid <[[email|aisha.khalid@fernvalekitchens.example.co.uk]]>
To: relationship.team@calderwren.example.co.uk
Subject: Year-end pack

Please find the year-end pack attached.

Aisha Khalid | Finance Manager
Mobile [[phone number|07700 900654]] | Office 0345 300 1234
Fernvale Kitchens Ltd, Unit 4 Marsh Lane Trading Estate, Ely CB7 4PL
` },
  { file: '32-engagement-letter.txt', body: `
ENGAGEMENT LETTER

Between Calder Wren Bank plc, registered office 1 Threadneedle Street, London EC2N 2DB,
and Fernvale Kitchens Ltd (company no. 08812345), Unit 4 Marsh Lane Trading Estate, Ely CB7 4PL.

Fees: £8,500 plus VAT, payable within 30 days. Term: 1 January 2026 to 31 December 2026.
Governing law: England and Wales. Version 2026.1.
` },
  { file: '33-fx-and-prices.txt', body: `
Rates used for translation at 31/12/2025: EUR 1.1612, USD 1.2531.
Steel price index 2025: 214.6 (2024: 221.9). Inflation assumption 2.75%.
Price list v4.12.0 effective 01/02/2026: Fen Oak door £129.00, carcass £84.50.
Purchase order numbers issued: 88213 to 88290.
` },
  { file: '34-tax-computation.txt', body: `
CORPORATION TAX COMPUTATION, YEAR ENDED 31 DECEMBER 2025
Company UTR 1234567890

Profit before tax                    145,500
Add back depreciation                 27,000
Less capital allowances              (36,000)
Taxable profit                       136,500
Tax at 25% less marginal relief       31,170
` },
  { file: '35-tenancy-reference.txt', body: `
TENANT REFERENCE REQUEST
Applicant: Ana Costa
Current address: 88 Bank Street, Hull [[home address|HU1 1AA]]
Date of birth: [[date of birth|27 June 1996]]
Mobile: [[phone number|07700 900987]]
Employer: Fernvale Kitchens Ltd, Unit 4 Marsh Lane Trading Estate, Ely CB7 4PL
Annual salary confirmed: £39,000.
` },
  { file: '36-portal-access-log.txt', body: `
2026-01-03 09:12:44 user=a.khalid action=password_reset status=link_sent
2026-01-03 09:15:02 user=a.khalid action=login status=ok mfa=totp
2026-01-03 09:15:40 user=a.khalid action=export period=2025-12 rows=4821
Note: passwords are never written to this log (password: ********).
` },
  { file: '37-client-onboarding.txt', body: `
CLIENT ONBOARDING FORM, PERSONAL GUARANTOR
Full name: Margaret Ashby
Date of birth: [[date of birth|05/09/1973]]
Passport number: [[passport number|548812093]]
Home address: 9 Abbey Walk, Ely [[home address|CB7 4HB]]
Email: [[email|m.ashby@example.co.uk]]
NI number: [[national insurance number|WP 81 02 33 A]]
` },
  { file: '38-company-card-statement.txt', body: `
CORPORATE CARD STATEMENT, DECEMBER 2025
Cardholder: T Ashby    Card number [[payment card|5105 1051 0510 5100]]
Credit limit £10,000. Statement balance £2,418.66. Minimum payment £72.56.
Transactions: 03/12 Trainline £182.40; 09/12 Premier Inn £214.00; 15/12 Screwfix £96.20.
` },
  { file: '39-ie-payment.txt', body: `
Payment instruction to Irish subcontractor
Beneficiary: Doyle Joinery Ltd
IBAN: [[IBAN|IE29 AIBK 9311 5212 3456 78]]
UK collection account: [[IBAN|GB82 WEST 1234 5698 7654 32]]
Amount: €4,200.00   Reference: DJ-2026-004
` },
  { file: '40-release-notes.md', body: `
# Ledger sync 4.12.0 (build 20251231)

- Fixed rounding on VAT box 6 (issue #1182).
- New: reconciliation tolerance of £0.01.
- Requires Node 20.11 or later; tested on 2,000,000 rows in 41.2 seconds.
- Released 31/12/2025.
` },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeCorpus(path.join(path.dirname(fileURLToPath(import.meta.url)), 'corpus'), DOCS);
  console.log(`Wrote ${DOCS.length} documents to test/corpus/`);
}
