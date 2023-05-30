const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp, resetGroups } = require("../shared.js");

describe('PermissionsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	beforeEach(async function () {
		await resetGroups();
		await API.resetKey(config.apiKey);
		API.useAPIKey(config.apiKey);
		await API.setKeyUserPermission(config.apiKey, 'library', true);
		await API.setKeyUserPermission(config.apiKey, 'write', true);
		await API.setKeyGroupPermission(config.apiKey, 0, 'write', true);
	});

	it('testUserGroupsAnonymousJSON', async function () {
		API.useAPIKey(false);
		const response = await API.get(`users/${config.userID}/groups`);
		Helpers.assertStatusCode(response, 200);

		const json = API.getJSONFromResponse(response);
		const groupIDs = json.map(obj => String(obj.id));
		assert.include(groupIDs, String(config.ownedPublicGroupID), `Owned public group ID ${config.ownedPublicGroupID} not found`);
		assert.include(groupIDs, String(config.ownedPublicNoAnonymousGroupID), `Owned public no-anonymous group ID ${config.ownedPublicNoAnonymousGroupID} not found`);
		Helpers.assertTotalResults(response, config.numPublicGroups);
	});

	it('testUserGroupsAnonymousAtom', async function () {
		API.useAPIKey(false);
		const response = await API.get(`users/${config.userID}/groups?content=json`);
		Helpers.assertStatusCode(response, 200);

		const xml = API.getXMLFromResponse(response);
		const groupIDs = Helpers.xpathEval(xml, '//atom:entry/zapi:groupID', false, true);
		assert.include(groupIDs, String(config.ownedPublicGroupID), `Owned public group ID ${config.ownedPublicGroupID} not found`);
		assert.include(groupIDs, String(config.ownedPublicNoAnonymousGroupID), `Owned public no-anonymous group ID ${config.ownedPublicNoAnonymousGroupID} not found`);
		Helpers.assertTotalResults(response, config.numPublicGroups);
	});

	it('testKeyNoteAccessWriteError', async function () {
		this.skip(); //disabled
	});

	it('testUserGroupsOwned', async function () {
		API.useAPIKey(config.apiKey);
		const response = await API.get(
			"users/" + config.userID + "/groups"
		);
		Helpers.assertStatusCode(response, 200);
	
		Helpers.assertTotalResults(response, config.numOwnedGroups);
		Helpers.assertNumResults(response, config.numOwnedGroups);
	});

	it('testTagDeletePermissions', async function () {
		await API.userClear(config.userID);

		await API.createItem('book', {
			tags: [{ tag: 'A' }]
		}, true);

		const libraryVersion = await API.getLibraryVersion();

		await API.setKeyUserPermission(
			config.apiKey, 'write', false
		);

		let response = await API.userDelete(
			config.userID,
			`tags?tag=A&key=${config.apiKey}`,
		);
		Helpers.assertStatusCode(response, 403);

		await API.setKeyUserPermission(
			config.apiKey, 'write', true
		);

		response = await API.userDelete(
			config.userID,
			`tags?tag=A&key=${config.apiKey}`,
			{ 'If-Unmodified-Since-Version': libraryVersion }
		);
		Helpers.assertStatusCode(response, 204);
	});

	it('test_should_see_private_group_listed_when_using_key_with_library_read_access', async function () {
		await API.resetKey(config.apiKey);
		let response = await API.userGet(config.userID, "groups");
		Helpers.assert200(response);
		Helpers.assertNumResults(response, config.numPublicGroups);
	
		// Grant key read permission to library
		await API.setKeyGroupPermission(
			config.apiKey,
			config.ownedPrivateGroupID,
			'library',
			true
		);
	
		response = await API.userGet(config.userID, "groups");
		Helpers.assertNumResults(response, config.numOwnedGroups);
		Helpers.assertTotalResults(response, config.numOwnedGroups);
	
		const json = API.getJSONFromResponse(response);
		const groupIDs = json.map(data => data.id);
		assert.include(groupIDs, config.ownedPrivateGroupID);
	});
	

	it('testGroupLibraryReading', async function () {
		const groupID = config.ownedPublicNoAnonymousGroupID;
		await API.groupClear(groupID);
		
		await API.groupCreateItem(
			groupID,
			'book',
			{
				title: "Test"
			},
			true
		);
		
		try {
			await API.useAPIKey(config.apiKey);
			let response = await API.groupGet(groupID, "items");
			Helpers.assert200(response);
			Helpers.assertNumResults(response, 1);
			
			// An anonymous request should fail, because libraryReading is members
			await API.useAPIKey(false);
			response = await API.groupGet(groupID, "items");
			Helpers.assert403(response);
		}
		finally {
			await API.groupClear(groupID);
		}
	});
	

	it('test_shouldnt_be_able_to_write_to_group_using_key_with_library_read_access', async function () {
		await API.resetKey(config.apiKey);
		
		// Grant key read (not write) permission to library
		await API.setKeyGroupPermission(
			config.apiKey,
			config.ownedPrivateGroupID,
			'library',
			true
		);
		
		let response = await API.get("items/new?itemType=book");
		let json = JSON.parse(response.data);
		
		response = await API.groupPost(
			config.ownedPrivateGroupID,
			"items",
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert403(response);
	});
	

	it('testKeyNoteAccess', async function () {
		await API.userClear(config.userID);
		
		await API.setKeyUserPermission(config.apiKey, 'notes', true);
	
		let keys = [];
		let topLevelKeys = [];
		let bookKeys = [];
	
		const makeNoteItem = async (text) => {
			const key = await API.createNoteItem(text, false, true, 'key');
			keys.push(key);
			topLevelKeys.push(key);
		};
	
		const makeBookItem = async (title) => {
			let key = await API.createItem('book', { title: title }, true, 'key');
			keys.push(key);
			topLevelKeys.push(key);
			bookKeys.push(key);
			return key;
		};
	
		await makeBookItem("A");
	
		await makeNoteItem("B");
		await makeNoteItem("C");
		await makeNoteItem("D");
		await makeNoteItem("E");
	
		const lastKey = await makeBookItem("F");
	
		let key = await API.createNoteItem("G", lastKey, true, 'key');
		keys.push(key);
	
		// Create collection and add items to it
		let response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([
				{
					name: "Test",
					parentCollection: false
				}
			]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
		let collectionKey = API.getFirstSuccessKeyFromResponse(response);
	
		response = await API.userPost(
			config.userID,
			`collections/${collectionKey}/items`,
			topLevelKeys.join(" ")
		);
		Helpers.assertStatusCode(response, 204);
	
		//
		// format=atom
		//
		// Root
		response = await API.userGet(
			config.userID, "items"
		);
		Helpers.assertNumResults(response, keys.length);
		Helpers.assertTotalResults(response, keys.length);
	
		// Top
		response = await API.userGet(
			config.userID, "items/top"
		);
		Helpers.assertNumResults(response, topLevelKeys.length);
		Helpers.assertTotalResults(response, topLevelKeys.length);
	
		// Collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items/top"
		);
		Helpers.assertNumResults(response, topLevelKeys.length);
		Helpers.assertTotalResults(response, topLevelKeys.length);
	
		//
		// format=keys
		//
		// Root
		response = await API.userGet(
			config.userID,
			"items?format=keys"
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.data.trim().split("\n").length, keys.length);
	
		// Top
		response = await API.userGet(
			config.userID,
			"items/top?format=keys"
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.data.trim().split("\n").length, topLevelKeys.length);
	
		// Collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items/top?format=keys"
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.data.trim().split("\n").length, topLevelKeys.length);
	
		// Remove notes privilege from key
		await API.setKeyUserPermission(config.apiKey, "notes", false);
		//
		// format=json
		//
		// totalResults with limit
		response = await API.userGet(
			config.userID,
			"items?limit=1"
		);
		Helpers.assertNumResults(response, 1);
		Helpers.assertTotalResults(response, bookKeys.length);
		
		// And without limit
		response = await API.userGet(
			config.userID,
			"items"
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
		
		// Top
		response = await API.userGet(
			config.userID,
			"items/top"
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
		
		// Collection
		response = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items`
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
		
		//
		// format=atom
		//
		// totalResults with limit
		response = await API.userGet(
			config.userID,
			"items?limit=1"
		);
		Helpers.assertNumResults(response, 1);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		// And without limit
		response = await API.userGet(
			config.userID,
			"items"
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		// Top
		response = await API.userGet(
			config.userID,
			"items/top"
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		// Collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items"
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		//
		// format=keys
		//
		response = await API.userGet(
			config.userID,
			"items?format=keys"
		);
		keys = response.data.trim().split("\n");
		keys.sort();
		bookKeys.sort();
		assert.deepEqual(bookKeys, keys);
	});
});
