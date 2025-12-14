# REALRICHES CROSS-CHAT CONTINUITY PROMPT

**Version**: 1.0.0
**Last Updated**: 2025-12-14
**Purpose**: Paste this prompt at the start of every new chat to ensure exact continuation from where the previous chat ended.

---

## INSTRUCTIONS FOR USE

1. At the END of every chat session, Claude generates a `SESSION_END_STATE` block
2. Copy that entire block and save it externally (Notes app, text file, etc.)
3. At the START of every new chat, paste this entire prompt followed by the saved `SESSION_END_STATE`
4. Upload the current zip file of the codebase
5. Claude will continue from the exact reference point

---

## PROMPT TO PASTE AT START OF NEW CHAT

```
You are continuing development of RealRiches, a comprehensive NYC rental platform. This is a continuation from a previous chat session.

CRITICAL RULES:
1. The uploaded zip file is the ONLY source of truth for code state
2. Ignore conversation history claims about what was built - only trust files in the zip
3. The SESSION_END_STATE below defines exactly where to continue
4. Do not rebuild files that exist in the zip unless explicitly requested
5. Do not ask clarifying questions - execute from the reference point

FIRST ACTIONS (MANDATORY):
1. Extract the uploaded zip to /home/claude/realriches
2. Run: find . -type f \( -name "*.ts" -o -name "*.prisma" \) | wc -l
3. Run: wc -l $(find . -type f -name "*.ts" -o -name "*.prisma") | tail -1
4. Compare against SESSION_END_STATE.files_count and SESSION_END_STATE.total_lines
5. If mismatch, STOP and report discrepancy
6. If match, proceed with SESSION_END_STATE.next_task

SESSION_END_STATE:
[PASTE THE SESSION_END_STATE FROM PREVIOUS CHAT HERE]

AFTER VERIFICATION, CONTINUE IMMEDIATELY WITH THE NEXT TASK. DO NOT SUMMARIZE OR ASK QUESTIONS.
```

---

## SESSION_END_STATE TEMPLATE

Claude must generate this exact structure at the end of every chat session:

```yaml
SESSION_END_STATE:
  timestamp: "2025-12-14T03:30:00Z"
  session_id: "unique-session-identifier"
  
  # Codebase metrics (for verification)
  codebase:
    files_count: 16
    total_lines: 2389
    last_file_modified: "apps/api/src/modules/users/users.repository.ts"
    git_status: "4 commits, clean working tree"
  
  # Exact reference point
  current_task:
    module: "Users"
    file: "users.service.ts"
    status: "in_progress"
    line_stopped_at: 45
    function_in_progress: "updateProfile"
    percent_complete: 15
  
  # What to do next (be extremely specific)
  next_task:
    action: "Complete users.service.ts starting from updateProfile method"
    then: "Create users.schemas.ts with Zod validation"
    then: "Create users.routes.ts with REST endpoints"
    priority_order:
      1: "users.service.ts"
      2: "users.schemas.ts"
      3: "users.routes.ts"
      4: "listings.repository.ts"
      5: "listings.service.ts"
  
  # Business context (non-code state)
  research_tasks:
    completed:
      - "Long Island market research (682 sources)"
      - "Cost optimization research"
    pending:
      - "Apply Long Island findings to platform"
  
  # Files that MUST exist in zip (verification checklist)
  required_files:
    - "apps/api/prisma/schema.prisma"
    - "apps/api/src/config/env.ts"
    - "apps/api/src/lib/errors.ts"
    - "apps/api/src/lib/result.ts"
    - "apps/api/src/lib/logger.ts"
    - "apps/api/src/lib/database.ts"
    - "apps/api/src/lib/cache.ts"
    - "apps/api/src/modules/auth/jwt.service.ts"
    - "apps/api/src/modules/auth/password.service.ts"
    - "apps/api/src/modules/auth/auth.service.ts"
    - "apps/api/src/modules/auth/auth.middleware.ts"
    - "apps/api/src/modules/auth/auth.schemas.ts"
    - "apps/api/src/modules/auth/auth.routes.ts"
    - "apps/api/src/server.ts"
    - "apps/api/src/index.ts"
  
  # Modules completion status
  modules:
    auth: 100%
    users: 25%
    listings: 0%
    applications: 0%
    leases: 0%
    payments: 0%
    feedback: 0%
    integrations: 0%
    jobs: 0%
  
  # Blockers or decisions pending
  blockers: []
  pending_decisions: []
  
  # Notes for next session
  notes: |
    - Long Island research complete, ready to apply
    - Users module in progress
    - All external integrations feature-flagged
```

---

## END-OF-SESSION PROTOCOL

Before ending ANY chat, Claude MUST:

1. **Generate SESSION_END_STATE** with exact values filled in
2. **Create updated zip file** at `/mnt/user-data/outputs/realriches-v{VERSION}.zip`
3. **Verify zip contents** by listing files and line counts
4. **Instruct user**: "Save the SESSION_END_STATE above and download the zip file. Paste both at the start of your next chat."

---

## FAILURE MODES AND MITIGATIONS

| Failure Mode | Mitigation |
|--------------|------------|
| Zip not uploaded | STOP. Request zip upload before proceeding |
| Zip contents don't match SESSION