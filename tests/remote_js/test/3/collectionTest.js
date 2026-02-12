const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('CollectionTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});

	this.beforeEach(async function () {
		await API.userClear(config.userID);
	});

	const testNewCollection = async () => {
		const name = "Test Collection";
		const json = await API.createCollection(name, false, true, 'json');
		assert.equal(json.data.name, name);
		return json.key;
	};


	it('testNewSubcollection', async function () {
		let parent = await testNewCollection();
		let name = "Test Subcollection";

		let json = await API.createCollection(name, parent, this, 'json');
		Helpers.assertEquals(name, json.data.name);
		Helpers.assertEquals(parent, json.data.parentCollection);

		let response = await API.userGet(
			config.userID,
			"collections/" + parent
		);
		Helpers.assert200(response);
		let jsonResponse = API.getJSONFromResponse(response);
		Helpers.assertEquals(jsonResponse.meta.numCollections, 1);
	});

	// MySQL FK cascade limit is 15, so 15 would prevent deleting all collections with just the
	// libraryID
	it('test_should_delete_collection_with_14_levels_below_it', async function () {
		let json = await API.createCollection("0", false, this, 'json');
		let topCollectionKey = json.key;
		let parentCollectionKey = topCollectionKey;
		for (let i = 0; i < 14; i++) {
			json = await API.createCollection(`${i}`, parentCollectionKey, this, 'json');
			parentCollectionKey = json.key;
		}
		const response = await API.userDelete(
			config.userID,
			"collections?collectionKey=" + topCollectionKey,
			{
				"If-Unmodified-Since-Version": `${json.version}`
			}
		);
		Helpers.assert204(response);
	});

	it('testCollectionChildItemError', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');

		let key = await API.createItem("book", [], this, 'key');
		let json = await API.createNoteItem("Test Note", key, this, 'jsonData');
		json.collections = [collectionKey];

		let response = await API.userPut(
			config.userID,
			`items/${json.key}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400(response);
		Helpers.assertEquals("Child items cannot be assigned to collections", response.data);
	});

	it('test_should_convert_child_attachent_with_embedded_note_in_collection_to_standalone_attachment_while_changing_note', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		let key = await API.createItem("book", { collections: [collectionKey] }, this, 'key');
		let json = await API.createAttachmentItem("linked_url", { note: "Foo" }, key, this, 'jsonData');
		json = {
			key: json.key,
			version: json.version,
			note: "",
			collections: [collectionKey],
			parentItem: false
		};
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0];
		assert.equal(json.data.note, "");
		assert.deepEqual([collectionKey], json.data.collections);
	});

	it('testCollectionItems', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');

		let json = await API.createItem("book", { collections: [collectionKey] }, this, 'jsonData');
		let itemKey1 = json.key;
		assert.deepEqual([collectionKey], json.collections);

		json = await API.createItem("journalArticle", { collections: [collectionKey] }, this, 'jsonData');
		let itemKey2 = json.key;
		assert.deepEqual([collectionKey], json.collections);

		let childItemKey1 = await API.createAttachmentItem("linked_url", {}, itemKey1, this, 'key');
		let childItemKey2 = await API.createAttachmentItem("linked_url", {}, itemKey2, this, 'key');

		let response = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items?format=keys`
		);
		Helpers.assert200(response);
		let keys = response.data.trim().split("\n");
		assert.lengthOf(keys, 4);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
		assert.include(keys, childItemKey1);
		assert.include(keys, childItemKey2);

		response = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items/top?format=keys`
		);
		Helpers.assert200(response);
		keys = response.data.trim().split("\n");
		assert.lengthOf(keys, 2);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
	});


	it('test_should_allow_emoji_in_name', async function () {
		let name = "🐶";
		let json = await API.createCollection(name, false, this, 'json');
		assert.equal(name, json.data.name);
	});

	it('testCreateKeyedCollections', async function () {
		let key1 = Helpers.uniqueID();
		let name1 = "Test Collection 2";
		let name2 = "Test Subcollection";

		let json = [
			{
				key: key1,
				version: 0,
				name: name1
			},
			{
				name: name2,
				parentCollection: key1
			}
		];

		let response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
		let libraryVersion = response.headers['last-modified-version'][0];
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 2);

		// Check data in write response
		Helpers.assertEquals(json.successful[0].key, json.successful[0].data.key);
		Helpers.assertEquals(json.successful[1].key, json.successful[1].data.key);
		Helpers.assertEquals(libraryVersion, json.successful[0].version);
		Helpers.assertEquals(libraryVersion, json.successful[1].version);
		Helpers.assertEquals(libraryVersion, json.successful[0].data.version);
		Helpers.assertEquals(libraryVersion, json.successful[1].data.version);
		Helpers.assertEquals(name1, json.successful[0].data.name);
		Helpers.assertEquals(name2, json.successful[1].data.name);
		assert.notOk(json.successful[0].data.parentCollection);
		Helpers.assertEquals(key1, json.successful[1].data.parentCollection);

		// Check in separate request, to be safe
		let keys = Object.keys(json.successful).map(k => json.successful[k].key);
		response = await API.getCollectionResponse(keys);
		Helpers.assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(name1, json[0].data.name);
		assert.notOk(json[0].data.parentCollection);
		Helpers.assertEquals(name2, json[1].data.name);
		Helpers.assertEquals(key1, json[1].data.parentCollection);
	});

	it('testUpdateMultipleCollections', async function () {
		let collection1Data = await API.createCollection("Test 1", false, this, 'jsonData');
		let collection2Name = "Test 2";
		let collection2Data = await API.createCollection(collection2Name, false, this, 'jsonData');

		let libraryVersion = await API.getLibraryVersion();

		// Update with no change, which should still update library version (for now)
		let response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([
				collection1Data,
				collection2Data
			]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert200(response);
		// If this behavior changes, remove the pre-increment
		Helpers.assertEquals(++libraryVersion, response.headers['last-modified-version'][0]);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.unchanged), 2);

		Helpers.assertEquals(libraryVersion, await API.getLibraryVersion());

		// Update
		let collection1NewName = "Test 1 Modified";
		let collection2NewParentKey = await API.createCollection("Test 3", false, this, 'key');

		response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([
				{
					key: collection1Data.key,
					version: collection1Data.version,
					name: collection1NewName
				},
				{
					key: collection2Data.key,
					version: collection2Data.version,
					parentCollection: collection2NewParentKey
				}
			]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert200(response);
		libraryVersion = response.headers['last-modified-version'][0];
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 2);
		// Deprecated
		assert.lengthOf(Object.keys(json.success), 2);

		// Check data in write response
		Helpers.assertEquals(json.successful[0].key, json.successful[0].data.key);
		Helpers.assertEquals(json.successful[1].key, json.successful[1].data.key);
		Helpers.assertEquals(libraryVersion, json.successful[0].version);
		Helpers.assertEquals(libraryVersion, json.successful[1].version);
		Helpers.assertEquals(libraryVersion, json.successful[0].data.version);
		Helpers.assertEquals(libraryVersion, json.successful[1].data.version);
		Helpers.assertEquals(collection1NewName, json.successful[0].data.name);
		Helpers.assertEquals(collection2Name, json.successful[1].data.name);
		assert.notOk(json.successful[0].data.parentCollection);
		Helpers.assertEquals(collection2NewParentKey, json.successful[1].data.parentCollection);

		// Check in separate request, to be safe
		let keys = Object.keys(json.successful).map(k => json.successful[k].key);

		response = await API.getCollectionResponse(keys);
		Helpers.assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		// POST follows PATCH behavior, so unspecified values shouldn't change
		Helpers.assertEquals(collection1NewName, json[0].data.name);
		assert.notOk(json[0].data.parentCollection);
		Helpers.assertEquals(collection2Name, json[1].data.name);
		Helpers.assertEquals(collection2NewParentKey, json[1].data.parentCollection);
	});

	it('testCollectionItemChange', async function () {
		let collectionKey1 = await API.createCollection('Test', false, this, 'key');
		let collectionKey2 = await API.createCollection('Test', false, this, 'key');

		let json = await API.createItem("book", {
			collections: [collectionKey1]
		}, this, 'json');
		let itemKey1 = json.key;
		let itemVersion1 = json.version;
		assert.deepEqual([collectionKey1], json.data.collections);

		json = await API.createItem("journalArticle", {
			collections: [collectionKey2]
		}, this, 'json');
		let itemKey2 = json.key;
		let itemVersion2 = json.version;
		assert.deepEqual([collectionKey2], json.data.collections);

		json = await API.getCollection(collectionKey1, this);
		assert.deepEqual(1, json.meta.numItems);

		json = await API.getCollection(collectionKey2, this);
		Helpers.assertEquals(1, json.meta.numItems);
		let collectionData2 = json.data;

		let libraryVersion = await API.getLibraryVersion();

		// Add items to collection
		let response = await API.userPatch(
			config.userID,
			`items/${itemKey1}`,
			JSON.stringify({
				collections: [collectionKey1, collectionKey2]
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion1
			}
		);
		Helpers.assert204(response);

		// Item version should change
		json = await API.getItem(itemKey1, this);
		Helpers.assertEquals(parseInt(libraryVersion) + 1, parseInt(json.version));

		// Collection timestamp shouldn't change, but numItems should
		json = await API.getCollection(collectionKey2, this);
		Helpers.assertEquals(2, json.meta.numItems);
		Helpers.assertEquals(collectionData2.version, json.version);
		collectionData2 = json.data;

		libraryVersion = await API.getLibraryVersion();

		// Remove collections
		response = await API.userPatch(
			config.userID,
			`items/${itemKey2}`,
			JSON.stringify({
				collections: []
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion2
			}
		);
		Helpers.assert204(response);

		// Item version should change
		json = await API.getItem(itemKey2, this);
		assert.equal(parseInt(libraryVersion) + 1, json.version);

		// Collection timestamp shouldn't change, but numItems should
		json = await API.getCollection(collectionKey2, this);
		assert.equal(json.meta.numItems, 1);
		assert.equal(collectionData2.version, json.version);

		// Check collections arrays and numItems
		json = await API.getItem(itemKey1, this);
		assert.lengthOf(json.data.collections, 2);
		assert.include(json.data.collections, collectionKey1);
		assert.include(json.data.collections, collectionKey2);

		json = await API.getItem(itemKey2, this);
		assert.lengthOf(json.data.collections, 0);

		json = await API.getCollection(collectionKey1, this);
		assert.equal(json.meta.numItems, 1);

		json = await API.getCollection(collectionKey2, this);
		assert.equal(json.meta.numItems, 1);
	});

	it('testNewMultipleCollections', async function () {
		let json = await API.createCollection("Test Collection 1", false, this, 'jsonData');
		let name1 = "Test Collection 2";
		let name2 = "Test Subcollection";
		let parent2 = json.key;

		json = [
			{
				name: name1
			},
			{
				name: name2,
				parentCollection: parent2
			}

		];

		let response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);

		Helpers.assert200(response);
		let libraryVersion = response.headers['last-modified-version'][0];
		let jsonResponse = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(jsonResponse.successful), 2);
		// Deprecated
		assert.lengthOf(Object.keys(jsonResponse.success), 2);
		
		// Check data in write response
		Helpers.assertEquals(jsonResponse.successful[0].key, jsonResponse.successful[0].data.key);
		Helpers.assertEquals(jsonResponse.successful[1].key, jsonResponse.successful[1].data.key);
		Helpers.assertEquals(libraryVersion, jsonResponse.successful[0].version);
		Helpers.assertEquals(libraryVersion, jsonResponse.successful[1].version);
		Helpers.assertEquals(libraryVersion, jsonResponse.successful[0].data.version);
		Helpers.assertEquals(libraryVersion, jsonResponse.successful[1].data.version);
		Helpers.assertEquals(name1, jsonResponse.successful[0].data.name);
		Helpers.assertEquals(name2, jsonResponse.successful[1].data.name);
		assert.notOk(jsonResponse.successful[0].data.parentCollection);
		Helpers.assertEquals(parent2, jsonResponse.successful[1].data.parentCollection);

		// Check in separate request, to be safe
		let keys = Object.keys(jsonResponse.successful).map(k => jsonResponse.successful[k].key);

		response = await API.getCollectionResponse(keys);

		Helpers.assertTotalResults(response, 2);
		jsonResponse = API.getJSONFromResponse(response);
		Helpers.assertEquals(name1, jsonResponse[0].data.name);
		assert.notOk(jsonResponse[0].data.parentCollection);
		Helpers.assertEquals(name2, jsonResponse[1].data.name);
		Helpers.assertEquals(parent2, jsonResponse[1].data.parentCollection);
	});

	it('test_should_return_409_on_missing_parent_collection', async function () {
		let missingCollectionKey = "GDHRG8AZ";
		let json = await API.createCollection("Test", { parentCollection: missingCollectionKey }, this);
		Helpers.assert409ForObject(json, `Parent collection ${missingCollectionKey} not found`);
		Helpers.assertEquals(missingCollectionKey, json.failed[0].data.collection);
	});

	it('test_should_return_413_if_collection_name_is_too_long', async function () {
		const content = "1".repeat(256);
		const json = {
			name: content
		};
		const response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([json]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert413ForObject(response);
	});

	it('testNewCollection', async function () {
		let name = "Test Collection";
		let json = await API.createCollection(name, false, this, 'json');
		Helpers.assertEquals(name, json.data.name);
		return json.key;
	});

	it('testCollectionItemMissingCollection', async function () {
		let response = await API.createItem("book", { collections: ["AAAAAAAA"] }, this, 'response');
		Helpers.assert409ForObject(response, "Collection AAAAAAAA not found");
	});

	it('test_should_move_parent_collection_to_root_if_descendent_of_collection', async function () {
		let jsonA = await API.createCollection('A', false, this, 'jsonData');
		// Set B as a child of A
		let keyB = await API.createCollection('B', { parentCollection: jsonA.key }, this, 'key');

		// Try to set B as parent of A
		jsonA.parentCollection = keyB;
		let response = await API.userPost(
			config.userID,
			'collections',
			JSON.stringify([jsonA]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.successful[0].data.parentCollection, keyB);

		let jsonB = await API.getCollection(keyB, this);
		assert.notOk(jsonB.data.parentCollection);
	});
});
