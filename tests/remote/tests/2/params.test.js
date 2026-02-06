/**
 * Params tests for API v2
 * Port of tests/remote/tests/API/2/ParamsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assertNumResults
} from '../../assertions2.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Params (API v2)', function () {
	this.timeout(60000);

	let collectionKeys = [];
	let itemKeys = [];
	let searchKeys = [];

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	beforeEach(async function () {
		await API.userClear(config.get('userID'));
		collectionKeys = [];
		itemKeys = [];
		searchKeys = [];
	});

	// PHP: testFormatKeys
	it('should support format=keys', async function () {
		// Create collections
		for (let i = 0; i < 5; i++) {
			collectionKeys.push(await API.createCollection('Test', false, 'key'));
		}

		// Create items
		for (let i = 0; i < 5; i++) {
			itemKeys.push(await API.createItem('book', false, 'key'));
		}
		itemKeys.push(await API.createAttachmentItem('imported_file', {}, false, 'key'));

		// Create searches
		for (let i = 0; i < 5; i++) {
			searchKeys.push(await API.createSearch('Test', 'default', 'key'));
		}

		// Test format=keys for each type
		for (let objectType of ['collection', 'item', 'search']) {
			let objectTypePlural = API.getPluralObjectType(objectType);
			let expectedKeys = objectType === 'collection'
				? collectionKeys
				: objectType === 'item' ? itemKeys : searchKeys;

			let response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?key=${config.get('apiKey')}&format=keys`
			);
			assert200(response);

			let keys = response.getBody().trim().split('\n');
			keys.sort();
			let sortedExpected = [...expectedKeys].sort();
			assert.deepEqual(keys, sortedExpected);
		}
	});

	// PHP: testObjectKeyParameter
	it('should support object key parameter', async function () {
		for (let objectType of ['collection', 'item', 'search']) {
			let objectTypePlural = API.getPluralObjectType(objectType);
			let keys = [];

			// Create objects
			if (objectType === 'collection') {
				let xml1 = await API.createCollection('Name', false, 'atom');
				keys.push(API.parseDataFromAtomEntry(xml1).key);
				let xml2 = await API.createCollection('Name', false, 'atom');
				keys.push(API.parseDataFromAtomEntry(xml2).key);
			}
			else if (objectType === 'item') {
				let xml1 = await API.createItem('book', false, 'atom');
				keys.push(API.parseDataFromAtomEntry(xml1).key);
				let xml2 = await API.createItem('book', false, 'atom');
				keys.push(API.parseDataFromAtomEntry(xml2).key);
			}
			else {
				let xml1 = await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'atom');
				keys.push(API.parseDataFromAtomEntry(xml1).key);
				let xml2 = await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'atom');
				keys.push(API.parseDataFromAtomEntry(xml2).key);
			}

			// Single key
			let response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?key=${config.get('apiKey')}&content=json&${objectType}Key=${keys[0]}`
			);
			assert200(response);
			assertNumResults(response, 1);
			let xml = API.getXMLFromResponse(response);
			let data = API.parseDataFromAtomEntry(xml);
			assert.equal(data.key, keys[0]);

			// Multiple keys
			response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?key=${config.get('apiKey')}&content=json&${objectType}Key=${keys[0]},${keys[1]}&order=${objectType}KeyList`
			);
			assert200(response);
			assertNumResults(response, 2);
			xml = API.getXMLFromResponse(response);
			let keyNodes = xpathSelect(xml, '//atom:entry/zapi:key/text()');
			assert.equal(keyNodes[0].nodeValue, keys[0]);
			assert.equal(keyNodes[1].nodeValue, keys[1]);
		}
	});

	// PHP: testCollectionQuickSearch
	it('should support collection quick search', async function () {
		let title1 = 'Test Title';
		let title2 = 'Another Title';

		let keys = [];
		keys.push(await API.createCollection(title1, {}, 'key'));
		keys.push(await API.createCollection(title2, {}, 'key'));

		// Search by title
		let response = await API.userGet(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}&content=json&q=another`
		);
		assert200(response);
		assertNumResults(response, 1);
		let xml = API.getXMLFromResponse(response);
		let keyNode = xpathSelect(xml, '//atom:entry/zapi:key/text()', true);
		assert.equal(keyNode.nodeValue, keys[1]);

		// No results
		response = await API.userGet(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}&content=json&q=nothing`
		);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: testItemQuickSearch
	it('should support item quick search', async function () {
		let title1 = 'Test Title';
		let title2 = 'Another Title';
		let year2 = '2013';

		let keys = [];
		keys.push(await API.createItem('book', { title: title1 }, 'key'));
		keys.push(await API.createItem('journalArticle', {
			title: title2,
			date: `November 25, ${year2}`
		}, 'key'));

		// Search by title
		let response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json&q=${encodeURIComponent(title1)}`
		);
		assert200(response);
		assertNumResults(response, 1);
		let xml = API.getXMLFromResponse(response);
		let keyNode = xpathSelect(xml, '//atom:entry/zapi:key/text()', true);
		assert.equal(keyNode.nodeValue, keys[0]);

		// Search by year
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json&q=${year2}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		keyNode = xpathSelect(xml, '//atom:entry/zapi:key/text()', true);
		assert.equal(keyNode.nodeValue, keys[1]);

		// Search by year + 1 (no results)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json&q=${parseInt(year2) + 1}`
		);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: testItemQuickSearchOrderByDate
	it('should support item quick search order by date', async function () {
		let title1 = 'Test Title';
		let title2 = 'Another Title';

		let keys = [];
		keys.push(await API.createItem('book', {
			title: title1,
			date: 'February 12, 2013'
		}, 'key'));
		keys.push(await API.createItem('journalArticle', {
			title: title2,
			date: 'November 25, 2012'
		}, 'key'));

		// Search for one by title
		let response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json&q=${encodeURIComponent(title1)}`
		);
		assert200(response);
		assertNumResults(response, 1);
		let xml = API.getXMLFromResponse(response);
		let keyNode = xpathSelect(xml, '//atom:entry/zapi:key/text()', true);
		assert.equal(keyNode.nodeValue, keys[0]);

		// Search both by title, date asc
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json&q=title&order=date&sort=asc`
		);
		assert200(response);
		assertNumResults(response, 2);
		xml = API.getXMLFromResponse(response);
		let keyNodes = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		assert.equal(keyNodes[0].nodeValue, keys[1]);
		assert.equal(keyNodes[1].nodeValue, keys[0]);

		// Search both by title, date desc
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json&q=title&order=date&sort=desc`
		);
		assert200(response);
		assertNumResults(response, 2);
		xml = API.getXMLFromResponse(response);
		keyNodes = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		assert.equal(keyNodes[0].nodeValue, keys[0]);
		assert.equal(keyNodes[1].nodeValue, keys[1]);
	});
});
