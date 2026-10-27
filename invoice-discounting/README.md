# DICE — Invoice Discounting prototype (SID over PSBXchange)

Open `index.html` in a browser — no build, no server, no backend. It re-uses the UI shell of the
[Progressive & Milestone Billing prototype](../billing/) (sidebar, drawers, lists, badges, CSS) and adds the
**Avail Financing → Invoice Discounting** journey from the DICE PRDs and clickable wireframes.

* **Billing is commented out, not deleted.** `index.html` no longer loads the billing scripts (they are kept in a comment and in `../billing/`),
  the billing menu / roles / permissions in `js/core.js` and `js/ui.js` are commented out, and the store key is separate
  (`dice.invoicediscounting.proto.v1`) so the billing prototype's data is untouched.
* All data lives in `localStorage`. **Scenarios & reset** (bottom of the sidebar) restores the seed.
* **Acting as** switches role (Finance, Approver, AP, Vendor, Integration Ops). As *Vendor*, a second picker chooses which supplier you are.
* The "PSBXchange" and "lender" are an in-browser fake that keeps **its own state** (`db.psb`), so lost responses and dropped callbacks are real
  situations DICE must recover from. Everything it does is visible in **Integration Console**.

## What is in it

| Area | Screens |
|---|---|
| **Avail Financing** | Programmes list → 4-step *Add Programme* wizard → programme tracking page (per-lender status, offers, timeline, API request/response) · Suppliers list → 3-step supplier onboarding (buyer invite or supplier self-service) → supplier profile · Active Programmes → programme detail · vendor-portal "Financing" tile |
| **Invoice Discounting** | All Invoices (Pending / Completed / Declined) · invoice detail with the full eligibility checklist and payment control · *Request early payment* drawer · financing request status (offers, acceptance, funding, settlement, exceptions) · Admin settings · Financiers |
| **Integration Console** | API catalogue (every API, when DICE calls it, **required fields with the workbook's mandatory flags**, sample request/response) · API log with JSON drawer · Sandbox (provoke every failure) · Status mapping · Exceptions |

## How the PSBXchange APIs are called

| API (workbook) | When DICE calls it | Notes |
|---|---|---|
| **Get Partnerships Details** | Avail Financing landing page / lender step / manual refresh / cache expiry | Cached (30 min). `partnershipstatus` is a list; `ALL` supersedes. Only an *Active* partnership that lists the product is selectable. Never blocks P2P. |
| **Lead API** | **Once**, after the user submits *and* the authorised approver approves. Never on page open, step change or draft save. | `leadtyp=PGL`, `productcode=SID`. Same `customerreferenceid` + `sourcingpartnerleadid` on every retry. |
| **Get Status** | Refresh button, reconciliation, missed callback | One call per lead **per lender** (all four request fields mandatory). A fresh `customerreferenceid` each call. |
| **Status Callback** (DICE endpoint) | PSB pushes | Authenticated, de-duplicated, correlated, order-checked, mapped; unmatched callbacks are parked. |
| Get Additional Lenders | Admin → Financiers → *Discover more lenders* | Discovery only. |
| Get Channel Partners for a Program | **Not called** — DF/VF only | In the catalogue for completeness. |
| **Transaction Initiate / Transaction Status Callback** | Supplier confirms *Get paid early* | **Not in the workbook** (listed in its index, no schema sheet). Implemented as a clearly-labelled **provisional adapter** built only from the fields the PRD lists. Swap `txnAdapter` in `js/id-gateway.js` when the real contract arrives. |
| Supplier onboarding (SID) | Supplier submits onboarding | **No PSBXchange call** — the workbook allows CPL only for DF/VF. DICE keeps its own case; provider outcomes are simulated and mapped to DICE-neutral statuses. |

## Mandatory fields

`js/id-schema.js` is **generated from the workbook** (`tools/gen_schema.py`): 48 Lead API request rows, 87 Get Status response rows, the other APIs, the Master Reference and the Status Master.
The red asterisks on the forms are drawn from it (`isReqKey`), the validator enforces it, and `tests/id.test.js` blanks **every** "Yes" row (and the PGL-conditional "Yes*" rows) and fails if the prototype lets it through.
Conditional rows follow the sheet: rating + agency are mandatory for a Program Lead; relationship vintage, conduct, anchor-recommended limit, purchases/turnover/PAT, dependency and `psbplatformprogramid` are CPL-only and are **discarded** from a PGL payload.

## Edge cases covered (all have tests)

*Programme / Lead API* — approver ≠ submitter; Lead API not called until approval; field-level errors mapped back to the form; server-side rejection keeps the same references; **timeout where the lead *was* created** → retry creates no duplicate; HTTP 500 / outage → "uncertain", never "failed"; lead stuck in Draft; duplicate active lead (PAN + product + lender); lender went inactive after caching; no active SID partnership (blocks with escalation); product not enabled for the tenant / not active at PSB; sourcing partner inactive.
*Callbacks* — bad signature rejected; duplicate applied once; out-of-order ignored; unknown lead parked; unknown status flagged; Lender-master aliases (*Lead Matched* = *Match Found*) normalised; dropped callback recovered with Get Status.
*Eligibility* — approval, 3-way match (with tolerance), payment scheduled/paid, duplicate financing, dispute/block, unresolved credit note (needs review), financing window, currency, minimum amount, programme headroom, supplier status / bank verification / bank changed / consent, programme inactive, optional turnover rule, stale snapshot at submit.
*Financing request* — request + payment hold written together; duplicate click / retry creates one request; consent mandatory; **submission timeout keeps the hold** until a partner query finds (or confirms the absence of) the transaction; outage during a query never releases; 4xx at submission is definitive; funding callback dropped / duplicated / forged; conflicting *Declined* after funding → exception; funded amount ≠ accepted payout → exception; **settlement variance or missing UTR is never "settled"**; cancel allowed before acceptance, refused after; expired offers; hold timeout **flags, never auto-releases**.
*Invoice / supplier changes* — material change pauses an unfunded request (offers invalidated, revalidate or cancel) and opens an exception once funded; supplier suspension and bank change pause in-flight requests; normal AP payment is blocked by hold/lock.
*Supplier onboarding* — buyer cannot consent for the supplier; expiring invitation (resend); consent, bank and contact validation; account number masked after save; provider decisions (documents, bank fail, reject, suspend, reinstate).

## Tests

```
node tests/id.test.js                  # 89 domain tests (no dependencies)
npm i jsdom && node tests/ui-smoke.js  # renders 330 screens (every route × 6 roles) and fails on any screen error
node tests/ui-flow.js                  # 52-check click-through of the real UI: wizard → approval → PSB → supplier → invoice → offer → funding → settlement
```

## Files

```
index.html                 loads the scripts (billing ones commented out)
css/base.css app.css       DICE shell (unchanged) · css/id.css additions
js/core.js ui.js           shell (billing roles/menu commented out)
js/id-schema.js            GENERATED from the workbook
js/id-validate.js          regexes, lead payload builder, payload validator (shared by form + mock server)
js/id-gateway.js           fake PSBXchange (+ provisional transaction adapter), request logging
js/id-logic.js             programmes, supplier profiles, eligibility, financing requests, payment control, callbacks
js/id-seed.js              demo data (built through the same code paths as live use)
js/id-ui.js                shared widgets · js/screens-avail.js · screens-inv.js · screens-integration.js · boot.js
tools/gen_schema.py        workbook → js/id-schema.js
```

## Open questions (also listed in the Integration Console)

Transaction Initiate / Status Callback schemas and the SID supplier-onboarding route · the PAN rule "6th–9th digit = 0000 to 1111" (read literally it rejects real PANs; any 4 digits are accepted here) ·
epoch unit and time zone (seconds, IST midnight here) · Industry Master and error-code list are referenced/needed but not published · Status Callback carries no lead or lender ID and no authentication scheme ·
`externalrating` is mandatory for a Program Lead but there is no "unrated" value · the wireframe's sample customer reference `DICE-PGL-20261013-001` contains hyphens and would fail the alphanumeric rule.
