/**
 * Version tests for API v2
 * Port of tests/remote/tests/API/2/VersionTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert304,
	assert412,
	assert412ForObject,
	assert428,
	assert428ForObject,
	assertNumResults
} from '../../assertions2.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Versioning (API v2)', function() {
	this.timeout(60000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	beforeEach(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testSingleObjectLastModifiedVersion
	it('should track single object last modified version for collection', async function() {
		await testSingleObjectLastModifiedVersion('collection');
	});

	it('should track single object last modified version for item', async function() {
		await testSingleObjectLastModifiedVersion('item');
	});

	it('should track single object last modified version for search', async function() {
		await testSingleObjectLastModifiedVersion('search');
	});

	// PHP: testMultiObjectLastModifiedVersion
	it('should track multi object last modified version for collection', async function() {
		await testMultiObjectLastModifiedVersion('collection');
	});

	it('should track multi object last modified version for item', async function() {
		await testMultiObjectLastModifiedVersion('item');
	});

	it('should track multi object last modified version for search', async function() {
		await testMultiObjectLastModifiedVersion('search');
	});

	// PHP: testMultiObject304NotModified
	it('should return 304 not modified for collection', async function() {
		await testMultiObject304NotModified('collection');
	});

	it('should return 304 not modified for item', async function() {
		await testMultiObject304NotModified('item');
	});

	it('should return 304 not modified for search', async function() {
		await testMultiObject304NotModified('search');
	});

	it('should return 304 not modified for tag', async function() {
		await testMultiObject304NotModified('tag');
	});

	// PHP: testNewerAndVersionsFormat
	it('should handle newer and versions format for collection', async function() {
		await testNewerAndVersionsFormat('collection');
	});

	it('should handle newer and versions format for item', async function() {
		await testNewerAndVersionsFormat('item');
	});

	it('should handle newer and versions format for search', async function() {
		await testNewerAndVersionsFormat('search');
	});

	// PHP: testUploadUnmodified
	it('should upload unmodified collection', async function() {
		await testUploadUnmodified('collection');
	});

	it('should upload unmodified item', async function() {
		await testUploadUnmodified('item');
	});

	it('should upload unmodified search', async function() {
		await testUploadUnmodified('search');
	});

	// PHP: testNewerTags
	it('should handle newer tags', async function() {
		let tags1 = ['a', 'aa', 'b'];
		let tags2 = ['b', 'c', 'cc'];

		let xml1 = await API.createItem('book', {
			tags: tags1.map(tag => ({ tag }))
		}, 'atom');
		let data1 = API.parseDataFromAtomEntry(xml1);

		let xml2 = await API.createItem('book', {
			tags: tags2.map(tag => ({ tag }))
		}, 'atom');
		let data2 = API.parseDataFromAtomEntry(xml2);

		// Only newly added tags should be included in newer,
		// not previously added tags or tags added to items
		let response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&newer=${data1.version}`
		);
		assertNumResults(response, 2);

		// Deleting an item shouldn't update associated tag versions
		response = await API.userDelete(
			config.get('userID'),
			`items/${data1.key}?key=${config.get('apiKey')}`,
			[`If-Unmodified-Since-Version: ${data1.version}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&newer=${data1.version}`
		);
		assertNumResults(response, 2);
		let libraryVersion = response.getHeader('Last-Modified-Version');

		response = await API.userGet(
			config.get('userID'),
			`tags?key=${config.get('apiKey')}&newer=${libraryVersion}`
		);
		assertNumResults(response, 0);
	});
});

async function testSingleObjectLastModifiedVersion(objectType) {
	let objectTypePlural = API.getPluralObjectType(objectType);
	let keyProp = objectType + 'Key';
	let versionProp = objectType + 'Version';

	let objectKey;
	switch (objectType) {
		case 'collection':
			objectKey = await API.createCollection('Name', false, 'key');
			break;
		case 'item':
			objectKey = await API.createItem('book', { title: 'Title' }, 'key');
			break;
		case 'search':
			objectKey = await API.createSearch(
				'Name',
				[{ condition: 'title', operator: 'contains', value: 'test' }],
				'key'
			);
			break;
	}

	// Make sure all three instances of the object version
	// (Last-Modified-Version, zapi:version, and the JSON
	// {objectType}Version property match the library version
	let response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}&content=json`
	);
	assert200(response);
	let objectVersion = response.getHeader('Last-Modified-Version');
	let xml = API.getXMLFromResponse(response);
	let data = API.parseDataFromAtomEntry(xml);
	let json = JSON.parse(data.content);
	assert.equal(json[versionProp], objectVersion);
	assert.equal(data.version, objectVersion);

	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}&limit=1`
	);
	assert200(response);
	let libraryVersion = response.getHeader('Last-Modified-Version');

	assert.equal(objectVersion, libraryVersion);

	modifyJSONObject(objectType, json);

	// No If-Unmodified-Since-Version or JSON version property
	delete json[versionProp];
	response = await API.userPut(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
		JSON.stringify(json)
	);
	assert428(response);

	// Out of date version
	response = await API.userPut(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
		JSON.stringify(json),
		[`If-Unmodified-Since-Version: ${objectVersion - 1}`]
	);
	assert412(response);

	// Update with version header
	response = await API.userPut(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
		JSON.stringify(json),
		[`If-Unmodified-Since-Version: ${objectVersion}`]
	);
	assert204(response);
	let newObjectVersion = response.getHeader('Last-Modified-Version');
	assert.isAbove(parseInt(newObjectVersion), parseInt(objectVersion));

	// Update object with JSON version property
	modifyJSONObject(objectType, json);
	json[versionProp] = parseInt(newObjectVersion);
	response = await API.userPut(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
		JSON.stringify(json)
	);
	assert204(response);
	let newObjectVersion2 = response.getHeader('Last-Modified-Version');
	assert.isAbove(parseInt(newObjectVersion2), parseInt(newObjectVersion));

	// Make sure new library version matches new object version
	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}&limit=1`
	);
	assert200(response);
	let newLibraryVersion = response.getHeader('Last-Modified-Version');
	assert.equal(newObjectVersion2, newLibraryVersion);

	// Create an item to increase the library version, and make sure
	// original object version stays the same
	await API.createItem('book', { title: 'Title' }, 'key');
	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}&limit=1`
	);
	assert200(response);
	let checkVersion = response.getHeader('Last-Modified-Version');
	assert.equal(newLibraryVersion, checkVersion);

	//
	// Delete object
	//

	// No If-Unmodified-Since-Version
	response = await API.userDelete(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`
	);
	assert428(response);

	// Outdated If-Unmodified-Since-Version
	response = await API.userDelete(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
		[`If-Unmodified-Since-Version: ${objectVersion}`]
	);
	assert412(response);

	// Delete object
	response = await API.userDelete(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`,
		[`If-Unmodified-Since-Version: ${newObjectVersion2}`]
	);
	assert204(response);
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
	let objectKeyProp = objectType + 'Key';
	let objectVersionProp = objectType + 'Version';

	let response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}&limit=1`
	);
	let version = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version));

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
				conditions: [
					{ condition: 'title', operator: 'contains', value: 'test' }
				]
			};
			break;
	}

	// Outdated library version
	response = await API.userPost(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`,
		JSON.stringify({ [objectTypePlural]: [json] }),
		[
			'Content-Type: application/json',
			`If-Unmodified-Since-Version: ${version - 1}`
		]
	);
	assert412(response);

	// Make sure version didn't change during failure
	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}&limit=1`
	);
	assert.equal(response.getHeader('Last-Modified-Version'), version);

	// Create a new object, using library timestamp
	response = await API.userPost(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`,
		JSON.stringify({ [objectTypePlural]: [json] }),
		[
			'Content-Type: application/json',
			`If-Unmodified-Since-Version: ${version}`
		]
	);
	assert200(response);
	let version2 = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version2));
	// Version should be incremented on new object
	assert.isAbove(parseInt(version2), parseInt(version));
	let objectKey = API.getFirstSuccessKeyFromResponse(response);

	// Check single-object request
	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}&content=json`
	);
	assert200(response);
	version = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version));
	assert.equal(version, version2);
	json = JSON.parse(API.getContentFromResponse(response));

	// Modify object
	json[objectKeyProp] = objectKey;
	switch (objectType) {
		case 'collection':
			json.name = 'New Name';
			break;
		case 'item':
			json.title = 'New Title';
			break;
		case 'search':
			json.name = 'New Name';
			break;
	}

	// No If-Unmodified-Since-Version or object version property
	delete json[objectVersionProp];
	response = await API.userPost(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`,
		JSON.stringify({ [objectTypePlural]: [json] }),
		['Content-Type: application/json']
	);
	assert428ForObject(response);

	// Outdated object version property
	json[objectVersionProp] = parseInt(version) - 1;
	response = await API.userPost(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`,
		JSON.stringify({ [objectTypePlural]: [json] }),
		['Content-Type: application/json']
	);
	let objectTypeCapitalized = objectType.charAt(0).toUpperCase() + objectType.slice(1);
	assert412ForObject(
		response,
		`${objectTypeCapitalized} has been modified since specified version (expected ${json[objectVersionProp]}, found ${version})`
	);

	// Modify object, using object version property
	json[objectVersionProp] = parseInt(version);
	response = await API.userPost(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`,
		JSON.stringify({ [objectTypePlural]: [json] }),
		['Content-Type: application/json']
	);
	assert200(response);
	// Version should be incremented on modified object
	let version3 = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version3));
	assert.isAbove(parseInt(version3), parseInt(version2));

	// Check library version
	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`
	);
	version = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version));
	assert.equal(version, version3);

	// Check single-object request
	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}/${objectKey}?key=${config.get('apiKey')}`
	);
	version = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version));
	assert.equal(version, version3);

	// TODO: Version should be incremented on deleted item
}

async function testMultiObject304NotModified(objectType) {
	let objectTypePlural = API.getPluralObjectType(objectType);

	let response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`
	);
	let version = response.getHeader('Last-Modified-Version');
	assert.isTrue(/^\d+$/.test(version));

	response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}`,
		[`If-Modified-Since-Version: ${version}`]
	);
	assert304(response);
}

async function testNewerAndVersionsFormat(objectType) {
	let objectTypePlural = API.getPluralObjectType(objectType);

	let xmlArray = [];
	switch (objectType) {
		case 'collection':
			xmlArray.push(await API.createCollection('Name', false, 'atom'));
			xmlArray.push(await API.createCollection('Name', false, 'atom'));
			xmlArray.push(await API.createCollection('Name', false, 'atom'));
			break;
		case 'item':
			xmlArray.push(await API.createItem('book', { title: 'Title' }, 'atom'));
			xmlArray.push(await API.createItem('book', { title: 'Title' }, 'atom'));
			xmlArray.push(await API.createItem('book', { title: 'Title' }, 'atom'));
			break;
		case 'search':
			xmlArray.push(await API.createSearch(
				'Name',
				[{ condition: 'title', operator: 'contains', value: 'test' }],
				'atom'
			));
			xmlArray.push(await API.createSearch(
				'Name',
				[{ condition: 'title', operator: 'contains', value: 'test' }],
				'atom'
			));
			xmlArray.push(await API.createSearch(
				'Name',
				[{ condition: 'title', operator: 'contains', value: 'test' }],
				'atom'
			));
			break;
	}

	let objects = [];
	for (let xml of xmlArray) {
		let data = API.parseDataFromAtomEntry(xml);
		objects.push({
			key: data.key,
			version: data.version
		});
	}

	let firstVersion = objects[0].version;

	let response = await API.userGet(
		config.get('userID'),
		`${objectTypePlural}?key=${config.get('apiKey')}&format=versions&newer=${firstVersion}`
	);

	assert200(response);
	let json = JSON.parse(response.getBody());
	assert.isNotNull(json);

	let keys = Object.keys(json);

	assert.equal(keys.shift(), objects[2].key);
	assert.equal(Object.values(json).shift(), parseInt(objects[2].version));
	assert.equal(keys.shift(), objects[1].key);
	assert.equal(Object.values(json)[1], parseInt(objects[1].version));
	assert.lengthOf(keys, 0);
}

async function testUploadUnmodified(objectType) {
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

	let versionNode = xpathSelect(xml, '//atom:entry/zapi:version/text()', true);
	let version = parseInt(versionNode.nodeValue);
	assert.notEqual(version, 0);

	let data = API.parseDataFromAtomEntry(xml);
	let json = JSON.parse(data.content);

	let response = await API.userPut(
		config.get('userID'),
		`${objectTypePlural}/${data.key}?key=${config.get('apiKey')}`,
		JSON.stringify(json)
	);
	assert204(response);
	assert.equal(parseInt(response.getHeader('Last-Modified-Version')), version);

	switch (objectType) {
		case 'collection':
			xml = await API.getCollectionXML(data.key);
			break;
		case 'item':
			xml = await API.getItemXML(data.key);
			break;
		case 'search':
			xml = await API.getSearchXML(data.key);
			break;
	}
	data = API.parseDataFromAtomEntry(xml);
	assert.equal(parseInt(data.version), version);
}
