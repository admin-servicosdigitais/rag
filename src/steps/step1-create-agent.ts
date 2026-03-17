import {
  BedrockAgentClient,
  CreateAgentCommand,
  ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock-agent';

export interface Step1CreateAgentInput {
  client: BedrockAgentClient;
  modelId: string;
  agentName: string;
  instruction: string;
  agentRoleArn: string;
}

export interface Step1CreateAgentOutput {
  agentId: string;
}

export class Step1CreateAgent {
  public async execute(input: Step1CreateAgentInput): Promise<Step1CreateAgentOutput> {
    await this._sanityCheckModel(input.client, input.modelId);

    const createAgentResponse = await input.client.send(
      new CreateAgentCommand({
        agentName: input.agentName,
        description: 'Agente RAG criado automaticamente via script TypeScript',
        foundationModel: input.modelId,
        instruction: input.instruction,
        agentResourceRoleArn: input.agentRoleArn,
        idleSessionTTLInSeconds: 300,
      }),
    );

    const agentId = createAgentResponse.agent?.agentId;
    if (!agentId) {
      throw new Error('Não foi possível obter agentId após CreateAgent.');
    }

    return { agentId };
  }

  private async _sanityCheckModel(client: BedrockAgentClient, modelId: string): Promise<void> {
    const models = await client.send(new ListFoundationModelsCommand({}));
    const found = models.modelSummaries?.some((model) => model.modelId === modelId);

    if (!found) {
      console.warn(`⚠️ Modelo ${modelId} não encontrado em ListFoundationModels. Verifique acesso/região.`);
    }
  }
}
