const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After } = require("../shared.js");

describe('CollectionTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Before();
	});

	after(async function () {
		await API2After();
	});

	it('testNewCollections', async function () {
		const name = "Test Collection";

		const xml = await API.createCollection(name, false, true, 'atom');
		assert.equal(parseInt(Helpers.xpathEval(xml, '/atom:feed/zapi:totalResults')), 1);

		const data = API.parseDataFromAtomEntry(xml);

		const json = JSON.parse(data.content);
		assert.equal(name, json.name);

		const subName = "Test Subcollection";
		const parent = data.key;

		const subXml = await API.createCollection(subName, parent, true, 'atom');
		assert.equal(parseInt(Helpers.xpathEval(subXml, '/atom:feed/zapi:totalResults')), 1);

		const subData = API.parseDataFromAtomEntry(subXml);
		const subJson = JSON.parse(subData.content);
		assert.equal(subName, subJson.name);
		assert.equal(parent, subJson.parentCollection);

		const response = await API.userGet(
			config.userID,
			`collections/${parent}?key=${config.apiKey}`
		);
		Helpers.assertStatusCode(response, 200);
		const xmlRes = await API.getXMLFromResponse(response);
		assert.equal(parseInt(Helpers.xpathEval(xmlRes, '/atom:entry/zapi:numCollections')), 1);
	});

	it('testNewMultipleCollections', async function () {
		const xml = await API.createCollection('Test Collection 1', false, true);
		const data = await API.parseDataFromAtomEntry(xml);

		const name1 = 'Test Collection 2';
		const name2 = 'Test Subcollection';
		const parent2 = data.key;

		const json = {
			collections: [
				{
					name: name1,
				},
				{
					name: name2,
					parentCollection: parent2,
				},
			],
		};

		const response = await API.userPost(
			config.userID,
			`collections?key=${config.apiKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);

		Helpers.assertStatusCode(response, 200);
		const jsonResponse = await API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(jsonResponse.success), 2);
		const xmlResponse = await API.getCollectionXML(Object.keys(jsonResponse.success).map(key => jsonResponse.success[key]));
		assert.equal(parseInt(Helpers.xpathEval(xmlResponse, '/atom:feed/zapi:totalResults')), 2);

		const contents = Helpers.xpathEval(xmlResponse, '/atom:feed/atom:entry/atom:content', false, true);
		let content = JSON.parse(contents.shift());
		assert.equal(name1, content.name);
		assert.notOk(content.parentCollection);
		content = JSON.parse(contents.shift());
		assert.equal(name2, content.name);
		assert.equal(parent2, content.parentCollection);
	});

	it('testEditMultipleCollections', async function () {
		let xml = await API.createCollection("Test 1", false, true, 'atom');
		let data = await API.parseDataFromAtomEntry(xml);
		let key1 = data.key;
		xml = await API.createCollection("Test 2", false, true, 'atom');
		data = await API.parseDataFromAtomEntry(xml);
		let key2 = data.key;

		let newName1 = "Test 1 Modified";
		let newName2 = "Test 2 Modified";
		let response = await API.userPost(
			config.userID,
			"collections?key=" + config.apiKey,
			JSON.stringify({
				collections: [
					{
						collectionKey: key1,
						name: newName1
					},
					{
						collectionKey: key2,
						name: newName2
					}
				]
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": data.version
			}
		);
		Helpers.assertStatusCode(response, 200);
		let json = await API.getJSONFromResponse(response);

		assert.lengthOf(Object.keys(json.success), 2);
		xml = await API.getCollectionXML(Object.keys(json.success).map(key => json.success[key]));
		assert.equal(parseInt(Helpers.xpathEval(xml, '/atom:feed/zapi:totalResults')), 2);

		let contents = Helpers.xpathEval(xml, '/atom:feed/atom:entry/atom:content', false, true);
		let content = JSON.parse(contents[0]);
		assert.equal(content.name, newName1);
		assert.notOk(content.parentCollection);
		content = JSON.parse(contents[1]);
		assert.equal(content.name, newName2);
		assert.notOk(content.parentCollection);
	});

	it('testCollectionItemChange', async function () {
		const collectionKey1 = await API.createCollection('Test', false, true, 'key');
		const collectionKey2 = await API.createCollection('Test', false, true, 'key');

		let xml = await API.createItem('book', {
			collections: [collectionKey1],
		}, true, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		const itemKey1 = data.key;
		const itemVersion1 = data.version;
		let json = JSON.parse(data.content);
		assert.equal(json.collections[0], collectionKey1);

		xml = await API.createItem('journalArticle', {
			collections: [collectionKey2],
		}, true, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		const itemKey2 = data.key;
		const itemVersion2 = data.version;
		json = JSON.parse(data.content);
		assert.equal(json.collections[0], collectionKey2);

		xml = await API.getCollectionXML(collectionKey1);
		
		assert.equal(parseInt(Helpers.xpathEval(xml, '//atom:entry/zapi:numItems')), 1);

		xml = await API.getCollectionXML(collectionKey2);
		let collectionData2 = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//atom:entry/zapi:numItems')), 1);

		var libraryVersion = await API.getLibraryVersion();

		// Add items to collection
		var response = await API.userPatch(
			config.userID,
			`items/${itemKey1}?key=${config.apiKey}`,
			JSON.stringify({
				collections: [collectionKey1, collectionKey2],
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion1,
			}
		);
		Helpers.assertStatusCode(response, 204);

		// Item version should change
		xml = await API.getItemXML(itemKey1);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(data.version), parseInt(libraryVersion) + 1);

		// Collection timestamp shouldn't change, but numItems should
		xml = await API.getCollectionXML(collectionKey2);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//atom:entry/zapi:numItems')), 2);
		assert.equal(data.version, collectionData2.version);
		collectionData2 = data;

		libraryVersion = await API.getLibraryVersion();

		// Remove collections
		response = await API.userPatch(
			config.userID,
			`items/${itemKey2}?key=${config.apiKey}`,
			JSON.stringify({ collections: [] }),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion2,
			}
		);
		Helpers.assertStatusCode(response, 204);

		// Item version should change
		xml = await API.getItemXML(itemKey2);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(data.version), parseInt(libraryVersion) + 1);

		// Collection timestamp shouldn't change, but numItems should
		xml = await API.getCollectionXML(collectionKey2);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//atom:entry/zapi:numItems')), 1);
		assert.equal(data.version, collectionData2.version);

		// Check collections arrays and numItems
		xml = await API.getItemXML(itemKey1);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.lengthOf(json.collections, 2);
		assert.include(json.collections, collectionKey1);
		assert.include(json.collections, collectionKey2);

		xml = await API.getItemXML(itemKey2);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.lengthOf(json.collections, 0);

		xml = await API.getCollectionXML(collectionKey1);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//atom:entry/zapi:numItems')), 1);

		xml = await API.getCollectionXML(collectionKey2);
		assert.equal(parseInt(Helpers.xpathEval(xml, '//atom:entry/zapi:numItems')), 1);
	});

	it('testCollectionChildItemError', async function () {
		const collectionKey = await API.createCollection('Test', false, this, 'key');

		const key = await API.createItem('book', {}, true, 'key');
		const xml = await API.createNoteItem('<p>Test Note</p>', key, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		json.collections = [collectionKey];
		json.relations = {};

		const response = await API.userPut(
			config.userID,
			`items/${data.key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assertStatusCode(response, 400, 'Child items cannot be assigned to collections');
	});

	it('testCollectionItems', async function () {
		const collectionKey = await API.createCollection('Test', false, true, 'key');
		
		let xml = await API.createItem("book", { collections: [collectionKey] }, this);
		let data = await API.parseDataFromAtomEntry(xml);
		let itemKey1 = data.key;
		let json = JSON.parse(data.content);
		assert.deepEqual([collectionKey], json.collections);
		
		xml = await API.createItem("journalArticle", { collections: [collectionKey] }, true);
		data = await API.parseDataFromAtomEntry(xml);
		let itemKey2 = data.key;
		json = JSON.parse(data.content);
		assert.deepEqual([collectionKey], json.collections);
		
		let childItemKey1 = await API.createAttachmentItem("linked_url", [], itemKey1, true, 'key');
		let childItemKey2 = await API.createAttachmentItem("linked_url", [], itemKey2, true, 'key');
		
		const response1 = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items?key=${config.apiKey}&format=keys`
		);
		Helpers.assertStatusCode(response1, 200);
		let keys = response1.data.split("\n").map(key => key.trim()).filter(key => key.length != 0);
		assert.lengthOf(keys, 4);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
		assert.include(keys, childItemKey1);
		assert.include(keys, childItemKey2);
		
		const response2 = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items/top?key=${config.apiKey}&format=keys`
		);
		Helpers.assertStatusCode(response2, 200);
		keys = response2.data.split("\n").map(key => key.trim()).filter(key => key.length != 0);
		assert.lengthOf(keys, 2);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
	});
});
