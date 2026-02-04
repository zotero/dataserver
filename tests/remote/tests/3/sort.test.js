/**
 * Sort API tests
 * Port of tests/remote/tests/API/3/SortTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Sorting', function() {
	this.timeout(30000);

	let collectionKeys = [];
	let itemKeys = [];
	let childAttachmentKeys = [];
	let childNoteKeys = [];
	let searchKeys = [];

	let titles = ['q', 'c', 'a', 'j', 'e', 'h', 'i'];
	let names = ['m', 's', 'a', 'bb', 'ba', '', ''];
	let attachmentTitles = ['v', 'x', null, 'a', null];
	let notes = [null, 'aaa', null, null, 'taf'];

	before(async function() {
		// Reset module-level arrays
		collectionKeys = [];
		itemKeys = [];
		childAttachmentKeys = [];
		childNoteKeys = [];
		searchKeys = [];

		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));

		// Create items
		let titlesCopy = [...titles];
		let namesCopy = [...names];
		for (let i = 0; i < titles.length - 2; i++) {
			let key = await API.createItem('book', {
				title: titlesCopy.shift(),
				creators: [
					{
						creatorType: 'author',
						name: namesCopy.shift()
					}
				]
			}, 'key');

			// Child attachments
			if (attachmentTitles[i] !== null) {
				childAttachmentKeys.push(await API.createAttachmentItem('imported_file', {
					title: attachmentTitles[i]
				}, key, 'key'));
			}
			// Child notes
			if (notes[i] !== null) {
				childNoteKeys.push(await API.createNoteItem(notes[i], key, 'key'));
			}

			itemKeys.push(key);
		}
		// Top-level attachment
		itemKeys.push(await API.createAttachmentItem('imported_file', {
			title: titlesCopy.shift()
		}, false, 'key'));
		// Top-level note
		itemKeys.push(await API.createNoteItem(titlesCopy.shift(), false, 'key'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testSortTopItemsTitle
	it('should sort top items by title', async function() {
		let response = await API.userGet(
			config.get('userID'),
			'items/top?format=keys&sort=title'
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		let titlesSorted = [...titles];
		let indexed = titlesSorted.map((v, i) => ({ v, i }));
		indexed.sort((a, b) => a.v.localeCompare(b.v));
		assert.lengthOf(keys, titles.length);
		let correct = indexed.map(item => itemKeys[item.i]);
		assert.deepEqual(keys, correct);
	});

	// PHP: testSortTopItemsTitleOrder
	it('should sort top items by title using order parameter', async function() {
		// Same thing, but with order parameter for backwards compatibility
		let response = await API.userGet(
			config.get('userID'),
			'items/top?format=keys&order=title'
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		let titlesSorted = [...titles];
		let indexed = titlesSorted.map((v, i) => ({ v, i }));
		indexed.sort((a, b) => a.v.localeCompare(b.v));
		assert.lengthOf(keys, titles.length);
		let correct = indexed.map(item => itemKeys[item.i]);
		assert.deepEqual(keys, correct);
	});

	// PHP: testSortTopItemsCreator
	it('should sort top items by creator', async function() {
		let response = await API.userGet(
			config.get('userID'),
			'items/top?format=keys&sort=creator'
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		let namesSorted = [...names];
		let indexed = namesSorted.map((v, i) => ({ v, i }));
		indexed.sort((a, b) => {
			if (a.v === '' && b.v !== '') return 1;
			if (b.v === '' && a.v !== '') return -1;
			return a.v.localeCompare(b.v);
		});
		assert.lengthOf(keys, names.length);
		let endKeys = keys.splice(-2);
		let correct = indexed.map(item => itemKeys[item.i]);
		// Remove empty names
		correct.splice(-2);
		assert.deepEqual(keys, correct);
		// Check attachment and note, which should fall back to ordered added (itemID)
		assert.deepEqual(endKeys, itemKeys.slice(-2));
	});

	// PHP: testSortTopItemsCreatorOrder
	it('should sort top items by creator using order parameter', async function() {
		// Same thing, but with 'order' for backwards compatibility
		let response = await API.userGet(
			config.get('userID'),
			'items/top?format=keys&order=creator'
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');
		let namesSorted = [...names];
		let indexed = namesSorted.map((v, i) => ({ v, i }));
		indexed.sort((a, b) => {
			if (a.v === '' && b.v !== '') return 1;
			if (b.v === '' && a.v !== '') return -1;
			return a.v.localeCompare(b.v);
		});
		assert.lengthOf(keys, names.length);
		let endKeys = keys.splice(-2);
		let correct = indexed.map(item => itemKeys[item.i]);
		// Remove empty names
		correct.splice(-2);
		assert.deepEqual(keys, correct);
		// Check attachment and note, which should fall back to ordered added (itemID)
		assert.deepEqual(endKeys, itemKeys.slice(-2));
	});

	// PHP: testSortSortParamAsDirectionWithoutOrder
	it('should handle sort parameter as direction without order', async function() {
		// Old sort=asc, with no 'order' param
		let response = await API.userGet(
			config.get('userID'),
			'items?format=keys&sort=asc'
		);
		// We can't test dateAdded without adding lots of delays,
		// so just make sure this doesn't throw an error
		assert200(response);
	});

	// PHP: test_sort_top_level_items_by_item_type
	it('should sort top level items by item type', async function() {
		let response = await API.userGet(
			config.get('userID'),
			'items/top?sort=itemType'
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		let itemTypes = json.map(arr => arr.data.itemType);
		let sorted = [...itemTypes];
		sorted.sort();
		assert.deepEqual(itemTypes, sorted);
	});

	// PHP: testSortDefault
	it('should use default sort', async function() {
		await API.userClear(config.get('userID'));

		// Setup
		let dataArray = [];

		dataArray.push(await API.createItem('book', {
			title: 'B',
			creators: [
				{
					creatorType: 'author',
					name: 'B'
				}
			],
			dateAdded: '2014-02-05T00:00:00Z',
			dateModified: '2014-04-05T01:00:00Z'
		}, 'jsonData'));

		dataArray.push(await API.createItem('journalArticle', {
			title: 'A',
			creators: [
				{
					creatorType: 'author',
					name: 'A'
				}
			],
			dateAdded: '2014-02-04T00:00:00Z',
			dateModified: '2014-01-04T01:00:00Z'
		}, 'jsonData'));

		dataArray.push(await API.createItem('newspaperArticle', {
			title: 'F',
			creators: [
				{
					creatorType: 'author',
					name: 'F'
				}
			],
			dateAdded: '2014-02-03T00:00:00Z',
			dateModified: '2014-02-03T01:00:00Z'
		}, 'jsonData'));

		dataArray.push(await API.createItem('book', {
			title: 'C',
			creators: [
				{
					creatorType: 'author',
					name: 'C'
				}
			],
			dateAdded: '2014-02-02T00:00:00Z',
			dateModified: '2014-03-02T01:00:00Z'
		}, 'jsonData'));

		// Get sorted keys
		let sortedByDateAddedDesc = [...dataArray];
		sortedByDateAddedDesc.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
		let keysByDateAddedDescending = sortedByDateAddedDesc.map(data => data.key);

		let sortedByDateModifiedDesc = [...dataArray];
		sortedByDateModifiedDesc.sort((a, b) => b.dateModified.localeCompare(a.dateModified));
		let keysByDateModifiedDescending = sortedByDateModifiedDesc.map(data => data.key);

		// Tests
		let response = await API.userGet(
			config.get('userID'),
			'items?format=keys'
		);
		assert200(response);
		assert.deepEqual(keysByDateModifiedDescending, response.getBody().trim().split('\n'));

		response = await API.userGet(
			config.get('userID'),
			'items?format=json'
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		let keys = json.map(val => val.key);
		assert.deepEqual(keysByDateModifiedDescending, keys);

		response = await API.userGet(
			config.get('userID'),
			'items?format=atom'
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		keys = xpathSelect(xml, '//atom:entry/zapi:key').map(val => val.textContent);
		assert.deepEqual(keysByDateAddedDescending, keys);
	});

	// PHP: testSortDirection
	it('should handle sort direction', async function() {
		await API.userClear(config.get('userID'));

		// Setup
		let dataArray = [];

		dataArray.push(await API.createItem('book', {
			title: 'B',
			creators: [
				{
					creatorType: 'author',
					name: 'B'
				}
			],
			dateAdded: '2014-02-05T00:00:00Z',
			dateModified: '2014-04-05T01:00:00Z'
		}, 'jsonData'));

		dataArray.push(await API.createItem('journalArticle', {
			title: 'A',
			creators: [
				{
					creatorType: 'author',
					name: 'A'
				}
			],
			dateAdded: '2014-02-04T00:00:00Z',
			dateModified: '2014-01-04T01:00:00Z'
		}, 'jsonData'));

		dataArray.push(await API.createItem('newspaperArticle', {
			title: 'F',
			creators: [
				{
					creatorType: 'author',
					name: 'F'
				}
			],
			dateAdded: '2014-02-03T00:00:00Z',
			dateModified: '2014-02-03T01:00:00Z'
		}, 'jsonData'));

		dataArray.push(await API.createItem('book', {
			title: 'C',
			creators: [
				{
					creatorType: 'author',
					name: 'C'
				}
			],
			dateAdded: '2014-02-02T00:00:00Z',
			dateModified: '2014-03-02T01:00:00Z'
		}, 'jsonData'));

		// Get sorted keys
		let sortedByDateAddedAsc = [...dataArray];
		sortedByDateAddedAsc.sort((a, b) => a.dateAdded.localeCompare(b.dateAdded));
		let keysByDateAddedAscending = sortedByDateAddedAsc.map(data => data.key);
		let keysByDateAddedDescending = [...keysByDateAddedAscending].reverse();

		// Ascending
		let response = await API.userGet(
			config.get('userID'),
			'items?format=keys&sort=dateAdded&direction=asc'
		);
		assert200(response);
		assert.deepEqual(keysByDateAddedAscending, response.getBody().trim().split('\n'));

		response = await API.userGet(
			config.get('userID'),
			'items?format=json&sort=dateAdded&direction=asc'
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		let keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedAscending, keys);

		response = await API.userGet(
			config.get('userID'),
			'items?format=atom&sort=dateAdded&direction=asc'
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		keys = xpathSelect(xml, '//atom:entry/zapi:key').map(val => val.textContent);
		assert.deepEqual(keysByDateAddedAscending, keys);

		// Ascending using old 'order'/'sort' instead of 'sort'/'direction'
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&order=dateAdded&sort=asc'
		);
		assert200(response);
		assert.deepEqual(keysByDateAddedAscending, response.getBody().trim().split('\n'));

		response = await API.userGet(
			config.get('userID'),
			'items?format=json&order=dateAdded&sort=asc'
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedAscending, keys);

		response = await API.userGet(
			config.get('userID'),
			'items?format=atom&order=dateAdded&sort=asc'
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		keys = xpathSelect(xml, '//atom:entry/zapi:key').map(val => val.textContent);
		assert.deepEqual(keysByDateAddedAscending, keys);

		// Deprecated 'order'/'sort', but the wrong way
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&sort=dateAdded&order=asc'
		);
		assert200(response);
		assert.deepEqual(keysByDateAddedAscending, response.getBody().trim().split('\n'));

		// Descending
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&sort=dateAdded&direction=desc'
		);
		assert200(response);
		assert.deepEqual(keysByDateAddedDescending, response.getBody().trim().split('\n'));

		response = await API.userGet(
			config.get('userID'),
			'items?format=json&sort=dateAdded&direction=desc'
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedDescending, keys);

		response = await API.userGet(
			config.get('userID'),
			'items?format=atom&sort=dateAdded&direction=desc'
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		keys = xpathSelect(xml, '//atom:entry/zapi:key').map(val => val.textContent);
		assert.deepEqual(keysByDateAddedDescending, keys);

		// Descending with old 'order'/'sort'
		response = await API.userGet(
			config.get('userID'),
			'items?format=keys&order=dateAdded&sort=desc'
		);
		assert200(response);
		assert.deepEqual(keysByDateAddedDescending, response.getBody().trim().split('\n'));

		response = await API.userGet(
			config.get('userID'),
			'items?format=json&order=dateAdded&sort=desc'
		);
		assert200(response);
		json = API.getJSONFromResponse(response);
		keys = json.map(val => val.key);
		assert.deepEqual(keysByDateAddedDescending, keys);

		response = await API.userGet(
			config.get('userID'),
			'items?format=atom&order=dateAdded&sort=desc'
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		keys = xpathSelect(xml, '//atom:entry/zapi:key').map(val => val.textContent);
		assert.deepEqual(keysByDateAddedDescending, keys);
	});
});
