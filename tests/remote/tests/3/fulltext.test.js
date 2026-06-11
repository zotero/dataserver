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
import {
	setFullTextDeindexed, getFullTextDeindexed,
	setFullTextReindexing, getFullTextReindexing
} from '../../dynamodb-helper.js';

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
		// First item in batch gets libraryVersion - 1 (per-item version bump)
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion - 1);

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

	it('should report a library with no full-text content as indexed', async function () {
		this.timeout(60000);

		await API.userClear(config.get('userID'));
		// Let any prior Elasticsearch deletions settle
		await new Promise(resolve => setTimeout(resolve, 6000));

		// Create an attachment but never upload full-text content for it
		let key = await API.createItem('book', {}, 'key');
		await API.createAttachmentItem('imported_url', [], key, 'key');

		// Nothing has been indexed and nothing is pending, so the library is fully indexed.
		let response = await API.userGet(
			config.get('userID'),
			'fulltext/index'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json = JSON.parse(response.getBody());
		assert.equal(json.status, 'indexed');
	});

	it('should report a library as indexed once all uploaded content is in the index', async function () {
		this.timeout(60000);

		await API.userClear(config.get('userID'));
		await new Promise(resolve => setTimeout(resolve, 6000));

		let key = await API.createItem('book', {}, 'key');
		let withContentKey = await API.createAttachmentItem('imported_url', [], key, 'key');
		// A second attachment that never gets full-text content
		await API.createAttachmentItem('imported_url', [], key, 'key');

		// Upload full-text content for only one of the two attachments
		let response = await API.userPut(
			config.get('userID'),
			`items/${withContentKey}/fulltext`,
			JSON.stringify({
				content: 'Here is some unique full-text content',
				indexedPages: 1,
				totalPages: 1
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		// Wait for indexing via Lambda
		await new Promise(resolve => setTimeout(resolve, 6000));

		// One attachment has content and is indexed; the other has none. The indexed doc
		// count matches the uploaded full-text count, so the library is fully indexed.
		response = await API.userGet(
			config.get('userID'),
			'fulltext/index'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json = JSON.parse(response.getBody());
		assert.equal(json.status, 'indexed');
	});

	it("shouldn't trigger a reindex from a full-text search when the library is not deindexed", async function () {
		// Ensure the library is in the steady state -- not deindexed, no rebuild
		// underway. The server reads the state from DynamoDB; this exercises that read
		// path (and the dataserver role's IAM) through the API without the test ever
		// needing the server to set the state itself.
		await setFullTextDeindexed(config.get('libraryID'), false);
		await setFullTextReindexing(config.get('libraryID'), false);

		let response = await API.userGet(
			config.get('userID'),
			'items?q=anything&qmode=everything&format=keys'
		);
		assert200(response);
		assert.isNull(response.getHeader('Zotero-Full-Text-Reindexing'));
		assert.isFalse(await getFullTextDeindexed(config.get('libraryID')));
		assert.isNull(await getFullTextReindexing(config.get('libraryID')));
	});

	it('should trigger a reindex from a full-text search when the library is deindexed', async function () {
		let libraryID = config.get('libraryID');

		// Simulate an external producer (indexer/purge) marking the library deindexed --
		// dataserver itself never sets the flag true, only reads it and clears it.
		await setFullTextReindexing(libraryID, false);
		await setFullTextDeindexed(libraryID, true);
		assert.isTrue(await getFullTextDeindexed(libraryID));

		// A full-text search in a deindexed library enqueues a rebuild -- the server
		// clears the flag, stamps 'reindexing' (conditional UpdateItem), and enqueues
		// the libraryID to the reindex queue, flagging the response so the client knows
		// the full-text results are missing
		let response = await API.userGet(
			config.get('userID'),
			'items?q=anything&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getHeader('Zotero-Full-Text-Reindexing'), '1');

		// The server cleared the flag and stamped the rebuild before enqueuing
		assert.isFalse(await getFullTextDeindexed(libraryID));
		let reindexing = await getFullTextReindexing(libraryID);
		assert.isNumber(reindexing);

		// While the rebuild is underway, searches report it without re-triggering
		response = await API.userGet(
			config.get('userID'),
			'items?q=anything&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getHeader('Zotero-Full-Text-Reindexing'), '1');
		assert.equal(await getFullTextReindexing(libraryID), reindexing);

		// Clean up the rebuild stamp, standing in for the reindexer Lambda
		await setFullTextReindexing(libraryID, false);
	});

	it('should re-trigger a stale rebuild from a full-text search', async function () {
		let libraryID = config.get('libraryID');

		// Simulate a rebuild that was enqueued long enough ago (server cutoff is six
		// hours) to be presumed dead
		await setFullTextDeindexed(libraryID, false);
		let staleTime = Math.round(Date.now() / 1000) - 7 * 60 * 60;
		await setFullTextReindexing(libraryID, staleTime);

		// The search re-enqueues the rebuild with a fresh stamp and reports it as
		// in progress
		let response = await API.userGet(
			config.get('userID'),
			'items?q=anything&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getHeader('Zotero-Full-Text-Reindexing'), '1');
		assert.isAbove(await getFullTextReindexing(libraryID), staleTime);

		// Clean up the rebuild stamp, standing in for the reindexer Lambda
		await setFullTextReindexing(libraryID, false);
	});

	it('should not index or surface uploaded content while the library is deindexed', async function () {
		this.timeout(60000);

		await API.userClear(config.get('userID'));
		// Let any prior Elasticsearch deletions settle
		await new Promise(resolve => setTimeout(resolve, 6000));

		let libraryID = config.get('libraryID');
		// Mark the library deindexed before uploading; the indexer's gate should skip it
		await setFullTextDeindexed(libraryID, true);

		let key = await API.createItem('book', {}, 'key');
		let attachmentKey = await API.createAttachmentItem('imported_url', [], key, 'key');

		// Upload full-text content with a distinctive word to search for
		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}/fulltext`,
			JSON.stringify({
				content: 'A wombat should never become searchable while deindexed',
				indexedPages: 1,
				totalPages: 1
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		// Wait the same window the "indexed" tests allow for the Lambda; if the gate works,
		// nothing is indexed in that time
		await new Promise(resolve => setTimeout(resolve, 6000));

		// Content is stored (expectedCount=1) but unindexed (indexedCount=0) because the
		// library is deindexed, so the status endpoint reports "deindexed"
		response = await API.userGet(config.get('userID'), 'fulltext/index');
		assert200(response);
		assertContentType(response, 'application/json');
		let json = JSON.parse(response.getBody());
		assert.equal(json.status, 'deindexed');

		// And the uploaded content is not searchable, with the everything search
		// flagging the missing full-text results and auto-triggering a rebuild,
		// which clears the flag
		response = await API.userGet(
			config.get('userID'),
			'items?q=wombat&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getBody().trim(), '');
		assert.equal(response.getHeader('Zotero-Full-Text-Reindexing'), '1');
		assert.isFalse(await getFullTextDeindexed(libraryID));

		// The rebuild is now underway: the status endpoint reports it with progress
		// counts, and further searches flag it
		response = await API.userGet(config.get('userID'), 'fulltext/index');
		assert200(response);
		json = JSON.parse(response.getBody());
		assert.equal(json.status, 'reindexing');
		assert.equal(json.expectedCount, 1);

		response = await API.userGet(
			config.get('userID'),
			'items?q=wombat&qmode=everything&format=keys'
		);
		assert200(response);
		assert.equal(response.getHeader('Zotero-Full-Text-Reindexing'), '1');

		// Clear the rebuild stamp, standing in for the reindexer Lambda, so later
		// tests/runs start clean
		await setFullTextReindexing(libraryID, false);

		// No header once the library index state is clear
		response = await API.userGet(
			config.get('userID'),
			'items?q=wombat&qmode=everything&format=keys'
		);
		assert200(response);
		assert.isNull(response.getHeader('Zotero-Full-Text-Reindexing'));
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
