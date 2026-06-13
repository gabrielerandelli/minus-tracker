Read the `@docs/PRD.md` and ensure to get a very detailed understanding of at least the following aspects:
- functional requirements (features)
- non-functional requirements (constraints and other specs)
- auth mechanism
- adopted tech stack for frontend and backend with selected DB
- testing and validation methodology
- versioning and deployment process

If something is not clear, ask for clarifications.

Second, analyze the codebase and tell me what could be the potential problems in implementing these specs. Be aware: it's perfectly normal that the current codebase does not contain any implementation of these specs yet. The goal here is to prevent potential implementation issues, not to check whether they're already available.

Let's look at the written specs from different angles and try to consider every edge cases.

Use ASCII diagrams to illustrate if needed. Don't edit anything yet. Let's focus on analysis.

After listing out all the potential problems/issues, use the AskUserQuestion tool to ask me pick which ones I want to fix. Note that I may skip some of the problems if I think they are not important or I want to fix them later. So make sure to ask me to pick the ones I want to fix and not just ask me if I want to fix all of them.

Once I pick the problems I want to fix, we can then move on to the next step of asking clarifying questions until you are 95% confident that all the problems can be fixed successfully. Once you are confident, you can then proceed to update the `@docs/PRD.md` to address the problems we identified. Remember: Don't apply the fixes yet. The goal of this step is to analyze the specs and identify potential problems, update the specs to address those problems, don't apply the fixes yet.

Do not create any implementation plan or anything like this, we're just reviewing the specs, not drafting any plan.
