const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('ObjectTests', function () {
	this.timeout(config.timeout);
	let types = ['collection', 'search', 'item'];

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	beforeEach(async function () {
		await API.userClear(config.userID);
	});

	afterEach(async function () {
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


	it('test_patch_with_deleted_should_clear_trash_state', async function () {
		for (let type of types) {
			const dataObj = {
				deleted: true,
			};
			const json = await API.createDataObject(type, dataObj, this);
			// TODO: Change to true in APIv4
			if (type === 'item') {
				assert.equal(json.data.deleted, 1);
			}
			else {
				assert.ok(json.data.deleted);
			}
			const data = [
				{
					key: json.key,
					version: json.version,
					deleted: false
				}
			];
			const response = await API.postObjects(type, data);
			const jsonResponse = await API.getJSONFromResponse(response);
			assert.notProperty(jsonResponse.successful[0].data, 'deleted');
		}
	});

	const _testResponseJSONPut = async (objectType) => {
		const objectPlural = API.getPluralObjectType(objectType);
		let json1, conditions;

		switch (objectType) {
			case 'collection':
				json1 = { name: 'Test 1' };
				break;

			case 'item':
				json1 = await API.getItemTemplate('book');
				json1.title = 'Test 1';
				break;

			case 'search':
				conditions = [
					{
						condition: 'title',
						operator: 'contains',
						value: 'value'
					}
				];
				json1 = { name: 'Test 1', conditions };
				break;
		}

		let response = await API.userPost(
			config.userID,
			`${objectPlural}`,
			JSON.stringify([json1]),
			{ 'Content-Type': 'application/json' }
		);

		Helpers.assert200(response);

		let json = await API.getJSONFromResponse(response);
		Helpers.assert200ForObject(response);
		const objectKey = json.successful[0].key;

		response = await API.userGet(
			config.userID,
			`${objectPlural}/${objectKey}`
		);

		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);

		switch (objectType) {
			case 'item':
				json.data.title = 'Test 2';
				break;

			case 'collection':
			case 'search':
				json.data.name = 'Test 2';
				break;
		}

		response = await API.userPut(
			config.userID,
			`${objectPlural}/${objectKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);

		Helpers.assert204(response);
		//check
		response = await API.userGet(
			config.userID,
			`${objectPlural}/${objectKey}`
		);

		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);

		switch (objectType) {
			case 'item':
				assert.equal(json.data.title, 'Test 2');
				break;

			case 'collection':
			case 'search':
				assert.equal(json.data.name, 'Test 2');
				break;
		}
	};

	it('testResponseJSONPut', async function () {
		await _testResponseJSONPut('collection');
		await _testResponseJSONPut('item');
		await _testResponseJSONPut('search');
	});

	it('testCreateByPut', async function () {
		await _testCreateByPut('collection');
		await _testCreateByPut('item');
		await _testCreateByPut('search');
	});

	const _testCreateByPut = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		const json = await API.createUnsavedDataObject(objectType);
		const key = Helpers.uniqueID();
		const response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': '0'
			}
		);
		Helpers.assert204(response);
	};

	const _testEmptyVersionsResponse = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		const keyProp = objectType + 'Key';

		const response = await API.userGet(
			config.userID,
			`${objectTypePlural}?format=versions&${keyProp}=NNNNNNNN`,
			{ 'Content-Type': 'application/json' }
		);

		Helpers.assert200(response);

		const json = JSON.parse(response.data);

		assert.isObject(json);
		assert.lengthOf(Object.keys(json), 0);
	};

	const _testResponseJSONPost = async (objectType) => {
		await API.userClear(config.userID);

		let objectTypePlural = await API.getPluralObjectType(objectType);
		let json1, json2, conditions;
		switch (objectType) {
			case "collection":
				json1 = { name: "Test 1" };
				json2 = { name: "Test 2" };
				break;

			case "item":
				json1 = await API.getItemTemplate("book");
				json2 = { ...json1 };
				json1.title = "Test 1";
				json2.title = "Test 2";
				break;

			case "search":
				conditions = [
					{ condition: "title", operator: "contains", value: "value" },
				];
				json1 = { name: "Test 1", conditions: conditions };
				json2 = { name: "Test 2", conditions: conditions };
				break;
		}

		let response = await API.userPost(
			config.userID,
			objectTypePlural,
			JSON.stringify([json1, json2]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
		let json = await API.getJSONFromResponse(response);
		Helpers.assert200ForObject(response, false, 0);
		Helpers.assert200ForObject(response, false, 1);

		response = await API.userGet(config.userID, objectTypePlural);
		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);
		switch (objectType) {
			case "item":
				json[0].data.title
					= json[0].data.title === "Test 1" ? "Test A" : "Test B";
				json[1].data.title
					= json[1].data.title === "Test 2" ? "Test B" : "Test A";
				break;

			case "collection":
			case "search":
				json[0].data.name
					= json[0].data.name === "Test 1" ? "Test A" : "Test B";
				json[1].data.name
					= json[1].data.name === "Test 2" ? "Test B" : "Test A";
				break;
		}

		response = await API.userPost(
			config.userID,
			objectTypePlural,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);
		Helpers.assert200ForObject(response, false, 0);
		Helpers.assert200ForObject(response, false, 1);

		// Check
		response = await API.userGet(config.userID, objectTypePlural);
		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);

		switch (objectTypePlural) {
			case "item":
				Helpers.assertEquals("Test A", json[0].data.title);
				Helpers.assertEquals("Test B", json[1].data.title);
				break;

			case "collection":
			case "search":
				Helpers.assertEquals("Test A", json[0].data.name);
				Helpers.assertEquals("Test B", json[1].data.name);
				break;
		}
	};

	it('test_patch_of_object_should_set_trash_state', async function () {
		for (let type of types) {
			let json = await API.createDataObject(type);
			const data = [
				{
					key: json.key,
					version: json.version,
					deleted: true
				}
			];
			const response = await API.postObjects(type, data);
			Helpers.assert200ForObject(response);
			json = API.getJSONFromResponse(response);
			assert.property(json.successful[0].data, 'deleted');
			if (type == 'item') {
				assert.equal(json.successful[0].data.deleted, 1);
			}
			else {
				assert.property(json.successful[0].data, 'deleted');
			}
		}
	});

	it('testResponseJSONPost', async function () {
		await _testResponseJSONPost('collection');
		await _testResponseJSONPost('item');
		await _testResponseJSONPost('search');
	});

	it('testEmptyVersionsResponse', async function () {
		await _testEmptyVersionsResponse('collection');
		await _testEmptyVersionsResponse('item');
		await _testEmptyVersionsResponse('search');
	});

	it('test_patch_of_object_in_trash_without_deleted_should_not_remove_it_from_trash', async function () {
		for (let i = 0; i < types.length; i++) {
			const json = await API.createItem("book", {
				deleted: true
			}, this, 'json');
			const data = [
				{
					key: json.key,
					version: json.version,
					title: "A"
				}
			];
			const response = await API.postItems(data);
			const jsonResponse = await API.getJSONFromResponse(response);

			assert.property(jsonResponse.successful[0].data, 'deleted');
			assert.equal(jsonResponse.successful[0].data.deleted, 1);
		}
	});
});

