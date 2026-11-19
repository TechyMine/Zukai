# Zukai Operations & Incident Runbook (v2)

**Document Version:** 2.0.0  
**Scope:** Diagnostic Procedures, Job Replays, Queue Recovery, Key Rotation, and Emergency Rollbacks.

---

## 1. Diagnosing a Failed Job

When an alert fires or a user reports a failure with their 8-character reference (e.g. `Ref: A306624C`), use `job:inspect` to retrieve the complete audit timeline:

```bash
cd worker
npm run job:inspect -- <job_id>
```

### Key Output Sections to Check:
1. **Status & Error Code:** Check `error_code` (e.g. `SCANNED_NO_TEXT`, `AI_UNAVAILABLE`, `CONFIG_ERROR`).
2. **Failed Stage:** Identifies exactly which of the 5 stages failed (`reading`, `understanding`, `writing`, `recording`, `final_touches`).
3. **Timeline Events:** Displays each event chronologically with duration, model ID, tokens consumed, and sanitized error payloads.
4. **Persisted Artifacts:** Verifies which stages completed and produced cached artifacts (`reading_report`, `document_brief`, `chapter_script_1`, etc.).

---

## 2. Replaying a Job from a Specific Stage

If a job failed at a later stage (e.g., TTS rate-limit during `recording`), you do not need to re-extract or re-script the document. Use `job:replay` to resume from the exact failed stage using persisted artifacts:

```bash
cd worker
# Resume from Recording stage (re-uses existing Reading, Brief, and Chapter Scripts)
npm run job:replay -- <job_id> --from=recording

# Or resume from Writing stage
npm run job:replay -- <job_id> --from=writing
```

Valid values for `--from`: `reading`, `understanding`, `writing`, `recording`, `final_touches`.

---

## 3. Mass Recovery of Stalled or Failed Jobs

### Recovering from `CONFIG_ERROR`:
If a deployment caused a temporary configuration issue:
```bash
cd worker
# Dry-run first to inspect candidate jobs:
npm run jobs:requeue -- --error-code=CONFIG_ERROR --dry-run

# Execute safe requeue:
npm run jobs:requeue -- --error-code=CONFIG_ERROR --execute
```

This ensures:
- Only jobs in `failed` state are targeted.
- Quota is not debited twice.
- Attempt count is preserved.

---

## 4. Zero-Downtime Secret & Key Rotation

### 1. Rotating Gemini API Key (`GEMINI_API_KEY`)
1. Generate a new API key in Google AI Studio.
2. Update the environment secret in your container hosting platform (Railway / Fly / Google Cloud Run):
   ```bash
   # Example for Railway:
   railway variables --set GEMINI_API_KEY="new_gemini_key_here"
   ```
3. The platform executes a rolling update. The old container continues draining in-flight jobs; new container validates the new key during `/readyz` pre-flight before traffic switches.

### 2. Rotating Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)
1. In Supabase Dashboard $\rightarrow$ Settings $\rightarrow$ API $\rightarrow$ JWT Secret, generate a secondary key or set new service secret.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in worker environment variables.
3. Deploy new worker revision. Check that `/readyz` responds `200 OK`.

---

## 5. Rollback Procedure

If a regression is detected in Pipeline V2:

### Immediate Mitigation (Feature Flag)
Set `PIPELINE_V2=false` in the worker environment variables without rebuilding the Docker image:
```bash
# On hosting platform:
railway variables --set PIPELINE_V2="false"
```
The worker automatically diverts all new incoming jobs to the legacy pipeline while in-flight jobs finish cleanly.

### Full Image Rollback
1. Identify the last known good commit SHA (e.g. `33c7839`).
2. Redeploy the previous container tag:
   ```bash
   docker pull your-registry/zukai-worker:33c7839
   # or trigger rollback in hosting dashboard
   ```
3. Verify `/healthz` returns `buildSha: 33c7839` and `/readyz` is `200 OK`.
