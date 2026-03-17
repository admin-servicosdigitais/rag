import 'dotenv/config';
import {
  AssociateAgentKnowledgeBaseCommand,
  BedrockAgentClient,
  CreateAgentAliasCommand,
  CreateAgentCommand,
  CreateDataSourceCommand,
  CreateKnowledgeBaseCommand,
  GetAgentCommand,
  GetDataSourceCommand,
  GetIngestionJobCommand,
  GetKnowledgeBaseCommand,
  ListFoundationModelsCommand,
  PrepareAgentCommand,
  StartIngestionJobCommand,
  type Agent,
  type DataSource,
  type KnowledgeBase,
} from '@aws-sdk/client-bedrock-agent';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const requiredEnv = [
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

function validateEnv() {
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(', ')}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForKnowledgeBaseReady(client: BedrockAgentClient, knowledgeBaseId: string) {
  while (true) {
    const response = await client.send(new GetKnowledgeBaseCommand({ knowledgeBaseId }));
    const kb = response.knowledgeBase;
    if (!kb) throw new Error('Knowledge base não encontrada durante o polling.');

    const status = kb.status;
    console.log(`KB status: ${status}`);

    if (status === 'ACTIVE') return kb;
    if (status === 'FAILED') {
      throw new Error(`Falha ao criar KB: ${kb.failureReasons?.join('; ') ?? 'motivo desconhecido'}`);
    }

    await sleep(5000);
  }
}

async function waitForDataSourceReady(client: BedrockAgentClient, knowledgeBaseId: string, dataSourceId: string) {
  while (true) {
    const response = await client.send(new GetDataSourceCommand({ knowledgeBaseId, dataSourceId }));
    const ds = response.dataSource;
    if (!ds) throw new Error('Data source não encontrada durante o polling.');

    const status = ds.status;
    console.log(`Data source status: ${status}`);

    if (status === 'AVAILABLE') return ds;
    if (status === 'DELETE_UNSUCCESSFUL') {
      throw new Error('Data source está em estado inválido (DELETE_UNSUCCESSFUL).');
    }

    await sleep(5000);
  }
}

async function waitForIngestion(client: BedrockAgentClient, knowledgeBaseId: string, dataSourceId: string, ingestionJobId: string) {
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

    if (status === 'COMPLETE') return;
    if (status === 'FAILED' || status === 'STOPPED') {
      throw new Error(`Ingestion falhou/parou: ${response.ingestionJob?.failureReasons?.join('; ') ?? 'motivo desconhecido'}`);
    }

    await sleep(5000);
  }
}

async function waitForAgentPrepared(client: BedrockAgentClient, agentId: string): Promise<Agent> {
  while (true) {
    const response = await client.send(new GetAgentCommand({ agentId }));
    const agent = response.agent;
    if (!agent) throw new Error('Agente não encontrado durante o polling.');

    console.log(`Agent status: ${agent.agentStatus}`);

    if (agent.agentStatus === 'PREPARED') return agent;
    if (agent.agentStatus === 'FAILED') {
      throw new Error(`Falha ao preparar agente: ${agent.failureReasons?.join('; ') ?? 'motivo desconhecido'}`);
    }

    await sleep(5000);
  }
}

async function sanityCheckModel(client: BedrockAgentClient, modelId: string) {
  const models = await client.send(new ListFoundationModelsCommand({}));
  const found = models.modelSummaries?.some((m) => m.modelId === modelId);
  if (!found) {
    console.warn(`⚠️ Modelo ${modelId} não encontrado em ListFoundationModels. Verifique acesso/região.`);
  }
}

function decodeChunks(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder('utf-8');
  return chunks.map((chunk) => decoder.decode(chunk)).join('');
}

