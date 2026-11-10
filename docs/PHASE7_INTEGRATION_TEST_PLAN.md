# Phase 7 — Integration & Testing

## Objective

Validate the Windows desktop application as one offline-first, multi-branch hardware retail system. This phase prioritizes data integrity and end-to-end workflows over adding new business features.

## Baseline

- Starting branch: `feature/reports-management-phase6`
- Phase 6 commit: `571b8f287f1356aaa76b33c1f01af1b50d9c5177`
- Phase 6 Windows CI run: [#104](https://github.com/collkip-creator/Hardware-Retail-Management-System/actions/runs/42783030142) — successful.
- This branch is a test/integration branch. Do not merge it into `main` until the full acceptance gate below passes.

## Test environments

1. Clean Windows installation with a new local database.
2. Upgrade installation with an existing populated local database.
3. Two Windows devices paired to the same business, with at least two branches.
4. Offline mode after a successful initial sign-in and sync.
5. Reconnection after offline transactions have been recorded.

Use synthetic test businesses and records. Never use live customer data for destructive tests.

## End-to-end acceptance matrix

| ID | Workflow | Test | Expected result |
|---|---|---|---|
| INT-01 | Catalogue → Products | Import or select catalogue products, then add them to a business catalogue | Existing business prices, stock and product records are not overwritten; adopted products begin with zero stock and explicit business pricing |
| INT-02 | Products → Purchasing → Stock | Create a supplier purchase, receive all items, then inspect stock | Received quantities increase the correct branch stock once; unreceived quantities remain outstanding; repeated receipt submission is rejected |
| INT-03 | Purchasing → Supplier balances → Accounting | Receive goods and record full/partial supplier payments | Supplier balance decreases by the payment amount; payment method and reference are retained; accounting entries balance |
| INT-04 | Customers → POS | Create/select a customer, complete a sale and inspect customer history | Sale is linked to the selected customer; history and spending totals reflect the completed sale; walk-in sales remain valid |
| INT-05 | POS → Cashbook → Accounting | Complete cash, M-Pesa and split-tender sales | Tender allocations add up exactly to the sale total; cashbook entries use the correct methods; posted journals balance |
| INT-06 | POS discounts → Approval audit | Apply line and whole-sale discounts with and without manager approval | Unauthorized or invalid approvals are rejected; approved discounts record approver and reason; net sale amount is consistent across receipt, history and reports |
| INT-07 | POS returns → Stock → Cashbook → Accounting | Return part of a sale, with and without restocking; refund by cash, M-Pesa and split tender | Refund cannot exceed refundable value; restock choice is respected; refund allocation, cashbook, shift totals and journal entries agree |
| INT-08 | POS shifts → Reconciliation | Open a shift, transact, refund and close the shift | Expected cash and M-Pesa equal opening float plus tenders less refunds; variances match counted balances and remain visible after restart |
| INT-09 | Inventory → POS | Transfer stock between branches and sell from each branch | Source decreases and destination increases by the same quantity; no branch can sell stock it does not hold |
| INT-10 | Inventory → Stocktake | Record a stocktake with gains and losses | Adjustments are auditable, branch-specific and reflected in on-hand quantities and valuation |
| INT-11 | Accounting → Financial statements | Post receipts, expenses, purchases, supplier payments, sales and returns | Trial Balance balances; General Ledger, Profit & Loss and Balance Sheet reconcile to the same posted journals |
| INT-12 | All modules → Reports | Filter reports by date and branch; compare report totals with source screens | Report figures reconcile to underlying records; branch filters do not leak another branch's operational data; accounting's posted-journal scope is clearly labelled |
| INT-13 | Permissions | Sign in as Business Owner, Manager, Accountant, Supervisor and Cashier | Navigation and backend authorization enforce role permissions; hiding a tab alone is not treated as authorization |
| INT-14 | Licensing | Test valid, expired, suspended, revoked and machine/branch-limit scenarios | Access follows licence state; revocation/suspension/expiry never deletes local business data |
| INT-15 | Offline login | Sign in online, disconnect, close/reopen app and sign in with an authorized staff account | Previously synchronized staff can log in offline; unauthorized or never-synchronized credentials are not silently accepted |
| INT-16 | Offline transactions | While offline, create sales, returns, receipts, purchases and expenses | Transactions persist locally across restart; no duplicate records are created by retries |
| INT-17 | Reconnection | Reconnect after offline activity and inspect synchronization | Pending changes sync once, in a deterministic order; conflicts are surfaced and resolved without silent data loss |
| INT-18 | Multi-device / multi-branch | Use two paired devices on different branches and then reconnect | Branch ownership and stock remain correct; shared staff accounts retain their permissions; duplicate IDs and duplicate transactions are prevented |
| INT-19 | Upgrade / migrations | Install a newer build over a populated prior build | Existing records remain intact; migrations are additive, repeatable and recover safely from interrupted startup |
| INT-20 | Exports / printing | Export reports to CSV and print receipts/reports | CSV opens in spreadsheet software with correct amounts and dates; print layouts omit application navigation and remain readable |

## Critical reconciliation rules

- Every sale's tender allocations must sum to its payable amount exactly.
- A return must reference its original sale and cumulative refunds must never exceed the refundable amount.
- A stock receipt, transfer, return-restock or stock adjustment must affect inventory exactly once.
- Supplier outstanding balance must reconcile to received purchase value less supplier payments and approved credits/returns, according to the system's documented accounting policy.
- Every posted journal must have equal total debits and credits.
- POS shift expected balances must use recorded tenders and refunds, not report totals or manually entered figures.
- Reports must state which transactions are included. In particular, accounting totals are based on posted journals; historical transactions not migrated to the ledger must not be presented as ledger-backed results.
- Branch-scoped operational data must not be exposed to a user who lacks access to that branch.

## Defect severity and release gates

- **Blocker:** data loss/corruption, unauthorized access, duplicate financial or stock posting, cross-business data exposure, or inability to launch/login.
- **Critical:** incorrect sale/refund/stock/accounting totals, broken offline persistence, or unrecoverable sync conflicts.
- **Major:** core workflow unavailable, wrong branch scoping, or report/export materially misleading.
- **Minor:** cosmetic or low-impact usability issue.

### Release gate

Do not merge Phase 7 until:
1. The Windows installer CI build succeeds.
2. All Blocker and Critical defects are fixed and retested.
3. INT-01 through INT-20 have recorded Pass/Fail results on a real Windows installation.
4. Offline restart and reconnection tests pass without data loss or duplicate posting.
5. Business Owner and staff role authorization has been checked at both UI and backend levels.
6. Existing-data upgrade has been tested on a backup copy.
7. The user has reviewed and accepted the resulting installer.

## Test record template

For each test, record: test ID, build/commit, Windows version, business/branch fixture, steps executed, expected result, actual result, Pass/Fail, evidence, defect ID and retest result.

Do not mark a test Pass based only on a successful compile or CI build. CI verifies packaging; end-to-end acceptance requires exercising the installed application and its local database.
