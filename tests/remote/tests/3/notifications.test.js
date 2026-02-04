/**
 * Notifications API tests
 * Port of tests/remote/tests/API/3/NotificationsTest.php
 *
 * @group sns
 *
 * Note: These tests require SNS (Simple Notification Service) infrastructure
 * and group configuration to be available
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert201,
	assert204
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Notifications', function() {
	this.timeout(60000);


	beforeEach(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
	});

	// Helper function to count notifications in response
	function assertCountNotifications(expectedCount, response) {
		let notificationHeader = 'zotero-debug-notifications';
		let header = response.getHeader(notificationHeader);

		if (expectedCount === 0) {
			assert.isNull(header, 'Expected no notification header');
		}
		else {
			assert.isNotNull(header, 'Expected notification header to be present');
			// Header contains a Base64-encoded array of encoded JSON notifications
			let notifications = JSON.parse(Buffer.from(header, 'base64').toString());
			assert.equal(notifications.length, expectedCount,
				`Expected ${expectedCount} notifications, got ${notifications.length}: ${Buffer.from(header, 'base64').toString()}`);
		}
	}

	// Helper function to check for specific notification
	function assertHasNotification(expectedNotification, response) {
		let notificationHeader = 'zotero-debug-notifications';
		let header = response.getHeader(notificationHeader);
		assert.isNotNull(header, 'Expected notification header to be present');

		// Header contains a Base64-encoded array of encoded JSON notifications
		let notifications = JSON.parse(Buffer.from(header, 'base64').toString());
		let decodedNotifications = notifications.map(n => JSON.parse(n));

		// Check if expected notification is in the array
		let found = decodedNotifications.some(notification => {
			return Object.keys(expectedNotification).every(key => {
				// Use loose equality (==) to handle string/number conversions
				return notification[key] == expectedNotification[key];
			});
		});

		assert.isTrue(found,
			`Expected notification not found: ${JSON.stringify(expectedNotification)}\nActual: ${Buffer.from(header, 'base64').toString()}`);
	}

	// PHP: testNewItemNotification
	it('should send notification for new item', async function() {
		let response = await API.createItem('book', {}, 'response');
		let version = API.getJSONFromResponse(response).successful[0].version;
		assertCountNotifications(1, response);
		assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.get('userID')}`,
			version: version
		}, response);
	});

	// PHP: testModifyItemNotification
	it('should send notification for modified item', async function() {
		let json = await API.createItem('book', {}, 'jsonData');
		json.title = 'test';
		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json)
		);
		let version = parseInt(response.getHeader('Last-Modified-Version'));
		assertCountNotifications(1, response);
		assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.get('userID')}`,
			version: version
		}, response);
	});

	// PHP: testDeleteItemNotification
	it('should send notification for deleted item', async function() {
		let json = await API.createItem('book', {}, 'json');
		let response = await API.userDelete(
			config.get('userID'),
			`items/${json.key}`,
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		let version = parseInt(response.getHeader('Last-Modified-Version'));
		assertCountNotifications(1, response);
		assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.get('userID')}`,
			version: version
		}, response);
	});

	// PHP: testKeyCreateNotification
	it('should not send notification when creating key', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let name = 'Test ' + Date.now();
		let response = await API.superPost(
			`users/${config.get('userID')}/keys`,
			JSON.stringify({
				name: name,
				access: {
					user: {
						library: true
					}
				}
			})
		);

		try {
			// No notification when creating a new key
			assertCountNotifications(0, response);
		}
		finally {
			// Clean up
			let json = API.getJSONFromResponse(response);
			let key = json.key;
			await API.superDelete(`keys/${key}`);
			// Restore original API key
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testKeyAddLibraryNotification
	it('should send notification when adding library to key', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let name = 'Test ' + Date.now();
		let json = {
			name: name,
			access: {
				user: {
					library: true
				}
			}
		};

		let response = await API.superPost(
			`users/${config.get('userID')}/keys?showid=1`,
			JSON.stringify(json)
		);
		assert201(response);

		try {
			json = API.getJSONFromResponse(response);
			let apiKey = json.key;
			let apiKeyID = json.id;

			// Add a group to the key, which should trigger topicAdded
			json.access.groups = {};
			json.access.groups[config.get('ownedPrivateGroupID')] = {
				library: true,
				write: true
			};
			response = await API.superPut(
				`keys/${apiKey}`,
				JSON.stringify(json)
			);
			assert200(response);

			assertCountNotifications(1, response);
			assertHasNotification({
				event: 'topicAdded',
				apiKeyID: apiKeyID,
				topic: `/groups/${config.get('ownedPrivateGroupID')}`
			}, response);
		}
		finally {
			await API.superDelete(`keys/${json.key}`);
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testKeyRemoveLibraryNotification
	it('should send notification when removing library from key', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let json = await createKey(config.get('userID'), {
			user: {
				library: true
			},
			groups: {
				[config.get('ownedPrivateGroupID')]: {
					library: true
				}
			}
		});
		let apiKey = json.key;
		let apiKeyID = json.id; // Convert to string to match notification format

		try {
			// Remove group from the key, which should trigger topicRemoved
			delete json.access.groups;
			let response = await API.superPut(
				`keys/${apiKey}`,
				JSON.stringify(json)
			);
			assert200(response);

			assertCountNotifications(1, response);
			assertHasNotification({
				event: 'topicRemoved',
				apiKeyID: apiKeyID,
				topic: `/groups/${config.get('ownedPrivateGroupID')}`
			}, response);
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testKeyAddAllGroupsToNoneNotification
	it('should send notification when adding all groups to key with none', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let json = await createKey(config.get('userID'), {
			user: {
				library: true
			}
		});
		let apiKey = json.key;
		let apiKeyID = json.id;

		try {
			// Get list of available groups
			let response = await API.superGet(`users/${config.get('userID')}/groups`);
			let groupIDs = API.getJSONFromResponse(response).map(group => group.id);

			// Add all groups to the key, which should trigger topicAdded for each group
			json.access.groups = {
				'all': {
					library: true
				}
			};
			response = await API.superPut(
				`keys/${apiKey}`,
				JSON.stringify(json)
			);
			assert200(response);

			assertCountNotifications(groupIDs.length, response);
			for (let groupID of groupIDs) {
				assertHasNotification({
					event: 'topicAdded',
					apiKeyID: apiKeyID,
					topic: `/groups/${groupID}`
				}, response);
			}
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testKeyAddAllGroupsToOneNotification
	it('should send notification when adding all groups to key with one', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let json = await createKey(config.get('userID'), {
			user: {
				library: true
			},
			groups: {
				[config.get('ownedPrivateGroupID')]: {
					library: true
				}
			}
		});
		let apiKey = json.key;
		let apiKeyID = json.id;

		try {
			// Get list of available groups
			let response = await API.superGet(`users/${config.get('userID')}/groups`);
			let groupIDs = API.getJSONFromResponse(response).map(group => group.id);
			// Remove group that already had access
			groupIDs = groupIDs.filter(id => id !== config.get('ownedPrivateGroupID'));

			// Add all groups to the key
			delete json.access.groups[config.get('ownedPrivateGroupID')];
			json.access.groups['all'] = {
				library: true
			};
			response = await API.superPut(
				`keys/${apiKey}`,
				JSON.stringify(json)
			);
			assert200(response);

			assertCountNotifications(groupIDs.length, response);
			for (let groupID of groupIDs) {
				assertHasNotification({
					event: 'topicAdded',
					apiKeyID: apiKeyID,
					topic: `/groups/${groupID}`
				}, response);
			}
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testKeyRemoveLibraryFromAllGroupsNotification
	it('should send notification when removing library from key with all groups', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let removedGroup = config.get('ownedPrivateGroupID');

		let json = await createKeyWithAllGroupAccess(config.get('userID'));
		let apiKey = json.key;
		let apiKeyID = json.id;

		try {
			// Get list of available groups
			API.useAPIKey(apiKey);
			let response = await API.userGet(
				config.get('userID'),
				'groups'
			);
			let groupIDs = API.getJSONFromResponse(response).map(group => group.id);

			// Remove one group, and replace access array with new set
			groupIDs = groupIDs.filter(id => id !== removedGroup);
			delete json.access.groups['all'];
			for (let groupID of groupIDs) {
				json.access.groups[groupID] = { library: true };
			}

			// Post new JSON, which should trigger topicRemoved for the removed group
			API.useAPIKey('');
			response = await API.superPut(
				`keys/${apiKey}`,
				JSON.stringify(json)
			);
			assert200(response);

			assertCountNotifications(1, response);
			assertHasNotification({
				event: 'topicRemoved',
				apiKeyID: apiKeyID,
				topic: `/groups/${removedGroup}`
			}, response);
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testAddDeleteOwnedGroupNotification
	it('should send notification when adding and deleting owned group', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let json = await createKeyWithAllGroupAccess(config.get('userID'));
		let apiKey = json.key;

		try {
			let allGroupsKeys = await getKeysWithAllGroupAccess(config.get('userID'));

			// Create new group owned by user
			let response = await createGroup(config.get('userID'));
			let xml = API.getXMLFromResponse(response);
			let groupID = parseInt(xpathSelect(xml, '//atom:entry/zapi:groupID')[0].textContent);

			try {
				assertCountNotifications(allGroupsKeys.length, response);
				for (let key of allGroupsKeys) {
					let response2 = await API.superGet(`keys/${key}?showid=1`);
					let json2 = API.getJSONFromResponse(response2);
					assertHasNotification({
						event: 'topicAdded',
						apiKeyID: json2.id,
						topic: `/groups/${groupID}`
					}, response);
				}
			}
			finally {
				// Delete group
				response = await API.superDelete(`groups/${groupID}`);
				assert204(response);
				assertCountNotifications(1, response);
				assertHasNotification({
					event: 'topicDeleted',
					topic: `/groups/${groupID}`
				}, response);
			}
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
			API.useAPIKey(originalKey);
		}
	});

	// PHP: testAddRemoveGroupMemberNotification
	it('should send notification when adding and removing group member', async function() {
		let originalKey = config.get('apiKey');
		API.useAPIKey('');

		let json = await createKeyWithAllGroupAccess(config.get('userID'));
		let apiKey = json.key;

		try {
			// Get all keys with access to all groups
			let allGroupsKeys = await getKeysWithAllGroupAccess(config.get('userID'));

			// Create group owned by another user
			let response = await createGroup(config.get('userID2'));
			let xml = API.getXMLFromResponse(response);
			let groupID = parseInt(xpathSelect(xml, '//atom:entry/zapi:groupID')[0].textContent);

			try {
				// Add user to group
				response = await API.superPost(
					`groups/${groupID}/users`,
					`<user id="${config.get('userID')}" role="member"/>`,
					['Content-Type: text/xml']
				);
				assert200(response);
				assertCountNotifications(allGroupsKeys.length, response);
				for (let key of allGroupsKeys) {
					let response2 = await API.superGet(`keys/${key}?showid=1`);
					let json2 = API.getJSONFromResponse(response2);
					assertHasNotification({
						event: 'topicAdded',
						apiKeyID: json2.id,
						topic: `/groups/${groupID}`
					}, response);
				}

				// Remove user from group
				response = await API.superDelete(`groups/${groupID}/users/${config.get('userID')}`);
				assert204(response);
				assertCountNotifications(allGroupsKeys.length, response);
				for (let key of allGroupsKeys) {
					let response2 = await API.superGet(`keys/${key}?showid=1`);
					let json2 = API.getJSONFromResponse(response2);
					assertHasNotification({
						event: 'topicRemoved',
						apiKeyID: json2.id,
						topic: `/groups/${groupID}`
					}, response);
				}
			}
			finally {
				// Delete group
				response = await API.superDelete(`groups/${groupID}`);
				assert204(response);
				assertCountNotifications(1, response);
				assertHasNotification({
					event: 'topicDeleted',
					topic: `/groups/${groupID}`
				}, response);
			}
		}
		finally {
			await API.superDelete(`keys/${apiKey}`);
			API.useAPIKey(originalKey);
		}
	});

	// Helper functions
	async function createKey(userID, access) {
		let name = 'Test ' + Date.now();
		let json = {
			name: name,
			access: access
		};
		let response = await API.superPost(
			`users/${userID}/keys?showid=1`,
			JSON.stringify(json)
		);
		assert201(response);
		json = API.getJSONFromResponse(response);
		return json;
	}

	async function createKeyWithAllGroupAccess(userID) {
		return await createKey(userID, {
			user: {
				library: true
			},
			groups: {
				'all': {
					library: true
				}
			}
		});
	}

	async function createGroup(ownerID) {
		let xml = '<group';
		xml += ` owner="${ownerID}"`;
		xml += ' name="Test"';
		xml += ' type="Private"';
		xml += ' libraryEditing="admins"';
		xml += ' libraryReading="members"';
		xml += ' fileEditing="admins"';
		xml += ' description="This is a description"';
		xml += ' url=""';
		xml += ' hasImage="0"';
		xml += '/>';

		let response = await API.superPost('groups', xml, ['Content-Type: text/xml']);
		assert201(response);
		return response;
	}

	async function getKeysWithAllGroupAccess(userID) {
		let response = await API.superGet(`users/${userID}/keys`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		return json
			.filter(keyObj => keyObj.access?.groups?.all?.library === true)
			.map(keyObj => keyObj.key);
	}
});