async function main() {
  validateEnv();

  const region = process.env.AWS_REGION!;
  const client = new BedrockAgentClient({ region });
  const runtimeClient = new BedrockAgentRuntimeClient({ region });

  const modelId = process.env.BEDROCK_MODEL_ID!;
  await sanityCheckModel(client, modelId);

  console.log('1) Criando agente...');
  const createAgentResponse = await client.send(
    new CreateAgentCommand({
      agentName: process.env.BEDROCK_AGENT_NAME!,
      description: 'Agente RAG criado automaticamente via script TypeScript',
      foundationModel: modelId,
      instruction: process.env.BEDROCK_AGENT_INSTRUCTION!,
      agentResourceRoleArn: process.env.BEDROCK_AGENT_ROLE_ARN!,
      idleSessionTTLInSeconds: 300,
    }),
  );

  const agentId = createAgentResponse.agent?.agentId;
  if (!agentId) throw new Error('Não foi possível obter agentId após CreateAgent.');

  console.log(`Agente criado: ${agentId}`);

  console.log('2) Criando Knowledge Base...');
  const kbResponse = await client.send(
    new CreateKnowledgeBaseCommand({
      name: process.env.BEDROCK_KB_NAME!,
      description: process.env.BEDROCK_KB_DESCRIPTION!,
      roleArn: process.env.BEDROCK_KB_ROLE_ARN!,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${region}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: process.env.OPENSEARCH_COLLECTION_ARN!,
          vectorIndexName: process.env.OPENSEARCH_VECTOR_INDEX_NAME!,
          fieldMapping: {
            vectorField: process.env.OPENSEARCH_VECTOR_FIELD!,
            textField: process.env.OPENSEARCH_TEXT_FIELD!,
            metadataField: process.env.OPENSEARCH_METADATA_FIELD!,
          },
        },
      },
    }),
  );

  const knowledgeBaseId = kbResponse.knowledgeBase?.knowledgeBaseId;
  if (!knowledgeBaseId) throw new Error('Não foi possível obter knowledgeBaseId após CreateKnowledgeBase.');

  await waitForKnowledgeBaseReady(client, knowledgeBaseId);
  console.log(`Knowledge Base ativa: ${knowledgeBaseId}`);

  console.log('3) Criando Data Source (S3) da KB...');
  const dataSourceResponse = await client.send(
    new CreateDataSourceCommand({
      knowledgeBaseId,
      name: `${process.env.BEDROCK_KB_NAME!}-s3-source`,
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: process.env.BEDROCK_KB_S3_BUCKET_ARN!,
          inclusionPrefixes: [process.env.BEDROCK_KB_S3_PREFIX!],
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
  if (!dataSourceId) throw new Error('Não foi possível obter dataSourceId após CreateDataSource.');

  await waitForDataSourceReady(client, knowledgeBaseId, dataSourceId);
  console.log(`Data Source disponível: ${dataSourceId}`);

  console.log('4) Executando ingestão do documento...');
  const startIngestionResponse = await client.send(
    new StartIngestionJobCommand({ knowledgeBaseId, dataSourceId }),
  );

  const ingestionJobId = startIngestionResponse.ingestionJob?.ingestionJobId;
  if (!ingestionJobId) throw new Error('Não foi possível obter ingestionJobId após StartIngestionJob.');

  await waitForIngestion(client, knowledgeBaseId, dataSourceId, ingestionJobId);

  console.log('5) Vinculando Knowledge Base ao agente...');
  await client.send(
    new AssociateAgentKnowledgeBaseCommand({
      agentId,
      agentVersion: 'DRAFT',
      knowledgeBaseId,
      knowledgeBaseState: 'ENABLED',
      description: 'Knowledge base vinculada automaticamente via script',
    }),
  );

  console.log('6) Preparando agente (gera versão) ...');
  await client.send(new PrepareAgentCommand({ agentId }));
  const preparedAgent = await waitForAgentPrepared(client, agentId);
  const agentVersion = preparedAgent.agentVersion;
  if (!agentVersion) throw new Error('agentVersion não retornada após PrepareAgent.');

  console.log(`Agente preparado na versão ${agentVersion}`);

  console.log('7) Criando alias para disponibilizar interações...');
  const aliasResponse = await client.send(
    new CreateAgentAliasCommand({
      agentId,
      agentAliasName: `${process.env.BEDROCK_AGENT_NAME!}-alias`,
      description: 'Alias criado automaticamente para testes RAG',
      routingConfiguration: [{ agentVersion }],
    }),
  );

  const agentAliasId = aliasResponse.agentAlias?.agentAliasId;
  if (!agentAliasId) throw new Error('Não foi possível obter agentAliasId após CreateAgentAlias.');

  console.log(`Alias criado: ${agentAliasId}`);

  console.log('8) Teste de interação RAG...');
  const invokeResponse = await runtimeClient.send(
    new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId: `session-${Date.now()}`,
      inputText: process.env.RAG_TEST_QUESTION!,
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

  const answer = decodeChunks(chunks);
  console.log('\n================ RESPOSTA DO AGENTE ================\n');
  console.log(answer || '(sem resposta textual)');
  console.log('\n=====================================================\n');

  console.log('Fluxo completo finalizado com sucesso.');
  console.log(`Resumo -> agentId: ${agentId} | aliasId: ${agentAliasId} | kbId: ${knowledgeBaseId}`);
}

main().catch((error) => {
  console.error('Erro durante execução:', error);
  process.exitCode = 1;
});
