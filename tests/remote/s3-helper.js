/**
 * S3 helper for test file cleanup
 */

import config from 'config';
import { S3Client } from '@aws-sdk/client-s3';

let s3ClientInstance = null;

/**
 * Get or create an S3 client with the appropriate configuration
 */
export function getS3Client() {
	if (s3ClientInstance) {
		return s3ClientInstance;
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

	let client = new S3Client(options);

	// Wrap send() to catch auth errors and provide a helpful message
	let originalSend = client.send.bind(client);
	client.send = async function (...args) {
		try {
			return await originalSend(...args);
		}
		catch (e) {
			if (e.name === 'AuthorizationHeaderMalformed'
					|| e.name === 'CredentialsProviderError'
					|| e.Code === 'InvalidAccessKeyId') {
				throw new Error(
					`S3 authentication failed: ${e.message}. `
					+ 'Set awsAccessKeyID and awsSecretAccessKey in config/local.json or provide access via IAM.'
				);
			}
			throw e;
		}
	};

	s3ClientInstance = client;
	return s3ClientInstance;
}

