import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

export interface Step8InvokeAgentInput {
  runtimeClient: BedrockAgentRuntimeClient;
  agentId: string;
  agentAliasId: string;
  question: string;
}

export interface Step8InvokeAgentOutput {
  answer: string;
}

export class Step8InvokeAgent {
  public async execute(input: Step8InvokeAgentInput): Promise<Step8InvokeAgentOutput> {
    const invokeResponse = await input.runtimeClient.send(
      new InvokeAgentCommand({
        agentId: input.agentId,
        agentAliasId: input.agentAliasId,
        sessionId: `session-${Date.now()}`,
        inputText: input.question,
        enableTrace: true,
      }),
    );

    const chunks: Uint8Array[] = [];
    if (invokeResponse.completion) {
      for await (const event of invokeResponse.completion) {
        if (event.chunk?.bytes) {
          chunks.push(event.chunk.bytes);
        }
      }
    }

    return { answer: this._decodeChunks(chunks) };
  }

  private _decodeChunks(chunks: Uint8Array[]): string {
    const decoder = new TextDecoder('utf-8');
    return chunks.map((chunk) => decoder.decode(chunk)).join('');
  }
}
