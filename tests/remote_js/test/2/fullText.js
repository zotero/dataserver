const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('FullTextTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
	});

	it('testSetItemContent', async function () {
		const key = await API.createItem("book", false, this, 'key');
		const xml = await API.createAttachmentItem("imported_url", [], key, this, 'atom');
		const data = API.parseDataFromAtomEntry(xml);

		let response = await API.userGet(
			config.userID,
			"items/" + data.key + "/fulltext?key=" + config.apiKey
		);
		Helpers.assertStatusCode(response, 404);
		assert.isUndefined(response.headers["last-modified-version"]);

		const libraryVersion = await API.getLibraryVersion();

		const content = "Here is some full-text content";
		const pages = 50;

		// No Content-Type
		response = await API.userPut(
			config.userID,
			"items/" + data.key + "/fulltext?key=" + config.apiKey,
			content
		);
		Helpers.assertStatusCode(response, 400, "Content-Type must be application/json");

		// Store content
		response = await API.userPut(
			config.userID,
			"items/" + data.key + "/fulltext?key=" + config.apiKey,
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages,
				invalidParam: "shouldBeIgnored"
			}),
			{ "Content-Type": "application/json" }
		);

		Helpers.assertStatusCode(response, 204);
		const contentVersion = response.headers["last-modified-version"][0];
		assert.isAbove(parseInt(contentVersion), parseInt(libraryVersion));

		// Retrieve it
		response = await API.userGet(
			config.userID,
			"items/" + data.key + "/fulltext?key=" + config.apiKey
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.headers['content-type'][0], "application/json");
		const json = JSON.parse(response.data);
		assert.equal(content, json.content);
		assert.include(Object.keys(json), 'indexedPages');
		assert.include(Object.keys(json), 'totalPages');
		assert.equal(pages, json.indexedPages);
		assert.equal(pages, json.totalPages);
		assert.notInclude(Object.keys(json), "indexedChars");
		assert.notInclude(Object.keys(json), "invalidParam");
		assert.equal(contentVersion, response.headers['last-modified-version'][0]);
	});

	it('testModifyAttachmentWithFulltext', async function () {
		const key = await API.createItem("book", false, true, 'key');
		const xml = await API.createAttachmentItem("imported_url", [], key, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const content = "Here is some full-text content";
		const pages = 50;

		// Store content
		const response = await API.userPut(
			config.userID,
			"items/" + data.key + "/fulltext?key=" + config.apiKey,
			JSON.stringify({
				content: content,
				indexedPages: pages,
				totalPages: pages
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 204);

		const json = JSON.parse(data.content);
		json.title = "This is a new attachment title";
		json.contentType = 'text/plain';

		// Modify attachment item
		const response2 = await API.userPut(
			config.userID,
			"items/" + data.key + "?key=" + config.apiKey,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": data.version }
		);
		Helpers.assertStatusCode(response2, 204);
	});

	it('testNewerContent', async function () {
		await API.userClear(config.userID);
		// Store content for one item
		let key = await API.createItem("book", false, true, 'key');
		let xml = await API.createAttachmentItem("imported_url", [], key, true, 'atom');
		let data = await API.parseDataFromAtomEntry(xml);
		let key1 = data.key;

		let content = "Here is some full-text content";

		let response = await API.userPut(
			config.userID,
			`items/${key1}/fulltext?key=${config.apiKey}`,
			JSON.stringify({
				content: content
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 204);
		let contentVersion1 = response.headers["last-modified-version"][0];
		assert.isAbove(parseInt(contentVersion1), 0);

		// And another
		key = await API.createItem("book", false, true, 'key');
		xml = await API.createAttachmentItem("imported_url", [], key, true, 'atom');
		data = await API.parseDataFromAtomEntry(xml);
		let key2 = data.key;

		response = await API.userPut(
			config.userID,
			`items/${key2}/fulltext?key=${config.apiKey}`,
			JSON.stringify({
				content: content
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 204);
		let contentVersion2 = response.headers["last-modified-version"][0];
		assert.isAbove(parseInt(contentVersion2), 0);

		// Get newer one
		response = await API.userGet(
			config.userID,
			`fulltext?key=${config.apiKey}&newer=${contentVersion1}`
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal("application/json", response.headers["content-type"][0]);
		assert.equal(contentVersion2, response.headers["last-modified-version"][0]);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 1);
		assert.property(json, key2);
		assert.equal(contentVersion2, json[key2]);

		// Get both with newer=0
		response = await API.userGet(
			config.userID,
			`fulltext?key=${config.apiKey}&newer=0`
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal("application/json", response.headers["content-type"][0]);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 2);
		assert.property(json, key1);
		assert.equal(contentVersion1, json[key1]);
		assert.property(json, key2);
		assert.equal(contentVersion2, json[key2]);
	});

	//Requires ES
	it('testSearchItemContent', async function() {
		this.skip();
	});

	it('testDeleteItemContent', async function () {
		const key = await API.createItem('book', false, true, 'key');
		const xml = await API.createAttachmentItem('imported_file', [], key, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);

		const content = 'Ыюм мютат дэбетиз конвынёры эю, ку мэль жкрипта трактатоз.\nПро ут чтэт эрепюят граэкйж, дуо нэ выро рыкючабо пырикюлёз.';

		// Store content
		let response = await API.userPut(
			config.userID,
			`items/${data.key}/fulltext?key=${config.apiKey}`,
			JSON.stringify({
				content: content,
				indexedPages: 50
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 204);
		const contentVersion = response.headers['last-modified-version'][0];

		// Retrieve it
		response = await API.userGet(
			config.userID,
			`items/${data.key}/fulltext?key=${config.apiKey}`
		);
		Helpers.assertStatusCode(response, 200);
		let json = JSON.parse(response.data);
		assert.equal(json.content, content);
		assert.equal(json.indexedPages, 50);

		// Set to empty string
		response = await API.userPut(
			config.userID,
			`items/${data.key}/fulltext?key=${config.apiKey}`,
			JSON.stringify({
				content: ""
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 204);
		assert.isAbove(parseInt(response.headers['last-modified-version'][0]), parseInt(contentVersion));

		// Make sure it's gone
		response = await API.userGet(
			config.userID,
			`items/${data.key}/fulltext?key=${config.apiKey}`
		);
		Helpers.assertStatusCode(response, 200);
		json = JSON.parse(response.data);
		assert.equal(json.content, "");
		assert.notProperty(json, "indexedPages");
	});
});
