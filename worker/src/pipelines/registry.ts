import type { PipelineDefinition } from './standard-audio.v2.js';
import { StandardAudioPipelineV2 } from './standard-audio.v2.js';

class PipelineRegistry {
  private pipelines = new Map<string, PipelineDefinition>();

  constructor() {
    this.register(StandardAudioPipelineV2);
  }

  public register(pipeline: PipelineDefinition): void {
    const key = this.getKey(pipeline.name, pipeline.version);
    this.pipelines.set(key, pipeline);
  }

  public get(name: string, version: string = 'v2'): PipelineDefinition | undefined {
    return this.pipelines.get(this.getKey(name, version));
  }

  public getAll(): PipelineDefinition[] {
    return Array.from(this.pipelines.values());
  }

  private getKey(name: string, version: string): string {
    return `${name.toLowerCase()}:${version.toLowerCase()}`;
  }
}

export const pipelineRegistry = new PipelineRegistry();
