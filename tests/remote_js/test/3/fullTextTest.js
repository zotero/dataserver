const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('FullTextTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});

	this.beforeEach(async function () {
		API.useAPIKey(config.apiKey);
	});

	it('testContentAnonymous', async function () {
		API.useAPIKey(false);
		const response = await API.userGet(
			config.userID,
			'items/AAAAAAAA/fulltext',
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert403(response);
	});

	it('testModifyAttachmentWithFulltext', async function () {
		let key = await API.createItem("book", false, this, 'key');
		let json = await API.createAttachmentItem("imported_url", [], key, this, 'jsonData');
		let attachmentKey = json.key;
		let content = "Here is some full-text content";
		let pages = 50;

		// Store content
		let response = await API.userPut(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);

		json.title = "This is a new attachment title";
		json.contentType = 'text/plain';

		// Modify attachment item
		response = await API.userPut(
			config.userID,
			"items/" + attachmentKey,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": json.version }
		);
		Helpers.assert204(response);
	});

	it('testSetItemContentMultiple', async function () {
		let key = await API.createItem("book", false, this, 'key');
		let attachmentKey1 = await API.createAttachmentItem("imported_url", [], key, this, 'key');
		let attachmentKey2 = await API.createAttachmentItem("imported_url", [], key, this, 'key');

		let libraryVersion = await API.getLibraryVersion();

		let json = [
			{
				key: attachmentKey1,
				content: "Here is some full-text content",
				indexedPages: 50,
				totalPages: 50,
				invalidParam: "shouldBeIgnored"
			},
			{
				content: "This is missing a key and should be skipped",
				indexedPages: 20,
				totalPages: 40
			},
			{
				key: attachmentKey2,
				content: "Here is some more full-text content",
				indexedPages: 20,
				totalPages: 40
			}
		];

		// No Content-Type
		let response = await API.userPost(
			config.userID,
			"fulltext",
			JSON.stringify(json),
			{
				"If-Unmodified-Since-Version": libraryVersion
			}
		);
		Helpers.assert400(response, "Content-Type must be application/json");

		// No If-Unmodified-Since-Version
		response = await API.userPost(
			config.userID,
			"fulltext",
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert428(response, "If-Unmodified-Since-Version not provided");

		// Store content
		response = await API.userPost(
			config.userID,
			"fulltext",
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": libraryVersion
			}
		);

		Helpers.assert200(response);
		Helpers.assert200ForObject(response, { index: 0 });
		Helpers.assert400ForObject(response, { index: 1 });
		Helpers.assert200ForObject(response, { index: 2 });
		let newLibraryVersion = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(newLibraryVersion), parseInt(libraryVersion));
		libraryVersion = newLibraryVersion;

		let originalJSON = json;

		// Retrieve content
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey1 + "/fulltext"
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		Helpers.assertEquals(originalJSON[0].content, json.content);
		Helpers.assertEquals(originalJSON[0].indexedPages, json.indexedPages);
		Helpers.assertEquals(originalJSON[0].totalPages, json.totalPages);
		assert.notProperty(json, "indexedChars");
		assert.notProperty(json, "invalidParam");
		Helpers.assertEquals(libraryVersion, response.headers['last-modified-version'][0]);

		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey2 + "/fulltext"
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		Helpers.assertEquals(originalJSON[2].content, json.content);
		Helpers.assertEquals(originalJSON[2].indexedPages, json.indexedPages);
		Helpers.assertEquals(originalJSON[2].totalPages, json.totalPages);
		assert.notProperty(json, "indexedChars");
		assert.notProperty(json, "invalidParam");
		Helpers.assertEquals(libraryVersion, response.headers['last-modified-version'][0]);
	});

	it('testSetItemContent', async function () {
		let response = await API.createItem("book", false, this, 'key');
		let attachmentKey = await API.createAttachmentItem("imported_url", [], response, this, 'key');

		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext"
		);
		Helpers.assert404(response);
		assert.notOk(response.headers['last-modified-version']);

		let libraryVersion = await API.getLibraryVersion();

		let content = "Here is some full-text content";
		let pages = 50;

		// No Content-Type
		response = await API.userPut(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
			content
		);
		Helpers.assert400(response, "Content-Type must be application/json");

		// Store content
		response = await API.userPut(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages,
				invalidParam: "shouldBeIgnored"
			}),
			{ "Content-Type": "application/json" }
		);

		Helpers.assert204(response);
		let contentVersion = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(contentVersion), parseInt(libraryVersion));

		// Retrieve it
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext"
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		let json = JSON.parse(await response.data);
		Helpers.assertEquals(content, json.content);
		assert.property(json, 'indexedPages');
		assert.property(json, 'totalPages');
		Helpers.assertEquals(pages, json.indexedPages);
		Helpers.assertEquals(pages, json.totalPages);
		assert.notProperty(json, "indexedChars");
		assert.notProperty(json, "invalidParam");
		Helpers.assertEquals(contentVersion, response.headers['last-modified-version'][0]);
	});

	// Requires ES
	it('testSearchItemContent', async function () {
		this.skip();
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		let parentKey = await API.createItem("book", { collections: [collectionKey] }, this, 'key');
		let json = await API.createAttachmentItem("imported_url", [], parentKey, this, 'jsonData');
		let attachmentKey = json.key;

		let response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext"
		);
		Helpers.assert404(response);

		let content = "Here is some unique full-text content";
		let pages = 50;

		// Store content
		response = await API.userPut(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages
			}),
			{ "Content-Type": "application/json" }
		);

		Helpers.assert204(response);

		// Wait for indexing via Lambda
		await new Promise(resolve => setTimeout(resolve, 6000));

		// Search for nonexistent word
		response = await API.userGet(
			config.userID,
			"items?q=nothing&qmode=everything&format=keys"
		);
		Helpers.assert200(response);
		Helpers.assertEquals("", response.data.trim());

		// Search for a word
		response = await API.userGet(
			config.userID,
			"items?q=unique&qmode=everything&format=keys"
		);
		Helpers.assert200(response);
		Helpers.assertEquals(attachmentKey, response.data.trim());

		// Search for a phrase
		response = await API.userGet(
			config.userID,
			"items?q=unique%20full-text&qmode=everything&format=keys"
		);
		Helpers.assert200(response);
		Helpers.assertEquals(attachmentKey, response.data.trim());

		// Search for a phrase in /top
		response = await API.userGet(
			config.userID,
			"items/top?q=unique%20full-text&qmode=everything&format=keys"
		);
		Helpers.assert200(response);
		Helpers.assertEquals(parentKey, response.data.trim());

		// Search for a phrase in a collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items?q=unique%20full-text&qmode=everything&format=keys"
		);
		Helpers.assert200(response);
		Helpers.assertEquals(attachmentKey, response.data.trim());

		// Search for a phrase in a collection
		response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items/top?q=unique%20full-text&qmode=everything&format=keys"
		);
		Helpers.assert200(response);
		Helpers.assertEquals(parentKey, response.data.trim());
	});

	it('testSinceContent', async function () {
		await _testSinceContent('since');
		await _testSinceContent('newer');
	});

	const _testSinceContent = async (param) => {
		await API.userClear(config.userID);

		// Store content for one item
		let key = await API.createItem("book", false, true, 'key');
		let json = await API.createAttachmentItem("imported_url", [], key, true, 'jsonData');
		let key1 = json.key;

		let content = "Here is some full-text content";

		let response = await API.userPut(
			config.userID,
			`items/${key1}/fulltext`,
			JSON.stringify([{ content: content }]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		let contentVersion1 = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(contentVersion1), 0);

		// And another
		key = await API.createItem("book", false, true, 'key');
		json = await API.createAttachmentItem("imported_url", [], key, true, 'jsonData');
		let key2 = json.key;

		response = await API.userPut(
			config.userID,
			`items/${key2}/fulltext`,
			JSON.stringify({ content: content }),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		let contentVersion2 = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(contentVersion2), 0);

		// Get newer one
		response = await API.userGet(
			config.userID,
			`fulltext?${param}=${contentVersion1}`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		Helpers.assertEquals(contentVersion2, response.headers['last-modified-version'][0]);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 1);
		assert.property(json, key2);
		Helpers.assertEquals(contentVersion2, json[key2]);

		// Get both with since=0
		response = await API.userGet(
			config.userID,
			`fulltext?${param}=0`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 2);
		assert.property(json, key1);
		Helpers.assertEquals(contentVersion1, json[key1]);
		assert.property(json, key1);
		Helpers.assertEquals(contentVersion2, json[key2]);
	};

	it('testDeleteItemContent', async function () {
		let key = await API.createItem("book", false, this, 'key');
		let attachmentKey = await API.createAttachmentItem("imported_file", [], key, this, 'key');

		let content = "Ыюм мютат дэбетиз конвынёры эю, ку мэль жкрипта трактатоз.\nПро ут чтэт эрепюят граэкйж, дуо нэ выро рыкючабо пырикюлёз.";

		// Store content
		let response = await API.userPut(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
			JSON.stringify({
				content: content,
				indexedPages: 50
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		let contentVersion = response.headers['last-modified-version'][0];

		// Retrieve it
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext"
		);
		Helpers.assert200(response);
		let json = JSON.parse(response.data);
		Helpers.assertEquals(content, json.content);
		Helpers.assertEquals(50, json.indexedPages);

		// Set to empty string
		response = await API.userPut(
			config.userID,
			"items/" + attachmentKey + "/fulltext",
			JSON.stringify({
				content: ""
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		assert.isAbove(parseInt(response.headers['last-modified-version'][0]), parseInt(contentVersion));

		// Make sure it's gone
		response = await API.userGet(
			config.userID,
			"items/" + attachmentKey + "/fulltext"
		);
		Helpers.assert200(response);
		json = JSON.parse(response.data);
		Helpers.assertEquals("", json.content);
		assert.notProperty(json, "indexedPages");
	});

	it('testVersionsAnonymous', async function () {
		API.useAPIKey(false);
		const response = await API.userGet(
			config.userID,
			"fulltext"
		);
		Helpers.assert403(response);
	});
});
