/**
 * Sort tests for API v2
 * Port of tests/remote/tests/API/2/SortTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Sort (API v2)', function () {
	this.timeout(60000);

	let itemKeys = [];
	let childAttachmentKeys = [];
	let childNoteKeys = [];

	const titles = ['q', 'c', 'a', 'j', 'e', 'h', 'i'];
	const names = ['m', 's', 'a', 'bb', 'ba', '', ''];
	const attachmentTitles = ['v', 'x', null, 'a', null];
	const notes = [null, 'aaa', null, null, 'taf'];

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));

		// Create items
		let titlesClone = [...titles];
		let namesClone = [...names];

		for (let i = 0; i < titles.length - 2; i++) {
			let key = await API.createItem('book', {
				title: titlesClone.shift(),
				creators: [
					{
						creatorType: 'author',
						name: namesClone.shift()
					}
				]
			}, 'key');

			// Child attachments
			if (attachmentTitles[i] !== null) {
				childAttachmentKeys.push(
					await API.createAttachmentItem('imported_file', {
						title: attachmentTitles[i]
					}, key, 'key')
				);
			}
			// Child notes
			if (notes[i] !== null) {
				childNoteKeys.push(
					await API.createNoteItem(notes[i], key, 'key')
				);
			}

			itemKeys.push(key);
		}

		// Top-level attachment
		itemKeys.push(
			await API.createAttachmentItem('imported_file', {
				title: titlesClone.shift()
			}, false, 'key')
		);

		// Top-level note
		itemKeys.push(
			await API.createNoteItem(titlesClone.shift(), null, 'key')
		);
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testSortTopItemsTitle
	it('should sort top items by title', async function () {
		let response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&format=keys&order=title`
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');

		// Sort titles and get corresponding keys
		let titlesWithIndex = titles.map((t, i) => ({ title: t, index: i }));
		titlesWithIndex.sort((a, b) => a.title.localeCompare(b.title));

		assert.equal(keys.length, titles.length);

		let correct = titlesWithIndex.map(t => itemKeys[t.index]);
		assert.deepEqual(keys, correct);
	});

	// PHP: testSortTopItemsCreator
	it('should sort top items by creator', async function () {
		let response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&format=keys&order=creator`
		);
		assert200(response);
		let keys = response.getBody().trim().split('\n');

		// Sort names (empty strings go at the end)
		let namesWithIndex = names.map((n, i) => ({ name: n, index: i }));
		namesWithIndex.sort((a, b) => {
			if (a.name === '' && b.name !== '') return 1;
			if (b.name === '' && a.name !== '') return -1;
			return a.name.localeCompare(b.name);
		});

		assert.equal(keys.length, names.length);

		let endKeys = keys.slice(-2);
		let mainKeys = keys.slice(0, -2);

		let correct = namesWithIndex
			.filter(n => n.name !== '')
			.map(n => itemKeys[n.index]);

		assert.deepEqual(mainKeys, correct);
		// Check attachment and note, which should fall back to ordered added (itemID)
		assert.deepEqual(endKeys, itemKeys.slice(-2));
	});
});
