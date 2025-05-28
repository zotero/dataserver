const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('KeysTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});

	// Private API
	it('testKeyCreateAndModifyWithCredentials', async function () {
		API.useAPIKey("");
		let name = "Test " + Helpers.uniqueID();

		// Can't create on /users/:userID/keys with credentials
		let response = await API.userPost(
			config.userID,
			'keys',
			JSON.stringify({
				username: config.username,
				password: config.password,
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		Helpers.assert403(response);

		// Create with credentials
		response = await API.post(
			'keys',
			JSON.stringify({
				username: config.username,
				password: config.password,
				name: name,
				access: {
					user: {
						library: true
					}
				}
			}),
			{},
			{}
		);
		Helpers.assert201(response);
		let json = API.getJSONFromResponse(response);
		let key = json.key;
		assert.equal(json.userID, config.userID);
		assert.equal(json.name, name);
		assert.deepEqual({
			user: {
				library: true,
				files: true
			}
		}, json.access);

		name = "Test " + Helpers.uniqueID();

		// Can't modify on /users/:userID/keys/:key with credentials
		response = await API.userPut(
			config.userID,
			"keys/" + key,
			JSON.stringify({
				username: config.username,
				password: config.password,
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		Helpers.assert403(response);

		// Modify with credentials
		response = await API.put(
			"keys/" + key,
			JSON.stringify({
				username: config.username,
				password: config.password,
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);
		key = json.key;
		assert.equal(json.name, name);

		response = await API.userDelete(
			config.userID,
			"keys/" + key
		);
		Helpers.assert204(response);
	});

	it('testKeyCreateAndDelete', async function () {
		API.useAPIKey('');
		const name = 'Test ' + Helpers.uniqueID();

		// Can't create anonymously
		let response = await API.userPost(
			config.userID,
			'keys',
			JSON.stringify({
				name: name,
				access: {
					user: { library: true }
				}
			})
		);
		Helpers.assert403(response);

		// Create as root
		response = await API.userPost(
			config.userID,
			'keys',
			JSON.stringify({
				name: name,
				access: {
					user: { library: true }
				}
			}),
			{},
			{
				username: config.rootUsername,
				password: config.rootPassword
			}
		);
		Helpers.assert201(response);
		const json = API.getJSONFromResponse(response);
		const key = json.key;
		assert.equal(config.username, json.username);
		assert.equal(config.displayName, json.displayName);
		assert.equal(name, json.name);
		assert.deepEqual({ user: { library: true, files: true } }, json.access);

		// Delete anonymously (with embedded key)
		response = await API.userDelete(config.userID, 'keys/current', {
			'Zotero-API-Key': key
		});
		Helpers.assert204(response);

		response = await API.userGet(config.userID, 'keys/current', {
			'Zotero-API-Key': key
		});
		Helpers.assert403(response);
	});

	it('testGetKeyInfoCurrent', async function () {
		API.useAPIKey("");
		const response = await API.get(
			'keys/current',
			{ "Zotero-API-Key": config.apiKey }
		);
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		assert.equal(config.apiKey, json.key);
		assert.equal(config.userID, json.userID);
		assert.equal(config.username, json.username);
		assert.equal(config.displayName, json.displayName);
		assert.property(json.access, "user");
		assert.property(json.access, "groups");
		assert.isOk(json.access.user.library);
		assert.isOk(json.access.user.files);
		assert.isOk(json.access.user.notes);
		assert.isOk(json.access.user.write);
		assert.isOk(json.access.groups.all.library);
		assert.isOk(json.access.groups.all.write);
		assert.notProperty(json, 'name');
		assert.notProperty(json, 'dateAdded');
		assert.notProperty(json, 'lastUsed');
		assert.notProperty(json, 'recentIPs');
	});

	// Deprecated
	it('testGetKeyInfoWithUser', async function () {
		API.useAPIKey("");
		const response = await API.userGet(
			config.userID,
			'keys/' + config.apiKey
		);
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		assert.equal(config.apiKey, json.key);
		assert.equal(config.userID, json.userID);
		assert.property(json.access, "user");
		assert.property(json.access, "groups");
		assert.isOk(json.access.user.library);
		assert.isOk(json.access.user.files);
		assert.isOk(json.access.user.notes);
		assert.isOk(json.access.user.write);
		assert.isOk(json.access.groups.all.library);
		assert.isOk(json.access.groups.all.write);
	});

	// Private API
	it('testKeyCreateWithEmailAddress', async function () {
		API.useAPIKey("");
		let name = "Test " + Helpers.uniqueID();
		let emails = [config.emailPrimary, config.emailSecondary];
		for (let i = 0; i < emails.length; i++) {
			let email = emails[i];
			let data = JSON.stringify({
				username: email,
				password: config.password,
				name: name,
				access: {
					user: {
						library: true
					}
				}
			});
			let headers = { "Content-Type": "application/json" };
			let options = {};
			let response = await API.post('keys', data, headers, options);
			Helpers.assert201(response);
			let json = API.getJSONFromResponse(response);
			assert.equal(config.userID, json.userID);
			assert.equal(config.username, json.username);
			assert.equal(config.displayName, json.displayName);
			assert.equal(name, json.name);
			assert.deepEqual({ user: { library: true, files: true } }, json.access);
		}
	});

	it('testGetKeyInfoCurrentWithoutHeader', async function () {
		API.useAPIKey('');
		const response = await API.get('keys/current');

		Helpers.assert403(response);
	});

	it('testGetKeys', async function () {
		// No anonymous access
		API.useAPIKey('');
		let response = await API.userGet(
			config.userID,
			'keys'
		);
		Helpers.assert403(response);

		// No access with user's API key
		API.useAPIKey(config.apiKey);
		response = await API.userGet(
			config.userID,
			'keys'
		);
		Helpers.assert403(response);

		// Root access
		response = await API.userGet(
			config.userID,
			'keys',
			{},
			{
				username: config.rootUsername,
				password: config.rootPassword,
			}
		);
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		assert.isArray(json, true);
		assert.isAbove(json.length, 0);
		assert.property(json[0], 'dateAdded');
		assert.property(json[0], 'lastUsed');
		if (config.apiURLPrefix != "http://localhost/") {
			assert.property(json[0], 'recentIPs');
		}
	});

	it('testGetKeyInfoByPath', async function () {
		API.useAPIKey("");
		const response = await API.get('keys/' + config.apiKey);
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		assert.equal(config.apiKey, json.key);
		assert.equal(config.userID, json.userID);
		assert.property(json.access, 'user');
		assert.property(json.access, 'groups');
		assert.isOk(json.access.user.library);
		assert.isOk(json.access.user.files);
		assert.isOk(json.access.user.notes);
		assert.isOk(json.access.user.write);
		assert.isOk(json.access.groups.all.library);
		assert.isOk(json.access.groups.all.write);
		assert.notProperty(json, 'name');
		assert.notProperty(json, 'dateAdded');
		assert.notProperty(json, 'lastUsed');
		assert.notProperty(json, 'recentIPs');
	});
});
