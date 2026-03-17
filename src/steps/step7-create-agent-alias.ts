import {
  BedrockAgentClient,
  CreateAgentAliasCommand,
} from '@aws-sdk/client-bedrock-agent';

export interface Step7CreateAgentAliasInput {
  client: BedrockAgentClient;
  agentId: string;
  agentName: string;
  agentVersion: string;
}

export interface Step7CreateAgentAliasOutput {
  agentAliasId: string;
}

export class Step7CreateAgentAlias {
  public async execute(input: Step7CreateAgentAliasInput): Promise<Step7CreateAgentAliasOutput> {
    const aliasResponse = await input.client.send(
      new CreateAgentAliasCommand({
        agentId: input.agentId,
        agentAliasName: `${input.agentName}-alias`,
        description: 'Alias criado automaticamente para testes RAG',
        routingConfiguration: [{ agentVersion: input.agentVersion }],
      }),
    );

    const agentAliasId = aliasResponse.agentAlias?.agentAliasId;
    if (!agentAliasId) {
      throw new Error('Não foi possível obter agentAliasId após CreateAgentAlias.');
    }

    return { agentAliasId };
  }
}
