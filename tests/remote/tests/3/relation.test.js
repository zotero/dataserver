/**
 * Relation API tests
 * Port of tests/remote/tests/API/3/RelationTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assertUnchangedForObject,
	assert400ForObject
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Relations', function () {
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

	// PHP: testNewItemRelations
	it('should create item with relations', async function () {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/items/AAAAAAAA',
			'dc:relation': [
				`http://zotero.org/users/${config.get('userID')}/items/AAAAAAAA`,
				`http://zotero.org/users/${config.get('userID')}/items/BBBBBBBB`
			]
		};

		let json = await API.createItem('book', {
			relations: relations
		}, 'jsonData');
		assert.lengthOf(Object.keys(json.relations), Object.keys(relations).length);
		for (let [predicate, object] of Object.entries(relations)) {
			if (typeof object === 'string') {
				assert.equal(json.relations[predicate], object);
			}
			else {
				for (let rel of object) {
					assert.include(json.relations[predicate], rel);
				}
			}
		}
	});

	// PHP: testRelatedItemRelations
	it('should create bidirectional related item relations', async function () {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/items/AAAAAAAA'
		};

		let item1JSON = await API.createItem('book', {
			relations: relations
		}, 'jsonData');
		let item2JSON = await API.createItem('book', null, 'jsonData');

		let uriPrefix = `http://zotero.org/users/${config.get('userID')}/items/`;
		let item1URI = uriPrefix + item1JSON.key;
		let item2URI = uriPrefix + item2JSON.key;

		// Add item 2 as related item of item 1
		relations['dc:relation'] = item2URI;
		item1JSON.relations = relations;
		let response = await API.userPut(
			config.get('userID'),
			`items/${item1JSON.key}`,
			JSON.stringify(item1JSON)
		);
		assert204(response);

		// Make sure it exists on item 1
		let json = (await API.getItem(item1JSON.key, 'json')).data;
		assert.lengthOf(Object.keys(json.relations), Object.keys(relations).length);
		for (let [predicate, object] of Object.entries(relations)) {
			assert.equal(json.relations[predicate], object);
		}

		// And item 2, since related items are bidirectional
		item2JSON = (await API.getItem(item2JSON.key, 'json')).data;
		assert.lengthOf(Object.keys(item2JSON.relations), 1);
		assert.equal(item2JSON.relations['dc:relation'], item1URI);

		// Sending item 2's unmodified JSON back up shouldn't cause the item to be updated.
		// Even though we're sending a relation that's technically not part of the item,
		// when it loads the item it will load the reverse relations too and therefore not
		// add a relation that it thinks already exists.
		response = await API.userPut(
			config.get('userID'),
			`items/${item2JSON.key}`,
			JSON.stringify(item2JSON)
		);
		assert204(response);
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), item2JSON.version);
	});

	// PHP: testRelatedItemRelationsSingleRequest
	it('should create bidirectional related item relations in single request', async function () {
		let uriPrefix = `http://zotero.org/users/${config.get('userID')}/items/`;
		let item1Key = API.generateKey();
		let item2Key = API.generateKey();
		let item1URI = uriPrefix + item1Key;
		let item2URI = uriPrefix + item2Key;

		let item1JSON = await API.getItemTemplate('book');
		item1JSON.key = item1Key;
		item1JSON.version = 0;
		item1JSON.relations = { 'dc:relation': item2URI };
		let item2JSON = await API.getItemTemplate('book');
		item2JSON.key = item2Key;
		item2JSON.version = 0;

		let response = await API.postItems([item1JSON, item2JSON]);
		assert200(response);
		let json = API.getJSONFromResponse(response);

		// Make sure it exists on item 1
		json = (await API.getItem(item1JSON.key, 'json')).data;
		assert.lengthOf(Object.keys(json.relations), 1);
		assert.equal(json.relations['dc:relation'], item2URI);

		// And item 2, since related items are bidirectional
		json = (await API.getItem(item2JSON.key, 'json')).data;
		assert.lengthOf(Object.keys(json.relations), 1);
		assert.equal(json.relations['dc:relation'], item1URI);
	});

	// PHP: test_should_add_a_URL_to_a_relation_with_PATCH
	it('should add a URL to a relation with PATCH', async function () {
		let relations = {
			'dc:replaces': [
				`http://zotero.org/users/${config.get('userID')}/items/AAAAAAAA`
			]
		};

		let itemJSON = await API.createItem('book', {
			relations: relations
		}, 'jsonData');

		relations['dc:replaces'].push(`http://zotero.org/users/${config.get('userID')}/items/BBBBBBBB`);

		let patchJSON = {
			version: itemJSON.version,
			relations: relations
		};
		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemJSON.key}`,
			JSON.stringify(patchJSON)
		);
		assert204(response);

		// Make sure the array was updated
		let json = (await API.getItem(itemJSON.key, 'json')).data;
		assert.lengthOf(Object.keys(json.relations), Object.keys(relations).length);
		assert.lengthOf(json.relations['dc:replaces'], relations['dc:replaces'].length);
		assert.include(json.relations['dc:replaces'], relations['dc:replaces'][0]);
		assert.include(json.relations['dc:replaces'], relations['dc:replaces'][1]);
	});

	// PHP: test_should_remove_a_URL_from_a_relation_with_PATCH
	it('should remove a URL from a relation with PATCH', async function () {
		let userID = config.get('userID');

		let relations = {
			'dc:replaces': [
				`http://zotero.org/users/${userID}/items/AAAAAAAA`,
				`http://zotero.org/users/${userID}/items/BBBBBBBB`
			]
		};

		let itemJSON = await API.createItem('book', {
			relations: relations
		}, 'jsonData');

		relations['dc:replaces'] = relations['dc:replaces'].slice(0, 1);

		let patchJSON = {
			version: itemJSON.version,
			relations: relations
		};
		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemJSON.key}`,
			JSON.stringify(patchJSON)
		);
		assert204(response);

		// Make sure the value (now a string) was updated
		let json = (await API.getItem(itemJSON.key, 'json')).data;
		assert.equal(json.relations['dc:replaces'], relations['dc:replaces'][0]);
	});

	// PHP: testInvalidItemRelation
	it('should reject invalid item relations', async function () {
		let response = await API.createItem('book', {
			relations: {
				'foo:unknown': 'http://zotero.org/groups/1/items/AAAAAAAA'
			}
		}, 'response');
		assert400ForObject(response, "Unsupported predicate 'foo:unknown'");

		response = await API.createItem('book', {
			relations: {
				'owl:sameAs': 'Not a URI'
			}
		}, 'response');
		assert400ForObject(response, "'relations' values currently must be Zotero item URIs");

		response = await API.createItem('book', {
			relations: {
				'owl:sameAs': ['Not a URI']
			}
		}, 'response');
		assert400ForObject(response, "'relations' values currently must be Zotero item URIs");
	});

	// PHP: testCircularItemRelations
	it('should handle circular item relations', async function () {
		let item1Data = await API.createItem('book', null, 'jsonData');
		let item2Data = await API.createItem('book', null, 'jsonData');
		let userID = config.get('userID');

		item1Data.relations = {
			'dc:relation': `http://zotero.org/users/${userID}/items/${item2Data.key}`
		};
		item2Data.relations = {
			'dc:relation': `http://zotero.org/users/${userID}/items/${item1Data.key}`
		};
		let response = await API.postItems([item1Data, item2Data]);
		assert200ForObject(response, false, 0);
		assertUnchangedForObject(response, 1);
	});

	// PHP: testDeleteItemRelation
	it('should delete item relations', async function () {
		let relations = {
			'owl:sameAs': [
				'http://zotero.org/groups/1/items/AAAAAAAA',
				'http://zotero.org/groups/1/items/BBBBBBBB'
			],
			'dc:relation': `http://zotero.org/users/${config.get('userID')}/items/AAAAAAAA`
		};

		let data = await API.createItem('book', {
			relations: relations
		}, 'jsonData');
		let itemKey = data.key;

		// Remove a relation
		data.relations['owl:sameAs'] = relations['owl:sameAs'] = relations['owl:sameAs'][0];
		let response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify(data)
		);
		assert204(response);

		// Make sure it's gone
		data = (await API.getItem(data.key, 'json')).data;
		assert.lengthOf(Object.keys(data.relations), Object.keys(relations).length);
		for (let [predicate, object] of Object.entries(relations)) {
			assert.equal(data.relations[predicate], object);
		}

		// Delete all
		data.relations = {};
		response = await API.userPut(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify(data)
		);
		assert204(response);

		// Make sure they're gone
		data = (await API.getItem(itemKey, 'json')).data;
		assert.lengthOf(Object.keys(data.relations), 0);
	});

	//
	// Collections
	//
	// PHP: testNewCollectionRelations
	it('should create collection with relations', async function () {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/collections/AAAAAAAA'
		};

		let data = await API.createCollection('Test', {
			relations: relations
		}, 'jsonData');
		assert.lengthOf(Object.keys(data.relations), Object.keys(relations).length);
		for (let [predicate, object] of Object.entries(relations)) {
			assert.equal(data.relations[predicate], object);
		}
	});

	// PHP: testInvalidCollectionRelation
	it('should reject invalid collection relations', async function () {
		let json = {
			name: 'Test',
			relations: {
				'foo:unknown': 'http://zotero.org/groups/1/collections/AAAAAAAA'
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([json])
		);
		assert400ForObject(response, "Unsupported predicate 'foo:unknown'");

		json.relations = {
			'owl:sameAs': 'Not a URI'
		};
		response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([json])
		);
		assert400ForObject(response, "'relations' values currently must be Zotero collection URIs");

		json.relations = ['http://zotero.org/groups/1/collections/AAAAAAAA'];
		response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([json])
		);
		assert400ForObject(response, "'relations' property must be an object");
	});

	// PHP: testDeleteCollectionRelation
	it('should delete collection relations', async function () {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/collections/AAAAAAAA'
		};
		let data = await API.createCollection('Test', {
			relations: relations
		}, 'jsonData');

		// Remove all relations
		data.relations = {};
		delete relations['owl:sameAs'];
		let response = await API.userPut(
			config.get('userID'),
			`collections/${data.key}`,
			JSON.stringify(data)
		);
		assert204(response);

		// Make sure it's gone
		data = (await API.getCollection(data.key, 'json')).data;
		assert.lengthOf(Object.keys(data.relations), Object.keys(relations).length);
		for (let [predicate, object] of Object.entries(relations)) {
			assert.equal(data.relations[predicate], object);
		}
	});

	// PHP: test_should_return_200_for_values_for_mendeleyDB_collection_relation
	it('should return 200 for values for mendeleyDB collection relation', async function () {
		let relations = {
			'mendeleyDB:remoteFolderUUID': 'b95b84b9-8b27-4a55-b5ea-5b98c1cac205'
		};
		let data = await API.createCollection(
			'Test',
			{
				relations: relations
			},
			'jsonData'
		);
		assert.equal(data.relations['mendeleyDB:remoteFolderUUID'], relations['mendeleyDB:remoteFolderUUID']);
	});

	// PHP: test_should_return_200_for_arrays_for_mendeleyDB_collection_relation
	it('should return 200 for arrays for mendeleyDB collection relation', async function () {
		let json = {
			name: 'Test',
			relations: {
				'mendeleyDB:remoteFolderUUID': ['b95b84b9-8b27-4a55-b5ea-5b98c1cac205']
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'collections',
			JSON.stringify([json])
		);
		assert200ForObject(response);
	});
});
