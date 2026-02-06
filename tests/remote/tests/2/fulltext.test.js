/**
 * Full-text tests for API v2
 * Port of tests/remote/tests/API/2/FullTextTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert204,
	assert400,
	assert404
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Full-text (API v2)', function () {
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

	// PHP: testSetItemContent
	it('should set item content', async function () {
		let key = await API.createItem('book', {}, 'key');
		let xml = await API.createAttachmentItem('imported_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);

		let response = await API.userGet(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`
		);
		assert404(response);
		assert.isNull(response.getHeader('Last-Modified-Version'));

		let libraryVersion = await API.getLibraryVersion();

		let content = 'Here is some full-text content';
		let pages = 50;

		// No Content-Type
		response = await API.userPut(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`,
			content
		);
		assert400(response, 'Content-Type must be application/json');

		// Store content
		response = await API.userPut(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`,
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages,
				invalidParam: 'shouldBeIgnored'
			}),
			['Content-Type: application/json']
		);

		assert204(response);
		let contentVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(contentVersion, libraryVersion);

		// Retrieve it
		response = await API.userGet(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`
		);
		assert200(response);
		assert.equal(response.getHeader('Content-Type'), 'application/json');
		let json = API.getJSONFromResponse(response);
		assert.equal(json.content, content);
		assert.property(json, 'indexedPages');
		assert.property(json, 'totalPages');
		assert.equal(json.indexedPages, pages);
		assert.equal(json.totalPages, pages);
		assert.notProperty(json, 'indexedChars');
		assert.notProperty(json, 'invalidParam');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), contentVersion);
	});

	// PHP: testModifyAttachmentWithFulltext
	it('should modify attachment with fulltext', async function () {
		let key = await API.createItem('book', {}, 'key');
		let xml = await API.createAttachmentItem('imported_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let content = 'Here is some full-text content';
		let pages = 50;

		// Store content
		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`,
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		let json = JSON.parse(data.content);
		json.title = 'This is a new attachment title';
		json.contentType = 'text/plain';

		// Modify attachment item
		response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${data.version}`]
		);
		assert204(response);
	});

	// PHP: testNewerContent
	it('should get newer content', async function () {
		await API.userClear(config.get('userID'));

		// Store content for one item
		let key = await API.createItem('book', {}, 'key');
		let xml = await API.createAttachmentItem('imported_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let key1 = data.key;

		let content = 'Here is some full-text content';

		let response = await API.userPut(
			config.get('userID'),
			`items/${key1}/fulltext?key=${config.get('apiKey')}`,
			JSON.stringify({
				content: content
			}),
			['Content-Type: application/json']
		);
		assert204(response);
		let contentVersion1 = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(contentVersion1, 0);

		// And another
		key = await API.createItem('book', {}, 'key');
		xml = await API.createAttachmentItem('imported_url', {}, key, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let key2 = data.key;

		response = await API.userPut(
			config.get('userID'),
			`items/${key2}/fulltext?key=${config.get('apiKey')}`,
			JSON.stringify({
				content: content
			}),
			['Content-Type: application/json']
		);
		assert204(response);
		let contentVersion2 = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(contentVersion2, 0);

		// Get newer one
		response = await API.userGet(
			config.get('userID'),
			`fulltext?key=${config.get('apiKey')}&newer=${contentVersion1}`
		);
		assert200(response);
		assert.equal(response.getHeader('Content-Type'), 'application/json');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), contentVersion2);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 1);
		assert.property(json, key2);
		assert.equal(json[key2], contentVersion2);

		// Get both with newer=0
		response = await API.userGet(
			config.get('userID'),
			`fulltext?key=${config.get('apiKey')}&newer=0`
		);
		assert200(response);
		assert.equal(response.getHeader('Content-Type'), 'application/json');
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 2);
		assert.property(json, key1);
		assert.equal(json[key1], contentVersion1);
		assert.property(json, key2);
		assert.equal(json[key2], contentVersion2);
	});

	// PHP: testDeleteItemContent
	it('should delete item content', async function () {
		let key = await API.createItem('book', {}, 'key');
		let xml = await API.createAttachmentItem('imported_file', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);

		let content = 'Ыюм мютат дэбетиз конвынёры эю, ку мэл жкрипта трактатоз.\nПро ут чтэт эрепюят граэкйж, дуо нэ выро рыкючабо пырикюлёз.';

		// Store content
		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`,
			JSON.stringify({
				content: content,
				indexedPages: 50
			}),
			['Content-Type: application/json']
		);
		assert204(response);
		let contentVersion = parseInt(response.getHeader('Last-Modified-Version'));

		// Retrieve it
		response = await API.userGet(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.content, content);
		assert.equal(json.indexedPages, 50);

		// Set to empty string
		response = await API.userPut(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`,
			JSON.stringify({
				content: ''
			}),
			['Content-Type: application/json']
		);
		assert204(response);
		assert.isAbove(parseInt(response.getHeader('Last-Modified-Version')), contentVersion);

		// Make sure it's gone
		response = await API.userGet(
			config.get('userID'),
			`items/${data.key}/fulltext?key=${config.get('apiKey')}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.equal(json.content, '');
		assert.notProperty(json, 'indexedPages');
	});
});
