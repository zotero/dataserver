const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('ParametersTests', function () {
	this.timeout(config.timeout * 2);
	let collectionKeys = [];
	let itemKeys = [];
	let searchKeys = [];

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
	});

	const _testFormatKeys = async (objectType, sorted = false) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		const response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&format=keys${sorted ? '&order=title' : ''}`,
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assertStatusCode(response, 200);

		const keys = response.data.trim().split('\n');
		keys.sort();

		switch (objectType) {
			case "item":
				assert.equal(keys.length, itemKeys.length);
				if (sorted) {
					assert.deepEqual(keys, itemKeys);
				}
				else {
					keys.forEach((key) => {
						assert.include(itemKeys, key);
					});
				}
				break;
			case "collection":
				assert.equal(keys.length, collectionKeys.length);
				if (sorted) {
					assert.deepEqual(keys, collectionKeys);
				}
				else {
					keys.forEach((key) => {
						assert.include(collectionKeys, key);
					});
				}
				break;
			case "search":
				assert.equal(keys.length, searchKeys.length);

				if (sorted) {
					assert.deepEqual(keys, searchKeys);
				}
				else {
					keys.forEach((key) => {
						assert.include(searchKeys, key);
					});
				}
				break;
			default:
				throw new Error("Unknown object type");
		}
	};

	const _testObjectKeyParameter = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		const xmlArray = [];
		let response;
		switch (objectType) {
			case 'collection':
				xmlArray.push(await API.createCollection("Name", false, true));
				xmlArray.push(await API.createCollection("Name", false, true));
				break;

			case 'item':
				xmlArray.push(await API.createItem("book", false, true));
				xmlArray.push(await API.createItem("book", false, true));
				break;

			case 'search':
				xmlArray.push(await API.createSearch(
					"Name",
					[{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true
				));
				xmlArray.push(await API.createSearch(
					"Name",
					[{
						condition: "title",
						operator: "contains",
						value: "test"
					}],
					true
				));
				break;
		}

		const keys = [];
		xmlArray.forEach((xml) => {
			const data = API.parseDataFromAtomEntry(xml);
			keys.push(data.key);
		});

		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&content=json&${objectType}Key=${keys[0]}`
		);

		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);

		let xml = API.getXMLFromResponse(response);
		const data = API.parseDataFromAtomEntry(xml);
		assert.equal(keys[0], data.key);

		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&content=json&${objectType}Key=${keys[0]},${keys[1]}&order=${objectType}KeyList`
		);

		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 2);

		xml = API.getXMLFromResponse(response);
		const xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		const key1 = xpath[0];
		assert.equal(keys[0], key1);
		const key2 = xpath[1];
		assert.equal(keys[1], key2);
	};

	it('testFormatKeys', async function () {
		await API.userClear(config.userID);
		for (let i = 0; i < 5; i++) {
			const collectionKey = await API.createCollection('Test', false, null, 'key');
			collectionKeys.push(collectionKey);
		}

		for (let i = 0; i < 5; i++) {
			const itemKey = await API.createItem('book', false, null, 'key');
			itemKeys.push(itemKey);
		}
		const attachmentItemKey = await API.createAttachmentItem('imported_file', [], false, null, 'key');
		itemKeys.push(attachmentItemKey);

		for (let i = 0; i < 5; i++) {
			const searchKey = await API.createSearch('Test', 'default', null, 'key');
			searchKeys.push(searchKey);
		}

		await _testFormatKeys('collection');
		await _testFormatKeys('item');
		await _testFormatKeys('search');


		itemKeys.sort();
		collectionKeys.sort();
		searchKeys.sort();

		await _testFormatKeys('collection', true);
		await _testFormatKeys('item', true);
		await _testFormatKeys('search', true);
	});

	it('testObjectKeyParameter', async function () {
		await _testObjectKeyParameter('collection');
		await _testObjectKeyParameter('item');
		await _testObjectKeyParameter('search');
	});
	it('testCollectionQuickSearch', async function () {
		const title1 = 'Test Title';
		const title2 = 'Another Title';

		const keys = [];
		keys.push(await API.createCollection(title1, [], true, 'key'));
		keys.push(await API.createCollection(title2, [], true, 'key'));

		// Search by title
		let response = await API.userGet(
			config.userID,
			`collections?key=${config.apiKey}&content=json&q=another`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
		const xml = API.getXMLFromResponse(response);
		const xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		const key = xpath[0];
		assert.equal(keys[1], key);

		// No results
		response = await API.userGet(
			config.userID,
			`collections?key=${config.apiKey}&content=json&q=nothing`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 0);
	});

	it('testItemQuickSearch', async function () {
		const title1 = "Test Title";
		const title2 = "Another Title";
		const year2 = "2013";

		const keys = [];
		keys.push(await API.createItem("book", {
			title: title1
		}, true, 'key'));
		keys.push(await API.createItem("journalArticle", {
			title: title2,
			date: "November 25, " + year2
		}, true, 'key'));

		// Search by title
		let response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey + "&content=json&q=" + encodeURIComponent(title1)
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
		
		let xml = API.getXMLFromResponse(response);
		let xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		let key = xpath[0];
		assert.equal(keys[0], key);

		// TODO: Search by creator

		// Search by year
		response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey + "&content=json&q=" + year2
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);
		xml = API.getXMLFromResponse(response);
		key = Helpers.xpathEval(xml, '//atom:entry/zapi:key');
		assert.equal(keys[1], key);

		// Search by year + 1
		response = await API.userGet(
			config.userID,
			"items?key=" + config.apiKey + "&content=json&q=" + (year2 + 1)
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 0);
	});

	it('testItemQuickSearchOrderByDate', async function () {
		await API.userClear(config.userID);
		const title1 = 'Test Title';
		const title2 = 'Another Title';
		let response, xpath, xml;
		const keys = [];
		keys.push(await API.createItem('book', {
			title: title1,
			date: 'February 12, 2013'
		}, true, 'key'));
		keys.push(await API.createItem('journalArticle', {
			title: title2,
			date: 'November 25, 2012'
		}, true, 'key'));

		response = await API.userGet(
			config.userID,
			`items?key=${config.apiKey}&content=json&q=${encodeURIComponent(title1)}`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 1);

		xml = API.getXMLFromResponse(response);
		xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);
		assert.equal(keys[0], xpath[0]);

		response = await API.userGet(
			config.userID,
			`items?key=${config.apiKey}&content=json&q=title&order=date&sort=asc`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 2);
		xml = API.getXMLFromResponse(response);
		xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);

		assert.equal(keys[1], xpath[0]);
		assert.equal(keys[0], xpath[1]);

		response = await API.userGet(
			config.userID,
			`items?key=${config.apiKey}&content=json&q=title&order=date&sort=desc`
		);
		Helpers.assertStatusCode(response, 200);
		Helpers.assertNumResults(response, 2);
		xml = API.getXMLFromResponse(response);
		xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key', false, true);

		assert.equal(keys[0], xpath[0]);
		assert.equal(keys[1], xpath[1]);
	});
});
