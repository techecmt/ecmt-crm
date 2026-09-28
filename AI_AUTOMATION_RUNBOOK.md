# AI CRM Automation Runbook

This runbook explains how to configure and operate AI CRM automation for Twilio WhatsApp in ECMT CRM.

## 1) Prerequisites

- Apply the latest database migration files, including:
  - `20260928000100_add_ai_crm_automation_controls.sql`
- Ensure Message Centre environment variables are set in deployment.
- Confirm each Twilio sender is mapped to the correct agent in **Message Centre Settings**.

## 2) Per-Agent Setup (Per College / Channel)

1. Open **Message Centre Settings**.
2. Select the agent workspace for the college/channel.
3. In **CRM Automation (Twilio WhatsApp)** configure:
   - **Enable CRM Automation**
   - **Explicit fields auto-apply** (recommended: `name`, `email`, `phone`, `course`)
   - **Low-risk inferred fields** (recommended: `city`, `course`)
   - **Inference confidence threshold** (recommended: `0.75`)
   - **Auto-create/reschedule follow-ups**
   - **Send outbound WhatsApp acknowledgements** (optional)
   - **Outbound policy** (`session_only` recommended)
   - **Require approval for status changes** (enabled recommended)
4. Save settings.

## 3) Business Hours and 24/7 Behavior

- Agent can be active 24/7 while respecting configured business hours.
- Outside business hours:
  - AI does not continue autonomous handling.
  - Conversation is handed to human mode using existing behavior.

## 4) CRM Field Write Policy

## Explicit Data
- Explicitly provided values (for enabled fields) are auto-applied.
- Every applied/ignored/conflict action is written to `ai_action_audit_logs`.

## Inferred Data
- Inferred fields apply only when:
  - field is in **Low-risk inferred fields**
  - confidence is greater than or equal to threshold

## Conflict Handling
- Existing non-empty values are never overwritten silently.
- Conflicts are logged and a lead timeline entry is created.

## 5) Status Change Workflow

- AI never auto-applies status transitions when **Require approval** is enabled.
- AI creates a pending request in `ai_status_change_requests`.
- Admin roles review and approve/reject from conversation context.
- Approval applies workflow-safe status transitions and follow-up side effects.

## 6) Follow-Up Automation

- AI can create or reschedule pending follow-ups for the conversation/lead owner:
  - prefers `conversation.assigned_user_id`
  - falls back to `lead.assigned_counsellor`
- Timeline and audit entries are always written.

## 7) Escalation and Resume Policy

- If escalation is triggered:
  - conversation mode is switched to `human`
  - autonomous outbound actions stop
- AI resumes only when staff manually switches mode back to `agent`.

## 8) Approval Queue Operations

- Review pending requests in the conversation detail panel.
- Approve:
  - applies status transition if valid by pipeline rules
  - writes lead activity and AI audit entries
- Reject:
  - keeps current status
  - records reviewer reason in request row and audit trail

## 9) Audit Verification Checklist

For each automation event, verify:

1. `ai_action_audit_logs` contains action rows for apply/skip/conflict/queue.
2. `lead_activities` includes visible timeline entries.
3. `user_audit_events` receives `crm_entry` for applied lead field updates.
4. `ai_status_change_requests` captures status proposals and review outcomes.

## 10) Recommended Baseline Policy

- Explicit fields: `name,email,phone,course`
- Inferred fields: `city,course`
- Inference threshold: `0.75`
- Follow-up automation: enabled
- Outbound acknowledgements: disabled initially, then enable by agent after review
- Status approval: enabled
