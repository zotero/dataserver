const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After } = require("../shared.js");

describe('RelationsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Before();
	});

	after(async function () {
		await API2After();
	});

	it('testNewItemRelations', async function () {
		const relations = {
			"owl:sameAs": "http://zotero.org/groups/1/items/AAAAAAAA",
			"dc:relation": [
				"http://zotero.org/users/" + config.userID + "/items/AAAAAAAA",
				"http://zotero.org/users/" + config.userID + "/items/BBBBBBBB",
			]
		};
		const xml = await API.createItem("book", { relations }, true);
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
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

		const item1JSON = await API.createItem("book", { relations: relations }, true, 'json');
		const item2JSON = await API.createItem("book", null, this, 'json');

		const uriPrefix = "http://zotero.org/users/" + config.userID + "/items/";
		const item1URI = uriPrefix + item1JSON.itemKey;
		const item2URI = uriPrefix + item2JSON.itemKey;

		// Add item 2 as related item of item 1
		relations["dc:relation"] = item2URI;
		item1JSON.relations = relations;
		const response = await API.userPut(
			config.userID,
			"items/" + item1JSON.itemKey + "?key=" + config.apiKey,
			JSON.stringify(item1JSON)
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure it exists on item 1
		const xml = await API.getItemXML(item1JSON.itemKey);
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		assert.equal(Object.keys(relations).length, Object.keys(json.relations).length);
		for (const [predicate, object] of Object.entries(relations)) {
			assert.equal(object, json.relations[predicate]);
		}

		// And item 2, since related items are bidirectional
		const xml2 = await API.getItemXML(item2JSON.itemKey);
		const data2 = API.parseDataFromAtomEntry(xml2);
		const item2JSON2 = JSON.parse(data2.content);
		assert.equal(1, Object.keys(item2JSON2.relations).length);
		assert.equal(item1URI, item2JSON2.relations["dc:relation"]);

		// Sending item 2's unmodified JSON back up shouldn't cause the item to be updated.
		// Even though we're sending a relation that's technically not part of the item,
		// when it loads the item it will load the reverse relations too and therefore not
		// add a relation that it thinks already exists.
		const response2 = await API.userPut(
			config.userID,
			"items/" + item2JSON.itemKey + "?key=" + config.apiKey,
			JSON.stringify(item2JSON2)
		);
		Helpers.assertStatusCode(response2, 204);
		assert.equal(parseInt(item2JSON2.itemVersion), response2.headers["last-modified-version"][0]);
	});

	it('testRelatedItemRelationsSingleRequest', async function () {
		const uriPrefix = "http://zotero.org/users/" + config.userID + "/items/";
		const item1Key = Helpers.uniqueID();
		const item2Key = Helpers.uniqueID();
		const item1URI = uriPrefix + item1Key;
		const item2URI = uriPrefix + item2Key;

		const item1JSON = await API.getItemTemplate('book');
		item1JSON.itemKey = item1Key;
		item1JSON.itemVersion = 0;
		item1JSON.relations['dc:relation'] = item2URI;
		const item2JSON = await API.getItemTemplate('book');
		item2JSON.itemKey = item2Key;
		item2JSON.itemVersion = 0;

		const response = await API.postItems([item1JSON, item2JSON]);
		Helpers.assertStatusCode(response, 200);

		// Make sure it exists on item 1
		const xml = await API.getItemXML(item1JSON.itemKey);
		const data = API.parseDataFromAtomEntry(xml);
		const parsedJson = JSON.parse(data.content);
		
		assert.lengthOf(Object.keys(parsedJson.relations), 1);
		assert.equal(parsedJson.relations['dc:relation'], item2URI);

		// And item 2, since related items are bidirectional
		const xml2 = await API.getItemXML(item2JSON.itemKey);
		const data2 = API.parseDataFromAtomEntry(xml2);
		const parsedJson2 = JSON.parse(data2.content);
		assert.lengthOf(Object.keys(parsedJson2.relations), 1);
		assert.equal(parsedJson2.relations['dc:relation'], item1URI);
	});

	it('testInvalidItemRelation', async function () {
		let response = await API.createItem('book', {
			relations: {
				'foo:unknown': 'http://zotero.org/groups/1/items/AAAAAAAA'
			}
		}, true, 'response');

		Helpers.assertStatusForObject(response, 'failed', 0, 400, "Unsupported predicate 'foo:unknown'");

		response = await API.createItem('book', {
			relations: {
				'owl:sameAs': 'Not a URI'
			}
		}, this, 'response');

		Helpers.assertStatusForObject(response, 'failed', 0, 400, "'relations' values currently must be Zotero item URIs");

		response = await API.createItem('book', {
			relations: {
				'owl:sameAs': ['Not a URI']
			}
		}, this, 'response');

		Helpers.assertStatusForObject(response, 'failed', 0, 400, "'relations' values currently must be Zotero item URIs");
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

		const data = await API.createItem("book", {
			relations: relations
		}, true, 'data');

		let json = JSON.parse(data.content);

		// Remove a relation
		json.relations['owl:sameAs'] = relations['owl:sameAs'] = relations['owl:sameAs'][0];
		const response = await API.userPut(
			config.userID,
			"items/" + data.key + "?key=" + config.apiKey,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure it's gone
		const xml = await API.getItemXML(data.key);
		const itemData = await API.parseDataFromAtomEntry(xml);
		json = JSON.parse(itemData.content);
		assert.equal(Object.keys(relations).length, Object.keys(json.relations).length);
		for (const [predicate, object] of Object.entries(relations)) {
			assert.deepEqual(object, json.relations[predicate]);
		}

		// Delete all
		json.relations = {};
		const deleteResponse = await API.userPut(
			config.userID,
			"items/" + data.key + "?key=" + config.apiKey,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(deleteResponse, 204);

		// Make sure they're gone
		const xmlAfterDelete = await API.getItemXML(data.key);
		const itemDataAfterDelete = await API.parseDataFromAtomEntry(xmlAfterDelete);
		const responseDataAfterDelete = JSON.parse(itemDataAfterDelete.content);
		assert.lengthOf(Object.keys(responseDataAfterDelete.relations), 0);
	});

	it('testNewCollectionRelations', async function () {
		const relationsObj = {
			"owl:sameAs": "http://zotero.org/groups/1/collections/AAAAAAAA"
		};
		const data = await API.createCollection("Test",
			{ relations: relationsObj }, true, 'data');
		const json = JSON.parse(data.content);
		assert.equal(Object.keys(json.relations).length, Object.keys(relationsObj).length);
		for (const [predicate, object] of Object.entries(relationsObj)) {
			assert.equal(object, json.relations[predicate]);
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
			"collections?key=" + config.apiKey,
			JSON.stringify({ collections: [json] })
		);
		Helpers.assertStatusForObject(response, 'failed', 0, null, "Unsupported predicate 'foo:unknown'");

		json.relations = {
			"owl:sameAs": "Not a URI"
		};
		const response2 = await API.userPost(
			config.userID,
			"collections?key=" + config.apiKey,
			JSON.stringify({ collections: [json] })
		);
		Helpers.assertStatusForObject(response2, 'failed', 0, null, "'relations' values currently must be Zotero collection URIs");

		json.relations = ["http://zotero.org/groups/1/collections/AAAAAAAA"];
		const response3 = await API.userPost(
			config.userID,
			"collections?key=" + config.apiKey,
			JSON.stringify({ collections: [json] })
		);
		Helpers.assertStatusForObject(response3, 'failed', 0, null, "'relations' property must be an object");
	});

	it('testDeleteCollectionRelation', async function () {
		const relations = {
			"owl:sameAs": "http://zotero.org/groups/1/collections/AAAAAAAA"
		};
		const data = await API.createCollection("Test", {
			relations: relations
		}, true, 'data');
		const json = JSON.parse(data.content);

		// Remove all relations
		json.relations = {};
		delete relations['owl:sameAs'];
		const response = await API.userPut(
			config.userID,
			`collections/${data.key}?key=${config.apiKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure it's gone
		const xml = await API.getCollectionXML(data.key);
		const parsedData = API.parseDataFromAtomEntry(xml);
		const jsonData = JSON.parse(parsedData.content);
		assert.equal(Object.keys(jsonData.relations).length, Object.keys(relations).length);
		for (const key in relations) {
			assert.equal(jsonData.relations[key], relations[key]);
		}
	});
});
