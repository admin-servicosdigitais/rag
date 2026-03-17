import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  GetKnowledgeBaseCommand,
  type KnowledgeBase,
} from '@aws-sdk/client-bedrock-agent';

export interface Step2CreateKnowledgeBaseInput {
  client: BedrockAgentClient;
  region: string;
  knowledgeBaseName: string;
  knowledgeBaseDescription: string;
  knowledgeBaseRoleArn: string;
  opensearchCollectionArn: string;
  opensearchVectorIndexName: string;
  opensearchVectorField: string;
  opensearchTextField: string;
  opensearchMetadataField: string;
}

export interface Step2CreateKnowledgeBaseOutput {
  knowledgeBaseId: string;
}

export class Step2CreateKnowledgeBase {
  public async execute(input: Step2CreateKnowledgeBaseInput): Promise<Step2CreateKnowledgeBaseOutput> {
    const kbResponse = await input.client.send(
      new CreateKnowledgeBaseCommand({
        name: input.knowledgeBaseName,
        description: input.knowledgeBaseDescription,
        roleArn: input.knowledgeBaseRoleArn,
        knowledgeBaseConfiguration: {
          type: 'VECTOR',
          vectorKnowledgeBaseConfiguration: {
            embeddingModelArn: `arn:aws:bedrock:${input.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          },
        },
        storageConfiguration: {
          type: 'OPENSEARCH_SERVERLESS',
          opensearchServerlessConfiguration: {
            collectionArn: input.opensearchCollectionArn,
            vectorIndexName: input.opensearchVectorIndexName,
            fieldMapping: {
              vectorField: input.opensearchVectorField,
              textField: input.opensearchTextField,
              metadataField: input.opensearchMetadataField,
            },
          },
        },
      }),
    );

    const knowledgeBaseId = kbResponse.knowledgeBase?.knowledgeBaseId;
    if (!knowledgeBaseId) {
      throw new Error('Não foi possível obter knowledgeBaseId após CreateKnowledgeBase.');
    }

    await this._waitForKnowledgeBaseReady(input.client, knowledgeBaseId);
    return { knowledgeBaseId };
  }

  private async _waitForKnowledgeBaseReady(client: BedrockAgentClient, knowledgeBaseId: string): Promise<KnowledgeBase> {
    while (true) {
      const response = await client.send(new GetKnowledgeBaseCommand({ knowledgeBaseId }));
      const kb = response.knowledgeBase;
      if (!kb) {
        throw new Error('Knowledge base não encontrada durante o polling.');
      }

      const status = kb.status;
      console.log(`KB status: ${status}`);

      if (status === 'ACTIVE') {
        return kb;
      }

      if (status === 'FAILED') {
        throw new Error(`Falha ao criar KB: ${kb.failureReasons?.join('; ') ?? 'motivo desconhecido'}`);
      }

      await this._sleep(5000);
    }
  }

  private async _sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
