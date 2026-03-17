import {
  BedrockAgentClient,
  CreateDataSourceCommand,
  GetDataSourceCommand,
  type DataSource,
} from '@aws-sdk/client-bedrock-agent';

export interface Step3CreateDataSourceInput {
  client: BedrockAgentClient;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  s3BucketArn: string;
  s3Prefix: string;
}

export interface Step3CreateDataSourceOutput {
  dataSourceId: string;
}

export class Step3CreateDataSource {
  public async execute(input: Step3CreateDataSourceInput): Promise<Step3CreateDataSourceOutput> {
    const dataSourceResponse = await input.client.send(
      new CreateDataSourceCommand({
        knowledgeBaseId: input.knowledgeBaseId,
        name: `${input.knowledgeBaseName}-s3-source`,
        dataSourceConfiguration: {
          type: 'S3',
          s3Configuration: {
            bucketArn: input.s3BucketArn,
            inclusionPrefixes: [input.s3Prefix],
          },
        },
        vectorIngestionConfiguration: {
          chunkingConfiguration: {
            chunkingStrategy: 'FIXED_SIZE',
            fixedSizeChunkingConfiguration: {
              maxTokens: 300,
              overlapPercentage: 10,
            },
          },
        },
      }),
    );

    const dataSourceId = dataSourceResponse.dataSource?.dataSourceId;
    if (!dataSourceId) {
      throw new Error('Não foi possível obter dataSourceId após CreateDataSource.');
    }

    await this._waitForDataSourceReady(input.client, input.knowledgeBaseId, dataSourceId);
    return { dataSourceId };
  }

  private async _waitForDataSourceReady(
    client: BedrockAgentClient,
    knowledgeBaseId: string,
    dataSourceId: string,
  ): Promise<DataSource> {
    while (true) {
      const response = await client.send(new GetDataSourceCommand({ knowledgeBaseId, dataSourceId }));
      const ds = response.dataSource;
      if (!ds) {
        throw new Error('Data source não encontrada durante o polling.');
      }

      const status = ds.status;
      console.log(`Data source status: ${status}`);

      if (status === 'AVAILABLE') {
        return ds;
      }

      if (status === 'DELETE_UNSUCCESSFUL') {
        throw new Error('Data source está em estado inválido (DELETE_UNSUCCESSFUL).');
      }

      await this._sleep(5000);
    }
  }

  private async _sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
