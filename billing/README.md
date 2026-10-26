# DICE — Progressive & Milestone Billing prototype

Open `index.html` in a browser (no build, no server, no backend). The layout follows the real **DICE corporate portal**:
lilac sidebar group, underlined tabs, alternating-row tables, a stage tracker on every PO, and right-hand drawers for
*Create PO Order*, *GRN*, *SRN* and *Submit Invoice*. Amounts are in **INR** with **GST**.

All data lives in `localStorage`; **Scenarios & reset** (bottom of the sidebar) restores the seed.
Use **Acting as** (sidebar) to switch role — *Demo Admin* can do everything.

Flow: **PO → GRN (goods) / SRN (services) → milestone / progress → Invoice → Matching → Approval → AP**

## The one rule that keeps the flows consistent
A PO is either **Goods** or **Services**.

| | Goods PO | Services PO |
|---|---|---|
| Receipt document | **GRN** (delivered / rejected qty, inspection) | **SRN** (service value, acceptance) |
| Milestone gate ("needs an accepted …") | accepted **GRN** | accepted **SRN** |
| Progressive basis | accepted GRNs | accepted SRNs **or** certified work progress |

The gate follows the PO type everywhere — labels, buttons, validation and matching. A Goods PO can never ask for an SRN.

## What changed from the first prototype

**Logic fixes**
- Goods PO + milestones asked for an SRN that cannot exist on a goods PO → milestones now gate on a **GRN** (Services: **SRN**). You can create the receipt straight from the milestone drawer, or link an existing one. A receipt can back only one milestone; a reversed / pending / rejected receipt never clears the gate.
- Certified work progress is **Services only** and is tracked at PO level (the old claim form compared a per-line contract value with PO-wide certified totals).
- Receipts can only be created on **approved** POs of the matching type (GRN only on goods, SRN only on services).
- `Save PO` can no longer overwrite an approved PO (only drafts are editable; approved POs use **Amend PO**).
- Percentage schedules always add up to the PO value to the paisa (the last milestone absorbs rounding).
- GST is validated against the PO's own GST rate (it used to read the first line's tax code).
- Over-receipt, “partial milestone billing”, fixed-amount schedules and schedule “exceptions” are gone — milestones are billed once, in full.
- Only one open progress claim at a time; claims cannot exceed the PO value.
- One-step receipts: **Complete GRN / Complete SRN** accepts immediately; **Send for inspection / Submit for acceptance** leaves it pending. Pending quantities still reserve the PO quantity but are never invoice-eligible.

**UI**
- Re-skinned to the DICE portal (see above). Fewer screens: milestones, claims, receipts and invoices live inside the PO (tabs + drawers); the old Billing-Schedules, Matching and Dashboard-filter pages are folded into PO / Invoice / Overview.
- PO tabs: Overview · Line Items · Milestones / Progress Claims / Billing · GRN or SRN · Invoices · History. **What's next** tells you the next action on the PO.
- Removed options: payment terms, per-line codes / tax codes / locations, currency picker, approver / criteria / evidence-required fields, reorder arrows, finalize / unlock, “run matching on submit”, VAT override.

## Milestone lifecycle (simple, mirrors the PO)
`Pending Approval → Approved → (receipt check) → Completed`
1. **Approve** — once the PO is approved, each milestone is approved by the approver (button on its row and in its drawer; **Reject** is also available).
2. **Receipt check** — if the milestone needs a GRN (Goods) / SRN (Services), that receipt must be linked and *Accepted*. **Mark complete** stays locked until then.
3. **Mark complete** — done by the project owner / vendor; this is what makes the milestone **billable** and what counts toward the PO's accepted value, stage tracker and balances.
4. **Invoice** — only a *Completed* milestone with a clear gate can be invoiced, once, in full. If its receipt is later reversed or rejected, it stops being billable again.

