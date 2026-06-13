Specs is approved, test plan is ready. Now we need an implementation plan.

- **Specs**: `@docs/PRD.md`
- **Test Plan:** `@docs/test_plan.md`

## Your Task

Create a detailed implementation plan that maps to the test cases.
If an implementation plan already exists, you need to edit it by adding all the new features or by updating all the existing features that have been modified with the new release.
Double check the existing features to confirm their need.

### Step 1: Analyze Test Cases

For each test case (TC-NNN):

- What functionality must exist?
- What files need to be created/modified?
- What dependencies are needed?

### Step 2: Create Task Breakdown

Group test cases into implementation tasks:

```markdown
## Implementation Plan: [PHRASE_NAME]

### Overview

[Brief description]

### Files to Create/Modify

[List all files]

### Implementation Tasks

#### Task 1: [Name]

**Mapped Test Cases:** TC-001, TC-002, TC-003
**Files:**

- `path/to/file1.php` - [description]
- `path/to/file2.js` - [description]

**Implementation Notes:**

- [Key detail 1]
- [Key detail 2]

**Acceptance Criteria:**

- [ ] TC-001 passes
- [ ] TC-002 passes
- [ ] TC-003 passes

#### Task 2: [Name]

...
```

### Step 3: Identify Dependencies

- What from previous phrases is needed?
- What order should tasks be implemented?
- Any external dependencies?

### Step 4: Estimate Complexity

- Simple: 1-2 tasks, straightforward
- Medium: 3-5 tasks, some complexity
- Complex: 6+ tasks, significant work

## Output

Save the implementation plan to: `@docs/impl_plan.md`

Include:

1. Overview
2. Files to create/modify
3. Tasks with TC mappings
4. Dependencies
5. Complexity estimate

## Guidelines

- Every test case must map to a task
- Tasks should be completable in one session
- Include enough detail to guide implementation
- Reference design system patterns

## Do NOT

- Include actual code (next step)
- Over-engineer simple features
