/**
 * Collection API tests for API v1
 * Port of tests/remote/tests/API/1/CollectionTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200
} from '../../assertions3.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Collections (API v1)', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(1);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	let savedData = null;

	// PHP: testNewSingleCollection
	it('should create new single collection', async function () {
		let name = 'Test Collection';

		let json = {
			name: name,
			parent: false
		};

		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert200(response);

		let xml = API.getXMLFromResponse(response);
		// PHP: assertEquals(1, (int) array_get_first($xml->xpath('/atom:feed/zapi:totalResults')))
		let totalResultsNode = xpathSelect(xml, '/atom:feed/zapi:totalResults', true);
		assert.equal(parseInt(totalResultsNode?.textContent || '0'), 1);

		// PHP: assertEquals(0, (int) array_get_first($xml->xpath('//atom:entry/zapi:numCollections')))
		let numCollectionsNode = xpathSelect(xml, '//atom:entry/zapi:numCollections', true);
		assert.equal(parseInt(numCollectionsNode.textContent), 0);

		let data = API.parseDataFromAtomEntry(xml);
		savedData = data;

		let content = JSON.parse(data.content);
		assert.equal(content.name, name);
	});

	// PHP: testNewSingleSubcollection
	// @depends testNewSingleCollection
	it('should create new single subcollection', async function () {
		// Depends on testNewSingleCollection
		if (!savedData) {
			this.skip();
		}

		let name = 'Test Subcollection';
		let parent = savedData.key;

		let json = {
			name: name,
			parent: parent
		};

		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert200(response);

		let xml = API.getXMLFromResponse(response);
		// PHP: assertEquals(1, (int) array_get_first($xml->xpath('/atom:feed/zapi:totalResults')))
		let totalResultsNode = xpathSelect(xml, '/atom:feed/zapi:totalResults', true);
		assert.equal(parseInt(totalResultsNode?.textContent || '0'), 1);

		let data = API.parseDataFromAtomEntry(xml);

		let content = JSON.parse(data.content);
		assert.equal(content.name, name);
		assert.equal(content.parent, parent);

		// Check parent's numCollections
		response = await API.userGet(
			config.get('userID'),
			`collections/${parent}?key=${config.get('apiKey')}`
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);

		// PHP: assertEquals(1, (int) array_get_first($xml->xpath('/atom:entry/zapi:numCollections')))
		let numCollectionsNode = xpathSelect(xml, '/atom:entry/zapi:numCollections', true);
		assert.equal(parseInt(numCollectionsNode?.textContent || '0'), 1);
	});

	// PHP: testNewSingleCollectionWithoutParentProperty
	it('should create new single collection without parent property', async function () {
		let name = 'Test Collection';

		let json = {
			name: name
		};

		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);

		assert200(response);
		let xml = API.getXMLFromResponse(response);
		// PHP: assertEquals(1, (int) array_get_first($xml->xpath('/atom:feed/zapi:totalResults')))
		let totalResultsNode = xpathSelect(xml, '/atom:feed/zapi:totalResults', true);
		assert.equal(parseInt(totalResultsNode?.textContent || '0'), 1);

		let data = API.parseDataFromAtomEntry(xml);
		let content = JSON.parse(data.content);
		assert.equal(content.name, name);
	});

	// PHP: testEditSingleCollection
	it('should edit single collection', async function () {
		// PHP: API::useAPIVersion(2)
		// PHP: $xml = API::createCollection("Test", false, $this)
		API.useAPIVersion(2);
		let xml = await API.createCollection('Test', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;

		// PHP: API::useAPIVersion(1)
		// PHP: $xml = API::getCollectionXML($data['key'])
		API.useAPIVersion(1);
		xml = await API.getCollectionXML(key);

		// PHP: $etag = (string) array_get_first($xml->xpath('//atom:entry/atom:content/@etag'))
		let etagNode = xpathSelect(xml, '//atom:entry/atom:content/@etag', true);
		let etag = etagNode ? etagNode.nodeValue : null;

		// PHP: $this->assertNotNull($etag)
		assert.isNotNull(etag);

		let newName = 'Test 2';
		let json = {
			name: newName,
			parent: false
		};

		let response = await API.userPut(
			config.get('userID'),
			`collections/${key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Match: ${etag}`
			]
		);
		assert200(response);

		xml = API.getXMLFromResponse(response);
		data = API.parseDataFromAtomEntry(xml);
		let content = JSON.parse(data.content);
		assert.equal(content.name, newName);
	});
});
