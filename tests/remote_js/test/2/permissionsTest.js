const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After, resetGroups } = require("../shared.js");

describe('PermissionsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Before();
		await resetGroups();
	});

	after(async function () {
		await API2After();
	});

	it('testUserGroupsAnonymous', async function () {
		const response = await API.get(`users/${config.userID}/groups?content=json`);
		Helpers.assertStatusCode(response, 200);

		const xml = API.getXMLFromResponse(response);
		const groupIDs = Helpers.xpathEval(xml, '//atom:entry/zapi:groupID', false, true);
		assert.include(groupIDs, String(config.ownedPublicGroupID), `Owned public group ID ${config.ownedPublicGroupID} not found`);
		assert.include(groupIDs, String(config.ownedPublicNoAnonymousGroupID), `Owned public no-anonymous group ID ${config.ownedPublicNoAnonymousGroupID} not found`);
		Helpers.assertTotalResults(response, config.numPublicGroups);
	});

	it('testKeyNoteAccessWriteError', async function() {
		this.skip(); //disabled
	});

	it('testUserGroupsOwned', async function () {
		const response = await API.get(
			"users/" + config.userID + "/groups?content=json"
			+ "&key=" + config.apiKey
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

		await API.setKeyOption(
			config.userID, config.apiKey, 'libraryWrite', 0
		);

		let response = await API.userDelete(
			config.userID,
			`tags?tag=A&key=${config.apiKey}`,
		);
		Helpers.assertStatusCode(response, 403);

		await API.setKeyOption(
			config.userID, config.apiKey, 'libraryWrite', 1
		);

		response = await API.userDelete(
			config.userID,
			`tags?tag=A&key=${config.apiKey}`,
			{ 'If-Unmodified-Since-Version': libraryVersion }
		);
		Helpers.assertStatusCode(response, 204);
	});

	it("testKeyNoteAccess", async function () {
		await API.userClear(config.userID);
	
		await API.setKeyOption(
			config.userID, config.apiKey, 'libraryNotes', 1
		);
	
		let keys = [];
		let topLevelKeys = [];
		let bookKeys = [];
	
		const makeNoteItem = async (text) => {
			const xml = await API.createNoteItem(text, false, true);
			const data = await API.parseDataFromAtomEntry(xml);
			keys.push(data.key);
			topLevelKeys.push(data.key);
		};
	
		const makeBookItem = async (title) => {
			let xml = await API.createItem('book', { title: title }, true);
			let data = await API.parseDataFromAtomEntry(xml);
			keys.push(data.key);
			topLevelKeys.push(data.key);
			bookKeys.push(data.key);
			return data.key;
		};
	
		await makeBookItem("A");
	
		await makeNoteItem("<p>B</p>");
		await makeNoteItem("<p>C</p>");
		await makeNoteItem("<p>D</p>");
		await makeNoteItem("<p>E</p>");
	
		const lastKey = await makeBookItem("F");
	
		let xml = await API.createNoteItem("<p>G</p>", lastKey, true);
		let data = await API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
	
		// Create collection and add items to it
		let response = await API.userPost(
			config.userID,
			"collections?key=" + config.apiKey,
			JSON.stringify({
				collections: [
					{
						name: "Test",
						parentCollection: false
					}
				]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
		let collectionKey = API.getFirstSuccessKeyFromResponse(response);
	
		response = await API.userPost(
			config.userID,
			`collections/${collectionKey}/items?key=` + config.apiKey,
			topLevelKeys.join(" ")
		);
		Helpers.assertStatusCode(response, 204);
	
		//
		// format=atom
		//
		// Root
		response = await API.userGet(
			config.userID, "items?key=" + config.apiKey
		);
		Helpers.assertNumResults(response, keys.length);
		Helpers.assertTotalResults(response, keys.length);
	
		// Top
		response = await API.userGet(
			config.userID, "items/top?key=" + config.apiKey
		);
		Helpers.assertNumResults(response, topLevelKeys.length);
		Helpers.assertTotalResults(response, topLevelKeys.length);
	
		// Collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items/top?key=" + config.apiKey
		);
		Helpers.assertNumResults(response, topLevelKeys.length);
		Helpers.assertTotalResults(response, topLevelKeys.length);
	
		//
		// format=keys
		//
		// Root
		response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey + "&format=keys"
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.data.trim().split("\n").length, keys.length);
	
		// Top
		response = await API.userGet(
			config.userID,
			"items/top?key=" + config.apiKey + "&format=keys"
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.data.trim().split("\n").length, topLevelKeys.length);
	
		// Collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items/top?key=" + config.apiKey + "&format=keys"
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.data.trim().split("\n").length, topLevelKeys.length);
	
		// Remove notes privilege from key
		await API.setKeyOption(
			config.userID, config.apiKey, 'libraryNotes', 0
		);
		//
		// format=atom
		//
		// totalResults with limit
		response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey + "&limit=1"
		);
		Helpers.assertNumResults(response, 1);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		// And without limit
		response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		// Top
		response = await API.userGet(
			config.userID,
			"items/top?key=" + config.apiKey
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		// Collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items?key=" + config.apiKey
		);
		Helpers.assertNumResults(response, bookKeys.length);
		Helpers.assertTotalResults(response, bookKeys.length);
	
		//
		// format=keys
		//
		response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey + "&format=keys"
		);
		keys = response.data.trim().split("\n");
		keys.sort();
		bookKeys.sort();
		assert.deepEqual(bookKeys, keys);
	});
});
