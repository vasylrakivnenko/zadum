# A Day in the Life: Financial Dashboard from the Excel Files

1. 1. Priya the Bookkeeper signs in and uploads the file Financials_2024_Q1.xlsx, naming the period it covers as Q1 2024, and the file is kept along with a note of who uploaded it and when.
2. 2. The system reads the rows and shows Priya three groups: rows ready to file, rows whose category name didn't match anything, and rows whose amount couldn't be read. One row shows a garbled amount and is set aside as needing a fix.
3. 3. Priya matches an unmatched 'Rent' row to the Office Rent category. Only once matched does it become a real line, tied to exactly one category and one period.
4. 4. No category fits a 'Zoom licence' row, so Priya creates a new 'Software' expense category and matches the row to it.
5. 5. The garbled row can't be repaired, so Priya discards it so it can never hold up the period. With every row now matched or discarded, Q1 2024's revenue, expenses, and profit appear on the dashboards.
6. 6. Priya notices a rent line reads $32,000, corrects it to $3,200, and the totals recalculate automatically. The correction is written into the history with her name and the time.
7. 7. Sam the Owner signs in, opens his own saved 'Monthly Overview' view, and sees Q1 2024: revenue $148,000, expenses $110,000, and net profit $38,000 — a figure the system works out, never typed by hand.
8. 8. Satisfied, Sam closes Q1 2024. From now on its figures are locked from changes.
9. 9. Priya spots a small mistake in the closed Q1 2024 and tries to change it — the change is refused because the period is closed. She asks Sam to reopen it.
10. 10. Sam reopens Q1 2024, Priya makes the fix, the profit recalculates, and both the reopen and the fix are recorded. Sam then closes the period again.
11. 11. Sam invites Jane as a Manager for the Marketing area only, and Jane receives an email link to set her password and sign in.
12. 12. Jane signs in and sees the Marketing spend of $9,400. When she tries to open the Payroll figure and the company profit, nothing is shown to her — those stay hidden.
13. 13. Jane tries to upload a new file to fix a number herself, but the upload controls aren't available to her and the action is refused.
14. 14. Dana the Accountant signs in, reviews Q1 2024 revenue of $148,000, the expense totals, and the profit summary, and downloads them as a spreadsheet for tax work — but cannot change anything.
15. 15. Later Priya uploads a corrected Q1 2024 file. The new file replaces the old figures rather than adding to them, so revenue still reads $148,000 and not $296,000, and the earlier version stays available to switch back to.
16. 16. Priya tries to open the change history to see who did what, but only Sam the Owner can view that full history.

## Please confirm
- Is it right that unmapped category handling — block period from showing until all rows mapped, and that languages & regions — one language, one country?
- Is it right that manager area scoping (permission-escalation) — only assigned categories; company totals hidden, and that period boundary definition (time-boundaries) — fixed calendar months/quarters/years?
- Is it right that history — a full, viewable history of every change, and that files — yes — upload and download?
- Is it right that re-upload replacement — keep prior version, switch active, allow rollback, and that who logs in — several people log in, possibly with different powers?
- Is it right that upload parse failure (partial-failure) — import valid rows, flag bad ones for fixing, and that volume — hundreds of records?
