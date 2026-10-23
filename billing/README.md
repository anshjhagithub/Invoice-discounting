# DICE — Progressive & Milestone Billing prototype

Open `index.html` in a browser (no build, no server, no backend). Styling and structure follow the existing
**Buyer portal** / **Employee Portal** (same tokens, Inter, compact tables, sidebar + sticky page header).
All data is persisted in `localStorage`; **Demo → Scenarios & reset** (sidebar, or Dashboard) restores the seed.
Use **Acting as** (sidebar) to switch role (Admin = everything).

Flow: PO → GRN/SRN → Supplier Invoice → Matching → Approval → AP.

## Layout
| File | Purpose |
|---|---|
| `js/core.js` | helpers, icons, roles/permissions, persistence, audit |
| `js/logic.js` | **all rules**: derived balances, allocation reservations, validation gate, matching engine, state transitions |
| `js/seed.js` | interconnected seed data + scenario loaders (`default`, `A`, `B`) |
| `js/ui.js` | router, modals/drawers/toasts, lists, sidebar |
| `js/screens-*.js` | PO, receipts, milestones/claims, invoices/matching/approvals/AP, dashboard |
| `tests/` | `node tests/build-and-run.js` (logic scenarios A–D etc.); `smoke.html` / `flow.html` run in a browser |

## Seeded POs
| PO | Billing | What it demonstrates |
|---|---|---|
| PO-2026-1042 | Progressive (receipt) | GRN-001/002/003 → 77 of 100 units eligible (AED 77,000) — Scenario A steps 7–12 |
| PO-2026-1043 | Milestone | M1 20% / M2 50% / M3 30% approved schedule — Scenario B |
| PO-2026-1044 | Standard | accepted GRN-001 (AED 24,000) + a pending GRN — Scenario C |
| PO-2026-1051 | Progressive (SRN) | accepted SRN-001, one pending approval and one VAT-failed invoice — Scenario D |
| PO-2026-1052 | Milestone + SRN gate | M1 approved but SRN pending → invoice blocked — Scenario D |
| PO-2026-1060 | Progressive (certified) | PC-001 certified & invoiced; PC-002 awaiting certification (cum. 50,000 − 30,000 = 20,000) |

Load **Scenario A / B** from the demo dialog to start PO-2026-1042 as a Draft and walk the whole flow yourself.

## Rules enforced (see `logic.js`)
- Eligibility: accepted GRN qty / accepted SRN value / approved milestone (+ accepted SRN gate) / certified claim. Pending, rejected and reversed quantities never qualify.
- Reservations: an invoice holds its allocation from *Submitted* to *Paid*; Rejected/Cancelled/Matching Failed/Draft hold nothing. The first submit wins, the second is blocked.
- Approved, invoiced (reserved), paid and remaining-eligible are separate measures everywhere.
- Credit/debit notes are separate adjustments and do not restore receipt quantities.
- PO amendments never rewrite historical allocations (prices locked once receipts/invoices exist; invoiced milestones locked).
- Posting and payment are simulated — nothing external is contacted.

---

# How to test the flows

There are two ways: click through the app (manual), or run the automated checks.

## 1. Manual testing

### Setup
1. Open `index.html` in Chrome or Edge (double-click works).
2. Click **Scenarios & reset** in the sidebar and choose a starting point. This replaces the data saved in the browser.
3. Leave **Acting as** on *Demo Admin (all roles)*, otherwise some action buttons are disabled for that role (hover a disabled button to see which role it needs).

| Starting point | Use it for |
|---|---|
| Seeded demo (Reset Demo Data) | Scenarios C and D, certified progress, dashboard, AP |
| Scenario A | PO-2026-1042 as a Draft, progressive billing from scratch |
| Scenario B | PO-2026-1042 as a Draft with the 20/50/30 milestone schedule pre-filled |

### Scenario A: progressive billing (load Scenario A)
1. **Purchase Orders** → PO-2026-1042 → **Edit** → step 3. Choose **Progressive**, click **Next**, then **Submit for Approval**.
2. On the PO page click **Approve**.
3. Click **Create GRN**. Enter 30 received, click **Accept all received**, then **Submit & Accept**. Repeat with 40 received.
4. Create a third GRN: 10 received, 7 accepted, 3 rejected, then **Submit & Accept**.
   - Expect on the PO Overview tab: accepted 77 units / AED 77,000, remaining PO quantity 23.
5. **Supplier Invoices** → **Create Invoice** → select PO-2026-1042. Tick GRN-001, qty 30, enter an invoice number, **Submit Invoice**.
   - Expect: net 30,000 / VAT 1,500 / gross 31,500, result **Matched**, status **Pending Approval**.
6. Create a second invoice for 20 units of GRN-002 (net 20,000, VAT 1,000, gross 21,000).
7. Create a third invoice and tick GRN-001 again with qty 30.
   - Expect: blocked, "Duplicate allocation blocked: all 30 accepted units of GRN-001 are already allocated to INV-…".
8. Create another invoice with GRN-002 qty 25.
   - Expect the validation panel to show: "Invoice quantity exceeds the eligible quantity remaining against GRN-002. Eligible: 20 units. Requested: 25 units."