## Round 2 — PRD alignment and DICE fidelity
- **Milestone approval is now visible everywhere**: an **Approve** button on the schedule row (Milestones tab), a **Your decision** card at the top of the milestone drawer (Approve / Request information / Reject), the drawer footer, the *What's next* card and the Approvals queue. A pending milestone shows **Mark complete** on its row.
- **PRD rules added**: segregation of duties (the role that submitted a milestone cannot approve / reject / query it — *Demo Admin* acts for every role so it is exempt; switch **Acting as** to test it) and the *Info Requested* outcome (vendor resubmits).
- **View GRN / View SRN** drawer (“All grn details”): PO number, GRN ID, items table, GRN amount / tax / total, delivery date, owner, remarks, attachments — plus the PRD's allocations and remaining eligible quantity. **Submit** / **OCR Invoice** open the invoice drawer with that receipt preselected (OCR is simulated).
- **View Invoice** drawer: invoice document on the left (vendor, invoice details, addresses, line items, financial summary with CGST/SGST/IGST) and tabs on the right — Format (matching checks as expandable rows, Three Way Match table, hold reasons, requested by, invoice details), Timeline, Settlement, CN, DN, PO, Holds. Open it with **View** on any invoice row.
- **PO screens**: GRN/SRN tab with *Pending … Items* / *Past … Items* and an *Invoices +* section; PO detail right column with Timeline (TAT, Export), Delegate Access, Support Ticket, PO copy to vendor; list toolbar (Filter · count · List View · Download Csv · Upload Csv · Manage Table View) — **Download Csv** exports the current list; Create-PO line items use the bordered DICE table with *Bulk Upload* and *Additional Attachment*.
- **Sidebar** shows the full DICE menu; entries outside this prototype show a short notice when clicked. The round button collapses the menu.

## Seeded POs (Scenarios & reset → Seeded demo)
| PO | Type · Billing | What it demonstrates |
|---|---|---|
| …/42 | Goods · Progressive | GRN-001/002/003 → 77 of 100 units eligible (INR 77,000) |
| …/43 | Goods · **Milestone** | M2 *Equipment Delivered* is approved but **blocked until GRN-001 is inspected** |
| …/44 | Goods · Standard | accepted GRN-001 (INR 24,000) + a GRN pending inspection |
| …/51 | Services · Progressive | accepted SRN-001, one invoice in approval and one with a GST mismatch |
| …/52 | Services · **Milestone** | M1 approved but SRN-001 pending → invoice blocked |
| …/60 | Services · Certified progress | PC-001 certified & invoiced; PC-002 awaiting certification (cum. 50,000 − 30,000 = 20,000) |
| …/61 | Goods · Standard | waiting for PO approval |

## Rules enforced (see `js/logic.js`)
- Eligibility: accepted GRN qty / accepted SRN value / approved milestone (+ accepted GRN or SRN where required) / certified claim. Pending, rejected and reversed quantities never qualify.
- Reservations: an invoice holds its allocation from *Submitted* to *Paid*; Rejected / Cancelled / Matching Failed / Draft hold nothing. First submit wins, the second is blocked.
- Approved, invoiced (reserved), paid and ready-to-invoice are separate measures everywhere.
- Credit / debit notes are separate adjustments and do not restore receipt quantities.
- PO amendments never rewrite history: prices lock once receipts / invoices exist, invoiced / approved milestones keep their amount.
- Posting and payment are simulated — nothing external is contacted.

## Files
| File | Purpose |
|---|---|
| `js/core.js` | helpers, INR / date formatting, icons, roles, persistence, audit |
| `js/logic.js` | **all rules**: balances, gates, matching engine, state transitions |
| `js/seed.js` | seed data + scenario loaders (`default`, `A`, `B`) |
| `js/ui.js` | router, drawers, modals, list engine, sidebar |
| `js/screens-po.js` | PO list, create / edit drawer, PO detail |
| `js/screens-receipts.js` | GRN / SRN drawers, receipt detail, receipts list |
| `js/screens-bill.js` | PO Billing tab: milestones (+ gate controls), claims, receipt allocation |
| `js/screens-inv.js` | invoice list, Submit Invoice drawer, invoice detail, approvals, AP |
| `js/screens-dash.js` | Overview |

