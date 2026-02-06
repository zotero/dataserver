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
	assert403
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
		assert.property(json[0], 'lastUsed');
		assert.property(json[0], 'recentIPs');
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
});