9. Open the PO → **Billing Schedule** tab. Expect invoiced 50 units / AED 50,000 and remaining eligible AED 27,000. GRN-003 shows only its 7 accepted units.
10. Open an invoice: **Approve** → **Post to AP** → **Mark as Paid (demo)**. Check **Accounts Payable** and the PO Overview (approved, paid and reserved amounts are shown separately).

### Scenario B: milestone billing (load Scenario B)
1. **Purchase Orders** → PO-2026-1042 → **Edit** → step 3. Change M3 to 40%.
   - Expect: "exceeds the PO value" and **Finalize schedule** is blocked. Set it back to 30%.
2. Optionally test **Add milestone**, the up/down reorder arrows and the "Fixed amounts" mode.
3. Click **Finalize schedule** (fields lock), **Next**, **Submit for Approval**, then **Approve** on the PO page.
4. PO → **Billing Schedule** tab. All milestones are *Pending Acceptance* and *Not Eligible*. Click M1 to open its drawer.
5. Open M1's full page. Enter a completion date, remarks and a sample file, then **Mark as Submitted for Acceptance**, then **Approve Milestone**.
   - Other actions to try on a submitted milestone: **Request More Information**, **Reject Milestone**.
6. Click **Create invoice for this milestone** and submit (AED 20,000, VAT 1,000, gross 21,000). Approve it.
7. Try a second invoice against M1.
   - Expect: blocked, "milestone M1 is already invoiced… only one invoice is allowed per milestone".
8. M2 and M3 are still not eligible. Remaining eligible value is AED 0.

### Scenario C: standard billing (seeded demo)
1. **Create Invoice** → PO-2026-1044 (Standard). Enter net 30,000.
   - Expect: blocked, accepted receipts are only AED 24,000.
2. Enter 24,000 and submit. Expect Matched, Pending Approval. Approve it. Remaining eligible becomes 0.
3. Note the pending GRN-002 on this PO is not invoice-eligible until accepted.

### Scenario D: service receipts (seeded demo)
1. **PO-2026-1051** (progressive, SRN-based): SRN-001 accepted AED 25,000. Create an invoice against SRN-001 for AED 12,000 → blocked (10,000 eligible). Use 10,000 → passes.
2. **PO-2026-1052** (milestone, accepted SRN required): open milestone M1. It is approved but not invoice-eligible because SRN-001 is *Pending Acceptance*.
3. Try **Create invoice** for M1 → blocked ("linked SRN-001 is Pending Acceptance").
4. **Service Receipts (SRN)** → SRN-001 → **Accept SRN**. Return to M1: its approval is unchanged, and the invoice is now allowed.

### Other behaviours to try
| Test | Where | Expected |
|---|---|---|
| Certified progress | PO-2026-1060 → **Progress Claims** → PC-002 → **Certify claim** | Current claim 20,000 (cum. 50,000 − 30,000). Invoicing 50,000 is blocked; 20,000 passes |
| Reject releases allocation | Reject a Pending Approval invoice | GRN/milestone quantity becomes available again |
| Concurrency | **Save as Draft** two invoices on the same GRN, then submit both | First submit reserves it, second is blocked |
| Receipt reversal | Open an accepted GRN → **Reverse GRN**, then **Run matching** on a dependent invoice | Matching Failed; new invoices on that GRN blocked |
| Pending inspection | Create a GRN with accepted + rejected < received | Status *Pending Inspection*, not invoice-eligible |
| Over-receipt | Create a GRN above the remaining PO quantity | Blocked with the remaining quantity |
| Duplicate invoice number | Submit two invoices with the same supplier invoice number | Second one fails matching (Duplicate invoice check) |
| VAT mismatch | Enter a VAT override differing by more than AED 1 | Matching Failed (VAT / tax validation); the EFS-2026-017 invoice is seeded this way |
| Amend PO | PO → **Amend PO** on a PO with invoices | Prices locked, invoiced milestones locked, history preserved |
| Credit note | Approved/posted invoice → **Credit / debit note** | Payable changes; receipt quantities are not restored |
| Dashboard | Dashboard filters and tiles | Tiles recompute and open filtered lists |
| Persistence | Refresh the page | Data is kept; **Reset Demo Data** restores the seed |
| Permissions | Switch **Acting as** to another role | Buttons for other roles become disabled with a tooltip |

## 2. Automated checks

Requires Node. Run from the `billing` folder.

### Logic tests
```
node tests/build-and-run.js
```
Runs about 90 checks covering Scenarios A–D, certified progress, concurrency, reversals, duplicate allocation, GRN validation and amendments. The last line is `ALL PASSED` on success; failures are printed as `FAIL …`.

### Browser tests (headless Edge)
`tests/smoke.html` renders every route and fails on any screen error. `tests/flow.html` drives Scenarios A and B through the real UI handlers (wizard, GRN form, invoice form, modals).

```
msedge --headless=new --allow-file-access-from-files --virtual-time-budget=8000 --dump-dom "file:///<full path>/billing/tests/flow.html"
```
Look inside `<pre id="out">` in the output. A successful run ends with `ALL UI FLOWS PASSED`; `smoke.html` ends with `DONE routes=56`. You can also just open either file in a browser and read the text on the page.

## Troubleshooting
- **Stale or odd data:** use **Scenarios & reset**, or clear this site's `localStorage` in the browser.
- **A button is greyed out:** check **Acting as**, or the PO may not be Approved yet.
- **Fonts look different offline:** Inter loads from Google Fonts; the app falls back to system fonts.
