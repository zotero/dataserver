/**
 * Object tests for API v2
 * Port of tests/remote/tests/API/2/ObjectTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert400,
	assert404,
	assert413ForObject,
	assertUnchangedForObject,
	assertNumResults,
	assertContentType
} from '../../assertions2.js';
import { setup } from '../../setup.js';

describe('Object (API v2)', function() {
	this.timeout(30000);

	beforeEach(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// Helper function for multi-object get test
	async function testMultiObjectGet(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let keyProp = objectType + 'Key';

		let keys = [];
		switch (objectType) {
			case 'collection':
				keys.push(await API.createCollection('Name', false, 'key'));
				keys.push(await API.createCollection('Name', false, 'key'));
				await API.createCollection('Name', false, 'key');
				break;
			case 'item':
				keys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				keys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				await API.createItem('book', { title: 'Title' }, 'key');
				break;
			case 'search':
				keys.push(await API.createSearch('Name', 'default', 'key'));
				keys.push(await API.createSearch('Name', 'default', 'key'));
				await API.createSearch('Name', 'default', 'key');
				break;
		}

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${keys.join(',')}`
		);
		assert200(response);
		assertNumResults(response, keys.length);

		// Trailing comma in keyProp parameter
		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${keys.join(',')},`
		);
		assert200(response);
		assertNumResults(response, keys.length);
	}

	// Helper function for single object delete test
	async function testSingleObjectDelete(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let xml;
		switch (objectType) {
			case 'collection':
				xml = await API.createCollection('Name', false, 'atom');
				break;
			case 'item':
				xml = await API.createItem('book', { title: 'Title' }, 'atom');
				break;
			case 'search':
				xml = await API.createSearch('Name', 'default', 'atom');
				break;
		}

		let data = API.parseDataFromAtomEntry(xml);
		let objectKey = data.key;
		let objectVersion = data.version;

		let response = await API.userDelete(
			config.get('userID'),
			`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
			[`If-Unmodified-Since-Version: ${objectVersion}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`
		);
		assert404(response);
	}

	// Helper function for multi-object delete test
	async function testMultiObjectDelete(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let keyProp = objectType + 'Key';

		let deleteKeys = [];
		let keepKeys = [];
		switch (objectType) {
			case 'collection':
				deleteKeys.push(await API.createCollection('Name', false, 'key'));
				deleteKeys.push(await API.createCollection('Name', false, 'key'));
				keepKeys.push(await API.createCollection('Name', false, 'key'));
				break;
			case 'item':
				deleteKeys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				deleteKeys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				keepKeys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				break;
			case 'search':
				deleteKeys.push(await API.createSearch('Name', 'default', 'key'));
				deleteKeys.push(await API.createSearch('Name', 'default', 'key'));
				keepKeys.push(await API.createSearch('Name', 'default', 'key'));
				break;
		}

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertNumResults(response, deleteKeys.length + keepKeys.length);
		let libraryVersion = response.getHeader('Last-Modified-Version');

		response = await API.userDelete(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${deleteKeys.join(',')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);
		libraryVersion = response.getHeader('Last-Modified-Version');

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertNumResults(response, keepKeys.length);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${keepKeys.join(',')}`
		);
		assert200(response);
		assertNumResults(response, keepKeys.length);

		// Add trailing comma to keyProp param, to test key parsing
		response = await API.userDelete(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${keepKeys.join(',')},`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertNumResults(response, 0);
	}

	// Helper function for partial write failure test
	async function testPartialWriteFailure(objectType) {
		await API.userClear(config.get('userID'));

		let objectTypePlural = API.getPluralObjectType(objectType);

		let json1, json2, json3;
		switch (objectType) {
			case 'collection':
				json1 = { name: 'Test' };
				json2 = { name: '1234567890'.repeat(6554) };
				json3 = { name: 'Test' };
				break;
			case 'item':
				json1 = await API.getItemTemplate('book');
				json2 = Object.assign({}, json1);
				json3 = Object.assign({}, json1);
				json2.title = '1234567890'.repeat(6554);
				break;
			case 'search':
				let conditions = [
					{ condition: 'title', operator: 'contains', value: 'value' }
				];
				json1 = { name: 'Test', conditions };
				json2 = { name: '1234567890'.repeat(6554), conditions };
				json3 = { name: 'Test', conditions };
				break;
		}

		let response = await API.userPost(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`,
			JSON.stringify({ [objectTypePlural]: [json1, json2, json3] }),
			['Content-Type: application/json']
		);
		assert200(response);
		assert200ForObject(response, false, 0);
		assert413ForObject(response, false, 1);
		assert200ForObject(response, false, 2);
		let json = API.getJSONFromResponse(response);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?format=keys&key=${config.get('apiKey')}`
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		for (let key of Object.values(json.success)) {
			assert.include(keys, key);
		}
	}

	// Helper function for partial write failure with unchanged test
	async function testPartialWriteFailureWithUnchanged(objectType) {
		await API.userClear(config.get('userID'));

		let objectTypePlural = API.getPluralObjectType(objectType);

		let json1, json2, json3;
		switch (objectType) {
			case 'collection':
				let collData = await API.createCollection('Test', false, 'data');
				json1 = JSON.parse(collData.content);
				json2 = { name: '1234567890'.repeat(6554) };
				json3 = { name: 'Test' };
				break;
			case 'item':
				let itemData = await API.createItem('book', { title: 'Title' }, 'data');
				json1 = JSON.parse(itemData.content);
				json2 = await API.getItemTemplate('book');
				json3 = Object.assign({}, json2);
				json2.title = '1234567890'.repeat(6554);
				break;
			case 'search':
				let conditions = [
					{ condition: 'title', operator: 'contains', value: 'value' }
				];
				let searchData = await API.createSearch('Name', conditions, 'data');
				json1 = JSON.parse(searchData.content);
				json2 = { name: '1234567890'.repeat(6554), conditions };
				json3 = { name: 'Test', conditions };
				break;
		}

		let response = await API.userPost(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`,
			JSON.stringify({ [objectTypePlural]: [json1, json2, json3] }),
			['Content-Type: application/json']
		);
		assert200(response);
		assertUnchangedForObject(response, 0);
		assert413ForObject(response, false, 1);
		assert200ForObject(response, false, 2);
		let json = API.getJSONFromResponse(response);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?format=keys&key=${config.get('apiKey')}`
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		for (let key of Object.values(json.success)) {
			assert.include(keys, key);
		}
	}

	// Helper function for multi-object write invalid object test
	async function testMultiObjectWriteInvalidObject(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userPost(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`,
			JSON.stringify([[]]),
			['Content-Type: application/json']
		);
		assert400(response, 'Uploaded data must be a JSON object');

		response = await API.userPost(
			config.get('userID'),
			`${objectTypePlural}?key=${config.get('apiKey')}`,
			JSON.stringify({ [objectTypePlural]: { foo: 'bar' } }),
			['Content-Type: application/json']
		);
		assert400(response, `'${objectTypePlural}' must be an array`);
	}

	// PHP: testMultiObjectGet
	it('should get multiple objects', async function() {
		await testMultiObjectGet('collection');
		await API.userClear(config.get('userID'));
		await testMultiObjectGet('item');
		await API.userClear(config.get('userID'));
		await testMultiObjectGet('search');
	});

	// PHP: testSingleObjectDelete
	it('should delete single object', async function() {
		await testSingleObjectDelete('collection');
		await API.userClear(config.get('userID'));
		await testSingleObjectDelete('item');
		await API.userClear(config.get('userID'));
		await testSingleObjectDelete('search');
	});

	// PHP: testMultiObjectDelete
	it('should delete multiple objects', async function() {
		await testMultiObjectDelete('collection');
		await API.userClear(config.get('userID'));
		await testMultiObjectDelete('item');
		await API.userClear(config.get('userID'));
		await testMultiObjectDelete('search');
	});

	// PHP: testDeleted
	it('should handle deleted endpoint', async function() {
		await API.userClear(config.get('userID'));

		// Create objects
		let objectKeys = {
			tag: ['foo', 'bar'],
			collection: [],
			item: [],
			search: []
		};

		objectKeys.collection.push(await API.createCollection('Name', false, 'key'));
		objectKeys.collection.push(await API.createCollection('Name', false, 'key'));
		objectKeys.collection.push(await API.createCollection('Name', false, 'key'));

		objectKeys.item.push(await API.createItem('book', {
			title: 'Title',
			tags: objectKeys.tag.map(tag => ({ tag }))
		}, 'key'));
		objectKeys.item.push(await API.createItem('book', { title: 'Title' }, 'key'));
		objectKeys.item.push(await API.createItem('book', { title: 'Title' }, 'key'));

		objectKeys.search.push(await API.createSearch('Name', 'default', 'key'));
		objectKeys.search.push(await API.createSearch('Name', 'default', 'key'));
		objectKeys.search.push(await API.createSearch('Name', 'default', 'key'));

		// Get library version
		let response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&limit=1`
		);
		let libraryVersion1 = response.getHeader('Last-Modified-Version');

		// Delete first object of each type
		async function deleteFirst(objectType, libraryVersion) {
			let objectTypePlural = API.getPluralObjectType(objectType);
			let keyProp = objectType + 'Key';
			let response = await API.userDelete(
				config.get('userID'),
				`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${objectKeys[objectType][0]}`,
				[`If-Unmodified-Since-Version: ${libraryVersion}`]
			);
			assert204(response);
			return response.getHeader('Last-Modified-Version');
		}

		let tempLibraryVersion = await deleteFirst('collection', libraryVersion1);
		tempLibraryVersion = await deleteFirst('item', tempLibraryVersion);
		tempLibraryVersion = await deleteFirst('search', tempLibraryVersion);
		let libraryVersion2 = tempLibraryVersion;

		// Delete second and third objects
		async function deleteRest(objectType, libraryVersion) {
			let objectTypePlural = API.getPluralObjectType(objectType);
			let keyProp = objectType + 'Key';
			let response = await API.userDelete(
				config.get('userID'),
				`${objectTypePlural}?key=${config.get('apiKey')}&${keyProp}=${objectKeys[objectType].slice(1).join(',')}`,
				[`If-Unmodified-Since-Version: ${libraryVersion}`]
			);
			assert204(response);
			return response.getHeader('Last-Modified-Version');
		}

		tempLibraryVersion = await deleteRest('collection', tempLibraryVersion);
		tempLibraryVersion = await deleteRest('item', tempLibraryVersion);
		let libraryVersion3 = await deleteRest('search', tempLibraryVersion);

		// Request all deleted objects
		response = await API.userGet(
			config.get('userID'),
			`deleted?key=${config.get('apiKey')}&newer=${libraryVersion1}`
		);
		assert200(response);
		let json = JSON.parse(response.getBody());
		let version = response.getHeader('Last-Modified-Version');
		assert.isNotNull(version);
		assertContentType(response, 'application/json');

		// Verify keys
		function verifyKeys(json, objectType, expectedKeys) {
			let objectTypePlural = API.getPluralObjectType(objectType);
			assert.property(json, objectTypePlural);
			assert.lengthOf(json[objectTypePlural], expectedKeys.length);
			for (let key of expectedKeys) {
				assert.include(json[objectTypePlural], key);
			}
		}

		verifyKeys(json, 'collection', objectKeys.collection);
		verifyKeys(json, 'item', objectKeys.item);
		verifyKeys(json, 'search', objectKeys.search);
		// Tags aren't deleted by removing from items
		verifyKeys(json, 'tag', []);

		// Request second and third deleted objects
		response = await API.userGet(
			config.get('userID'),
			`deleted?key=${config.get('apiKey')}&newer=${libraryVersion2}`
		);
		assert200(response);
		json = JSON.parse(response.getBody());
		version = response.getHeader('Last-Modified-Version');
		assert.isNotNull(version);
		assertContentType(response, 'application/json');

		// Verify keys for second and third
		verifyKeys(json, 'collection', objectKeys.collection.slice(1));
		verifyKeys(json, 'item', objectKeys.item.slice(1));
		verifyKeys(json, 'search', objectKeys.search.slice(1));
		// Tags aren't deleted by removing from items
		verifyKeys(json, 'tag', []);

		// Explicit tag deletion
		response = await API.userDelete(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&tag=${objectKeys.tag.join('%20||%20')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion3}`]
		);
		assert204(response);

		// Verify deleted tags
		response = await API.userGet(
			config.get('userID'),
			`deleted?key=${config.get('apiKey')}&newer=${libraryVersion3}`
		);
		assert200(response);
		json = JSON.parse(response.getBody());
		verifyKeys(json, 'tag', objectKeys.tag);
	});

	// PHP: testPartialWriteFailure
	it('should handle partial write failure', async function() {
		await testPartialWriteFailure('collection');
		await API.userClear(config.get('userID'));
		await testPartialWriteFailure('item');
		await API.userClear(config.get('userID'));
		await testPartialWriteFailure('search');
	});

	// PHP: testPartialWriteFailureWithUnchanged
	it('should handle partial write failure with unchanged', async function() {
		await testPartialWriteFailureWithUnchanged('collection');
		await API.userClear(config.get('userID'));
		await testPartialWriteFailureWithUnchanged('item');
		await API.userClear(config.get('userID'));
		await testPartialWriteFailureWithUnchanged('search');
	});

	// PHP: testMultiObjectWriteInvalidObject
	it('should reject invalid object in multi-object write', async function() {
		await testMultiObjectWriteInvalidObject('collection');
		await testMultiObjectWriteInvalidObject('item');
		await testMultiObjectWriteInvalidObject('search');
	});
});
