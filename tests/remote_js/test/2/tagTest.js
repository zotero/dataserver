const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('TagTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Setup();
		API.useAPIVersion(2);
	});

	after(async function () {
		await API2WrapUp();
	});
	it('test_empty_tag_should_be_ignored', async function () {
		let json = await API.getItemTemplate("book");
		json.tags.push({ tag: "", type: 1 });

		let response = await API.postItem(json);
		Helpers.assertStatusCode(response, 200);
	});

	it('testInvalidTagObject', async function () {
		let json = await API.getItemTemplate("book");
		json.tags.push(["invalid"]);

		let headers = { "Content-Type": "application/json" };
		let response = await API.postItem(json, headers);

		Helpers.assertStatusForObject(response, 'failed', 0, 400, "Tag must be an object");
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
			"tags?key=" + config.apiKey
			+ "&content=json&tag=" + tags1.join("%20||%20"),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, tags1.length);
	});

	it('testTagNewer', async function () {
		await API.userClear(config.userID);

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
			`tags?key=${config.apiKey}&content=json&newer=${version}`
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

		// 'newer' should return new tag
		response = await API.userGet(
			config.userID,
			`tags?key=${config.apiKey}&content=json&newer=${version}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);

		assert.isAbove(parseInt(response.headers['last-modified-version']), parseInt(version));

		const content = await API.getContentFromResponse(response);
		const json = JSON.parse(content);
		assert.strictEqual(json.tag, 'c');
		assert.strictEqual(json.type, 0);
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
			`tags?key=${config.apiKey}&content=json&tag=${tags1.concat(tags2).map(tag => encodeURIComponent(tag)).join("%20||%20")}`
		);
		Helpers.assertStatusCode(response, 428);

		// Outdated version header
		response = await API.userDelete(
			config.userID,
			`tags?key=${config.apiKey}&content=json&tag=${tags1.concat(tags2).map(tag => encodeURIComponent(tag)).join("%20||%20")}`,
			{ "If-Unmodified-Since-Version": `${libraryVersion - 1}` }
		);
		Helpers.assertStatusCode(response, 412);

		// Delete
		response = await API.userDelete(
			config.userID,
			`tags?key=${config.apiKey}&content=json&tag=${tags1.concat(tags2).map(tag => encodeURIComponent(tag)).join("%20||%20")}`,
			{ "If-Unmodified-Since-Version": `${libraryVersion}` }
		);
		Helpers.assertStatusCode(response, 204);

		// Make sure they're gone
		response = await API.userGet(
			config.userID,
			`tags?key=${config.apiKey}&content=json&tag=${tags1.concat(tags2, tags3).map(tag => encodeURIComponent(tag)).join("%20||%20")}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
	});

	it('testTagAddItemVersionChange', async function () {
		let data1 = await API.createItem("book", {
			tags: [{
				tag: "a"
			},
			{
				tag: "b"
			}]
		}, true, 'data');
		let json1 = JSON.parse(data1.content);
		//let version1 = data1.version;

		let data2 = await API.createItem("book", {
			tags: [{
				tag: "a"
			},
			{
				tag: "c"
			}]
		}, true, 'data');
		let json2 = JSON.parse(data2.content);
		let version2 = data2.version;
		version2 = parseInt(version2);
		// Remove tag 'a' from item 1
		json1.tags = [{
			tag: "d"
		},
		{
			tag: "c"
		}];

		let response = await API.postItem(json1);
		Helpers.assertStatusCode(response, 200);

		// Item 1 version should be one greater than last update
		let xml1 = await API.getItemXML(json1.itemKey);
		data1 = await API.parseDataFromAtomEntry(xml1);
		assert.equal(parseInt(data1.version), version2 + 1);

		// Item 2 version shouldn't have changed
		let xml2 = await API.getItemXML(json2.itemKey);
		data2 = await API.parseDataFromAtomEntry(xml2);
		assert.equal(parseInt(data2.version), version2);
	});

	it('testItemTagSearch', async function () {
		await API.userClear(config.userID);

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
				`items?key=${config.apiKey}&format=keys&${tagComponent}`
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
});
