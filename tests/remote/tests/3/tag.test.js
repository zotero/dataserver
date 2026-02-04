/**
 * Tag API tests
 * Port of tests/remote/tests/API/3/TagTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert400ForObject,
	assert412,
	assert413ForObject,
	assert428,
	assertNumResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Tags', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	beforeEach(async function() {
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: test_empty_tag_should_be_ignored
	it('should ignore empty tag', async function() {
		let json = await API.getItemTemplate('book');
		json.tags = [
			{ tag: 'A' },
			{ tag: '', type: 1 }
		];
		let response = await API.postItem(json);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let data = responseJSON.successful[0].data;
		assert.deepEqual(data.tags, [{ tag: 'A' }]);
	});

	// PHP: test_empty_tag_with_whitespace_should_be_ignored
	it('should ignore empty tag with whitespace', async function() {
		let json = await API.getItemTemplate('book');
		json.tags = [
			{ tag: 'A' },
			{ tag: ' ', type: 1 }
		];
		let response = await API.postItem(json);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let data = responseJSON.successful[0].data;
		assert.deepEqual(data.tags, [{ tag: 'A' }]);
	});

	// PHP: testInvalidTagObject
	it('should reject invalid tag object', async function() {
		let json = await API.getItemTemplate('book');
		json.tags = [['invalid']];

		let response = await API.postItem(json);
		assert400ForObject(response, 'Tag must be an object');
	});

	// PHP: test_should_add_tag_to_item
	it('should add tag to item', async function() {
		let json = await API.getItemTemplate('book');
		json.tags = [{ tag: 'A' }];
		let response = await API.postItem(json);
		assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;

		json.tags.push({ tag: 'C' });
		response = await API.postItem(json);
		assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;

		json.tags.push({ tag: 'B' });
		response = await API.postItem(json);
		assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;

		json.tags.push({ tag: 'D' });
		let tags = json.tags;
		response = await API.postItem(json);
		assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;

		assert.deepEqual(tags, json.tags);
	});

	// PHP: test_utf8mb4_tag
	it('should handle utf8mb4 tag', async function() {
		let json = await API.getItemTemplate('book');
		let tag = '\uD83D\uDC3B'; // Bear emoji (4-byte character)
		json.tags = [{ tag: tag, type: 0 }];

		let response = await API.postItem(json);
		assert200ForObject(response);

		let newJSON = API.getJSONFromResponse(response).successful[0].data;
		assert.lengthOf(newJSON.tags, 1);
		assert.equal(json.tags[0].tag, newJSON.tags[0].tag);
	});

	// PHP: testTagTooLong
	it('should reject tag too long', async function() {
		let tag = 'x'.repeat(300);
		let json = await API.getItemTemplate('book');
		json.tags = [{ tag: tag, type: 1 }];

		let response = await API.postItem(json);
		assert413ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.failed[0].data.tag, tag);
	});

	// PHP: testItemTagSearch
	it('should handle item tag search', async function() {
		// Create items with tags
		let key1 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'key');

		let key2 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'key');

		// a (both)
		let response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=a'
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// a and c (#2)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=a&tag=c'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key2);

		// b and c (none)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=b&tag=c'
		);
		assert200(response);
		assert.isEmpty(response.getBody().trim());

		// b or c (both)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=b%20||%20c'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// a or b or c (both)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=a%20||%20b%20||%20c'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// not a (none)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=-a'
		);
		assert200(response);
		assert.isEmpty(response.getBody().trim());

		// not b (#2)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=-b'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key2);

		// (b or c) and a (both)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=b%20||%20c&tag=a'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// not nonexistent (both)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=-z'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 2);
		assert.include(keys, key1);
		assert.include(keys, key2);

		// B (case-insensitive search)
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&tag=B'
		);
		assert200(response);
		keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key1);
	});

	// PHP: test_should_handle_negation_in_top_requests
	it('should handle negation in top requests', async function() {
		// Create items with tags
		let key1 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'key');

		let key2 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'key');
		await API.createAttachmentItem('imported_url', {}, key1, 'jsonData');
		await API.createAttachmentItem('imported_url', {}, key2, 'jsonData');

		// not b in /top (#2)
		let response = await API.userGet(
			config.get('userID'),
			'items/top?format=keys&tag=-b'
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		assert.lengthOf(keys, 1);
		assert.include(keys, key2);
	});

	// PHP: testKeyedItemWithTags
	it('should handle keyed item with tags', async function() {
		let itemKey = API.generateKey();
		await API.createItem('book', {
			key: itemKey,
			version: 0,
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'responseJSON');

		let json = (await API.getItem(itemKey, 'json')).data;
		assert.lengthOf(json.tags, 2);
		assert.deepInclude(json.tags, { tag: 'a' });
		assert.deepInclude(json.tags, { tag: 'b' });
	});

	// PHP: test_tags_within_items
	it('should handle tags within items', async function() {
		let collectionKey = await API.createCollection('Collection', false, 'key');
		let item1Key = await API.createItem(
			'book',
			{
				title: 'Foo',
				tags: [
					{ tag: 'a' },
					{ tag: 'g' }
				]
			},
			'key'
		);
		// Child note
		await API.createItem(
			'note',
			{
				note: 'Test Note 1',
				parentItem: item1Key,
				tags: [
					{ tag: 'a' },
					{ tag: 'e' }
				]
			},
			'key'
		);
		// Another item
		await API.createItem(
			'book',
			{
				title: 'Bar',
				tags: [
					{ tag: 'b' }
				]
			},
			'key'
		);
		// Item within collection
		let item4Key = await API.createItem(
			'book',
			{
				title: 'Foo',
				collections: [collectionKey],
				tags: [
					{ tag: 'a' },
					{ tag: 'c' },
					{ tag: 'g' }
				]
			},
			'key'
		);
		// Child note within collection
		await API.createItem(
			'note',
			{
				note: 'Test Note 2',
				parentItem: item4Key,
				tags: [
					{ tag: 'a' },
					{ tag: 'f' }
				]
			},
			'key'
		);
		// Another item within collection
		await API.createItem(
			'book',
			{
				title: 'Bar',
				collections: [collectionKey],
				tags: [
					{ tag: 'd' }
				]
			},
			'key'
		);

		// All items, equivalent to /tags
		let response = await API.userGet(
			config.get('userID'),
			'items/tags'
		);
		assert200(response);
		assertNumResults(response, 7);
		let json = API.getJSONFromResponse(response);
		let tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);

		// Top-level items
		response = await API.userGet(
			config.get('userID'),
			'items/top/tags'
		);
		assert200(response);
		assertNumResults(response, 5);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'b', 'c', 'd', 'g']);

		// All items, filtered by 'tag', equivalent to /tags
		response = await API.userGet(
			config.get('userID'),
			'items/tags?tag=a'
		);
		assert200(response);
		assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		assert.deepEqual(json.map(t => t.tag), ['a']);

		// All items, filtered by 'itemQ'
		response = await API.userGet(
			config.get('userID'),
			'items/tags?itemQ=foo'
		);
		assert200(response);
		assertNumResults(response, 3);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'c', 'g']);

		response = await API.userGet(
			config.get('userID'),
			'items/tags?itemQ=bar'
		);
		assert200(response);
		assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['b', 'd']);

		response = await API.userGet(
			config.get('userID'),
			'items/tags?itemQ=Test%20Note'
		);
		assert200(response);
		assertNumResults(response, 3);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'e', 'f']);

		// All items with the given tags
		response = await API.userGet(
			config.get('userID'),
			'items/tags?itemTag=a&itemTag=g'
		);
		assert200(response);
		assertNumResults(response, 3);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'c', 'g']);

		// Disjoint tags
		response = await API.userGet(
			config.get('userID'),
			'items/tags?itemTag=a&itemTag=d'
		);
		assert200(response);
		assertNumResults(response, 0);

		// Items within a collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/tags`
		);
		assert200(response);
		assertNumResults(response, 5);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'c', 'd', 'f', 'g']);

		// Top-level items within a collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top/tags`
		);
		assert200(response);
		assertNumResults(response, 4);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'c', 'd', 'g']);

		// Search within a collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/tags?itemQ=Test%20Note`
		);
		assert200(response);
		assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'f']);

		// Items with the given tags within a collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/tags?itemTag=a&itemTag=g`
		);
		assert200(response);
		assertNumResults(response, 3);
		json = API.getJSONFromResponse(response);
		tagNames = json.map(t => t.tag).sort();
		assert.deepEqual(tagNames, ['a', 'c', 'g']);
	});

	// PHP: test_tags_within_items_within_empty_collection
	it('should handle tags within items within empty collection', async function() {
		let collectionKey = await API.createCollection('Empty collection', false, 'key');
		await API.createItem(
			'book',
			{
				title: 'Foo',
				tags: [
					{ tag: 'a' },
					{ tag: 'b' }
				]
			},
			'key'
		);

		let response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top/tags`
		);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: testTagSearch
	it('should handle tag search', async function() {
		let tags1 = ['a', 'aa', 'b'];
		let tags2 = ['b', 'c', 'cc'];

		await API.createItem('book', {
			tags: tags1.map(tag => ({ tag }))
		}, 'key');

		await API.createItem('book', {
			tags: tags2.map(tag => ({ tag }))
		}, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`tags?tag=${tags1.join('%20||%20')}`
		);
		assert200(response);
		assertNumResults(response, tags1.length);
	});

	// PHP: testTagQuery
	it('should handle tag query', async function() {
		let tags = ['a', 'abc', 'bab'];

		await API.createItem('book', {
			tags: tags.map(tag => ({ tag }))
		}, 'key');

		let response = await API.userGet(
			config.get('userID'),
			'tags?q=ab'
		);
		assert200(response);
		assertNumResults(response, 2);

		response = await API.userGet(
			config.get('userID'),
			'tags?q=ab&qmode=startswith'
		);
		assert200(response);
		assertNumResults(response, 1);
	});

	// PHP: testOrphanedTag
	it('should handle orphaned tag', async function() {
		let json = await API.createItem('book', {
			tags: [{ tag: 'a' }]
		}, 'jsonData');
		let libraryVersion1 = json.version;
		let itemKey1 = json.key;

		await API.createItem('book', {
			tags: [{ tag: 'b' }]
		}, 'jsonData');

		await API.createItem('book', {
			tags: [{ tag: 'b' }]
		}, 'jsonData');

		let response = await API.userDelete(
			config.get('userID'),
			`items/${itemKey1}`,
			[`If-Unmodified-Since-Version: ${libraryVersion1}`]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			'tags'
		);
		assert200(response);
		assertNumResults(response, 1);
		json = API.getJSONFromResponse(response)[0];
		assert.equal(json.tag, 'b');
	});

	// PHP: testTagNewer
	it('should handle tag newer', async function() {
		// Create items with tags
		await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'key');

		let version = await API.getLibraryVersion();

		// 'newer' shouldn't return any results
		let response = await API.userGet(
			config.get('userID'),
			`tags?newer=${version}`
		);
		assert200(response);
		assertNumResults(response, 0);

		// Create another item with tags
		await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'key');

		// 'newer' should return new tag (JSON)
		response = await API.userGet(
			config.get('userID'),
			`tags?newer=${version}`
		);
		assert200(response);
		assertNumResults(response, 1);
		assert.isAbove(parseInt(response.getHeader('Last-Modified-Version')), version);
		let json = API.getJSONFromResponse(response)[0];
		assert.equal(json.tag, 'c');
		assert.equal(json.meta.type, 0);
	});

	// PHP: testMultiTagDelete
	it('should handle multi tag delete', async function() {
		let tags1 = ['a', 'aa', 'b'];
		let tags2 = ['b', 'c', 'cc'];
		let tags3 = ['Foo'];

		await API.createItem('book', {
			tags: tags1.map(tag => ({ tag }))
		}, 'key');

		await API.createItem('book', {
			tags: tags2.map(tag => ({ tag, type: 1 }))
		}, 'key');

		await API.createItem('book', {
			tags: tags3.map(tag => ({ tag }))
		}, 'key');

		let libraryVersion = await API.getLibraryVersion();

		// Missing version header
		let response = await API.userDelete(
			config.get('userID'),
			`tags?tag=${[...tags1, ...tags2].join('%20||%20')}`
		);
		assert428(response);

		// Outdated version header
		response = await API.userDelete(
			config.get('userID'),
			`tags?tag=${[...tags1, ...tags2].join('%20||%20')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion - 1}`]
		);
		assert412(response);

		// Delete
		response = await API.userDelete(
			config.get('userID'),
			`tags?tag=${[...tags1, ...tags2].join('%20||%20')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);

		// Make sure they're gone
		response = await API.userGet(
			config.get('userID'),
			`tags?tag=${[...tags1, ...tags2, ...tags3].join('%20||%20')}`
		);
		assert200(response);
		assertNumResults(response, 1);
	});

	// PHP: test_deleting_a_tag_should_update_a_linked_item
	it('should update linked item when deleting a tag', async function() {
		let tags = ['a', 'aa', 'b'];

		let itemKey = await API.createItem('book', {
			tags: tags.map(tag => ({ tag }))
		}, 'key');

		let libraryVersion = await API.getLibraryVersion();

		// Make sure they're on the item
		let json = await API.getItem(itemKey, 'json');
		assert.deepEqual(
			tags,
			json.data.tags.map(t => t.tag)
		);

		// Delete
		let response = await API.userDelete(
			config.get('userID'),
			`tags?tag=${tags[0]}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);

		// Make sure they're gone from the item
		response = await API.userGet(
			config.get('userID'),
			`items?since=${libraryVersion}`
		);
		assert200(response);
		assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		assert.deepEqual(
			json[0].data.tags.map(t => t.tag),
			tags.slice(1)
		);
	});

	// PHP: testTagAddItemVersionChange
	it('should handle tag add item version change', async function() {
		let data1 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'b' }
			]
		}, 'jsonData');
		let version1 = data1.version;

		let data2 = await API.createItem('book', {
			tags: [
				{ tag: 'a' },
				{ tag: 'c' }
			]
		}, 'jsonData');
		let version2 = data2.version;

		// Remove tag 'a' from item 1
		data1.tags = [
			{ tag: 'd' },
			{ tag: 'c' }
		];

		let response = await API.postItem(data1);
		assert200(response);

		// Item 1 version should be one greater than last update
		let json1 = await API.getItem(data1.key, 'json');
		assert.equal(version2 + 1, json1.version);

		// Item 2 version shouldn't have changed
		let json2 = await API.getItem(data2.key, 'json');
		assert.equal(version2, json2.version);
	});

	// PHP: test_should_change_case_of_existing_tag
	it('should change case of existing tag', async function() {
		let data1 = await API.createItem('book', {
			tags: [{ tag: 'a' }]
		}, 'jsonData');
		let data2 = await API.createItem('book', {
			tags: [{ tag: 'a' }]
		}, 'jsonData');
		let version = data1.version;

		// Change tag case on one item
		data1.tags = [{ tag: 'A' }];

		let response = await API.postItem(data1);
		assert200(response);
		assert200ForObject(response);

		// Item version should be one greater than last update
		data1 = (await API.getItem(data1.key, 'json')).data;
		data2 = (await API.getItem(data2.key, 'json')).data;
		assert.equal(version + 1, data2.version);
		assert.lengthOf(data1.tags, 1);
		assert.deepInclude(data1.tags, { tag: 'A' });
		assert.deepInclude(data2.tags, { tag: 'a' });
	});

	// PHP: testTagDiacritics
	it('should handle tag diacritics', async function() {
		let data = await API.createItem('book', {
			tags: [{ tag: '\u00EBtest' }] // ëtest
		}, 'jsonData');
		let version = data.version;

		// Add 'etest', without accent
		data.tags = [
			{ tag: '\u00EBtest' }, // ëtest
			{ tag: 'etest' }
		];

		let response = await API.postItem(data);
		assert200(response);
		assert200ForObject(response);

		// Item version should be one greater than last update
		data = (await API.getItem(data.key, 'json')).data;
		assert.equal(version + 1, data.version);
		assert.lengthOf(data.tags, 2);
		assert.deepInclude(data.tags, { tag: '\u00EBtest' }); // ëtest
		assert.deepInclude(data.tags, { tag: 'etest' });
	});

	// PHP: test_should_create_a_0_tag
	it('should create a 0 tag', async function() {
		let data = await API.createItem('book', {
			tags: [{ tag: '0' }]
		}, 'jsonData');

		assert.lengthOf(data.tags, 1);
		assert.equal(data.tags[0].tag, '0');
	});
});
