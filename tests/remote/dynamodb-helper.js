/**
 * DynamoDB helper for full-text indexing state
 *
 * dataserver only ever reads the per-library "deindexed" flag and clears it (sets false)
 * on reindex -- the true value is written by external producers (the full-text-indexer
 * Lambda and the purge script). These helpers stand in for those producers so tests can
 * put a library into the deindexed state that the reindex flow starts from.
 */

import config from 'config';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

let clientInstance = null;

/**
 * Get or create a DynamoDB client with the appropriate configuration
 */
export function getDynamoClient() {
	if (clientInstance) {
		return clientInstance;
	}

	let options = {
		region: config.get('awsRegion') || 'us-east-1',
	};

	// Use explicit credentials if provided, otherwise fall back to IAM/environment
	let accessKeyID = config.has('awsAccessKeyID') && config.get('awsAccessKeyID');
	let secretAccessKey = config.has('awsSecretAccessKey') && config.get('awsSecretAccessKey');
	if (accessKeyID && secretAccessKey) {
		options.credentials = {
			accessKeyId: accessKeyID,
			secretAccessKey: secretAccessKey,
		};
	}

	let client = new DynamoDBClient(options);

	// Wrap send() to catch auth errors and provide a helpful message
	let originalSend = client.send.bind(client);
	client.send = async function (...args) {
		try {
			return await originalSend(...args);
		}
		catch (e) {
			if (e.name === 'UnrecognizedClientException'
					|| e.name === 'CredentialsProviderError'
					|| e.name === 'AccessDeniedException') {
				throw new Error(
					`DynamoDB authentication/authorization failed: ${e.message}. `
					+ 'Set awsAccessKeyID and awsSecretAccessKey in config/local.json (the test user '
					+ 'needs dynamodb:GetItem and dynamodb:UpdateItem on the full-text indexing table) '
					+ 'or provide access via IAM.'
				);
			}
			throw e;
		}
	};

	clientInstance = client;
	return clientInstance;
}

function stateKey(libraryID) {
	return {
		pk: { S: `LIBRARY#${libraryID}` },
		sk: { S: 'STATE' },
	};
}

/**
 * Set (or clear) a library's full-text "deindexed" flag, mirroring an external producer
 */
export async function setFullTextDeindexed(libraryID, deindexed) {
	let client = getDynamoClient();
	await client.send(new UpdateItemCommand({
		TableName: config.get('fullTextIndexingTable'),
		Key: stateKey(libraryID),
		UpdateExpression: 'SET deindexed = :v',
		ExpressionAttributeValues: {
			':v': { BOOL: !!deindexed },
		},
	}));
}

/**
 * Read a library's full-text "deindexed" flag (absent item/attribute => false)
 */
export async function getFullTextDeindexed(libraryID) {
	let client = getDynamoClient();
	let resp = await client.send(new GetItemCommand({
		TableName: config.get('fullTextIndexingTable'),
		Key: stateKey(libraryID),
		ProjectionExpression: 'deindexed',
		ConsistentRead: true,
	}));
	return resp.Item?.deindexed?.BOOL === true;
}

/**
 * Set or clear a library's full-text 'reindexing' timestamp. The server stamps this
 * (epoch seconds) when a search triggers a rebuild, and the reindexer Lambda removes
 * it when the refill completes -- these stand in for both so tests can simulate a
 * rebuild in progress and clean up after a triggered one.
 */
export async function setFullTextReindexing(libraryID, time) {
	let client = getDynamoClient();
	let params = {
		TableName: config.get('fullTextIndexingTable'),
		Key: stateKey(libraryID),
	};
	if (time) {
		params.UpdateExpression = 'SET reindexing = :v';
		params.ExpressionAttributeValues = {
			':v': { N: String(time) },
		};
	}
	else {
		params.UpdateExpression = 'REMOVE reindexing';
	}
	await client.send(new UpdateItemCommand(params));
}

/**
 * Read a library's full-text 'reindexing' timestamp (absent item/attribute => null)
 */
export async function getFullTextReindexing(libraryID) {
	let client = getDynamoClient();
	let resp = await client.send(new GetItemCommand({
		TableName: config.get('fullTextIndexingTable'),
		Key: stateKey(libraryID),
		ProjectionExpression: 'reindexing',
		ConsistentRead: true,
	}));
	return resp.Item?.reindexing?.N ? parseInt(resp.Item.reindexing.N) : null;
}
