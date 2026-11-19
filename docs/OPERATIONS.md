# Zukai Production Operations & Enterprise Reliability Guide (v2)

**Document Version:** 2.0.0  
**Status:** Active Operations Manual  
**Scope:** 5-Stage Sequential Agentic Architecture, Multi-Tenant Scheduling, Alerts, Capacity Planning, and Database Optimization.

---

## 1. High-Priority Operational Alerts & SLOs

| Alert Name | Metric & Condition | Severity | Action & Escalation Path |
| :--- | :--- | :--- | :--- |
| `QueueDepthSpike` | Queue depth $> 30$ jobs for $> 5$ min | High | Scale out worker container replicas (HPA target: queue depth). |
| `OldestJobStalled` | Oldest queued job age $> 10$ min | High | Inspect worker health (`/readyz`) and database connection pool. |
| `ConfigErrorAlert` | Any `CONFIG_ERROR` logged in `job_events` | Critical (Page) | Immediate on-call alert. Check environment variables, credentials, and binary dependencies. Run `npm run jobs:requeue -- --error-code=CONFIG_ERROR` once fixed. |
| `HighFailureRate` | Job failure rate $> 3\%$ over rolling 15 min | Critical | Run `npm run job:inspect` on failing jobs; check Gemini status dashboard and upstream rate limits. |
| `P95LatencyExceeded` | Total job duration $> 180$ seconds for $> 10$ jobs | Medium | Review stage durations in `job_events`. Determine if bottleneck is LLM latency, embedding calls, or ffmpeg assembly. |
| `CapacityWaitSaturation`| $> 5$ jobs in `waiting_for_capacity` | Medium | Worker auto-resumes after 60s cooldown. If persistent, consider upgrading Gemini tier or enabling additional fallback models. |
| `CostSpikePerMinute` | Audio cost $> \$0.08$ per spoken minute | Warning | Audit tokens used in `job_events` to detect excessive prompt repairs or adversarial input looping. |

---

## 2. Multi-Tenant Fairness & Scheduling

1. **Per-User and Per-Organization Caps:**
   - Free Tier: Max 1 concurrent active job.
   - Pro Tier: Max 3 concurrent active jobs.
   - Team / Org Tier: Max 10 concurrent active jobs per org.
2. **Fair Queue Scheduling:**
   - Jobs are claimed from `pgmq` using plan-weighted priority: Enterprise / Team jobs have queue visibility priority over Free jobs during congestion.
3. **Abuse Mitigation & Input Limits:**
   - File size limits: 10 MB (Free), 50 MB (Pro), 100 MB (Team).
   - Page count caps: 20 pages (Free), 150 pages (Pro).
   - Enforced immediately in Stage 1 Reading before any LLM tokens or embeddings are consumed.

---

## 3. Database Scaling & Connection Pooling

### Connection Management (Supavisor)
- All worker instances connect to Supabase via Supavisor in **Transaction Mode** (port 6543) for high-frequency short-lived queries, and **Session Mode** (port 5432) for long-lived real-time subscriptions.
- Max worker pool per container: 10 connections.
- Recommended Supabase pool size: $80$ connections reserved for workers, $20$ for API/PostgREST.

### pgvector Indexing & Performance
- Index type: **HNSW (Hierarchical Navigable Small World)** on `document_chunks.embedding vector(768)` using cosine distance (`vector_cosine_ops`).
- Parameters:
  - `m = 16` (max number of bi-directional links per node; optimal memory/recall trade-off).
  - `ef_construction = 64` (search depth during index construction).
- Hybrid search queries utilize `EXPLAIN (ANALYZE, BUFFERS)` checks to guarantee index scan on `idx_document_chunks_embedding` and GIN scan on `idx_document_chunks_tsv`.

### Retention & Purge Lifecycle
- **Soft-Deleted Documents:** When a document is soft-deleted (`deleted_at is not null`), it is excluded from all user searches.
- **Hard Purge Automation:** A daily cron runs `DELETE FROM documents WHERE deleted_at < now() - interval '30 days'`. All associated rows in `document_sections`, `document_chunks`, `job_artifacts`, and `job_events` are automatically pruned via PostgreSQL `ON DELETE CASCADE`.

---

## 4. Capacity Plan & Infrastructure Sizing

### Cost per Audio Minute
- **LLM Scripting (Gemini 2.5 / 3.5 Flash):** ~750 tokens in, ~180 tokens out per spoken minute $\approx \$0.00015$ / min.
- **Embeddings (text-embedding-004):** ~400 tokens per chunk $\approx \$0.00001$ / min.
- **Speech Synthesis (Gemini Neural TTS):** Direct neural audio stream $\approx \$0.004$ / min.
- **Total AI Processing Cost:** $\approx \$0.005$ to $\$0.008$ per finished audio minute.

### Recommended Production Deployment Topology
- **Minimum Worker Instances:** 2 replicas (multi-AZ) for high availability.
- **CPU / Memory per Replica:**
  - CPU: 2 vCPU (accommodates concurrent ffmpeg CBR MP3 encoding and loudnorm passes).
  - RAM: 2 GB (supports large document PDF rasterization and audio buffer assembly).
- **Auto-Scaling Policy:** Scale out when queue depth $> 10$ or CPU utilization $> 70\%$. Max replicas: 10.
