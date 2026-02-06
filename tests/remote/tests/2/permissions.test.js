/**
 * Permissions tests for API v2
 * Port of tests/remote/tests/API/2/PermissionsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert403,
	assertNumResults,
	assertTotalResults
} from '../../assertions2.js';
import { setup } from '../../setup.js';

describe('Permissions (API v2)', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
	});

	afterEach(async function () {
		await API.setKeyOption(
			config.get('userID'), config.get('apiKey'), 'libraryWrite', 1
		);
	});

	// PHP: testUserGroupsAnonymous
	it('should get user groups anonymously', async function () {
		let response = await API.get(`users/${config.get('userID')}/groups?content=json`);
		assert200(response);
		// Note: PHP version checks numPublicGroups and specific group IDs
		// which require group setup infrastructure not available here
	});

	// PHP: testUserGroupsOwned
	it('should get user groups owned', async function () {
		let response = await API.get(
			`users/${config.get('userID')}/groups?content=json&key=${config.get('apiKey')}`
		);
		assert200(response);
		// Note: PHP version checks numOwnedGroups
		// which require group setup infrastructure not available here
	});

	// PHP: testKeyNoteAccess
	it('should handle key note access', async function () {
		await API.userClear(config.get('userID'));

		await API.setKeyOption(
			config.get('userID'), config.get('apiKey'), 'libraryNotes', 1
		);

		let keys = [];
		let topKeys = [];
		let bookKeys = [];

		let xml = await API.createItem('book', { title: 'A' }, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
		topKeys.push(data.key);
		bookKeys.push(data.key);

		xml = await API.createNoteItem('<p>B</p>', false, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
		topKeys.push(data.key);

		xml = await API.createNoteItem('<p>C</p>', false, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
		topKeys.push(data.key);

		xml = await API.createNoteItem('<p>D</p>', false, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
		topKeys.push(data.key);

		xml = await API.createNoteItem('<p>E</p>', false, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
		topKeys.push(data.key);

		xml = await API.createItem('book', { title: 'F' }, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);
		topKeys.push(data.key);
		bookKeys.push(data.key);

		xml = await API.createNoteItem('<p>G</p>', data.key, 'atom');
		data = API.parseDataFromAtomEntry(xml);
		keys.push(data.key);

		// Create collection and add items to it
		let response = await API.userPost(
			config.get('userID'),
			`collections?key=${config.get('apiKey')}`,
			JSON.stringify({
				collections: [
					{
						name: 'Test',
						parentCollection: false
					}
				]
			}),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let collectionKey = API.getFirstSuccessKeyFromResponse(response);

		response = await API.userPost(
			config.get('userID'),
			`collections/${collectionKey}/items?key=${config.get('apiKey')}`,
			topKeys.join(' ')
		);
		assert204(response);

		//
		// format=atom
		//
		// Root
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`
		);
		assertNumResults(response, keys.length);
		assertTotalResults(response, keys.length);

		// Top
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}`
		);
		assertNumResults(response, topKeys.length);
		assertTotalResults(response, topKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}`
		);
		assertNumResults(response, topKeys.length);
		assertTotalResults(response, topKeys.length);

		//
		// format=keys
		//
		// Root
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys`
		);
		assert200(response);
		assert.lengthOf(response.getBody().trim().split('\n'), keys.length);

		// Top
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}&format=keys`
		);
		assert200(response);
		assert.lengthOf(response.getBody().trim().split('\n'), topKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items/top?key=${config.get('apiKey')}&format=keys`
		);
		assert200(response);
		assert.lengthOf(response.getBody().trim().split('\n'), topKeys.length);

		// Remove notes privilege from key
		await API.setKeyOption(
			config.get('userID'), config.get('apiKey'), 'libraryNotes', 0
		);

		//
		// format=atom
		//
		// totalResults with limit
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&limit=1`
		);
		assertNumResults(response, 1);
		assertTotalResults(response, bookKeys.length);

		// And without limit
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// Top
		response = await API.userGet(
			config.get('userID'),
			`items/top?key=${config.get('apiKey')}`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		// Collection
		response = await API.userGet(
			config.get('userID'),
			`collections/${collectionKey}/items?key=${config.get('apiKey')}`
		);
		assertNumResults(response, bookKeys.length);
		assertTotalResults(response, bookKeys.length);

		//
		// format=keys
		//
		response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys`
		);
		let keysResult = response.getBody().trim().split('\n');
		keysResult.sort();
		bookKeys.sort();
		assert.isEmpty(
			[
				...bookKeys.filter(k => !keysResult.includes(k)),
				...keysResult.filter(k => !bookKeys.includes(k))
			]
		);

		// Restore notes privilege
		await API.setKeyOption(
			config.get('userID'), config.get('apiKey'), 'libraryNotes', 1
		);
	});

	// PHP: testTagDeletePermissions
	it('should handle tag delete permissions', async function () {
		await API.userClear(config.get('userID'));

		await API.createItem('book', {
			tags: [
				{ tag: 'A' }
			]
		}, 'atom');

		let libraryVersion = await API.getLibraryVersion();

		await API.setKeyOption(
			config.get('userID'), config.get('apiKey'), 'libraryWrite', 0
		);

		let response = await API.userDelete(
			config.get('userID'),
			`tags?tag=A&key=${config.get('apiKey')}`
		);
		assert403(response);

		await API.setKeyOption(
			config.get('userID'), config.get('apiKey'), 'libraryWrite', 1
		);

		response = await API.userDelete(
			config.get('userID'),
			`tags?tag=A&key=${config.get('apiKey')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion}`]
		);
		assert204(response);
	});
});
