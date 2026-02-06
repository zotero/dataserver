/**
 * Full-text API tests
 * Port of tests/remote/tests/API/3/FullTextTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert204,
	assert400,
	assert403,
	assert404,
	assert428,
	assert200ForObject,
	assert400ForObject,
	assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Full Text', function () {
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

	// PHP: testVersionsAnonymous
	it('should deny anonymous access to versions', async function () {
		API.useAPIKey(false);
		let response = await API.userGet(
			config.get('userID'),
			'fulltext'
		);
		assert403(response);
		API.useAPIKey(config.get('apiKey'));
	});

	// PHP: testContentAnonymous
	it('should deny anonymous access to content', async function () {
		API.useAPIKey(false);
		let response = await API.userGet(
			config.get('userID'),
			'items/AAAAAAAA/fulltext'
		);
		assert403(response);
		API.useAPIKey(config.get('apiKey'));
	});

	// PHP: testSetItemContent
	it('should set item content', async function () {
		let key = await API.createItem('book', {}, 'key');
		let attachmentKey = await API.createAttachmentItem('imported_url', [], key, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`
		);
		assert404(response);
		assert.isNull(response.getHeader('Last-Modified-Version'));

		let libraryVersion = await API.getLibraryVersion();

		let content = 'Here is some full-text content';
		let pages = 50;

		// No Content-Type
		response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
			content
		);
		assert400(response, 'Content-Type must be application/json');

		// Store content
		response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
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
			`items/${attachmentKey}/fulltext`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json = JSON.parse(response.getBody());
		assert.equal(json.content, content);
		assert.property(json, 'indexedPages');
		assert.property(json, 'totalPages');
		assert.equal(json.indexedPages, pages);
		assert.equal(json.totalPages, pages);
		assert.notProperty(json, 'indexedChars');
		assert.notProperty(json, 'invalidParam');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), contentVersion);
	});

	// PHP: testSetItemContentMultiple
	it('should set item content for multiple items', async function () {
		let key = await API.createItem('book', {}, 'key');
		let attachmentKey1 = await API.createAttachmentItem('imported_url', [], key, 'key');
		let attachmentKey2 = await API.createAttachmentItem('imported_url', [], key, 'key');

		let libraryVersion = await API.getLibraryVersion();

		let json = [
			{
				key: attachmentKey1,
				content: 'Here is some full-text content',
				indexedPages: 50,
				totalPages: 50,
				invalidParam: 'shouldBeIgnored'
			},
			{
				content: 'This is missing a key and should be skipped',
				indexedPages: 20,
				totalPages: 40
			},
			{
				key: attachmentKey2,
				content: 'Here is some more full-text content',
				indexedPages: 20,
				totalPages: 40
			}
		];

		// No Content-Type
		let response = await API.userPost(
			config.get('userID'),
			'fulltext',
			JSON.stringify(json),
			[
				`If-Unmodified-Since-Version: ${libraryVersion}`
			]
		);
		assert400(response, 'Content-Type must be application/json');

		// No If-Unmodified-Since-Version
		response = await API.userPost(
			config.get('userID'),
			'fulltext',
			JSON.stringify(json),
			[
				'Content-Type: application/json'
			]
		);
		assert428(response, 'If-Unmodified-Since-Version not provided');

		// Store content
		response = await API.userPost(
			config.get('userID'),
			'fulltext',
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${libraryVersion}`
			]
		);

		assert200(response);
		assert200ForObject(response, false, 0);
		assert400ForObject(response, false, 1);
		assert200ForObject(response, false, 2);
		let newLibraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newLibraryVersion, libraryVersion);
		libraryVersion = newLibraryVersion;

		let originalJSON = json;

		// Retrieve content
		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey1}/fulltext`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.equal(json.content, originalJSON[0].content);
		assert.equal(json.indexedPages, originalJSON[0].indexedPages);
		assert.equal(json.totalPages, originalJSON[0].totalPages);
		assert.notProperty(json, 'indexedChars');
		assert.notProperty(json, 'invalidParam');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);

		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey2}/fulltext`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.equal(json.content, originalJSON[2].content);
		assert.equal(json.indexedPages, originalJSON[2].indexedPages);
		assert.equal(json.totalPages, originalJSON[2].totalPages);
		assert.notProperty(json, 'indexedChars');
		assert.notProperty(json, 'invalidParam');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);
	});

	// PHP: testModifyAttachmentWithFulltext
	it('should modify attachment with fulltext', async function () {
		let key = await API.createItem('book', {}, 'key');
		let json = await API.createAttachmentItem('imported_url', [], key, 'jsonData');
		let attachmentKey = json.key;
		let content = 'Here is some full-text content';
		let pages = 50;

		// Store content
		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		json.title = 'This is a new attachment title';
		json.contentType = 'text/plain';

		// Modify attachment item
		response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		assert204(response);
	});

	// PHP: testSinceContent
	it('should filter by since parameter', async function () {
		await testSinceContent('since');
	});

	// PHP: testSinceContent
	it('should filter by newer parameter', async function () {
		await testSinceContent('newer');
	});

	// PHP: testSearchItemContent
	it('should search item content', async function () {
		this.timeout(60000); // Increase timeout for this test due to sleep

		let collectionKey = await API.createCollection('Test', {}, 'key');
		let parentKey = await API.createItem(
			'book',
			{
				collections: [collectionKey]
			},
			'key'
		);
		let json = await API.createAttachmentItem('imported_url', [], parentKey, 'jsonData');
		let attachmentKey = json.key;

		let response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`
		);
		assert404(response);

		let content = 'Here is some unique full-text content';
		let pages = 50;

		// Store content
		response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages
			}),
			['Content-Type: application/json']
		);

		assert204(response);

		// Wait for indexing via Lambda
		await new Promise(resolve => setTimeout(resolve, 6000));

		// Search for nonexistent word
		response = await API.userGet(
			config.get('userID'),
			'items?q=nothing&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim(), '');

		// Search for a word
		response = await API.userGet(
			config.get('userID'),
			'items?q=unique&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim(), attachmentKey);

		// Search for a phrase
		response = await API.userGet(
			config.get('userID'),
			'items?q=unique%20full-text&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim(), attachmentKey);

		// Search for a phrase in /top
		response = await API.userGet(
			config.get('userID'),
			'items/top?q=unique%20full-text&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim(), parentKey);

		// Search for a phrase in a collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items?q=unique%20full-text&qmode=everything&format=keys`
		);
		assert200(response);
		assert.equal(response.getBody().trim(), attachmentKey);

		// Search for a phrase in a collection/top
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?q=unique%20full-text&qmode=everything&format=keys`
		);
		assert200(response);
		assert.equal(response.getBody().trim(), parentKey);
	});

	// PHP: testDeleteItemContent
	it('should delete item content', async function () {
		let key = await API.createItem('book', {}, 'key');
		let attachmentKey = await API.createAttachmentItem('imported_file', [], key, 'key');

		let content = 'Ыюм мютат дэбетиз конвынёры эю, ку мэль жкрипта трактатоз.\nПро ут чтэт эрепюят граэкйж, дуо нэ выро рыкючабо пырикюлёз.';

		// Store content
		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
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
			`items/${attachmentKey}/fulltext`
		);
		assert200(response);
		let json = JSON.parse(response.getBody());
		assert.equal(json.content, content);
		assert.equal(json.indexedPages, 50);

		// Set to empty string
		response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
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
			`items/${attachmentKey}/fulltext`
		);
		assert200(response);
		json = JSON.parse(response.getBody());
		assert.equal(json.content, '');
		assert.notProperty(json, 'indexedPages');
	});

	async function testSinceContent(param) {
		await API.userClear(config.get('userID'));

		// Store content for one item
		let key = await API.createItem('book', {}, 'key');
		let json = await API.createAttachmentItem('imported_url', [], key, 'jsonData');
		let key1 = json.key;

		let content = 'Here is some full-text content';

		let response = await API.userPut(
			config.get('userID'),
			`items/${key1}/fulltext`,
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
		json = await API.createAttachmentItem('imported_url', [], key, 'jsonData');
		let key2 = json.key;

		response = await API.userPut(
			config.get('userID'),
			`items/${key2}/fulltext`,
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
			`fulltext?${param}=${contentVersion1}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), contentVersion2);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 1);
		assert.property(json, key2);
		assert.equal(json[key2], contentVersion2);

		// Get both with since=0
		response = await API.userGet(
			config.get('userID'),
			`fulltext?${param}=0`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 2);
		assert.property(json, key1);
		assert.equal(json[key1], contentVersion1);
		assert.property(json, key1);
		assert.equal(json[key2], contentVersion2);
	}
});
