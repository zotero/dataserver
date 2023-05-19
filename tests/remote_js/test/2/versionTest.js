const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('VersionsTests', function () {
	this.timeout(config.timeout * 2);

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
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
		const versionProp = objectType + 'Version';
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
		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}&content=json`
		);

		Helpers.assertStatusCode(response, 200);
		const objectVersion = response.headers['last-modified-version'][0];
		const xml = API.getXMLFromResponse(response);
		const data = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(data.content);
		assert.equal(objectVersion, json[versionProp]);
		assert.equal(objectVersion, data.version);
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&limit=1`
		);
		Helpers.assertStatusCode(response, 200);
		const libraryVersion = response.headers['last-modified-version'][0];
		assert.equal(libraryVersion, objectVersion);
		_modifyJSONObject(objectType, json);
		delete json[versionProp];
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assertStatusCode(response, 428);
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': objectVersion - 1
			}
		);
		Helpers.assertStatusCode(response, 412);
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				'Content-Type': 'application/json',
				'If-Unmodified-Since-Version': objectVersion
			}
		);
		Helpers.assertStatusCode(response, 204);
		const newObjectVersion = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(newObjectVersion), parseInt(objectVersion));
		_modifyJSONObject(objectType, json);
		json[versionProp] = newObjectVersion;
		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assertStatusCode(response, 204);
		const newObjectVersion2 = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(newObjectVersion2), parseInt(newObjectVersion));
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&limit=1`
		);
		Helpers.assertStatusCode(response, 200);
		const newLibraryVersion = response.headers['last-modified-version'][0];
		assert.equal(parseInt(newObjectVersion2), parseInt(newLibraryVersion));
		await API.createItem('book', { title: 'Title' }, this, 'key');
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}&limit=1`
		);
		Helpers.assertStatusCode(response, 200);
		const newObjectVersion3 = response.headers['last-modified-version'][0];
		assert.equal(parseInt(newLibraryVersion), parseInt(newObjectVersion3));
		response = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify({})
		);
		Helpers.assertStatusCode(response, 428);
		response = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify({}),
			{ 'If-Unmodified-Since-Version': objectVersion }
		);
		Helpers.assertStatusCode(response, 412);
		response = await API.userDelete(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`,
			JSON.stringify({}),
			{ 'If-Unmodified-Since-Version': newObjectVersion2 }
		);
		Helpers.assertStatusCode(response, 204);
	};

	const _testMultiObjectLastModifiedVersion = async (objectType) => {
		await API.userClear(config.userID);
		const objectTypePlural = API.getPluralObjectType(objectType);
		const objectKeyProp = objectType + "Key";
		const objectVersionProp = objectType + "Version";

		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&limit=1`
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
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({
				[objectTypePlural]: [json]
			}),
			headers1
		);

		Helpers.assertStatusCode(response, 412);

		// Make sure version didn't change during failure
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&limit=1`
		);

		assert.equal(version, parseInt(response.headers['last-modified-version'][0]));

		// Create a new object, using library timestamp
		const headers2 = {
			"Content-Type": "application/json",
			"If-Unmodified-Since-Version": version
		};
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({
				[objectTypePlural]: [json]
			}),
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
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}&content=json`
		);
		Helpers.assertStatusCode(response, 200);

		version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);
		assert.equal(version2, version);

		json[objectKeyProp] = objectKey;
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

		delete json[objectVersionProp];

		// No If-Unmodified-Since-Version or object version property
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({
				[objectTypePlural]: [json]
			}),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assertStatusForObject(response, 'failed', 0, 428);

		json[objectVersionProp] = version - 1;

		response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({
				[objectTypePlural]: [json]
			}),
			{
				"Content-Type": "application/json",
			}
		);
		// Outdated object version property
		const message = `${_capitalizeFirstLetter(objectType)} has been modified since specified version (expected ${json[objectVersionProp]}, found ${version2})`;
		Helpers.assertStatusForObject(response, 'failed', 0, 412, message);
		// Modify object, using object version property
		json[objectVersionProp] = version;
		
		response = await API.userPost(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			JSON.stringify({
				[objectTypePlural]: [json]
			}),
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
			`${objectTypePlural}?key=${config.apiKey}`
		);
		version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);
		assert.equal(version, version3);
		// Check single-object request
		response = await API.userGet(
			config.userID,
			`${objectTypePlural}/${objectKey}?key=${config.apiKey}`
		);
		version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);
		assert.equal(version, version3);
	};

	const _testMultiObject304NotModified = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`
		);

		const version = parseInt(response.headers['last-modified-version'][0]);
		assert.isNumber(version);

		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}`,
			{ 'If-Modified-Since-Version': version }
		);
		Helpers.assertStatusCode(response, 304);
	};

	const _testNewerAndVersionsFormat = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
	
		const xmlArray = [];
	
		switch (objectType) {
			case 'collection':
				xmlArray.push(await API.createCollection("Name", false, true));
				xmlArray.push(await API.createCollection("Name", false, true));
				xmlArray.push(await API.createCollection("Name", false, true));
				break;
	
			case 'item':
				xmlArray.push(await API.createItem("book", {
					title: "Title"
				}, true));
				xmlArray.push(await API.createItem("book", {
					title: "Title"
				}, true));
				xmlArray.push(await API.createItem("book", {
					title: "Title"
				}, true));
				break;
	
	
			case 'search':
				xmlArray.push(await API.createSearch(
					"Name", [{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true
				));
				xmlArray.push(await API.createSearch(
					"Name", [{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true
				));
				xmlArray.push(await API.createSearch(
					"Name", [{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true
				));
		}
	
		const objects = [];
		while (xmlArray.length > 0) {
			const xml = xmlArray.shift();
			const data = await API.parseDataFromAtomEntry(xml);
			objects.push({
				key: data.key,
				version: data.version
			});
		}
	
		const firstVersion = objects[0].version;
	
		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&format=versions&newer=${firstVersion}`, {
				"Content-Type": "application/json"
			}
		);
		Helpers.assertStatusCode(response, 200);
		const json = JSON.parse(response.data);
		assert.ok(json);
		assert.lengthOf(Object.keys(json), 2);
		const keys = Object.keys(json);
	
		assert.equal(objects[2].key, keys.shift());
		assert.equal(objects[2].version, json[objects[2].key]);
		assert.equal(objects[1].key, keys.shift());
		assert.equal(objects[1].version, json[objects[1].key]);
	};

	const _testUploadUnmodified = async (objectType) => {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let xml, version, response, data, json;

		switch (objectType) {
			case "collection":
				xml = await API.createCollection("Name", false, true);
				break;

			case "item":
				xml = await API.createItem("book", { title: "Title" }, true);
				break;

			case "search":
				xml = await API.createSearch("Name", "default", true);
				break;
		}

		version = parseInt(Helpers.xpathEval(xml, "//atom:entry/zapi:version"));
		assert.notEqual(0, version);

		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		response = await API.userPut(
			config.userID,
			`${objectTypePlural}/${data.key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);

		Helpers.assertStatusCode(response, 204);
		assert.equal(version, response.headers["last-modified-version"][0]);

		switch (objectType) {
			case "collection":
				xml = await API.getCollectionXML(data.key);
				break;

			case "item":
				xml = await API.getItemXML(data.key);
				break;

			case "search":
				xml = await API.getSearchXML(data.key);
				break;
		}

		data = API.parseDataFromAtomEntry(xml);
		assert.equal(version, data.version);
	};

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
		await _testMultiObject304NotModified('tag');
	});

	it('testNewerAndVersionsFormat', async function () {
		await _testNewerAndVersionsFormat('collection');
		await _testNewerAndVersionsFormat('item');
		await _testNewerAndVersionsFormat('search');
	});

	it('testUploadUnmodified', async function () {
		await _testUploadUnmodified('collection');
		await _testUploadUnmodified('item');
		await _testUploadUnmodified('search');
	});

	it('testNewerTags', async function () {
		const tags1 = ["a", "aa", "b"];
		const tags2 = ["b", "c", "cc"];

		const data1 = await API.createItem("book", {
			tags: tags1.map((tag) => {
				return { tag: tag };
			})
		}, true, 'data');

		await API.createItem("book", {
			tags: tags2.map((tag) => {
				return { tag: tag };
			})
		}, true, 'data');

		// Only newly added tags should be included in newer,
		// not previously added tags or tags added to items
		let response = await API.userGet(
			config.userID,
			"tags?key=" + config.apiKey
			+ "&newer=" + data1.version
		);
		Helpers.assertNumResults(response, 2);

		// Deleting an item shouldn't update associated tag versions
		response = await API.userDelete(
			config.userID,
			`items/${data1.key}?key=${config.apiKey}`,
			JSON.stringify({}),
			{
				"If-Unmodified-Since-Version": data1.version
			}
		);
		Helpers.assertStatusCode(response, 204);

		response = await API.userGet(
			config.userID,
			"tags?key=" + config.apiKey
			+ "&newer=" + data1.version
		);
		Helpers.assertNumResults(response, 2);
		let libraryVersion = response.headers["last-modified-version"][0];

		response = await API.userGet(
			config.userID,
			"tags?key=" + config.apiKey
			+ "&newer=" + libraryVersion
		);
		Helpers.assertNumResults(response, 0);
	});
});
