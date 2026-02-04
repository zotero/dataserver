/**
 * Item API tests
 * Port of tests/remote/tests/API/3/ItemTest.php
 */

import { assert } from 'chai';
import config from 'config';
import crypto from 'crypto';
import { API } from '../../api3.js';
import { assert200, assert204, assert400, assert400ForObject, assert409, assert409ForObject, assert413ForObject } from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Items', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		API.resetSchemaVersion();
		await API.setKeyUserPermission(config.get('apiKey'), 'notes', true);
		await API.setKeyUserPermission(config.get('apiKey'), 'write', true);
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	beforeEach(function() {
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
	});

	after(async function() {
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	// PHP: testNewEmptyBookItem
	it('should create new empty book item', async function() {
		let json = await API.createItem('book');
		let data = json.successful[0].data;

		assert.equal(data.itemType, 'book');
		assert.equal(data.title, '');
		assert.equal(data.date, '');
		assert.equal(data.place, '');
	});

	// PHP: testNewEmptyBookItemMultiple
	it('should create new empty book item multiple', async function() {
		let json = await API.getItemTemplate('book');

		let data = [];
		json.title = 'A';
		data.push({ ...json });

		json.title = 'B';
		data.push({ ...json });

		json.title = 'C';
		json.numPages = 200;
		data.push({ ...json });

		let response = await API.postItems(data);
		assert200(response);
		let libraryVersion = response.getHeader('Last-Modified-Version');
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(Object.keys(responseJSON.successful).length, 3);
		assert.equal(Object.keys(responseJSON.success).length, 3);

		for (let i = 0; i < 3; i++) {
			assert.equal(responseJSON.successful[i].key, responseJSON.successful[i].data.key);
			assert.equal(responseJSON.successful[i].version, libraryVersion);
			assert.equal(responseJSON.successful[i].data.version, libraryVersion);
			assert.equal(data[i].title, responseJSON.successful[i].data.title);
		}
		assert.equal(data[2].numPages, responseJSON.successful[2].data.numPages);

		let keys = Object.values(responseJSON.success);
		let items = await API.getItem(keys, 'json');
		let itemJSON = items.shift();
		assert.equal(itemJSON.data.title, 'A');
		itemJSON = items.shift();
		assert.equal(itemJSON.data.title, 'B');
		itemJSON = items.shift();
		assert.equal(itemJSON.data.title, 'C');
		assert.equal(itemJSON.data.numPages, 200);
	});

	// PHP: testEditBookItem
	it('should edit book item', async function() {
		let json = await API.createItem('book');
		let itemData = json.successful[0].data;
		let key = itemData.key;
		let version = itemData.version;

		let newTitle = 'New Title';
		let numPages = 100;
		let creatorType = 'author';
		let firstName = 'Firstname';
		let lastName = 'Lastname';

		itemData.title = newTitle;
		itemData.numPages = numPages;
		itemData.creators.push({
			creatorType: creatorType,
			firstName: firstName,
			lastName: lastName
		});

		let response = await API.userPut(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(itemData),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		let updatedItem = await API.getItem(key, 'json');
		let updatedData = updatedItem.data;

		assert.equal(updatedData.title, newTitle);
		assert.equal(updatedData.numPages, numPages);
		assert.equal(updatedData.creators[0].creatorType, creatorType);
		assert.equal(updatedData.creators[0].firstName, firstName);
		assert.equal(updatedData.creators[0].lastName, lastName);
	});

	// PHP: testDate
	it('should handle date', async function() {
		let date = 'Sept 18, 2012';
		let parsedDate = '2012-09-18';

		let json = await API.createItem('book', { date: date }, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.data.date, date);

		// meta.parsedDate (JSON)
		assert.equal(responseJSON.meta.parsedDate, parsedDate);

		// zapi:parsedDate (Atom)
		let xml = await API.getItem(key, 'atom');
		let parsedDateNode = xpathSelect(xml, '/atom:entry/zapi:parsedDate/text()', true);
		assert.equal(parsedDateNode ? parsedDateNode.nodeValue : '', parsedDate);
	});

	// PHP: testDateWithoutDay
	it('should handle date without day', async function() {
		let date = 'Sept 2012';
		let parsedDate = '2012-09';

		let json = await API.createItem('book', { date: date }, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.data.date, date);

		// meta.parsedDate (JSON)
		assert.equal(responseJSON.meta.parsedDate, parsedDate);

		// zapi:parsedDate (Atom)
		let xml = await API.getItem(key, 'atom');
		let parsedDateNode = xpathSelect(xml, '/atom:entry/zapi:parsedDate/text()', true);
		assert.equal(parsedDateNode ? parsedDateNode.nodeValue : '', parsedDate);
	});

	// PHP: testDateWithoutMonth
	it('should handle date without month', async function() {
		let date = '2012';
		let parsedDate = '2012';

		let json = await API.createItem('book', { date: date }, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.data.date, date);

		// meta.parsedDate (JSON)
		assert.equal(responseJSON.meta.parsedDate, parsedDate);

		// zapi:parsedDate (Atom)
		let xml = await API.getItem(key, 'atom');
		let parsedDateNode = xpathSelect(xml, '/atom:entry/zapi:parsedDate/text()', true);
		assert.equal(parsedDateNode ? parsedDateNode.nodeValue : '', parsedDate);
	});

	// PHP: testDateUnparseable
	it('should handle date unparseable', async function() {
		let json = await API.createItem('book', { date: 'n.d.' }, 'jsonData');
		let key = json.key;

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.data.date, 'n.d.');
		assert.notProperty(responseJSON.meta, 'parsedDate');

		// zapi:parsedDate (Atom) - should not exist
		let xml = await API.getItem(key, 'atom');
		let parsedDateNodes = xpathSelect(xml, '/atom:entry/zapi:parsedDate');
		assert.lengthOf(parsedDateNodes, 0);
	});

	// PHP: testDateAccessed8601
	it('should handle dateAccessed ISO 8601', async function() {
		let date = '2014-02-01T01:23:45Z';
		let data = await API.createItem('book', { accessDate: date }, 'jsonData');
		assert.equal(data.accessDate, date);
	});

	// PHP: testDateAccessed8601TZ
	it('should handle dateAccessed ISO 8601 TZ', async function() {
		let date = '2014-02-01T01:23:45-0400';
		let dateUTC = '2014-02-01T05:23:45Z';
		let data = await API.createItem('book', { accessDate: date }, 'jsonData');
		assert.equal(data.accessDate, dateUTC);
	});

	// PHP: testDateAccessedSQL
	it('should handle dateAccessed SQL', async function() {
		let date = '2014-02-01 01:23:45';
		let date8601 = '2014-02-01T01:23:45Z';
		let data = await API.createItem('book', { accessDate: date }, 'jsonData');
		assert.equal(date8601, data.accessDate);
	});

	// PHP: testDateAccessedInvalid
	it('should handle dateAccessed invalid', async function() {
		let date = 'February 1, 2014';
		let response = await API.get('items/new?itemType=book');
		let json = JSON.parse(response.getBody());
		json.accessDate = date;

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'accessDate' must be in ISO 8601 or UTC 'YYYY-MM-DD[ hh:mm:ss]' format or 'CURRENT_TIMESTAMP' (February 1, 2014)");
	});

	// PHP: testDateAddedNewItem8601
	it('should handle dateAdded new item ISO 8601', async function() {
		let dateAdded = '2013-03-03T21:33:53Z';
		let itemData = {
			title: 'Test',
			dateAdded: dateAdded
		};
		let data = await API.createItem('videoRecording', itemData, 'jsonData');
		assert.equal(data.dateAdded, dateAdded);
	});

	// PHP: testDateAddedNewItem8601TZ
	it('should handle dateAdded new item ISO 8601 TZ', async function() {
		let dateAdded = '2013-03-03T17:33:53-0400';
		let dateAddedUTC = '2013-03-03T21:33:53Z';
		let itemData = {
			title: 'Test',
			dateAdded: dateAdded
		};
		let data = await API.createItem('videoRecording', itemData, 'jsonData');
		assert.equal(data.dateAdded, dateAddedUTC);
	});

	// PHP: testDateAddedNewItemSQL
	it('should handle dateAdded new item SQL', async function() {
		let dateAdded = '2013-03-03 21:33:53';
		let dateAdded8601 = '2013-03-03T21:33:53Z';
		let itemData = {
			title: 'Test',
			dateAdded: dateAdded
		};
		let data = await API.createItem('videoRecording', itemData, 'jsonData');
		assert.equal(dateAdded8601, data.dateAdded);
	});

	// PHP: testDateModified
	it('should handle dateModified', async function() {
		let itemData = { title: 'Test' };
		let json = await API.createItem('videoRecording', itemData, 'jsonData');
		let objectKey = json.key;
		let dateModified1 = json.dateModified;

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		// If no explicit dateModified, use current timestamp
		json.title = 'Test 2';
		delete json.dateModified;
		let response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		json = (await API.getItem(objectKey, 'json')).data;
		let dateModified2 = json.dateModified;
		assert.notEqual(dateModified1, dateModified2);

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		// If existing dateModified, use current timestamp
		json.title = 'Test 3';
		json.dateModified = dateModified2.replace(/[TZ]/g, ' ').trim();
		response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		json = (await API.getItem(objectKey, 'json')).data;
		let dateModified3 = json.dateModified;
		assert.notEqual(dateModified2, dateModified3);

		// If explicit dateModified, use that
		let newDateModified = '2013-03-03T21:33:53Z';
		json.title = 'Test 4';
		json.dateModified = newDateModified;
		response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}`,
			JSON.stringify(json)
		);
		assert204(response);

		json = (await API.getItem(objectKey, 'json')).data;
		let dateModified4 = json.dateModified;
		assert.equal(newDateModified, dateModified4);
	});

	// PHP: testDateModifiedTmpZoteroClientHack
	it('should handle dateModified tmp zotero client hack', async function() {
		let itemData = { title: 'Test' };
		let json = await API.createItem('videoRecording', itemData, 'jsonData');
		let objectKey = json.key;
		let dateModified1 = json.dateModified;

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		// If no explicit dateModified, use current timestamp
		json.title = 'Test 2';
		delete json.dateModified;
		let response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}`,
			JSON.stringify(json),
			['User-Agent: Firefox']
		);
		assert204(response);

		json = (await API.getItem(objectKey, 'json')).data;
		let dateModified2 = json.dateModified;
		assert.notEqual(dateModified1, dateModified2);

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		// If dateModified provided and hasn't changed, use that
		json.title = 'Test 3';
		json.dateModified = dateModified2.replace(/[TZ]/g, ' ').trim();
		response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}`,
			JSON.stringify(json),
			['User-Agent: Firefox']
		);
		assert204(response);

		json = (await API.getItem(objectKey, 'json')).data;
		assert.equal(dateModified2, json.dateModified);

		// If dateModified is provided and has changed, use that
		let newDateModified = '2013-03-03T21:33:53Z';
		json.title = 'Test 4';
		json.dateModified = newDateModified;
		response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}`,
			JSON.stringify(json),
			['User-Agent: Firefox']
		);
		assert204(response);

		json = (await API.getItem(objectKey, 'json')).data;
		assert.equal(json.dateModified, newDateModified);
	});

	// PHP: testDateModifiedCollectionChange
	it('should handle dateModified collection change', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');
		let json = await API.createItem('book', { title: 'Test' }, 'jsonData');

		let objectKey = json.key;
		let dateModified1 = json.dateModified;

		json.collections = [collectionKey];

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);

		json = (await API.getItem(objectKey, 'json')).data;
		let dateModified2 = json.dateModified;

		// Date Modified shouldn't have changed
		assert.equal(dateModified1, dateModified2);
	});

	// PHP: testChangeItemType
	it('should change itemType', async function() {
		let json = await API.getItemTemplate('book');
		json.title = 'Foo';
		json.numPages = 100;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		let key = API.getFirstSuccessKeyFromResponse(response);
		let json1 = (await API.getItem(key, 'json')).data;
		let version = json1.version;

		let json2 = await API.getItemTemplate('bookSection');

		for (let field in json2) {
			if (field !== 'itemType' && json1[field] !== undefined) {
				json2[field] = json1[field];
			}
		}

		response = await API.userPut(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(json2),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);
		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.itemType, 'bookSection');
		assert.equal(json.title, 'Foo');
		assert.notProperty(json, 'numPages');
	});

	// PHP: testPatchItem
	it('should patch item', async function() {
		let itemData = { title: 'Test' };
		let json = await API.createItem('book', itemData, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let patch = async function(itemKey, itemVersion, itemData, newData) {
			for (let field in newData) {
				itemData[field] = newData[field];
			}
			let response = await API.userPatch(
				config.get('userID'),
				`items/${itemKey}?key=${config.get('apiKey')}`,
				JSON.stringify(newData),
				[
					'Content-Type: application/json',
					`If-Unmodified-Since-Version: ${itemVersion}`
				]
			);
			assert204(response);
			let updatedJSON = (await API.getItem(itemKey, 'json')).data;

			for (let field in itemData) {
				assert.deepEqual(updatedJSON[field], itemData[field]);
			}
			let headerVersion = response.getHeader('Last-Modified-Version');
			assert.isAbove(parseInt(headerVersion), parseInt(itemVersion));
			assert.equal(updatedJSON.version, headerVersion);

			return headerVersion;
		};

		let newData = { date: '2013' };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { title: '' };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { tags: [{ tag: 'Foo' }] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { tags: [] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		let collectionKey = await API.createCollection('Test', false, 'key');
		newData = { collections: [collectionKey] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { collections: [] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);
	});

	// PHP: testPatchAttachment
	it('should patch attachment', async function() {
		let json = await API.createAttachmentItem('imported_file', {}, false, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let filename = 'test.pdf';
		let mtime = 1234567890000;
		let md5 = '390d914fdac33e307e5b0e1f3dba9da2';

		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify({
				filename: filename,
				mtime: mtime,
				md5: md5
			}),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${itemVersion}`
			]
		);
		assert204(response);
		json = (await API.getItem(itemKey, 'json')).data;

		assert.equal(json.filename, filename);
		assert.equal(json.mtime, mtime);
		assert.equal(md5, json.md5);
		let headerVersion = response.getHeader('Last-Modified-Version');
		assert.isAbove(parseInt(headerVersion), parseInt(itemVersion));
		assert.equal(json.version, headerVersion);
	});

	// PHP: testPatchNote
	it('should patch note', async function() {
		let text = '<p>Test</p>';
		let newText = '<p>Test 2</p>';
		let json = await API.createNoteItem(text, false, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify({ note: newText }),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${itemVersion}`
			]
		);
		assert204(response);
		json = (await API.getItem(itemKey, 'json')).data;

		assert.equal(json.note, newText);
		let headerVersion = response.getHeader('Last-Modified-Version');
		assert.isAbove(parseInt(headerVersion), parseInt(itemVersion));
		assert.equal(json.version, headerVersion);
	});

	// PHP: testPatchNoteOnBookError
	it('should handle PATCH note on book error', async function() {
		let json = await API.createItem('book', {}, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let response = await API.userPatch(
			config.get('userID'),
			`items/${itemKey}`,
			JSON.stringify({ note: 'Test' }),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${itemVersion}`
			]
		);
		assert400(response);
		assert.include(response.getBody(), "'note' property is valid only for note and attachment items");
	});

	// PHP: testPatchItems
	it('should patch items', async function() {
		let itemData = { title: 'Test' };
		let json = await API.createItem('book', itemData, 'jsonData');
		let itemKey = json.key;
		let itemVersion = json.version;

		let patch = async function(itemKey, itemVersion, itemData, newData) {
			for (let field in newData) {
				itemData[field] = newData[field];
			}
			newData.key = itemKey;
			newData.version = itemVersion;
			let response = await API.userPost(
				config.get('userID'),
				'items',
				JSON.stringify([newData]),
				['Content-Type: application/json']
			);
			assert200(response);
			let updatedJSON = (await API.getItem(itemKey, 'json')).data;

			for (let field in itemData) {
				assert.deepEqual(updatedJSON[field], itemData[field]);
			}
			let headerVersion = response.getHeader('Last-Modified-Version');
			assert.isAbove(parseInt(headerVersion), parseInt(itemVersion));
			assert.equal(updatedJSON.version, headerVersion);

			return headerVersion;
		};

		let newData = { date: '2013' };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { title: '' };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { tags: [{ tag: 'Foo' }] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { tags: [] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		let collectionKey = await API.createCollection('Test', false, 'key');
		newData = { collections: [collectionKey] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);

		newData = { collections: [] };
		itemVersion = await patch(itemKey, itemVersion, itemData, newData);
	});

	// PHP: testNewComputerProgramItem
	it('should create new computer program item', async function() {
		let data = await API.createItem('computerProgram', false, 'jsonData');
		let key = data.key;
		assert.equal(data.itemType, 'computerProgram');

		let version = '1.0';
		data.versionNumber = version;

		let response = await API.userPut(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(data),
			['Content-Type: application/json']
		);
		assert204(response);
		let json = await API.getItem(key, 'json');
		assert.equal(json.data.versionNumber, version);
	});

	// PHP: testNewInvalidBookItem
	it('should reject new invalid book item', async function() {
		let json = await API.getItemTemplate('book');

		// Missing itemType
		let json2 = { ...json };
		delete json2.itemType;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json2]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'itemType' property not provided");

		// contentType on non-attachment
		json2 = { ...json };
		json2.contentType = 'text/html';
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json2]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'contentType' is valid only for attachment items");
	});

	// PHP: testEditTopLevelNote
	it('should edit top level note', async function() {
		let noteText = '<p>Test</p>';

		let json = await API.createNoteItem(noteText, null, 'jsonData');
		noteText = '<p>Test Test</p>';
		json.note = noteText;
		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json)
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items/${json.key}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response).data;
		assert.equal(json.note, noteText);
	});

	// PHP: testEditChildNote
	it('should edit child note', async function() {
		let noteText = '<p>Test</p>';
		let key = await API.createItem('book', { title: 'Test' }, 'key');
		let json = await API.createNoteItem(noteText, key, 'jsonData');

		noteText = '<p>Test Test</p>';
		json.note = noteText;
		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json)
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items/${json.key}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response).data;
		assert.equal(json.note, noteText);
	});

	// PHP: testConvertChildNoteToParentViaPatch
	it('should convert child note to parent via PATCH', async function() {
		let noteText = '<p>Test</p>';
		let key = await API.createItem('book', { title: 'Test' }, 'key');
		let json = await API.createNoteItem(noteText, key, 'jsonData');

		let response = await API.userPatch(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify({ parentItem: false }),
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		assert204(response);

		json = (await API.getItem(json.key, 'json')).data;
		assert.notProperty(json, 'parentItem');
	});

	// PHP: test_should_convert_child_note_to_top_level_and_add_to_collection_via_PATCH
	it('should convert child note to top level and add to collection via p a t c h', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');
		let key = await API.createItem('book', { title: 'Test' }, 'key');
		let json = await API.createNoteItem('<p>Test</p>', key, 'jsonData');

		let response = await API.userPatch(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify({
				parentItem: false,
				collections: [collectionKey]
			}),
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		assert204(response);

		json = (await API.getItem(json.key, 'json')).data;
		assert.notProperty(json, 'parentItem');
		assert.include(json.collections, collectionKey);
	});

	// PHP: test_should_convert_child_note_to_top_level_and_add_to_collection_via_PUT
	it('should convert child note to top level and add to collection via p u t', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');
		let key = await API.createItem('book', { title: 'Test' }, 'key');
		let json = await API.createNoteItem('<p>Test</p>', key, 'jsonData');

		delete json.parentItem;
		json.collections = [collectionKey];

		let response = await API.userPut(
			config.get('userID'),
			`items/${json.key}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		assert204(response);

		json = (await API.getItem(json.key, 'json')).data;
		assert.notProperty(json, 'parentItem');
		assert.include(json.collections, collectionKey);
	});

	// PHP: test_should_convert_child_attachment_to_top_level_and_add_to_collection_via_PATCH_without_parentItem_false
	it('should convert child attachment to top level and add to collection via PATCH without parentItem false', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');
		let parentItemKey = await API.createItem('book', { title: 'Test' }, 'key');
		let attachmentJSON = await API.createAttachmentItem('linked_url', {}, parentItemKey, 'jsonData');

		delete attachmentJSON.parentItem;
		attachmentJSON.collections = [collectionKey];

		let response = await API.userPatch(
			config.get('userID'),
			`items/${attachmentJSON.key}`,
			JSON.stringify(attachmentJSON)
		);
		assert204(response);

		let json = (await API.getItem(attachmentJSON.key, 'json')).data;
		assert.notProperty(json, 'parentItem');
		assert.lengthOf(json.collections, 1);
		assert.equal(json.collections[0], collectionKey);
	});

	// PHP: testEditTitleWithCollectionInMultipleMode
	it('should edit title with collection in multiple mode', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');
		let json = await API.createItem('book', {
			title: 'A',
			collections: [collectionKey]
		}, 'jsonData');

		json.title = 'B';
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.successful[0].data.title, 'B');
		assert.include(responseJSON.successful[0].data.collections, collectionKey);
	});

	// PHP: testEditTitleWithTagInMultipleMode
	it('should edit title with tag in multiple mode', async function() {
		let json = await API.createItem('book', {
			title: 'A',
			tags: [{ tag: 'B' }]
		}, 'jsonData');

		json.title = 'C';
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.successful[0].data.title, 'C');
		assert.deepEqual([{ tag: 'B' }], responseJSON.successful[0].data.tags);
	});

	// PHP: test_should_treat_null_value_as_empty_string
	it('should treat null value as empty string', async function() {
		let json = await API.createItem('book', { place: 'New York' }, 'jsonData');

		json.place = null;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal('', responseJSON.successful[0].data.place);
	});

	// PHP: testNewEmptyAttachmentFields
	it('should create new empty attachment fields', async function() {
		let key = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('linked_url', {}, key, 'jsonData');

		assert.equal('', json.url);
		assert.equal('', json.title);
		assert.equal('', json.note);
		assert.equal('', json.contentType);
		assert.equal('', json.charset);
	});

	// PHP: testNewTopLevelImportedFileAttachment
	it('should create new top level imported file attachment', async function() {
		let response = await API.get('items/new?itemType=attachment&linkMode=imported_file');
		let json = JSON.parse(response.getBody());

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);
	});

	// PHP: test_should_create_embedded_image_attachment_for_note
	it('should create embedded image attachment for note', async function() {
		let noteKey = await API.createNoteItem('Test', null, 'key');
		let imageKey = await API.createAttachmentItem(
			'embedded_image',
			{ contentType: 'image/png' },
			noteKey,
			'key'
		);
		assert.isOk(imageKey);
	});

	// PHP: test_num_children_and_children_on_note_with_embedded_image_attachment
	it('should handle numChildren and children on note with embedded image attachment', async function() {
		let noteKey = await API.createNoteItem('Test', null, 'key');
		let imageKey = await API.createAttachmentItem(
			'embedded_image',
			{ contentType: 'image/png' },
			noteKey,
			'key'
		);

		let response = await API.userGet(
			config.get('userID'),
			`items/${noteKey}`
		);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 1);

		response = await API.userGet(
			config.get('userID'),
			`items/${noteKey}/children`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].key, imageKey);
	});

	// PHP: test_should_reject_embedded_image_attachment_without_parent
	it('should reject embedded image attachment without parent', async function() {
		let response = await API.get('items/new?itemType=attachment&linkMode=embedded_image');
		let json = JSON.parse(response.getBody());
		json.parentItem = false;
		json.contentType = 'image/png';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, 'Embedded-image attachment must have a parent item');
	});

	// PHP: test_should_reject_changing_parent_of_embedded_image_attachment
	it('should reject changing parent of embedded image attachment', async function() {
		let noteKey = await API.createNoteItem('Test', null, 'key');
		let note2Key = await API.createNoteItem('Test 2', null, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=embedded_image');
		let json = JSON.parse(response.getBody());
		json.parentItem = noteKey;
		json.contentType = 'image/png';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		let key = responseJSON.successful[0].key;
		let item = await API.getItem(key, 'json');

		// Try to change the parent item
		let patchJSON = {
			version: item.version,
			parentItem: note2Key
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(patchJSON)
		);
		assert400(response);
		assert.include(response.getBody(), 'Cannot change parent item of embedded-image attachment');
	});

	// PHP: test_should_reject_clearing_parent_of_embedded_image_attachment
	it('should reject clearing parent of embedded image attachment', async function() {
		let noteKey = await API.createNoteItem('Test', null, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=embedded_image');
		let json = JSON.parse(response.getBody());
		json.parentItem = noteKey;
		json.contentType = 'image/png';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		let key = responseJSON.successful[0].key;
		let item = await API.getItem(key, 'json');

		// Try to clear the parent item
		let patchJSON = {
			version: item.version,
			parentItem: false
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(patchJSON)
		);
		assert400(response);
		assert.include(response.getBody(), 'Cannot change parent item of embedded-image attachment');
	});

	// PHP: test_should_reject_invalid_content_type_for_embedded_image_attachment
	it('should reject invalid content type for embedded image attachment', async function() {
		let noteKey = await API.createNoteItem('Test', null, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=embedded_image');
		let json = JSON.parse(response.getBody());
		json.parentItem = noteKey;
		json.contentType = 'application/pdf';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, 'Embedded-image attachment must have an image content type');
	});

	// PHP: test_should_reject_embedded_note_for_embedded_image_attachment
	it('should reject embedded note for embedded image attachment', async function() {
		let noteKey = await API.createNoteItem('Test', null, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=embedded_image');
		let json = JSON.parse(response.getBody());
		json.parentItem = noteKey;
		json.note = '<p>Foo</p>';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'note' property is not valid for embedded images");
	});

	// PHP: testNewInvalidTopLevelAttachment
	it('should reject new invalid top level attachment', async function() {
		let linkModes = ['linked_file', 'linked_url'];
		for (let linkMode of linkModes) {
			let response = await API.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
			let json = JSON.parse(response.getBody());

			response = await API.userPost(
				config.get('userID'),
				'items',
				JSON.stringify([json]),
				['Content-Type: application/json']
			);
			assert200(response);
			let responseJSON = API.getJSONFromResponse(response);
			assert.property(responseJSON.successful, '0');
		}
	});

	// PHP: testPatchTopLevelAttachment
	it('should patch top level attachment', async function() {
		let json = await API.createAttachmentItem('linked_url', {}, null, 'jsonData');
		let key = json.key;

		// With linkMode
		let patchJSON = {
			key: json.key,
			version: json.version,
			linkMode: 'linked_url',
			title: 'A'
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([patchJSON]),
			['Content-Type: application/json']
		);
		assert200(response);
		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.title, 'A');

		// With itemType and linkMode
		patchJSON = {
			itemType: 'attachment',
			key: json.key,
			version: json.version,
			linkMode: 'linked_url',
			title: 'B'
		};
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([patchJSON]),
			['Content-Type: application/json']
		);
		assert200(response);
		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.title, 'B');

		// Without linkMode
		patchJSON = {
			itemType: 'attachment',
			key: json.key,
			version: json.version,
			title: 'C'
		};
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([patchJSON]),
			['Content-Type: application/json']
		);
		assert200(response);
		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.title, 'C');

		// Without itemType or linkMode
		patchJSON = {
			key: json.key,
			version: json.version,
			title: 'D'
		};
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([patchJSON]),
			['Content-Type: application/json']
		);
		assert200(response);
		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.title, 'D');
	});

	// PHP: testNewEmptyLinkAttachmentItemWithItemKey
	it('should create new empty link attachment item with item key', async function() {
		let key = await API.createItem('book', false, 'key');
		await API.createAttachmentItem('linked_url', {}, key, 'json');

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		json.parentItem = key;
		// Generate a valid Zotero key
		let chars = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
		let newKey = '';
		for (let i = 0; i < 8; i++) {
			newKey += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		json.key = newKey;
		json.version = 0;

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);
	});

	// PHP: testEditEmptyLinkAttachmentItem
	it('should edit empty link attachment item', async function() {
		let key = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('linked_url', {}, key, 'jsonData');

		let attachmentKey = json.key;
		let version = json.version;

		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);
		json = (await API.getItem(attachmentKey, 'json')).data;
		// Item shouldn't change
		assert.equal(json.version, version);
	});

	// PHP: testEditEmptyImportedURLAttachmentItem
	it('should edit empty imported URL attachment item', async function() {
		let key = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('imported_url', {}, key, 'jsonData');

		let attachmentKey = json.key;
		let version = json.version;

		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);
		json = (await API.getItem(attachmentKey, 'json')).data;
		// Item shouldn't change
		assert.equal(json.version, version);
	});

	// PHP: testEditLinkAttachmentItem
	it('should edit link attachment item', async function() {
		let key = await API.createItem('book', false, 'key');
		let json = await API.createAttachmentItem('linked_url', {}, key, 'jsonData');

		let attachmentKey = json.key;
		let version = json.version;

		let contentType = 'text/xml';
		let charset = 'utf-8';

		json.contentType = contentType;
		json.charset = charset;

		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		json = (await API.getItem(attachmentKey, 'json')).data;
		assert.equal(json.contentType, contentType);
		assert.equal(json.charset, charset);
	});

	// PHP: testCreateLinkedFileAttachment
	it('should create linked file attachment', async function() {
		let key = await API.createItem('book', false, 'key');
		let path = 'attachments:tést.txt';
		let json = await API.createAttachmentItem('linked_file', { path: path }, key, 'jsonData');

		assert.equal(json.linkMode, 'linked_file');
		assert.equal(json.path, path);
	});

	// PHP: test_should_reject_linked_file_attachment_in_group
	it('should reject linked file attachment in group', async function() {
		let key = await API.groupCreateItem(
			config.get('ownedPrivateGroupID'),
			'book',
			{},
			'key'
		);
		let path = 'attachments:tést.txt';

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_file');
		let json = JSON.parse(response.getBody());
		json.parentItem = key;
		json.path = path;

		response = await API.groupPost(
			config.get('ownedPrivateGroupID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, 'Linked files can only be added to user libraries');
	});

	// PHP: testDateModifiedChangeOnEdit
	it('should handle dateModified change on edit', async function() {
		let json = await API.createAttachmentItem('linked_file', {}, false, 'jsonData');
		let modified = json.dateModified;

		for (let i = 1; i <= 2; i++) {
			await new Promise(resolve => setTimeout(resolve, 1100));
			delete json.dateModified;

			switch (i) {
				case 1:
					json.note = 'Test';
					break;

				case 2:
					json.tags = [{ tag: 'A' }];
					break;
			}

			let response = await API.userPut(
				config.get('userID'),
				`items/${json.key}`,
				JSON.stringify(json),
				[`If-Unmodified-Since-Version: ${json.version}`]
			);
			assert204(response);

			json = (await API.getItem(json.key, 'json')).data;
			assert.notEqual(modified, json.dateModified, `Date Modified not changed on loop ${i}`);
			modified = json.dateModified;
		}
	});

	// PHP: testDateModifiedNoChange
	it('should handle dateModified no change', async function() {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let json = await API.createItem('book', false, 'jsonData');
		let modified = json.dateModified;

		for (let i = 1; i <= 4; i++) {
			await new Promise(resolve => setTimeout(resolve, 1100));

			// For all tests after the first one, unset Date Modified
			if (i > 1) {
				delete json.dateModified;
			}

			switch (i) {
				case 1:
					json.title = 'A';
					break;

				case 2:
					json.collections = [collectionKey];
					break;

				case 3:
					json.deleted = true;
					break;

				case 4:
					json.deleted = false;
					break;
			}

			let response = await API.userPost(
				config.get('userID'),
				'items',
				JSON.stringify([json]),
				[
					`If-Unmodified-Since-Version: ${json.version}`,
					'User-Agent: Firefox'
				]
			);
			assert200(response);
			json = API.getJSONFromResponse(response).successful[0].data;
			assert.equal(json.dateModified, modified, `Date Modified changed on loop ${i}`);
		}
	});

	// PHP: testEditAttachmentAtomUpdatedTimestamp
	it('should update attachment Atom updated timestamp when edited', async function() {
		let xml = await API.createAttachmentItem('linked_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let atomUpdatedNode = xpathSelect(xml, '//atom:entry/atom:updated/text()', true);
		let atomUpdated = atomUpdatedNode ? atomUpdatedNode.nodeValue : '';
		let json = JSON.parse(data.content);
		json.note = 'Test';

		await new Promise(resolve => setTimeout(resolve, 1000));

		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${data.version}`]
		);
		assert204(response);

		xml = await API.getItemXML(data.key);
		let atomUpdatedNode2 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true);
		let atomUpdated2 = atomUpdatedNode2 ? atomUpdatedNode2.nodeValue : '';
		assert.notEqual(atomUpdated2, atomUpdated);
	});

	// PHP: testEditAttachmentAtomUpdatedTimestampTmpZoteroClientHack
	it('should update attachment Atom updated timestamp when edited (tmp Zotero client hack)', async function() {
		let xml = await API.createAttachmentItem('linked_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let atomUpdatedNode = xpathSelect(xml, '//atom:entry/atom:updated/text()', true);
		let atomUpdated = atomUpdatedNode ? atomUpdatedNode.nodeValue : '';
		let json = JSON.parse(data.content);
		delete json.dateModified;
		json.note = 'Test';

		await new Promise(resolve => setTimeout(resolve, 1000));

		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}`,
			JSON.stringify(json),
			[
				`If-Unmodified-Since-Version: ${data.version}`,
				// TODO: Remove
				'User-Agent: Firefox'
			]
		);
		assert204(response);

		xml = await API.getItemXML(data.key);
		let atomUpdatedNode2 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true);
		let atomUpdated2 = atomUpdatedNode2 ? atomUpdatedNode2.nodeValue : '';
		assert.notEqual(atomUpdated2, atomUpdated);
	});

	// PHP: testNewAttachmentItemInvalidLinkMode
	it('should reject new attachment item invalid linkMode', async function() {
		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());

		// Invalid linkMode
		json.linkMode = 'invalidName';
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'invalidName' is not a valid linkMode");

		// Missing linkMode
		delete json.linkMode;
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'linkMode' property not provided");
	});

	// PHP: testNewAttachmentItemMD5OnLinkedURL
	it('should reject new attachment item MD5 on linked URL', async function() {
		let parentKey = await API.createItem('book', false, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;

		json.md5 = 'c7487a750a97722ae1878ed46b215ebe';
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'md5' is valid only for imported and embedded-image attachments");
	});

	// PHP: testNewAttachmentItemModTimeOnLinkedURL
	it('should reject new attachment item mod time on linked URL', async function() {
		let parentKey = await API.createItem('book', false, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;

		json.mtime = '1332807793000';
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'mtime' is valid only for imported and embedded-image attachments");
	});

	// PHP: test_should_ignore_null_for_existing_storage_properties
	it('should ignore null for existing storage properties', async function() {
		let json = await API.createAttachmentItem('imported_file', {}, false, 'jsonData');
		let key = json.key;

		// Set storage properties
		json.md5 = 'c7487a750a97722ae1878ed46b215ebe';
		json.mtime = 1332807793000;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);

		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.md5, 'c7487a750a97722ae1878ed46b215ebe');
		assert.equal(json.mtime, 1332807793000);

		// Setting to null should be ignored
		json.md5 = null;
		json.mtime = null;
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);

		json = (await API.getItem(key, 'json')).data;
		assert.equal(json.md5, 'c7487a750a97722ae1878ed46b215ebe');
		assert.equal(json.mtime, 1332807793000);
	});

	// PHP: testMappedCreatorTypes
	it('should handle mapped creator types', async function() {
		let json = [
			{
				itemType: 'presentation',
				title: 'Test',
				creators: [
					{
						creatorType: 'author',
						name: 'Foo'
					}
				]
			},
			{
				itemType: 'presentation',
				title: 'Test',
				creators: [
					{
						creatorType: 'editor',
						name: 'Foo'
					}
				]
			}
		];
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify(json)
		);
		// 'author' gets mapped automatically
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.property(responseJSON.successful, '0');
		// Others don't
		assert.property(responseJSON.failed, '1');
	});

	// PHP: testLibraryUser
	it('should handle library user', async function() {
		let json = await API.createItem('book', false, 'json');
		assert.equal(json.library.type, 'user');
		assert.equal(config.get('userID'), json.library.id);
		assert.equal(config.get('displayName'), json.library.name);
		assert.match(json.library.links.alternate.href, new RegExp(`^https?://[^/]+/${config.get('username')}$`));
		assert.equal(json.library.links.alternate.type, 'text/html');
	});

	// PHP: testLibraryGroup
	it('should handle library group', async function() {
		let json = await API.groupCreateItem(config.get('ownedPrivateGroupID'), 'book', {}, 'json');
		assert.equal(json.library.type, 'group');
		assert.equal(config.get('ownedPrivateGroupID'), json.library.id);
		assert.equal(config.get('ownedPrivateGroupName'), json.library.name);
		assert.match(json.library.links.alternate.href, /^https?:\/\/[^/]+\/groups\/[0-9]+$/);
		assert.equal(json.library.links.alternate.type, 'text/html');
	});

	// PHP: test_createdByUser
	it('should set and return createdByUser', async function() {
		let json = await API.groupCreateItem(config.get('ownedPrivateGroupID'), 'book', {}, 'json');
		assert.equal(config.get('userID'), json.meta.createdByUser.id);
		assert.equal(config.get('username'), json.meta.createdByUser.username);
	});

	// PHP: testNumChildrenJSON
	it('should return numChildren in JSON', async function() {
		let json = await API.createItem('book', false, 'json');
		assert.equal(json.meta.numChildren, 0);
		let key = json.key;

		await API.createAttachmentItem('linked_url', {}, key, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 1);

		await API.createNoteItem('Test', key, 'key');

		response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 2);
	});

	// PHP: testNumChildrenAtom
	it('should return numChildren in Atom', async function() {
		let xml = await API.createItem('book', false, 'atom');
		let numChildrenNode = xpathSelect(xml, '//atom:entry/zapi:numChildren/text()', true);
		assert.equal(numChildrenNode ? numChildrenNode.nodeValue : '', '0');

		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;

		await API.createAttachmentItem('linked_url', {}, key, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}?content=json`
		);
		xml = API.getXMLFromResponse(response);
		numChildrenNode = xpathSelect(xml, '//atom:entry/zapi:numChildren/text()', true);
		assert.equal(numChildrenNode ? numChildrenNode.nodeValue : '', '1');

		await API.createNoteItem('Test', key, 'key');

		response = await API.userGet(
			config.get('userID'),
			`items/${key}?content=json`
		);
		xml = API.getXMLFromResponse(response);
		numChildrenNode = xpathSelect(xml, '//atom:entry/zapi:numChildren/text()', true);
		assert.equal(numChildrenNode ? numChildrenNode.nodeValue : '', '2');
	});

	// PHP: test_num_children_and_children_on_attachment_with_annotation
	it('should handle numChildren and children on attachment with annotation', async function() {
		let key = await API.createItem('book', false, 'key');
		let attachmentKey = await API.createAttachmentItem(
			'imported_url',
			{
				contentType: 'application/pdf',
				title: 'bbb'
			},
			key,
			'key'
		);
		let annotationKey = await API.createAnnotationItem(
			'image',
			{ annotationComment: 'ccc' },
			attachmentKey,
			'key'
		);

		let response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}`
		);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 1);

		response = await API.userGet(
			config.get('userID'),
			`items/${attachmentKey}/children`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].data.annotationComment, 'ccc');
	});

	// PHP: testTop
	it('should handle top', async function() {
		await API.userClear(config.get('userID'));

		let collectionKey = await API.createCollection('Test', false, 'key');

		let parentTitle1 = 'Parent Title';
		let childTitle1 = 'This is a Test Title';
		let parentTitle2 = 'Another Parent Title';
		let noteText = 'This is a sample note.';

		let parentKeys = [];
		let childKeys = [];

		parentKeys.push(await API.createItem('journalArticle', {
			title: parentTitle1,
			collections: [collectionKey]
		}, 'key'));

		childKeys.push(await API.createAttachmentItem('linked_url', {
			title: childTitle1
		}, parentKeys[0], 'key'));

		parentKeys.push(await API.createItem('newspaperArticle', {
			title: parentTitle2
		}, 'key'));

		childKeys.push(await API.createNoteItem(noteText, parentKeys[1], 'key'));

		// /top, JSON
		let response = await API.userGet(
			config.get('userID'),
			'items/top'
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(parentKeys.length, json.length);

		let returnedKeys = json.map(item => item.key);
		for (let parentKey of parentKeys) {
			assert.include(returnedKeys, parentKey);
		}

		// /top in collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(parentKeys[0], json[0].key);

		// /top with itemKey for child should return parent
		response = await API.userGet(
			config.get('userID'),
			`items/top?itemKey=${childKeys[0]}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(parentKeys[0], json[0].key);
	});

	// PHP: testTopWithSince
	it('should handle top with since', async function() {
		await API.userClear(config.get('userID'));

		let parentKeys = [];
		let childKeys = [];

		let version1 = await API.getLibraryVersion();
		parentKeys.push(await API.createItem('book', {}, 'key'));
		let version2 = await API.getLibraryVersion();
		childKeys.push(await API.createAttachmentItem('linked_url', {}, parentKeys[0], 'key'));
		let version3 = await API.getLibraryVersion();
		parentKeys.push(await API.createItem('journalArticle', {}, 'key'));
		let version4 = await API.getLibraryVersion();
		childKeys.push(await API.createNoteItem('', parentKeys[1], 'key'));
		let version5 = await API.getLibraryVersion();
		parentKeys.push(await API.createItem('book', {}, 'key'));
		let version6 = await API.getLibraryVersion();

		let response = await API.userGet(
			config.get('userID'),
			`items/top?since=${version1}`
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.length, 3);

		response = await API.userGet(
			config.get('userID'),
			`items?since=${version1}`
		);
		json = API.getJSONFromResponse(response);
		assert.equal(json.length, 5);

		response = await API.userGet(
			config.get('userID'),
			`items/top?format=versions&since=${version4}`
		);
		json = API.getJSONFromResponse(response);
		let keys = Object.keys(json);
		assert.equal(keys.length, 1);
		assert.equal(parentKeys[2], keys[0]);
	});

	// PHP: test_top_should_return_top_level_item_for_three_level_hierarchy
	it('should return top level item for three level hierarchy', async function() {
		await API.userClear(config.get('userID'));

		// Create parent item, PDF attachment, and annotation
		let itemKey = await API.createItem('book', { title: 'aaa' }, 'key');
		let attachmentKey = await API.createAttachmentItem(
			'imported_url',
			{
				contentType: 'application/pdf',
				title: 'bbb'
			},
			itemKey,
			'key'
		);
		let annotationKey = await API.createAnnotationItem(
			'highlight',
			{ annotationComment: 'ccc' },
			attachmentKey,
			'key'
		);

		// Search for descendant items in /top mode
		let response = await API.userGet(
			config.get('userID'),
			'items/top?q=bbb'
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].data.title, 'aaa');

		response = await API.userGet(
			config.get('userID'),
			'items/top?itemType=annotation'
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].data.title, 'aaa');
	});

	// PHP: testIncludeTrashed
	it('should return items in trash with includeTrashed', async function() {
		await API.userClear(config.get('userID'));

		let key1 = await API.createItem('book', false, 'key');
		let key2 = await API.createItem('book', { deleted: 1 }, 'key');
		let key3 = await API.createNoteItem('', key1, 'key');

		// All three items should show up with includeTrashed=1
		let response = await API.userGet(
			config.get('userID'),
			'items?includeTrashed=1'
		);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 3);
		let keys = json.map(item => item.key);
		assert.include(keys, key1);
		assert.include(keys, key2);
		assert.include(keys, key3);

		// ?itemKey should show the deleted item
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key2},${key3}&includeTrashed=1`
		);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 2);
		keys = json.map(item => item.key);
		assert.include(keys, key2);
		assert.include(keys, key3);

		// /top should show the deleted item
		response = await API.userGet(
			config.get('userID'),
			'items/top?includeTrashed=1'
		);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 2);
		keys = json.map(item => item.key);
		assert.include(keys, key1);
		assert.include(keys, key2);
	});

	// PHP: testTrash
	it('should handle items in trash', async function() {
		await API.userClear(config.get('userID'));

		let key1 = await API.createItem('book', false, 'key');
		let key2 = await API.createItem('book', { deleted: 1 }, 'key');

		// Item should show up in trash
		let response = await API.userGet(
			config.get('userID'),
			'items/trash'
		);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(key2, json[0].key);

		// And not show up in main items
		response = await API.userGet(
			config.get('userID'),
			'items'
		);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(key1, json[0].key);

		// Including with ?itemKey
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key2}`
		);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 0);
	});

	// PHP: test_patch_of_item_should_set_trash_state
	it('should set trash state via PATCH', async function() {
		let json = await API.createItem('book', {}, 'json');

		let data = [
			{
				key: json.key,
				version: json.version,
				deleted: true
			}
		];
		let response = await API.postItems(data);
		json = API.getJSONFromResponse(response);

		assert.property(json.successful[0].data, 'deleted');
		assert.equal(json.successful[0].data.deleted, 1);
	});

	// PHP: test_patch_of_item_should_clear_trash_state
	it('should clear trash state via PATCH', async function() {
		let json = await API.createItem('book', { deleted: true }, 'json');

		let data = [
			{
				key: json.key,
				version: json.version,
				deleted: false
			}
		];
		let response = await API.postItems(data);
		json = API.getJSONFromResponse(response);

		assert.notProperty(json.successful[0].data, 'deleted');
	});

	// PHP: test_patch_of_item_in_trash_without_deleted_should_not_remove_it_from_trash
	it('should not remove item from trash via PATCH without deleted property', async function() {
		let json = await API.createItem('book', { deleted: true }, 'json');

		let data = [
			{
				key: json.key,
				version: json.version,
				title: 'A'
			}
		];
		let response = await API.postItems(data);
		json = API.getJSONFromResponse(response);

		assert.property(json.successful[0].data, 'deleted');
		assert.equal(json.successful[0].data.deleted, 1);
	});

	// PHP: testParentItem
	it('should handle parentItem', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let parentKey = json.key;

		json = await API.createAttachmentItem('linked_file', {}, parentKey, 'jsonData');
		let childKey = json.key;
		let childVersion = json.version;

		assert.property(json, 'parentItem');
		assert.equal(json.parentItem, parentKey);

		// Remove the parent, making the child a standalone attachment
		delete json.parentItem;

		let response = await API.userPut(
			config.get('userID'),
			`items/${childKey}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${childVersion}`]
		);
		assert204(response);

		json = (await API.getItem(childKey, 'json')).data;
		assert.notProperty(json, 'parentItem');
	});

	// PHP: test_should_reject_parentItem_that_matches_item_key
	it('should reject parentItem that matches item key', async function() {
		let response = await API.get('items/new?itemType=attachment&linkMode=imported_file');
		let json = JSON.parse(response.getBody());
		// Generate a valid Zotero key
		let chars = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
		let key = '';
		for (let i = 0; i < 8; i++) {
			key += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		json.key = key;
		json.version = 0;
		json.parentItem = key;

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json])
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.property(responseJSON.failed, '0');
		assert.equal(responseJSON.failed[0].code, 400);
		assert.include(responseJSON.failed[0].message, 'cannot be a child of itself');
	});

	// PHP: testParentItemPatch
	it('should handle parentItem PATCH', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let parentKey = json.key;

		json = await API.createAttachmentItem('linked_file', {}, parentKey, 'jsonData');
		let childKey = json.key;
		let childVersion = json.version;

		assert.property(json, 'parentItem');
		assert.equal(json.parentItem, parentKey);

		let patchData = { title: 'Test' };

		// With PATCH, parent shouldn't be removed even though unspecified
		let response = await API.userPatch(
			config.get('userID'),
			`items/${childKey}`,
			JSON.stringify(patchData),
			[`If-Unmodified-Since-Version: ${childVersion}`]
		);
		assert204(response);

		json = (await API.getItem(childKey, 'json')).data;
		assert.property(json, 'parentItem');
		childVersion = json.version;

		// But it should be removed with parentItem: false
		patchData = { parentItem: false };
		response = await API.userPatch(
			config.get('userID'),
			`items/${childKey}`,
			JSON.stringify(patchData),
			[`If-Unmodified-Since-Version: ${childVersion}`]
		);
		assert204(response);
		json = (await API.getItem(childKey, 'json')).data;
		assert.notProperty(json, 'parentItem');
	});

	// PHP: test_should_move_attachment_with_annotation_under_regular_item
	it('should move attachment with annotation under regular item', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let itemKey = json.key;

		// Create standalone attachment to start
		json = await API.createAttachmentItem(
			'imported_file', { contentType: 'application/pdf' }, null, 'jsonData'
		);
		let attachmentKey = json.key;

		// Create highlight annotation
		let annotationKey = await API.createAnnotationItem('highlight', null, attachmentKey, 'key');

		// /top for the annotation key should return the attachment
		let response = await API.userGet(
			config.get('userID'),
			`items/top?itemKey=${annotationKey}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].key, attachmentKey);

		// Move attachment under regular item
		json[0].data.parentItem = itemKey;
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json[0].data])
		);
		assert200(response);

		// /top for the annotation key should now return the regular item
		response = await API.userGet(
			config.get('userID'),
			`items/top?itemKey=${annotationKey}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].key, itemKey);
	});

	// PHP: test_should_move_attachment_with_annotation_out_from_under_regular_item
	it('should move attachment with annotation out from under regular item', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let itemKey = json.key;

		// Create attachment under item
		let attachmentJSON = await API.createAttachmentItem(
			'imported_file', { contentType: 'application/pdf' }, itemKey, 'jsonData'
		);
		let attachmentKey = attachmentJSON.key;

		// Create highlight annotation
		let annotationKey = await API.createAnnotationItem('highlight', null, attachmentKey, 'key');

		// /top for the annotation key should return the item
		let response = await API.userGet(
			config.get('userID'),
			`items/top?itemKey=${annotationKey}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].key, itemKey);

		// Move attachment out from under regular item
		attachmentJSON.parentItem = false;
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([attachmentJSON])
		);
		assert200(response);

		// /top for the annotation key should now return the attachment item
		response = await API.userGet(
			config.get('userID'),
			`items/top?itemKey=${annotationKey}`
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(json, 1);
		assert.equal(json[0].key, attachmentKey);
	});

	// PHP: test_deleting_parent_item_should_delete_child_linked_file_attachment
	it('should delete child linked file attachment when deleting parent item', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let parentKey = json.key;

		json = await API.createAttachmentItem('linked_file', {}, parentKey, 'jsonData');
		let childKey = json.key;

		let response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${parentKey},${childKey}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 2);

		// Get parent item's current version for the delete request
		let parentItem = await API.getItem(parentKey, 'json');
		let parentVersion = parentItem.version;

		response = await API.userDelete(
			config.get('userID'),
			`items/${parentKey}`,
			[`If-Unmodified-Since-Version: ${parentVersion}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${parentKey},${childKey}`
		);
		responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 0);
	});

	// PHP: test_deleting_parent_item_should_delete_attachment_and_child_annotation
	it('should delete attachment and child annotation when deleting parent item', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let itemKey = json.key;

		let attachmentKey = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'application/pdf' },
			itemKey,
			'key'
		);
		json = await API.createAnnotationItem('highlight', null, attachmentKey, 'jsonData');
		let annotationKey = json.key;
		let version = json.version;

		// Delete parent item
		let response = await API.userDelete(
			config.get('userID'),
			`items?itemKey=${itemKey}`,
			[`If-Unmodified-Since-Version: ${version}`]
		);
		assert204(response);

		// All items should be gone
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 0);
	});

	// PHP: test_deleting_linked_file_attachment_should_delete_child_annotation
	it('should delete child annotation when deleting linked file attachment', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let itemKey = json.key;

		let attachmentKey = await API.createAttachmentItem(
			'linked_file',
			{ contentType: 'application/pdf' },
			itemKey,
			'key'
		);
		json = await API.createAnnotationItem('highlight', null, attachmentKey, 'jsonData');
		let annotationKey = json.key;
		let version = json.version;

		// Delete attachment
		let response = await API.userDelete(
			config.get('userID'),
			`items?itemKey=${attachmentKey}`,
			[`If-Unmodified-Since-Version: ${version}`]
		);
		assert204(response);

		// Only parent item should remain
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 1);
	});

	// PHP: test_should_allow_changing_parent_item_of_annotation_to_another_file_attachment
	it('should allow changing parent item of annotation to another file attachment', async function() {
		let attachment1Key = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'application/pdf' },
			null,
			'key'
		);
		let attachment2Key = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'application/pdf' },
			null,
			'key'
		);
		let jsonData = await API.createAnnotationItem('highlight', null, attachment1Key, 'jsonData');

		// Change the parent item
		let patchJSON = {
			version: jsonData.version,
			parentItem: attachment2Key
		};
		let response = await API.userPatch(
			config.get('userID'),
			`items/${jsonData.key}`,
			JSON.stringify(patchJSON)
		);
		assert204(response);
	});

	// PHP: test_should_reject_changing_parent_item_of_annotation_to_invalid_items
	it('should reject changing parent item of annotation to invalid items', async function() {
		let itemKey = await API.createItem('book', false, 'key');
		let linkedURLAttachmentKey = await API.createAttachmentItem('linked_url', {}, itemKey, 'key');

		let attachmentKey = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'application/pdf' },
			null,
			'key'
		);
		let jsonData = await API.createAnnotationItem('highlight', null, attachmentKey, 'jsonData');

		// No parent
		let patchJSON = {
			version: jsonData.version,
			parentItem: false
		};
		let response = await API.userPatch(
			config.get('userID'),
			`items/${jsonData.key}`,
			JSON.stringify(patchJSON)
		);
		assert400(response);
		assert.include(response.getBody(), 'Annotation must have a parent item');

		// Regular item
		patchJSON = {
			version: jsonData.version,
			parentItem: itemKey
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${jsonData.key}`,
			JSON.stringify(patchJSON)
		);
		assert400(response);
		assert.include(response.getBody(), 'Parent item of highlight annotation must be a PDF attachment');

		// Linked-URL attachment
		patchJSON = {
			version: jsonData.version,
			parentItem: linkedURLAttachmentKey
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${jsonData.key}`,
			JSON.stringify(patchJSON)
		);
		assert400(response);
		assert.include(response.getBody(), 'Parent item of highlight annotation must be a PDF attachment');
	});

	// PHP: test_deleting_parent_item_should_delete_note_and_embedded_image_attachment
	it('should delete note and embedded image attachment when deleting parent item', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let itemKey = json.key;

		let noteKey = await API.createNoteItem('<p>Test</p>', itemKey, 'key');
		let attachmentKey = await API.createAttachmentItem(
			'embedded_image',
			{ contentType: 'image/png' },
			noteKey,
			'key'
		);

		// Check that all items can be found
		let response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${itemKey},${noteKey},${attachmentKey}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 3);

		// Get the current item version (may have changed)
		let currentItem = await API.getItem(itemKey, 'json');

		response = await API.userDelete(
			config.get('userID'),
			`items/${itemKey}`,
			[`If-Unmodified-Since-Version: ${currentItem.version}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${itemKey},${noteKey},${attachmentKey}`
		);
		responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 0);
	});

	// PHP: test_deleting_parent_item_should_delete_attachment_and_annotation
	it('should delete attachment and annotation when deleting parent item', async function() {
		let json = await API.createItem('book', false, 'jsonData');
		let itemKey = json.key;

		json = await API.createAttachmentItem(
			'imported_file',
			{ contentType: 'application/pdf' },
			itemKey,
			'jsonData'
		);
		let attachmentKey = json.key;

		let annotationKey = await API.createAnnotationItem(
			'highlight',
			{ annotationComment: 'ccc' },
			attachmentKey,
			'key'
		);

		// Check that all items can be found
		let response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		let responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 3);

		// Get the current item version (may have changed)
		let currentItem = await API.getItem(itemKey, 'json');

		response = await API.userDelete(
			config.get('userID'),
			`items/${itemKey}`,
			[`If-Unmodified-Since-Version: ${currentItem.version}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${itemKey},${attachmentKey},${annotationKey}`
		);
		responseJSON = API.getJSONFromResponse(response);
		assert.lengthOf(responseJSON, 0);
	});

	// PHP: test_deleting_user_library_attachment_should_delete_lastPageIndex_setting
	it('should delete last page index setting when deleting user library attachment', async function() {
		let json = await API.createAttachmentItem(
			'imported_file',
			{ contentType: 'application/pdf' },
			null,
			'jsonData'
		);
		let attachmentKey = json.key;
		let attachmentVersion = json.version;

		let settingKey = `lastPageIndex_u_${attachmentKey}`;
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify({
				value: 123,
				version: 0
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		response = await API.userDelete(
			config.get('userID'),
			`items/${attachmentKey}`,
			[`If-Unmodified-Since-Version: ${attachmentVersion}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert404(response);

		// Setting shouldn't be in delete log
		response = await API.userGet(
			config.get('userID'),
			`deleted?since=${attachmentVersion}`
		);
		json = API.getJSONFromResponse(response);
		assert.notInclude(json.settings, settingKey);
	});

	// PHP: test_deleting_group_library_attachment_should_delete_lastPageIndex_setting_for_all_users
	it('should delete last page index setting for all users when deleting group library attachment', async function() {
		let json = await API.groupCreateAttachmentItem(
			config.get('ownedPrivateGroupID'),
			'imported_file',
			{ contentType: 'application/pdf' },
			null,
			'jsonData'
		);
		let attachmentKey = json.key;
		let attachmentVersion = json.version;

		// Add setting to both group members
		// Set as user 1
		let settingKey = `lastPageIndex_g${config.get('ownedPrivateGroupID')}_${attachmentKey}`;
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify({
				value: 123,
				version: 0
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		// Set as user 2
		API.useAPIKey(config.get('user2APIKey'));
		response = await API.userPut(
			config.get('userID2'),
			`settings/${settingKey}`,
			JSON.stringify({
				value: 234,
				version: 0
			}),
			['Content-Type: application/json']
		);
		assert204(response);

		API.useAPIKey(config.get('user1APIKey'));

		// Delete group item
		response = await API.groupDelete(
			config.get('ownedPrivateGroupID'),
			`items/${attachmentKey}`,
			[`If-Unmodified-Since-Version: ${attachmentVersion}`]
		);
		assert204(response);

		// Setting should be gone for both group users
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert404(response);

		response = await API.superGet(
			`users/${config.get('userID2')}/settings/${settingKey}`
		);
		assert404(response);
	});

	// PHP: test_should_preserve_createdByUserID_on_undelete
	it('should preserve createdByUserID on undelete', async function() {
		let json = await API.groupCreateItem(
			config.get('ownedPrivateGroupID'),
			'book',
			{},
			'json'
		);
		let jsonData = json.data;

		assert.equal(config.get('username'), json.meta.createdByUser.username);

		let response = await API.groupDelete(
			config.get('ownedPrivateGroupID'),
			`items/${json.key}`,
			[`If-Unmodified-Since-Version: ${json.version}`]
		);
		assert204(response);

		// Re-create as user 2
		API.useAPIKey(config.get('user2APIKey'));
		jsonData.version = 0;
		response = await API.groupPost(
			config.get('ownedPrivateGroupID'),
			'items',
			JSON.stringify([jsonData]),
			['Content-Type: application/json']
		);
		json = API.getJSONFromResponse(response);

		// createdByUser shouldn't have changed
		assert.equal(
			config.get('username'),
			json.successful[0].meta.createdByUser.username
		);

		// Reset to user 1 API key
		API.useAPIKey(config.get('user1APIKey'));
	});

	// PHP: test_should_return_409_on_missing_parent
	it('should return 409 on missing parent', async function() {
		let missingParentKey = 'BDARG2AV';
		let response = await API.get('items/new?itemType=note');
		let json = JSON.parse(response.getBody());
		json.parentItem = missingParentKey;
		json.note = '<p>test</p>';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert409ForObject(response, `Parent item ${missingParentKey} not found`);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.failed[0].data.parentItem, missingParentKey);
	});

	// PHP: test_should_return_409_on_missing_parent_if_parent_failed
	it('should return 409 on missing parent if parent failed', async function() {
		// Collection
		let collectionKey = await API.createCollection('A', null, 'key');

		let version = await API.getLibraryVersion();
		let parentKey = 'BDARG2AV';
		// Create a tag that's too long to cause parent item to fail
		let tag = crypto.randomBytes(150).toString('hex'); // 300 characters

		// Parent item - will fail due to too-long tag
		let response = await API.get('items/new?itemType=book');
		let item1JSON = JSON.parse(response.getBody());
		item1JSON.key = parentKey;
		item1JSON.creators = [
			{
				firstName: 'A.',
				lastName: 'Nespola',
				creatorType: 'author'
			}
		];
		item1JSON.tags = [
			{ tag: 'A' },
			{ tag: tag } // Too long, will cause 413
		];
		item1JSON.collections = [collectionKey];

		// Child note
		response = await API.get('items/new?itemType=note');
		let item2JSON = JSON.parse(response.getBody());
		item2JSON.parentItem = parentKey;

		// Child attachment with note
		response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let item3JSON = JSON.parse(response.getBody());
		item3JSON.parentItem = parentKey;
		item3JSON.note = 'Test';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([item1JSON, item2JSON, item3JSON]),
			['Content-Type: application/json', `If-Unmodified-Since-Version: ${version}`]
		);
		assert413ForObject(response, false, 0);
		assert409ForObject(response, `Parent item ${parentKey} not found`, 1);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.failed[1].data.parentItem, parentKey);
		assert409ForObject(response, `Parent item ${parentKey} not found`, 2);
		assert.equal(responseJSON.failed[2].data.parentItem, parentKey);
	});

	// PHP: test_should_return_409_on_missing_collection
	it('should return 409 on missing collection', async function() {
		let missingCollectionKey = 'BDARG2AV';
		let response = await API.get('items/new?itemType=book');
		let json = JSON.parse(response.getBody());
		json.collections = [missingCollectionKey];

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert409ForObject(response, `Collection ${missingCollectionKey} not found`);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.failed[0].data.collection, missingCollectionKey);
	});

	// PHP: test_should_return_409_if_a_note_references_a_note_as_a_parent_item
	it('should return 409 if a note references a note as a parent item', async function() {
		let parentKey = await API.createNoteItem('<p>Parent</p>', null, 'key');

		let response = await API.get('items/new?itemType=note');
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;
		json.note = '<p>Child</p>';

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert409ForObject(response, 'Parent item cannot be a note or attachment');
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.failed[0].data.parentItem, parentKey);
	});

	// PHP: test_should_return_409_if_an_attachment_references_a_note_as_a_parent_item
	it('should return 409 if an attachment references a note as a parent item', async function() {
		let parentKey = await API.createNoteItem('<p>Parent</p>', null, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=imported_file');
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert409ForObject(response, 'Parent item cannot be a note or attachment');
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.failed[0].data.parentItem, parentKey);
	});

	// PHP: test_should_allow_emoji_in_title
	it('should allow emoji in title', async function() {
		let title = '🐶'; // 4-byte character

		let key = await API.createItem('book', { title: title }, 'key');

		// Test entry (JSON)
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		assert.include(response.getBody(), `"title": "${title}"`);

		// Test feed (JSON)
		response = await API.userGet(
			config.get('userID'),
			'items'
		);
		assert.include(response.getBody(), `"title": "${title}"`);
	});

	// PHP: test_should_not_return_empty_fields_from_newer_schema_to_old_client
	it('should not return empty fields from newer schema to old client', async function() {
		API.useSchemaVersion(false);

		let json = await API.createItem('book', {}, 'jsonData');
		let key = json.key;

		assert.property(json, 'originalDate');

		// Property should show up if schema version not specified
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`
		);
		assert200(response);
		assert.property(API.getJSONFromResponse(response).data, 'originalDate');

		// Property should show up in known schema version that has the field
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['Zotero-Schema-Version: 39']
		);
		assert200(response);
		assert.property(API.getJSONFromResponse(response).data, 'originalDate');

		// Property should show up in unknown future version
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['Zotero-Schema-Version: 3000']
		);
		assert200(response);
		assert.property(API.getJSONFromResponse(response).data, 'originalDate');

		// Property shouldn't show up in schema version 29
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['Zotero-Schema-Version: 29']
		);
		assert200(response);
		assert.notProperty(API.getJSONFromResponse(response).data, 'originalDate');

		// But should still show up if actually populated
		let originalDate = '1883';
		json.originalDate = originalDate;
		response = await API.userPut(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(json)
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['Zotero-Schema-Version: 29']
		);
		assert200(response);
		assert.property(API.getJSONFromResponse(response).data, 'originalDate');
		assert.equal(API.getJSONFromResponse(response).data.originalDate, originalDate);

		// Reset schema version
		API.resetSchemaVersion();
	});
});
