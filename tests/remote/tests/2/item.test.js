/**
 * Item tests for API v2
 * Port of tests/remote/tests/API/2/ItemTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert400ForObject,
	assert412,
	assertNumResults
} from '../../assertions2.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Items (API v2)', function () {
	this.timeout(60000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	// PHP: testNewEmptyBookItem
	it('should create new empty book item', async function () {
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(json.itemType, 'book');
	});

	// PHP: testNewEmptyBookItemMultiple
	it('should create new empty book item multiple', async function () {
		let json = await API.getItemTemplate('book');

		let data = [];
		json.title = 'A';
		data.push({ ...json });
		json.title = 'B';
		data.push({ ...json });
		json.title = 'C';
		data.push({ ...json });

		let response = await API.postItems(data);
		assert200(response);
		let responseJSON = API.getJSONFromResponse(response);

		let xml = await API.getItemXML(Object.values(responseJSON.success));
		let contents = xpathSelect(xml, '/atom:feed/atom:entry/atom:content/text()');

		let content = JSON.parse(contents[0].nodeValue);
		assert.equal(content.title, 'A');
		content = JSON.parse(contents[1].nodeValue);
		assert.equal(content.title, 'B');
		content = JSON.parse(contents[2].nodeValue);
		assert.equal(content.title, 'C');
	});

	// PHP: testEditBookItem
	it('should edit book item', async function () {
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;
		let version = data.version;
		let json = JSON.parse(data.content);

		let newTitle = 'New Title';
		let numPages = 100;
		let creatorType = 'author';
		let firstName = 'Firstname';
		let lastName = 'Lastname';

		json.title = newTitle;
		json.numPages = numPages;
		json.creators.push({
			creatorType: creatorType,
			firstName: firstName,
			lastName: lastName
		});

		let response = await API.userPut(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		xml = await API.getItemXML(key);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		assert.equal(json.title, newTitle);
		assert.equal(json.numPages, numPages);
		assert.equal(json.creators[0].creatorType, creatorType);
		assert.equal(json.creators[0].firstName, firstName);
		assert.equal(json.creators[0].lastName, lastName);
	});

	// PHP: testDateModified
	it('should handle dateModified', async function () {
		let itemData = { title: 'Test' };
		let xml = await API.createItem('videoRecording', itemData, 'atom');

		let data = API.parseDataFromAtomEntry(xml);
		let objectKey = data.key;
		let json = JSON.parse(data.content);
		let dateModified1 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true).nodeValue;

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		// If no explicit dateModified, use current timestamp
		json.title = 'Test 2';
		let response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(objectKey);
		let dateModified2 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true).nodeValue;
		assert.notEqual(dateModified1, dateModified2);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		// Make sure we're in the next second
		await new Promise(resolve => setTimeout(resolve, 1100));

		// If existing dateModified, use current timestamp
		json.title = 'Test 3';
		json.dateModified = dateModified2.replace(/[TZ]/g, ' ').trim();
		response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(objectKey);
		let dateModified3 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true).nodeValue;
		assert.notEqual(dateModified2, dateModified3);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		// If explicit dateModified, use that
		let newDateModified = '2013-03-03 21:33:53';
		json.title = 'Test 4';
		json.dateModified = newDateModified;
		response = await API.userPut(
			config.get('userID'),
			`items/${objectKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		xml = await API.getItemXML(objectKey);
		let dateModified4 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true).nodeValue;
		assert.equal(newDateModified, dateModified4.replace(/[TZ]/g, ' ').trim());
	});

	// PHP: testDateAccessedInvalid
	it('should ignore invalid dateAccessed', async function () {
		let date = 'February 1, 2014';
		let xml = await API.createItem('book', {
			accessDate: date
		}, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		// Invalid dates should be ignored
		assert.equal(json.accessDate, '');
	});

	// PHP: testChangeItemType
	it('should change item type', async function () {
		let json = await API.getItemTemplate('book');
		json.title = 'Foo';
		json.numPages = 100;
		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		let key = API.getFirstSuccessKeyFromResponse(response);
		let xml = await API.getItemXML(key);
		let data = API.parseDataFromAtomEntry(xml);
		let version = data.version;
		let json1 = JSON.parse(data.content);

		let json2 = await API.getItemTemplate('bookSection');

		for (let field in json2) {
			if (field !== 'itemType' && json1[field] !== undefined) {
				json2[field] = json1[field];
			}
		}

		response = await API.userPut(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}`,
			JSON.stringify(json2),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		xml = await API.getItemXML(key);
		data = API.parseDataFromAtomEntry(xml);
		let json3 = JSON.parse(data.content);
		assert.equal(json3.itemType, 'bookSection');
		assert.equal(json3.title, 'Foo');
		assert.notProperty(json3, 'numPages');
	});

	// PHP: testModifyItemPartial
	it('should modify item partially with PATCH', async function () {
		let itemData = { title: 'Test' };
		let xml = await API.createItem('book', itemData, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let itemKey = data.key;
		let itemVersion = json.itemVersion;

		// Modify with PATCH
		let newData = { date: '2013' };
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

		xml = await API.getItemXML(itemKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		assert.equal(json.title, 'Test');
		assert.equal(json.date, '2013');
	});

	// PHP: testNewComputerProgramItem
	it('should create new computerProgram item', async function () {
		let xml = await API.createItem('computerProgram', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;
		let json = JSON.parse(data.content);
		assert.equal(json.itemType, 'computerProgram');

		let version = '1.0';
		json.version = version;

		let response = await API.userPut(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${data.version}`
			]
		);
		assert204(response);

		xml = await API.getItemXML(key);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.version, version);

		// 'versionNumber' from v3 should work too
		delete json.version;
		version = '1.1';
		json.versionNumber = version;
		response = await API.userPut(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		xml = await API.getItemXML(key);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.version, version);
	});

	// PHP: testNewInvalidBookItem
	it('should reject invalid book item', async function () {
		let json = await API.getItemTemplate('book');

		// Missing item type
		let json2 = { ...json };
		delete json2.itemType;
		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json2]
			}),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'itemType' property not provided");

		// contentType on non-attachment
		json2 = { ...json };
		json2.contentType = 'text/html';
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json2]
			}),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'contentType' is valid only for attachment items");
	});

	// PHP: testEditTopLevelNote
	it('should edit top level note', async function () {
		let xml = await API.createNoteItem('<p>Test</p>', null, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let noteText = '<p>Test Test</p>';
		json.note = noteText;
		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}&content=json`
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.note, noteText);
	});

	// PHP: testEditChildNote
	it('should edit child note', async function () {
		let key = await API.createItem('book', { title: 'Test' }, 'key');
		let xml = await API.createNoteItem('<p>Test</p>', key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let noteText = '<p>Test Test</p>';
		json.note = noteText;
		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}&content=json`
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.note, noteText);
	});

	// PHP: testEditTitleWithCollectionInMultipleMode
	it('should edit title with collection in multiple mode', async function () {
		let collectionKey = await API.createCollection('Test', false, 'key');

		let xml = await API.createItem('book', {
			title: 'A',
			collections: [collectionKey]
		}, 'atom');

		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let version = json.itemVersion;
		json.title = 'B';

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			})
		);
		assert200ForObject(response);

		xml = await API.getItemXML(json.itemKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.title, 'B');
		assert.isAbove(json.itemVersion, version);
	});

	// PHP: testNewTopLevelImportedFileAttachment
	it('should create new top level imported file attachment', async function () {
		let response = await API.get('items/new?itemType=attachment&linkMode=imported_file');
		let json = JSON.parse(response.getBody());

		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert200(response);
	});

	// PHP: testNewEmptyLinkAttachmentItem
	it('should create new empty link attachment item', async function () {
		let key = await API.createItem('book', false, 'key');
		let xml = await API.createAttachmentItem('linked_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		assert.isNotNull(data.key);
	});

	// PHP: testEditLinkAttachmentItem
	it('should edit link attachment item', async function () {
		let key = await API.createItem('book', false, 'key');
		let xml = await API.createAttachmentItem('linked_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);

		let attachmentKey = data.key;
		let version = data.version;
		let json = JSON.parse(data.content);

		let contentType = 'text/xml';
		let charset = 'utf-8';

		json.contentType = contentType;
		json.charset = charset;

		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		xml = await API.getItemXML(attachmentKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.contentType, contentType);
		assert.equal(json.charset, charset);
	});

	// PHP: testNewAttachmentItemInvalidLinkMode
	it('should reject attachment item with invalid link mode', async function () {
		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());

		// Invalid linkMode
		json.linkMode = 'invalidName';
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'invalidName' is not a valid linkMode");

		// Missing linkMode
		delete json.linkMode;
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'linkMode' property not provided");
	});

	// PHP: testMappedCreatorTypes
	it('should handle mapped creator types', async function () {
		let json = {
			items: [
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
			]
		};
		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify(json)
		);
		// 'author' gets mapped automatically
		assert200ForObject(response);
		// Others don't
		assert400ForObject(response, false, 1);
	});

	// PHP: testNumChildren
	it('should count numChildren', async function () {
		let xml = await API.createItem('book', false, 'atom');
		// Note: createItem returns a feed, so /atom:entry/... doesn't match at root
		// PHP test passes because (int) array_get_first([]) == (int) null == 0
		let numChildren = xpathSelect(xml, '/atom:entry/zapi:numChildren', true);
		assert.equal(parseInt(numChildren ? numChildren.textContent : 0), 0);
		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;

		await API.createAttachmentItem('linked_url', {}, key, 'key');

		// Single item request returns <atom:entry> as root, so xpath works
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		numChildren = xpathSelect(xml, '/atom:entry/zapi:numChildren', true);
		assert.equal(parseInt(numChildren.textContent), 1);

		await API.createNoteItem('Test', key, 'key');

		response = await API.userGet(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		numChildren = xpathSelect(xml, '/atom:entry/zapi:numChildren', true);
		assert.equal(parseInt(numChildren.textContent), 2);
	});

	// PHP: testEditTitleWithTagInMultipleMode
	it('should edit title with tag in multiple mode', async function () {
		let tag1 = { tag: 'foo', type: 1 };
		let tag2 = { tag: 'bar' };

		let xml = await API.createItem('book', {
			title: 'A',
			tags: [tag1]
		}, 'atom');

		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.lengthOf(json.tags, 1);
		assert.deepEqual(json.tags[0], tag1);

		let version = json.itemVersion;
		json.title = 'B';
		json.tags.push(tag2);

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			})
		);
		assert200ForObject(response);

		xml = await API.getItemXML(json.itemKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.equal(json.title, 'B');
		assert.isAbove(json.itemVersion, version);
		assert.lengthOf(json.tags, 2);
		assert.includeDeepMembers(json.tags, [tag1, tag2]);
	});

	// PHP: testNewEmptyImportedURLAttachmentItem
	it('should create new empty imported URL attachment item', async function () {
		let key = await API.createItem('book', false, 'key');
		let xml = await API.createAttachmentItem('imported_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		assert.isNotNull(data.key);
	});

	// PHP: testEditEmptyLinkAttachmentItem
	it('should edit empty link attachment item', async function () {
		let key = await API.createItem('book', false, 'key');
		let xml = await API.createAttachmentItem('linked_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);

		let attachmentKey = data.key;
		let version = data.version;
		let json = JSON.parse(data.content);

		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		xml = await API.getItemXML(attachmentKey);
		data = API.parseDataFromAtomEntry(xml);
		// Item shouldn't change
		assert.equal(version, data.version);
	});

	// PHP: testNewAttachmentItemMD5OnLinkedURL
	it('should reject MD5 on linked URL attachment', async function () {
		let parentKey = await API.createItem('book', false, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;

		json.md5 = 'c7487a750a97722ae1878ed46b215ebe';
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'md5' is valid only for imported and embedded-image attachments");
	});

	// PHP: testNewAttachmentItemModTimeOnLinkedURL
	it('should reject mtime on linked URL attachment', async function () {
		let parentKey = await API.createItem('book', false, 'key');

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;

		json.mtime = '1332807793000';
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'mtime' is valid only for imported and embedded-image attachments");
	});

	// PHP: testParentItemPatch
	it('should handle parent item with PATCH', async function () {
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;

		xml = await API.createAttachmentItem('linked_url', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let childKey = data.key;
		let childVersion = data.version;

		assert.property(json, 'parentItem');
		assert.equal(json.parentItem, parentKey);

		let patchJson = { title: 'Test' };

		// With PATCH, parent shouldn't be removed even though unspecified
		let response = await API.userPatch(
			config.get('userID'),
			`items/${childKey}?key=${config.get('apiKey')}`,
			JSON.stringify(patchJson),
			[`If-Unmodified-Since-Version: ${childVersion}`]
		);
		assert204(response);

		xml = await API.getItemXML(childKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.property(json, 'parentItem');
	});

	// PHP: testParentItem
	it('should handle parent item', async function () {
		let xml = await API.createItem('book', false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let parentKey = data.key;
		let parentVersion = data.version;

		xml = await API.createAttachmentItem('linked_url', {}, parentKey, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		let childKey = data.key;
		let childVersion = data.version;

		assert.property(json, 'parentItem');
		assert.equal(json.parentItem, parentKey);

		// Remove the parent, making the child a standalone attachment
		delete json.parentItem;

		// Remove version property, to test header
		delete json.itemVersion;

		// The parent item version should have been updated when a child
		// was added, so this should fail
		let response = await API.userPut(
			config.get('userID'),
			`items/${childKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${parentVersion}`]
		);
		assert412(response);

		response = await API.userPut(
			config.get('userID'),
			`items/${childKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${childVersion}`]
		);
		assert204(response);

		xml = await API.getItemXML(childKey);
		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);
		assert.notProperty(json, 'parentItem');
	});

	// PHP: testDate
	it('should handle date', async function () {
		let date = 'Sept 18, 2012';

		let xml = await API.createItem('book', { date: date }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}&content=json`
		);
		xml = API.getXMLFromResponse(response);
		data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(json.date, date);

		let year = xpathSelect(xml, '/atom:entry/zapi:year/text()', true);
		assert.equal(year.nodeValue, '2012');
	});

	// PHP: testUnicodeTitle
	it('should handle unicode title', async function () {
		let title = 'Tést';

		let xml = await API.createItem('book', { title: title }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let key = data.key;

		// Test entry
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}?key=${config.get('apiKey')}&content=json`
		);
		assert.include(response.getBody(), '"title": "Tést"');

		// Test feed
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&content=json`
		);
		assert.include(response.getBody(), '"title": "Tést"');
	});

	// PHP: testEditEmptyImportedURLAttachmentItem
	it('should edit empty imported URL attachment item', async function () {
		let key = await API.createItem('book', false, 'key');
		let xml = await API.createAttachmentItem('imported_url', {}, key, 'atom');
		let data = API.parseDataFromAtomEntry(xml);

		let attachmentKey = data.key;
		let version = data.version;
		let json = JSON.parse(data.content);

		let response = await API.userPut(
			config.get('userID'),
			`items/${attachmentKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		xml = await API.getItemXML(attachmentKey);
		data = API.parseDataFromAtomEntry(xml);
		// Item shouldn't change
		assert.equal(version, data.version);
	});

	// PHP: testNewEmptyLinkAttachmentItemWithItemKey
	it('should create new empty link attachment item with itemKey', async function () {
		let key = await API.createItem('book', false, 'key');
		await API.createAttachmentItem('linked_url', {}, key, 'atom');

		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		json.parentItem = key;
		// Generate a random 8-character key
		json.itemKey = Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]
		).join('');
		json.itemVersion = 0;

		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
	});

	// PHP: testEditAttachmentUpdatedTimestamp
	it('should update attachment timestamp on edit', async function () {
		let xml = await API.createAttachmentItem('linked_file', {}, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let atomUpdated = xpathSelect(xml, '//atom:entry/atom:updated/text()', true).nodeValue;
		let json = JSON.parse(data.content);
		json.note = 'Test';

		await new Promise(resolve => setTimeout(resolve, 1100));

		let response = await API.userPut(
			config.get('userID'),
			`items/${data.key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[`If-Unmodified-Since-Version: ${data.version}`]
		);
		assert204(response);

		xml = await API.getItemXML(data.key);
		let atomUpdated2 = xpathSelect(xml, '//atom:entry/atom:updated/text()', true).nodeValue;
		assert.notEqual(atomUpdated2, atomUpdated);
	});

	// PHP: testTop
	it('should handle top items endpoint', async function () {
		await API.userClear(config.get('userID'));

		let collectionKey = await API.createCollection('Test', false, 'key');

		let parentTitle1 = 'Parent Title';
		let childTitle1 = 'This is a Test Title';
		let parentTitle2 = 'Another Parent Title';
		let parentTitle3 = 'Yet Another Parent Title';
		let noteText = 'This is a sample note.';
		let parentTitleSearch = 'title';
		let childTitleSearch = 'test';
		let dates = ['2013', 'January 3, 2010', ''];
		let orderedDates = [dates[2], dates[1], dates[0]];
		let itemTypes = ['journalArticle', 'newspaperArticle', 'book'];

		let parentKeys = [];
		let childKeys = [];

		parentKeys.push(await API.createItem(itemTypes[0], {
			title: parentTitle1,
			date: dates[0],
			collections: [collectionKey]
		}, 'key'));
		childKeys.push(await API.createAttachmentItem('linked_url', {
			title: childTitle1
		}, parentKeys[0], 'key'));

		parentKeys.push(await API.createItem(itemTypes[1], {
			title: parentTitle2,
			date: dates[1]
		}, 'key'));
		childKeys.push(await API.createNoteItem(noteText, parentKeys[1], 'key'));

		// Create item with deleted child that matches child title search
		parentKeys.push(await API.createItem(itemTypes[2], {
			title: parentTitle3
		}, 'key'));
		await API.createAttachmentItem('linked_url', {
			title: childTitle1,
			deleted: true
		}, parentKeys[parentKeys.length - 1], 'key');

		// Add deleted item with non-deleted child
		let deletedKey = await API.createItem('book', {
			title: 'This is a deleted item',
			deleted: true
		}, 'key');
		await API.createNoteItem('This is a child note of a deleted item.', deletedKey, 'key');

		// /top, Atom
		let response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		let xml = API.getXMLFromResponse(response);
		let xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		let keys = xpath.map(n => n.nodeValue);
		assert.lengthOf(keys, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(keys, parentKey);
		}

		// /top, Atom, in collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&content=json`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		keys = xpath.map(n => n.nodeValue);
		assert.lengthOf(keys, 1);
		assert.include(keys, parentKeys[0]);

		// /top, keys
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&format=keys`
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(keys, parentKey);
		}

		// /top, keys, in collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&format=keys`
		);
		assert200(response);
		assert.equal(parentKeys[0], response.getBody().trim());

		// /top with itemKey for parent, Atom
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&itemKey=${parentKeys[0]}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		assert.equal(parentKeys[0], xpath[0].nodeValue);

		// /top with itemKey for parent, Atom, in collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&content=json&itemKey=${parentKeys[0]}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		assert.equal(parentKeys[0], xpath[0].nodeValue);

		// /top with itemKey for parent, keys
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&format=keys&itemKey=${parentKeys[0]}`
		);
		assert200(response);
		assert.equal(parentKeys[0], response.getBody().trim());

		// /top with itemKey for parent, keys, in collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&format=keys&itemKey=${parentKeys[0]}`
		);
		assert200(response);
		assert.equal(parentKeys[0], response.getBody().trim());

		// /top with itemKey for child, Atom
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&itemKey=${childKeys[0]}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		assert.equal(parentKeys[0], xpath[0].nodeValue);

		// /top with itemKey for child, keys
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&format=keys&itemKey=${childKeys[0]}`
		);
		assert200(response);
		assert.equal(parentKeys[0], response.getBody().trim());

		// /top, Atom, with q for all items
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		keys = xpath.map(n => n.nodeValue);
		assert.lengthOf(keys, parentKeys.length);
		for (let parentKey of parentKeys) {
			assert.include(keys, parentKey);
		}

		// /top, Atom, in collection, with q for all items
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		keys = xpath.map(n => n.nodeValue);
		assert.lengthOf(keys, 1);
		assert.include(keys, parentKeys[0]);

		// /top, Atom, with q for child item
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${childTitleSearch}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		keys = xpath.map(n => n.nodeValue);
		assert.lengthOf(keys, 1);
		assert.include(keys, parentKeys[0]);

		// /top, Atom, in collection, with q for child item
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&content=json&q=${childTitleSearch}`
		);
		assert200(response);
		assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:key/text()');
		keys = xpath.map(n => n.nodeValue);
		assert.lengthOf(keys, 1);
		assert.include(keys, parentKeys[0]);

		// /top, Atom, with q for all items, ordered by title
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}&order=title`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/atom:title/text()');
		assert.lengthOf(xpath, parentKeys.length);
		let orderedTitles = [parentTitle1, parentTitle2, parentTitle3];
		orderedTitles.sort();
		let orderedResults = xpath.map(n => n.nodeValue);
		assert.deepEqual(orderedTitles, orderedResults);

		// /top, Atom, with q for all items, ordered by date asc
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}&order=date&sort=asc`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/atom:content/text()');
		assert.lengthOf(xpath, parentKeys.length);
		orderedResults = xpath.map(n => JSON.parse(n.nodeValue).date);
		assert.deepEqual(orderedDates, orderedResults);

		// /top, Atom, with q for all items, ordered by date desc
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}&order=date&sort=desc`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/atom:content/text()');
		assert.lengthOf(xpath, parentKeys.length);
		let orderedDatesReverse = [...orderedDates].reverse();
		orderedResults = xpath.map(n => JSON.parse(n.nodeValue).date);
		assert.deepEqual(orderedDatesReverse, orderedResults);

		// /top, Atom, with q for all items, ordered by item type asc
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}&order=itemType`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:itemType/text()');
		assert.lengthOf(xpath, parentKeys.length);
		let orderedItemTypes = [...itemTypes];
		orderedItemTypes.sort();
		orderedResults = xpath.map(n => n.nodeValue);
		assert.deepEqual(orderedItemTypes, orderedResults);

		// /top, Atom, with q for all items, ordered by item type desc
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&content=json&q=${parentTitleSearch}&order=itemType&sort=desc`
		);
		assert200(response);
		assertNumResults(response, parentKeys.length);
		xml = API.getXMLFromResponse(response);
		xpath = xpathSelect(xml, '//atom:entry/zapi:itemType/text()');
		assert.lengthOf(xpath, parentKeys.length);
		orderedItemTypes = [...itemTypes];
		orderedItemTypes.sort();
		orderedItemTypes.reverse();
		orderedResults = xpath.map(n => n.nodeValue);
		assert.deepEqual(orderedItemTypes, orderedResults);
	});
});
