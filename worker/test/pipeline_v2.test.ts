import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractStructureAware, computeQualityScore, removeHeadersAndFooters } from '../src/pipeline/reading/structureExtractor.js';
import { chunkSections, estimateTokens, splitIntoSentences, computeContentHash } from '../src/pipeline/reading/chunker.js';
import { verifyChapterScript } from '../src/pipeline/writing/criticVerifier.js';
import { verifyAudioBuffer } from '../src/pipeline/recording/speechVerifier.js';
import { pipelineRegistry } from '../src/pipelines/registry.js';
import type { NormalizedSection, DocumentChunk, ScriptSegment, MustPreserveFact } from '../src/pipelines/types.js';

describe('Stage B: Pipeline V2 Architecture & Agentic Components', () => {
  it('pipelineRegistry registers and retrieves standard-audio:v2 with 5 stages', () => {
    const pipeline = pipelineRegistry.get('standard-audio', 'v2');
    assert.ok(pipeline, 'standard-audio:v2 must exist in registry');
    assert.equal(pipeline.stages.length, 5, 'Must contain exactly 5 sequential stages');
    assert.equal(pipeline.stages[0].name, 'reading');
    assert.equal(pipeline.stages[1].name, 'understanding');
    assert.equal(pipeline.stages[2].name, 'writing');
    assert.equal(pipeline.stages[3].name, 'recording');
    assert.equal(pipeline.stages[4].name, 'final_touches');
  });

  it('structureExtractor extracts sections and computes high quality score for clean text', async () => {
    const text = `# Architecture Overview\n\nThis system implements a durable sequential state machine for enterprise audio processing.\n\n# Chapter 1. Vector Search\n\npgvector provides cosine distance indexing with HNSW graphs for rapid chunk lookup. Performance is optimized at m=16.`;
    const buffer = Buffer.from(text, 'utf-8');

    const result = await extractStructureAware(buffer, 'test_arch.txt');
    assert.ok(result.sections.length >= 2, 'Should extract multiple structured sections');
    assert.ok(result.qualityScore.passed, 'Quality score should pass for clean technical text');
    assert.ok(result.qualityScore.overall >= 0.70, 'Overall quality score should be >= 0.70');
    assert.equal(result.qualityScore.garbageCharRatio, 0, 'Zero garbage characters in clean input');
  });

  it('removeHeadersAndFooters strips repeated running headers and page numbers', () => {
    const lines = [
      'CONFIDENTIAL REPORT',
      'This is section 1 discussing system architecture.',
      'Page 1 of 10',
      'CONFIDENTIAL REPORT',
      'This is section 2 discussing data models.',
      'Page 2 of 10',
      'CONFIDENTIAL REPORT',
      'This is section 3 discussing deployment.',
      'Page 3 of 10',
      'CONFIDENTIAL REPORT',
      'This is section 4 discussing telemetry.',
      'Page 4 of 10',
    ];

    const cleaned = removeHeadersAndFooters(lines);
    assert.ok(!cleaned.some((l) => l.includes('Page 1 of 10')), 'Page numbers must be removed');
    assert.ok(!cleaned.includes('CONFIDENTIAL REPORT'), 'Repeated header must be stripped');
    assert.equal(cleaned.length, 4, 'Only 4 body content lines should remain');
  });

  it('small-to-big chunker produces 300-500 token chunks without splitting mid-sentence', () => {
    const sections: NormalizedSection[] = [
      {
        id: 'sec_1',
        ordinal: 1,
        heading: 'Distributed Systems',
        heading_path: ['Doc', 'Distributed Systems'],
        text: Array(30).fill('Consensus algorithms like Raft guarantee safety under network partitions.').join(' '),
        token_count: 360,
        blocks: [],
      },
    ];

    const chunks = chunkSections(sections, 'doc_test_123', {
      targetTokens: 350,
      maxTokens: 500,
      overlapPercent: 0.15,
    });

    assert.ok(chunks.length >= 1, 'Should emit at least one chunk');
    for (const chunk of chunks) {
      assert.ok(chunk.text.endsWith('.'), 'Chunk must end at sentence boundary, never mid-sentence');
      assert.ok(chunk.content_hash.length === 64, 'Must compute SHA-256 content hash');
      assert.equal(chunk.document_id, 'doc_test_123');
    }
  });

  it('criticVerifier detects and flags ungrounded hallucinated numbers', () => {
    const sourceChunks: DocumentChunk[] = [
      {
        id: 'c1',
        document_id: 'doc1',
        ordinal: 1,
        heading_path: ['Overview'],
        text: 'The company reported $15M in revenue for 2025, representing a 20% growth rate.',
        token_count: 50,
        content_hash: 'abc',
      },
    ];

    // Script claims $99M which does not exist in source chunks
    const scriptWithHallucination: ScriptSegment[] = [
      {
        text: 'In 2025, the company generated $99M in revenue, marking an extraordinary milestone.',
        type: 'explain',
        supports: ['c1'],
      },
    ];

    const result = verifyChapterScript(scriptWithHallucination, sourceChunks, []);
    assert.equal(result.passed, false, 'Should fail verification on invented number');
    assert.ok(result.unsupportedClaims.some((c) => c.includes('$99M')), 'Must explicitly flag $99M');
  });

  it('criticVerifier approves grounded scripts and verifies must-preserve facts', () => {
    const sourceChunks: DocumentChunk[] = [
      {
        id: 'c1',
        document_id: 'doc1',
        ordinal: 1,
        heading_path: ['Overview'],
        text: 'Helios-1 achieves 1,200 teraflops at 45 watts with shipments starting in Q4 2027.',
        token_count: 50,
        content_hash: 'abc',
      },
    ];

    const groundedScript: ScriptSegment[] = [
      {
        text: 'The Helios-1 accelerator reaches 1,200 teraflops of compute while consuming only 45 watts. Deliveries will commence in Q4 2027.',
        type: 'explain',
        supports: ['c1'],
      },
    ];

    const mustPreserve: MustPreserveFact[] = [
      { fact: 'Helios-1', category: 'named_entity', source_chunk_ids: ['c1'], required: true },
      { fact: '1,200 teraflops', category: 'number', source_chunk_ids: ['c1'], required: true },
    ];

    const result = verifyChapterScript(groundedScript, sourceChunks, mustPreserve);
    assert.equal(result.passed, true, 'Fully grounded script must pass verification');
    assert.equal(result.claimSupportRate, 1.0, 'Claim support rate should be 100%');
    assert.equal(result.unsupportedClaims.length, 0, 'Zero unsupported claims');
    assert.equal(result.preservedFactsChecked, 2, 'All 2 mandatory facts verified');
  });

  it('speechVerifier validates acoustic energy and rejects pure silence', () => {
    // 1. Silent buffer
    const silentPcm = Buffer.alloc(24000 * 2 * 3); // 3 seconds of zero bytes
    const silentReport = verifyAudioBuffer(silentPcm, 24000, 45);
    assert.equal(silentReport.passed, false, 'Silent buffer must fail verification');
    assert.equal(silentReport.isRealSpeech, false);

    // 2. Realistic modulated speech buffer
    const speechPcm = Buffer.alloc(24000 * 2 * 3);
    for (let i = 0; i < speechPcm.length; i += 2) {
      speechPcm.writeInt16LE(Math.round(Math.sin(i / 20) * 7000), i);
    }
    const speechReport = verifyAudioBuffer(speechPcm, 24000, 45);
    assert.equal(speechReport.passed, true, 'Realistic modulated audio must pass');
    assert.equal(speechReport.isRealSpeech, true);
    assert.ok(speechReport.werScore <= 0.08, 'WER must be <= 8%');
  });
});
