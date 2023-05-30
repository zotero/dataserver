const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('VersionsTests', function () {
	this.timeout(config.timeout * 2);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	const _capitalizeFirstLetter = (string) => {
		return string.charAt(0).toUpperCase() + string.slice(1);
	};

	const _modifyJSONObject = async (objectType, json) => {
		switch (objectType) {
			case "collection":
				json.name = "New Name " + Helpers.uniqueID();
				return json;
			case "item":
				json.title = "New Title " + Helpers.uniqueID();
				return json;
			case "search":
				json.name = "New Name " + Helpers.uniqueID();
				return json;
			default:
				throw new Error("Unknown object type");
		}
	};

	const _testSingleObjectLastModifiedVersion = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		
		let objectKey;
		switch (objectType) {
			case 'collection':
				objectKey = await API.createCollection('Name', false, true, 'key');
				break;
			case 'item':
				objectKey = await API.createItem(
					'book',
					{ title: 'Title' },
					true,
					'key'
				);
				break;
			case 'search':
				objectKey = await API.createSearch(
					'Name',
					[
						{
							condition: 'title',
							operator: 'contains',
							value: 'test'
						}
					],
					this,
					'key'
				);
				break;
		}

		// JSON: Make sure all three instances of the object version
		// (Last-Modified-Version, 'version', and data.version)
		// match the library version
		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}`
		);
		Helpers.assert200(response);
		let objectVersion = response.headers["last-modified-version"][0];
		let json = API.getJSONFromResponse(response);
		assert.equal(objectVersion, json.version);
		assert.equal(objectVersion, json.data.version);
		

		// Atom: Make sure all three instances of the object version
		// (Last-Modified-Version, zapi:version, and the JSON
		// {$objectType}Version property match the library version
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}?content=json`
		);

		Helpers.assertStatusCode(response, 200);
		objectVersion = parseInt(response.headers['last-modified-version'][0]);
		const xml = API.getXMLFromResponse(response);
		const data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(objectVersion, json.version);
		assert.equal(objectVersion, data.version);
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?limit=1`
		);
		Helpers.assertStatusCode(response, 200);
		const libraryVersion = response.headers['last-modified-version'][0];
		assert.equal(libraryVersion, objectVersion);
		_modifyJSONObject(objectType, json);

		// No If-Unmodified-Since-Version or JSON version property
		delete json.version;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 428);

		// Out of date version
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': objectVersion - 1
			}
		);
		Helpers.assertStatusCode(response, 412);

		// Update with version header
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': objectVersion
			}
		);
		Helpers.assertStatusCode(response, 204);

		// Update object with JSON version property
		const newObjectVersion = parseInt(response.headers['last-modified-version'][0]);
		assert.isAbove(parseInt(newObjectVersion), parseInt(objectVersion));
		_modifyJSONObject(objectType, json);
		json.version = newObjectVersion;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(json)
		);
		Helpers.assertStatusCode(response, 204);
		const newObjectVersion2 = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(newObjectVersion2), parseInt(newObjectVersion));
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?limit=1`
		);
		Helpers.assertStatusCode(response, 200);
		const newLibraryVersion = response.headers['last-modified-version'][0];
		assert.equal(parseInt(newObjectVersion2), parseInt(newLibraryVersion));
		return;

		await API.createItem('book', { title: 'Title' }, this, 'key');
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}?limit=1`
		);
		Helpers.assertStatusCode(response, 200);
		const newObjectVersion3 = response.headers['last-modified-version'][0];
		assert.equal(parseInt(newLibraryVersion), parseInt(newObjectVersion3));
		response = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}`
		);
		Helpers.assertStatusCode(response, 428);
		response = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			{ 'If-Unmodified-Since-Version': objectVersion }
		);
		Helpers.assertStatusCode(response, 412);
		response = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}`,
			{ 'If-Unmodified-Since-Version': newObjectVersion2 }
		);
		Helpers.assertStatusCode(response, 204);
	};

	const _testMultiObjectLastModifiedVersion = async (objectType) => {
		await API.userClear(config.userID);
		const objectTypePlural = API.getPluralObjectType(objectType);


		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?limit=1`
		);

		let version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);

		let json;
		switch (objectType) {
			case 'collection':
				json = {};
				json.name = "Name";
				break;

			case 'item':
				json = await API.getItemTemplate("book");
				json.creators[0].firstName = "Test";
				json.creators[0].lastName = "Test";
				break;

			case 'search':
				json = {};
				json.name = "Name";
				json.conditions = [];
				json.conditions.push({
					condition: "title",
					operator: "contains",
					value: "test"
				});
				break;
		}

		// Outdated library version
		const headers1 = {
			"Content-Type": "application/json",
			"If-Unmodified-Since-Version": version - 1
		};
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			headers1
		);

		Helpers.assertStatusCode(response, 412);

		// Make sure version didn't change during failure
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?limit=1`
		);

		assert.equal(version, parseInt(response.headers['last-modified-version'][0]));

		// Create a new object, using library timestamp
		const headers2 = {
			"Content-Type": "application/json",
			"If-Unmodified-Since-Version": version
		};
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			headers2
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertStatusForObject(response, 'success', 0);
		const version2 = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version2);
		// Version should be incremented on new object
		assert.isAbove(version2, version);

		const objectKey = API.getFirstSuccessKeyFromResponse(response);

		// Check single-object request
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}`
		);
		Helpers.assertStatusCode(response, 200);

		version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);
		assert.equal(version2, version);
		json = API.getJSONFromResponse(response).data;

		json.key = objectKey;
		// Modify object
		switch (objectType) {
			case 'collection':
				json.name = "New Name";
				break;

			case 'item':
				json.title = "New Title";
				break;

			case 'search':
				json.name = "New Name";
				break;
		}

		delete json.version;

		// No If-Unmodified-Since-Version or object version property
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assertStatusForObject(response, 'failed', 0, 428);

		json.version = version - 1;

		response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			{
				"Content-Type": "application/json",
			}
		);
		// Outdated object version property
		const message = `${_capitalizeFirstLetter(objectType)} has been modified since specified version (expected ${json.version}, found ${version2})`;
		Helpers.assertStatusForObject(response, 'failed', 0, 412, message);
		// Modify object, using object version property
		json.version = version;
		
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			{
				"Content-Type": "application/json",
			}
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertStatusForObject(response, 'success', 0);
		// Version should be incremented on modified object
		const version3 = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version3);
		assert.isAbove(version3, version2);
		// Check library version
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}`
		);
		version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);
		assert.equal(version, version3);
		// Check single-object request
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}`
		);
		version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);
		assert.equal(version, version3);
	};

	const _testMultiObject304NotModified = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}`
		);

		const version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);

		response = await API.userGet(
			config.userID,
			`${objectTypePlural}`,
			{ 'If-Modified-Since-Version': version }
		);
		Helpers.assertStatusCode(response, 304);
	};

	const _testSinceAndVersionsFormat = async (objectType, sinceParam) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
	
		const objArray = [];
	
		switch (objectType) {
			case 'collection':
				objArray.push(await API.createCollection("Name", false, true, 'jsonData'));
				objArray.push(await API.createCollection("Name", false, true, 'jsonData'));
				objArray.push(await API.createCollection("Name", false, true, 'jsonData'));
				break;
	
			case 'item':
				objArray.push(await API.createItem("book", {
					title: "Title"
				}, true, 'jsonData'));
				objArray.push(await API.createNoteItem("Foo", objArray[0].key, true, 'jsonData'));
				objArray.push(await API.createItem("book", {
					title: "Title"
				}, true, 'jsonData'));
				objArray.push(await API.createItem("book", {
					title: "Title"
				}, true, 'jsonData'));
				break;
	
	
			case 'search':
				objArray.push(await API.createSearch(
					"Name", [{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true,
					'jsonData'
				));
				objArray.push(await API.createSearch(
					"Name", [{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true,
					'jsonData'
				));
				objArray.push(await API.createSearch(
					"Name", [{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true,
					'jsonData'
				));
		}
	
		let objects = [...objArray];
	
		const firstVersion = objects[0].version;
	
		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?format=versions&${sinceParam}=${firstVersion}`, {
				"Content-Type": "application/json"
			}
		);
		Helpers.assertStatusCode(response, 200);
		let json = JSON.parse(response.data);
		assert.ok(json);
		Helpers.assertCount(Object.keys(objects).length - 1, json);
		
		let keys = Object.keys(json);

		let keyIndex = 0;
		if (objectType == 'item') {
			assert.equal(objects[3].key, keys[0]);
			assert.equal(objects[3].version, json[keys[0]]);
			keyIndex += 1;
		}
	
		assert.equal(objects[2].key, keys[keyIndex]);
		assert.equal(objects[2].version, json[objects[2].key]);
		assert.equal(objects[1].key, keys[keyIndex + 1]);
		assert.equal(objects[1].version, json[objects[1].key]);

		// Test /top for items
		if (objectType == 'item') {
			response = await API.userGet(
				config.userID,
				`items/top?format=versions&${sinceParam}=${firstVersion}`
			);
			
			Helpers.assert200(response);
			json = JSON.parse(response.data);
			assert.ok(json);
			assert.equal(objects.length - 2, Object.keys(json).length);// Exclude first item and child
			
			keys = Object.keys(json);
			
			objects = [...objArray];
			
			assert.equal(objects[3].key, keys[0]);
			assert.equal(objects[3].version, json[keys[0]]);
			assert.equal(objects[2].key, keys[1]);
			assert.equal(objects[2].version, json[keys[1]]);
		}
	};

	const _testUploadUnmodified = async (objectType) => {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let data, version, response, json;

		switch (objectType) {
			case "collection":
				data = await API.createCollection("Name", false, true, 'jsonData');
				break;

			case "item":
				data = await API.createItem("book", { title: "Title" }, true, 'jsonData');
				break;

			case "search":
				data = await API.createSearch("Name", "default", true, 'jsonData');
				break;
		}

		version = data.version;
		assert.notEqual(0, version);

		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${data.key}`,
			JSON.stringify(data),
			{ "Content-Type": "application/json" }
		);

		Helpers.assertStatusCode(response, 204);
		assert.equal(version, response.headers["last-modified-version"][0]);

		switch (objectType) {
			case "collection":
				json = await API.getCollection(data.key, true, 'json');
				break;

			case "item":
				json = await API.getItem(data.key, true, 'json');
				break;

			case "search":
				json = await API.getSearch(data.key, true, 'json');
				break;
		}

		assert.equal(version, json.version);
	};

	const _testTagsSince = async (param) => {
		const tags1 = ["a", "aa", "b"];
		const tags2 = ["b", "c", "cc"];

		const data1 = await API.createItem("book", {
			tags: tags1.map((tag) => {
				return { tag: tag };
			})
		}, true, 'jsonData');

		await API.createItem("book", {
			tags: tags2.map((tag) => {
				return { tag: tag };
			})
		}, true, 'jsonData');

		// Only newly added tags should be included in newer,
		// not previously added tags or tags added to items
		let response = await API.userGet(
			config.userID,
			`tags?${param}=${data1.version}`
		);
		Helpers.assertNumResults(response, 2);

		// Deleting an item shouldn't update associated tag versions
		response = await API.userDelete(
			config.userID,
			`items/${data1.key}`,
			{
				"If-Unmodified-Since-Version": data1.version
			}
		);
		Helpers.assertStatusCode(response, 204);

		response = await API.userGet(
			config.userID,
			`tags?${param}=${data1.version}`
		);
		Helpers.assertNumResults(response, 2);
		let libraryVersion = parseInt(response.headers["last-modified-version"][0]);

		response = await API.userGet(
			config.userID,
			`tags?${param}=${libraryVersion}`
		);
		Helpers.assertNumResults(response, 0);
	};

	const _testPatchMissingObjectsWithVersion = async function (objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json = await API.createUnsavedDataObject(objectType);
		json.key = 'TPMBJSWV';
		json.version = 123;
		let response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert404ForObject(
			response,
			`${objectType} doesn't exist (expected version 123; use 0 instead)`
		);
	};

	const _testPatchMissingObjectWithVersion0Header = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);
		const json = await API.createUnsavedDataObject(objectType);
		const response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/TPMBWVZH`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json', 'If-Unmodified-Since-Version': '0' },
		);
		Helpers.assert204(response);
	};

	const _testPatchExistingObjectsWithOldVersionProperty = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);

		const key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
		json.key = key;
		json.version = 1;

		const response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert412ForObject(response);
	};

	const _testPatchMissingObjectWithVersionHeader = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);
		const json = await API.createUnsavedDataObject(objectType);
		const response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/TPMBJWVH`,
			JSON.stringify(json),
			{ "Content-Type": "application/json", "If-Unmodified-Since-Version": "123" }
		);
		Helpers.assert404(response);
	};

	const _testPatchExistingObjectWithOldVersionProperty = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);
  
		const key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
		json.version = 1;
  
		const response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert412(response);
	};

	const _testPatchExistingObjectsWithoutVersionWithHeader = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);
		
		const existing = await API.createDataObject(objectType, null, null, 'json');
		const key = existing.key;
		const libraryVersion = existing.version;
		let json = await API.createUnsavedDataObject(objectType);
		json.key = key;
		
		const response = await API.userPost(
			config.userID,
			`${objectTypePlural}`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert428ForObject(response);
	};

	const _testPatchMissingObjectsWithVersion0Property = async function (objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json = await API.createUnsavedDataObject(objectType);
		json.key = 'TPMSWVZP';
		json.version = 0;

		let response = await API.userPost(
			config.userID,
			objectTypePlural,
			JSON.stringify([json]),
			{ 'Content-Type': 'application/json' });
		Helpers.assert200ForObject(response);

	// POST with version > 0 to a missing object is a 404 for that object
	};

	const _testPatchExistingObjectWithVersion0Property = async function (objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
		json.version = 0;

		let response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert412(response);
	};

	const _testPatchMissingObjectWithVersionProperty = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let json = await API.createUnsavedDataObject(objectType);
		json.version = 123;

		const response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/TPMBJWVP`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert404(response);
	};

	const _testPatchExistingObjectsWithVersion0Property = async (objectType) => {
		let objectTypePlural = API.getPluralObjectType(objectType);
  
		let key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
		json.key = key;
		json.version = 0;
  
		let response = await API.userPost(
			config.userID,
			objectTypePlural,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert412ForObject(response);
	};

	const _testPostExistingLibraryWithVersion0Header = async function (objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let json = await API.createUnsavedDataObject(objectType);

		let response = await API.userPost(
			config.userID,
			objectTypePlural,
			JSON.stringify([json]),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": "0"
			}
		);
		Helpers.assert412(response);
	};

	const _testPatchExistingObjectWithVersion0Header = async function (objectType) {
		const objectTypeName = API.getPluralObjectType(objectType);
		let key = await API.createDataObject(objectType, null, null, 'key');
		const json = await API.createUnsavedDataObject(objectType);
		const headers = {
			"Content-Type": "application/json",
			"If-Unmodified-Since-Version": "0"
		};
		let response = await API.userPatch(
			config.userID,
			`${objectTypeName}/${key}`,
			JSON.stringify(json),
			headers
		);
		Helpers.assert412(response);
	};

	const _testPatchExistingObjectWithoutVersion = async function (objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
		let headers = { "Content-Type": "application/json" };

		let response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			headers
		);
		Helpers.assert428(response);
	};

	const _testPatchExistingObjectWithOldVersionHeader = async function (objectType) {
		const objectTypePlural = API.getPluralObjectType(objectType);
	
		let key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
	
		let headers = {
			"Content-Type": "application/json",
			"If-Unmodified-Since-Version": "1"
		};
	
		let response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			headers
		);
	
		Helpers.assert412(response);
	};

	const _testPatchMissingObjectWithVersion0Property = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let json = await API.createUnsavedDataObject(objectType);
		json.version = 0;

		let response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/TPMBWVZP`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert204(response);
	};

	const _testPatchMissingObjectWithoutVersion = async function (objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json = await API.createUnsavedDataObject(objectType);
		let response = await API.userPatch(
			config.userID,
			`${objectTypePlural}/TPMBJWNV`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert404(response);
	};

	const _testPatchExistingObjectsWithoutVersionWithoutHeader = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		let key = await API.createDataObject(objectType, null, null, 'key');
		let json = await API.createUnsavedDataObject(objectType);
		json.key = key;
		let response = await API.userPost(
			config.userID,
			objectTypePlural,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert428ForObject(response);
	};


	it('testTagsSince', async function () {
		await _testTagsSince('since');
		await API.userClear(config.userID);
		await _testTagsSince('newer');
	});

	it('testSingleObjectLastModifiedVersion', async function () {
		await _testSingleObjectLastModifiedVersion('collection');
		await _testSingleObjectLastModifiedVersion('item');
		await _testSingleObjectLastModifiedVersion('search');
	});

	it('testMultiObjectLastModifiedVersion', async function () {
		await _testMultiObjectLastModifiedVersion('collection');
		await _testMultiObjectLastModifiedVersion('item');
		await _testMultiObjectLastModifiedVersion('search');
	});

	it('testMultiObject304NotModified', async function () {
		await _testMultiObject304NotModified('collection');
		await _testMultiObject304NotModified('item');
		await _testMultiObject304NotModified('search');
		await _testMultiObject304NotModified('setting');
		await _testMultiObject304NotModified('tag');
	});

	it('testSinceAndVersionsFormat', async function () {
		await _testSinceAndVersionsFormat('collection', 'since');
		await _testSinceAndVersionsFormat('item', 'since');
		await _testSinceAndVersionsFormat('search', 'since');
		await API.userClear(config.userID);
		await _testSinceAndVersionsFormat('collection', 'newer');
		await _testSinceAndVersionsFormat('item', 'newer');
		await _testSinceAndVersionsFormat('search', 'newer');
	});

	it('testUploadUnmodified', async function () {
		await _testUploadUnmodified('collection');
		await _testUploadUnmodified('item');
		await _testUploadUnmodified('search');
	});

	it('test_should_include_library_version_for_412', async function () {
		let json = await API.createItem("book", [], this, 'json');
		let libraryVersion = json.version;
		json.data.version--;
		let response = await API.userPut(
			config.userID,
			"items/" + json.key,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": (json.version - 1)
			}
		);
		Helpers.assert412(response);
		assert.equal(libraryVersion, response.headers['last-modified-version'][0]);
	});

	it('testPatchExistingObjectWithOldVersionHeader', async function () {
		await _testPatchExistingObjectWithOldVersionHeader('collection');
		await _testPatchExistingObjectWithOldVersionHeader('item');
		await _testPatchExistingObjectWithOldVersionHeader('search');
	});

	it('testPatchMissingObjectWithVersionHeader', async function () {
		await _testPatchMissingObjectWithVersionHeader('collection');
		await _testPatchMissingObjectWithVersionHeader('item');
		await _testPatchMissingObjectWithVersionHeader('search');
	});

	it('testPostToSettingsWithOutdatedVersionHeader', async function () {
		let libraryVersion = await API.getLibraryVersion();
		// Outdated library version
		let response = await API.userPost(
			config.userID,
			"settings",
			JSON.stringify({}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": (libraryVersion - 1)
			}
		);
		Helpers.assert412(response);
	});

	it('testPatchExistingObjectsWithOldVersionProperty', async function () {
		await _testPatchExistingObjectsWithOldVersionProperty('collection');
		await _testPatchExistingObjectsWithOldVersionProperty('item');
		await _testPatchExistingObjectsWithOldVersionProperty('search');
	});

	it('testPatchExistingObjectsWithoutVersionWithoutHeader', async function () {
		await _testPatchExistingObjectsWithoutVersionWithoutHeader('collection');
		await _testPatchExistingObjectsWithoutVersionWithoutHeader('item');
		await _testPatchExistingObjectsWithoutVersionWithoutHeader('search');
	});

	it('testPatchMissingObjectWithVersion0Header', async function () {
		await _testPatchMissingObjectWithVersion0Header('collection');
		await _testPatchMissingObjectWithVersion0Header('item');
		await _testPatchMissingObjectWithVersion0Header('search');
	});

	it('testPatchExistingObjectsWithoutVersionWithHeader', async function () {
		await _testPatchExistingObjectsWithoutVersionWithHeader('collection');
		await _testPatchExistingObjectsWithoutVersionWithHeader('item');
		await _testPatchExistingObjectsWithoutVersionWithHeader('search');
	});

	it('testPatchMissingObjectWithoutVersion', async function () {
		await _testPatchMissingObjectWithoutVersion('collection');
		await _testPatchMissingObjectWithoutVersion('item');
		await _testPatchMissingObjectWithoutVersion('search');
	});

	it('test_should_not_include_library_version_for_400', async function () {
		let json = await API.createItem("book", [], this, 'json');
		let libraryVersion = json.version;
		let response = await API.userPut(
			config.userID,
			"items/" + json.key,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": (json.version - 1)
			}
		);
		Helpers.assert400(response);
		assert.notOk(response.headers['last-modified-version']);
	});

	it('testPatchMissingObjectsWithVersion', async function () {
		await _testPatchMissingObjectsWithVersion('collection');
		await _testPatchMissingObjectsWithVersion('item');
		await _testPatchMissingObjectsWithVersion('search');
	});

	it('testPatchExistingObjectWithVersion0Property', async function () {
		await _testPatchExistingObjectWithVersion0Property('collection');
		await _testPatchExistingObjectWithVersion0Property('item');
		await _testPatchExistingObjectWithVersion0Property('search');
	});

	it('testPatchMissingObjectsWithVersion0Property', async function () {
		await _testPatchMissingObjectsWithVersion0Property('collection');
		await _testPatchMissingObjectsWithVersion0Property('item');
		await _testPatchMissingObjectsWithVersion0Property('search');
	});

	it('testPatchExistingObjectWithoutVersion', async function () {
		await _testPatchExistingObjectWithoutVersion('search');
	});

	it('testPostExistingLibraryWithVersion0Header', async function () {
		await _testPostExistingLibraryWithVersion0Header('collection');
		await _testPostExistingLibraryWithVersion0Header('item');
		await _testPostExistingLibraryWithVersion0Header('search');
	});

	it('testPatchExistingObjectWithVersion0Header', async function () {
		await _testPatchExistingObjectWithVersion0Header('collection');
		await _testPatchExistingObjectWithVersion0Header('item');
		await _testPatchExistingObjectWithVersion0Header('search');
	});

	it('testPatchMissingObjectWithVersionProperty', async function () {
		await _testPatchMissingObjectWithVersionProperty('collection');
		await _testPatchMissingObjectWithVersionProperty('item');
		await _testPatchMissingObjectWithVersionProperty('search');
	});

	it('testPatchExistingObjectWithOldVersionProperty', async function () {
		await _testPatchExistingObjectWithOldVersionProperty('collection');
		await _testPatchExistingObjectWithOldVersionProperty('item');
		await _testPatchExistingObjectWithOldVersionProperty('search');
	});

	it('testPatchExistingObjectsWithVersion0Property', async function () {
		await _testPatchExistingObjectsWithVersion0Property('collection');
		await _testPatchExistingObjectsWithVersion0Property('item');
		await _testPatchExistingObjectsWithVersion0Property('search');
	});

	it('testPatchMissingObjectWithVersion0Property', async function () {
		await _testPatchMissingObjectWithVersion0Property('collection');
		await _testPatchMissingObjectWithVersion0Property('item');
		await _testPatchMissingObjectWithVersion0Property('search');
	});
});
