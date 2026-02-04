/**
 * Collection API tests
 * Port of tests/remote/tests/API/3/CollectionTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert400,
	assert409ForObject,
	assert413ForObject,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Collections', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testNewCollection
	it('should create new collection', async function() {
		let name = 'Test Collection';
		let json = await API.createCollection(name, false, 'json');
		assert.equal(json.data.name, name);
	});

	// PHP: testNewSubcollection
	it('should create new subcollection', async function() {
		let parentName = 'Test Parent';
		let parentJSON = await API.createCollection(parentName, false, 'json');
		let parent = parentJSON.key;

		let name = 'Test Subcollection';
		let json = await API.createCollection(name, parent, 'json');
		assert.equal(json.data.name, name);
		assert.equal(json.data.parentCollection, parent);

		let response = await API.userGet(
			config.get('userID'),
			`collections/${parent}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numCollections, 1);
	});

	// PHP: testNewMultipleCollections
	it('should create new multiple collections', async function() {
		let json = await API.createCollection('Test Collection 1', false, 'jsonData');

		let name1 = 'Test Collection 2';
		let name2 = 'Test Subcollection';
		let parent2 = json.key;

		let postJSON = [
			{
				name: name1
			},
			{
				name: name2,
				parentCollection: parent2
			}
		];

		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify(postJSON),
			['Content-Type: application/json']
		);
		assert200(response);
		let libraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 2);
		// Deprecated
		assert.lengthOf(Object.keys(json.success), 2);

		// Check data in write response
		assert.equal(json.successful[0].key, json.successful[0].data.key);
		assert.equal(json.successful[1].key, json.successful[1].data.key);
		assert.equal(json.successful[0].version, libraryVersion);
		assert.equal(json.successful[1].version, libraryVersion);
		assert.equal(json.successful[0].data.version, libraryVersion);
		assert.equal(json.successful[1].data.version, libraryVersion);
		assert.equal(json.successful[0].data.name, name1);
		assert.equal(json.successful[1].data.name, name2);
		assert.isFalse(json.successful[0].data.parentCollection);
		assert.equal(json.successful[1].data.parentCollection, parent2);

		// Check in separate request, to be safe
		let keys = Object.values(json.successful).map(o => o.key);
		response = await API.getCollectionResponse(keys);
		assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].data.name, name1);
		assert.isFalse(json[0].data.parentCollection);
		assert.equal(json[1].data.name, name2);
		assert.equal(json[1].data.parentCollection, parent2);
	});

	// PHP: testCreateKeyedCollections
	it('should create keyed collections', async function() {
		let key1 = API.generateKey();
		let name1 = 'Test Collection 2';
		let name2 = 'Test Subcollection';

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
			config.get('userID'),
			'collections',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert200(response);
		let libraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 2);

		// Check data in write response
		assert.equal(json.successful[0].key, json.successful[0].data.key);
		assert.equal(json.successful[1].key, json.successful[1].data.key);
		assert.equal(json.successful[0].version, libraryVersion);
		assert.equal(json.successful[1].version, libraryVersion);
		assert.equal(json.successful[0].data.version, libraryVersion);
		assert.equal(json.successful[1].data.version, libraryVersion);
		assert.equal(json.successful[0].data.name, name1);
		assert.equal(json.successful[1].data.name, name2);
		assert.isFalse(json.successful[0].data.parentCollection);
		assert.equal(json.successful[1].data.parentCollection, key1);

		// Check in separate request, to be safe
		let keys = Object.values(json.successful).map(o => o.key);
		response = await API.getCollectionResponse(keys);
		assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].data.name, name1);
		assert.isFalse(json[0].data.parentCollection);
		assert.equal(json[1].data.name, name2);
		assert.equal(json[1].data.parentCollection, key1);
	});

	// PHP: testUpdateMultipleCollections
	it('should update multiple collections', async function() {
		let collection1Data = await API.createCollection('Test 1', false, 'jsonData');
		let collection2Name = 'Test 2';
		let collection2Data = await API.createCollection(collection2Name, false, 'jsonData');

		let libraryVersion = await API.getLibraryVersion();

		// Update with no change, which should still update library version (for now)
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([
				collection1Data,
				collection2Data
			]),
			['Content-Type: application/json']
		);
		assert200(response);
		// If this behavior changes, remove the pre-increment
		libraryVersion++;
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.unchanged), 2);

		assert.equal(await API.getLibraryVersion(), libraryVersion);

		// Update
		let collection1NewName = 'Test 1 Modified';
		let collection2NewParentKey = await API.createCollection('Test 3', false, 'key');

		response = await API.userPost(
			config.get('userID'),
			'collections',
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
			['Content-Type: application/json']
		);
		assert200(response);
		libraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 2);
		// Deprecated
		assert.lengthOf(Object.keys(json.success), 2);

		// Check data in write response
		assert.equal(json.successful[0].key, json.successful[0].data.key);
		assert.equal(json.successful[1].key, json.successful[1].data.key);
		assert.equal(json.successful[0].version, libraryVersion);
		assert.equal(json.successful[1].version, libraryVersion);
		assert.equal(json.successful[0].data.version, libraryVersion);
		assert.equal(json.successful[1].data.version, libraryVersion);
		assert.equal(json.successful[0].data.name, collection1NewName);
		assert.equal(json.successful[1].data.name, collection2Name);
		assert.isFalse(json.successful[0].data.parentCollection);
		assert.equal(json.successful[1].data.parentCollection, collection2NewParentKey);

		// Check in separate request, to be safe
		let keys = Object.values(json.successful).map(o => o.key);
		response = await API.getCollectionResponse(keys);
		assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		// POST follows PATCH behavior, so unspecified values shouldn't change
		assert.equal(json[0].data.name, collection1NewName);
		assert.isFalse(json[0].data.parentCollection);
		assert.equal(json[1].data.name, collection2Name);
		assert.equal(json[1].data.parentCollection, collection2NewParentKey);
	});

	// PHP: testCollectionItemChange
	it('should handle collection item change', async function() {
		let collectionKey1 = await API.createCollection('Test', false, 'key');
		let collectionKey2 = await API.createCollection('Test', false, 'key');

		let json = await API.createItem('book', {
			collections: [collectionKey1]
		}, 'json');
		let itemKey1 = json.key;
		let itemVersion1 = json.version;
		assert.deepEqual(json.data.collections, [collectionKey1]);

		json = await API.createItem('journalArticle', {
			collections: [collectionKey2]
		}, 'json');
		let itemKey2 = json.key;
		let itemVersion2 = json.version;
		assert.deepEqual(json.data.collections, [collectionKey2]);

		json = await API.getCollection(collectionKey1);
		assert.equal(json.meta.numItems, 1);

		json = await API.getCollection(collectionKey2);
		assert.equal(json.meta.numItems, 1);
		let collectionData2 = json.data;

		let libraryVersion = await API.getLibraryVersion();

		// Add items to collection
		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey1}`,
			JSON.stringify({
				collections: [collectionKey1, collectionKey2]
			}),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${itemVersion1}`
			]
		);
		assert204(response);

		// Item version should change
		json = await API.getItem(itemKey1);
		assert.equal(json.version, libraryVersion + 1);

		// Collection timestamp shouldn't change, but numItems should
		json = await API.getCollection(collectionKey2);
		assert.equal(json.meta.numItems, 2);
		assert.equal(json.version, collectionData2.version);
		collectionData2 = json.data;

		libraryVersion = await API.getLibraryVersion();

		// Remove collections
		response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey2}`,
			JSON.stringify({
				collections: []
			}),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${itemVersion2}`
			]
		);
		assert204(response);

		// Item version should change
		json = await API.getItem(itemKey2);
		assert.equal(json.version, libraryVersion + 1);

		// Collection timestamp shouldn't change, but numItems should
		json = await API.getCollection(collectionKey2);
		assert.equal(json.meta.numItems, 1);
		assert.equal(json.version, collectionData2.version);

		// Check collections arrays and numItems
		json = await API.getItem(itemKey1);
		assert.lengthOf(json.data.collections, 2);
		assert.include(json.data.collections, collectionKey1);
		assert.include(json.data.collections, collectionKey2);

		json = await API.getItem(itemKey2);
		assert.lengthOf(json.data.collections, 0);

		json = await API.getCollection(collectionKey1);
		assert.equal(json.meta.numItems, 1);

		json = await API.getCollection(collectionKey2);
		assert.equal(json.meta.numItems, 1);
	});

	// PHP: testCollectionChildItemError
	it('should handle collection child item error', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let key = await API.createItem('book', {}, 'key');
		let json = await API.createNoteItem('Test Note', key, 'jsonData');
		json.collections = [collectionKey];

		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.equal(response.getBody(), 'Child items cannot be assigned to collections');
	});

	// PHP: test_should_convert_child_attachent_with_embedded_note_in_collection_to_standalone_attachment_while_changing_note
	it('should convert child attachment with embedded note in collection to standalone attachment while changing note', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let key = await API.createItem('book', { collections: [collectionKey] }, 'key');
		let json = await API.createAttachmentItem('linked_url', { note: 'Foo' }, key, 'jsonData');
		json = {
			key: json.key,
			version: json.version,
			note: '',
			collections: [collectionKey],
			parentItem: false
		};

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0];
		assert.equal(json.data.note, '');
		assert.deepEqual(json.data.collections, [collectionKey]);
	});

	// PHP: testCollectionItems
	it('should get collection items', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let json = await API.createItem('book', { collections: [collectionKey] }, 'jsonData');
		let itemKey1 = json.key;
		assert.deepEqual(json.collections, [collectionKey]);

		json = await API.createItem('journalArticle', { collections: [collectionKey] }, 'jsonData');
		let itemKey2 = json.key;
		assert.deepEqual(json.collections, [collectionKey]);

		let childItemKey1 = await API.createAttachmentItem('linked_url', {}, itemKey1, 'key');
		let childItemKey2 = await API.createAttachmentItem('linked_url', {}, itemKey2, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items?format=keys`
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 4);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
		assert.include(keys, childItemKey1);
		assert.include(keys, childItemKey2);

		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?format=keys`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
	});

	// PHP: testCollectionItemMissingCollection
	it('should handle collection item missing collection', async function() {
		let response = await API.createItem('book', { collections: ['AAAAAAAA'] }, 'response');
		assert409ForObject(response, 'Collection AAAAAAAA not found');
	});

	// PHP: test_should_return_409_on_missing_parent_collection
	it('should return 409 on missing parent collection', async function() {
		let missingCollectionKey = 'GDHRG8AZ';
		let response = await API.createCollection('Test', { parentCollection: missingCollectionKey }, 'response');
		let json = API.getJSONFromResponse(response);
		assert409ForObject(response, `Parent collection ${missingCollectionKey} not found`);
		assert.equal(json.failed[0].data.collection, missingCollectionKey);
	});

	// PHP: test_should_return_413_if_collection_name_is_too_long
	it('should return 413 if collection name is too long', async function() {
		let content = '1'.repeat(256);
		let json = [
			{
				name: content
			}
		];
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert413ForObject(response);
	});

	// MySQL FK cascade limit is 15, but we detect the error and work around it
	// PHP: test_should_delete_collection_with_20_levels_below_it
	it('should delete collection with 20 levels below it', async function() {
		let json = await API.createCollection('0', false, 'json');
		let topCollectionKey = json.key;
		let parentCollectionKey = topCollectionKey;
		for (let i = 0; i < 20; i++) {
			json = await API.createCollection(`${i}`, parentCollectionKey, 'json');
			parentCollectionKey = json.key;
		}
		let response = await API.userDelete(
			config.get('userID'),
			`collections?collectionKey=${topCollectionKey}`,
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		assert204(response);
	});

	// PHP: test_should_move_parent_collection_to_root_if_descendent_of_collection
	it('should move parent collection to root if descendent of collection', async function() {
		let jsonA = await API.createCollection('A', false, 'jsonData');
		// Set B as a child of A
		let keyB = await API.createCollection('B', { parentCollection: jsonA.key }, 'key');

		// Try to set B as parent of A
		jsonA.parentCollection = keyB;
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([jsonA]),
			['Content-Type: application/json']
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.successful[0].data.parentCollection, keyB);

		let jsonB = await API.getCollection(keyB);
		assert.isFalse(jsonB.data.parentCollection);
	});

	// PHP: test_should_allow_emoji_in_name
	it('should allow emoji in name', async function() {
		let name = '\uD83D\uDC36'; // Dog emoji (4-byte character)
		let json = await API.createCollection(name, false, 'json');
		assert.equal(json.data.name, name);
	});
});
