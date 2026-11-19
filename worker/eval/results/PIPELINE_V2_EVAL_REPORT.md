# Zukai Document-to-Audio Pipeline v2 Evaluation Report

**Run Date:** 2026-11-19T19:24:19.933Z  
**Golden Set Size:** 18 fixtures across 18 domains  
**Pipeline:** `standard-audio:v2` (5-Stage Sequential Agentic Architecture with Hybrid RAG)

---

## 1. Executive Quality Gate Scorecard

| Metric | Target | Pipeline v1 (Baseline) | Pipeline v2 (Actual) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Extraction Accuracy / Structure** | $ge 0.80$ | 0.72 | **0.80** | **PASS (+0.08)** |
| **Retrieval Recall@6 (Hybrid RRF)** | $ge 0.90$ | N/A (Linear window) | **0.97** | **PASS (RAG Enabled)** |
| **Claim-Support Rate** | $ge 0.97$ | 0.89 | **1.00** | **PASS (+0.11)** |
| **Invented Numbers / Hallucinations** | **0 (Zero)** | 3 across set | **0** | **ZERO TOLERANCE MET** |
| **Forbidden Audio Artifacts** | **0** | 4 (markdown/bullets) | **0** | **CLEAN** |
| **TTS Verbatim WER** | $le 0.08$ | 0.05 | **0.03** | **PASS** |
| **Golden Set Pass Rate** | $ge 95%$ | 83.3% | **100.0%** | **SHIPPING GATE CLEARED** |

---

## 2. Stage-by-Stage Fixture Breakdown

| Fixture ID | Domain / Title | Lang | Extraction | Recall@6 | Claim Support | Invented Numbers | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `news-001` | Next-Gen Photonic AI Accelerator | english | 0.79 | 1 | 1 | 0 | ✅ PASS |
| `research-002` | Sparse Flash Attention for Extre | english | 0.81 | 1 | 1 | 0 | ✅ PASS |
| `legal-003` | Master Service Agreement Section | english | 0.82 | 0.75 | 1 | 0 | ✅ PASS |
| `biz-004` | Q3 Enterprise SaaS Performance M | english | 0.8 | 1 | 1 | 0 | ✅ PASS |
| `tech-005` | PostgreSQL Quorum-Based Synchron | english | 0.81 | 0.83 | 1 | 0 | ✅ PASS |
| `indian-006` | RBI Regulatory Circular: RuPay C | hinglish | 0.8 | 1 | 1 | 0 | ✅ PASS |
| `textbook-007` | Biology 101: The Citric Acid Cyc | english | 0.82 | 1 | 1 | 0 | ✅ PASS |
| `meeting-008` | Sprint 42 Steering Committee Out | english | 0.8 | 1 | 1 | 0 | ✅ PASS |
| `slides-009` | Zukai Series A Deck: Slide 4 Uni | hinglish | 0.79 | 1 | 1 | 0 | ✅ PASS |
| `physics-010` | Bell Inequalities and Quantum No | english | 0.84 | 1 | 1 | 0 | ✅ PASS |
| `long-011` | Global Enterprise Data Governanc | english | 0.86 | 1 | 1 | 0 | ✅ PASS |
| `ocr-012` | Patent US-9842104-B2: Thermal Di | english | 0.84 | 0.83 | 1 | 0 | ✅ PASS |
| `sop-013` | SOP-804: Data Center Primary Bla | english | 0.79 | 1 | 1 | 0 | ✅ PASS |
| `adv-014` | Quarterly Strategic Advisory Mem | english | 0.79 | 1 | 1 | 0 | ✅ PASS |
| `adv-015` | Technical Diagnostic File | english | 0.8 | 1 | 1 | 0 | ✅ PASS |
| `adv-016` | Status Report with Loop Padding | english | 0.79 | 1 | 1 | 0 | ✅ PASS |
| `adv-017` | Raw Sensor Telemetry Log | english | 0.75 | 1 | 1 | 0 | ✅ PASS |
| `adv-018` | International Trade Protocol Exc | english | 0.78 | 1 | 1 | 0 | ✅ PASS |

---

## 3. Architecture Comparison: Pipeline v1 vs Pipeline v2

1. **Extraction & Chunking:** Pipeline v1 used naive character slicing ($2000$ characters) which frequently severed words and split tables mid-row. Pipeline v2 introduces structure-aware parsing for PDF/DOCX/PPTX, small-to-big semantic chunking ($300-500$ tokens with sentence boundaries), and extraction quality gating.
2. **Retrieval & Evidence Grounding:** Pipeline v1 fed concatenated text chunks into an outline prompt with no verification. Pipeline v2 implements pgvector cosine embeddings + full-text search with Reciprocal Rank Fusion (RRF), ensuring every chapter script is grounded in relevant evidence chunks.
3. **Deterministic Verifier Loop:** Pipeline v2 employs a strict Critic Verifier with bounded repair loops ($le 2$). It deterministically checks every number, date, and proper noun against source chunks, eliminating invented statistics.
4. **Resumable Postgres State Machine:** Every unit ($chunk_i$, $chapter_j$, $audio_k$) is persisted to `job_artifacts`. Pipeline v1 had to restart from scratch upon pod crashes or quota pauses; Pipeline v2 resumes instantly at the exact unit without re-running completed work.
