const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp, resetGroups } = require("../shared.js");

describe('ItemsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
		await resetGroups();
	});

	after(async function () {
		await API3WrapUp();
	});

	this.beforeEach(async function () {
		await API.userClear(config.userID);
		await API.groupClear(config.ownedPrivateGroupID);
		API.useAPIKey(config.apiKey);
	});

	const testNewEmptyBookItem = async () => {
		let json = await API.createItem("book", false, true);
		json = json.successful[0].data;
		assert.equal(json.itemType, "book");
		assert.equal(json.title, "");
		assert.equal(json.date, "");
		assert.equal(json.place, "");
		return json;
	};

	it('testNewEmptyBookItemMultiple', async function () {
		let json = await API.getItemTemplate("book");

		const data = [];
		json.title = "A";
		data.push(json);
		const json2 = Object.assign({}, json);
		json2.title = "B";
		data.push(json2);
		const json3 = Object.assign({}, json);
		json3.title = "C";
		json3.numPages = 200;
		data.push(json3);

		const response = await API.postItems(data);
		Helpers.assertStatusCode(response, 200);
		let libraryVersion = parseInt(response.headers['last-modified-version'][0]);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(3, json.successful);
		Helpers.assertCount(3, json.success);

		for (let i = 0; i < 3; i++) {
			assert.equal(json.successful[i].key, json.successful[i].data.key);
			assert.equal(libraryVersion, json.successful[i].version);
			assert.equal(libraryVersion, json.successful[i].data.version);
			assert.equal(data[i].title, json.successful[i].data.title);
		}

		assert.equal(data[2].numPages, json.successful[2].data.numPages);

		json = await API.getItem(Object.keys(json.success).map(k => json.success[k]), this, 'json');


		assert.equal(json[0].data.title, "A");
		assert.equal(json[1].data.title, "B");
		assert.equal(json[2].data.title, "C");
	});

	it('testEditBookItem', async function () {
		const newBookItem = await testNewEmptyBookItem();
		const key = newBookItem.key;
		const version = newBookItem.version;

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
			`items/${key}`,
			JSON.stringify(newBookItem),
			{
				headers: {
					'Content-Type': 'application/json',
					'If-Unmodified-Since-Version': version
				}
			}
		);
		Helpers.assertStatusCode(response, 204);

		let json = (await API.getItem(key, true, 'json')).data;

		assert.equal(newTitle, json.title);
		assert.equal(numPages, json.numPages);
		assert.equal(creatorType, json.creators[0].creatorType);
		assert.equal(firstName, json.creators[0].firstName);
		assert.equal(lastName, json.creators[0].lastName);
	});

	it('testDateModified', async function () {
		const objectType = 'item';
		const objectTypePlural = API.getPluralObjectType(objectType);
		// In case this is ever extended to other objects
		let json;
		let itemData;
		switch (objectType) {
			case 'item':
				itemData = {
					title: "Test"
				};
				json = await API.createItem("videoRecording", itemData, this, 'jsonData');
				break;
		}

		const objectKey = json.key;
		const dateModified1 = json.dateModified;

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1000));

		//
		// If no explicit dateModified, use current timestamp
		//
		json.title = 'Test 2';
		delete json.dateModified;
		let response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		switch (objectType) {
			case 'item':
				json = (await API.getItem(objectKey, true, 'json')).data;
				break;
		}

		const dateModified2 = json.dateModified;
		assert.notEqual(dateModified1, dateModified2);

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1000));

		//
		// If existing dateModified, use current timestamp
		//
		json.title = 'Test 3';
		json.dateModified = dateModified2;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		switch (objectType) {
			case 'item':
				json = (await API.getItem(objectKey, true, 'json')).data;
				break;
		}

		const dateModified3 = json.dateModified;
		assert.notEqual(dateModified2, dateModified3);

		//
		// If explicit dateModified, use that
		//
		const newDateModified = "2013-03-03T21:33:53Z";
		json.title = 'Test 4';
		json.dateModified = newDateModified;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}? `,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);

		switch (objectType) {
			case 'item':
				json = (await API.getItem(objectKey, true, 'json')).data;
				break;
		}
		const dateModified4 = json.dateModified;
		assert.equal(newDateModified, dateModified4);
	});

	it('testDateAccessedInvalid', async function () {
		const date = 'February 1, 2014';
		const response = await API.createItem("book", { accessDate: date }, true, 'response');
		// Invalid dates should be ignored
		Helpers.assert400ForObject(response, { message: "'accessDate' must be in ISO 8601 or UTC 'YYYY-MM-DD[ hh:mm:ss]' format or 'CURRENT_TIMESTAMP' (February 1, 2014)" });
	});

	it('testChangeItemType', async function () {
		const json = await API.getItemTemplate("book");
		json.title = "Foo";
		json.numPages = 100;

		const response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);

		const key = API.getFirstSuccessKeyFromResponse(response);
		const json1 = (await API.getItem(key, true, 'json')).data;
		const version = json1.version;

		const json2 = await API.getItemTemplate("bookSection");

		Object.entries(json2).forEach(([field, _]) => {
			if (field !== "itemType" && json1[field]) {
				json2[field] = json1[field];
			}
		});

		const response2 = await API.userPut(
			config.userID,
			"items/" + key,
			JSON.stringify(json2),
			{ "Content-Type": "application/json", "If-Unmodified-Since-Version": version }
		);

		Helpers.assertStatusCode(response2, 204);

		const json3 = (await API.getItem(key, true, 'json')).data;
		assert.equal(json3.itemType, "bookSection");
		assert.equal(json3.title, "Foo");
		assert.notProperty(json3, "numPages");
	});

	it('testPatchItem', async function () {
		const itemData = {
			title: "Test"
		};
		const json = await API.createItem("book", itemData, this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

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
			const json = (await API.getItem(itemKey, true, 'json')).data;

			for (const field in itemData) {
				assert.deepEqual(itemData[field], json[field]);
			}
			const headerVersion = parseInt(response.headers["last-modified-version"][0]);
			assert.isAbove(headerVersion, itemVersion);
			assert.equal(json.version, headerVersion);

			return headerVersion;
		};

		let newData = {
			date: "2013"
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			title: ""
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			tags: [
				{ tag: "Foo" }
			]
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			tags: []
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		const key = await API.createCollection('Test', false, this, 'key');
		newData = {
			collections: [key]
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			collections: []
		};
		await patch(itemKey, itemVersion, itemData, newData);
	});

	it('testPatchItems', async function () {
		const itemData = {
			title: "Test"
		};
		const json = await API.createItem("book", itemData, this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		const patch = async (itemKey, itemVersion, itemData, newData) => {
			for (const field in newData) {
				itemData[field] = newData[field];
			}
			newData.key = itemKey;
			newData.version = itemVersion;

			const response = await API.userPost(
				config.userID,
				"items",
				JSON.stringify([newData]),
				{
					"Content-Type": "application/json"
				}
			);
			Helpers.assert200ForObject(response);
			const json = (await API.getItem(itemKey, true, 'json')).data;

			for (const field in itemData) {
				assert.deepEqual(itemData[field], json[field]);
			}
			const headerVersion = parseInt(response.headers["last-modified-version"][0]);
			assert.isAbove(headerVersion, itemVersion);
			assert.equal(json.version, headerVersion);

			return headerVersion;
		};

		let newData = {
			date: "2013"
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			title: ""
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			tags: [
				{ tag: "Foo" }
			]
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			tags: []
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		const key = await API.createCollection('Test', false, this, 'key');
		newData = {
			collections: [key]
		};
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = {
			collections: []
		};
		await patch(itemKey, itemVersion, itemData, newData);
	});

	it('testNewComputerProgramItem', async function () {
		const data = await API.createItem('computerProgram', false, true, 'jsonData');
		const key = data.key;
		assert.equal(data.itemType, 'computerProgram');

		const version = '1.0';
		data.versionNumber = version;

		const response = await API.userPut(
			config.userID,
			`items/${key}`,
			JSON.stringify(data),
			{ "Content-Type": "application/json", "If-Unmodified-Since-Version": data.version }
		);

		Helpers.assertStatusCode(response, 204);
		const json = await API.getItem(key, true, 'json');
		assert.equal(json.data.versionNumber, version);
	});

	it('testNewInvalidBookItem', async function () {
		const json = await API.getItemTemplate("book");

		// Missing item type
		const json2 = { ...json };
		delete json2.itemType;
		let response = await API.userPost(
			config.userID,
			`items`,
			JSON.stringify([json2]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(response, 'failed', 0, 400, "'itemType' property not provided");

		// contentType on non-attachment
		const json3 = { ...json };
		json3.contentType = "text/html";
		response = await API.userPost(
			config.userID,
			`items`,
			JSON.stringify([json3]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(response, 'failed', 0, 400, "'contentType' is valid only for attachment items");
	});

	it('testEditTopLevelNote', async function () {
		let noteText = "<p>Test</p>";
		let json = await API.createNoteItem(noteText, null, true, 'jsonData');
		noteText = "<p>Test Test</p>";
		json.note = noteText;
		const response = await API.userPut(
			config.userID,
			`items/${json.key}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);
		const response2 = await API.userGet(
			config.userID,
			`items/${json.key}`
		);
		Helpers.assertStatusCode(response2, 200);
		json = API.getJSONFromResponse(response2).data;
		assert.equal(json.note, noteText);
	});

	it('testEditChildNote', async function () {
		let noteText = "<p>Test</p>";
		const key = await API.createItem("book", { title: "Test" }, true, 'key');
		let json = await API.createNoteItem(noteText, key, true, 'jsonData');

		noteText = "<p>Test Test</p>";
		json.note = noteText;
		const response1 = await API.userPut(
			config.userID,
			"items/" + json.key,
			JSON.stringify(json)
		);
		assert.equal(response1.status, 204);
		const response2 = await API.userGet(
			config.userID,
			"items/" + json.key
		);
		Helpers.assertStatusCode(response2, 200);
		json = API.getJSONFromResponse(response2).data;
		assert.equal(json.note, noteText);
	});

	it('testEditTitleWithCollectionInMultipleMode', async function () {
		const collectionKey = await API.createCollection('Test', false, true, 'key');
		let json = await API.createItem('book', {
			title: 'A',
			collections: [
				collectionKey,
			],
		}, true, 'jsonData');
		const version = json.version;
		json.title = 'B';

		const response = await API.userPost(
			config.userID,
			`items`, JSON.stringify([json]),
		);
		Helpers.assert200ForObject(response, 200);
		json = (await API.getItem(json.key, true, 'json')).data;
		assert.equal(json.title, 'B');
		assert.isAbove(json.version, version);
	});

	it('testEditTitleWithTagInMultipleMode', async function () {
		const tag1 = {
			tag: 'foo',
			type: 1,
		};
		const tag2 = {
			tag: 'bar',
		};

		let json = await API.createItem('book', {
			title: 'A',
			tags: [tag1],
		}, true, 'jsonData');

		assert.equal(json.tags.length, 1);
		assert.deepEqual(json.tags[0], tag1);

		const version = json.version;
		json.title = 'B';
		json.tags.push(tag2);

		const response = await API.userPost(
			config.userID,
			`items`,
			JSON.stringify([json]),
		);
		Helpers.assertStatusForObject(response, 'success', 0);
		json = (await API.getItem(json.key, true, 'json')).data;

		assert.equal(json.title, 'B');
		assert.isAbove(json.version, version);
		assert.equal(json.tags.length, 2);
		assert.deepEqual(json.tags, [tag2, tag1]);
	});

	it('testNewTopLevelImportedFileAttachment', async function () {
		const response = await API.get("items/new?itemType=attachment&linkMode=imported_file");
		const json = JSON.parse(response.data);
		const userPostResponse = await API.userPost(
			config.userID,
			`items`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(userPostResponse);
	});

	it('testNewInvalidTopLevelAttachment', async function () {
		this.skip(); //disabled
	});

	it('testNewEmptyLinkAttachmentItemWithItemKey', async function () {
		const key = await API.createItem("book", false, true, 'key');
		await API.createAttachmentItem("linked_url", [], key, true, 'json');
			
		let response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		let json = JSON.parse(response.data);
		json.parentItem = key;

		json.key = Helpers.uniqueID();
		json.version = 0;
			
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
	});

	it('testEditEmptyImportedURLAttachmentItem', async function () {
		let key = await API.createItem('book', false, true, 'key');
		let json = await API.createAttachmentItem("imported_url", [], key, true, 'jsonData');
		const version = json.version;
		key = json.key;


		const response = await API.userPut(
			config.userID,
			`items/${key}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': version
			}
		);
		Helpers.assertStatusCode(response, 204);

		json = (await API.getItem(key, true, 'json')).data;
		// Item Shouldn't be changed
		assert.equal(version, json.version);
	});

	const testEditEmptyLinkAttachmentItem = async () => {
		let key = await API.createItem('book', false, true, 'key');
		let json = await API.createAttachmentItem('linked_url', [], key, true, 'jsonData');

		key = json.key;
		const version = json.version;

		const response = await API.userPut(
			config.userID,
			`items/${key}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);
		Helpers.assertStatusCode(response, 204);

		json = (await API.getItem(key, true, 'json')).data;
		// Item shouldn't change
		assert.equal(version, json.version);
		return json;
	};

	it('testEditLinkAttachmentItem', async function () {
		let json = await testEditEmptyLinkAttachmentItem();
		const key = json.key;
		const version = json.version;

		const contentType = "text/xml";
		const charset = "utf-8";

		json.contentType = contentType;
		json.charset = charset;

		const response = await API.userPut(
			config.userID,
			`items/${key}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);

		Helpers.assertStatusCode(response, 204);

		json = (await API.getItem(key, true, 'json')).data;

		assert.equal(json.contentType, contentType);
		assert.equal(json.charset, charset);
	});

	it('testEditAttachmentAtomUpdatedTimestamp', async function () {
		const xml = await API.createAttachmentItem("linked_file", [], false, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const atomUpdated = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		const json = JSON.parse(data.content);
		delete json.dateModified;
		json.note = "Test";
	
		await new Promise(resolve => setTimeout(resolve, 1000));
	
		const response = await API.userPut(
			config.userID,
			`items/${data.key}`,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": data.version,
				"User-Agent": "Firefox" } // TODO: Remove
		);
		Helpers.assert204(response);
	
		const xml2 = await API.getItemXML(data.key);
		const atomUpdated2 = Helpers.xpathEval(xml2, '//atom:entry/atom:updated');
		assert.notEqual(atomUpdated2, atomUpdated);
	});

	it('testEditAttachmentAtomUpdatedTimestampTmpZoteroClientHack', async function () {
		const xml = await API.createAttachmentItem("linked_file", [], false, true, 'atom');
		const data = API.parseDataFromAtomEntry(xml);
		const atomUpdated = Helpers.xpathEval(xml, '//atom:entry/atom:updated');
		const json = JSON.parse(data.content);
		json.note = "Test";
	
		await new Promise(resolve => setTimeout(resolve, 1000));
	
		const response = await API.userPut(
			config.userID,
			`items/${data.key}`,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": data.version }
		);
		Helpers.assert204(response);
	
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
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(newResponse, 'failed', 0, 400, "'invalidName' is not a valid linkMode");

		// Missing linkMode
		delete json.linkMode;
		const missingResponse = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(missingResponse, 'failed', 0, 400, "'linkMode' property not provided");
	});
	it('testNewAttachmentItemMD5OnLinkedURL', async function () {
		let json = await testNewEmptyBookItem();
		const parentKey = json.key;

		const response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		json = JSON.parse(response.data);
		json.parentItem = parentKey;

		json.md5 = "c7487a750a97722ae1878ed46b215ebe";
		const postResponse = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(postResponse, 'failed', 0, 400, "'md5' is valid only for imported and embedded-image attachments");
	});
	it('testNewAttachmentItemModTimeOnLinkedURL', async function () {
		let json = await testNewEmptyBookItem();
		const parentKey = json.key;

		const response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		json = JSON.parse(response.data);
		json.parentItem = parentKey;

		json.mtime = "1332807793000";
		const postResponse = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusForObject(postResponse, 'failed', 0, 400, "'mtime' is valid only for imported and embedded-image attachments");
	});
	it('testMappedCreatorTypes', async function () {
		const json = [
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
		];
		const response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify(json)
		);
		// 'author' gets mapped automatically, others dont
		Helpers.assert200ForObject(response);
		Helpers.assert400ForObject(response, { index: 1 });
	});

	it('testNumChildrenJSON', async function () {
		let json = await API.createItem("book", false, true, 'json');
		assert.equal(json.meta.numChildren, 0);

		const key = json.key;

		await API.createAttachmentItem("linked_url", [], key, true, 'key');

		let response = await API.userGet(
			config.userID,
			`items/${key}`
		);
		json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 1);

		await API.createNoteItem("Test", key, true, 'key');

		response = await API.userGet(
			config.userID,
			`items/${key}`
		);
		json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 2);
	});

	it('testNumChildrenAtom', async function () {
		let xml = await API.createItem("book", false, true, 'atom');
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren'), 0);
		const data = API.parseDataFromAtomEntry(xml);
		const key = data.key;

		await API.createAttachmentItem("linked_url", [], key, true, 'key');

		let response = await API.userGet(
			config.userID,
			`items/${key}?content=json`
		);
		xml = API.getXMLFromResponse(response);
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren'), 1);

		await API.createNoteItem("Test", key, true, 'key');

		response = await API.userGet(
			config.userID,
			`items/${key}?content=json`
		);
		xml = API.getXMLFromResponse(response);
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren'), 2);
	});

	it('testTop', async function () {
		await API.userClear(config.userID);

		const collectionKey = await API.createCollection('Test', false, this, 'key');
		const emptyCollectionKey = await API.createCollection('Empty', false, this, 'key');

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

		const orderedTitles = [parentTitle1, parentTitle2, parentTitle3].sort();
		const orderedDatesReverse = [...orderedDates].reverse();
		const orderedItemTypes = [...itemTypes].sort();
		const reversedItemTypes = [...orderedItemTypes].reverse();

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
		childKeys.push(await API.createAttachmentItem(
			'embedded_image',
			{ contentType: "image/png" },
			childKeys[childKeys.length - 1],
			this, 'key'));

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

		let response, xpath, json, done;

		// /top, JSON
		response = await top(`items/top`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		done = [];
		for (let item of json) {
			assert.include(parentKeys, item.key);
			assert.notInclude(done, item.key);
			done.push(item.key);
		}

		// /top, Atom
		response = await top(`items/top?content=json`, parentKeys.length);
		xpath = await checkXml(response, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(xpath, parentKey);
		}

		// /top, JSON, in collection
		response = await top(`collections/${collectionKey}/items/top`, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertNumResults(response, 1);
		assert.equal(parentKeys[0], json[0].key);

		// /top, Atom, in collection
		response = await top(`collections/${collectionKey}/items/top?content=json`, 1);
		xpath = await checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, JSON, in empty collection
		response = await top(`collections/${emptyCollectionKey}/items/top`, 0);
		Helpers.assertTotalResults(response, 0);

		// /top, keys
		response = await top(`items/top?format=keys`);
		let keys = response.data.trim().split("\n");
		assert.equal(keys.length, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(keys, parentKey);
		}

		// /top, keys, in collection
		response = await top(`collections/${collectionKey}/items/top?format=keys`);
		assert.equal(response.data.trim(), parentKeys[0]);

		// /top with itemKey for parent, JSON
		response = await top(`items/top?itemKey=${parentKeys[0]}`, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(parentKeys[0], json[0].key);

		// /top with itemKey for parent, Atom
		response = await top(`items/top?content=json&itemKey=${parentKeys[0]}`, 1);
		xpath = await checkXml(response);
		assert.equal(parentKeys[0], xpath.shift());

		// /top with itemKey for parent, JSON, in collection
		response = await top(`collections/${collectionKey}/items/top?itemKey=${parentKeys[0]}`, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(parentKeys[0], json[0].key);

		// /top with itemKey for parent, Atom, in collection
		response = await top(`collections/${collectionKey}/items/top?content=json&itemKey=${parentKeys[0]}`, 1);
		xpath = await checkXml(response);
		assert.equal(parentKeys[0], xpath.shift());

		// /top with itemKey for parent, keys
		response = await top(`items/top?format=keys&itemKey=${parentKeys[0]}`);
		assert.equal(parentKeys[0], response.data.trim());

		// /top with itemKey for parent, keys, in collection
		response = await top(`collections/${collectionKey}/items/top?format=keys&itemKey=${parentKeys[0]}`);
		assert.equal(parentKeys[0], response.data.trim());

		// /top with itemKey for child, JSON
		response = await top(`items/top?itemKey=${childKeys[0]}`, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(parentKeys[0], json[0].key);

		// /top with itemKey for child, Atom
		response = await top(`items/top?content=json&itemKey=${childKeys[0]}`, 1);
		xpath = await checkXml(response);
		assert.equal(parentKeys[0], xpath.shift());

		// /top with itemKey for child, keys
		response = await top(`items/top?format=keys&itemKey=${childKeys[0]}`);
		assert.equal(parentKeys[0], response.data.trim());

		// /top, Atom, with q for all items
		response = await top(`items/top?content=json&q=${parentTitleSearch}`, parentKeys.length);
		xpath = await checkXml(response, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(xpath, parentKey);
		}

		// /top, JSON, with q for all items
		response = await top(`items/top?q=${parentTitleSearch}`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		done = [];
		for (let item of json) {
			assert.include(parentKeys, item.key);
			assert.notInclude(done, item.key);
			done.push(item.key);
		}

		// /top, JSON, in collection, with q for all items
		response = await top(`collections/${collectionKey}/items/top?q=${parentTitleSearch}`, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(parentKeys[0], json[0].key);

		// /top, Atom, in collection, with q for all items
		response = await top(`collections/${collectionKey}/items/top?content=json&q=${parentTitleSearch}`, 1);
		xpath = await checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, JSON, with q for child item
		response = await top(`items/top?q=${childTitleSearch}`, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(parentKeys[0], json[0].key);

		// /top, Atom, with q for child item
		response = await top(`items/top?content=json&q=${childTitleSearch}`, 1);
		xpath = checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, JSON, in collection, with q for child item
		response = await top(`collections/${collectionKey}/items/top?q=${childTitleSearch}`, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(parentKeys[0], json[0].key);

		// /top, Atom, in collection, with q for child item
		response = await top(`collections/${collectionKey}/items/top?content=json&q=${childTitleSearch}`, 1);
		xpath = checkXml(response, 1);
		assert.include(xpath, parentKeys[0]);

		// /top, JSON, with q for all items, ordered by title
		response = await top(`items/top?q=${parentTitleSearch}&order=title`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		let returnedTitles = [];
		for (let item of json) {
			returnedTitles.push(item.data.title);
		}
		assert.deepEqual(orderedTitles, returnedTitles);

		// /top, Atom, with q for all items, ordered by title
		response = await top(`items/top?content=json&q=${parentTitleSearch}&order=title`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/atom:title');
		let orderedResults = xpath.map(val => String(val));
		assert.deepEqual(orderedTitles, orderedResults);

		// /top, Atom, with q for all items, ordered by date asc
		response = await top(`items/top?content=json&q=${parentTitleSearch}&order=date&sort=asc`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/atom:content');
		orderedResults = xpath.map(val => JSON.parse(val).date);
		assert.deepEqual(orderedDates, orderedResults);

		// /top, JSON, with q for all items, ordered by date asc
		response = await top(`items/top?q=${parentTitleSearch}&order=date&sort=asc`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		orderedResults = Object.entries(json).map(([_, val]) => {
			return val.data.date;
		});
		assert.deepEqual(orderedDates, orderedResults);

		// /top, Atom, with q for all items, ordered by date desc
		response = await top(`items/top?content=json&q=${parentTitleSearch}&order=date&sort=desc`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/atom:content');
		orderedResults = xpath.map(val => JSON.parse(val).date);
		assert.deepEqual(orderedDatesReverse, orderedResults);

		// /top, JSON, with q for all items, ordered by date desc
		response = await top(`items/top?&q=${parentTitleSearch}&order=date&sort=desc`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		orderedResults = Object.entries(json).map(([_, val]) => {
			return val.data.date;
		});
		assert.deepEqual(orderedDatesReverse, orderedResults);

		// /top, Atom, with q for all items, ordered by item type asc
		response = await top(`items/top?content=json&q=${parentTitleSearch}&order=itemType`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/zapi:itemType');
		orderedResults = xpath.map(val => String(val));
		assert.deepEqual(orderedItemTypes, orderedResults);

		// /top, JSON, with q for all items, ordered by item type asc
		response = await top(`items/top?q=${parentTitleSearch}&order=itemType`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		orderedResults = Object.entries(json).map(([_, val]) => {
			return val.data.itemType;
		});
		assert.deepEqual(orderedItemTypes, orderedResults);

		// /top, Atom, with q for all items, ordered by item type desc
		response = await top(`items/top?content=json&q=${parentTitleSearch}&order=itemType&sort=desc`, parentKeys.length);
		xpath = checkXml(response, parentKeys.length, '//atom:entry/zapi:itemType');
		orderedResults = xpath.map(val => String(val));
		assert.deepEqual(reversedItemTypes, orderedResults);

		// /top, JSON, with q for all items, ordered by item type desc
		response = await top(`items/top?q=${parentTitleSearch}&order=itemType&sort=desc`, parentKeys.length);
		json = API.getJSONFromResponse(response);
		orderedResults = Object.entries(json).map(([_, val]) => {
			return val.data.itemType;
		});
		assert.deepEqual(reversedItemTypes, orderedResults);
	});

	it('testParentItem', async function () {
		let json = await API.createItem("book", false, true, "jsonData");
		let parentKey = json.key;

		json = await API.createAttachmentItem("linked_file", [], parentKey, true, 'jsonData');
		let childKey = json.key;
		let childVersion = json.version;

		assert.property(json, "parentItem");
		assert.equal(parentKey, json.parentItem);

		// Remove the parent, making the child a standalone attachment
		delete json.parentItem;

		let response = await API.userPut(
			config.userID,
			`items/${childKey}`,
			JSON.stringify(json),
			{ "If-Unmodified-Since-Version": childVersion }
		);
		Helpers.assert204(response);

		json = (await API.getItem(childKey, true, 'json')).data;
		assert.notProperty(json, "parentItem");
	});

	it('testParentItemPatch', async function () {
		let json = await API.createItem("book", false, true, 'jsonData');
		const parentKey = json.key;

		json = await API.createAttachmentItem("linked_file", [], parentKey, true, 'jsonData');
		const childKey = json.key;
		let childVersion = json.version;

		assert.property(json, "parentItem");
		assert.equal(parentKey, json.parentItem);

		// With PATCH, parent shouldn't be removed even though unspecified
		let response = await API.userPatch(
			config.userID,
			`items/${childKey}`,
			JSON.stringify({ title: "Test" }),
			{ "If-Unmodified-Since-Version": childVersion },
		);

		Helpers.assert204(response);

		json = (await API.getItem(childKey, true, "json")).data;
		assert.property(json, "parentItem");
		
		childVersion = json.version;

		// But it should be removed with parentItem: false
		response = await API.userPatch(
			config.userID,
			`items/${childKey}`,
			JSON.stringify({ parentItem: false }),
			{ "If-Unmodified-Since-Version": childVersion },
		);
		Helpers.assert204(response);
		json = (await API.getItem(childKey, true, "json")).data;
		assert.notProperty(json, "parentItem");
	});

	it('testDate', async function () {
		const date = "Sept 18, 2012";
		const parsedDate = '2012-09-18';

		let json = await API.createItem("book", { date: date }, true, 'jsonData');
		const key = json.key;

		let response = await API.userGet(
			config.userID,
			`items/${key}`
		);
		json = await API.getJSONFromResponse(response);
		assert.equal(json.data.date, date);
		assert.equal(json.meta.parsedDate, parsedDate);

		let xml = await API.getItem(key, true, 'atom');
		assert.equal(Helpers.xpathEval(xml, '//atom:entry/zapi:parsedDate'), parsedDate);
	});


	it('test_patch_of_item_in_trash_without_deleted_should_not_remove_it_from_trash', async function () {
		let json = await API.createItem("book", {
			deleted: true
		}, this, 'json');
		
		let data = [
			{
				key: json.key,
				version: json.version,
				title: 'A'
			}
		];
		let response = await API.postItems(data);
		let jsonResponse = await API.getJSONFromResponse(response);
		
		assert.property(jsonResponse.successful[0].data, 'deleted');
		Helpers.assertEquals(1, jsonResponse.successful[0].data.deleted);
	});

	it('test_deleting_parent_item_should_delete_note_and_embedded_image_attachment', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;
		// Create embedded-image attachment
		let noteKey = await API.createNoteItem(
			'<p>Test</p>', itemKey, this, 'key'
		);
		// Create image annotation
		let attachmentKey = await API.createAttachmentItem(
			'embedded_image', { contentType: 'image/png' }, noteKey, this, 'key'
		);
		// Check that all items can be found
		let response = await API.userGet(
			config.userID,
			"items?itemKey=" + itemKey + "," + noteKey + "," + attachmentKey
		);
		Helpers.assertNumResults(response, 3);
		response = await API.userDelete(
			config.userID,
			"items/" + itemKey,
			{ "If-Unmodified-Since-Version": itemVersion }
		);
		Helpers.assert204(response);
		response = await API.userGet(
			config.userID,
			"items?itemKey=" + itemKey + "," + noteKey + "," + attachmentKey
		);
		json = await API.getJSONFromResponse(response);
		Helpers.assertNumResults(response, 0);
	});

	it('testTrash', async function () {
		await API.userClear(config.userID);
    
		const key1 = await API.createItem("book", false, this, 'key');
		const key2 = await API.createItem("book", {
			deleted: 1
		}, this, 'key');
    
		// Item should show up in trash
		let response = await API.userGet(
			config.userID,
			"items/trash"
		);
		let json = await API.getJSONFromResponse(response);
		Helpers.assertCount(1, json);
		Helpers.assertEquals(key2, json[0].key);
    
		// And not show up in main items
		response = await API.userGet(
			config.userID,
			"items"
		);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(1, json);
		Helpers.assertEquals(key1, json[0].key);
    
		// Including with ?itemKey
		response = await API.userGet(
			config.userID,
			"items?itemKey=" + key2
		);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(0, json);
	});

	it('test_should_convert_child_note_to_top_level_and_add_to_collection_via_PUT', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		let parentItemKey = await API.createItem("book", false, this, 'key');
		let noteJSON = await API.createNoteItem("", parentItemKey, this, 'jsonData');
		delete noteJSON.parentItem;
		noteJSON.collections = [collectionKey];
		let response = await API.userPut(
			config.userID,
			`items/${noteJSON.key}`,
			JSON.stringify(noteJSON),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		let json = (await API.getItem(noteJSON.key, this, 'json')).data;
		assert.notProperty(json, 'parentItem');
		Helpers.assertCount(1, json.collections);
		Helpers.assertEquals(collectionKey, json.collections[0]);
	});

	it('test_should_reject_invalid_content_type_for_embedded_image_attachment', async function () {
		let noteKey = await API.createNoteItem("Test", null, this, 'key');
		let response = await API.get("items/new?itemType=attachment&linkMode=embedded_image");
		let json = JSON.parse(response.data);
		json.parentItem = noteKey;
		json.contentType = 'application/pdf';
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, "Embedded-image attachment must have an image content type");
	});

	it('testPatchNote', async function () {
		let text = "<p>Test</p>";
		let newText = "<p>Test 2</p>";
		let json = await API.createNoteItem(text, false, this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let response = await API.userPatch(
			config.userID,
			"items/" + itemKey,
			JSON.stringify({
				note: newText
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion
			}
		);

		Helpers.assert204(response);
		json = (await API.getItem(itemKey, this, 'json')).data;

		Helpers.assertEquals(newText, json.note);
		let headerVersion = parseInt(response.headers["last-modified-version"][0]);
		assert.isAbove(headerVersion, itemVersion);
		Helpers.assertEquals(json.version, headerVersion);
	});

	it('test_should_create_embedded_image_attachment_for_note', async function () {
		let noteKey = await API.createNoteItem("Test", null, this, 'key');
		let imageKey = await API.createAttachmentItem(
			'embedded_image', { contentType: 'image/png' }, noteKey, this, 'key'
		);
		assert.ok(imageKey);
	});

	it('test_should_return_409_if_a_note_references_a_note_as_a_parent_item', async function () {
		let parentKey = await API.createNoteItem("<p>Parent</p>", null, this, 'key');
		let json = await API.createNoteItem("<p>Parent</p>", parentKey, this);
		Helpers.assert409ForObject(json, "Parent item cannot be a note or attachment");
		Helpers.assertEquals(parentKey, json.failed[0].data.parentItem);
	});

	it('testDateModifiedTmpZoteroClientHack', async function () {
		let objectType = 'item';
		let objectTypePlural = API.getPluralObjectType(objectType);

		let json = await API.createItem("videoRecording", { title: "Test" }, this, 'jsonData');

		let objectKey = json.key;
		let dateModified1 = json.dateModified;

		await new Promise(resolve => setTimeout(resolve, 1000));

		json.title = "Test 2";
		delete json.dateModified;
		let response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json),
			{
				"User-Agent": "Firefox"
			}
		);
		Helpers.assert204(response);
		
		if (objectType == 'item') {
			json = (await API.getItem(objectKey, this, 'json')).data;
		}
		
    
		let dateModified2 = json.dateModified;
		assert.notEqual(dateModified1, dateModified2);

		await new Promise(resolve => setTimeout(resolve, 1000));

		json.title = "Test 3";
		json.dateModified = dateModified2.replace(/[TZ]/g, ' ').trim();
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json),
			{
				"User-Agent": "Firefox"
			}
		);
		Helpers.assert204(response);

		if (objectType == 'item') {
			json = (await API.getItem(objectKey, this, 'json')).data;
		}
		Helpers.assertEquals(dateModified2, json.dateModified);
    
		let newDateModified = "2013-03-03T21:33:53Z";
    
		json.title = "Test 4";
		json.dateModified = newDateModified;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json),
			{
				"User-Agent": "Firefox"
			}
		);
		Helpers.assert204(response);

		if (objectType == 'item') {
			json = (await API.getItem(objectKey, this, 'json')).data;
		}
		Helpers.assertEquals(newDateModified, json.dateModified);
	});

	it('test_top_should_return_top_level_item_for_three_level_hierarchy', async function () {
		await API.userClear(config.userID);
    
		let itemKey = await API.createItem("book", { title: 'aaa' }, this, 'key');
		let attachmentKey = await API.createAttachmentItem("imported_url", {
			contentType: 'application/pdf',
			title: 'bbb'
		}, itemKey, this, 'key');
		let _ = await API.createAnnotationItem('highlight', { annotationComment: 'ccc' }, attachmentKey, this, 'key');
    
		let response = await API.userGet(config.userID, "items/top?q=bbb");
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals("aaa", json[0].data.title);
        
		response = await API.userGet(config.userID, "items/top?itemType=annotation");
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals("aaa", json[0].data.title);
        
		response = await API.userGet(config.userID, `items/top?itemKey=${attachmentKey}`);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals("aaa", json[0].data.title);
	});

	it('testDateModifiedNoChange', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		
		let json = await API.createItem('book', false, this, 'jsonData');
		let modified = json.dateModified;
		
		for (let i = 1; i <= 5; i++) {
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			switch (i) {
				case 1:
					json.title = 'A';
					break;
			
				case 2:
				// For all subsequent tests, unset field, which would normally cause it to be updated
					delete json.dateModified;
				
					json.collections = [collectionKey];
					break;
			
				case 3:
					json.deleted = true;
					break;
			
				case 4:
					json.deleted = false;
					break;
			
				case 5:
					json.tags = [{
						tag: 'A'
					}];
					break;
			}
			
			let response = await API.userPost(
				config.userID,
				"items",
				JSON.stringify([json]),
				{
					"If-Unmodified-Since-Version": json.version,
					// TODO: Remove
					"User-Agent": "Firefox"
				}
			);
			Helpers.assert200(response);
			json = API.getJSONFromResponse(response).successful[0].data;
			Helpers.assertEquals(modified, json.dateModified, "Date Modified changed on loop " + i);
		}
	});

	it('testDateModifiedCollectionChange', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		let json = await API.createItem("book", { title: "Test" }, this, 'jsonData');
		
		let objectKey = json.key;
		let dateModified1 = json.dateModified;
		
		json.collections = [collectionKey];
		
		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		
		json = (await API.getItem(objectKey, this, 'json')).data;
		let dateModified2 = json.dateModified;
		
		// Date Modified shouldn't have changed
		Helpers.assertEquals(dateModified1, dateModified2);
	});

	it('test_should_return_409_if_an_attachment_references_a_note_as_a_parent_item', async function () {
		let parentKey;
		await API.createNoteItem('<p>Parent</p>', null, this, 'key').then((res) => {
			parentKey = res;
		});
		let json;
		await API.createAttachmentItem('imported_file', [], parentKey, this, 'responseJSON').then((res) => {
			json = res;
		});
		Helpers.assert409ForObject(json, 'Parent item cannot be a note or attachment');
		Helpers.assertEquals(parentKey, json.failed[0].data.parentItem);
	});

	it('testDateAddedNewItem8601TZ', async function () {
		const objectType = 'item';
		const dateAdded = "2013-03-03T17:33:53-0400";
		const dateAddedUTC = "2013-03-03T21:33:53Z";
		let itemData = {
			title: "Test",
			dateAdded: dateAdded
		};
		let data;
		switch (objectType) {
			case 'item':
				data = await API.createItem("videoRecording", itemData, this, 'jsonData');
				break;
		}
		assert.equal(dateAddedUTC, data.dateAdded);
	});

	it('testDateAccessed8601TZ', async function () {
		let date = '2014-02-01T01:23:45-0400';
		let dateUTC = '2014-02-01T05:23:45Z';
		let data = await API.createItem("book", {
			accessDate: date
		}, this, 'jsonData');
		Helpers.assertEquals(dateUTC, data.accessDate);
	});

	it('test_should_reject_embedded_image_attachment_without_parent', async function () {
		let response = await API.get("items/new?itemType=attachment&linkMode=embedded_image");
		let json = JSON.parse(response.data);
		json.parentItem = false;
		json.contentType = 'image/png';
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, "Embedded-image attachment must have a parent item");
	});

	it('testNewEmptyAttachmentFields', async function () {
		let key = await API.createItem("book", false, this, 'key');
		let json = await API.createAttachmentItem("imported_url", [], key, this, 'jsonData');
		assert.notOk(json.md5);
		assert.notOk(json.mtime);
	});

	it('testDateUnparseable', async function () {
		let json = await API.createItem("book", {
			date: 'n.d.'
		}, this, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.userID,
			"items/" + key
		);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals('n.d.', json.data.date);

		// meta.parsedDate (JSON)
		assert.notProperty(json.meta, 'parsedDate');

		// zapi:parsedDate (Atom)
		let xml = await API.getItem(key, this, 'atom');
		Helpers.assertCount(0, Helpers.xpathEval(xml, '/atom:entry/zapi:parsedDate', false, true).length);
	});

	it('test_should_ignore_null_for_existing_storage_properties', async function () {
		let key = await API.createItem("book", [], this, 'key');
		let json = await API.createAttachmentItem(
			"imported_url",
			{
				md5: Helpers.md5(Helpers.uniqueID(50)),
				mtime: Date.now()
			},
			key,
			this,
			'jsonData'
		);
	
		key = json.key;
		let version = json.version;
	
		let props = ["md5", "mtime"];
		for (let prop of props) {
			let json2 = { ...json };
			json2[prop] = null;
			let response = await API.userPut(
				config.userID,
				"items/" + key,
				JSON.stringify(json2),
				{
					"Content-Type": "application/json",
					"If-Unmodified-Since-Version": version
				}
			);
			Helpers.assert204(response);
		}
	
		let json3 = await API.getItem(json.key);
		Helpers.assertEquals(json.md5, json3.data.md5);
		Helpers.assertEquals(json.mtime, json3.data.mtime);
	});

	it('test_should_reject_changing_parent_of_embedded_image_attachment', async function () {
		let note1Key = await API.createNoteItem("Test 1", null, this, 'key');
		let note2Key = await API.createNoteItem("Test 2", null, this, 'key');
		let response = await API.get("items/new?itemType=attachment&linkMode=embedded_image");
		let json = JSON.parse(await response.data);
		json.parentItem = note1Key;
		json.contentType = 'image/png';
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = await API.getJSONFromResponse(response);
		let key = json.successful[0].key;
		json = await API.getItem(key, this, 'json');
		
		// Change the parent item
		json = {
			version: json.version,
			parentItem: note2Key
		};
		response = await API.userPatch(
			config.userID,
			`items/${key}`,
			JSON.stringify(json)
		);
		Helpers.assert400(response, "Cannot change parent item of embedded-image attachment");
	});

	it('test_should_convert_child_attachment_to_top_level_and_add_to_collection_via_PATCH_without_parentItem_false', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		let parentItemKey = await API.createItem("book", false, this, 'key');
		let attachmentJSON = await API.createAttachmentItem("linked_url", [], parentItemKey, this, 'jsonData');
		delete attachmentJSON.parentItem;
		attachmentJSON.collections = [collectionKey];
		let response = await API.userPatch(
			config.userID,
			"items/" + attachmentJSON.key,
			JSON.stringify(attachmentJSON)
		);
		Helpers.assert204(response);
		let json = (await API.getItem(attachmentJSON.key, this, 'json')).data;
		assert.notProperty(json, 'parentItem');
		Helpers.assertCount(1, json.collections);
		Helpers.assertEquals(collectionKey, json.collections[0]);
	});

	it('testDateModifiedChangeOnEdit', async function () {
		let json = await API.createAttachmentItem("linked_file", [], false, this, 'jsonData');
		let modified = json.dateModified;
		delete json.dateModified;
		json.note = "Test";
		await new Promise(resolve => setTimeout(resolve, 1000));
		const headers = { "If-Unmodified-Since-Version": json.version };
		const response = await API.userPut(
			config.userID,
			"items/" + json.key,
			JSON.stringify(json),
			headers
		);
		Helpers.assert204(response);
		json = (await API.getItem(json.key, this, 'json')).data;
		assert.notEqual(modified, json.dateModified);
	});

	it('test_patch_of_item_should_set_trash_state', async function () {
		let json = await API.createItem("book", [], this, 'json');
		
		let data = [
			{
				key: json.key,
				version: json.version,
				deleted: true
			}
		];
		let response = await API.postItems(data);
		json = await API.getJSONFromResponse(response);
  
		assert.property(json.successful[0].data, 'deleted');
		Helpers.assertEquals(1, json.successful[0].data.deleted);
	});

	it('testCreateLinkedFileAttachment', async function () {
		let key = await API.createItem("book", false, this, 'key');
		let path = 'attachments:tést.txt';
		let json = await API.createAttachmentItem(
			"linked_file", {
				path: path
			}, key, this, 'jsonData'
		);
		Helpers.assertEquals('linked_file', json.linkMode);
		// Linked file should have path
		Helpers.assertEquals(path, json.path);
		// And shouldn't have other attachment properties
		assert.notProperty(json, 'filename');
		assert.notProperty(json, 'md5');
		assert.notProperty(json, 'mtime');
	});

	it('test_should_convert_child_note_to_top_level_and_add_to_collection_via_PATCH', async function () {
		let collectionKey = await API.createCollection('Test', false, this, 'key');
		let parentItemKey = await API.createItem("book", false, this, 'key');
		let noteJSON = await API.createNoteItem("", parentItemKey, this, 'jsonData');
		noteJSON.parentItem = false;
		noteJSON.collections = [collectionKey];
		let headers = { "Content-Type": "application/json" };
		let response = await API.userPatch(
			config.userID,
			`items/${noteJSON.key}`,
			JSON.stringify(noteJSON),
			headers
		);
		Helpers.assert204(response);
		let json = await API.getItem(noteJSON.key, this, 'json');
		json = json.data;
		assert.notProperty(json, 'parentItem');
		Helpers.assertCount(1, json.collections);
		Helpers.assertEquals(collectionKey, json.collections[0]);
	});

	it('test_createdByUser', async function () {
		let json = await API.groupCreateItem(
			config.ownedPrivateGroupID,
			'book',
			[],
			true,
			'json'
		);
		Helpers.assertEquals(config.userID, json.meta.createdByUser.id);
		Helpers.assertEquals(config.username, json.meta.createdByUser.username);
	// TODO: Name and URI
	});

	it('testPatchNoteOnBookError', async function () {
		let json = await API.createItem("book", [], this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let response = await API.userPatch(
			config.userID,
			`items/${itemKey}`,
			JSON.stringify({
				note: "Test"
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion
			}
		);
		Helpers.assert400(response, "'note' property is valid only for note and attachment items");
	});

	it('test_deleting_parent_item_should_delete_attachment_and_annotation', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;
    
		json = await API.createAttachmentItem(
			"imported_file", { contentType: 'application/pdf' }, itemKey, this, 'jsonData'
		);
		let attachmentKey = json.key;
    
		let annotationKey = await API.createAnnotationItem(
			'highlight',
			{ annotationComment: 'ccc' },
			attachmentKey,
			this,
			'key'
		);
    
		const response = await API.userGet(
			config.userID,
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		Helpers.assertNumResults(response, 3);
    
		const deleteResponse = await API.userDelete(
			config.userID,
			`items/${itemKey}`,
			{ 'If-Unmodified-Since-Version': itemVersion }
		);
		Helpers.assert204(deleteResponse);
    
		const checkResponse = await API.userGet(
			config.userID,
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		json = await API.getJSONFromResponse(checkResponse);
		Helpers.assertNumResults(checkResponse, 0);
	});

	it('test_deleting_group_library_attachment_should_delete_lastPageIndex_setting_for_all_users', async function () {
		const json = await API.groupCreateAttachmentItem(
			config.ownedPrivateGroupID,
			"imported_file",
			{ contentType: 'application/pdf' },
			null,
			this,
			'jsonData'
		);
		const attachmentKey = json.key;
		const attachmentVersion = json.version;

		// Add setting to both group members
		// Set as user 1
		let settingKey = `lastPageIndex_g${config.ownedPrivateGroupID}_${attachmentKey}`;
		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify({
				value: 123,
				version: 0
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);

		// Set as user 2
		API.useAPIKey(config.user2APIKey);
		response = await API.userPut(
			config.userID2,
			`settings/${settingKey}`,
			JSON.stringify({
				value: 234,
				version: 0
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);

		API.useAPIKey(config.apiKey);

		// Delete group item
		response = await API.groupDelete(
			config.ownedPrivateGroupID,
			`items/${attachmentKey}`,
			{ "If-Unmodified-Since-Version": attachmentVersion }
		);
		Helpers.assert204(response);

		// Setting should be gone for both group users
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assert404(response);

		response = await API.superGet(
			`users/${config.userID2}/settings/${settingKey}`
		);
		Helpers.assert404(response);
	});

	it('test_deleting_user_library_attachment_should_delete_lastPageIndex_setting', async function () {
		let json = await API.createAttachmentItem('imported_file', { contentType: 'application/pdf' }, null, this, 'jsonData');
		let attachmentKey = json.key;
		let attachmentVersion = json.version;

		let settingKey = `lastPageIndex_u_${attachmentKey}`;
		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify({
				value: 123,
				version: 0,
			}),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert204(response);

		response = await API.userDelete(
			config.userID,
			`items/${attachmentKey}`,
			{ 'If-Unmodified-Since-Version': attachmentVersion }
		);
		Helpers.assert204(response);

		response = await API.userGet(config.userID, `settings/${settingKey}`);
		Helpers.assert404(response);

		response = await API.userGet(config.userID, `deleted?since=${attachmentVersion}`);
		json = API.getJSONFromResponse(response);
		assert.notInclude(json.settings, settingKey);
	});

	it('test_should_reject_linked_file_attachment_in_group', async function () {
		let key = await API.groupCreateItem(
			config.ownedPrivateGroupID,
			"book",
			false,
			this,
			"key"
		);
		const path = "attachments:tést.txt";
		let response = await API.groupCreateAttachmentItem(
			config.ownedPrivateGroupID,
			"linked_file",
			{ path: path },
			key,
			this,
			"response"
		);
		Helpers.assert400ForObject(
			response,
			"Linked files can only be added to user libraries"
		);
	});

	it('test_deleting_linked_file_attachment_should_delete_child_annotation', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		let itemKey = json.key;

		let attachmentKey = await API.createAttachmentItem(
			"linked_file", { contentType: "application/pdf" }, itemKey, this, 'key'
		);
		json = await API.createAnnotationItem(
			'highlight', {}, attachmentKey, this, 'jsonData'
		);
		let annotationKey = json.key;
		let version = json.version;

		// Delete parent item
		let response = await API.userDelete(
			config.userID,
			`items?itemKey=${attachmentKey}`,
			{ "If-Unmodified-Since-Version": version }
		);
		Helpers.assert204(response);

		// Child items should be gone
		response = await API.userGet(
			config.userID,
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
	});

	it('test_should_move_attachment_with_annotation_under_regular_item', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		let itemKey = json.key;
	
		// Create standalone attachment to start
		json = await API.createAttachmentItem(
			"imported_file", { contentType: 'application/pdf' }, null, this, 'jsonData'
		);
		let attachmentKey = json.key;
	
		// Create image annotation
		let annotationKey = await API.createAnnotationItem('highlight', {}, attachmentKey, this, 'key');
	
		// /top for the annotation key should return the attachment
		let response = await API.userGet(
			config.userID,
			"items/top?itemKey=" + annotationKey
		);
		Helpers.assertNumResults(response, 1);
		json = await API.getJSONFromResponse(response);
		Helpers.assertEquals(attachmentKey, json[0].key);
	
		// Move attachment under regular item
		json[0].data.parentItem = itemKey;
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json[0].data])
		);
		Helpers.assert200ForObject(response);
	
		// /top for the annotation key should now return the regular item
		response = await API.userGet(
			config.userID,
			"items/top?itemKey=" + annotationKey
		);
		Helpers.assertNumResults(response, 1);
		json = await API.getJSONFromResponse(response);
		Helpers.assertEquals(itemKey, json[0].key);
	});

	it('testDateAddedNewItem8601', async function () {
		const objectType = 'item';

		const dateAdded = "2013-03-03T21:33:53Z";

		let itemData = {
			title: "Test",
			dateAdded: dateAdded
		};
		let data;
		if (objectType == 'item') {
			data = await API.createItem("videoRecording", itemData, this, 'jsonData');
		}
		Helpers.assertEquals(dateAdded, data.dateAdded);
	});

	it('test_should_reject_embedded_note_for_embedded_image_attachment', async function () {
		let noteKey = await API.createNoteItem("Test", null, this, 'key');
		let response = await API.get("items/new?itemType=attachment&linkMode=embedded_image");
		let json = JSON.parse(response.data);
		json.parentItem = noteKey;
		json.note = '<p>Foo</p>';
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, "'note' property is not valid for embedded images");
	});

	it('test_deleting_parent_item_should_delete_attachment_and_child_annotation', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		let itemKey = json.key;
    
		let attachmentKey = await API.createAttachmentItem(
			"imported_url",
			{ contentType: "application/pdf" },
			itemKey,
			this,
			'key'
		);
		json = await API.createAnnotationItem('highlight', {}, attachmentKey, this, 'jsonData');
		let annotationKey = json.key;
		let version = json.version;
    
		// Delete parent item
		let response = await API.userDelete(
			config.userID,
			"items?itemKey=" + itemKey,
			{ "If-Unmodified-Since-Version": version }
		);
		Helpers.assert204(response);
    
		// All items should be gone
		response = await API.userGet(
			config.userID,
			"items?itemKey=" + itemKey + "," + attachmentKey + "," + annotationKey
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 0);
	});

	it('test_should_preserve_createdByUserID_on_undelete', async function () {
		const json = await API.groupCreateItem(
			config.ownedPrivateGroupID, "book", false, this, 'json'
		);
		const jsonData = json.data;

		assert.equal(json.meta.createdByUser.username, config.username);

		const response = await API.groupDelete(
			config.ownedPrivateGroupID,
			`items/${json.key}`,
			{ "If-Unmodified-Since-Version": json.version }
		);
		Helpers.assert204(response);

		API.useAPIKey(config.user2APIKey);
		jsonData.version = 0;
		const postData = JSON.stringify([jsonData]);
		const headers = { "Content-Type": "application/json" };
		const postResponse = await API.groupPost(
			config.ownedPrivateGroupID,
			"items",
			postData,
			headers
		);
		const jsonResponse = await API.getJSONFromResponse(postResponse);

		assert.equal(
			jsonResponse.successful[0].meta.createdByUser.username,
			config.username
		);
	});

	it('testDateAccessedSQL', async function () {
		let date = '2014-02-01 01:23:45';
		let date8601 = '2014-02-01T01:23:45Z';
		let data = await API.createItem("book", {
			accessDate: date
		}, this, 'jsonData');
		Helpers.assertEquals(date8601, data.accessDate);
	});

	it('testPatchAttachment', async function () {
		let json = await API.createAttachmentItem("imported_file", [], false, this, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let filename = "test.pdf";
		let mtime = 1234567890000;
		let md5 = "390d914fdac33e307e5b0e1f3dba9da2";

		let response = await API.userPatch(
			config.userID,
			`items/${itemKey}`,
			JSON.stringify({
				filename: filename,
				mtime: mtime,
				md5: md5,
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": itemVersion
			}
		);
		Helpers.assert204(response);
		json = (await API.getItem(itemKey, this, 'json')).data;

		Helpers.assertEquals(filename, json.filename);
		Helpers.assertEquals(mtime, json.mtime);
		Helpers.assertEquals(md5, json.md5);
		let headerVersion = parseInt(response.headers["last-modified-version"][0]);
		assert.isAbove(headerVersion, itemVersion);
		Helpers.assertEquals(json.version, headerVersion);
	});

	it('test_should_move_attachment_with_annotation_out_from_under_regular_item', async function () {
		let json = await API.createItem("book", false, this, 'jsonData');
		let itemKey = json.key;

		// Create standalone attachment to start
		let attachmentJSON = await API.createAttachmentItem(
			"imported_file", { contentType: 'application/pdf' }, itemKey, this, 'jsonData'
		);
		let attachmentKey = attachmentJSON.key;

		// Create image annotation
		let annotationKey = await API.createAnnotationItem('highlight', {}, attachmentKey, this, 'key');

		// /top for the annotation key should return the item
		let response = await API.userGet(
			config.userID,
			"items/top?itemKey=" + annotationKey
		);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(itemKey, json[0].key);

		// Move attachment under regular item
		attachmentJSON.parentItem = false;
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([attachmentJSON])
		);
		Helpers.assert200ForObject(response);

		// /top for the annotation key should now return the attachment item
		response = await API.userGet(
			config.userID,
			"items/top?itemKey=" + annotationKey
		);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(attachmentKey, json[0].key);
	});

	it('test_should_allow_emoji_in_title', async function () {
		let title = "🐶";
  
		let key = await API.createItem("book", { title: title }, this, 'key');
  
		// Test entry (JSON)
		let response = await API.userGet(
			config.userID,
			"items/" + key
		);
		assert.include(response.data, "\"title\": \"" + title + "\"");
  
		// Test feed (JSON)
		response = await API.userGet(
			config.userID,
			"items"
		);
		assert.include(response.data, "\"title\": \"" + title + "\"");
  
		// Test entry (Atom)
		response = await API.userGet(
			config.userID,
			"items/" + key + "?content=json"
		);
		assert.include(response.data, "\"title\": \"" + title + "\"");
  
		// Test feed (Atom)
		response = await API.userGet(
			config.userID,
			"items?content=json"
		);
		assert.include(response.data, "\"title\": \"" + title + "\"");
	});

	it('test_should_return_409_on_missing_parent', async function () {
		const missingParentKey = "BDARG2AV";
		const json = await API.createNoteItem("<p>test</p>", missingParentKey, this);
		Helpers.assert409ForObject(json, "Parent item " + missingParentKey + " not found");
		Helpers.assertEquals(missingParentKey, json.failed[0].data.parentItem);
	});

	it('test_num_children_and_children_on_attachment_with_annotation', async function () {
		let key = await API.createItem("book", false, this, 'key');
		let attachmentKey = await API.createAttachmentItem("imported_url", { contentType: 'application/pdf', title: 'bbb' }, key, this, 'key');
		await API.createAnnotationItem("image", { annotationComment: 'ccc' }, attachmentKey, this, 'key');
		let response = await API.userGet(config.userID, `items/${attachmentKey}`);
		let json = await API.getJSONFromResponse(response);
		Helpers.assertEquals(1, json.meta.numChildren);
		response = await API.userGet(config.userID, `items/${attachmentKey}/children`);
		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(1, json);
		Helpers.assertEquals('ccc', json[0].data.annotationComment);
	});

	it('test_should_treat_null_value_as_empty_string', async function () {
		let json = {
			itemType: 'book',
			numPages: null
		};
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		let key = json.successful[0].key;
		json = await API.getItem(key, this, 'json');
	
		json = {
			version: json.version,
			itemType: 'journalArticle'
		};
		await API.userPatch(
			config.userID,
			"items/" + key,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
	
		json = await API.getItem(key, this, 'json');
		assert.notProperty(json, 'numPages');
	});

	it('testLibraryGroup', async function () {
		let json = await API.groupCreateItem(
			config.ownedPrivateGroupID,
			'book',
			[],
			this,
			'json'
		);
		assert.equal('group', json.library.type);
		assert.equal(
			config.ownedPrivateGroupID,
			json.library.id
		);
		assert.equal(
			config.ownedPrivateGroupName,
			json.library.name
		);
		Helpers.assertRegExp(
			/^https?:\/\/[^/]+\/groups\/[0-9]+$/,
			json.library.links.alternate.href
		);
		assert.equal('text/html', json.library.links.alternate.type);
	});

	it('testPatchTopLevelAttachment', async function () {
		let json = await API.createAttachmentItem("imported_url", {
			title: 'A',
			contentType: 'application/pdf',
			filename: 'test.pdf'
		}, false, this, 'jsonData');
  
		// With 'attachment' and 'linkMode'
		json = {
			itemType: 'attachment',
			linkMode: 'imported_url',
			key: json.key,
			version: json.version,
			title: 'B'
		};
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = (await API.getItem(json.key, this, 'json')).data;
		Helpers.assertEquals("B", json.title);
  
		// Without 'linkMode'
		json = {
			itemType: 'attachment',
			key: json.key,
			version: json.version,
			title: 'C'
		};
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = (await API.getItem(json.key, this, 'json')).data;
		Helpers.assertEquals("C", json.title);
  
		// Without 'itemType' or 'linkMode'
		json = {
			key: json.key,
			version: json.version,
			title: 'D'
		};
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = (await API.getItem(json.key, this, 'json')).data;
		Helpers.assertEquals("D", json.title);
	});

	it('testTopWithSince', async function () {
		await API.userClear(config.userID);
   
		let version1 = await API.getLibraryVersion();
		let parentKeys = [];
		parentKeys[0] = await API.createItem('book', [], this, 'key');
		let childKeys = [];
		childKeys[0] = await API.createAttachmentItem('linked_url', [], parentKeys[0], this, 'key');
		parentKeys[1] = await API.createItem('journalArticle', [], this, 'key');
		let version4 = await API.getLibraryVersion();
		childKeys[1] = await API.createNoteItem('', parentKeys[1], this, 'key');
		parentKeys[2] = await API.createItem('book', [], this, 'key');

		let response = await API.userGet(
			config.userID,
			'items/top?since=' + version1
		);
		Helpers.assertNumResults(response, 3);

		response = await API.userGet(
			config.userID,
			'items?since=' + version1
		);
		Helpers.assertNumResults(response, 5);

		response = await API.userGet(
			config.userID,
			'items/top?format=versions&since=' + version4
		);
		Helpers.assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		let keys = Object.keys(json);
		Helpers.assertEquals(parentKeys[2], keys[0]);
	});

	it('testDateAccessed8601', async function () {
		let date = '2014-02-01T01:23:45Z';
		let data = await API.createItem("book", {
			accessDate: date
		}, this, 'jsonData');
		assert.equal(date, data.accessDate);
	});

	it('testLibraryUser', async function () {
		let json = await API.createItem('book', false, this, 'json');
		Helpers.assertEquals('user', json.library.type);
		Helpers.assertEquals(config.userID, json.library.id);
		Helpers.assertEquals(config.displayName, json.library.name);
		Helpers.assertRegExp('^https?://[^/]+/' + config.username, json.library.links.alternate.href);
		Helpers.assertEquals('text/html', json.library.links.alternate.type);
	});

	it('test_should_return_409_on_missing_collection', async function () {
		let missingCollectionKey = "BDARG2AV";
		let requestPayload = { collections: [missingCollectionKey] };
		let json = await API.createItem("book", requestPayload, this);
		Helpers.assert409ForObject(json, `Collection ${missingCollectionKey} not found`);
		Helpers.assertEquals(missingCollectionKey, json.failed[0].data.collection);
	});

	it('testIncludeTrashed', async function () {
		await API.userClear(config.userID);

		let key1 = await API.createItem("book", false, this, 'key');
		let key2 = await API.createItem("book", {
			deleted: 1
		}, this, 'key');
		let key3 = await API.createNoteItem("", key1, this, 'key');

		// All three items should show up with includeTrashed=1
		let response = await API.userGet(
			config.userID,
			"items?includeTrashed=1"
		);
		let json = await API.getJSONFromResponse(response);
		Helpers.assertCount(3, json);
		let keys = [json[0].key, json[1].key, json[2].key];
		assert.include(keys, key1);
		assert.include(keys, key2);
		assert.include(keys, key3);

		// ?itemKey should show the deleted item
		response = await API.userGet(
			config.userID,
			"items?itemKey=" + key2 + "," + key3 + "&includeTrashed=1"
		);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(2, json);
		keys = [json[0].key, json[1].key];
		assert.include(keys, key2);
		assert.include(keys, key3);

		// /top should show the deleted item
		response = await API.userGet(
			config.userID,
			"items/top?includeTrashed=1"
		);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(2, json);
		keys = [json[0].key, json[1].key];
		assert.include(keys, key1);
		assert.include(keys, key2);
	});

	it('test_should_return_409_on_missing_parent_if_parent_failed', async function () {
		const collectionKey = await API.createCollection("A", {}, this, 'key');
		const version = await API.getLibraryVersion();
		const parentKey = "BDARG2AV";
		const tag = Helpers.uniqueID(300);
		const item1JSON = await API.getItemTemplate("book");
		item1JSON.key = parentKey;
		item1JSON.creators = [
			{
				firstName: "A.",
				lastName: "Nespola",
				creatorType: "author"
			}
		];
		item1JSON.tags = [
			{
				tag: "A"
			},
			{
				tag: tag
			}
		];
		item1JSON.collections = [collectionKey];
		const item2JSON = await API.getItemTemplate("note");
		item2JSON.parentItem = parentKey;
		const response1 = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		const item3JSON = JSON.parse(response1.data);
		item3JSON.parentItem = parentKey;
		item3JSON.note = "Test";
		const response2 = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([item1JSON, item2JSON, item3JSON]),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": version
			}
		);
		Helpers.assert200(response2);
		const json = await API.getJSONFromResponse(response2);
		Helpers.assert413ForObject(json);
		Helpers.assert409ForObject(json, { message: "Parent item " + parentKey + " not found", index: 1 });
		Helpers.assertEquals(parentKey, json.failed[1].data.parentItem);
		Helpers.assert409ForObject(json, { message: "Parent item " + parentKey + " not found", index: 2 });
		Helpers.assertEquals(parentKey, json.failed[2].data.parentItem);
	});

	it('test_deleting_parent_item_should_delete_child_linked_file_attachment', async function () {
		let json = await API.createItem('book', false, this, 'jsonData');
		let parentKey = json.key;
		let parentVersion = json.version;

		json = await API.createAttachmentItem('linked_file', [], parentKey, this, 'jsonData');
		let childKey = json.key;

		let response = await API.userGet(config.userID, `items?itemKey=${parentKey},${childKey}`);
		Helpers.assertNumResults(response, 2);

		response = await API.userDelete(
			config.userID,
			`items/${parentKey}`,
			{ 'If-Unmodified-Since-Version': parentVersion }
		);
		Helpers.assert204(response);

		response = await API.userGet(config.userID, `items?itemKey=${parentKey},${childKey}`);
		json = API.getJSONFromResponse(response);
		Helpers.assertNumResults(response, 0);
	});

	it('test_patch_of_item_should_clear_trash_state', async function () {
		let json = await API.createItem("book", {
			deleted: true
		}, this, 'json');

		let data = [
			{
				key: json.key,
				version: json.version,
				deleted: false
			}
		];
		let response = await API.postItems(data);
		json = await API.getJSONFromResponse(response);

		assert.notProperty(json.successful[0].data, 'deleted');
	});


	/**
	 * Changing existing 'md5' and 'mtime' values to null was originally prevented, but some client
	 * versions were sending null, so now we just ignore it.
	 *
	 * At some point, we should check whether any clients are still doing this and restore the
	 * restriction if not. These should only be cleared on a storage purge.
	 */
	it('test_cannot_change_existing_storage_properties_to_null', async function () {
		this.skip();
	});

	it('testDateAddedNewItemSQL', async function () {
		const objectType = 'item';

		const dateAdded = "2013-03-03 21:33:53";
		const dateAdded8601 = "2013-03-03T21:33:53Z";

		let itemData = {
			title: "Test",
			dateAdded: dateAdded
		};
		let data;
		if (objectType == 'item') {
			data = await API.createItem("videoRecording", itemData, this, 'jsonData');
		}

		Helpers.assertEquals(dateAdded8601, data.dateAdded);
	});

	it('testDateWithoutDay', async function () {
		let date = 'Sept 2012';
		let parsedDate = '2012-09';

		let json = await API.createItem("book", {
			date: date
		}, this, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.userID,
			"items/" + key
		);
		json = await API.getJSONFromResponse(response);
		Helpers.assertEquals(date, json.data.date);

		// meta.parsedDate (JSON)
		Helpers.assertEquals(parsedDate, json.meta.parsedDate);

		// zapi:parsedDate (Atom)
		let xml = await API.getItem(key, this, 'atom');
		Helpers.assertEquals(parsedDate, Helpers.xpathEval(xml, '/atom:entry/zapi:parsedDate'));
	});

	it('testDateWithoutMonth', async function () {
		let date = '2012';
		let parsedDate = '2012';

		let json = await API.createItem("book", {
			date: date
		}, this, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.userID,
			`items/${key}`
		);
		json = API.getJSONFromResponse(response);
		assert.equal(date, json.data.date);

		// meta.parsedDate (JSON)
		assert.equal(parsedDate, json.meta.parsedDate);

		// zapi:parsedDate (Atom)
		let xml = await API.getItem(key, this, 'atom');
		assert.equal(parsedDate, Helpers.xpathEval(xml, '/atom:entry/zapi:parsedDate'));
	});

	it('test_should_allow_changing_parent_item_of_annotation_to_another_file_attachment', async function () {
		let attachment1Key = await API.createAttachmentItem("imported_url", { contentType: "application/pdf" }, null, this, 'key');
		let attachment2Key = await API.createAttachmentItem("imported_url", { contentType: "application/pdf" }, null, this, 'key');
		let jsonData = await API.createAnnotationItem('highlight', {}, attachment1Key, this, 'jsonData');

		let json = {
			version: jsonData.version,
			parentItem: attachment2Key
		};
		let response = await API.userPatch(
			config.userID,
			`items/${jsonData.key}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
	});

	it('test_should_reject_changing_parent_item_of_annotation_to_invalid_items', async function () {
		const itemKey = await API.createItem("book", false, this, 'key');
		const linkedURLAttachmentKey = await API.createAttachmentItem("linked_url", [], itemKey, this, 'key');

		const attachmentKey = await API.createAttachmentItem(
			"imported_url",
			{ contentType: 'application/pdf' },
			null,
			this,
			'key'
		);
		const jsonData = await API.createAnnotationItem('highlight', {}, attachmentKey, this, 'jsonData');

		// No parent
		let json = {
			version: jsonData.version,
			parentItem: false
		};
		let response = await API.userPatch(
			config.userID,
			"items/" + jsonData.key,
			JSON.stringify(json)
		);
		assert.equal(response.status, 400, "Annotation must have a parent item");

		// Regular item
		json = {
			version: jsonData.version,
			parentItem: itemKey
		};
		response = await API.userPatch(
			config.userID,
			"items/" + jsonData.key,
			JSON.stringify(json)
		);
		assert.equal(response.status, 400, "Parent item of annotation must be a PDF attachment");

		// Linked-URL attachment
		json = {
			version: jsonData.version,
			parentItem: linkedURLAttachmentKey
		};
		response = await API.userPatch(
			config.userID,
			"items/" + jsonData.key,
			JSON.stringify(json)
		);
		assert.equal(response.status, 400, "Parent item of annotation must be a PDF attachment");
	});

	it('testConvertChildNoteToParentViaPatch', async function () {
		let key = await API.createItem("book", { title: "Test" }, this, 'key');
		let json = await API.createNoteItem("", key, this, 'jsonData');
		json.parentItem = false;
		let response = await API.userPatch(
			config.userID,
			`items/${json.key}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		json = (await API.getItem(json.key, this, 'json')).data;
		assert.notProperty(json, 'parentItem');
	});

	it('test_should_reject_clearing_parent_of_embedded_image_attachment', async function () {
		let noteKey = await API.createNoteItem("Test", null, this, 'key');
		let response = await API.get("items/new?itemType=attachment&linkMode=embedded_image");
		let json = JSON.parse(await response.data);
		json.parentItem = noteKey;
		json.contentType = 'image/png';
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		let key = json.successful[0].key;
		json = await API.getItem(key, this, 'json');

		// Clear the parent item
		json = {
			version: json.version,
			parentItem: false
		};
		response = await API.userPatch(
			config.userID,
			`items/${key}`,
			JSON.stringify(json)
		);
		Helpers.assert400(response, "Cannot change parent item of embedded-image attachment");
	});

	it('test_should_reject_parentItem_that_matches_item_key', async function () {
		let response = await API.get("items/new?itemType=attachment&linkMode=imported_file");
		let json = API.getJSONFromResponse(response);
		json.key = Helpers.uniqueID();
		json.version = 0;
		json.parentItem = json.key;

		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		let msg = "Item " + json.key + " cannot be a child of itself";
		// TEMP
		msg += "\n\nCheck your database integrity from the Advanced → Files and Folders pane of the Zotero preferences.";
		Helpers.assert400ForObject(response, { message: msg });
	});

	it('test_num_children_and_children_on_note_with_embedded_image_attachment', async function () {
		let noteKey = await API.createNoteItem("Test", null, this, 'key');
		let imageKey = await API.createAttachmentItem('embedded_image', { contentType: 'image/png' }, noteKey, this, 'key');
		let response = await API.userGet(config.userID, `items/${noteKey}`);
		let json = await API.getJSONFromResponse(response);
		Helpers.assertEquals(1, json.meta.numChildren);
  
		response = await API.userGet(config.userID, `items/${noteKey}/children`);
		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);
		Helpers.assertCount(1, json);
		Helpers.assertEquals(imageKey, json[0].key);
	});
});
