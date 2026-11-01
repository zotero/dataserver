/**
 * API Keys tests
 * Port of tests/remote/tests/API/3/KeysTest.php
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
	assert404
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Keys', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testGetKeys
	it('should get keys with root access', async function () {
		// No anonymous access
		API.useAPIKey('');
		let response = await API.userGet(
			config.get('userID'),
			'keys'
		);
		assert403(response);

		// No access with user's API key
		API.useAPIKey(config.get('apiKey'));
		response = await API.userGet(
			config.get('userID'),
			'keys'
		);
		assert403(response);

		// Root access
		response = await API.userGet(
			config.get('userID'),
			'keys',
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.isArray(json);
		assert.isTrue(json.length > 0);
		assert.property(json[0], 'dateAdded');
	});

	// PHP: testGetKeyInfoCurrent
	it('should get key info for current key', async function () {
		API.useAPIKey('');
		let response = await API.get(
			'keys/current',
			[
				`Zotero-API-Key: ${config.get('apiKey')}`
			]
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.key, config.get('apiKey'));
		assert.equal(json.userID, config.get('userID'));
		assert.equal(json.username, config.get('username'));
		assert.equal(json.displayName, config.get('displayName'));
		assert.property(json.access, 'user');
		assert.property(json.access, 'groups');
		assert.isTrue(json.access.user.library);
		assert.isTrue(json.access.user.files);
		assert.isTrue(json.access.user.notes);
		assert.isTrue(json.access.user.write);
		assert.isTrue(json.access.groups.all.library);
		assert.isTrue(json.access.groups.all.write);
		assert.notProperty(json, 'name');
		assert.notProperty(json, 'dateAdded');
		assert.notProperty(json, 'lastUsed');
		assert.notProperty(json, 'recentIPs');
	});

	// PHP: testGetKeyInfoCurrentWithoutHeader
	it('should return 403 for current key without header', async function () {
		API.useAPIKey('');
		let response = await API.get('keys/current');
		assert403(response);
	});

	// PHP: testGetKeyInfoByPath
	it('should get key info by path', async function () {
		API.useAPIKey('');
		let response = await API.get(`keys/${config.get('apiKey')}`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.key, config.get('apiKey'));
		assert.equal(json.userID, config.get('userID'));
		assert.property(json.access, 'user');
		assert.property(json.access, 'groups');
		assert.isTrue(json.access.user.library);
		assert.isTrue(json.access.user.files);
		assert.isTrue(json.access.user.notes);
		assert.isTrue(json.access.user.write);
		assert.isTrue(json.access.groups.all.library);
		assert.isTrue(json.access.groups.all.write);
		assert.notProperty(json, 'name');
		assert.notProperty(json, 'dateAdded');
		assert.notProperty(json, 'lastUsed');
		assert.notProperty(json, 'recentIPs');
	});

	it('should include lastUsed after authenticated request', async function () {
		// Make an authenticated request to trigger logAccess
		API.useAPIKey(config.get('apiKey'));
		let response = await API.userGet(config.get('userID'), 'items?limit=1');
		assert200(response);

		// Get key info with root access -- should now have lastUsed
		API.useAPIKey('');
		response = await API.userGet(
			config.get('userID'),
			'keys',
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		let keyObj = json.find(k => k.key === config.get('apiKey'));
		assert.ok(keyObj, 'API key should be in response');
		assert.property(keyObj, 'lastUsed');
		assert.property(keyObj, 'recentIPs');
	});

	// PHP: testGetKeyInfoWithUser
	it('should get key info with user (deprecated)', async function () {
		API.useAPIKey('');
		let response = await API.userGet(
			config.get('userID'),
			`keys/${config.get('apiKey')}`
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.key, config.get('apiKey'));
		assert.equal(json.userID, config.get('userID'));
		assert.property(json.access, 'user');
		assert.property(json.access, 'groups');
		assert.isTrue(json.access.user.library);
		assert.isTrue(json.access.user.files);
		assert.isTrue(json.access.user.notes);
		assert.isTrue(json.access.user.write);
		assert.isTrue(json.access.groups.all.library);
		assert.isTrue(json.access.groups.all.write);
	});

	// PHP: testKeyCreateAndDelete
	it('should create and delete key', async function () {
		API.useAPIKey('');

		let name = `Test ${Date.now()}`;

		// Can't create anonymously
		let response = await API.userPost(
			config.get('userID'),
			'keys',
			JSON.stringify({
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		assert403(response);

		// Create as root
		response = await API.userPost(
			config.get('userID'),
			'keys',
			JSON.stringify({
				name: name,
				access: {
					user: {
						library: true
					}
				}
			}),
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert201(response);
		let json = API.getJSONFromResponse(response);
		let key = json.key;
		assert.equal(json.username, config.get('username'));
		assert.equal(json.displayName, config.get('displayName'));
		assert.equal(json.name, name);
		assert.deepEqual(json.access, { user: { library: true, files: true } });

		// Delete anonymously (with embedded key)
		response = await API.userDelete(
			config.get('userID'),
			'keys/current',
			[
				`Zotero-API-Key: ${key}`
			]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			'keys/current',
			[
				`Zotero-API-Key: ${key}`
			]
		);
		assert403(response);
	});

	// PHP: testKeyCreateAndModifyWithCredentials
	it('should create and modify key with credentials (private API)', async function () {
		API.useAPIKey('');

		let name = `Test ${Date.now()}`;

		// Can't create on /users/:userID/keys with credentials
		let response = await API.userPost(
			config.get('userID'),
			'keys',
			JSON.stringify({
				username: config.get('username'),
				password: config.get('password'),
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		assert403(response);

		// Create with credentials
		response = await API.post(
			'keys',
			JSON.stringify({
				username: config.get('username'),
				password: config.get('password'),
				name: name,
				access: {
					user: {
						library: true
					}
				}
			}),
			[],
			{}
		);
		assert201(response);
		let json = API.getJSONFromResponse(response);
		let key = json.key;
		assert.equal(json.userID, config.get('userID'));
		assert.equal(json.name, name);
		assert.deepEqual(json.access, { user: { library: true, files: true } });

		name = `Test ${Date.now()}`;

		// Can't modify on /users/:userID/keys/:key with credentials
		response = await API.userPut(
			config.get('userID'),
			`keys/${key}`,
			JSON.stringify({
				username: config.get('username'),
				password: config.get('password'),
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		assert403(response);

		// Can't modify another user's key with credentials
		response = await API.put(
			`keys/${key}`,
			JSON.stringify({
				username: config.get('username2'),
				password: config.get('password2'),
				name: name,
				access: {
					user: {
						library: true,
						write: true
					}
				}
			})
		);
		assert403(response);

		// Key should be unchanged
		response = await API.get(`keys/${key}`);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.deepEqual(json.access, { user: { library: true, files: true } });

		// Modify with credentials
		response = await API.put(
			`keys/${key}`,
			JSON.stringify({
				username: config.get('username'),
				password: config.get('password'),
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		key = json.key;
		assert.equal(json.name, name);

		response = await API.userDelete(
			config.get('userID'),
			`keys/${key}`
		);
		assert204(response);
	});

	// PHP: testKeyCreateWithEmailAddress
	it('should create key with email address (private API)', async function () {
		API.useAPIKey('');

		let name = `Test ${Date.now()}`;

		for (let email of [config.get('emailPrimary'), config.get('emailSecondary')]) {
			let response = await API.post(
				'keys',
				JSON.stringify({
					username: email,
					password: config.get('password'),
					name: name,
					access: {
						user: {
							library: true
						}
					}
				}),
				[],
				{}
			);
			assert201(response);
			let json = API.getJSONFromResponse(response);
			let _key = json.key;
			assert.equal(json.userID, config.get('userID'));
			assert.equal(json.username, config.get('username'));
			assert.equal(json.displayName, config.get('displayName'));
			assert.equal(json.name, name);
			assert.deepEqual(json.access, { user: { library: true, files: true } });
		}
	});

	describe('Automatic client keys', function () {
		let automaticNames = [
			'Automatic Zotero Client Key',
			'Automatic Zotero iOS Client Key',
			'Automatic Zotero Android Client Key',
			'Automatic Zotero Client Key (macOS)'
		];
		
		async function createKey(name) {
			let response = await API.superPost(
				`users/${config.get('userID')}/keys`,
				JSON.stringify({
					name,
					access: {
						user: {
							library: true
						}
					}
				})
			);
			assert201(response);
			return API.getJSONFromResponse(response).key;
		}
		
		async function getKeyJSON(key) {
			let response = await API.superGet(`keys/${key}`);
			assert200(response);
			return API.getJSONFromResponse(response);
		}
		
		async function deleteKey(key) {
			API.useAPIKey('');
			let response = await API.delete(`keys/${key}`);
			assert204(response);
		}
		
		for (let name of automaticNames) {
			it(`shouldn't allow modifying a key named '${name}'`, async function () {
				let key = await createKey(name);
				
				let response = await API.superPut(
					`keys/${key}`,
					JSON.stringify({
						name,
						access: {
							user: {
								library: true,
								write: true
							}
						}
					})
				);
				assert403(response);
				
				// Renaming is also blocked
				response = await API.superPut(
					`keys/${key}`,
					JSON.stringify({
						name: `Test ${Date.now()}`,
						access: {
							user: {
								library: true
							}
						}
					})
				);
				assert403(response);
				
				// Key should be unchanged
				let json = await getKeyJSON(key);
				assert.equal(json.name, name);
				assert.deepEqual(json.access, { user: { library: true, files: true } });
				
				await deleteKey(key);
			});
		}
		
		it("shouldn't allow modifying an automatic key with credentials", async function () {
			let name = 'Automatic Zotero Client Key (Windows)';
			let key = await createKey(name);
			
			API.useAPIKey('');
			let response = await API.put(
				`keys/${key}`,
				JSON.stringify({
					username: config.get('username'),
					password: config.get('password'),
					name,
					access: {
						user: {
							library: true,
							write: true
						}
					}
				})
			);
			assert403(response);
			
			let json = await getKeyJSON(key);
			assert.deepEqual(json.access, { user: { library: true, files: true } });
			
			await deleteKey(key);
		});
		
		it("shouldn't allow renaming a key to an automatic name", async function () {
			let name = `Test ${Date.now()}`;
			let key = await createKey(name);
			
			for (let automaticName of automaticNames) {
				let response = await API.superPut(
					`keys/${key}`,
					JSON.stringify({
						name: automaticName,
						access: {
							user: {
								library: true
							}
						}
					})
				);
				assert400(response);
			}
			
			let json = await getKeyJSON(key);
			assert.equal(json.name, name);
			
			await deleteKey(key);
		});
		
		it('should allow modifying keys with names similar to automatic names', async function () {
			let names = [
				'Automatic Zotero Client Keys',
				'My Automatic Zotero Client Key',
				'Automatic Zotero Web Client Key'
			];
			for (let name of names) {
				let key = await createKey(`Test ${Date.now()}`);
				
				// Rename to the lookalike name
				let response = await API.superPut(
					`keys/${key}`,
					JSON.stringify({
						name,
						access: {
							user: {
								library: true
							}
						}
					})
				);
				assert200(response);
				assert.equal(API.getJSONFromResponse(response).name, name);
				
				// Modify the key with the lookalike name
				response = await API.superPut(
					`keys/${key}`,
					JSON.stringify({
						name,
						access: {
							user: {
								library: true,
								write: true
							}
						}
					})
				);
				assert200(response);
				let json = await getKeyJSON(key);
				assert.equal(json.name, name);
				assert.deepEqual(json.access, { user: { library: true, files: true, write: true } });
				
				await deleteKey(key);
			}
		});
		
		it('should allow deleting an automatic key', async function () {
			let key = await createKey('Automatic Zotero Client Key (macOS)');
			
			let response = await API.superDelete(`users/${config.get('userID')}/keys/${key}`);
			assert204(response);
			
			response = await API.superGet(`keys/${key}`);
			assert404(response);
		});
	});
});