---

# How to test

## Manual
1. Open `index.html`, then **Scenarios & reset → Reset demo data**.
2. Leave **Acting as** on *Demo Admin* (other roles disable buttons they don't own; hover to see why).

### Goods PO on milestones (the case that used to break)
1. Open **PO …/43 → Milestones**. M1 is *Eligible*; M2 shows `GRN-001 · Pending Inspection` and is *Not Eligible*.
2. Click M2 → the gate card shows the GRN. Open GRN-001 → **Accept all** (or **Record inspection** with some rejected units to see it stay blocked).
3. Back on M2: eligibility checklist is green → **Submit Invoice for M2**. The invoice drawer shows the live invoice preview and totals (base + 18% GST).
4. Try a second invoice for M2 → blocked ("only one invoice is allowed per milestone").

### Build a PO from scratch
1. **Purchase Order → Create Order**. Pick **Goods** or **Services**, vendor, title, line items, then a billing method. For *Milestone* tick "Needs an accepted GRN / SRN" on the milestones that need proof.
2. **Create Order** → open the PO → **Approve**.
3. Milestone drawer: **Mark complete & submit** (attach a sample file) → **Approve milestone**. Create the GRN / SRN from the same drawer and watch the gate clear.

### Progressive billing (PO …/42)
1. **Billing** tab → **Submit Invoice** → tick GRN-001, quantity 30 → submit. Expect Matched / Pending Approval, base 30,000 + GST 5,400.
2. A second invoice for GRN-001 is blocked; 25 units against GRN-002 (20 free after another invoice) shows the live message "Eligible: 20 units. Requested: 25 units."
3. **Approvals → Invoices** or the invoice page: **Approve → Post to AP → Mark as Paid**; check **Account Payables** and the PO overview bar (paid / approved / in approval / ready to invoice are separate).

### Other behaviours
| Test | Where | Expected |
|---|---|---|
| Standard billing | PO …/44 → Submit Invoice, 30,000 | blocked: accepted receipts are only 24,000 |
| SRN-gated milestone | PO …/52 → M1 → SRN-001 → Accept SRN | M1 becomes eligible; milestone approval itself unchanged |
| Certified progress | PO …/60 → Progress Claims → PC-002 → Certify | current claim 20,000; invoicing 50,000 blocked |
| Reversal | Accepted GRN → Reverse GRN | dependent invoices fail re-matching; a linked milestone loses its gate |
| Amend PO | PO …/43 → Amend PO | prices locked once receipts exist, invoiced milestones locked |
| Wrong type | Goods PO → GRN tab / Services PO → SRN tab | only the matching receipt can be created |

## Automated (needs Node and Chrome or Edge)
```
node tests/build-and-run.js                                  # ~110 logic checks, last line: ALL PASSED
powershell -File tests/run-browser.ps1 smoke.html            # every route / tab / drawer, last line: SMOKE PASSED
powershell -File tests/run-browser.ps1 flow.html             # clicks & typing through the drawers, last line: ALL UI FLOWS PASSED
powershell -File tests/shot.ps1 -Name x -Hash '#/pos'        # screenshot to %TEMP%\dice-shots (optional -Do '<js>' to open a drawer first)
```
`tests/shot.html` is the debug page behind `shot.ps1` (`shot.html?scn=B&do=<js>#/route`).

## Troubleshooting
- **Stale or odd data:** use **Scenarios & reset**, or clear this site's `localStorage` (the key is `dice.billing.proto.v2`).
- **A button is greyed out:** check **Acting as**, or the PO may not be Approved yet.
- **Fonts look different offline:** Inter loads from Google Fonts; the app falls back to system fonts.
