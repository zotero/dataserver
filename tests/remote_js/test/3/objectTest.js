const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('ObjectTests', function () {
	this.timeout(0);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	beforeEach(async function() {
		await API.userClear(config.userID);
	});

	afterEach(async function() {
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

		let response = await API.userHead(
			config.userID,
			`${objectNamePlural}?key=${config.apiKey}&${keyProp}=${keys.join(',')}`
		);
		Helpers.assert200(response);
		Helpers.assertTotalResults(response, keys.length);
			

		response = await API.userGet(
			config.userID,
			`${objectNamePlural}?${keyProp}=${keys.join(',')}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, keys.length);

		// Trailing comma in itemKey parameter
		response = await API.userGet(
			config.userID,
			`${objectNamePlural}?${keyProp}=${keys.join(',')},`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, keys.length);
	};

	const _testSingleObjectDelete = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let json;
		switch (objectType) {
			case 'collection':
				json = await API.createCollection('Name', false, true, 'json');
				break;
			case 'item':
				json = await API.createItem('book', { title: 'Title' }, true, 'json');
				break;
			case 'search':
				json = await API.createSearch('Name', 'default', true, 'json');
				break;
		}

		const objectKey = json.key;
		const objectVersion = json.version;

		const responseDelete = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			{ 'If-Unmodified-Since-Version': objectVersion }
		);
		Helpers.assertStatusCode(responseDelete, 204);

		const responseGet = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}`
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

		let response = await API.userGet(config.userID, `${objectTypePlural}`);
		Helpers.assertNumResults(response, deleteKeys.length + keepKeys.length);

		let libraryVersion = response.headers["last-modified-version"];

		response = await API.userDelete(config.userID,
			`${objectTypePlural}?${keyProp}=${deleteKeys.join(',')}`,
			{ "If-Unmodified-Since-Version": libraryVersion }
		);
		Helpers.assertStatusCode(response, 204);
		libraryVersion = response.headers["last-modified-version"];
		response = await API.userGet(config.userID, `${objectTypePlural}`);
		Helpers.assertNumResults(response, keepKeys.length);

		response = await API.userGet(config.userID, `${objectTypePlural}?${keyProp}=${keepKeys.join(',')}`);
		Helpers.assertNumResults(response, keepKeys.length);

		response = await API.userDelete(config.userID,
			`${objectTypePlural}?${keyProp}=${keepKeys.join(',')},`,
			{ "If-Unmodified-Since-Version": libraryVersion });
		Helpers.assertStatusCode(response, 204);

		response = await API.userGet(config.userID, `${objectTypePlural}?`);
		Helpers.assertNumResults(response, 0);
	};

	const _testPartialWriteFailure = async () => {
		let conditions = [];
		const objectType = 'collection';
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
			`${API.getPluralObjectType(objectType)}?`,
			JSON.stringify([json1, json2, json3]),
			{ "Content-Type": "application/json" });

		Helpers.assertStatusCode(response, 200);
		let successKeys = await API.getSuccessKeysFrom(response);

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
		successKeys.forEach((key) => {
			assert.include(keys, key);
		});
	};

	const _testPartialWriteFailureWithUnchanged = async (objectType) => {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let json1;
		let json2;
		let json3;
		let conditions = [];

		switch (objectType) {
			case 'collection':
				json1 = await API.createCollection('Test', false, true, 'jsonData');
				json2 = { name: "1234567890".repeat(6554) };
				json3 = { name: 'Test' };
				break;

			case 'item':
				json1 = await API.createItem('book', { title: 'Title' }, true, 'jsonData');
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
				json1 = await API.createSearch('Name', conditions, true, 'jsonData');
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
			`${objectTypePlural}`,
			JSON.stringify([json1, json2, json3]),
			{ 'Content-Type': 'application/json' }
		);

		Helpers.assertStatusCode(response, 200);
		let successKeys = API.getSuccessfulKeysFromResponse(response);

		Helpers.assertStatusForObject(response, 'unchanged', 0);
		Helpers.assertStatusForObject(response, 'failed', 1);
		Helpers.assertStatusForObject(response, 'success', 2);


		response = await API.userGet(config.userID,
			`${objectTypePlural}?format=keys&key=${config.apiKey}`);
		Helpers.assertStatusCode(response, 200);
		let keys = response.data.trim().split('\n');
		
		assert.lengthOf(keys, 2);

		for (let key of successKeys) {
			assert.include(keys, key);
		}
	};

	const _testMultiObjectWriteInvalidObject = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify({ foo: "bar" }),
			{ "Content-Type": "application/json" }
		);

		Helpers.assertStatusCode(response, 400, "Uploaded data must be a JSON array");

		response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([[], ""]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, { message: `Invalid value for index 0 in uploaded data; expected JSON ${objectType} object`, index: 0 });
		Helpers.assert400ForObject(response, { message: `Invalid value for index 1 in uploaded data; expected JSON ${objectType} object`, index: 1 });
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

		const func = async (objectType, libraryVersion, url) => {
			const objectTypePlural = await API.getPluralObjectType(objectType);
			const response = await API.userDelete(config.userID,
				`${objectTypePlural}?key=${config.apiKey}${url}`,
				{ "If-Unmodified-Since-Version": libraryVersion });
			Helpers.assertStatusCode(response, 204);
			return response.headers["last-modified-version"][0];
		};

		let tempLibraryVersion = await func('collection', libraryVersion1, "&collectionKey=" + objectKeys.collection[0]);
		tempLibraryVersion = await func('item', tempLibraryVersion, "&itemKey=" + objectKeys.item[0]);
		tempLibraryVersion = await func('search', tempLibraryVersion, "&searchKey=" + objectKeys.search[0]);
		let libraryVersion2 = tempLibraryVersion;

		// /deleted without 'since' should be an error
		response = await API.userGet(
			config.userID,
			"deleted?key=" + config.apiKey
		);
		Helpers.assert400(response);

		// Delete second and third objects
		tempLibraryVersion = await func('collection', tempLibraryVersion, "&collectionKey=" + objectKeys.collection.slice(1).join(','));
		tempLibraryVersion = await func('item', tempLibraryVersion, "&itemKey=" + objectKeys.item.slice(1).join(','));
		let libraryVersion3 = await func('search', tempLibraryVersion, "&searchKey=" + objectKeys.search.slice(1).join(','));

		// Request all deleted objects
		response = await API.userGet(config.userID, "deleted?key=" + config.apiKey + "&since=" + libraryVersion1);
		Helpers.assertStatusCode(response, 200);
		let json = JSON.parse(response.data);
		let version = response.headers["last-modified-version"][0];
		assert.isNotNull(version);
		assert.equal(response.headers["content-type"][0], "application/json");

		const assertEquivalent = (response, equivalentTo) => {
			Helpers.assert200(response);
			assert.equal(response.data, equivalentTo.data);
			assert.deepEqual(response.headers['last-modified-version'], equivalentTo.headers['last-modified-version']);
			assert.deepEqual(response.headers['content-type'], equivalentTo.headers['content-type']);
		};

		// Make sure 'newer' is equivalent
		let responseAlt = await API.userGet(
			config.userID,
			"deleted?key=" + config.apiKey + "&newer=" + libraryVersion1
		);
		assertEquivalent(responseAlt, response);

		// Make sure 'since=0' is equivalent
		responseAlt = await API.userGet(
			config.userID,
			"deleted?key=" + config.apiKey + "&since=0"
		);
		assertEquivalent(responseAlt, response);

		// Make sure 'newer=0' is equivalent
		responseAlt = await API.userGet(
			config.userID,
			"deleted?key=" + config.apiKey + "&newer=0"
		);
		assertEquivalent(responseAlt, response);

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
			`deleted?key=${config.apiKey}&since=${libraryVersion2}`
		);
		Helpers.assertStatusCode(response, 200);
		json = JSON.parse(response.data);
		version = response.headers["last-modified-version"][0];
		assert.isNotNull(version);
		assert.equal(response.headers["content-type"][0], "application/json");

		responseAlt = await API.userGet(
			config.userID,
			`deleted?key=${config.apiKey}&newer=${libraryVersion2}`
		);
		assertEquivalent(responseAlt, response);

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

