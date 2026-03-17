import {
  BedrockAgentClient,
  GetAgentCommand,
  PrepareAgentCommand,
  type Agent,
} from '@aws-sdk/client-bedrock-agent';

export interface Step6PrepareAgentInput {
  client: BedrockAgentClient;
  agentId: string;
}

export interface Step6PrepareAgentOutput {
  agentVersion: string;
}

export class Step6PrepareAgent {
  public async execute(input: Step6PrepareAgentInput): Promise<Step6PrepareAgentOutput> {
    await input.client.send(new PrepareAgentCommand({ agentId: input.agentId }));
    const preparedAgent = await this._waitForAgentPrepared(input.client, input.agentId);
    const agentVersion = preparedAgent.agentVersion;

    if (!agentVersion) {
      throw new Error('agentVersion não retornada após PrepareAgent.');
    }

    return { agentVersion };
  }

  private async _waitForAgentPrepared(client: BedrockAgentClient, agentId: string): Promise<Agent> {
    while (true) {
      const response = await client.send(new GetAgentCommand({ agentId }));
      const agent = response.agent;

      if (!agent) {
        throw new Error('Agente não encontrado durante o polling.');
      }

      console.log(`Agent status: ${agent.agentStatus}`);

      if (agent.agentStatus === 'PREPARED') {
        return agent;
      }

      if (agent.agentStatus === 'FAILED') {
        throw new Error(`Falha ao preparar agente: ${agent.failureReasons?.join('; ') ?? 'motivo desconhecido'}`);
      }

      await this._sleep(5000);
    }
  }

  private async _sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
