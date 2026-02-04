/**
 * Relation tests for API v2
 * Port of tests/remote/tests/API/2/RelationTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert204,
	assert400ForObject
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Relations (API v2)', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testNewItemRelations
	it('should create item with relations', async function() {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/items/AAAAAAAA',
			'dc:relation': [
				`http://zotero.org/users/${config.get('userID')}/items/AAAAAAAA`,
				`http://zotero.org/users/${config.get('userID')}/items/BBBBBBBB`
			]
		};

		let xml = await API.createItem('book', { relations }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);

		assert.equal(Object.keys(json.relations).length, Object.keys(relations).length);
		for (let predicate in relations) {
			let object = relations[predicate];
			if (typeof object === 'string') {
				assert.equal(json.relations[predicate], object);
			} else {
				for (let rel of object) {
					assert.include(json.relations[predicate], rel);
				}
			}
		}
	});

	// PHP: testRelatedItemRelations
	it('should handle bidirectional related item relations', async function() {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/items/AAAAAAAA'
		};

		let item1JSON = await API.createItem('book', { relations }, 'json');
		let item2JSON = await API.createItem('book', null, 'json');

		let uriPrefix = `http://zotero.org/users/${config.get('userID')}/items/`;
		let item1URI = uriPrefix + item1JSON.itemKey;
		let item2URI = uriPrefix + item2JSON.itemKey;

		// Add item 2 as related item of item 1
		relations['dc:relation'] = item2URI;
		item1JSON.relations = relations;
		let response = await API.userPut(
			config.get('userID'),
			`items/${item1JSON.itemKey}?key=${config.get('apiKey')}`,
			JSON.stringify(item1JSON)
		);
		assert204(response);

		// Make sure it exists on item 1
		let xml = await API.getItemXML(item1JSON.itemKey);
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(Object.keys(json.relations).length, Object.keys(relations).length);
		for (let predicate in relations) {
			assert.equal(json.relations[predicate], relations[predicate]);
		}

		// And item 2, since related items are bidirectional
		xml = await API.getItemXML(item2JSON.itemKey);
		data = API.parseDataFromAtomEntry(xml);
		let item2Content = JSON.parse(data.content);
		assert.equal(Object.keys(item2Content.relations).length, 1);
		assert.equal(item2Content.relations['dc:relation'], item1URI);

		// Sending item 2's unmodified JSON back up shouldn't cause the item to be updated
		response = await API.userPut(
			config.get('userID'),
			`items/${item2Content.itemKey}?key=${config.get('apiKey')}`,
			JSON.stringify(item2Content)
		);
		assert204(response);
		assert.equal(item2Content.itemVersion.toString(), response.getHeader('Last-Modified-Version'));
	});

	// PHP: testRelatedItemRelationsSingleRequest
	it('should handle bidirectional related item relations in single request', async function() {
		let uriPrefix = `http://zotero.org/users/${config.get('userID')}/items/`;
		let item1Key = API.generateKey();
		let item2Key = API.generateKey();
		let item1URI = uriPrefix + item1Key;
		let item2URI = uriPrefix + item2Key;

		let item1JSON = await API.getItemTemplate('book');
		item1JSON.itemKey = item1Key;
		item1JSON.itemVersion = 0;
		item1JSON.relations = { 'dc:relation': item2URI };

		let item2JSON = await API.getItemTemplate('book');
		item2JSON.itemKey = item2Key;
		item2JSON.itemVersion = 0;

		let response = await API.postItems([item1JSON, item2JSON]);
		assert200(response);

		// Make sure it exists on item 1
		let xml = await API.getItemXML(item1Key);
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(Object.keys(json.relations).length, 1);
		assert.equal(json.relations['dc:relation'], item2URI);

		// And item 2, since related items are bidirectional
		xml = await API.getItemXML(item2Key);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(Object.keys(json.relations).length, 1);
		assert.equal(json.relations['dc:relation'], item1URI);
	});

	// PHP: testInvalidItemRelation
	it('should reject invalid item relations', async function() {
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

	// PHP: testDeleteItemRelation
	it('should delete item relations', async function() {
		let relations = {
			'owl:sameAs': [
				'http://zotero.org/groups/1/items/AAAAAAAA',
				'http://zotero.org/groups/1/items/BBBBBBBB'
			],
			'dc:relation': `http://zotero.org/users/${config.get('userID')}/items/AAAAAAAA`
		};

		let xml = await API.createItem('book', { relations }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);

		// Remove a relation
		json.relations['owl:sameAs'] = relations['owl:sameAs'] = relations['owl:sameAs'][0];
		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		// Make sure it's gone
		xml = await API.getItemXML(data.key);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(Object.keys(json.relations).length, Object.keys(relations).length);
		for (let predicate in relations) {
			assert.equal(json.relations[predicate], relations[predicate]);
		}

		// Delete all
		json.relations = {};
		response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		// Make sure they're gone
		xml = await API.getItemXML(data.key);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(Object.keys(json.relations).length, 0);
	});

	// PHP: testNewCollectionRelations
	it('should create collection with relations', async function() {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/collections/AAAAAAAA'
		};

		let xml = await API.createCollection('Test', { relations }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);

		assert.equal(Object.keys(json.relations).length, Object.keys(relations).length);
		for (let predicate in relations) {
			assert.equal(json.relations[predicate], relations[predicate]);
		}
	});

	// PHP: testInvalidCollectionRelation
	it('should reject invalid collection relations', async function() {
		let json = {
			name: 'Test',
			relations: {
				'foo:unknown': 'http://zotero.org/groups/1/collections/AAAAAAAA'
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify({ collections: [json] })
		);
		assert400ForObject(response, "Unsupported predicate 'foo:unknown'");

		json.relations = {
			'owl:sameAs': 'Not a URI'
		};
		response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify({ collections: [json] })
		);
		assert400ForObject(response, "'relations' values currently must be Zotero collection URIs");

		json.relations = ['http://zotero.org/groups/1/collections/AAAAAAAA'];
		response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify({ collections: [json] })
		);
		assert400ForObject(response, "'relations' property must be an object");
	});

	// PHP: testDeleteCollectionRelation
	it('should delete collection relations', async function() {
		let relations = {
			'owl:sameAs': 'http://zotero.org/groups/1/collections/AAAAAAAA'
		};
		let xml = await API.createCollection('Test', { relations }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);

		// Remove all relations
		json.relations = {};
		let response = await API.userPut(
			config.get('userID'),
			`collections/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		// Make sure it's gone
		let collectionJson = await API.getCollection(data.key, 'json');
		assert.equal(Object.keys(collectionJson.data.relations).length, 0);
	});
});
