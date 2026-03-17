import {
  BedrockAgentClient,
  GetIngestionJobCommand,
  StartIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';

export interface Step4StartIngestionInput {
  client: BedrockAgentClient;
  knowledgeBaseId: string;
  dataSourceId: string;
}

export interface Step4StartIngestionOutput {
  ingestionJobId: string;
}

export class Step4StartIngestion {
  public async execute(input: Step4StartIngestionInput): Promise<Step4StartIngestionOutput> {
    const startIngestionResponse = await input.client.send(
      new StartIngestionJobCommand({
        knowledgeBaseId: input.knowledgeBaseId,
        dataSourceId: input.dataSourceId,
      }),
    );

    const ingestionJobId = startIngestionResponse.ingestionJob?.ingestionJobId;
    if (!ingestionJobId) {
      throw new Error('Não foi possível obter ingestionJobId após StartIngestionJob.');
    }

    await this._waitForIngestion(input.client, input.knowledgeBaseId, input.dataSourceId, ingestionJobId);
    return { ingestionJobId };
  }

  private async _waitForIngestion(
    client: BedrockAgentClient,
    knowledgeBaseId: string,
    dataSourceId: string,
    ingestionJobId: string,
  ): Promise<void> {
    while (true) {
      const response = await client.send(
        new GetIngestionJobCommand({
          knowledgeBaseId,
          dataSourceId,
          ingestionJobId,
        }),
      );

      const status = response.ingestionJob?.status;
      console.log(`Ingestion status: ${status}`);

      if (status === 'COMPLETE') {
        return;
      }

      if (status === 'FAILED' || status === 'STOPPED') {
        throw new Error(`Ingestion falhou/parou: ${response.ingestionJob?.failureReasons?.join('; ') ?? 'motivo desconhecido'}`);
      }

      await this._sleep(5000);
    }
  }

  private async _sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
