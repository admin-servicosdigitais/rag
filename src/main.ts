import 'dotenv/config';
import { BedrockAgentClient } from '@aws-sdk/client-bedrock-agent';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { Step1CreateAgent } from './steps/step1-create-agent.js';
import { Step2CreateKnowledgeBase } from './steps/step2-create-knowledge-base.js';
import { Step3CreateDataSource } from './steps/step3-create-data-source.js';
import { Step4StartIngestion } from './steps/step4-start-ingestion.js';
import { Step5AssociateKnowledgeBase } from './steps/step5-associate-knowledge-base.js';
import { Step6PrepareAgent } from './steps/step6-prepare-agent.js';
import { Step7CreateAgentAlias } from './steps/step7-create-agent-alias.js';
import { Step8InvokeAgent } from './steps/step8-invoke-agent.js';

interface AppEnvironment {
  AWS_REGION: string;
  BEDROCK_AGENT_NAME: string;
  BEDROCK_AGENT_INSTRUCTION: string;
  BEDROCK_MODEL_ID: string;
  BEDROCK_AGENT_ROLE_ARN: string;
  BEDROCK_KB_NAME: string;
  BEDROCK_KB_DESCRIPTION: string;
  BEDROCK_KB_ROLE_ARN: string;
  BEDROCK_KB_S3_BUCKET_ARN: string;
  BEDROCK_KB_S3_PREFIX: string;
  OPENSEARCH_COLLECTION_ARN: string;
  OPENSEARCH_VECTOR_INDEX_NAME: string;
  OPENSEARCH_VECTOR_FIELD: string;
  OPENSEARCH_TEXT_FIELD: string;
  OPENSEARCH_METADATA_FIELD: string;
  RAG_TEST_QUESTION: string;
}

class EnvironmentLoader {
  private readonly _requiredEnv: Array<keyof AppEnvironment> = [
    'AWS_REGION',
    'BEDROCK_AGENT_NAME',
    'BEDROCK_AGENT_INSTRUCTION',
    'BEDROCK_MODEL_ID',
    'BEDROCK_AGENT_ROLE_ARN',
    'BEDROCK_KB_NAME',
    'BEDROCK_KB_DESCRIPTION',
    'BEDROCK_KB_ROLE_ARN',
    'BEDROCK_KB_S3_BUCKET_ARN',
    'BEDROCK_KB_S3_PREFIX',
    'OPENSEARCH_COLLECTION_ARN',
    'OPENSEARCH_VECTOR_INDEX_NAME',
    'OPENSEARCH_VECTOR_FIELD',
    'OPENSEARCH_TEXT_FIELD',
    'OPENSEARCH_METADATA_FIELD',
    'RAG_TEST_QUESTION',
  ];

  public load(): AppEnvironment {
    this._validate();
    return process.env as unknown as AppEnvironment;
  }

  private _validate(): void {
    const missing = this._requiredEnv.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);
    }
  }
}

async function main(): Promise<void> {
  const env = new EnvironmentLoader().load();
  const client = new BedrockAgentClient({ region: env.AWS_REGION });
  const runtimeClient = new BedrockAgentRuntimeClient({ region: env.AWS_REGION });

  console.log('1) Criando agente...');
  const step1Result = await new Step1CreateAgent().execute({
    client,
    modelId: env.BEDROCK_MODEL_ID,
    agentName: env.BEDROCK_AGENT_NAME,
    instruction: env.BEDROCK_AGENT_INSTRUCTION,
    agentRoleArn: env.BEDROCK_AGENT_ROLE_ARN,
  });
  console.log(`Agente criado: ${step1Result.agentId}`);

  console.log('2) Criando Knowledge Base...');
  const step2Result = await new Step2CreateKnowledgeBase().execute({
    client,
    region: env.AWS_REGION,
    knowledgeBaseName: env.BEDROCK_KB_NAME,
    knowledgeBaseDescription: env.BEDROCK_KB_DESCRIPTION,
    knowledgeBaseRoleArn: env.BEDROCK_KB_ROLE_ARN,
    opensearchCollectionArn: env.OPENSEARCH_COLLECTION_ARN,
    opensearchVectorIndexName: env.OPENSEARCH_VECTOR_INDEX_NAME,
    opensearchVectorField: env.OPENSEARCH_VECTOR_FIELD,
    opensearchTextField: env.OPENSEARCH_TEXT_FIELD,
    opensearchMetadataField: env.OPENSEARCH_METADATA_FIELD,
  });
  console.log(`Knowledge Base ativa: ${step2Result.knowledgeBaseId}`);

  console.log('3) Criando Data Source (S3) da KB...');
  const step3Result = await new Step3CreateDataSource().execute({
    client,
    knowledgeBaseId: step2Result.knowledgeBaseId,
    knowledgeBaseName: env.BEDROCK_KB_NAME,
    s3BucketArn: env.BEDROCK_KB_S3_BUCKET_ARN,
    s3Prefix: env.BEDROCK_KB_S3_PREFIX,
  });
  console.log(`Data Source disponível: ${step3Result.dataSourceId}`);

  console.log('4) Executando ingestão do documento...');
  await new Step4StartIngestion().execute({
    client,
    knowledgeBaseId: step2Result.knowledgeBaseId,
    dataSourceId: step3Result.dataSourceId,
  });

  console.log('5) Vinculando Knowledge Base ao agente...');
  await new Step5AssociateKnowledgeBase().execute({
    client,
    agentId: step1Result.agentId,
    knowledgeBaseId: step2Result.knowledgeBaseId,
  });

  console.log('6) Preparando agente (gera versão) ...');
  const step6Result = await new Step6PrepareAgent().execute({
    client,
    agentId: step1Result.agentId,
  });
  console.log(`Agente preparado na versão ${step6Result.agentVersion}`);

  console.log('7) Criando alias para disponibilizar interações...');
  const step7Result = await new Step7CreateAgentAlias().execute({
    client,
    agentId: step1Result.agentId,
    agentName: env.BEDROCK_AGENT_NAME,
    agentVersion: step6Result.agentVersion,
  });
  console.log(`Alias criado: ${step7Result.agentAliasId}`);

  console.log('8) Teste de interação RAG...');
  const step8Result = await new Step8InvokeAgent().execute({
    runtimeClient,
    agentId: step1Result.agentId,
    agentAliasId: step7Result.agentAliasId,
    question: env.RAG_TEST_QUESTION,
  });

  console.log('\n================ RESPOSTA DO AGENTE ================\n');
  console.log(step8Result.answer || '(sem resposta textual)');
  console.log('\n=====================================================\n');

  console.log('Fluxo completo finalizado com sucesso.');
  console.log(
    `Resumo -> agentId: ${step1Result.agentId} | aliasId: ${step7Result.agentAliasId} | kbId: ${step2Result.knowledgeBaseId}`,
  );
}

main().catch((error) => {
  console.error('Erro durante execução:', error);
  process.exitCode = 1;
});
