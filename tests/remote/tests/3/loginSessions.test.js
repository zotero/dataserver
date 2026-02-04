/**
 * Login Sessions tests
 * Tests for web-based login flow via /keys/sessions endpoints
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert201,
	assert204,
	assert400,
	assert403,
	assert404,
	assert409,
	assert410
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Login Sessions', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
	});

	describe('Session Creation', function() {
		it('should create a login session without authentication', async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);

			let json = API.getJSONFromResponse(response);
			assert.property(json, 'sessionToken');
			assert.property(json, 'loginURL');
			assert.equal(json.sessionToken.length, 32);
			assert.include(json.loginURL, 'login');
			assert.include(json.loginURL, json.sessionToken);
		});

		it('should create a login session with API key for key update flow', async function() {
			API.useAPIKey(config.get('apiKey'));
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Windows NT 10.0) Zotero/7.0']
			);
			assert201(response);

			let json = API.getJSONFromResponse(response);
			assert.property(json, 'sessionToken');
			assert.property(json, 'loginURL');
		});

		it('should create a login session with userID from local database', async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				JSON.stringify({ userID: config.get('userID') }),
				[
					'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0',
					'Content-Type: application/json'
				]
			);
			assert201(response);

			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Verify userID is returned in info
			response = await API.superGet(`keys/sessions/${sessionToken}/info`);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.equal(json.userID, config.get('userID'));
			// But no access since there's no existing key
			assert.isNull(json.access);
		});
	});

	describe('Session Status', function() {
		let sessionToken;

		before(async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			sessionToken = json.sessionToken;
		});

		it('should get pending session status', async function() {
			API.useAPIKey('');
			let response = await API.get(`keys/sessions/${sessionToken}`);
			assert200(response);

			let json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'pending');
			// Pending session should not have apiKey
			assert.notProperty(json, 'apiKey');
		});

		it('should return 404 for non-existent session', async function() {
			API.useAPIKey('');
			let response = await API.get('keys/sessions/nonexistenttoken12345678901234');
			assert404(response);
		});
	});

	describe('Session Cancellation', function() {
		let sessionToken;

		beforeEach(async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Linux) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			sessionToken = json.sessionToken;
		});

		it('should cancel a pending session', async function() {
			API.useAPIKey('');
			let response = await API.delete(`keys/sessions/${sessionToken}`);
			assert204(response);

			// Verify session is cancelled
			response = await API.get(`keys/sessions/${sessionToken}`);
			assert200(response);
			let json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'cancelled');
		});

		it('should return 409 when cancelling already cancelled session', async function() {
			API.useAPIKey('');
			// Cancel once
			let response = await API.delete(`keys/sessions/${sessionToken}`);
			assert204(response);

			// Try to cancel again
			response = await API.delete(`keys/sessions/${sessionToken}`);
			assert409(response);
		});
	});

	describe('Session Info (Super-user)', function() {
		let sessionToken;

		before(async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			sessionToken = json.sessionToken;
		});

		it('should require super-user for info endpoint', async function() {
			API.useAPIKey('');
			let response = await API.get(`keys/sessions/${sessionToken}/info`);
			assert403(response);

			API.useAPIKey(config.get('apiKey'));
			response = await API.get(`keys/sessions/${sessionToken}/info`);
			assert403(response);
		});

		it('should return session info for super-user (new login)', async function() {
			let response = await API.superGet(`keys/sessions/${sessionToken}/info`);
			assert200(response);

			let json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'pending');
			// New login session has no userID or access
			assert.isNull(json.userID);
			assert.isNull(json.access);
		});

		it('should return session info with existing key permissions for key update', async function() {
			// Create session with API key
			API.useAPIKey(config.get('apiKey'));
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let keyUpdateToken = json.sessionToken;

			// Get info as super-user
			response = await API.superGet(`keys/sessions/${keyUpdateToken}/info`);
			assert200(response);

			json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'pending');
			// Key update session has userID and access from existing key
			assert.equal(json.userID, config.get('userID'));
			assert.isNotNull(json.access);
		});
	});

	describe('Session Completion (Super-user)', function() {
		it('should require super-user for complete endpoint', async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Try to complete without super-user
			API.useAPIKey('');
			response = await API.post(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert403(response);

			API.useAPIKey(config.get('apiKey'));
			response = await API.post(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert403(response);
		});

		it('should complete session and create API key', async function() {
			// Create session
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Complete session as super-user
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: {
						user: { library: true, notes: true, write: true }
					}
				})
			);
			assert204(response);

			// Poll to get the API key
			API.useAPIKey('');
			response = await API.get(`keys/sessions/${sessionToken}`);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'completed');
			assert.property(json, 'apiKey');
			assert.equal(json.apiKey.length, 24);

			// Verify the created key works
			let apiKey = json.apiKey;
			API.useAPIKey(apiKey);
			response = await API.get('keys/current');
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.equal(json.key, apiKey);

			// Clean up -- delete the created key
			API.useAPIKey('');
			response = await API.delete(
				`keys/${apiKey}`,
				[`Zotero-API-Key: ${apiKey}`]
			);
			assert204(response);
		});

		it('should return 400 when completing without required fields', async function() {
			// Create session
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Missing sessionToken
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert400(response);

			// Missing access
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID')
				})
			);
			assert400(response);

			// Missing userID for new login
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					access: { user: { library: true } }
				})
			);
			assert400(response);
		});

		it('should return 409 when completing already completed session', async function() {
			// Create and complete session
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert204(response);

			// Get apiKey by polling
			response = await API.get(`keys/sessions/${sessionToken}`);
			let apiKey = API.getJSONFromResponse(response).apiKey;

			// Try to complete again
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert409(response);

			// Clean up
			API.useAPIKey('');
			await API.delete(`keys/${apiKey}`, [`Zotero-API-Key: ${apiKey}`]);
		});

		it('should return 404 for non-existent session', async function() {
			let response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: 'nonexistenttoken12345678901234',
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert404(response);
		});
	});

	describe('Client Type Detection', function() {
		it('should detect macOS client', async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Complete and check key name
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert204(response);

			// Get apiKey by polling
			response = await API.get(`keys/sessions/${sessionToken}`);
			let apiKey = API.getJSONFromResponse(response).apiKey;

			// Get key info to check name
			response = await API.userGet(
				config.get('userID'),
				`keys/${apiKey}`,
				[],
				{
					username: config.get('rootUsername'),
					password: config.get('rootPassword')
				}
			);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.include(json.name, 'macOS');

			// Clean up
			API.useAPIKey('');
			await API.delete(`keys/${apiKey}`, [`Zotero-API-Key: ${apiKey}`]);
		});

		it('should detect Windows client', async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Complete and check key name
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert204(response);

			// Get apiKey by polling
			response = await API.get(`keys/sessions/${sessionToken}`);
			let apiKey = API.getJSONFromResponse(response).apiKey;

			// Get key info to check name
			response = await API.userGet(
				config.get('userID'),
				`keys/${apiKey}`,
				[],
				{
					username: config.get('rootUsername'),
					password: config.get('rootPassword')
				}
			);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.include(json.name, 'Windows');

			// Clean up
			API.useAPIKey('');
			await API.delete(`keys/${apiKey}`, [`Zotero-API-Key: ${apiKey}`]);
		});

		it('should detect Linux client', async function() {
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (X11; Linux x86_64) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Complete and check key name
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert204(response);

			// Get apiKey by polling
			response = await API.get(`keys/sessions/${sessionToken}`);
			let apiKey = API.getJSONFromResponse(response).apiKey;

			// Get key info to check name
			response = await API.userGet(
				config.get('userID'),
				`keys/${apiKey}`,
				[],
				{
					username: config.get('rootUsername'),
					password: config.get('rootPassword')
				}
			);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.include(json.name, 'Linux');

			// Clean up
			API.useAPIKey('');
			await API.delete(`keys/${apiKey}`, [`Zotero-API-Key: ${apiKey}`]);
		});
	});

	describe('Polling for Completion', function() {
		it('should return completed session with API key when polling', async function() {
			// Create session
			API.useAPIKey('');
			let response = await API.post(
				'keys/sessions',
				'',
				['User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Zotero/7.0']
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let sessionToken = json.sessionToken;

			// Verify pending status
			response = await API.get(`keys/sessions/${sessionToken}`);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'pending');
			assert.notProperty(json, 'apiKey');

			// Complete session
			response = await API.superPost(
				'keys/sessions/complete',
				JSON.stringify({
					sessionToken: sessionToken,
					userID: config.get('userID'),
					access: { user: { library: true } }
				})
			);
			assert204(response);

			// Poll for completion -- should now include API key
			API.useAPIKey('');
			response = await API.get(`keys/sessions/${sessionToken}`);
			assert200(response);
			json = API.getJSONFromResponse(response);
			assert.equal(json.status, 'completed');
			assert.property(json, 'apiKey');
			assert.equal(json.userID, config.get('userID'));
			assert.property(json, 'username');

			// Clean up
			let apiKey = json.apiKey;
			await API.delete(`keys/${apiKey}`, [`Zotero-API-Key: ${apiKey}`]);
		});
	});
});
