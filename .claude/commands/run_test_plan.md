We are executing the test plan. All implementation is complete. Now we verify it works.

## Reference Documents

- **Test Plan:** `notes/test_plan.md`
- **Implementation Plan:** `notes/impl_plan.md`
- **Specs:** `notes/specs.md`
- **Test Status JSON:** `notes/test-status.json`
- **Test Results Log:** `notes/test-results.md`

---

## Phase 1: Initialize

### Step 1: Check for Existing Run (Resumption)

Before creating anything, check if a previous test run exists:

1. Check if `notes/test-status.json` exists
2. Check if there are existing tasks via `TaskList`

**If both exist and tasks have results:**

- This is a **resumed run** — skip to Phase 2 (Step 7)
- Announce: "Resuming previous test run. Skipping already-passed tests."
- Only execute tasks that are still `pending` or `fail` (with fixAttempts < 3)

**If no previous run exists (or files are missing):**

- Continue with fresh initialization below

### Step 2: Read the Test Plan

Read `notes/test_plan.md` and extract ALL test cases. Auto-detect the TC-ID pattern used (e.g., `TC-001`, `TC-101`, `TC-5A`, etc.).

For each test case, note:

- TC ID
- Name
- Priority (Critical / High / Medium / Low — default to Medium if not stated)
- Preconditions
- Test steps and expected outcomes
- Test data (if any)
- Dependencies on other test cases (if any)

### Step 3: Analyze Test Dependencies

Determine which test cases depend on others. Common dependency patterns:

- A "saves data" test may depend on a "displays default" test
- A "form submission" test may depend on "form validation" tests
- An "end-to-end" test may depend on individual component tests

If no clear dependencies exist between test cases, treat them all as independent.

### Step 4: Create Tasks

Use `TaskCreate` to create one task per test case. Set `blocked_by` based on the dependency analysis.

**Task description format:**

```
Test [TC-ID]: [Test Name]
Priority: [Priority]

Preconditions:
- [Required state before test]

Steps:
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | [Action] | [Result] |
| 2 | [Action] | [Result] |

Test Data:
- [Field]: [Value]

Expected Outcome: [Final verification]

Environment:
- Refer to CLAUDE.md for wp-env details, URLs, and credentials
- WordPress site: http://localhost:8105
- Admin: http://localhost:8105/wp-admin (admin/password)

---
fixAttempts: 0
result: pending
lastTestedAt: null
notes:
```

### Step 5: Generate Test Status JSON

Create `notes/test-status.json`:

```json
{
    "metadata": {
        "testPlanSource": "notes/test_plan.md",
        "totalIterations": 0,
        "maxIterations": 50,
        "startedAt": null,
        "lastUpdatedAt": null,
        "summary": {
            "total": "<count>",
            "pending": "<count>",
            "pass": 0,
            "fail": 0,
            "knownIssue": 0
        }
    },
    "testCases": {
        "<TC-ID>": {
            "name": "Test case name",
            "priority": "Critical|High|Medium|Low",
            "status": "pending",
            "fixAttempts": 0,
            "notes": "",
            "lastTestedAt": null
        }
    },
    "knownIssues": []
}
```

### Step 6: Initialize Test Results Log

Create `notes/test-results.md`:

```markdown
# Test Results

**Test Plan:** notes/test_plan.md
**Started:** [CURRENT_TIMESTAMP]

## Execution Log
```

### Verify Initialization

Use `TaskList` to confirm:

- All TC-IDs from the test plan have a corresponding task
- Dependencies are correctly set via `blocked_by`
- All tasks show `result: pending`

Cross-check task count matches `summary.total` in `notes/test-status.json`.

---

## Phase 2: Execute Tests

### Step 7: Determine Execution Order

Use `TaskList` to read all tasks and their `blocked_by` fields. Determine sequential execution order:

1. Tasks with no `blocked_by` (or all dependencies resolved) come first
2. Tasks whose dependencies are resolved come next
3. Continue until all tasks are ordered

**For resumed runs:** Skip tasks where `result` is already `pass` or `known_issue`.

### Step 8: Execute One Task at a Time

For the next eligible task, spawn ONE sub-agent with the instructions below.

**One sub-agent at a time. Do NOT spawn multiple sub-agents in parallel.**

---

#### Sub-Agent Instructions

**You are a test execution sub-agent. You have ONE job: execute and verify ONE test case.**

1. **Read your task** using `TaskGet` to get the full description
2. **Parse the test steps** from the description (everything above the `---` separator)
3. **Parse the metadata** from below the `---` separator
4. **Read CLAUDE.md** for environment details, URLs, and credentials

5. **Execute the test:**

    Using browser automation:
    - Navigate to URLs specified in the test steps
    - Click buttons/links as described
    - Fill form inputs with the test data provided
    - Take screenshots at key verification points
    - Read console logs for errors
    - Verify DOM state matches expected outcomes

    Follow the test plan steps EXACTLY. Do not skip steps.

6. **Determine the result:**

    **PASS** if:
    - All expected outcomes verified
    - No unexpected console errors
    - UI state matches test plan

    **FAIL** if:
    - Any expected outcome not met
    - Unexpected errors
    - UI state doesn't match

