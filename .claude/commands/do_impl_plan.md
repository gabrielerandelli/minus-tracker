We are executing the implementation plan. All design and planning is complete.

## Reference Documents

- **Implementation Plan:** `@docs/impl_plan.md`
- **Test Plan:** `@docs/test_plan.md`
- **Specs:** `@docs/PRD.md`

## Phase 1: Task Creation

### Before Creating Tasks

1. Review `@docs/impl_plan.md` completely
2. Understand test case expectations from `@docs/test_plan.md`
3. Reference wireframe/prototype for UI (if applicable)
4. Check design system for patterns (if available)

### Create Tasks from Implementation Plan

Parse the implementation plan and use `TaskCreate` to create a task for each implementation item:

1. **Extract all tasks** from `@docs/impl_plan.md`
2. **Identify dependencies** between tasks (what must be done before what)
3. **Identify already implemented tasks**, part of Olos v0.3.0, which we don't need to re-implement
4. **Create each task** only for those not implemented tasks with:
    - Clear description including the specific files to create/modify
    - Mapped test cases (TCs) that verify the task
    - `blocked_by`: tasks that must complete first
    - `blocks`: tasks that depend on this one

Tasks should be granular enough to run independently but logical enough to represent complete units of work.

---

## Phase 2: Task Execution

### Execution Strategy

Execute tasks using sub-agents for parallel processing:

1. **Group tasks into waves** based on dependencies
2. **Run each task in its own sub-agent** - This keeps context usage low (~18% vs ~56%)
3. **Process waves sequentially** - Wave N+1 starts only after Wave N completes

### For Each Task (Sub-Agent Instructions)

1. Use `TaskGet` to read full task details
2. Create/modify specified files
3. Implement functionality to pass mapped TCs
4. **Self-verify the implementation:**
    - Check that code compiles/runs without errors
    - Verify the functionality matches test expectations
    - Ensure design consistency with existing patterns
5. Use `TaskUpdate` to mark task complete with a brief summary of what was done
6. Note any deviations, concerns, or discovered issues

### If Issues Are Discovered

- Use `TaskCreate` to add new fix/bug tasks
- Set appropriate dependencies so fixes run in correct order
- Continue with other independent tasks

---

## Phase 3: Completion Summary

After all tasks are complete, provide:

### 1. Summary of Changes

- Files created
- Files modified
- Key functionality added

### 2. Self-Verification Results

- What works as expected
- Any concerns or edge cases noted
- Tasks that required fixes (if any)

### 3. Ready for Testing

- Confirm all tasks marked complete
- List any setup needed for testing
- Note any known limitations

---

## Important Notes

- **Do NOT run full test suite** - that's the next step
- **Use `TaskList`** periodically to check overall progress
- **Dependencies are critical** - ensure tasks don't start before their blockers complete
- **Keep sub-agent context focused** - each sub-agent only needs info for its specific task
