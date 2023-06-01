const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('ParamsTests', function () {
	this.timeout(config.timeout);

	let collectionKeys = [];
	let itemKeys = [];
	let searchKeys = [];

	let keysByName = {
		collectionKeys: collectionKeys,
		itemKeys: itemKeys,
		searchKeys: searchKeys
	};

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});
	beforeEach(async function () {
		await API.userClear(config.userID);
	});

	afterEach(async function () {
		await API.userClear(config.userID);
	});

	const parseLinkHeader = (links) => {
		assert.isNotNull(links);
		const parsedLinks = [];
		for (let link of links.split(',')) {
			link = link.trim();
			let [uri, rel] = link.split('; ');
			Helpers.assertRegExp(/^<https?:\/\/[^ ]+>$/, uri);
			Helpers.assertRegExp(/^rel="[a-z]+"$/, rel);
			uri = uri.slice(1, -1);
			rel = rel.slice(5, -1);
			const params = {};
			new URLSearchParams(new URL(uri).search.slice(1)).forEach((value, key) => {
				params[key] = value;
			});
			parsedLinks[rel] = {
				uri: uri,
				params: params
			};
		}
		return parsedLinks;
	};

	it('testPaginationWithItemKey', async function () {
		let totalResults = 27;

		for (let i = 0; i < totalResults; i++) {
			await API.createItem("book", false, this, 'key');
		}

		let response = await API.userGet(
			config.userID,
			"items?format=keys&limit=50",
			{ "Content-Type": "application/json" }
		);
		let keys = response.data.trim().split("\n");

		response = await API.userGet(
			config.userID,
			"items?format=json&itemKey=" + keys.join(","),
			{ "Content-Type": "application/json" }
		);
		let json = API.getJSONFromResponse(response);
		Helpers.assertCount(totalResults, json);
	});


	const _testPagination = async (objectType) => {
		await API.userClear(config.userID);
		const objectTypePlural = await API.getPluralObjectType(objectType);

		let limit = 2;
		let totalResults = 5;
		let formats = ['json', 'atom', 'keys'];

		// Create sample data
		switch (objectType) {
			case 'collection':
			case 'item':
			case 'search':
			case 'tag':
				await _createPaginationData(objectType, totalResults);
				break;
		}
		let filteredFormats;
		switch (objectType) {
			case 'item':
				formats.push('bibtex');
				break;

			case 'tag':
				filteredFormats = formats.filter(val => !['keys'].includes(val));
				formats = filteredFormats;
				break;

			case 'group':
				// Change if the config changes
				limit = 1;
				totalResults = config.numOwnedGroups;
				formats = formats.filter(val => !['keys'].includes(val));
				break;
		}

		const func = async (start, format) => {
			const response = await API.userGet(
				config.userID,
				`${objectTypePlural}?start=${start}&limit=${limit}&format=${format}`
			);

			Helpers.assert200(response);
			Helpers.assertNumResults(response, limit);
			Helpers.assertTotalResults(response, totalResults);

			const linksString = response.headers.link[0];
			const links = parseLinkHeader(linksString);
			assert.property(links, 'first');
			assert.notProperty(links.first.params, 'start');
			Helpers.assertEquals(limit, links.first.params.limit);
			assert.property(links, 'prev');
			
			Helpers.assertEquals(limit, links.prev.params.limit);
			

			assert.property(links, 'last');
			if (start < 3) {
				Helpers.assertEquals(start + limit, links.next.params.start);
				Helpers.assertEquals(limit, links.next.params.limit);
				assert.notProperty(links.prev.params, 'start');
				assert.property(links, 'next');
			}
			else {
				assert.equal(Math.max(start - limit, 0), parseInt(links.prev.params.start));
				assert.notProperty(links, 'next');
			}

			let lastStart = totalResults - (totalResults % limit);

			if (lastStart == totalResults) {
				lastStart -= limit;
			}

			Helpers.assertEquals(lastStart, links.last.params.start);
			Helpers.assertEquals(limit, links.last.params.limit);
		};

		for (const format of formats) {
			const response = await API.userGet(
				config.userID,
				`${objectTypePlural}?limit=${limit}&format=${format}`
			);

			Helpers.assert200(response);
			Helpers.assertNumResults(response, limit);
			Helpers.assertTotalResults(response, totalResults);

			const linksString = response.headers.link[0];
			const links = parseLinkHeader(linksString);
			assert.notProperty(links, 'first');
			assert.notProperty(links, 'prev');
			assert.property(links, 'next');
			Helpers.assertEquals(limit, links.next.params.start);
			Helpers.assertEquals(limit, links.next.params.limit);
			assert.property(links, 'last');

			let lastStart = totalResults - (totalResults % limit);

			if (lastStart == totalResults) {
				lastStart -= limit;
			}

			Helpers.assertEquals(lastStart, links.last.params.start);
			Helpers.assertEquals(limit, links.last.params.limit);

			// TODO: Test with more groups
			if (objectType == 'group') {
				continue;
			}

			await func(1, format);
			await func(2, format);
			await func(3, format);
		}
	};


	it('test_should_perform_quicksearch_with_multiple_words', async function () {
		let title1 = "This Is a Great Title";
		let title2 = "Great, But Is It Better Than This Title?";

		let keys = [];
		keys.push(await API.createItem("book", {
			title: title1
		}, this, 'key'));
		keys.push(await API.createItem("journalArticle", {
			title: title2,
		}, this, 'key'));

		// Search by multiple independent words
		let q = "better title";
		let response = await API.userGet(
			config.userID,
			"items?q=" + encodeURIComponent(q)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[1], json[0].key);

		// Search by phrase
		q = '"great title"';
		response = await API.userGet(
			config.userID,
			"items?q=" + encodeURIComponent(q)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);

		// Search by non-matching phrase
		q = '"better title"';
		response = await API.userGet(
			config.userID,
			"items?q=" + encodeURIComponent(q)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 0);
	});

	it('testFormatKeys', async function () {
		for (let i = 0; i < 5; i++) {
			collectionKeys.push(await API.createCollection("Test", false, null, 'key'));
			itemKeys.push(await API.createItem("book", false, null, 'key'));
			searchKeys.push(await API.createSearch("Test", 'default', null, 'key'));
		}
		itemKeys.push(await API.createAttachmentItem("imported_file", [], false, null, 'key'));

		await _testFormatKeys('collection');
		await _testFormatKeys('item');
		await _testFormatKeys('search');

		await _testFormatKeys('collection', true);
		await _testFormatKeys('item', true);
		await _testFormatKeys('search', true);
	});

	const _testFormatKeys = async (objectType, sorted = false) => {
		let objectTypePlural = await API.getPluralObjectType(objectType);
		let keysVar = objectType + "Keys";
		
		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?format=keys${sorted ? "&order=title" : ""}`
		);
		Helpers.assert200(response);

		let keys = response.data.trim().split("\n");
		keys.sort();
		const keysVarCopy = keysByName[keysVar];
		keysVarCopy.sort();
		assert.deepEqual(keys, keysVarCopy);
	};

	const _createPaginationData = async (objectType, num) => {
		switch (objectType) {
			case 'collection':
				for (let i = 0; i < num; i++) {
					await API.createCollection("Test", false, true, 'key');
				}
				break;

			case 'item':
				for (let i = 0; i < num; i++) {
					await API.createItem("book", false, true, 'key');
				}
				break;

			case 'search':
				for (let i = 0; i < num; i++) {
					await API.createSearch("Test", 'default', true, 'key');
				}
				break;

			case 'tag':
				await API.createItem("book", {
					tags: [
						{ tag: 'a' },
						{ tag: 'b' }
					]
				}, true);
				await API.createItem("book", {
					tags: [
						{ tag: 'c' },
						{ tag: 'd' },
						{ tag: 'e' }
					]
				}, true);
				break;
		}
	};

	it('testPagination', async function () {
		await _testPagination('collection');
		await _testPagination('group');
		
		await _testPagination('item');
		await _testPagination('search');
		await _testPagination('tag');
	});

	it('testCollectionQuickSearch', async function () {
		let title1 = "Test Title";
		let title2 = "Another Title";

		let keys = [];
		keys.push(await API.createCollection(title1, [], this, 'key'));
		keys.push(await API.createCollection(title2, [], this, 'key'));

		// Search by title
		let response = await API.userGet(
			config.userID,
			"collections?q=another"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[1], json[0].key);

		// No results
		response = await API.userGet(
			config.userID,
			"collections?q=nothing"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 0);
	});

	it('test_should_include_since_parameter_in_next_link', async function () {
		let totalResults = 6;
		let item = await API.createItem("book", false, true, 'json');
		let since = item.version;

		for (let i = 0; i < totalResults; i++) {
			await API.createItem("book", false, 'key');
		}

		let response = await API.userGet(
			config.userID,
			`items?limit=5&since=${since}`
		);

		let json = API.getJSONFromResponse(response);
		let linkParams = parseLinkHeader(response.headers.link[0]).next.params;

		assert.equal(linkParams.limit, 5);
		assert.property(linkParams, 'since');

		assert.lengthOf(json, 5);
		Helpers.assertNumResults(response, 5);
		Helpers.assertTotalResults(response, totalResults);
	});


	it('testItemQuickSearchOrderByDate', async function () {
		let title1 = "Test Title";
		let title2 = "Another Title";
		let keys = [];
		keys.push(await API.createItem("book", {
			title: title1,
			date: "February 12, 2013"
		}, this, 'key'));
		keys.push(await API.createItem("journalArticle", {
			title: title2,
			date: "November 25, 2012"
		}, this, 'key'));

		// Search by title
		let response = await API.userGet(
			config.userID,
			"items?q=" + encodeURIComponent(title1)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);

		// Search by both by title, date asc
		response = await API.userGet(
			config.userID,
			"items?q=title&sort=date&direction=asc"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[1], json[0].key);
		Helpers.assertEquals(keys[0], json[1].key);

		// Search by both by title, date asc, with old-style parameters
		response = await API.userGet(
			config.userID,
			"items?q=title&order=date&sort=asc"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[1], json[0].key);
		Helpers.assertEquals(keys[0], json[1].key);

		// Search by both by title, date desc
		response = await API.userGet(
			config.userID,
			"items?q=title&sort=date&direction=desc"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);
		Helpers.assertEquals(keys[1], json[1].key);

		// Search by both by title, date desc, with old-style parameters
		response = await API.userGet(
			config.userID,
			"items?q=title&order=date&sort=desc"
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);
		Helpers.assertEquals(keys[1], json[1].key);
	});

	it('testObjectKeyParameter', async function () {
		await _testObjectKeyParameter('collection');
		await _testObjectKeyParameter('item');
		await _testObjectKeyParameter('search');
	});

	it('testItemQuickSearch', async function () {
		let title1 = "Test Title";
		let title2 = "Another Title";
		let year2 = "2013";

		let keys = [];
		keys.push(await API.createItem("book", {
			title: title1
		}, this, 'key'));
		keys.push(await API.createItem("journalArticle", {
			title: title2,
			date: "November 25, " + year2
		}, this, 'key'));

		// Search by title
		let response = await API.userGet(
			config.userID,
			"items?q=" + encodeURIComponent(title1)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);

		// TODO: Search by creator

		// Search by year
		response = await API.userGet(
			config.userID,
			"items?q=" + year2
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[1], json[0].key);

		// Search by year + 1
		response = await API.userGet(
			config.userID,
			"items?q=" + (parseInt(year2) + 1)
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 0);
	});

	const _testObjectKeyParameter = async (objectType) => {
		const objectTypePlural = API.getPluralObjectType(objectType);
		let jsonArray = [];
		switch (objectType) {
			case 'collection':
				jsonArray.push(await API.createCollection("Name", false, this, 'jsonData'));
				jsonArray.push(await API.createCollection("Name", false, this, 'jsonData'));
				break;
			case 'item':
				jsonArray.push(await API.createItem("book", false, this, 'jsonData'));
				jsonArray.push(await API.createItem("book", false, this, 'jsonData'));
				break;
			case 'search':
				jsonArray.push(await API.createSearch(
					"Name",
					[
						{
							condition: "title",
							operator: "contains",
							value: "test",
						},
					],
					this,
					'jsonData'
				));
				jsonArray.push(await API.createSearch(
					"Name",
					[
						{
							condition: "title",
							operator: "contains",
							value: "test",
						},
					],
					this,
					'jsonData'
				));
				break;
		}
		let keys = [];
		jsonArray.forEach((json) => {
			keys.push(json.key);
		});

		let response = await API.userGet(
			config.userID,
			`${objectTypePlural}?${objectType}Key=${keys[0]}`
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 1);
		Helpers.assertTotalResults(response, 1);
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);

		response = await API.userGet(
			config.userID,
			`${objectTypePlural}?${objectType}Key=${keys[0]},${keys[1]}&order=${objectType}KeyList`
		);
		Helpers.assert200(response);
		Helpers.assertNumResults(response, 2);
		Helpers.assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		Helpers.assertEquals(keys[0], json[0].key);
		Helpers.assertEquals(keys[1], json[1].key);
	};
});
