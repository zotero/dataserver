const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After } = require("../shared.js");

describe('ObjectTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Before();
	});

	after(async function () {
		await API2After();
	});

	beforeEach(async function() {
		await API.userClear(config.userID);
	});

	const _testMultiObjectGet = async (objectType = 'collection') => {
		const objectNamePlural = API.getPluralObjectType(objectType);
		const keyProp = `${objectType}Key`;

		const keys = [];
		switch (objectType) {
			case 'collection':
				keys.push(await API.createCollection("Name", false, true, 'key'));
				keys.push(await API.createCollection("Name", false, true, 'key'));
				await API.createCollection("Name", false, true, 'key');
				break;

			case 'item':
				keys.push(await API.createItem("book", { title: "Title" }, true, 'key'));
				keys.push(await API.createItem("book", { title: "Title" }, true, 'key'));
				await API.createItem("book", { title: "Title" }, true, 'key');
				break;

			case 'search':
				keys.push(await API.createSearch("Name", 'default', true, 'key'));
				keys.push(await API.createSearch("Name", 'default', true, 'key'));
				await API.createSearch("Name", 'default', true, 'key');
				break;
		}

		let response = await API.userGet(
			config.userID,
			`${objectNamePlural}?key=${config.apiKey}&${keyProp}=${keys.join(',')}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, keys.length);

		// Trailing comma in itemKey parameter
		response = await API.userGet(
			config.userID,
			`${objectNamePlural}?key=${config.apiKey}&${keyProp}=${keys.join(',')},`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, keys.length);
	};

	const _testSingleObjectDelete = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let xml;
		switch (objectType) {
			case 'collection':
				xml = await API.createCollection('Name', false, true);
				break;
			case 'item':
				xml = await API.createItem('book', { title: 'Title' }, true);
				break;
			case 'search':
				xml = await API.createSearch('Name', 'default', true);
				break;
		}

		const data = API.parseDataFromAtomEntry(xml);
		const objectKey = data.key;
		const objectVersion = data.version;

		const responseDelete = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			{ 'If-Unmodified-Since-Version': objectVersion }
		);
		Helpers.assertStatusCode(responseDelete, 204);

		const responseGet = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`
		);
		Helpers.assertStatusCode(responseGet, 404);
	};

	const _testMultiObjectDelete = async (objectType) => {
		const objectTypePlural = await API.getPluralObjectType(objectType);
		const keyProp = `${objectType}Key`;
	
		const deleteKeys = [];
		const keepKeys = [];
		switch (objectType) {
			case 'collection':
				deleteKeys.push(await API.createCollection("Name", false, true, 'key'));
				deleteKeys.push(await API.createCollection("Name", false, true, 'key'));
				keepKeys.push(await API.createCollection("Name", false, true, 'key'));
				break;
	
			case 'item':
				deleteKeys.push(await API.createItem("book", { title: "Title" }, true, 'key'));
				deleteKeys.push(await API.createItem("book", { title: "Title" }, true, 'key'));
				keepKeys.push(await API.createItem("book", { title: "Title" }, true, 'key'));
				break;
	
			case 'search':
				deleteKeys.push(await API.createSearch("Name", 'default', true, 'key'));
				deleteKeys.push(await API.createSearch("Name", 'default', true, 'key'));
				keepKeys.push(await API.createSearch("Name", 'default', true, 'key'));
				break;
		}
	
		let response = await API.userGet(config.userID, `${objectTypePlural}?key=${config.apiKey}`);
		Helpers.assertNumResults(response, deleteKeys.length + keepKeys.length);

		let libraryVersion = response.headers["last-modified-version"];
	
		response = await API.userDelete(config.userID,
			`${objectTypePlural}?key=${config.apiKey}&${keyProp}=${deleteKeys.join(',')}`,
			{ "If-Unmodified-Since-Version": libraryVersion }
		);
		Helpers.assertStatusCode(response, 204);
		libraryVersion = response.headers["last-modified-version"];
		response = await API.userGet(config.userID, `${objectTypePlural}?key=${config.apiKey}`);
		Helpers.assertNumResults(response, keepKeys.length);
	
		response = await API.userGet(config.userID, `${objectTypePlural}?key=${config.apiKey}&${keyProp}=${keepKeys.join(',')}`);
		Helpers.assertNumResults(response, keepKeys.length);
	
		// Add trailing comma to itemKey param, to test key parsing
		response = await API.userDelete(config.userID,
			`${objectTypePlural}?key=${config.apiKey}&${keyProp}=${keepKeys.join(',')},`,
			{ "If-Unmodified-Since-Version": libraryVersion });
		Helpers.assertStatusCode(response, 204);
	
		response = await API.userGet(config.userID, `${objectTypePlural}?key=${config.apiKey}`);
		Helpers.assertNumResults(response, 0);
	};

	const _testPartialWriteFailure = async (objectType) => {
		await API.userClear(config.userID);
		let json;
		let conditions = [];
		let json1 = { name: "Test" };
		let json2 = { name: "1234567890".repeat(6554) };
		let json3 = { name: "Test" };
		switch (objectType) {
			case 'collection':
				json1 = { name: "Test" };
				json2 = { name: "1234567890".repeat(6554) };
				json3 = { name: "Test" };
				break;
			case 'item':
				json1 = await API.getItemTemplate('book');
				json2 = { ...json1 };
				json3 = { ...json1 };
				json2.title = "1234567890".repeat(6554);
				break;
			case 'search':
				conditions = [
					{
						condition: 'title',
						operator: 'contains',
						value: 'value'
					}
				];
				json1 = { name: "Test", conditions: conditions };
				json2 = { name: "1234567890".repeat(6554), conditions: conditions };
				json3 = { name: "Test", conditions: conditions };
				break;
		}

		const response = await API.userPost(
			config.userID,
			`${API.getPluralObjectType(objectType)}?key=${config.apiKey}`,
			JSON.stringify({
				objectTypePlural: [json1, json2, json3]
			}),
			{ "Content-Type": "application/json" });

		Helpers.assertStatusCode(response, 200);
		json = API.getJSONFromResponse(response);

		Helpers.assertStatusForObject(response, 'success', 0, 200);
		Helpers.assertStatusForObject(response, 'success', 1, 413);
		Helpers.assertStatusForObject(response, 'success', 2, 200);

		const responseKeys = await API.userGet(
			config.userID,
			`${API.getPluralObjectType(objectType)}?format=keys&key=${config.apiKey}`
		);

		Helpers.assertStatusCode(responseKeys, 200);
		const keys = responseKeys.data.trim().split("\n");

		assert.lengthOf(keys, 2);
		json.success.forEach((key) => {
			assert.include(keys, key);
		});
	};

	const _testPartialWriteFailureWithUnchanged = async (objectType) => {
		await API.userClear(config.userID);
	
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json1, json2, json3, objectData, objectDataContent;
		let conditions = [];

		switch (objectType) {
			case 'collection':
				objectData = await API.createCollection('Test', false, true, 'data');
				objectDataContent = objectData.content;
				json1 = JSON.parse(objectDataContent);
				json2 = { name: "1234567890".repeat(6554) };
				json3 = { name: 'Test' };
				break;
	
			case 'item':
				objectData = await API.createItem('book', { title: 'Title' }, true, 'data');
				objectDataContent = objectData.content;
				json1 = JSON.parse(objectDataContent);
				json2 = await API.getItemTemplate('book');
				json3 = { ...json2 };
				json2.title = "1234567890".repeat(6554);
				break;
	
			case 'search':
				conditions = [
					{
						condition: 'title',
						operator: 'contains',
						value: 'value'
					}
				];
				objectData = await API.createSearch('Name', conditions, true, 'data');
				objectDataContent = objectData.content;
				json1 = JSON.parse(objectDataContent);
				json2 = {
					name: "1234567890".repeat(6554),
					conditions
				};
				json3 = {
					name: 'Test',
					conditions
				};
				break;
		}
	
		let response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({ [objectTypePlural]: [json1, json2, json3] }),
			{ 'Content-Type': 'application/json' }
		);
	
		Helpers.assertStatusCode(response, 200);
		let json = API.getJSONFromResponse(response);
		
		Helpers.assertStatusForObject(response, 'unchanged', 0);
		Helpers.assertStatusForObject(response, 'failed', 1);
		Helpers.assertStatusForObject(response, 'success', 2);

	
		response = await API.userGet(config.userID,
			`${objectTypePlural}?format=keys&key=${config.apiKey}`);
		Helpers.assertStatusCode(response, 200);
		let keys = response.data.trim().split('\n');
		assert.lengthOf(keys, 2);

		for (const [_, value] of Object.entries(json.success)) {
			assert.include(keys, value);
		}
	};
	
	const _testMultiObjectWriteInvalidObject = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		
		let response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify([{}]),
			{ "Content-Type": "application/json" }
		);
		
		Helpers.assertStatusCode(response, 400);
		assert.equal(response.data, "Uploaded data must be a JSON object");
		
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({
				[objectTypePlural]: {
					foo: "bar"
				}
			}),
			{ "Content-Type": "application/json" }
		);
		
		Helpers.assertStatusCode(response, 400);
		assert.equal(response.data, `'${objectTypePlural}' must be an array`);
	};

	it('testMultiObjectGet', async function () {
		await _testMultiObjectGet('collection');
		await _testMultiObjectGet('item');
		await _testMultiObjectGet('search');
	});
	it('testSingleObjectDelete', async function () {
		await _testSingleObjectDelete('collection');
		await _testSingleObjectDelete('item');
		await _testSingleObjectDelete('search');
	});
	it('testMultiObjectDelete', async function () {
		await _testMultiObjectDelete('collection');
		await _testMultiObjectDelete('item');
		await _testMultiObjectDelete('search');
	});
	it('testPartialWriteFailure', async function () {
		_testPartialWriteFailure('collection');
		_testPartialWriteFailure('item');
		_testPartialWriteFailure('search');
	});
	it('testPartialWriteFailureWithUnchanged', async function () {
		await _testPartialWriteFailureWithUnchanged('collection');
		await _testPartialWriteFailureWithUnchanged('item');
		await _testPartialWriteFailureWithUnchanged('search');
	});

	it('testMultiObjectWriteInvalidObject', async function () {
		await _testMultiObjectWriteInvalidObject('collection');
		await _testMultiObjectWriteInvalidObject('item');
		await _testMultiObjectWriteInvalidObject('search');
	});

	it('testDeleted', async function () {
		await API.userClear(config.userID);
	
		// Create objects
		const objectKeys = {};
		objectKeys.tag = ["foo", "bar"];
	
		objectKeys.collection = [];
		objectKeys.collection.push(await API.createCollection("Name", false, true, 'key'));
		objectKeys.collection.push(await API.createCollection("Name", false, true, 'key'));
		objectKeys.collection.push(await API.createCollection("Name", false, true, 'key'));
	
		objectKeys.item = [];
		objectKeys.item.push(await API.createItem("book", { title: "Title", tags: objectKeys.tag.map(tag => ({ tag })) }, true, 'key'));
		objectKeys.item.push(await API.createItem("book", { title: "Title" }, true, 'key'));
		objectKeys.item.push(await API.createItem("book", { title: "Title" }, true, 'key'));
	
		objectKeys.search = [];
		objectKeys.search.push(await API.createSearch("Name", 'default', true, 'key'));
		objectKeys.search.push(await API.createSearch("Name", 'default', true, 'key'));
		objectKeys.search.push(await API.createSearch("Name", 'default', true, 'key'));
	
		// Get library version
		let response = await API.userGet(config.userID, "items?key=" + config.apiKey + "&format=keys&limit=1");
		let libraryVersion1 = response.headers["last-modified-version"][0];
	
		const testDelete = async (objectType, libraryVersion, url) => {
			const objectTypePlural = await API.getPluralObjectType(objectType);
			const response = await API.userDelete(config.userID,
				`${objectTypePlural}?key=${config.apiKey}${url}`,
				{ "If-Unmodified-Since-Version": libraryVersion });
			Helpers.assertStatusCode(response, 204);
			return response.headers["last-modified-version"][0];
		};
	
		// Delete first object
		let tempLibraryVersion = await testDelete('collection', libraryVersion1, "&collectionKey=" + objectKeys.collection[0]);
		tempLibraryVersion = await testDelete('item', tempLibraryVersion, "&itemKey=" + objectKeys.item[0]);
		tempLibraryVersion = await testDelete('search', tempLibraryVersion, "&searchKey=" + objectKeys.search[0]);
		let libraryVersion2 = tempLibraryVersion;
	
		// Delete second and third objects
		tempLibraryVersion = await testDelete('collection', tempLibraryVersion, "&collectionKey=" + objectKeys.collection.slice(1).join(','));
		tempLibraryVersion = await testDelete('item', tempLibraryVersion, "&itemKey=" + objectKeys.item.slice(1).join(','));
		let libraryVersion3 = await testDelete('search', tempLibraryVersion, "&searchKey=" + objectKeys.search.slice(1).join(','));
	
		// Request all deleted objects
		response = await API.userGet(config.userID, "deleted?key=" + config.apiKey + "&newer=" + libraryVersion1);
		Helpers.assertStatusCode(response, 200);
		let json = JSON.parse(response.data);
		let version = response.headers["last-modified-version"][0];
		assert.isNotNull(version);
		assert.equal(response.headers["content-type"][0], "application/json");
	
		// Verify keys
		const verifyKeys = async (json, objectType, objectKeys) => {
			const objectTypePlural = await API.getPluralObjectType(objectType);
			assert.containsAllKeys(json, [objectTypePlural]);
			assert.lengthOf(json[objectTypePlural], objectKeys.length);
			for (let key of objectKeys) {
				assert.include(json[objectTypePlural], key);
			}
		};
		await verifyKeys(json, 'collection', objectKeys.collection);
		await verifyKeys(json, 'item', objectKeys.item);
		await verifyKeys(json, 'search', objectKeys.search);
		// Tags aren't deleted by removing from items
		await verifyKeys(json, 'tag', []);
	
		// Request second and third deleted objects
		response = await API.userGet(
			config.userID,
			`deleted?key=${config.apiKey}&newer=${libraryVersion2}`
		);
		Helpers.assertStatusCode(response, 200);
		json = JSON.parse(response.data);
		version = response.headers["last-modified-version"][0];
		assert.isNotNull(version);
		assert.equal(response.headers["content-type"][0], "application/json");
	
		await verifyKeys(json, 'collection', objectKeys.collection.slice(1));
		await verifyKeys(json, 'item', objectKeys.item.slice(1));
		await verifyKeys(json, 'search', objectKeys.search.slice(1));
		// Tags aren't deleted by removing from items
		await verifyKeys(json, 'tag', []);
	
		// Explicit tag deletion
		response = await API.userDelete(
			config.userID,
			`tags?key=${config.apiKey}&tag=${objectKeys.tag.join('%20||%20')}`,
			{ "If-Unmodified-Since-Version": libraryVersion3 }
		);
		Helpers.assertStatusCode(response, 204);
	
		// Verify deleted tags
		response = await API.userGet(
			config.userID,
			`deleted?key=${config.apiKey}&newer=${libraryVersion3}`
		);
		Helpers.assertStatusCode(response, 200);
		json = JSON.parse(response.data);
		await verifyKeys(json, 'tag', objectKeys.tag);
	});
});
