const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('TagTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});
	beforeEach(async function () {
		await API.userClear(config.userID);
	});

	it('test_empty_tag_including_whitespace_should_be_ignored', async function () {
		let json = await API.getItemTemplate("book");
		json.tags.push({ tag: "A" });
		json.tags.push({ tag: "", type: 1 });
		json.tags.push({ tag: " ", type: 1 });


		let response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		assert.deepEqual(json.successful[0].data.tags, [{ tag: 'A' }]);
	});

	it('testInvalidTagObject', async function () {
		let json = await API.getItemTemplate("book");
		json.tags.push(["invalid"]);

		let headers = { "Content-Type": "application/json" };
		let response = await API.postItem(json, headers);

		Helpers.assert400ForObject(response, { message: "Tag must be an object" });
	});

	it('test_should_add_tag_to_item', async function () {
		let json = await API.getItemTemplate("book");
		json.tags.push({ tag: "A" });

		let response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;
		
		json.tags.push({ tag: "C" });
		response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;
		
		json.tags.push({ tag: "B" });
		response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0].data;
		
		json.tags.push({ tag: "D" });
		response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		let tags = json.tags;
		json = API.getJSONFromResponse(response).successful[0].data;
		
		assert.deepEqual(tags, json.tags);
	});
	

	it('testTagSearch', async function () {
		const tags1 = ["a", "aa", "b"];
		const tags2 = ["b", "c", "cc"];

		await API.createItem("book", {
			tags: tags1.map((tag) => {
				return { tag: tag };
			})
		}, true, 'key');

		await API.createItem("book", {
			tags: tags2.map((tag) => {
				return { tag: tag };
			})
		}, true, 'key');

		let response = await API.userGet(
			config.userID,
			"tags?tag=" + tags1.join("%20||%20"),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, tags1.length);
	});

	it('testTagNewer', async function () {
		// Create items with tags
		await API.createItem("book", {
			tags: [
				{ tag: "a" },
				{ tag: "b" }
			]
		}, true);

		const version = await API.getLibraryVersion();

		// 'newer' shouldn't return any results
		let response = await API.userGet(
			config.userID,
			`tags?newer=${version}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 0);

		// Create another item with tags
		await API.createItem("book", {
			tags: [
				{ tag: "a" },
				{ tag: "c" }
			]
		}, true);

		// 'newer' should return new tag Atom
		response = await API.userGet(
			config.userID,
			`tags?content=json&newer=${version}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
		assert.isAbove(parseInt(response.headers['last-modified-version']), parseInt(version));
		let xml = API.getXMLFromResponse(response);
		let data = API.parseDataFromAtomEntry(xml);
		data = JSON.parse(data.content);
		assert.strictEqual(data.tag, 'c');
		assert.strictEqual(data.type, 0);


		// 'newer' should return new tag (JSON)
		response = await API.userGet(
			config.userID,
			`tags?newer=${version}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
		assert.isAbove(parseInt(response.headers['last-modified-version']), parseInt(version));
		let json = API.getJSONFromResponse(response)[0];
		assert.strictEqual(json.tag, 'c');
		assert.strictEqual(json.meta.type, 0);
	});

	it('testMultiTagDelete', async function () {
		const tags1 = ["a", "aa", "b"];
		const tags2 = ["b", "c", "cc"];
		const tags3 = ["Foo"];

		await API.createItem("book", {
			tags: tags1.map(tag => ({ tag: tag }))
		}, true, 'key');

		await API.createItem("book", {
			tags: tags2.map(tag => ({ tag: tag, type: 1 }))
		}, true, 'key');

		await API.createItem("book", {
			tags: tags3.map(tag => ({ tag: tag }))
		}, true, 'key');

		let libraryVersion = await API.getLibraryVersion();
		libraryVersion = parseInt(libraryVersion);

		// Missing version header
		let response = await API.userDelete(
			config.userID,
			`tags?content=json&tag=${tags1.concat(tags2).map(tag => encodeURIComponent(tag)).join("%20||%20")}`
		);
		Helpers.assertStatusCode(response, 428);

		// Outdated version header
		response = await API.userDelete(
			config.userID,
			`tags?content=json&tag=${tags1.concat(tags2).map(tag => encodeURIComponent(tag)).join("%20||%20")}`,
			{ "If-Unmodified-Since-Version": `${libraryVersion - 1}` }
		);
		Helpers.assertStatusCode(response, 412);

		// Delete
		response = await API.userDelete(
			config.userID,
			`tags?content=json&tag=${tags1.concat(tags2).map(tag => encodeURIComponent(tag)).join("%20||%20")}`,
			{ "If-Unmodified-Since-Version": `${libraryVersion}` }
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure they're gone
		response = await API.userGet(
			config.userID,
			`tags?content=json&tag=${tags1.concat(tags2, tags3).map(tag => encodeURIComponent(tag)).join("%20||%20")}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
	});

	/**
	 * When modifying a tag on an item, only the item itself should have its
	 * version updated, not other items that had (and still have) the same tag
	 */
	it('testTagAddItemVersionChange', async function () {
		let data1 = await API.createItem("book", {
			tags: [{
				tag: "a"
			},
			{
				tag: "b"
			}]
		}, true, 'jsonData');

		let data2 = await API.createItem("book", {
			tags: [{
				tag: "a"
			},
			{
				tag: "c"
			}]
		}, true, 'jsonData');
		
		let version2 = data2.version;
		version2 = parseInt(version2);
		
		// Remove tag 'a' from item 1
		data1.tags = [{
			tag: "d"
		},
		{
			tag: "c"
		}];

		let response = await API.postItem(data1);
		Helpers.assertStatusCode(response, 200);

		// Item 1 version should be one greater than last update
		let json1 = await API.getItem(data1.key, true, 'json');
		assert.equal(parseInt(json1.version), version2 + 1);

		// Item 2 version shouldn't have changed
		let json2 = await API.getItem(data2.key, true, 'json');
		assert.equal(parseInt(json2.version), version2);
	});

	it('testItemTagSearch', async function () {
		// Create items with tags
		let key1 = await API.createItem("book", {
			tags: [
				{ tag: "a" },
				{ tag: "b" }
			]
		}, true, 'key');

		let key2 = await API.createItem("book", {
			tags: [
				{ tag: "a" },
				{ tag: "c" }
			]
		}, true, 'key');

		let checkTags = async function (tagComponent, assertingKeys = []) {
			let response = await API.userGet(
				config.userID,
				`items?format=keys&${tagComponent}`
			);
			Helpers.assertStatusCode(response, 200);
			if (assertingKeys.length != 0) {
				let keys = response.data.trim().split("\n");

				assert.equal(keys.length, assertingKeys.length);
				for (let assertingKey of assertingKeys) {
					assert.include(keys, assertingKey);
				}
			}
			else {
				assert.isEmpty(response.data.trim());
			}
			return response;
		};

		// Searches
		await checkTags("tag=a", [key2, key1]);
		await checkTags("tag=a&tag=c", [key2]);
		await checkTags("tag=b&tag=c", []);
		await checkTags("tag=b%20||%20c", [key1, key2]);
		await checkTags("tag=a%20||%20b%20||%20c", [key1, key2]);
		await checkTags("tag=-a");
		await checkTags("tag=-b", [key2]);
		await checkTags("tag=b%20||%20c&tag=a", [key1, key2]);
		await checkTags("tag=-z", [key1, key2]);
		await checkTags("tag=B", [key1]);
	});

	//


	it('test_tags_within_items_within_empty_collection', async function () {
		let collectionKey = await API.createCollection("Empty collection", false, this, 'key');
		await API.createItem(
			"book",
			{
				title: "Foo",
				tags: [
					{ tag: "a" },
					{ tag: "b" }
				]
			},
			this,
			'key'
		);
    
		let response = await API.userGet(
			config.userID,
			"collections/" + collectionKey + "/items/top/tags"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 0);
	});

	it('test_tags_within_items', async function () {
		const collectionKey = await API.createCollection("Collection", false, this, 'key');
		const item1Key = await API.createItem(
			"book",
			{
				title: "Foo",
				tags: [
					{ tag: "a" },
					{ tag: "g" }
				]
			},
			this,
			'key'
		);
		// Child note
		await API.createItem(
			"note",
			{
				note: "Test Note 1",
				parentItem: item1Key,
				tags: [
					{ tag: "a" },
					{ tag: "e" }
				]
			},
			this
		);
		// Another item
		await API.createItem(
			"book",
			{
				title: "Bar",
				tags: [
					{ tag: "b" }
				]
			},
			this
		);
		// Item within collection
		const item4Key = await API.createItem(
			"book",
			{
				title: "Foo",
				collections: [collectionKey],
				tags: [
					{ tag: "a" },
					{ tag: "c" },
					{ tag: "g" }
				]
			},
			this,
			'key'
		);
		// Child note within collection
		await API.createItem(
			"note",
			{
				note: "Test Note 2",
				parentItem: item4Key,
				tags: [
					{ tag: "a" },
					{ tag: "f" }
				]
			},
			this
		);
		// Another item within collection
		await API.createItem(
			"book",
			{
				title: "Bar",
				collections: [collectionKey],
				tags: [
					{ tag: "d" }
				]
			},
			this
		);
    
		// All items, equivalent to /tags
		const response = await API.userGet(
			config.userID,
			"items/tags"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 7);
		const json = API.getJSONFromResponse(response);
		assert.deepEqual(
			['a', 'b', 'c', 'd', 'e', 'f', 'g'],
			json.map(tag => tag.tag).sort()
		);
    
		// Top-level items
		const responseTop = await API.userGet(
			config.userID,
			"items/top/tags"
		);
		Helpers.assert200(responseTop);
		Helpers.assertNumResults(responseTop, 5);
		const jsonTop = API.getJSONFromResponse(responseTop);
		assert.deepEqual(
			['a', 'b', 'c', 'd', 'g'],
			jsonTop.map(tag => tag.tag).sort()
		);
    
		// All items, filtered by 'tag', equivalent to /tags
		const responseTag = await API.userGet(
			config.userID,
			"items/tags?tag=a"
		);
		Helpers.assert200(responseTag);
		Helpers.assertNumResults(responseTag, 1);
		const jsonTag = API.getJSONFromResponse(responseTag);
		assert.deepEqual(
			['a'],
			jsonTag.map(tag => tag.tag).sort()
		);
    
		// All items, filtered by 'itemQ'
		const responseItemQ1 = await API.userGet(
			config.userID,
			"items/tags?itemQ=foo"
		);
		Helpers.assert200(responseItemQ1);
		Helpers.assertNumResults(responseItemQ1, 3);
		const jsonItemQ1 = API.getJSONFromResponse(responseItemQ1);
		assert.deepEqual(
			['a', 'c', 'g'],
			jsonItemQ1.map(tag => tag.tag).sort()
		);
		const responseItemQ2 = await API.userGet(
			config.userID,
			"items/tags?itemQ=bar"
		);
		Helpers.assert200(responseItemQ2);
		Helpers.assertNumResults(responseItemQ2, 2);
		const jsonItemQ2 = API.getJSONFromResponse(responseItemQ2);
		assert.deepEqual(
			['b', 'd'],
			jsonItemQ2.map(tag => tag.tag).sort()
		);
		const responseItemQ3 = await API.userGet(
			config.userID,
			"items/tags?itemQ=Test%20Note"
		);
		Helpers.assert200(responseItemQ3);
		Helpers.assertNumResults(responseItemQ3, 3);
		const jsonItemQ3 = API.getJSONFromResponse(responseItemQ3);
		assert.deepEqual(
			['a', 'e', 'f'],
			jsonItemQ3.map(tag => tag.tag).sort()
		);
    
		// All items with the given tags
		const responseItemTag = await API.userGet(
			config.userID,
			"items/tags?itemTag=a&itemTag=g"
		);
		Helpers.assert200(responseItemTag);
		Helpers.assertNumResults(responseItemTag, 3);
		const jsonItemTag = API.getJSONFromResponse(responseItemTag);
		assert.deepEqual(
			['a', 'c', 'g'],
			jsonItemTag.map(tag => tag.tag).sort()
		);
    
		// Disjoint tags
		const responseItemTag2 = await API.userGet(
			config.userID,
			"items/tags?itemTag=a&itemTag=d"
		);
		Helpers.assert200(responseItemTag2);
		Helpers.assertNumResults(responseItemTag2, 0);
    
		// Items within a collection
		const responseInCollection = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items/tags`
		);
		Helpers.assert200(responseInCollection);
		Helpers.assertNumResults(responseInCollection, 5);
		const jsonInCollection = API.getJSONFromResponse(responseInCollection);
		assert.deepEqual(
			['a', 'c', 'd', 'f', 'g'],
			jsonInCollection.map(tag => tag.tag).sort()
		);
    
		// Top-level items within a collection
		const responseTopInCollection = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items/top/tags`
		);
		Helpers.assert200(responseTopInCollection);
		Helpers.assertNumResults(responseTopInCollection, 4);
		const jsonTopInCollection = API.getJSONFromResponse(responseTopInCollection);
		assert.deepEqual(
			['a', 'c', 'd', 'g'],
			jsonTopInCollection.map(tag => tag.tag).sort()
		);
    
		// Search within a collection
		const responseSearchInCollection = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items/tags?itemQ=Test%20Note`
		);
		Helpers.assert200(responseSearchInCollection);
		Helpers.assertNumResults(responseSearchInCollection, 2);
		const jsonSearchInCollection = API.getJSONFromResponse(responseSearchInCollection);
		assert.deepEqual(
			['a', 'f'],
			jsonSearchInCollection.map(tag => tag.tag).sort()
		);
    
		// Items with the given tags within a collection
		const responseTagInCollection = await API.userGet(
			config.userID,
			`collections/${collectionKey}/items/tags?itemTag=a&itemTag=g`
		);
		Helpers.assert200(responseTagInCollection);
		Helpers.assertNumResults(responseTagInCollection, 3);
		const jsonTagInCollection = API.getJSONFromResponse(responseTagInCollection);
		assert.deepEqual(
			['a', 'c', 'g'],
			jsonTagInCollection.map(tag => tag.tag).sort()
		);
	});

	it('test_should_create_a_0_tag', async function () {
		let data = await API.createItem("book", {
			tags: [
				{ tag: "0" }
			]
		}, this, 'jsonData');
	
		Helpers.assertCount(1, data.tags);
		assert.equal("0", data.tags[0].tag);
	});

	it('test_should_handle_negation_in_top_requests', async function () {
		let key1 = await API.createItem("book", {
			tags: [
				{ tag: "a" },
				{ tag: "b" }
			]
		}, this, 'key');
		let key2 = await API.createItem("book", {
			tags: [
				{ tag: "a" },
				{ tag: "c" }
			]
		}, this, 'key');
		await API.createAttachmentItem("imported_url", [], key1, this, 'jsonData');
		await API.createAttachmentItem("imported_url", [], key2, this, 'jsonData');
		let response = await API.userGet(config.userID, "items/top?format=keys&tag=-b", {
			"Content-Type": "application/json"
		});
		Helpers.assert200(response);
		let keys = response.data.trim().split("\n");
		assert.strictEqual(keys.length, 1);
		assert.include(keys, key2);
	});

	it('testTagQuery', async function () {
		const tags = ["a", "abc", "bab"];
		
		await API.createItem("book", {
			tags: tags.map((tag) => {
				return { tag };
			})
		}, this, 'key');
		
		let response = await API.userGet(
			config.userID,
			"tags?q=ab"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 2);
		
		response = await API.userGet(
			config.userID,
			"tags?q=ab&qmode=startswith"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
	});

	it('testTagDiacritics', async function () {
		let data = await API.createItem("book", {
			tags: [
				{ tag: "ëtest" },
			]
		}, this, 'jsonData');
		let version = data.version;
  
		data.tags = [
			{ tag: "ëtest" },
			{ tag: "etest" },
		];
  
		let response = await API.postItem(data);
		Helpers.assert200(response);
		Helpers.assert200ForObject(response);
  
		data = await API.getItem(data.key, this, 'json');
		data = data.data;
		assert.equal(version + 1, data.version);
		assert.equal(2, data.tags.length);
		assert.deepInclude(data.tags, { tag: "ëtest" });
		assert.deepInclude(data.tags, { tag: "etest" });
	});

	it('test_should_change_case_of_existing_tag', async function () {
		let data1 = await API.createItem("book", {
			tags: [
				{ tag: "a" },
			]
		}, this, 'jsonData');
	
		let data2 = await API.createItem("book", {
			tags: [
				{ tag: "a" }
			]
		}, this, 'jsonData');
	
		let version = data1.version;
	
		data1.tags = [
			{ tag: "A" },
		];
	
		let response = await API.postItem(data1);
		Helpers.assert200(response);
		Helpers.assert200ForObject(response);
	
		// Item version should be one greater than last update
		data1 = (await API.getItem(data1.key, this, 'json')).data;
		data2 = (await API.getItem(data2.key, this, 'json')).data;
		assert.equal(version + 1, data2.version);
		assert.equal(1, data1.tags.length);
		assert.deepInclude(data1.tags, { tag: "A" });
		assert.deepInclude(data2.tags, { tag: "a" });
	});

	it('testKeyedItemWithTags', async function () {
		const itemKey = Helpers.uniqueID();
		const createItemData = {
			key: itemKey,
			version: 0,
			tags: [
				{ tag: "a" },
				{ tag: "b" }
			]
		};
		await API.createItem('book', createItemData, this, 'responseJSON');
  
		const json2 = await API.getItem(itemKey, this, 'json');
		const data = json2.data;
		assert.strictEqual(data.tags.length, 2);
		assert.deepStrictEqual(data.tags[0], { tag: "a" });
		assert.deepStrictEqual(data.tags[1], { tag: "b" });
	});

	it('testTagTooLong', async function () {
		let tag = Helpers.uniqueID(300);
		let json = await API.getItemTemplate("book");
		json.tags.push({
			tag: tag,
			type: 1
		});
		let response = await API.postItem(json);
		Helpers.assert413ForObject(response);
  
		json = API.getJSONFromResponse(response);
		assert.equal(tag, json.failed[0].data.tag);
	});

	it('should add tag to item', async function () {
		let json = await API.getItemTemplate("book");
		json.tags = [{ tag: "A" }];
		let response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		json = json.successful[0].data;
  
		json.tags.push({ tag: "C" });
		response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		json = json.successful[0].data;
  
		json.tags.push({ tag: "B" });
		response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		json = json.successful[0].data;
  
		json.tags.push({ tag: "D" });
		response = await API.postItem(json);
		Helpers.assert200ForObject(response);
		let tags = json.tags;
		json = API.getJSONFromResponse(response);
		json = json.successful[0].data;
  
		assert.deepEqual(tags, json.tags);
	});

	it('test_utf8mb4_tag', async function () {
		let json = await API.getItemTemplate('book');
		json.tags.push({
			tag: '🐻', // 4-byte character
			type: 0
		});

		let response = await API.postItem(json, { 'Content-Type': 'application/json' });
		Helpers.assert200ForObject(response);

		let newJSON = API.getJSONFromResponse(response);
		newJSON = newJSON.successful[0].data;
		Helpers.assertCount(1, newJSON.tags);
		assert.equal(json.tags[0].tag, newJSON.tags[0].tag);
	});

	it('testOrphanedTag', async function () {
		let json = await API.createItem('book', {
			tags: [{ tag: "a" }]
		}, this, 'jsonData');
		let libraryVersion1 = json.version;
		let itemKey1 = json.key;
	
		json = await API.createItem('book', {
			tags: [{ tag: "b" }]
		}, this, 'jsonData');
	
		json = await API.createItem("book", {
			tags: [{ tag: "b" }]
		}, this, 'jsonData');
	
		const response = await API.userDelete(
			config.userID,
			`items/${itemKey1}`,
			{ "If-Unmodified-Since-Version": libraryVersion1 }
		);
		Helpers.assert204(response);
	
		const response1 = await API.userGet(
			config.userID,
			"tags"
		);
		Helpers.assert200(response1);
		Helpers.assertNumResults(response1, 1);
		let json1 = API.getJSONFromResponse(response1)[0];
		assert.equal("b", json1.tag);
	});

	it('test_deleting_a_tag_should_update_a_linked_item', async function () {
		let tags = ["a", "aa", "b"];
	
		let itemKey = await API.createItem("book", {
			tags: tags.map((tag) => {
				return { tag: tag };
			})
		}, this, 'key');
	
		let libraryVersion = parseInt(await API.getLibraryVersion());
	
		// Make sure they're on the item
		let json = await API.getItem(itemKey, this, 'json');
		let tagList = json.data.tags.map((tag) => {
			return tag.tag;
		});
		assert.deepEqual(tagList, tags);
	
		// Delete
		let response = await API.userDelete(
			config.userID,
			"tags?tag=" + tags[0],
			{ "If-Unmodified-Since-Version": libraryVersion }
		);
		Helpers.assert204(response);
	
		// Make sure they're gone from the item
		response = await API.userGet(
			config.userID,
			"items?since=" + encodeURIComponent(libraryVersion)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		let jsonTags = json[0].data.tags.map((tag) => {
			return tag.tag;
		});
		assert.deepEqual(
			jsonTags,
			tags.slice(1)
		);
	});
});
