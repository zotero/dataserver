/**
 * Collection tests for API v2
 * Port of tests/remote/tests/API/2/CollectionTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert204,
	assert400
} from '../../assertions3.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Collections (API v2)', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testNewCollection
	it('should create new collection', async function () {
		let name = 'Test Collection';
		let xml = await API.createCollection(name, false, 'atom');
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), 1);

		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(json.name, name);
	});

	// PHP: testNewSubcollection
	it('should create new subcollection', async function () {
		let parentXml = await API.createCollection('Parent', false, 'atom');
		let parentData = API.parseDataFromAtomEntry(parentXml);
		let parent = parentData.key;

		let name = 'Test Subcollection';
		let xml = await API.createCollection(name, parent, 'atom');
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), 1);

		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(json.name, name);
		assert.equal(json.parentCollection, parent);

		let response = await API.userGet(
			config.get('userID'),
			`collections/${parent}?key=${config.get('apiKey')}`
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		let numCollections = xpathSelect(xml, '/atom:entry/zapi:numCollections/text()', true);
		assert.equal(parseInt(numCollections.nodeValue), 1);
	});

	// PHP: testNewMultipleCollections
	it('should create new multiple collections', async function () {
		let xml = await API.createCollection('Test Collection 1', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);

		let name1 = 'Test Collection 2';
		let name2 = 'Test Subcollection';
		let parent2 = data.key;

		let json = {
			collections: [
				{ name: name1 },
				{ name: name2, parentCollection: parent2 }
			]
		};

		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);

		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(responseJSON.success), 2);
		xml = await API.getCollectionXML(Object.values(responseJSON.success));
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), 2);

		let contents = xpathSelect(xml, '/atom:feed/atom:entry/atom:content/text()');
		let content = JSON.parse(contents[0].nodeValue);
		assert.equal(content.name, name1);
		assert.isFalse(content.parentCollection);
		content = JSON.parse(contents[1].nodeValue);
		assert.equal(content.name, name2);
		assert.equal(content.parentCollection, parent2);
	});

	// PHP: testEditMultipleCollections
	it('should edit multiple collections', async function () {
		let xml1 = await API.createCollection('Test 1', false, 'atom');
		let data1 = API.parseDataFromAtomEntry(xml1);
		let key1 = data1.key;

		let xml2 = await API.createCollection('Test 2', false, 'atom');
		let data2 = API.parseDataFromAtomEntry(xml2);
		let key2 = data2.key;

		let newName1 = 'Test 1 Modified';
		let newName2 = 'Test 2 Modified';

		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify({
				collections: [
					{ collectionKey: key1, name: newName1 },
					{ collectionKey: key2, name: newName2 }
				]
			}),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${data2.version}`
			]
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.success), 2);

		let xml = await API.getCollectionXML(Object.values(json.success));
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), 2);

		let contents = xpathSelect(xml, '/atom:feed/atom:entry/atom:content/text()');
		let content = JSON.parse(contents[0].nodeValue);
		assert.equal(content.name, newName1);
		assert.isFalse(content.parentCollection);
		content = JSON.parse(contents[1].nodeValue);
		assert.equal(content.name, newName2);
		assert.isFalse(content.parentCollection);
	});

	// PHP: testCollectionItemChange
	it('should handle collection item change', async function () {
		let collectionKey1 = await API.createCollection('Test', false, 'key');
		let collectionKey2 = await API.createCollection('Test', false, 'key');

		let xml = await API.createItem('book', {
			collections: [collectionKey1]
		}, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let itemKey1 = data.key;
		let itemVersion1 = data.version;
		let json = JSON.parse(data.content);
		assert.deepEqual(json.collections, [collectionKey1]);

		xml = await API.createItem('journalArticle', {
			collections: [collectionKey2]
		}, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let itemKey2 = data.key;
		let itemVersion2 = data.version;
		json = JSON.parse(data.content);
		assert.deepEqual(json.collections, [collectionKey2]);

		xml = await API.getCollectionXML(collectionKey1);
		let numItems = xpathSelect(xml, '//atom:entry/zapi:numItems/text()', true);
		assert.equal(parseInt(numItems.nodeValue), 1);

		xml = await API.getCollectionXML(collectionKey2);
		let collectionData2 = API.parseDataFromAtomEntry(xml);
		numItems = xpathSelect(xml, '//atom:entry/zapi:numItems/text()', true);
		assert.equal(parseInt(numItems.nodeValue), 1);

		let libraryVersion = await API.getLibraryVersion();

		// Add items to collection
		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey1}?key=${config.get('apiKey')}`,
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
		xml = await API.getItemXML(itemKey1);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(data.version), libraryVersion + 1);

		// Collection timestamp shouldn't change, but numItems should
		xml = await API.getCollectionXML(collectionKey2);
		data = API.parseDataFromAtomEntry(xml);
		numItems = xpathSelect(xml, '//atom:entry/zapi:numItems/text()', true);
		assert.equal(parseInt(numItems.nodeValue), 2);
		assert.equal(collectionData2.version, data.version);
		collectionData2 = data;

		libraryVersion = await API.getLibraryVersion();

		// Remove collections
		response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey2}?key=${config.get('apiKey')}`,
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
		xml = await API.getItemXML(itemKey2);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(data.version), libraryVersion + 1);

		// Collection timestamp shouldn't change, but numItems should
		xml = await API.getCollectionXML(collectionKey2);
		data = API.parseDataFromAtomEntry(xml);
		numItems = xpathSelect(xml, '//atom:entry/zapi:numItems/text()', true);
		assert.equal(parseInt(numItems.nodeValue), 1);
		assert.equal(collectionData2.version, data.version);

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
		numItems = xpathSelect(xml, '//atom:entry/zapi:numItems/text()', true);
		assert.equal(parseInt(numItems.nodeValue), 1);

		xml = await API.getCollectionXML(collectionKey2);
		numItems = xpathSelect(xml, '//atom:entry/zapi:numItems/text()', true);
		assert.equal(parseInt(numItems.nodeValue), 1);
	});

	// PHP: testCollectionChildItemError
	it('should handle collection child item error', async function () {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let key = await API.createItem('book', {}, 'key');
		let xml = await API.createNoteItem('<p>Test Note</p>', key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		json.collections = [collectionKey];
		json.relations = {};

		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.equal(response.getBody(), 'Child items cannot be assigned to collections');
	});

	// PHP: testCollectionItems
	it('should get collection items', async function () {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let xml = await API.createItem('book', { collections: [collectionKey] }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let itemKey1 = data.key;
		let json = JSON.parse(data.content);
		assert.deepEqual(json.collections, [collectionKey]);

		xml = await API.createItem('journalArticle', { collections: [collectionKey] }, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let itemKey2 = data.key;
		json = JSON.parse(data.content);
		assert.deepEqual(json.collections, [collectionKey]);

		let childItemKey1 = await API.createAttachmentItem('linked_url', {}, itemKey1, 'key');
		let childItemKey2 = await API.createAttachmentItem('linked_url', {}, itemKey2, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items?key=${config.get('apiKey')}&format=keys`
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
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&format=keys`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, itemKey1);
		assert.include(keys, itemKey2);
	});
});
