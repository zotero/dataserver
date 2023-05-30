const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp, resetGroups } = require("../shared.js");

describe('NotificationTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
		await resetGroups();
	});

	after(async function () {
		await API3WrapUp();
	});
	beforeEach(async function () {
		API.useAPIKey(config.apiKey);
	});

	it('testModifyItemNotification', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		json.title = 'test';
		let response = await API.userPut(
			config.userID,
			`items/${json.key}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		let version = parseInt(response.headers['last-modified-version'][0]);
		Helpers.assertNotificationCount(1, response);
		Helpers.assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.userID}`,
			version: version
		}, response);
	});

	it('testKeyAddLibraryNotification', async function () {
		API.useAPIKey("");
		const name = "Test " + Helpers.uniqueID();
		const json = {
			name: name,
			access: {
				user: {
					library: true
				}
			}
		};

		const response = await API.superPost(
			'users/' + config.userID + '/keys?showid=1',
			JSON.stringify(json)
		);

		Helpers.assert201(response);
		const jsonFromResponse = API.getJSONFromResponse(response);
		const apiKey = jsonFromResponse.key;
		const apiKeyID = jsonFromResponse.id;

		try {
			json.access.groups = {};
			json.access.groups[config.ownedPrivateGroupID] = {
				library: true,
				write: true
			};

			const response2 = await API.superPut(
				"keys/" + apiKey,
				JSON.stringify(json)
			);
			Helpers.assert200(response2);

			Helpers.assertNotificationCount(1, response2);
			Helpers.assertHasNotification({
				event: 'topicAdded',
				apiKeyID: String(apiKeyID),
				topic: '/groups/' + config.ownedPrivateGroupID
			}, response2);

			await API.superDelete("keys/" + apiKey);
		}
		// Clean up
		finally {
			await API.superDelete("keys/" + apiKey);
		}
	});

	it('testNewItemNotification', async function () {
		const response = await API.createItem("book", false, this, 'response');
		const version = API.getJSONFromResponse(response).successful[0].version;
		Helpers.assertNotificationCount(1, response);
		Helpers.assertHasNotification({
			event: 'topicUpdated',
			topic: '/users/' + config.userID,
			version: version
		}, response);
	});


	it('testKeyCreateNotification', async function () {
		API.useAPIKey("");
		let name = "Test " + Helpers.uniqueID();
		let response = await API.superPost(
			'users/' + config.userID + '/keys',
			JSON.stringify({
				name: name,
				access: { user: { library: true } }
			})
		);
		try {
			Helpers.assertNotificationCount(0, response);
		}
		finally {
			let json = API.getJSONFromResponse(response);
			let key = json.key;
			await API.userDelete(
				config.userID,
				"keys/" + key,
				{ "Content-Type": "application/json" }
			);
		}
	});

	it('testAddDeleteOwnedGroupNotification', async function () {
		API.useAPIKey("");
		const json = await createKeyWithAllGroupAccess(config.userID);
		const apiKey = json.key;

		try {
			const allGroupsKeys = await getKeysWithAllGroupAccess(config.userID);

			const response = await createGroup(config.userID);
			const xml = API.getXMLFromResponse(response);
			const groupID = parseInt(Helpers.xpathEval(xml, "/atom:entry/zapi:groupID"));

			try {
				Helpers.assertNotificationCount(Object.keys(allGroupsKeys).length, response);
				await Promise.all(allGroupsKeys.map(async function (key) {
					const response2 = await API.superGet(`keys/${key}?showid=1`);
					const json2 = await API.getJSONFromResponse(response2);
					Helpers.assertHasNotification({
						event: "topicAdded",
						apiKeyID: String(json2.id),
						topic: `/groups/${groupID}`
					}, response);
				}));
			}
			finally {
				const response = await API.superDelete(`groups/${groupID}`);
				Helpers.assert204(response);
				Helpers.assertNotificationCount(1, response);
				Helpers.assertHasNotification({
					event: "topicDeleted",
					topic: `/groups/${groupID}`
				}, response);
			}
		}
		finally {
			const response = await API.superDelete(`keys/${apiKey}`);
			try {
				Helpers.assert204(response);
			}
			catch (e) {
				console.log(e);
			}
		}
	});

	it('testDeleteItemNotification', async function () {
		let json = await API.createItem("book", false, this, 'json');
		let response = await API.userDelete(
			config.userID,
			`items/${json.key}`,
			{
				"If-Unmodified-Since-Version": json.version
			}
		);
		let version = parseInt(response.headers['last-modified-version'][0]);
		Helpers.assertNotificationCount(1, response);
		Helpers.assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.userID}`,
			version: version
		}, response);
	});

	it('testKeyRemoveLibraryFromAllGroupsNotification', async function () {
		API.useAPIKey("");
		const removedGroup = config.ownedPrivateGroupID;
		const json = await createKeyWithAllGroupAccess(config.userID);
		const apiKey = json.key;
		const apiKeyID = json.id;
		try {
			API.useAPIKey(apiKey);
			const response = await API.userGet(config.userID, 'groups');
			let groupIDs = API.getJSONFromResponse(response).map(group => group.id);
			groupIDs = groupIDs.filter(groupID => groupID !== removedGroup);
			delete json.access.groups.all;
			for (let groupID of groupIDs) {
				json.access.groups[groupID] = {};
				json.access.groups[groupID].library = true;
			}
			API.useAPIKey("");
			const putResponse = await API.superPut(`keys/${apiKey}`, JSON.stringify(json));
			Helpers.assert200(putResponse);
			Helpers.assertNotificationCount(1, putResponse);
			
			Helpers.assertHasNotification({
				event: "topicRemoved",
				apiKeyID: String(apiKeyID),
				topic: `/groups/${removedGroup}`
			}, putResponse);
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
		}
	});

	it('Create and delete group owned by user', async function () {
		// Dummy test function, not related to the code above.
		// Just here so that the class doesn't break the syntax of the original phpunit file
		// and can be tested using mocha/chai
		assert(true);
	});

	async function createKey(userID, access) {
		let name = "Test " + Math.random().toString(36).substring(2);
		let json = {
			name: name,
			access: access
		};
		const response = await API.superPost(
			"users/" + userID + "/keys?showid=1",
			JSON.stringify(json)
		);
		assert.equal(response.status, 201);
		json = await API.getJSONFromResponse(response);
		return json;
	}

	async function createKeyWithAllGroupAccess(userID) {
		return createKey(userID, {
			user: {
				library: true
			},
			groups: {
				all: {
					library: true
				}
			}
		});
	}

	async function createGroup(ownerID) {
		// Create new group owned by another
		let xml = '<group owner="' + ownerID + '" name="Test" type="Private" libraryEditing="admins" libraryReading="members" fileEditing="admins" description="This is a description" url="" hasImage="0"/>';
		const response = await API.superPost(
			'groups',
			xml
		);
		assert.equal(response.status, 201);
		return response;
	}

	async function getKeysWithAllGroupAccess(userID) {
		const response = await API.superGet("users/" + userID + "/keys");
		assert.equal(response.status, 200);
		const json = await API.getJSONFromResponse(response);
		return json.filter(keyObj => keyObj.access.groups.all.library).map(keyObj => keyObj.key);
	}


	it('testAddRemoveGroupMemberNotification', async function () {
		API.useAPIKey("");
		let json = await createKeyWithAllGroupAccess(config.userID);
		let apiKey = json.key;

		try {
			// Get all keys with access to all groups
			let allGroupsKeys = await getKeysWithAllGroupAccess(config.userID);

			// Create group owned by another user
			let response = await createGroup(config.userID2);
			let xml = API.getXMLFromResponse(response);
			let groupID = parseInt(Helpers.xpathEval(xml, "/atom:entry/zapi:groupID"));

			try {
				// Add user to group
				response = await API.superPost(
					"groups/" + groupID + "/users",
					'<user id="' + config.userID + '" role="member"/>',
					{ "Content-Type": "application/xml" }
				);
				Helpers.assert200(response);
				Helpers.assertNotificationCount(Object.keys(allGroupsKeys).length, response);
				for (let key of allGroupsKeys) {
					let response2 = await API.superGet("keys/" + key + "?showid=1");
					let json2 = API.getJSONFromResponse(response2);
					Helpers.assertHasNotification({
						event: 'topicAdded',
						apiKeyID: String(json2.id),
						topic: '/groups/' + groupID
					}, response);
				}

				// Remove user from group
				response = await API.superDelete("groups/" + groupID + "/users/" + config.userID);
				Helpers.assert204(response);
				Helpers.assertNotificationCount(Object.keys(allGroupsKeys).length, response);
				for (let key of allGroupsKeys) {
					let response2 = await API.superGet("keys/" + key + "?showid=1");
					let json2 = API.getJSONFromResponse(response2);
					Helpers.assertHasNotification({
						event: 'topicRemoved',
						apiKeyID: String(json2.id),
						topic: '/groups/' + groupID
					}, response);
				}
			}
			// Delete group
			finally {
				response = await API.superDelete("groups/" + groupID);
				Helpers.assert204(response);
				Helpers.assertNotificationCount(1, response);
				Helpers.assertHasNotification({
					event: 'topicDeleted',
					topic: '/groups/' + groupID
				}, response);
			}
		}
		// Delete key
		finally {
			let response = await API.superDelete("keys/" + apiKey);
			try {
				Helpers.assert204(response);
			}
			catch (e) {
				console.log(e);
			}
		}
	});

	it('testKeyAddAllGroupsToNoneNotification', async function () {
		API.useAPIKey("");
		const json = await createKey(config.userID, {
			userId: config.userId,
			body: {
				user: {
					library: true,
				},
			},
		});
		const apiKey = json.key;
		const apiKeyId = json.id;

		try {
			const response = await API.superGet(`users/${config.userID}/groups`);
			const groupIds = API.getJSONFromResponse(response).map(group => group.id);
			json.access = {};
			json.access.groups = [];
			json.access.groups[0] = { library: true };
			const putResponse = await API.superPut(`keys/${apiKey}`, JSON.stringify(json));
			Helpers.assert200(putResponse);

			Helpers.assertNotificationCount(groupIds.length, putResponse);

			for (const groupID of groupIds) {
				Helpers.assertHasNotification(
					{
						event: "topicAdded",
						apiKeyID: String(apiKeyId),
						topic: `/groups/${groupID}`,
					},
					putResponse
				);
			}
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
		}
	});

	it('testKeyRemoveLibraryNotification', async function () {
		API.useAPIKey("");
		let json = await createKey(config.userID, {
			user: {
				library: true
			},
			groups: {
				[config.ownedPrivateGroupID]: {
					library: true
				}
			}
		});
		const apiKey = json.key;
		const apiKeyID = json.id;

		try {
			delete json.access.groups;
			const response = await API.superPut(
				`keys/${apiKey}`,
				JSON.stringify(json)
			);
			Helpers.assert200(response);

			Helpers.assertNotificationCount(1, response);
			Helpers.assertHasNotification({
				event: 'topicRemoved',
				apiKeyID: String(apiKeyID),
				topic: `/groups/${config.ownedPrivateGroupID}`
			}, response);
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
		}
	});

	/**
	 * Grant access to all groups to an API key that has access to a single group
	 */


	it('testKeyAddAllGroupsToOneNotification', async function () {
		API.useAPIKey('');

		let json = await createKey(config.userID, {
			user: {
				library: true
			},
			groups: {
				[config.ownedPrivateGroupID]: {
					library: true
				}
			}
		});
		let apiKey = json.key;
		let apiKeyID = json.id;

		try {
			// Get list of available groups
			let response = await API.superGet(`users/${config.userID}/groups`);
			let groupIDs = API.getJSONFromResponse(response).map(group => group.id);
			// Remove group that already had access
			groupIDs = groupIDs.filter(groupID => groupID !== config.ownedPrivateGroupID);

			// Add all groups to the key, which should trigger topicAdded for each new group
			// but not the group that was previously accessible
			delete json.access.groups[config.ownedPrivateGroupID];
			json.access.groups.all = {
				library: true
			};
			response = await API.superPut(`keys/${apiKey}`, JSON.stringify(json));
			assert.equal(200, response.status);

			await Helpers.assertNotificationCount(groupIDs.length, response);
			for (let groupID of groupIDs) {
				Helpers.assertHasNotification({
					event: 'topicAdded',
					apiKeyID: String(apiKeyID),
					topic: `/groups/${groupID}`
				}, response);
			}
		}
		// Clean up
		finally {
			await API.superDelete(`keys/${apiKey}`);
		}
	});
});
