/**
 * API Parameters tests
 * Port of tests/remote/tests/API/3/ParamsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assertNumResults,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Parameters', function () {
	this.timeout(60000);

	let collectionKeys = [];
	let itemKeys = [];
	let searchKeys = [];

	beforeEach(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testFormatKeys
	it('should return keys format', async function () {
		collectionKeys = [];
		itemKeys = [];
		searchKeys = [];

		// Collections
		for (let i = 0; i < 5; i++) {
			collectionKeys.push(await API.createCollection('Test', {}, 'key'));
		}

		// Items
		for (let i = 0; i < 5; i++) {
			itemKeys.push(await API.createItem('book', {}, 'key'));
		}
		itemKeys.push(await API.createAttachmentItem('imported_file', [], false, 'key'));

		// Searches
		for (let i = 0; i < 5; i++) {
			searchKeys.push(await API.createSearch('Test', [
				{
					condition: 'title',
					operator: 'contains',
					value: 'test'
				}
			], 'key'));
		}

		await testFormatKeys('collection', collectionKeys);
		await testFormatKeys('item', itemKeys);
		await testFormatKeys('search', searchKeys);

		await testFormatKeysSorted('collection', collectionKeys);
		await testFormatKeysSorted('item', itemKeys);
		await testFormatKeysSorted('search', searchKeys);
	});

	// PHP: testObjectKeyParameter
	it('should handle object key parameter', async function () {
		await testObjectKeyParameter('collection');
		await testObjectKeyParameter('item');
		await testObjectKeyParameter('search');
	});

	// PHP: testPagination
	it('should handle pagination', async function () {
		await testPagination('collection');
		// await testPagination('group');
		await testPagination('item');
		await testPagination('search');
		await testPagination('tag');
	});

	// PHP: test_should_include_since_parameter_in_next_link
	it('should include since parameter in next link', async function () {
		let totalResults = 6;

		let since = (await API.createItem('book', {}, 'json')).version;

		for (let i = 0; i < totalResults; i++) {
			await API.createItem('book', {}, 'key');
		}

		let response = await API.userGet(
			config.get('userID'),
			`items?limit=5&since=${since}`
		);

		let json = API.getJSONFromResponse(response);
		let linkParams = parseLinkHeader(response.getHeader('Link')).next.params;
		assert.equal(linkParams.limit, '5');
		assert.property(linkParams, 'since');

		assert.lengthOf(json, 5);
		assertNumResults(response, 5);
		assertTotalResults(response, totalResults);
	});

	// PHP: testCollectionQuickSearch
	it('should search collections', async function () {
		let title1 = 'Test Title';
		let title2 = 'Another Title';

		let keys = [];
		keys.push(await API.createCollection(title1, {}, 'key'));
		keys.push(await API.createCollection(title2, {}, 'key'));

		// Search by title
		let response = await API.userGet(
			config.get('userID'),
			'collections?q=another'
		);
		assert200(response);
		assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[1]);

		// No results
		response = await API.userGet(
			config.get('userID'),
			'collections?q=nothing'
		);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: testItemQuickSearch
	it('should search items', async function () {
		let title1 = 'Test Title';
		let title2 = 'Another Title';
		let year2 = '2013';

		let keys = [];
		keys.push(await API.createItem('book', {
			title: title1
		}, 'key'));
		keys.push(await API.createItem('journalArticle', {
			title: title2,
			date: `November 25, ${year2}`
		}, 'key'));

		// Search by title
		let response = await API.userGet(
			config.get('userID'),
			`items?q=${encodeURIComponent(title1)}`
		);
		assert200(response);
		assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);

		// Search by year
		response = await API.userGet(
			config.get('userID'),
			`items?q=${year2}`
		);
		assert200(response);
		assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[1]);

		// Search by year + 1
		response = await API.userGet(
			config.get('userID'),
			`items?q=${parseInt(year2) + 1}`
		);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: test_should_perform_quicksearch_with_multiple_words
	it('should perform quicksearch with multiple words', async function () {
		let title1 = 'This Is a Great Title';
		let title2 = 'Great, But Is It Better Than This Title?';

		let keys = [];
		keys.push(await API.createItem('book', {
			title: title1
		}, 'key'));
		keys.push(await API.createItem('journalArticle', {
			title: title2
		}, 'key'));

		// Search by multiple independent words
		let q = 'better title';
		let response = await API.userGet(
			config.get('userID'),
			`items?q=${encodeURIComponent(q)}`
		);
		assert200(response);
		assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[1]);

		// Search by phrase
		q = '"great title"';
		response = await API.userGet(
			config.get('userID'),
			`items?q=${encodeURIComponent(q)}`
		);
		assert200(response);
		assertNumResults(response, 1);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);

		// Search by non-matching phrase
		q = '"better title"';
		response = await API.userGet(
			config.get('userID'),
			`items?q=${encodeURIComponent(q)}`
		);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: testItemQuickSearchOrderByDate
	it('should order quicksearch by date', async function () {
		let title1 = 'Test Title';
		let title2 = 'Another Title';

		let keys = [];
		keys.push(await API.createItem('book', {
			title: title1,
			date: 'February 12, 2013'
		}, 'key'));
		keys.push(await API.createItem('journalArticle', {
			title: title2,
			date: 'November 25, 2012'
		}, 'key'));

		// Search for one by title
		let response = await API.userGet(
			config.get('userID'),
			`items?q=${encodeURIComponent(title1)}`
		);
		assert200(response);
		assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);

		// Search by both by title, date asc
		response = await API.userGet(
			config.get('userID'),
			'items?q=title&sort=date&direction=asc'
		);
		assert200(response);
		assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[1]);
		assert.equal(json[1].key, keys[0]);

		// Search by both by title, date asc, with old-style parameters
		response = await API.userGet(
			config.get('userID'),
			'items?q=title&order=date&sort=asc'
		);
		assert200(response);
		assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[1]);
		assert.equal(json[1].key, keys[0]);

		// Search by both by title, date desc
		response = await API.userGet(
			config.get('userID'),
			'items?q=title&sort=date&direction=desc'
		);
		assert200(response);
		assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);
		assert.equal(json[1].key, keys[1]);

		// Search by both by title, date desc, with old-style parameters
		response = await API.userGet(
			config.get('userID'),
			'items?q=title&order=date&sort=desc'
		);
		assert200(response);
		assertNumResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);
		assert.equal(json[1].key, keys[1]);
	});

	// Helper functions

	async function testFormatKeys(objectType, keysArray) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?format=keys`
		);
		assert200(response);

		let keys = response.getBody().trim().split('\n');
		keys.sort();
		let sortedKeysArray = [...keysArray].sort();
		assert.deepEqual(keys, sortedKeysArray);
	}

	async function testFormatKeysSorted(objectType, keysArray) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?format=keys&order=title`
		);
		assert200(response);

		let keys = response.getBody().trim().split('\n');
		keys.sort();
		let sortedKeysArray = [...keysArray].sort();
		assert.deepEqual(keys, sortedKeysArray);
	}

	async function testObjectKeyParameter(objectType) {
		let objectTypePlural = API.getPluralObjectType(objectType);

		let jsonArray = [];

		switch (objectType) {
			case 'collection':
				jsonArray.push(await API.createCollection('Name', {}, 'jsonData'));
				jsonArray.push(await API.createCollection('Name', {}, 'jsonData'));
				break;

			case 'item':
				jsonArray.push(await API.createItem('book', {}, 'jsonData'));
				jsonArray.push(await API.createItem('book', {}, 'jsonData'));
				break;

			case 'search':
				jsonArray.push(await API.createSearch('Name', [
					{
						condition: 'title',
						operator: 'contains',
						value: 'test'
					}
				], 'jsonData'));
				jsonArray.push(await API.createSearch('Name', [
					{
						condition: 'title',
						operator: 'contains',
						value: 'test'
					}
				], 'jsonData'));
				break;
		}

		let keys = jsonArray.map(json => json.key);

		let response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?${objectType}Key=${keys[0]}`
		);
		assert200(response);
		assertNumResults(response, 1);
		assertTotalResults(response, 1);
		let json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);

		response = await API.userGet(
			config.get('userID'),
			`${objectTypePlural}?${objectType}Key=${keys[0]},${keys[1]}&order=${objectType}KeyList`
		);
		assert200(response);
		assertNumResults(response, 2);
		assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		assert.equal(json[0].key, keys[0]);
		assert.equal(json[1].key, keys[1]);
	}

	async function createPaginationData(objectType, num) {
		switch (objectType) {
			case 'collection':
				for (let i = 0; i < num; i++) {
					await API.createCollection('Test', {}, 'key');
				}
				break;

			case 'item':
				for (let i = 0; i < num; i++) {
					await API.createItem('book', {}, 'key');
				}
				break;

			case 'search':
				for (let i = 0; i < num; i++) {
					await API.createSearch('Test', [
						{
							condition: 'title',
							operator: 'contains',
							value: 'test'
						}
					], 'key');
				}
				break;

			case 'tag':
				await API.createItem('book', {
					tags: [
						{ tag: 'a' },
						{ tag: 'b' }
					]
				});
				await API.createItem('book', {
					tags: [
						{ tag: 'c' },
						{ tag: 'd' },
						{ tag: 'e' }
					]
				});
				break;
		}
	}

	async function testPagination(objectType) {
		await API.userClear(config.get('userID'));

		let objectTypePlural = API.getPluralObjectType(objectType);

		let limit = 2;
		let totalResults = 5;
		let formats = ['json', 'atom', 'keys'];

		// Create sample data
		switch (objectType) {
			case 'collection':
			case 'item':
			case 'search':
			case 'tag':
				await createPaginationData(objectType, totalResults);
				break;
		}

		switch (objectType) {
			case 'item':
				formats.push('bibtex');
				break;

			case 'tag':
				formats = formats.filter(val => val !== 'keys');
				break;
		}

		for (let format of formats) {
			let response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?limit=${limit}&format=${format}`
			);
			assert200(response);
			assertNumResults(response, limit);
			assertTotalResults(response, totalResults);
			let links = parseLinkHeader(response.getHeader('Link'));
			assert.notProperty(links, 'first');
			assert.notProperty(links, 'prev');
			assert.property(links, 'next');
			assert.equal(links.next.params.start, limit.toString());
			assert.equal(links.next.params.limit, limit.toString());
			assert.property(links, 'last');
			let lastStart = totalResults - (totalResults % limit);
			if (lastStart === totalResults) {
				lastStart -= limit;
			}
			assert.equal(links.last.params.start, lastStart.toString());
			assert.equal(links.last.params.limit, limit.toString());

			// Start at 1
			let start = 1;
			response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?start=${start}&limit=${limit}&format=${format}`
			);
			assert200(response);
			assertNumResults(response, limit);
			assertTotalResults(response, totalResults);
			links = parseLinkHeader(response.getHeader('Link'));
			assert.property(links, 'first');
			assert.notProperty(links.first.params, 'start');
			assert.equal(links.first.params.limit, limit.toString());
			assert.property(links, 'prev');
			assert.notProperty(links.prev.params, 'start');
			assert.equal(links.prev.params.limit, limit.toString());
			assert.property(links, 'next');
			assert.equal(links.next.params.start, (start + limit).toString());
			assert.equal(links.next.params.limit, limit.toString());
			assert.property(links, 'last');
			assert.equal(links.last.params.start, lastStart.toString());
			assert.equal(links.last.params.limit, limit.toString());

			// Start at 2
			start = 2;
			response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?start=${start}&limit=${limit}&format=${format}`
			);
			assert200(response);
			assertNumResults(response, limit);
			assertTotalResults(response, totalResults);
			links = parseLinkHeader(response.getHeader('Link'));
			assert.property(links, 'first');
			assert.notProperty(links.first.params, 'start');
			assert.equal(links.first.params.limit, limit.toString());
			assert.property(links, 'prev');
			assert.notProperty(links.prev.params, 'start');
			assert.equal(links.prev.params.limit, limit.toString());
			assert.property(links, 'next');
			assert.equal(links.next.params.start, (start + limit).toString());
			assert.equal(links.next.params.limit, limit.toString());
			assert.property(links, 'last');
			assert.equal(links.last.params.start, lastStart.toString());
			assert.equal(links.last.params.limit, limit.toString());

			// Start at 3
			start = 3;
			response = await API.userGet(
				config.get('userID'),
				`${objectTypePlural}?start=${start}&limit=${limit}&format=${format}`
			);
			assert200(response);
			assertNumResults(response, limit);
			assertTotalResults(response, totalResults);
			links = parseLinkHeader(response.getHeader('Link'));
			assert.property(links, 'first');
			assert.notProperty(links.first.params, 'start');
			assert.equal(links.first.params.limit, limit.toString());
			assert.property(links, 'prev');
			assert.equal(links.prev.params.start, Math.max(0, start - limit).toString());
			assert.equal(links.prev.params.limit, limit.toString());
			assert.notProperty(links, 'next');
			assert.property(links, 'last');
			assert.equal(links.last.params.start, lastStart.toString());
			assert.equal(links.last.params.limit, limit.toString());
		}
	}

	function parseLinkHeader(links) {
		assert.isNotNull(links);
		let linksArray = links.split(',');
		let parsedLinks = {};
		for (let link of linksArray) {
			let [uri, rel] = link.trim().split('; ');
			assert.match(uri, /^<https?:\/\/[^ ]+>$/);
			assert.match(rel, /^rel="[a-z]+"$/);
			uri = uri.substring(1, uri.length - 1);
			rel = rel.substring('rel="'.length, rel.length - 1);

			let url = new URL(uri);
			let params = Object.fromEntries(url.searchParams);
			parsedLinks[rel] = {
				uri: uri,
				params: params
			};
		}
		return parsedLinks;
	}
});
