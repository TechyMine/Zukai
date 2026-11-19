import { ReadingStage } from '../pipeline/reading/readingStage.js';
import { UnderstandingStage } from '../pipeline/understanding/understandingStage.js';
import { WritingStage } from '../pipeline/writing/writingStage.js';
import { RecordingStage } from '../pipeline/recording/recordingStage.js';
import { FinalTouchesStage } from '../pipeline/finalTouches/finalTouchesStage.js';
import type { IStage } from './types.js';

export interface PipelineDefinition {
  name: string;
  version: string;
  description: string;
  stages: Array<IStage<any, any>>;
}

export const StandardAudioPipelineV2: PipelineDefinition = {
  name: 'standard-audio',
  version: 'v2',
  description: '5-Stage Sequential Agentic Document-to-Audio Pipeline with Hybrid RAG',
  stages: [
    new ReadingStage(),
    new UnderstandingStage(),
    new WritingStage(),
    new RecordingStage(),
    new FinalTouchesStage(),
  ],
};
