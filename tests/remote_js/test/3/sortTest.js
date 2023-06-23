const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After, resetGroups } = require("../shared.js");

describe('SortTests', function () {
	this.timeout(config.timeout);
	//let collectionKeys = [];
	let itemKeys = [];
	let childAttachmentKeys = [];
	let childNoteKeys = [];
	//let searchKeys = [];

	let titles = ['q', 'c', 'a', 'j', 'e', 'h', 'i'];
	let names = ['m', 's', 'a', 'bb', 'ba', '', ''];
	let attachmentTitles = ['v', 'x', null, 'a', null];
	let notes = [null, 'aaa', null, null, 'taf'];

	before(async function () {
		await API3Before();
		await setup();
		await resetGroups();
	});

	after(async function () {
		await API3After();
	});

	const setup = async () => {
		let titleIndex = 0;
		for (let i = 0; i < titles.length - 2; i++) {
			const key = await API.createItem("book", {
				title: titles[titleIndex],
				creators: [
					{
						creatorType: "author",
						name: names[i]
					}
				]
			}, true, 'key');
			titleIndex += 1;
			// Child attachments
			if (attachmentTitles[i]) {
				childAttachmentKeys.push(await API.createAttachmentItem(
					"imported_file", {
						title: attachmentTitles[i]
					}, key, true, 'key'));
			}
			// Child notes
			if (notes[i]) {
				childNoteKeys.push(await API.createNoteItem(notes[i], key, true, 'key'));
			}

			itemKeys.push(key);
		}
		// Top-level attachment
		itemKeys.push(await API.createAttachmentItem("imported_file", {
			title: titles[titleIndex]
		}, false, null, 'key'));
		titleIndex += 1;
		// Top-level note
		itemKeys.push(await API.createNoteItem(titles[titleIndex], false, null, 'key'));
		//
		// Collections
		//
		/*for (let i=0; i<5; i++) {
			collectionKeys.push(await API.createCollection("Test", false, true, 'key'));
		}*/

		//
		// Searches
		//
		/*for (let i=0; i<5; i++) {
			searchKeys.push(await API.createSearch("Test", 'default', null, 'key'));
		}*/
	};

	it('test_sort_group_by_editedBy', async function () {
		// user 1 makes item
		let jsonOne = await API.groupCreateItem(
			config.ownedPrivateGroupID,
			'book',
			{ title: `title_one` },
			true,
			'jsonData'
		);
	
		API.useAPIKey(config.user2APIKey);

		// user 2 makes item
		let jsonTwo = await API.groupCreateItem(
			config.ownedPrivateGroupID,
			'book',
			{ title: `title_two` },
			true,
			'jsonData'
		);

		// make sure, user's one item goes first
		let response = await API.get(`groups/${config.ownedPrivateGroupID}/items?sort=editedBy&format=keys`);
		let sortedKeys = response.data.split('\n');
		assert.equal(sortedKeys[0], jsonOne.key);
		assert.equal(sortedKeys[1], jsonTwo.key);

		// user 2 updates user1's item, and the other way around
		response = await API.patch(`groups/${config.ownedPrivateGroupID}/items/${jsonOne.key}`,
			JSON.stringify({ title: 'updated_by_user 2' }),
			{ 'If-Unmodified-Since-Version': jsonOne.version });

		Helpers.assert204(response);

		API.useAPIKey(config.apiKey);

		response = await API.patch(`groups/${config.ownedPrivateGroupID}/items/${jsonTwo.key}`,
			JSON.stringify({ title: 'updated_by_user 2' }),
			{ 'If-Unmodified-Since-Version': jsonTwo.version });
		Helpers.assert204(response);

		// now order should be switched
		response = await API.get(`groups/${config.ownedPrivateGroupID}/items?sort=editedBy&format=keys`);
		sortedKeys = response.data.split('\n');
		assert.equal(sortedKeys[0], jsonTwo.key);
		assert.equal(sortedKeys[1], jsonOne.key);
	});

	it('testSortTopItemsTitle', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?format=keys&sort=title"
		);
		Helpers.assertStatusCode(response, 200);
		
		let keys = response.data.trim().split("\n");

		let titlesToIndex = {};
		titles.forEach((v, i) => {
			titlesToIndex[v] = i;
		});
		let titlesSorted = [...titles];
		titlesSorted.sort();
		let correct = {};
		titlesSorted.forEach((title) => {
			let index = titlesToIndex[title];
			// The key at position k in itemKeys should be at the same position in keys
			correct[index] = keys[index];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		assert.deepEqual(correct, keys);
	});

	// Same thing, but with order parameter for backwards compatibility
	it('testSortTopItemsTitleOrder', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?format=keys&order=title"
		);
		Helpers.assertStatusCode(response, 200);
		
		let keys = response.data.trim().split("\n");

		let titlesToIndex = {};
		titles.forEach((v, i) => {
			titlesToIndex[v] = i;
		});
		let titlesSorted = [...titles];
		titlesSorted.sort();
		let correct = {};
		titlesSorted.forEach((title) => {
			let index = titlesToIndex[title];
			correct[index] = keys[index];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		assert.deepEqual(correct, keys);
	});

	it('testSortTopItemsCreator', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?format=keys&sort=creator"
		);
		Helpers.assertStatusCode(response, 200);
		let keys = response.data.trim().split("\n");
		let namesCopy = { ...names };
		let sortFunction = function (a, b) {
			if (a === '' && b !== '') return 1;
			if (b === '' && a !== '') return -1;
			if (a < b) return -1;
			if (a > b) return 11;
			return 0;
		};
		let namesEntries = Object.entries(namesCopy);
		namesEntries.sort((a, b) => sortFunction(a[1], b[1]));
		assert.equal(Object.keys(namesEntries).length, keys.length);
		let correct = {};
		namesEntries.forEach((entry, i) => {
			correct[i] = itemKeys[parseInt(entry[0])];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		// Check attachment and note, which should fall back to ordered added (itemID)
		assert.deepEqual(correct, keys);
	});
	it('testSortTopItemsCreator', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?format=keys&sort=creator"
		);
		Helpers.assertStatusCode(response, 200);
		let keys = response.data.trim().split("\n");
		let namesCopy = { ...names };
		let sortFunction = function (a, b) {
			if (a === '' && b !== '') return 1;
			if (b === '' && a !== '') return -1;
			if (a < b) return -1;
			if (a > b) return 11;
			return 0;
		};
		let namesEntries = Object.entries(namesCopy);
		namesEntries.sort((a, b) => sortFunction(a[1], b[1]));
		assert.equal(Object.keys(namesEntries).length, keys.length);
		let correct = {};
		namesEntries.forEach((entry, i) => {
			correct[i] = itemKeys[parseInt(entry[0])];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		assert.deepEqual(correct, keys);
	});

	it('testSortTopItemsCreatorOrder', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?format=keys&order=creator"
		);
		Helpers.assertStatusCode(response, 200);
		let keys = response.data.trim().split("\n");
		let namesCopy = { ...names };
		let sortFunction = function (a, b) {
			if (a === '' && b !== '') return 1;
			if (b === '' && a !== '') return -1;
			if (a < b) return -1;
			if (a > b) return 11;
			return 0;
		};
		let namesEntries = Object.entries(namesCopy);
		namesEntries.sort((a, b) => sortFunction(a[1], b[1]));
		assert.equal(Object.keys(namesEntries).length, keys.length);
		let correct = {};
		namesEntries.forEach((entry, i) => {
			correct[i] = itemKeys[parseInt(entry[0])];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		assert.deepEqual(correct, keys);
	});


	it('testSortDirection', async function () {
		await API.userClear(config.userID);
		let dataArray = [];
	
		dataArray.push(await API.createItem("book", {
			title: "B",
			creators: [
				{
					creatorType: "author",
					name: "B"
				}
			],
			dateAdded: '2014-02-05T00:00:00Z',
			dateModified: '2014-04-05T01:00:00Z'
		}, this, 'jsonData'));
	
		dataArray.push(await API.createItem("journalArticle", {
			title: "A",
			creators: [
				{
					creatorType: "author",
					name: "A"
				}
			],
			dateAdded: '2014-02-04T00:00:00Z',
			dateModified: '2014-01-04T01:00:00Z'
		}, this, 'jsonData'));
	
		dataArray.push(await API.createItem("newspaperArticle", {
			title: "F",
			creators: [
				{
					creatorType: "author",
					name: "F"
				}
			],
			dateAdded: '2014-02-03T00:00:00Z',
			dateModified: '2014-02-03T01:00:00Z'
		}, this, 'jsonData'));
	
		dataArray.push(await API.createItem("book", {
			title: "C",
			creators: [
				{
					creatorType: "author",
					name: "C"
				}
			],
			dateAdded: '2014-02-02T00:00:00Z',
			dateModified: '2014-03-02T01:00:00Z'
		}, this, 'jsonData'));
	
		// Get sorted keys
		dataArray.sort(function (a, b) {
			return new Date(a.dateAdded) - new Date(b.dateAdded);
		});
	
		let keysByDateAddedAscending = dataArray.map(function (data) {
			return data.key;
		});
	
		let keysByDateAddedDescending = [...keysByDateAddedAscending];
		keysByDateAddedDescending.reverse();
		// Ascending
		let response = await API.userGet(config.userID, "items?format=keys&sort=dateAdded&direction=asc");
		Helpers.assert200(response);
		assert.deepEqual(keysByDateAddedAscending, response.data.trim().split("\n"));
	
		response = await API.userGet(config.userID, "items?format=json&sort=dateAdded&direction=asc");
		Helpers.assert200(response);
		let json = API.getJSONFromResponse(response);
		let keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedAscending, keys);
	
		response = await API.userGet(config.userID, "items?format=atom&sort=dateAdded&direction=asc");
		Helpers.assert200(response);
		let xml = API.getXMLFromResponse(response);
		keys = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		assert.deepEqual(keysByDateAddedAscending, keys);
	
		// Ascending using old 'order'/'sort' instead of 'sort'/'direction'
		response = await API.userGet(config.userID, "items?format=keys&order=dateAdded&sort=asc");
		Helpers.assert200(response);
		assert.deepEqual(keysByDateAddedAscending, response.data.trim().split("\n"));
	
		response = await API.userGet(config.userID, "items?format=json&order=dateAdded&sort=asc");
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);
		keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedAscending, keys);
	
		response = await API.userGet(config.userID, "items?format=atom&order=dateAdded&sort=asc");
		Helpers.assert200(response);
		xml = API.getXMLFromResponse(response);
		keys = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		assert.deepEqual(keysByDateAddedAscending, keys);
	
		// Deprecated 'order'/'sort', but the wrong way
		response = await API.userGet(config.userID, "items?format=keys&sort=dateAdded&order=asc");
		Helpers.assert200(response);
		assert.deepEqual(keysByDateAddedAscending, response.data.trim().split("\n"));
	
		// Descending
		//START
		response = await API.userGet(
			config.userID,
			"items?format=keys&sort=dateAdded&direction=desc"
		);
		Helpers.assert200(response);
		assert.deepEqual(keysByDateAddedDescending, response.data.trim().split("\n"));
	
		response = await API.userGet(
			config.userID,
			"items?format=json&sort=dateAdded&direction=desc"
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);
		keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedDescending, keys);
	
		response = await API.userGet(
			config.userID,
			"items?format=atom&sort=dateAdded&direction=desc"
		);
		Helpers.assert200(response);
		xml = API.getXMLFromResponse(response);
		keys = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		assert.deepEqual(keysByDateAddedDescending, keys);
	
		// Descending
		response = await API.userGet(
			config.userID,
			"items?format=keys&order=dateAdded&sort=desc"
		);
		Helpers.assert200(response);
		assert.deepEqual(keysByDateAddedDescending, response.data.trim().split("\n"));
	
		response = await API.userGet(
			config.userID,
			"items?format=json&order=dateAdded&sort=desc"
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);
		keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedDescending, keys);
	
		response = await API.userGet(
			config.userID,
			"items?format=atom&order=dateAdded&sort=desc"
		);
		Helpers.assert200(response);
		xml = API.getXMLFromResponse(response);
		keys = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		assert.deepEqual(keysByDateAddedDescending, keys);
	});
	
	// Sort by item type
	it('test_sort_top_level_items_by_item_type', async function () {
		const response = await API.userGet(
			config.userID,
			"items/top?sort=itemType"
		);
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		const itemTypes = json.map(arr => arr.data.itemType);
		const sorted = itemTypes.sort();
		assert.deepEqual(sorted, itemTypes);
	});

	it('testSortSortParamAsDirectionWithoutOrder', async function () {
		const response = await API.userGet(
			config.userID,
			"items?format=keys&sort=asc"
		);
		Helpers.assert200(response);
	});

	it('testSortDefault', async function () {
		await API.userClear(config.userID);
		let dataArray = [];
		dataArray.push(await API.createItem("book", {
			title: "B",
			creators: [{
				creatorType: "author",
				name: "B"
			}],
			dateAdded: '2014-02-05T00:00:00Z',
			dateModified: '2014-04-05T01:00:00Z'
		}, this, 'jsonData'));
		dataArray.push(await API.createItem("journalArticle", {
			title: "A",
			creators: [{
				creatorType: "author",
				name: "A"
			}],
			dateAdded: '2014-02-04T00:00:00Z',
			dateModified: '2014-01-04T01:00:00Z'
		}, this, 'jsonData'));
		dataArray.push(await API.createItem("newspaperArticle", {
			title: "F",
			creators: [{
				creatorType: "author",
				name: "F"
			}],
			dateAdded: '2014-02-03T00:00:00Z',
			dateModified: '2014-02-03T01:00:00Z'
		}, this, 'jsonData'));
		dataArray.push(await API.createItem("book", {
			title: "C",
			creators: [{
				creatorType: "author",
				name: "C"
			}],
			dateAdded: '2014-02-02T00:00:00Z',
			dateModified: '2014-03-02T01:00:00Z'
		}, this, 'jsonData'));

		// Get sorted keys
		dataArray.sort((a, b) => {
			return new Date(b.dateAdded) - new Date(a.dateAdded);
		});
		const keysByDateAddedDescending = dataArray.map(data => data.key);
		dataArray.sort((a, b) => {
			return new Date(b.dateModified) - new Date(a.dateModified);
		});
		const keysByDateModifiedDescending = dataArray.map(data => data.key);

		// Tests
		let response = await API.userGet(config.userID, "items?format=keys");
		Helpers.assert200(response);
		assert.deepEqual(keysByDateModifiedDescending, response.data.trim().split('\n'));
		response = await API.userGet(config.userID, "items?format=json");
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		let keys = json.map(val => val.key);
		assert.deepEqual(keysByDateModifiedDescending, keys);
		response = await API.userGet(config.userID, "items?format=atom");
		Helpers.assert200(response);
		const xml = API.getXMLFromResponse(response);
		const keysXml = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		keys = keysXml.map(val => val.toString());
		assert.deepEqual(keysByDateAddedDescending, keys);
	});
});

