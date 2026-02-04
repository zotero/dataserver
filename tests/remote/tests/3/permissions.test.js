/**
 * Permissions API tests
 * Port of tests/remote/tests/API/3/PermissionsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert403,
	assertNumResults,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Permissions', function() {
	this.timeout(30000);

	beforeEach(async function() {
		await setup();
		await API.resetKey(config.get('apiKey'));
		await API.setKeyUserPermission(config.get('apiKey'), 'library', true);
		await API.setKeyUserPermission(config.get('apiKey'), 'notes', true);
		await API.setKeyUserPermission(config.get('apiKey'), 'write', true);
		await API.setKeyGroupPermission(config.get('apiKey'), 0, 'write', true);
	});

	afterEach(async function() {
		await API.resetKey(config.get('apiKey'));
		await API.setKeyUserPermission(config.get('apiKey'), 'library', true);
		await API.setKeyUserPermission(config.get('apiKey'), 'notes', true);
		await API.setKeyUserPermission(config.get('apiKey'), 'write', true);
		await API.setKeyGroupPermission(config.get('apiKey'), 0, 'write', true);
	});

	// PHP: testUserGroupsAnonymousJSON
	it('should list user groups anonymously in JSON', async function() {
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/groups`);
		assert200(response);
		assertTotalResults(response, config.get('numPublicGroups'));

		// Make sure they're the right groups
		let json = API.getJSONFromResponse(response);
		let groupIDs = json.map(data => data.id);
		assert.include(groupIDs, config.get('ownedPublicGroupID'));
		assert.include(groupIDs, config.get('ownedPublicNoAnonymousGroupID'));
	});

	// PHP: testUserGroupsAnonymousAtom
	it('should list user groups anonymously in Atom', async function() {
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/groups?content=json`);
		assert200(response);
		assertTotalResults(response, config.get('numPublicGroups'));

		// Make sure they're the right groups
		let xml = API.getXMLFromResponse(response);
		let groupIDs = xpathSelect(xml, '//atom:entry/zapi:groupID').map(node => parseInt(node.textContent));
		assert.include(groupIDs, config.get('ownedPublicGroupID'));
		assert.include(groupIDs, config.get('ownedPublicNoAnonymousGroupID'));
	});

	// PHP: testUserGroupsOwned
	it('should list owned groups', async function() {
		API.useAPIKey(config.get('apiKey'));
		let response = await API.userGet(config.get('userID'), 'groups');
		assert200(response);
		assertNumResults(response, config.get('numOwnedGroups'));
		assertTotalResults(response, config.get('numOwnedGroups'));
	});

	// PHP: test_should_see_private_group_listed_when_using_key_with_library_read_access
	it('should see private group listed when using key with library read access', async function() {
		await API.resetKey(config.get('apiKey'));
		let response = await API.userGet(config.get('userID'), 'groups');
		assert200(response);
		assertNumResults(response, config.get('numPublicGroups'));

		// Grant key read permission to library
		await API.setKeyGroupPermission(
			config.get('apiKey'),
			config.get('ownedPrivateGroupID'),
			'library',
			true
		);

		response = await API.userGet(config.get('userID'), 'groups');
		assertNumResults(response, config.get('numOwnedGroups'));
		assertTotalResults(response, config.get('numOwnedGroups'));

		let json = API.getJSONFromResponse(response);
		let groupIDs = json.map(data => data.id);
		assert.include(groupIDs, config.get('ownedPrivateGroupID'));
	});

	// PHP: testGroupLibraryReading
	it('should allow reading from group library', async function() {
		// Create item in group
		API.useAPIKey(config.get('apiKey'));
		let key = await API.groupCreateItem(
			config.get('ownedPublicGroupID'),
			'book',
			{ title: 'Test' },
			'key'
		);

		// Read with same key
		let response = await API.groupGet(
			config.get('ownedPublicGroupID'),
			`items/${key}`
		);
		assert200(response);
	});

	// PHP: test_shouldnt_be_able_to_write_to_group_using_key_with_library_read_access
	it("shouldn't be able to write to group using key with library read access", async function() {
		// Set key to read-only
		await API.resetKey(config.get('apiKey'));
		await API.setKeyUserPermission(config.get('apiKey'), 'library', true);
		await API.setKeyGroupPermission(config.get('apiKey'), config.get('ownedPublicGroupID'), 'library', true);

		// Try to create item
		let json = await API.getItemTemplate('book');
		let response = await API.groupPost(
			config.get('ownedPublicGroupID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert403(response);
	});

	// PHP: testKeyNoteAccessWriteError
	it('should handle key note access permissions', async function() {
		await API.userClear(config.get('userID'));

		await API.setKeyUserPermission(config.get('apiKey'), 'notes', true);

		let keys = [];
		let topKeys = [];
		let bookKeys = [];

		// Create items: books and notes
		let key = await API.createItem('book', { title: 'A' }, 'key');
		keys.push(key);
		topKeys.push(key);
		bookKeys.push(key);

		key = await API.createNoteItem('B', false, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createNoteItem('C', false, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createNoteItem('D', false, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createNoteItem('E', false, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createItem('book', { title: 'F' }, 'key');
		keys.push(key);
		topKeys.push(key);
		bookKeys.push(key);

		// Child note (not in topKeys)
		key = await API.createNoteItem('G', key, 'key');
		keys.push(key);

		// Create collection and add items to it
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([{
				name: 'Test',
				parentCollection: false
			}]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let json = API.getJSONFromResponse(response);
		let collectionKey = json.successful[0].key;

		response = await API.userPost(
			config.get('userID'),
			`collections/${collectionKey}/items`,
			topKeys.join(' ')
		);
		assert204(response);

		//
		// With notes permission - should see all items
		//

		// format=atom - Root
		response = await API.userGet(config.get('userID'), 'items');
		assertNumResults(response, keys.length);
		assertTotalResults(response, keys.length);

		// format=atom - Top
		response = await API.userGet(config.get('userID'), 'items/top');
		assertNumResults(response, topKeys.length);
		assertTotalResults(response, topKeys.length);

		// format=atom - Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top`
		);
		assertNumResults(response, topKeys.length);
		assertTotalResults(response, topKeys.length);

		// format=keys - Root
		response = await API.userGet(config.get('userID'), 'items?format=keys');
		assert200(response);
		let keyLines = response.getBody().trim().split('\n');
		assert.equal(keyLines.length, keys.length);

		// format=keys - Top
		response = await API.userGet(config.get('userID'), 'items/top?format=keys');
		assert200(response);
		keyLines = response.getBody().trim().split('\n');
		assert.equal(keyLines.length, topKeys.length);

		// format=keys - Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?format=keys`
		);
		assert200(response);
		keyLines = response.getBody().trim().split('\n');
		assert.equal(keyLines.length, topKeys.length);

		//
		// Remove notes privilege from key - should only see books
		//
		await API.setKeyUserPermission(config.get('apiKey'), 'notes', false);

		// format=json - totalResults with limit
		response = await API.userGet(config.get('userID'), 'items?limit=1');
		assertNumResults(response, 1);
		assertTotalResults(response, bookKeys.length);

		// format=json - without limit
		response = await API.userGet(config.get('userID'), 'items');
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=json - Top
		response = await API.userGet(config.get('userID'), 'items/top');
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=json - Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=atom - totalResults with limit
		response = await API.userGet(config.get('userID'), 'items?format=atom&limit=1');
		assertNumResults(response, 1);
		assertTotalResults(response, bookKeys.length);

		// format=atom - without limit
		response = await API.userGet(config.get('userID'), 'items?format=atom');
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=atom - Top
		response = await API.userGet(config.get('userID'), 'items/top?format=atom');
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=atom - Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items?format=atom`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=keys - should only return book keys
		response = await API.userGet(config.get('userID'), 'items?format=keys');
		let returnedKeys = response.getBody().trim().split('\n').sort();
		let expectedKeys = [...bookKeys].sort();
		assert.deepEqual(returnedKeys, expectedKeys);
	});

	// PHP: testKeyNoteAccess
	it('should handle note access based on key permission', async function() {
		await API.userClear(config.get('userID'));

		await API.setKeyUserPermission(config.get('apiKey'), 'notes', true);

		let keys = [];
		let topKeys = [];
		let bookKeys = [];

		let key = await API.createItem('book', { title: 'A' }, 'key');
		keys.push(key);
		topKeys.push(key);
		bookKeys.push(key);

		key = await API.createNoteItem('B', null, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createNoteItem('C', null, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createNoteItem('D', null, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createNoteItem('E', null, 'key');
		keys.push(key);
		topKeys.push(key);

		key = await API.createItem('book', { title: 'F' }, 'key');
		keys.push(key);
		topKeys.push(key);
		bookKeys.push(key);

		let childNoteKey = await API.createNoteItem('G', key, 'key');
		keys.push(childNoteKey);

		// Create collection and add items to it
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([{
				name: 'Test',
				parentCollection: false
			}]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let collectionKey = API.getFirstSuccessKeyFromResponse(response);

		response = await API.userPost(
			config.get('userID'),
			`collections/${collectionKey}/items`,
			topKeys.join(' ')
		);
		assert204(response);

		// format=atom - Root
		response = await API.userGet(config.get('userID'), 'items');
		assertNumResults(response, keys.length);
		assertTotalResults(response, keys.length);

		// Top
		response = await API.userGet(config.get('userID'), 'items/top');
		assertNumResults(response, topKeys.length);
		assertTotalResults(response, topKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top`
		);
		assertNumResults(response, topKeys.length);
		assertTotalResults(response, topKeys.length);

		// format=keys - Root
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim().split('\n').length, keys.length);

		// Top
		response = await API.userGet(
			config.get('userID'),
			'items/top?format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim().split('\n').length, topKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?format=keys`
		);
		assert200(response);
		assert.equal(response.getBody().trim().split('\n').length, topKeys.length);

		// Remove notes privilege from key
		await API.setKeyUserPermission(config.get('apiKey'), 'notes', false);

		// format=json - totalResults with limit
		response = await API.userGet(config.get('userID'), 'items?limit=1');
		assertNumResults(response, 1);
		assertTotalResults(response, bookKeys.length);

		// And without limit
		response = await API.userGet(config.get('userID'), 'items');
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// Top
		response = await API.userGet(config.get('userID'), 'items/top');
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=atom - totalResults with limit
		response = await API.userGet(
			config.get('userID'),
			'items?format=atom&limit=1'
		);
		assertNumResults(response, 1);
		assertTotalResults(response, bookKeys.length);

		// And without limit
		response = await API.userGet(
			config.get('userID'),
			'items?format=atom'
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// Top
		response = await API.userGet(
			config.get('userID'),
			'items/top?format=atom'
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items?format=atom`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// format=keys
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys'
		);
		let responseKeys = response.getBody().trim().split('\n').sort();
		bookKeys.sort();
		assert.deepEqual(responseKeys, bookKeys);
	});

	// PHP: testTagDeletePermissions
	it('should enforce tag delete permissions', async function() {
		await API.userClear(config.get('userID'));

		await API.createItem('book', {
			tags: [{ tag: 'A' }]
		});

		let libraryVersion = await API.getLibraryVersion();

		// Remove write permission from key
		await API.setKeyUserPermission(config.get('apiKey'), 'write', false);

		// Try to delete tag without write permission
		let response = await API.userDelete(
			config.get('userID'),
			`tags?tag=A&key=${config.get('apiKey')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert403(response);

		// Restore write permission
		await API.setKeyUserPermission(config.get('apiKey'), 'write', true);

		// Now deletion should succeed
		response = await API.userDelete(
			config.get('userID'),
			`tags?tag=A&key=${config.get('apiKey')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);
	});
});
