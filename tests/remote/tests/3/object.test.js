/**
 * Object API tests
 * Port of tests/remote/tests/API/3/ObjectTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert204,
	assert400,
	assert200ForObject,
	assert400ForObject,
	assert413ForObject,
	assertTotalResults,
	assertNumResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Object', function () {
	this.timeout(30000);

	beforeEach(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testMultiObjectGet
	it('should get multiple objects', async function () {
		await testMultiObjectGet('collection');
		await testMultiObjectGet('item');
		await testMultiObjectGet('search');
	});

	// PHP: testCreateByPut
	it('should create object by PUT', async function () {
		await testCreateByPut('collection');
		await testCreateByPut('item');
		await testCreateByPut('search');
	});

	// PHP: testSingleObjectDelete
	it('should delete single object', async function () {
		await testSingleObjectDelete('collection');
		await testSingleObjectDelete('item');
		await testSingleObjectDelete('search');
	});

	// PHP: testMultiObjectDelete
	it('should delete multiple objects', async function () {
		await testMultiObjectDelete('collection');
		await testMultiObjectDelete('item');
		await testMultiObjectDelete('search');
	});

	// Helper functions

	async function testMultiObjectGet(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let keyProp = objectType + 'Key';

		let keys = [];
		switch (objectType) {
			case 'collection':
				keys.push(await API.createCollection('Name', {}, 'key'));
				keys.push(await API.createCollection('Name', {}, 'key'));
				await API.createCollection('Name', {}, 'key');
				break;
			case 'item':
				keys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				keys.push(await API.createItem('book', { title: 'Title' }, 'key'));
				await API.createItem('book', { title: 'Title' }, 'key');
				break;
			case 'search':
				keys.push(await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key'));
				keys.push(await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key'));
				await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key');
				break;
		}

		// HEAD request should include Total-Results
		let response = await API.userHead(
			config.get('userID'),
			`${objectTypePlural}?${keyProp}=${keys.join(',')}`
		);
		assert200(response);
		assertTotalResults(response, keys.length);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?${keyProp}=${keys.join(',')}`
		);
		assert200(response);
		assertNumResults(response, keys.length);

		// Trailing comma in keyParam parameter
		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?${keyProp}=${keys.join(',')},`
		);
		assert200(response);
		assertNumResults(response, keys.length);
	}

	async function testCreateByPut(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let json;

		switch (objectType) {
			case 'collection':
				json = { name: 'Test' };
				break;
			case 'item':
				json = await API.getItemTemplate('book');
				break;
			case 'search':
				json = {
					name: 'Test',
					conditions: [
						{ condition: 'title', operator: 'contains', value: 'test' }
					]
				};
				break;
		}

		let key = API.getKey();
		let response = await API.userPut(
			config.get('userID'),
			`${objectTypePlural}/${key}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 0'
			]
		);
		assert204(response);
	}

	async function testSingleObjectDelete(objectType) {
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

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}/${key}`
		);
		assert200(response);
		let version = parseInt(response.getHeader('Last-Modified-Version'));

		response = await API.userDelete(
			config.get('userID'),
			`${objectTypePlural}/${key}`,
			[`If-Unmodified-Since-Version: ${version}`]
		);
		assert204(response);
	}

	async function testMultiObjectDelete(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);
		let keys = [];

		switch (objectType) {
			case 'collection':
				keys.push(await API.createCollection('Name', {}, 'key'));
				keys.push(await API.createCollection('Name', {}, 'key'));
				break;
			case 'item':
				keys.push(await API.createItem('book', {}, 'key'));
				keys.push(await API.createItem('book', {}, 'key'));
				break;
			case 'search':
				keys.push(await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key'));
				keys.push(await API.createSearch('Name', [
					{ condition: 'title', operator: 'contains', value: 'test' }
				], 'key'));
				break;
		}

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?format=versions`
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		let version = Math.max(...Object.values(json));

		response = await API.userDelete(
			config.get('userID'),
			`${objectTypePlural}?${objectType}Key=${keys.join(',')}`,
			[`If-Unmodified-Since-Version: ${version}`]
		);
		assert204(response);
	}

	// PHP: testDeleted
	it('should set trash state with PATCH', async function () {
		for (let type of ['collection', 'item', 'search']) {
			let json = await API.createDataObject(type);

			let data = [
				{
					key: json.key,
					version: json.version,
					deleted: true
				}
			];
			let response = await API.postObjects(type, data);
			assert200ForObject(response);
			let result = API.getJSONFromResponse(response);

			assert.property(result.successful[0].data, 'deleted');
			// TODO: Change to true in APIv4
			if (type === 'item') {
				assert.strictEqual(result.successful[0].data.deleted, 1);
			}
			else {
				assert.strictEqual(result.successful[0].data.deleted, true);
			}
		}
	});

	// PHP: test_patch_of_object_should_set_trash_state
	it('should set trash state with `deleted=true`', async function () {
		for (let type of ['collection', 'item', 'search']) {
			let json = await API.createDataObject(type);

			let data = [
				{
					key: json.key,
					version: json.version,
					deleted: true
				}
			];
			let response = await API.postObjects(type, data);
			assert200ForObject(response);
			let result = API.getJSONFromResponse(response);

			assert.property(result.successful[0].data, 'deleted', type);
			// TODO: Change to true in APIv4
			if (type === 'item') {
				assert.strictEqual(result.successful[0].data.deleted, 1, type);
			}
			else {
				assert.strictEqual(result.successful[0].data.deleted, true, type);
			}
		}
	});

	// PHP: test_patch_with_deleted_should_clear_trash_state
	it('should clear trash state with `deleted=false`', async function () {
		for (let type of ['collection', 'item', 'search']) {
			let json = await API.createDataObject(type, { deleted: true });
			// Verify it's in trash
			// TODO: Change to true in APIv4
			if (type === 'item') {
				assert.strictEqual(json.data.deleted, 1);
			}
			else {
				assert.strictEqual(json.data.deleted, true);
			}

			let data = [
				{
					key: json.key,
					version: json.version,
					deleted: false
				}
			];
			let response = await API.postObjects(type, data);
			assert200ForObject(response);
			let result = API.getJSONFromResponse(response);

			// When deleted is false, the property should not be present
			assert.notProperty(result.successful[0].data, 'deleted');
		}
	});

	// PHP: test_patch_of_object_in_trash_without_deleted_should_not_remove_it_from_trash
	it('should not remove from trash without deleted property', async function () {
		for (let type of ['collection', 'item', 'search']) {
			let json = await API.createDataObject(type, { deleted: true });

			// Modify without including deleted property
			let data = [
				{
					key: json.key,
					version: json.version
				}
			];

			// Add a field to modify based on type
			switch (type) {
				case 'collection':
					data[0].name = 'Modified Name';
					break;
				case 'item':
					data[0].title = 'Modified Title';
					break;
				case 'search':
					data[0].name = 'Modified Name';
					break;
			}

			let response = await API.postObjects(type, data);
			assert200ForObject(response);
			let result = API.getJSONFromResponse(response);

			// Object should still be in trash
			assert.property(result.successful[0].data, 'deleted');
			if (type === 'item') {
				assert.strictEqual(result.successful[0].data.deleted, 1);
			}
			else {
				assert.strictEqual(result.successful[0].data.deleted, true);
			}
		}
	});

	// PHP: testEmptyVersionsResponse
	it('should return empty versions response', async function () {
		let response = await API.userGet(
			config.get('userID'),
			'items?format=versions&since=0'
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.deepEqual(json, {});
	});

	// PHP: testResponseJSONPost
	it('should return proper JSON response for POST', async function () {
		for (let objectType of ['collection', 'item', 'search']) {
			await API.userClear(config.get('userID'));
			let objectTypePlural = API.getPluralObjectType(objectType);
			let json1, json2;

			switch (objectType) {
				case 'collection':
					json1 = { name: 'Test 1' };
					json2 = { name: 'Test 2' };
					break;
				case 'item':
					json1 = await API.getItemTemplate('book');
					json2 = await API.getItemTemplate('book');
					json1.title = 'Test 1';
					json2.title = 'Test 2';
					break;
				case 'search': {
					let conditions = [{ condition: 'title', operator: 'contains', value: 'value' }];
					json1 = { name: 'Test 1', conditions: conditions };
					json2 = { name: 'Test 2', conditions: conditions };
					break;
				}
			}

			let response = await API.userPost(
				config.get('userID'),
				objectTypePlural,
				JSON.stringify([json1, json2]),
				['Content-Type: application/json']
			);
			assert200(response);
			assert200ForObject(response, false, 0);
			assert200ForObject(response, false, 1);
		}
	});

	// PHP: testResponseJSONPut
	it('should return proper JSON response for PUT', async function () {
		for (let objectType of ['collection', 'item', 'search']) {
			await API.userClear(config.get('userID'));
			let objectTypePlural = API.getPluralObjectType(objectType);
			let json;

			switch (objectType) {
				case 'collection':
					json = { name: 'Test' };
					break;
				case 'item':
					json = await API.getItemTemplate('book');
					json.title = 'Test';
					break;
				case 'search':
					json = { name: 'Test', conditions: [{ condition: 'title', operator: 'contains', value: 'value' }] };
					break;
			}

			let key = API.getKey();
			let response = await API.userPut(
				config.get('userID'),
				`${objectTypePlural}/${key}`,
				JSON.stringify(json),
				['Content-Type: application/json', 'If-Unmodified-Since-Version: 0']
			);
			assert204(response);
		}
	});

	// PHP: testPartialWriteFailure
	it('should handle partial write failure', async function () {
		for (let objectType of ['collection', 'item', 'search']) {
			await API.userClear(config.get('userID'));
			let objectTypePlural = API.getPluralObjectType(objectType);
			let json1, json2, json3;
			let tooLong = '1234567890'.repeat(6554);

			switch (objectType) {
				case 'collection':
					json1 = { name: 'Test' };
					json2 = { name: tooLong };
					json3 = { name: 'Test' };
					break;
				case 'item':
					json1 = await API.getItemTemplate('book');
					json2 = await API.getItemTemplate('book');
					json3 = await API.getItemTemplate('book');
					json2.title = tooLong;
					break;
				case 'search': {
					let conditions = [{ condition: 'title', operator: 'contains', value: 'value' }];
					json1 = { name: 'Test', conditions: conditions };
					json2 = { name: tooLong, conditions: conditions };
					json3 = { name: 'Test', conditions: conditions };
					break;
				}
			}

			let response = await API.userPost(
				config.get('userID'),
				objectTypePlural,
				JSON.stringify([json1, json2, json3]),
				['Content-Type: application/json']
			);
			assert200(response);
			assert200ForObject(response, false, 0);
			assert413ForObject(response, false, 1);
			assert200ForObject(response, false, 2);
		}
	});

	// PHP: testPartialWriteFailureWithUnchanged
	it('should handle partial write failure with `unchanged`', async function () {
		for (let objectType of ['collection', 'item', 'search']) {
			await API.userClear(config.get('userID'));
			let objectTypePlural = API.getPluralObjectType(objectType);
			let json1, json2, json3;
			let tooLong = '1234567890'.repeat(6554);

			switch (objectType) {
				case 'collection':
					json1 = await API.createCollection('Test', false, 'jsonData');
					json2 = { name: tooLong };
					json3 = { name: 'Test' };
					break;
				case 'item':
					json1 = await API.createItem('book', { title: 'Title' }, 'jsonData');
					json2 = await API.getItemTemplate('book');
					json3 = await API.getItemTemplate('book');
					json2.title = tooLong;
					break;
				case 'search': {
					let conditions = [{ condition: 'title', operator: 'contains', value: 'value' }];
					json1 = await API.createSearch('Name', conditions, 'jsonData');
					json2 = { name: tooLong, conditions: conditions };
					json3 = { name: 'Test', conditions: conditions };
					break;
				}
			}

			let response = await API.userPost(
				config.get('userID'),
				objectTypePlural,
				JSON.stringify([json1, json2, json3]),
				['Content-Type: application/json']
			);
			assert200(response);
			let result = API.getJSONFromResponse(response);
			assert.property(result, 'unchanged');
			assert.property(result.unchanged, '0');
			assert413ForObject(response, false, 1);
			assert200ForObject(response, false, 2);
		}
	});

	// PHP: testMultiObjectWriteInvalidObject
	it('should handle multi-object write with invalid object', async function () {
		for (let objectType of ['collection', 'item', 'search']) {
			await API.userClear(config.get('userID'));
			let objectTypePlural = API.getPluralObjectType(objectType);

			// Posting an object instead of array
			let response = await API.userPost(
				config.get('userID'),
				objectTypePlural,
				JSON.stringify({ foo: 'bar' }),
				['Content-Type: application/json']
			);
			assert400(response, 'Uploaded data must be a JSON array');

			// Posting array with invalid items
			response = await API.userPost(
				config.get('userID'),
				objectTypePlural,
				JSON.stringify([[], '']),
				['Content-Type: application/json']
			);
			assert400ForObject(response, `Invalid value for index 0 in uploaded data; expected JSON ${objectType} object`, 0);
			assert400ForObject(response, `Invalid value for index 1 in uploaded data; expected JSON ${objectType} object`, 1);
		}
	});
});
