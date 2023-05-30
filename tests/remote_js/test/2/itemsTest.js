const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After } = require("../shared.js");

describe('ItemsTests', function () {
	this.timeout(config.timeout * 2);

	before(async function () {
		await API2Before();
	});

	after(async function () {
		await API2After();
	});

	const testNewEmptyBookItem = async () => {
		const xml = await API.createItem("book", false, true);
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		assert.equal(json.itemType, "book");
		return json;
	};

	it('testNewEmptyBookItemMultiple', async function () {
		const json = await API.getItemTemplate("book");

		const data = [];
		json.title = "A";
		data.push(json);
		const json2 = Object.assign({}, json);
		json2.title = "B";
		data.push(json2);
		const json3 = Object.assign({}, json);
		json3.title = "C";
		data.push(json3);

		const response = await API.postItems(data);
		Helpers.assertStatusCode(response, 200);
		const jsonResponse = await API.getJSONFromResponse(response);
		const successArray = Object.keys(jsonResponse.success).map(key => jsonResponse.success[key]);
		const xml = await API.getItemXML(successArray, true);
		const contents = Helpers.xpathEval(xml, '/atom:feed/atom:entry/atom:content', false, true);

		let content = JSON.parse(contents[0]);
		assert.equal(content.title, "A");
		content = JSON.parse(contents[1]);
		assert.equal(content.title, "B");
		content = JSON.parse(contents[2]);
		assert.equal(content.title, "C");
	});

	it('testEditBookItem', async function () {
		const newBookItem = await testNewEmptyBookItem();
		const key = newBookItem.itemKey;
		const version = newBookItem.itemVersion;

		const newTitle = 'New Title';
		const numPages = 100;
		const creatorType = 'author';
		const firstName = 'Firstname';
		const lastName = 'Lastname';

		newBookItem.title = newTitle;
		newBookItem.numPages = numPages;
		newBookItem.creators.push({
			creatorType: creatorType,
			firstName: firstName,
			lastName: lastName
		});

		const response = await API.userPut(
			config.userID,
			`items/${key}?key=${config.apiKey}`,
			JSON.stringify(newBookItem),
			{
				headers: {
					'Content-Type': 'application/json',
					'If-Unmodified-Since-Version': version
				}
			}
		);
		Helpers.assertStatusCode(response, 204);

		const xml = await API.getItemXML(key);
		const data = API.parseDataFromAtomEntry(xml);
		const updatedJson = JSON.parse(data.content);

		assert.equal(newTitle, updatedJson.title);
		assert.equal(numPages, updatedJson.numPages);
		assert.equal(creatorType, updatedJson.creators[0].creatorType);
		assert.equal(firstName, updatedJson.creators[0].firstName);
		assert.equal(lastName, updatedJson.creators[0].lastName);
	});

	it('testDateModified', async function () {
		const objectType = 'item';
		const objectTypePlural = API.getPluralObjectType(objectType);
		// In case this is ever extended to other objects
		let xml;
		let itemData;
		switch (objectType) {
			case 'item':
				itemData = {
					title: "Test"
				};
				xml = await API.createItem("videoRecording", itemData, this, 'atom');
				break;
		}

		const data = API.parseDataFromAtomEntry(xml);
		const objectKey = data.key;
		let json = JSON.parse(data.content);
		const dateModified1 = Helpers.xpathEval(xml, '//atom:entry/atom:updated');

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1000));

		//
		// If no explicit dateModified, use current timestamp
		//
		json.title = 'Test 2';
		let response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		switch (objectType) {
			case 'item':
				xml = await API.getItemXML(objectKey);
				break;
		}

		const dateModified2 = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		assert.notEqual(dateModified1, dateModified2);
		json = JSON.parse(API.parseDataFromAtomEntry(xml).content);

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1000));

		//
		// If existing dateModified, use current timestamp
		//
		json.title = 'Test 3';
		json.dateModified = dateModified2;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}? key=${config.apiKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		switch (objectType) {
			case 'item':
				xml = await API.getItemXML(objectKey);
				break;
		}

		const dateModified3 = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		assert.notEqual(dateModified2, dateModified3);
		json = JSON.parse(API.parseDataFromAtomEntry(xml).content);

		//
		// If explicit dateModified, use that
		//
		const newDateModified = "2013-03-03T21:33:53Z";
		json.title = 'Test 4';
		json.dateModified = newDateModified;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}? key=${config.apiKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		switch (objectType) {
			case 'item':
				xml = await API.getItemXML(objectKey);
				break;
		}
		const dateModified4 = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		assert.equal(newDateModified, dateModified4);
	});

	it('testDateAccessedInvalid', async function () {
		const date = 'February 1, 2014';
		const xml = await API.createItem("book", { accessDate: date }, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		// Invalid dates should be ignored
		assert.equal(json.accessDate, '');
	});

	it('testChangeItemType', async function () {
		const json = await API.getItemTemplate("book");
		json.title = "Foo";
		json.numPages = 100;

		const response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json],
			}),
			{ "Content-Type": "application/json" }
		);

		const key = API.getFirstSuccessKeyFromResponse(response);
		const xml = await API.getItemXML(key, true);
		const data = await API.parseDataFromAtomEntry(xml);
		const version = data.version;
		const json1 = JSON.parse(data.content);

		const json2 = await API.getItemTemplate("bookSection");
		delete json2.attachments;
		delete json2.notes;

		Object.entries(json2).forEach(([field, _]) => {
			if (field !== "itemType" && json1[field]) {
				json2[field] = json1[field];
			}
		});

		const response2 = await API.userPut(
			config.userID,
			"items/" + key + "?key=" + config.apiKey,
			JSON.stringify(json2),
			{ "Content-Type": "application/json", "If-Unmodified-Since-Version": version }
		);

		Helpers.assertStatusCode(response2, 204);

		const xml2 = await API.getItemXML(key);
		const data2 = await API.parseDataFromAtomEntry(xml2);
		const json3 = JSON.parse(data2.content);

		assert.equal(json3.itemType, "bookSection");
		assert.equal(json3.title, "Foo");
		assert.notProperty(json3, "numPages");
	});

	it('testModifyItemPartial', async function () {
		const itemData = {
			title: "Test"
		};
		const xml = await API.createItem("book", itemData, this, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		let itemVersion = json.itemVersion;

		const patch = async (itemKey, itemVersion, itemData, newData) => {
			for (const field in newData) {
				itemData[field] = newData[field];
			}
			const response = await API.userPatch(
				config.userID,
				"items/" + itemKey + "?key=" + config.apiKey,
				JSON.stringify(newData),
				{
					"Content-Type": "application/json",
					"If-Unmodified-Since-Version": itemVersion
				}
			);
			Helpers.assertStatusCode(response, 204);
			const xml = await API.getItemXML(itemKey);
			const data = API.parseDataFromAtomEntry(xml);
			const json = JSON.parse(data.content);

			for (const field in itemData) {
				assert.deepEqual(itemData[field], json[field]);
			}
			const headerVersion = parseInt(response.headers["last-modified-version"][0]);
			assert.isAbove(headerVersion, itemVersion);
			assert.equal(json.itemVersion, headerVersion);

			return headerVersion;
		};

		let newData = {
			date: "2013"
		};
		itemVersion = await patch(data.key, itemVersion, itemData, newData);

		newData = {
			title: ""
		};
		itemVersion = await patch(data.key, itemVersion, itemData, newData);

		newData = {
			tags: [
				{ tag: "Foo" }
			]
		};
		itemVersion = await patch(data.key, itemVersion, itemData, newData);

		newData = {
			tags: []
		};
		itemVersion = await patch(data.key, itemVersion, itemData, newData);

		const key = await API.createCollection('Test', false, this, 'key');
		newData = {
			collections: [key]
		};
		itemVersion = await patch(data.key, itemVersion, itemData, newData);

		newData = {
			collections: []
		};
		await patch(data.key, itemVersion, itemData, newData);
	});

	it('testNewComputerProgramItem', async function () {
		const xml = await API.createItem('computerProgram', false, true);
		const data = await API.parseDataFromAtomEntry(xml);
		const key = data.key;
		const json = JSON.parse(data.content);
		assert.equal(json.itemType, 'computerProgram');

		const version = '1.0';
		json.version = version;

		const response = await API.userPut(
			config.userID,
			`items/${key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json", "If-Unmodified-Since-Version": data.version }
		);
		Helpers.assertStatusCode(response, 204);

		const xml2 = await API.getItemXML(key);
		const data2 = await API.parseDataFromAtomEntry(xml2);
		const json2 = JSON.parse(data2.content);
		assert.equal(json2.version, version);

		delete json2.version;
		const version2 = '1.1';
		json2.versionNumber = version2;
		const response2 = await API.userPut(
			config.userID,
			`items/${key}?key=${config.apiKey}`,
			JSON.stringify(json2),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response2, 204);

		const xml3 = await API.getItemXML(key);
		const data3 = await API.parseDataFromAtomEntry(xml3);
		const json3 = JSON.parse(data3.content);
		assert.equal(json3.version, version2);
	});

	it('testNewInvalidBookItem', async function () {
		const json = await API.getItemTemplate("book");

		// Missing item type
		const json2 = { ...json };
		delete json2.itemType;
		let response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json2]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(response, 'failed', 0, 400, "'itemType' property not provided");

		// contentType on non-attachment
		const json3 = { ...json };
		json3.contentType = "text/html";
		response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json3]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(response, 'failed', 0, 400, "'contentType' is valid only for attachment items");
	});

	it('testEditTopLevelNote', async function () {
		const xml = await API.createNoteItem("<p>Test</p>", null, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		const noteText = "<p>Test Test</p>";
		json.note = noteText;
		const response = await API.userPut(
			config.userID,
			`items/${data.key}?key=` + config.apiKey,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);
		const response2 = await API.userGet(
			config.userID,
			`items/${data.key}?key=` + config.apiKey + "&content=json"
		);
		Helpers.assertStatusCode(response2, 200);
		const xml2 = API.getXMLFromResponse(response2);
		const data2 = API.parseDataFromAtomEntry(xml2);
		const json2 = JSON.parse(data2.content);
		assert.equal(json2.note, noteText);
	});

	it('testEditChildNote', async function () {
		const key = await API.createItem("book", { title: "Test" }, true, 'key');
		const xml = await API.createNoteItem("<p>Test</p>", key, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		const noteText = "<p>Test Test</p>";
		json.note = noteText;
		const response1 = await API.userPut(
			config.userID,
			"items/" + data.key + "?key=" + config.apiKey,
			JSON.stringify(json)
		);
		assert.equal(response1.status, 204);
		const response2 = await API.userGet(
			config.userID,
			"items/" + data.key + "?key=" + config.apiKey + "&content=json"
		);
		Helpers.assertStatusCode(response2, 200);
		const xml2 = API.getXMLFromResponse(response2);
		const data2 = API.parseDataFromAtomEntry(xml2);
		const json2 = JSON.parse(data2.content);
		assert.equal(json2.note, noteText);
	});

	it('testEditTitleWithCollectionInMultipleMode', async function () {
		const collectionKey = await API.createCollection('Test', false, true, 'key');
		let xml = await API.createItem('book', {
			title: 'A',
			collections: [
				collectionKey,
			],
		}, true, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		data = JSON.parse(data.content);
		const version = data.itemVersion;
		data.title = 'B';
		const response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`, JSON.stringify({
				items: [data],
			}),
		);
		Helpers.assert200ForObject(response, 200);
		xml = await API.getItemXML(data.itemKey);
		data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		assert.equal(json.title, 'B');
		assert.isAbove(json.itemVersion, version);
	});

	it('testEditTitleWithTagInMultipleMode', async function () {
		const tag1 = {
			tag: 'foo',
			type: 1,
		};
		const tag2 = {
			tag: 'bar',
		};

		const xml = await API.createItem('book', {
			title: 'A',
			tags: [tag1],
		}, true, 'atom');

		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		assert.equal(json.tags.length, 1);
		assert.deepEqual(json.tags[0], tag1);

		const version = json.itemVersion;
		json.title = 'B';
		json.tags.push(tag2);

		const response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json],
			}),
		);
		Helpers.assertStatusForObject(response, 'success', 0);
		const xml2 = await API.getItemXML(json.itemKey);
		const data2 = API.parseDataFromAtomEntry(xml2);
		const json2 = JSON.parse(data2.content);
		assert.equal(json2.title, 'B');
		assert.isAbove(json2.itemVersion, version);
		assert.equal(json2.tags.length, 2);
		assert.deepEqual(json2.tags, [tag2, tag1]);
	});

	it('testNewTopLevelImportedFileAttachment', async function () {
		const response = await API.get("items/new?itemType=attachment&linkMode=imported_file");
		const json = JSON.parse(response.data);
		const userPostResponse = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}), { "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(userPostResponse, 200);
	});

	it('testNewInvalidTopLevelAttachment', async function() {
		this.skip(); //disabled
	});

	it('testNewEmptyLinkAttachmentItemWithItemKey', async function () {
		const key = await API.createItem("book", false, true, 'key');
		await API.createAttachmentItem("linked_url", [], key, true, 'atom');
			
		let response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		let json = JSON.parse(response.data);
		json.parentItem = key;

		json.itemKey = Helpers.uniqueID();
		json.itemVersion = 0;
			
		response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
	});

	const testNewEmptyImportedURLAttachmentItem = async () => {
		const key = await API.createItem('book', false, true, 'key');
		const xml = await API.createAttachmentItem('imported_url', [], key, true, 'atom');
		return API.parseDataFromAtomEntry(xml);
	};

	it('testEditEmptyImportedURLAttachmentItem', async function () {
		const newItemData = await testNewEmptyImportedURLAttachmentItem();
		const key = newItemData.key;
		const version = newItemData.version;
		const json = JSON.parse(newItemData.content);

		const response = await API.userPut(
			config.userID,
			`items/${key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': version
			}
		);
		Helpers.assertStatusCode(response, 204);

		const xml = await API.getItemXML(key);
		const data = await API.parseDataFromAtomEntry(xml);
		// Item Shouldn't be changed
		assert.equal(version, data.version);
	});

	const testEditEmptyLinkAttachmentItem = async () => {
		const key = await API.createItem('book', false, true, 'key');
		const xml = await API.createAttachmentItem('linked_url', [], key, true, 'atom');
		const data = await API.parseDataFromAtomEntry(xml);

		const updatedKey = data.key;
		const version = data.version;
		const json = JSON.parse(data.content);

		const response = await API.userPut(
			config.userID,
			`items/${updatedKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);
		Helpers.assertStatusCode(response, 204);

		const newXml = await API.getItemXML(updatedKey);
		const newData = await API.parseDataFromAtomEntry(newXml);
		// Item shouldn't change
		assert.equal(version, newData.version);
		return newData;
	};

	it('testEditLinkAttachmentItem', async function () {
		const newItemData = await testEditEmptyLinkAttachmentItem();
		const key = newItemData.key;
		const version = newItemData.version;
		const json = JSON.parse(newItemData.content);

		const contentType = "text/xml";
		const charset = "utf-8";

		json.contentType = contentType;
		json.charset = charset;

		const response = await API.userPut(
			config.userID,
			`items/${key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);

		Helpers.assertStatusCode(response, 204);

		const xml = await API.getItemXML(key);
		const data = API.parseDataFromAtomEntry(xml);
		const parsedJson = JSON.parse(data.content);

		assert.equal(parsedJson.contentType, contentType);
		assert.equal(parsedJson.charset, charset);
	});

	it('testEditAttachmentUpdatedTimestamp', async function () {
		const xml = await API.createAttachmentItem("linked_file", [], false, true);
		const data = API.parseDataFromAtomEntry(xml);
		const atomUpdated = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		const json = JSON.parse(data.content);
		json.note = "Test";
	
		await new Promise(resolve => setTimeout(resolve, 1000));
	
		const response = await API.userPut(
			config.userID,
			`items/${data.key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": data.version }
		);
		Helpers.assertStatusCode(response, 204);
	
		const xml2 = await API.getItemXML(data.key);
		const atomUpdated2 = Helpers.xpathEval(xml2, '//atom:entry/atom:updated');
		assert.notEqual(atomUpdated2, atomUpdated);
	});

	it('testNewAttachmentItemInvalidLinkMode', async function () {
		const response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		const json = JSON.parse(response.data);

		// Invalid linkMode
		json.linkMode = "invalidName";
		const newResponse = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(newResponse, 'failed', 0, 400, "'invalidName' is not a valid linkMode");

		// Missing linkMode
		delete json.linkMode;
		const missingResponse = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(missingResponse, 'failed', 0, 400, "'linkMode' property not provided");
	});
	it('testNewAttachmentItemMD5OnLinkedURL', async function () {
		const newItemData = await testNewEmptyBookItem();
		const parentKey = newItemData.key;

		const response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		const json = JSON.parse(response.data);
		json.parentItem = parentKey;

		json.md5 = "c7487a750a97722ae1878ed46b215ebe";
		const postResponse = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(postResponse, 'failed', 0, 400, "'md5' is valid only for imported and embedded-image attachments");
	});
	it('testNewAttachmentItemModTimeOnLinkedURL', async function () {
		const newItemData = await testNewEmptyBookItem();
		const parentKey = newItemData.key;

		const response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		const json = JSON.parse(response.data);
		json.parentItem = parentKey;

		json.mtime = "1332807793000";
		const postResponse = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(postResponse, 'failed', 0, 400, "'mtime' is valid only for imported and embedded-image attachments");
	});
	it('testMappedCreatorTypes', async function () {
		const json = {
			items: [
				{
					itemType: 'presentation',
					title: 'Test',
					creators: [
						{
							creatorType: "author",
							name: "Foo"
						}
					]
				},
				{
					itemType: 'presentation',
					title: 'Test',
					creators: [
						{
							creatorType: "editor",
							name: "Foo"
						}
					]
				}
			]
		};
		const response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify(json)
		);
		// 'author' gets mapped automatically, others dont
		Helpers.assertStatusForObject(response, 'failed', 1, 400);
		Helpers.assertStatusForObject(response, 'success', 0);
	});

	it('testNumChildren', async function () {
		let xml = await API.createItem("book", false, true);
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren'), 0);
		const data = API.parseDataFromAtomEntry(xml);
		const key = data.key;

		await API.createAttachmentItem("linked_url", [], key, true, 'key');

		let response = await API.userGet(
			config.userID,
			`items/${key}?key=${config.apiKey}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren'), 1);

		await API.createNoteItem("Test", key, true, 'key');

		response = await API.userGet(
			config.userID,
			`items/${key}?key=${config.apiKey}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren'), 2);
	});

	it('testTop', async function () {
		await API.userClear(config.userID);

		const collectionKey = await API.createCollection('Test', false, this, 'key');

		const parentTitle1 = "Parent Title";
		const childTitle1 = "This is a Test Title";
		const parentTitle2 = "Another Parent Title";
		const parentTitle3 = "Yet Another Parent Title";
		const noteText = "This is a sample note.";
		const parentTitleSearch = "title";
		const childTitleSearch = "test";
		const dates = ["2013", "January 3, 2010", ""];
		const orderedDates = [dates[2], dates[1], dates[0]];
		const itemTypes = ["journalArticle", "newspaperArticle", "book"];

		const parentKeys = [];
		const childKeys = [];

		parentKeys.push(await API.createItem(itemTypes[0], {
			title: parentTitle1,
			date: dates[0],
			collections: [
				collectionKey
			]
		}, this, 'key'));

		childKeys.push(await API.createAttachmentItem("linked_url", {
			title: childTitle1
		}, parentKeys[0], this, 'key'));

		parentKeys.push(await API.createItem(itemTypes[1], {
			title: parentTitle2,
			date: dates[1]
		}, this, 'key'));

		childKeys.push(await API.createNoteItem(noteText, parentKeys[1], this, 'key'));

		parentKeys.push(await API.createItem(itemTypes[2], {
			title: parentTitle3
		}, this, 'key'));

		childKeys.push(await API.createAttachmentItem("linked_url", {
			title: childTitle1,
			deleted: true
		}, parentKeys[parentKeys.length - 1], this, 'key'));

		const deletedKey = await API.createItem("book", {
			title: "This is a deleted item",
			deleted: true,
		}, this, 'key');

		await API.createNoteItem("This is a child note of a deleted item.", deletedKey, this, 'key');

		const top = async (url, expectedResults = -1) => {
			const response = await API.userGet(config.userID, url);
			Helpers.assertStatusCode(response, 200);
			if (expectedResults !== -1) {
				Helpers.assertNumResults(response, expectedResults);
			}
			return response;
		};

		const checkXml = (response, expectedCount = -1, path = '//atom:entry/zapi:key') => {
			const xml = API.getXMLFromResponse(response);
			const xpath = Helpers.xpathEval(xml, path, false, true);
			if (expectedCount !== -1) {
				assert.equal(xpath.length, expectedCount);
			}
			return xpath;
		};

		// /top, Atom
		let response = await top(`items/top?key=${config.apiKey}&content=json`, parentKeys.length);
		let xpath = await checkXml(response, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(xpath, parentKey);
		}

		// /top, Atom, in collection
		response = await top(`collections/${collectionKey}/items/top?key=${config.apiKey}&content=json`, 1);
		xpath = await checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, keys
		response = await top(`items/top?key=${config.apiKey}&format=keys`);
		let keys = response.data.trim().split("\n");
		assert.equal(keys.length, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(keys, parentKey);
		}

		// /top, keys, in collection
		response = await top(`collections/${collectionKey}/items/top?key=${config.apiKey}&format=keys`);
		assert.equal(response.data.trim(), parentKeys[0]);

		// /top with itemKey for parent, Atom
		response = await top(`items/top?key=${config.apiKey}&content=json&itemKey=${parentKeys[0]}`, 1);
		xpath = await checkXml(response);
		assert.equal(parentKeys[0], xpath.shift());

		// /top with itemKey for parent, Atom, in collection
		response = await top(`collections/${collectionKey}/items/top?key=${config.apiKey}&content=json&itemKey=${parentKeys[0]}`, 1);
		xpath = await checkXml(response);
		assert.equal(parentKeys[0], xpath.shift());

		// /top with itemKey for parent, keys
		response = await top(`items/top?key=${config.apiKey}&format=keys&itemKey=${parentKeys[0]}`);
		assert.equal(parentKeys[0], response.data.trim());

		// /top with itemKey for parent, keys, in collection
		response = await top(`collections/${collectionKey}/items/top?key=${config.apiKey}&format=keys&itemKey=${parentKeys[0]}`);
		assert.equal(parentKeys[0], response.data.trim());

		// /top with itemKey for child, Atom
		response = await top(`items/top?key=${config.apiKey}&content=json&itemKey=${childKeys[0]}`, 1);
		xpath = await checkXml(response);
		assert.equal(parentKeys[0], xpath.shift());

		// /top with itemKey for child, keys
		response = await top(`items/top?key=${config.apiKey}&format=keys&itemKey=${childKeys[0]}`);
		assert.equal(parentKeys[0], response.data.trim());

		// /top, Atom, with q for all items
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}`, parentKeys.length);
		xpath = await checkXml(response, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(xpath, parentKey);
		}

		// /top, Atom, in collection, with q for all items
		response = await top(`collections/${collectionKey}/items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}`, 1);
		xpath = await checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, Atom, with q for child item
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${childTitleSearch}`, 1);
		xpath = checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, Atom, in collection, with q for child item
		response = await top(`collections/${collectionKey}/items/top?key=${config.apiKey}&content=json&q=${childTitleSearch}`, 1);
		xpath = checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, Atom, with q for all items, ordered by title
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}&order=title`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/atom:title');

		let orderedTitles = [parentTitle1, parentTitle2, parentTitle3].sort();
		let orderedResults = xpath.map(val => String(val));
		assert.deepEqual(orderedTitles, orderedResults);

		// /top, Atom, with q for all items, ordered by date asc
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}&order=date&sort=asc`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/atom:content');
		orderedResults = xpath.map(val => JSON.parse(val).date);
		assert.deepEqual(orderedDates, orderedResults);

		// /top, Atom, with q for all items, ordered by date desc
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}&order=date&sort=desc`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/atom:content');
		let orderedDatesReverse = [...orderedDates].reverse();
		orderedResults = xpath.map(val => JSON.parse(val).date);
		assert.deepEqual(orderedDatesReverse, orderedResults);

		// /top, Atom, with q for all items, ordered by item type asc
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}&order=itemType`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/zapi:itemType');
		let orderedItemTypes = [...itemTypes].sort();
		orderedResults = xpath.map(val => String(val));
		assert.deepEqual(orderedItemTypes, orderedResults);

		// /top, Atom, with q for all items, ordered by item type desc
		response = await top(`items/top?key=${config.apiKey}&content=json&q=${parentTitleSearch}&order=itemType&sort=desc`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/zapi:itemType');
		orderedItemTypes = [...itemTypes].sort().reverse();
		orderedResults = xpath.map(val => String(val));
		assert.deepEqual(orderedItemTypes, orderedResults);
	});

	it('testParentItem', async function () {
		let xml = await API.createItem("book", false, true);
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let parentKey = data.key;
		let parentVersion = data.version;

		xml = await API.createAttachmentItem("linked_url", [], parentKey, true);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		let childKey = data.key;
		let childVersion = data.version;

		assert.ok(json.parentItem);
		assert.equal(parentKey, json.parentItem);

		// Remove the parent, making the child a standalone attachment
		delete json.parentItem;

		// Remove version property, to test header
		delete json.itemVersion;

		// The parent item version should have been updated when a child
		// was added, so this should fail
		let response = await API.userPut(
			config.userID,
			`items/${childKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": parentVersion }
		);
		Helpers.assertStatusCode(response, 412);

		response = await API.userPut(
			config.userID,
			`items/${childKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": childVersion }
		);
		Helpers.assertStatusCode(response, 204);

		xml = await API.getItemXML(childKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.notExists(json.parentItem);
	});

	it('testParentItemPatch', async function () {
		let xml = await API.createItem("book", false, true);
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		const parentKey = data.key;

		xml = await API.createAttachmentItem("linked_url", [], parentKey, true);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		const childKey = data.key;
		const childVersion = data.version;

		assert.ok(json.parentItem);
		assert.equal(parentKey, json.parentItem);

		const json3 = {
			title: 'Test'
		};

		// With PATCH, parent shouldn't be removed even though unspecified
		const response = await API.userPatch(
			config.userID,
			`items/${childKey}?key=${config.apiKey}`,
			JSON.stringify(json3),
			{ "If-Unmodified-Since-Version": childVersion },
		);

		Helpers.assertStatusCode(response, 204);

		xml = await API.getItemXML(childKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		assert.ok(json.parentItem);
	});

	it('testDate', async function () {
		const date = "Sept 18, 2012";

		const xml = await API.createItem("book", { date: date }, true);
		const data = API.parseDataFromAtomEntry(xml);
		const key = data.key;

		const response = await API.userGet(
			config.userID,
			`items/${key}?key=${config.apiKey}&content=json`
		);
		const xmlResponse = await API.getXMLFromResponse(response);
		const dataResponse = API.parseDataFromAtomEntry(xmlResponse);
		const json = JSON.parse(dataResponse.content);
		assert.equal(date, json.date);

		assert.equal(Helpers.xpathEval(xmlResponse, '//atom:entry/zapi:year'), '2012');
	});

	it('testUnicodeTitle', async function () {
		const title = "Tést";

		const xml = await API.createItem("book", { title }, true);
		const data = await API.parseDataFromAtomEntry(xml);
		const key = data.key;

		// Test entry
		let response = await API.userGet(
			config.userID,
			`items/${key}?key=${config.apiKey}&content=json`
		);
		let xmlResponse = await API.getXMLFromResponse(response);
		assert.equal(xmlResponse.getElementsByTagName("title")[0].innerHTML, "Tést");

		// Test feed
		response = await API.userGet(
			config.userID,
			`items?key=${config.apiKey}&content=json`
		);
		xmlResponse = await API.getXMLFromResponse(response);

		let titleFound = false;
		for (var node of xmlResponse.getElementsByTagName("title")) {
			if (node.innerHTML == title) {
				titleFound = true;
			}
		}
		assert.ok(titleFound);
	});
});
