const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('RelationsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});

	it('testNewItemRelations', async function () {
		const relations = {
			"owl:sameAs": "http://zotero.org/groups/1/items/AAAAAAAA",
			"dc:relation": [
				"http://zotero.org/users/" + config.userID + "/items/AAAAAAAA",
				"http://zotero.org/users/" + config.userID + "/items/BBBBBBBB",
			]
		};
		const json = await API.createItem("book", { relations }, true, 'jsonData');

		assert.equal(Object.keys(relations).length, Object.keys(json.relations).length);

		for (const [predicate, object] of Object.entries(relations)) {
			if (typeof object === "string") {
				assert.equal(object, json.relations[predicate]);
			}
			else {
				for (const rel of object) {
					assert.include(json.relations[predicate], rel);
				}
			}
		}
	});

	it('testRelatedItemRelations', async function () {
		const relations = {
			"owl:sameAs": "http://zotero.org/groups/1/items/AAAAAAAA"
		};

		const item1JSON = await API.createItem("book", { relations: relations }, true, 'jsonData');
		const item2JSON = await API.createItem("book", null, this, 'jsonData');

		const uriPrefix = "http://zotero.org/users/" + config.userID + "/items/";
		const item1URI = uriPrefix + item1JSON.key;
		const item2URI = uriPrefix + item2JSON.key;
		
		// Add item 2 as related item of item 1
		relations["dc:relation"] = item2URI;
		item1JSON.relations = relations;
		const response = await API.userPut(
			config.userID,
			"items/" + item1JSON.key,
			JSON.stringify(item1JSON)
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure it exists on item 1
		const json = (await API.getItem(item1JSON.key, true, 'json')).data;
		assert.equal(Object.keys(relations).length, Object.keys(json.relations).length);
		for (const [predicate, object] of Object.entries(relations)) {
			assert.equal(object, json.relations[predicate]);
		}

		// And item 2, since related items are bidirectional
		const item2JSON2 = (await API.getItem(item2JSON.key, true, 'json')).data;
		assert.equal(1, Object.keys(item2JSON2.relations).length);
		assert.equal(item1URI, item2JSON2.relations["dc:relation"]);

		// Sending item 2's unmodified JSON back up shouldn't cause the item to be updated.
		// Even though we're sending a relation that's technically not part of the item,
		// when it loads the item it will load the reverse relations too and therefore not
		// add a relation that it thinks already exists.
		const response2 = await API.userPut(
			config.userID,
			"items/" + item2JSON.key,
			JSON.stringify(item2JSON2)
		);
		Helpers.assertStatusCode(response2, 204);
		assert.equal(parseInt(item2JSON2.version), response2.headers["last-modified-version"][0]);
	});

	it('testRelatedItemRelationsSingleRequest', async function () {
		const uriPrefix = "http://zotero.org/users/" + config.userID + "/items/";
		const item1Key = Helpers.uniqueID();
		const item2Key = Helpers.uniqueID();
		const item1URI = uriPrefix + item1Key;
		const item2URI = uriPrefix + item2Key;

		const item1JSON = await API.getItemTemplate('book');
		item1JSON.key = item1Key;
		item1JSON.version = 0;
		item1JSON.relations['dc:relation'] = item2URI;
		const item2JSON = await API.getItemTemplate('book');
		item2JSON.key = item2Key;
		item2JSON.version = 0;

		const response = await API.postItems([item1JSON, item2JSON]);
		Helpers.assertStatusCode(response, 200);

		// Make sure it exists on item 1
		const parsedJson = (await API.getItem(item1JSON.key, true, 'json')).data;
		
		assert.lengthOf(Object.keys(parsedJson.relations), 1);
		assert.equal(parsedJson.relations['dc:relation'], item2URI);

		// And item 2, since related items are bidirectional
		const parsedJson2 = (await API.getItem(item2JSON.key, true, 'json')).data;
		assert.lengthOf(Object.keys(parsedJson2.relations), 1);
		assert.equal(parsedJson2.relations['dc:relation'], item1URI);
	});

	it('testInvalidItemRelation', async function () {
		let response = await API.createItem('book', {
			relations: {
				'foo:unknown': 'http://zotero.org/groups/1/items/AAAAAAAA'
			}
		}, true, 'response');

		Helpers.assert400ForObject(response, { message: "Unsupported predicate 'foo:unknown'" });

		response = await API.createItem('book', {
			relations: {
				'owl:sameAs': 'Not a URI'
			}
		}, this, 'response');

		Helpers.assert400ForObject(response, { message: "'relations' values currently must be Zotero item URIs" });

		response = await API.createItem('book', {
			relations: {
				'owl:sameAs': ['Not a URI']
			}
		}, this, 'response');

		Helpers.assert400ForObject(response, { message: "'relations' values currently must be Zotero item URIs" });
	});


	it('test_should_add_a_URL_from_a_relation_with_PATCH', async function () {
		const relations = {
			"dc:replaces": [
				`http://zotero.org/users/${config.userID}/items/AAAAAAAA`
			]
		};
	
		let itemJSON = await API.createItem("book", {
			relations: relations
		}, true, 'jsonData');
	
		relations["dc:replaces"].push(`http://zotero.org/users/${config.userID}/items/BBBBBBBB`);
	
		const patchJSON = {
			version: itemJSON.version,
			relations: relations
		};
		const response = await API.userPatch(
			config.userID,
			`items/${itemJSON.key}`,
			JSON.stringify(patchJSON)
		);
		Helpers.assert204(response);
	
		// Make sure the value (now a string) was updated
		itemJSON = (await API.getItem(itemJSON.key, true, 'json')).data;
		Helpers.assertCount(Object.keys(relations).length, itemJSON.relations);
		Helpers.assertCount(Object.keys(relations['dc:replaces']).length, itemJSON.relations['dc:replaces']);
		assert.include(itemJSON.relations['dc:replaces'], relations['dc:replaces'][0]);
		assert.include(itemJSON.relations['dc:replaces'], relations['dc:replaces'][1]);
	});

	it('test_should_remove_a_URL_from_a_relation_with_PATCH', async function () {
		const relations = {
			"dc:replaces": [
				`http://zotero.org/users/${config.userID}/items/AAAAAAAA`,
				`http://zotero.org/users/${config.userID}/items/BBBBBBBB`
			]
		};
	
		let itemJSON = await API.createItem("book", {
			relations: relations
		}, true, 'jsonData');
	
		relations["dc:replaces"] = relations["dc:replaces"].slice(0, 1);
	
		const patchJSON = {
			version: itemJSON.version,
			relations: relations
		};
		const response = await API.userPatch(
			config.userID,
			`items/${itemJSON.key}`,
			JSON.stringify(patchJSON)
		);
		Helpers.assert204(response);
	
		// Make sure the value (now a string) was updated
		itemJSON = (await API.getItem(itemJSON.key, true, 'json')).data;
		assert.equal(relations['dc:replaces'][0], itemJSON.relations['dc:replaces']);
	});
	

	it('testDeleteItemRelation', async function () {
		const relations = {
			"owl:sameAs": [
				"http://zotero.org/groups/1/items/AAAAAAAA",
				"http://zotero.org/groups/1/items/BBBBBBBB"
			],
			"dc:relation": "http://zotero.org/users/" + config.userID
				+ "/items/AAAAAAAA"
		};

		let data = await API.createItem("book", {
			relations: relations
		}, true, 'jsonData');

		let itemKey = data.key;

		// Remove a relation
		data.relations['owl:sameAs'] = relations['owl:sameAs'] = relations['owl:sameAs'][0];
		const response = await API.userPut(
			config.userID,
			"items/" + itemKey,
			JSON.stringify(data)
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure it's gone
		data = (await API.getItem(data.key, true, 'json')).data;

		assert.equal(Object.keys(relations).length, Object.keys(data.relations).length);
		for (const [predicate, object] of Object.entries(relations)) {
			assert.deepEqual(object, data.relations[predicate]);
		}

		// Delete all
		data.relations = {};
		const deleteResponse = await API.userPut(
			config.userID,
			"items/" + data.key,
			JSON.stringify(data)
		);
		Helpers.assertStatusCode(deleteResponse, 204);

		// Make sure they're gone
		data = (await API.getItem(itemKey, true, 'json')).data;
		assert.lengthOf(Object.keys(data.relations), 0);
	});

	it('testCircularItemRelations', async function () {
		const item1Data = await API.createItem("book", {}, true, 'jsonData');
		const item2Data = await API.createItem("book", {}, true, 'jsonData');
	
		item1Data.relations = {
			'dc:relation': `http://zotero.org/users/${config.userID}/items/${item2Data.key}`
		};
		item2Data.relations = {
			'dc:relation': `http://zotero.org/users/${config.userID}/items/${item1Data.key}`
		};
		const response = await API.postItems([item1Data, item2Data]);
		Helpers.assert200ForObject(response, { index: 0 });
		Helpers.assertUnchangedForObject(response, { index: 1 });
	});
	

	it('testNewCollectionRelations', async function () {
		const relationsObj = {
			"owl:sameAs": "http://zotero.org/groups/1/collections/AAAAAAAA"
		};
		const data = await API.createCollection("Test",
			{ relations: relationsObj }, true, 'jsonData');
		assert.equal(Object.keys(relationsObj).length, Object.keys(data.relations).length);
		for (const [predicate, object] of Object.entries(relationsObj)) {
			assert.equal(object, data.relations[predicate]);
		}
	});

	it('testInvalidCollectionRelation', async function () {
		const json = {
			name: "Test",
			relations: {
				"foo:unknown": "http://zotero.org/groups/1/collections/AAAAAAAA"
			}
		};
		const response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([json])
		);
		Helpers.assert400ForObject(response, { message: "Unsupported predicate 'foo:unknown'" });

		json.relations = {
			"owl:sameAs": "Not a URI"
		};
		const response2 = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([json])
		);
		Helpers.assert400ForObject(response2, { message: "'relations' values currently must be Zotero collection URIs" });

		json.relations = ["http://zotero.org/groups/1/collections/AAAAAAAA"];
		const response3 = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([json])
		);
		Helpers.assert400ForObject(response3, { message: "'relations' property must be an object" });
	});

	it('testDeleteCollectionRelation', async function () {
		const relations = {
			"owl:sameAs": "http://zotero.org/groups/1/collections/AAAAAAAA"
		};
		let data = await API.createCollection("Test", {
			relations: relations
		}, true, 'jsonData');

		// Remove all relations
		data.relations = {};
		delete relations['owl:sameAs'];
		const response = await API.userPut(
			config.userID,
			`collections/${data.key}`,
			JSON.stringify(data)
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure it's gone
		data = (await API.getCollection(data.key, true, 'json')).data;
		assert.equal(Object.keys(data.relations).length, Object.keys(relations).length);
		for (const key in relations) {
			assert.equal(data.relations[key], relations[key]);
		}
	});

	it('test_should_return_200_for_values_for_mendeleyDB_collection_relation', async function () {
		const relations = {
			"mendeleyDB:remoteFolderUUID": "b95b84b9-8b27-4a55-b5ea-5b98c1cac205"
		};
		const data = await API.createCollection(
			"Test",
			{
				relations: relations
			},
			true,
			'jsonData'
		);
		assert.equal(relations['mendeleyDB:remoteFolderUUID'], data.relations['mendeleyDB:remoteFolderUUID']);
	});
	

	it('test_should_return_200_for_arrays_for_mendeleyDB_collection_relation', async function () {
		const json = {
			name: "Test",
			relations: {
				"mendeleyDB:remoteFolderUUID": ["b95b84b9-8b27-4a55-b5ea-5b98c1cac205"]
			}
		};
		const response = await API.userPost(
			config.userID,
			"collections",
			JSON.stringify([json])
		);
		Helpers.assert200ForObject(response);
	});

	it('test_should_add_a_URL_to_a_relation_with_PATCH', async function () {
		const relations = {
			"dc:replaces": [
				"http://zotero.org/users/" + config.userID + "/items/AAAAAAAA"
			]
		};
		
		const itemJSON = await API.createItem("book", {
			relations: relations
		}, true, 'jsonData');
		
		relations["dc:replaces"].push("http://zotero.org/users/" + config.userID + "/items/BBBBBBBB");
		
		const patchJSON = {
			version: itemJSON.version,
			relations: relations
		};
		const response = await API.userPatch(
			config.userID,
			"items/" + itemJSON.key,
			JSON.stringify(patchJSON)
		);
		Helpers.assert204(response);
		
		// Make sure the array was updated
		const json = (await API.getItem(itemJSON.key, 'json')).data;
		assert.equal(Object.keys(json.relations).length, Object.keys(relations).length);
		assert.equal(json.relations['dc:replaces'].length, relations['dc:replaces'].length);
		assert.include(json.relations['dc:replaces'], relations['dc:replaces'][0]);
		assert.include(json.relations['dc:replaces'], relations['dc:replaces'][1]);
	});
});
