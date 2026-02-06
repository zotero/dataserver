/**
 * General API tests
 * Port of tests/remote/tests/API/3/GeneralTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200ForObject,
	assert400,
	assert412
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import crypto from 'crypto';

describe('General', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: test_should_return_400_if_string_passed_as_userID
	it('should return 400 if string passed as userID', async function () {
		let response = await API.userGet(
			'foo',
			'items'
		);
		assert400(response);
	});

	// PHP: testZoteroWriteToken
	it('should handle Zotero Write Token', async function () {
		let json = await API.getItemTemplate('book');

		let token = crypto.createHash('md5').update(Date.now().toString()).digest('hex');

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			[
				'Content-Type: application/json',
				`Zotero-Write-Token: ${token}`
			]
		);
		assert200ForObject(response);

		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			[
				'Content-Type: application/json',
				`Zotero-Write-Token: ${token}`
			]
		);
		assert412(response);
	});

	// PHP: testInvalidCharacters
	it('should filter invalid characters', async function () {
		let data = {
			title: 'A\x00A',
			creators: [
				{
					creatorType: 'author',
					name: 'B\x01B'
				}
			],
			tags: [
				{
					tag: 'C\x02C'
				}
			]
		};
		let json = await API.createItem('book', data, 'jsonData');
		assert.equal(json.title, 'AA');
		assert.equal(json.creators[0].name, 'BB');
		assert.equal(json.tags[0].tag, 'CC');
	});
});
