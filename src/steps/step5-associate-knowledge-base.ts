import {
  AssociateAgentKnowledgeBaseCommand,
  BedrockAgentClient,
} from '@aws-sdk/client-bedrock-agent';

export interface Step5AssociateKnowledgeBaseInput {
  client: BedrockAgentClient;
  agentId: string;
  knowledgeBaseId: string;
}

export interface Step5AssociateKnowledgeBaseOutput {
  associated: true;
}

export class Step5AssociateKnowledgeBase {
  public async execute(input: Step5AssociateKnowledgeBaseInput): Promise<Step5AssociateKnowledgeBaseOutput> {
    await input.client.send(
      new AssociateAgentKnowledgeBaseCommand({
        agentId: input.agentId,
        agentVersion: 'DRAFT',
        knowledgeBaseId: input.knowledgeBaseId,
        knowledgeBaseState: 'ENABLED',
        description: 'Knowledge base vinculada automaticamente via script',
      }),
    );

    return { associated: true };
  }
}