7. **If PASS:** Update the task description metadata via `TaskUpdate`:

    ```
    ---
    fixAttempts: 0
    result: pass
    lastTestedAt: [CURRENT_TIMESTAMP]
    notes: [Brief description of what was verified]
    ```

    Mark the task as `completed`.

8. **If FAIL and fixAttempts < 3:**

    a. Analyze the root cause
    b. Implement a fix in the codebase
    c. Increment fixAttempts and update via `TaskUpdate`:

    ```
    ---
    fixAttempts: [previous + 1]
    result: fail
    lastTestedAt: [CURRENT_TIMESTAMP]
    notes: [What failed, root cause, what fix was applied]
    ```

    d. Re-run the test steps to verify the fix
    e. If now passing, set `result: pass` and mark task as `completed`
    f. If still failing and fixAttempts < 3, repeat from (a)

9. **If FAIL and fixAttempts >= 3:** Mark as known issue via `TaskUpdate`:

    ```
    ---
    fixAttempts: 3
    result: known_issue
    lastTestedAt: [CURRENT_TIMESTAMP]
    notes: KI — [Description of the issue, steps to reproduce, severity, suggested fix]
    ```

    Mark the task as `completed`.

10. **Update Test Status JSON** — Read `notes/test-status.json`, update the test case entry and recalculate summary counts, then write back:
    - Set `status` to `pass`, `fail`, or `known_issue`
    - Update `fixAttempts`, `notes`, `lastTestedAt`
    - Increment `metadata.totalIterations`
    - Update `metadata.lastUpdatedAt`
    - Recalculate `metadata.summary` counts
    - If known_issue, add entry to `knownIssues` array

11. **Append to test results log** (`notes/test-results.md`):

    ```markdown
    ## [TC-ID] — [Test Name]

    **Result:** PASS | FAIL | KNOWN ISSUE
    **Tested At:** [TIMESTAMP]
    **Fix Attempts:** [N]

    **What happened:**
    [Brief description of test execution]

    **Notes:**
    [Observations, errors, or fixes attempted]

    ---
    ```

**CRITICAL: Before finishing, verify you have updated ALL THREE locations:**

1. Task description (metadata below `---` separator) via `TaskUpdate`
2. `notes/test-status.json` (test case entry + summary counts)
3. `notes/test-results.md` (appended human-readable entry)

Missing ANY of these = incomplete iteration.

---

### Step 9: Verify and Continue

After each sub-agent finishes, the orchestrator:

1. Uses `TaskGet` to verify the task description metadata was updated
2. Reads `notes/test-status.json` to confirm JSON was updated and summary counts are correct
3. Reads `notes/test-results.md` to confirm a new entry was appended
4. **If any location was NOT updated**, update it before proceeding
5. Determines the next eligible task (unresolved, dependencies met)
6. Spawns the next sub-agent (back to Step 8)

### Step 10: Repeat Until All Resolved

Continue until ALL tasks have `result: pass` or `result: known_issue`.

```
Completion check:
  - result: pass         → resolved
  - result: known_issue  → resolved
  - result: fail         → needs re-test (if fixAttempts < 3)
  - result: pending      → not yet tested

ALL resolved? → Phase 3 (Summary)
Otherwise?    → Next task
```

---

## Phase 3: Summary

### Step 11: Generate Final Summary

When all tasks are resolved, append a final summary to `notes/test-results.md`:

```markdown
# Final Summary

**Completed:** [TIMESTAMP]
**Total Test Cases:** [N]
**Passed:** [N]
**Known Issues:** [N]

## Results

| TC     | Name   | Priority | Result      | Fix Attempts |
| ------ | ------ | -------- | ----------- | ------------ |
| TC-XXX | [Name] | High     | PASS        | 0            |
| TC-YYY | [Name] | Medium   | KNOWN ISSUE | 3            |

## Known Issues Detail

### KI-001: [TC-ID] — [Issue Title]

**Severity:** [low|medium|high|critical]
**Steps to Reproduce:** [How to see the bug]
**Suggested Fix:** [Potential solution if known]

## Recommendations

[Any follow-up actions needed]
```

---

## Rules Summary

| Rule                    | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| 1:1 Mapping             | One task per test case — no grouping                                         |
| Dependencies            | Use `blocked_by` to enforce test execution order                             |
| Sequential              | One sub-agent at a time — do NOT spawn multiple in parallel                  |
| Sub-Agents              | One sub-agent per task — fresh context, focused execution                    |
| Max 3 Attempts          | After 3 fix attempts → mark as `known_issue`                                 |
| Metadata in Description | Track `fixAttempts`, `result`, `lastTestedAt`, `notes` below `---` separator |
| Test Status JSON        | Always update `notes/test-status.json` after each test                       |
| Log Everything          | Append results to `notes/test-results.md` for human review                   |
| Resumable               | Detect existing run state and continue from where it left off                |
| Completion              | All tasks resolved = all results are `pass` or `known_issue`                 |

## Do NOT

- Spawn multiple sub-agents in parallel — execute ONE at a time
- Leave tasks in `fail` state without either retrying or escalating to `known_issue`
- Modify test plan steps — execute them exactly as written
- Forget to update `notes/test-status.json` after each test
- Forget to append to the test results log after each test
- Skip the dependency analysis
- Use `alert()` or `confirm()` in any fix (see CLAUDE.md)
