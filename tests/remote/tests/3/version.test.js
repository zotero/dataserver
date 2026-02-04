/**
 * Version API tests
 * Port of tests/remote/tests/API/3/VersionTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert204,
	assert304,
	assert400,
	assert404,
	assert412,
	assert428,
	assert200ForObject,
	assert400ForObject,
	assert404ForObject,
	assert412ForObject,
	assert428ForObject,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Versioning', function() {
	this.timeout(60000);

	beforeEach(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testSingleObjectLastModifiedVersion
	it('should track single object last modified version', async function() {
		await testSingleObjectLastModifiedVersion('collection');
		await testSingleObjectLastModifiedVersion('item');
		await testSingleObjectLastModifiedVersion('search');
	});

	// PHP: testMultiObjectLastModifiedVersion
	it('should track multi object last modified version', async function() {
		await testMultiObjectLastModifiedVersion('collection');
		await testMultiObjectLastModifiedVersion('item');
		await testMultiObjectLastModifiedVersion('search');
	});

	// PHP: testMultiObject304NotModified
	it('should return 304 not modified', async function() {
		await testMultiObject304NotModified('collection');
		await testMultiObject304NotModified('item');
		await testMultiObject304NotModified('search');
		await testMultiObject304NotModified('setting');
		await testMultiObject304NotModified('tag');
	});

	// PHP: testSinceAndVersionsFormat
	it('should handle since and versions format', async function() {
		await testSinceAndVersionsFormat('collection', 'since');
		await testSinceAndVersionsFormat('item', 'since');
		await testSinceAndVersionsFormat('search', 'since');
		await API.userClear(config.get('userID'));
		await testSinceAndVersionsFormat('collection', 'newer');
		await testSinceAndVersionsFormat('item', 'newer');
		await testSinceAndVersionsFormat('search', 'newer');
	});

	// PHP: testUploadUnmodified
	it('should reject upload without version', async function() {
		await testUploadUnmodified('collection');
		await testUploadUnmodified('item');
		await testUploadUnmodified('search');
	});

	// PHP: testTagsSince
	it('should handle tags since parameter', async function() {
		await testTagsSince('since');
		await API.userClear(config.get('userID'));
		await testTagsSince('newer');
	});

	// PHP: test_should_not_include_library_version_for_400
	it('should not include library version for 400', async function() {
		let json = await API.createItem('book', {}, 'json');
		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${json.version - 1}`
			]
		);
		assert400(response);
		assert.isNull(response.getHeader('Last-Modified-Version'));
	});

	// PHP: test_should_include_library_version_for_412
	it('should include library version for 412', async function() {
		let json = await API.createItem('book', {}, 'json');
		let libraryVersion = json.version;
		json.data.version--;
		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${json.version - 1}`
			]
		);
		assert412(response);
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);
	});

	// PHP: testPatchMissingObjectWithoutVersion
	it('should require version for patching missing object', async function() {
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([
				{
					key: 'AAAAAAAA',
					itemType: 'book'
				}
			]),
			['Content-Type: application/json']
		);
		assert428ForObject(response);
	});

	// PHP: testPatchExistingObjectWithoutVersion
	it('should require version for patching existing object', async function() {
		let json = await API.createItem('book', {}, 'jsonData');
		delete json.version;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert428ForObject(response);
	});

	// PHP: testPatchMissingObjectWithVersionHeader
	it('should reject patch missing object with version header', async function() {
		await _testPatchMissingObjectWithVersionHeader('collection');
		await _testPatchMissingObjectWithVersionHeader('item');
		await _testPatchMissingObjectWithVersionHeader('search');
	});

	// PHP: testPatchMissingObjectWithVersionProperty
	it('should reject patch missing object with version property', async function() {
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([
				{
					key: 'AAAAAAAA',
					version: 5,
					itemType: 'book'
				}
			]),
			['Content-Type: application/json']
		);
		assert404ForObject(response, "Item doesn't exist (expected version 5; use 0 instead)");
	});

	// PHP: testPatchMissingObjectWithVersion0Header
	it('should allow patch missing object with version 0 header', async function() {
		await _testPatchMissingObjectWithVersion0Header('collection');
		await _testPatchMissingObjectWithVersion0Header('item');
		await _testPatchMissingObjectWithVersion0Header('search');
	});

	// PHP: testPatchMissingObjectWithVersion0Property
	it('should allow patch missing object with version 0 property', async function() {
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([
				{
					key: 'AAAAAAAA',
					version: 0,
					itemType: 'book'
				}
			]),
			['Content-Type: application/json']
		);
		assert200(response);
	});

	// PHP: testPatchExistingObjectWithVersion0Header
	it('should reject patch existing object with version 0 header', async function() {
		await _testPatchExistingObjectWithVersion0Header('collection');
		await _testPatchExistingObjectWithVersion0Header('item');
		await _testPatchExistingObjectWithVersion0Header('search');
	});

	// PHP: testPatchExistingObjectWithVersion0Property
	it('should reject patch existing object with version 0 property', async function() {
		let json = await API.createItem('book', {}, 'jsonData');
		json.title = 'Test';
		json.version = 0;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert412ForObject(response);
	});

	// PHP: testPatchExistingObjectWithOldVersionHeader
	it('should reject patch existing object with old version header', async function() {
		await _testPatchExistingObjectWithOldVersionHeader('collection');
		await _testPatchExistingObjectWithOldVersionHeader('item');
		await _testPatchExistingObjectWithOldVersionHeader('search');
	});

	// PHP: testPatchExistingObjectWithOldVersionProperty
	it('should reject patch existing object with old version property', async function() {
		let json = await API.createItem('book', {}, 'jsonData');
		let oldVersion = json.version;
		json.title = 'Test';
		json.version = oldVersion - 1;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert412ForObject(response);
	});

	// PHP: testPostExistingLibraryWithVersion0Header
	it('should reject post to existing library with version 0 header', async function() {
		await API.createItem('book', {});
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([
				{
					itemType: 'book'
				}
			]),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 0'
			]
		);
		assert412(response);
	});

	// PHP: testPatchMissingObjectsWithVersion0Property
	it('should allow patch multiple missing objects with version 0', async function() {
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([
				{ key: 'AAAAAAAA', version: 0, itemType: 'book' },
				{ key: 'BBBBBBBB', version: 0, itemType: 'book' }
			]),
			['Content-Type: application/json']
		);
		assert200(response);
	});

	// PHP: testPatchMissingObjectsWithVersion
	it('should handle patch missing objects with different versions', async function() {
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([
				{ key: 'AAAAAAAA', version: 0, itemType: 'book' },
				{ key: 'BBBBBBBB', version: 5, itemType: 'book' }
			]),
			['Content-Type: application/json']
		);
		assert200(response);
		assert200ForObject(response, false, 0);
		// Second object should fail with wrong version
		let json = API.getJSONFromResponse(response);
		assert.property(json.failed, '1');
	});

	// PHP: testPatchExistingObjectsWithVersion0Property
	it('should reject patch existing objects with version 0', async function() {
		let json1 = await API.createItem('book', {}, 'jsonData');
		let json2 = await API.createItem('book', {}, 'jsonData');
		json1.version = 0;
		json2.version = 0;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json1, json2]),
			['Content-Type: application/json']
		);
		assert200(response);
		let result = API.getJSONFromResponse(response);
		assert.property(result.failed, '0');
		assert.property(result.failed, '1');
	});

	// PHP: testPatchExistingObjectsWithoutVersionWithHeader
	it('should allow patch existing objects without version with header', async function() {
		let json1 = await API.createItem('book', {}, 'jsonData');
		let json2 = await API.createItem('book', {}, 'jsonData');
		let libraryVersion = Math.max(json1.version, json2.version);
		delete json1.version;
		delete json2.version;
		json1.title = 'Test 1';
		json2.title = 'Test 2';
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json1, json2]),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${libraryVersion}`
			]
		);
		assert200(response);
	});

	// PHP: testPatchExistingObjectsWithoutVersionWithoutHeader
	it('should require header for patch existing objects without version', async function() {
		let json1 = await API.createItem('book', {}, 'jsonData');
		let json2 = await API.createItem('book', {}, 'jsonData');
		delete json1.version;
		delete json2.version;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json1, json2]),
			['Content-Type: application/json']
		);
		assert428ForObject(response);
	});

	// PHP: testPostToSettingsWithOutdatedVersionHeader
	it('should reject post to settings with outdated version', async function() {
		await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify({
				tagColors: {
					value: [{ name: 'A', color: '#990000' }],
					version: 0
				}
			}),
			['Content-Type: application/json']
		);

		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify({
				tagColors: {
					value: [{ name: 'B', color: '#CC9933' }],
					version: 0
				}
			}),
			['Content-Type: application/json']
		);
		assert412(response);
	});

	// PHP: testPatchExistingObjectsWithOldVersion0Property
	it('should reject patch existing objects with old version 0', async function() {
		let json1 = await API.createItem('book', {}, 'jsonData');
		let json2 = await API.createItem('book', {}, 'jsonData');
		json1.version = 0;
		json2.version = 0;
		json1.title = 'Test 1';
		json2.title = 'Test 2';
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json1, json2]),
			['Content-Type: application/json']
		);
		assert200(response);
		let result = API.getJSONFromResponse(response);
		assert.property(result.failed, '0');
		assert.property(result.failed, '1');
	});

	// Helper functions

	async function testSingleObjectLastModifiedVersion(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let objectKey;

		switch (objectType) {
			case 'collection':
				objectKey = await API.createCollection('Name', {}, 'key');
				break;
			case 'item':
				objectKey = await API.createItem('book', { title: 'Title' }, 'key');
				break;
			case 'search':
				objectKey = await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key');
				break;
		}

		// JSON: Check version consistency
		let response = await API.userGet(config.get('userID'), `${objectTypePlural}/${objectKey}`);
		assert200(response);
		let objectVersion = parseInt(response.getHeader('Last-Modified-Version'));
		let json = API.getJSONFromResponse(response);
		assert.equal(json.version, objectVersion);
		assert.equal(json.data.version, objectVersion);

		// Atom: Check version consistency
		response = await API.userGet(config.get('userID'), `${objectTypePlural}/${objectKey}?content=json`);
		assert200(response);
		objectVersion = parseInt(response.getHeader('Last-Modified-Version'));
		let xml = API.getXMLFromResponse(response);
		let atomData = API.parseDataFromAtomEntry(xml);
		let jsonData = JSON.parse(atomData.content);
		assert.equal(jsonData.version, objectVersion);
		assert.equal(parseInt(atomData.version), objectVersion);

		// Get library version
		response = await API.userGet(config.get('userID'), `${objectTypePlural}?limit=1`);
		assert200(response);
		let libraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.equal(libraryVersion, objectVersion);

		// Modify object
		let data = json.data;
		modifyJSONObject(objectType, data);

		// Update without version should fail
		delete data.version;
		response = await API.userPut(
			config.get('userID'),
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(data)
		);
		assert428(response);

		// Update with old version should fail
		response = await API.userPut(
			config.get('userID'),
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(data),
			[`If-Unmodified-Since-Version: ${objectVersion - 1}`]
		);
		assert412(response);

		// Update with correct version
		response = await API.userPut(
			config.get('userID'),
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(data),
			[`If-Unmodified-Since-Version: ${objectVersion}`]
		);
		assert204(response);
		let newObjectVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newObjectVersion, objectVersion);

		// Update with JSON version property
		modifyJSONObject(objectType, data);
		data.version = newObjectVersion;
		response = await API.userPut(
			config.get('userID'),
			`${objectTypePlural}/${objectKey}`,
			JSON.stringify(data)
		);
		assert204(response);
		let newObjectVersion2 = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newObjectVersion2, newObjectVersion);

		// Check library version matches
		response = await API.userGet(config.get('userID'), `${objectTypePlural}?limit=1`);
		assert200(response);
		let newLibraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.equal(newObjectVersion2, newLibraryVersion);
	}

	function modifyJSONObject(objectType, json) {
		switch (objectType) {
			case 'collection':
				json.name = 'New Name ' + Date.now();
				break;
			case 'item':
				json.title = 'New Title ' + Date.now();
				break;
			case 'search':
				json.name = 'New Name ' + Date.now();
				break;
		}
	}

	async function testMultiObjectLastModifiedVersion(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userGet(config.get('userID'), `${objectTypePlural}?limit=1`);
		let version = response.getHeader('Last-Modified-Version');
		assert.isNotNull(version);

		let json;
		switch (objectType) {
			case 'collection':
				json = { name: 'Name' };
				break;
			case 'item':
				json = await API.getItemTemplate('book');
				break;
			case 'search':
				json = {
					name: 'Name',
					conditions: [{ condition: 'title', operator: 'contains', value: 'test' }]
				};
				break;
		}

		response = await API.userPost(
			config.get('userID'),
			objectTypePlural,
			JSON.stringify([json]),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert200(response);
		let newVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newVersion, parseInt(version));
	}

	async function testMultiObject304NotModified(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		if (objectType === 'setting') {
			await API.userPost(
				config.get('userID'),
				'settings',
				JSON.stringify({
					tagColors: { value: [{ name: 'A', color: '#990000' }], version: 0 }
				}),
				['Content-Type: application/json']
			);
		} else if (objectType === 'tag') {
			await API.createItem('book', { tags: [{ tag: 'test' }] });
		} else {
			switch (objectType) {
				case 'collection':
					await API.createCollection('Name', {}, 'key');
					break;
				case 'item':
					await API.createItem('book', {}, 'key');
					break;
				case 'search':
					await API.createSearch('Name', [
						{ condition: 'title', operator: 'contains', value: 'test' }
					], 'key');
					break;
			}
		}

		let response = await API.userGet(config.get('userID'), objectTypePlural);
		assert200(response);
		let version = response.getHeader('Last-Modified-Version');

		response = await API.userGet(
			config.get('userID'),
			objectTypePlural,
			[`If-Modified-Since-Version: ${version}`]
		);
		assert304(response);
	}

	async function testSinceAndVersionsFormat(objectType, param) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let keys = [];

		for (let i = 0; i < 3; i++) {
			let key;
			switch (objectType) {
				case 'collection':
					key = await API.createCollection('Name', {}, 'key');
					break;
				case 'item':
					key = await API.createItem('book', {}, 'key');
					break;
				case 'search':
					key = await API.createSearch('Name', [
						{ condition: 'title', operator: 'contains', value: 'test' }
					], 'key');
					break;
			}
			keys.push(key);
		}

		let response = await API.userGet(config.get('userID'), `${objectTypePlural}?format=versions`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 3);

		// Get version after first object
		response = await API.userGet(config.get('userID'), `${objectTypePlural}/${keys[0]}`);
		let version1 = parseInt(response.getHeader('Last-Modified-Version'));

		// Request objects since version 1
		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?${param}=${version1}&format=versions`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 2);
		assert.notProperty(json, keys[0]);
		assert.property(json, keys[1]);
		assert.property(json, keys[2]);
	}

	async function testUploadUnmodified(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let key;

		switch (objectType) {
			case 'collection':
				key = await API.createCollection('Name', {}, 'key');
				break;
			case 'item':
				key = await API.createItem('book', {}, 'key');
				break;
			case 'search':
				key = await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key');
				break;
		}

		let response = await API.userGet(config.get('userID'), `${objectTypePlural}/${key}`);
		let json = API.getJSONFromResponse(response);

		// Upload without changes
		response = await API.userPost(
			config.get('userID'),
			objectTypePlural,
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);
		let result = API.getJSONFromResponse(response);
		assert.property(result, 'unchanged');
	}

	async function testTagsSince(param) {
		await API.createItem('book', { tags: [{ tag: 'foo' }] });

		let response = await API.userGet(config.get('userID'), 'items?limit=1');
		let version1 = parseInt(response.getHeader('Last-Modified-Version'));

		await API.createItem('book', { tags: [{ tag: 'bar' }] });

		response = await API.userGet(config.get('userID'), `tags?${param}=${version1}`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].tag, 'bar');
	}

	// PATCH with version header > 0 to a missing object is a 404
	async function _testPatchMissingObjectWithVersionHeader(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json = await API.createUnsavedDataObject(objectType);

		let response = await API.userPatch(
			config.get('userID'),
			`${objectTypePlural}/TPMBJWVH`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 123'
			]
		);
		assert404(response);
	}

	// PATCH to a missing object with version 0 header is a 204
	async function _testPatchMissingObjectWithVersion0Header(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json = await API.createUnsavedDataObject(objectType);

		let response = await API.userPatch(
			config.get('userID'),
			`${objectTypePlural}/TPMBWVZH`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 0'
			]
		);
		assert204(response);
	}

	// PATCH to an existing object with version header 0 is 412
	async function _testPatchExistingObjectWithVersion0Header(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let key = await API.createDataObject(objectType, {}, 'key');
		let json = await API.createUnsavedDataObject(objectType);

		let response = await API.userPatch(
			config.get('userID'),
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 0'
			]
		);
		assert412(response);
	}

	// PATCH to an existing object with version header < current version is 412
	async function _testPatchExistingObjectWithOldVersionHeader(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let key = await API.createDataObject(objectType, {}, 'key');
		let json = await API.createUnsavedDataObject(objectType);

		let response = await API.userPatch(
			config.get('userID'),
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 1'
			]
		);
		assert412(response);
	}
});
