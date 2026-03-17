# Bootstrap RAG com Amazon Bedrock (TypeScript)

Este projeto cria uma automação ponta a ponta para:

1. Criar um **agente no Bedrock**
2. Criar uma **Knowledge Base**
3. Criar e vincular uma **Data Source S3** (ex.: `document.txt`)
4. Rodar ingestão dos dados
5. Vincular a Knowledge Base ao agente
6. Preparar versão do agente
7. Criar alias para disponibilizar interações
8. Fazer uma interação de teste para validar o fluxo RAG

## Pré-requisitos

- Node.js 20+
- Credenciais AWS configuradas no ambiente (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, opcional `AWS_SESSION_TOKEN`)
- Permissões IAM para Bedrock Agent, Bedrock Knowledge Base, S3 e OpenSearch Serverless
- Uma coleção e índice no OpenSearch Serverless para a KB vetorial

## Configuração

```bash
cp .env.example .env
```

Edite o `.env` com os valores reais da sua conta.

> **Importante:** embora a fonte documental seja S3, o Bedrock KB exige um backend vetorial (neste projeto, OpenSearch Serverless).

## Executar

```bash
npm install
npm run dev
```

Ou build + execução:

```bash
npm run build
npm start
```

## Saída esperada

O script imprime os IDs criados e a resposta retornada pelo agente na pergunta `RAG_TEST_QUESTION`.

## Estrutura

- `src/main.ts`: fluxo completo de provisionamento e teste
- `.env.example`: variáveis necessárias
