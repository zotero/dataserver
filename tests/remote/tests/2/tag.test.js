/**
 * Tag tests for API v2
 * Port of tests/remote/tests/API/2/TagTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert204,
	assert400ForObject,
	assert412,
	assert428,
	assertNumResults
} from '../../assertions2.js';
import { setup } from '../../setup.js';

describe('Tags (API v2)', function() {
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

	// PHP: test_empty_tag_should_be_ignored
	it('should ignore empty tag', async function() {
		let json = await API.getItemTemplate('book');
		json.tags.push({
			tag: '',
			type: 1
		});

		let response = await API.postItem(json);
		assert200(response);
	});

	// PHP: testInvalidTagObject
	it('should reject invalid tag object', async function() {
		let json = await API.getItemTemplate('book');
		json.tags.push(['invalid']);

		let response = await API.postItem(json);
		assert400ForObject(response, 'Tag must be an object');
	});

	// PHP: testItemTagSearch
	it('should handle item tag search', async function() {
		await API.userClear(config.get('userID'));

		// Create items with tags
		let key1 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'key');

		let key2 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'key');

		// a (both)
		let response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=a`
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// a and c (#2)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=a&tag=c`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key2);

		// b and c (none)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=b&tag=c`
		);
		assert200(response);
		assert.isEmpty(response.getBody().trim());

		// b or c (both)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=b%20||%20c`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// a or b or c (both)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=a%20||%20b%20||%20c`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// not a (none)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=-a`
		);
		assert200(response);
		assert.isEmpty(response.getBody().trim());

		// not b (#2)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=-b`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key2);

		// (b or c) and a (both)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=b%20||%20c&tag=a`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// not nonexistent (both)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=-z`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// B (case-insensitive search)
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&tag=B`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key1);
	});

	// PHP: testTagSearch
	it('should handle tag search', async function() {
		let tags1 = ['a', 'aa', 'b'];
		let tags2 = ['b', 'c', 'cc'];

		await API.createItem('book', {
			tags: tags1.map(tag => ({ tag }))
		}, 'key');

		await API.createItem('book', {
			tags: tags2.map(tag => ({ tag }))
		}, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&tag=${tags1.join('%20||%20')}`
		);
		assert200(response);
		assertNumResults(response, tags1.length);
	});

	// PHP: testTagNewer
	it('should handle tag newer', async function() {
		await API.userClear(config.get('userID'));

		// Create items with tags
		await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'key');

		let version = await API.getLibraryVersion();

		// 'newer' shouldn't return any results
		let response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&newer=${version}`
		);
		assert200(response);
		assertNumResults(response, 0);

		// Create another item with tags
		await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'key');

		// 'newer' should return new tag
		response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&newer=${version}`
		);
		assert200(response);
		assertNumResults(response, 1);
		assert.isAbove(parseInt(response.getHeader('Last-Modified-Version')), version);
		let content = API.getContentFromResponse(response);
		let json = JSON.parse(content);
		assert.equal(json.tag, 'c');
		assert.equal(json.type, 0);
	});

	// PHP: testMultiTagDelete
	it('should handle multi tag delete', async function() {
		await API.userClear(config.get('userID'));

		let tags1 = ['a', 'aa', 'b'];
		let tags2 = ['b', 'c', 'cc'];
		let tags3 = ['Foo'];

		await API.createItem('book', {
			tags: tags1.map(tag => ({ tag }))
		}, 'key');

		await API.createItem('book', {
			tags: tags2.map(tag => ({ tag, type: 1 }))
		}, 'key');

		await API.createItem('book', {
			tags: tags3.map(tag => ({ tag }))
		}, 'key');

		let libraryVersion = await API.getLibraryVersion();

		// Missing version header
		let response = await API.userDelete(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&tag=${[...tags1, ...tags2].join('%20||%20')}`
		);
		assert428(response);

		// Outdated version header
		response = await API.userDelete(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&tag=${[...tags1, ...tags2].join('%20||%20')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion - 1}`]
		);
		assert412(response);

		// Delete
		response = await API.userDelete(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&tag=${[...tags1, ...tags2].join('%20||%20')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);

		// Make sure they're gone
		response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&content=json&tag=${[...tags1, ...tags2, ...tags3].join('%20||%20')}`
		);
		assert200(response);
		assertNumResults(response, 1);
	});

	// PHP: testTagAddItemVersionChange
	it('should handle tag add item version change', async function() {
		await API.userClear(config.get('userID'));

		let xml1 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'atom');
		let data1 = API.parseDataFromAtomEntry(xml1);
		let json1 = JSON.parse(data1.content);
		let version1 = parseInt(data1.version);

		let xml2 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'atom');
		let data2 = API.parseDataFromAtomEntry(xml2);
		let json2 = JSON.parse(data2.content);
		let version2 = parseInt(data2.version);

		// Remove tag 'a' from item 1
		json1.tags = [
			{ tag: 'd' },
			{ tag: 'c' }
		];

		let response = await API.postItem(json1);
		assert200(response);

		// Item 1 version should be one greater than last update
		let xml = await API.getItemXML(json1.itemKey);
		let data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(data.version), version2 + 1);

		// Item 2 version shouldn't have changed
		xml = await API.getItemXML(json2.itemKey);
		data = API.parseDataFromAtomEntry(xml);
		assert.equal(parseInt(data.version), version2);
	});
});
