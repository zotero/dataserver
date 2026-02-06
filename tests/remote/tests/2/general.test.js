/**
 * General API tests for API v2
 * Port of tests/remote/tests/API/2/GeneralTest.php
 */

import { assert } from 'chai';
import config from 'config';
import crypto from 'crypto';
import { API } from '../../api2.js';
import {
	assert200ForObject,
	assert412
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('General (API v2)', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testZoteroWriteToken
	it('should handle Zotero-Write-Token', async function () {
		let json = await API.getItemTemplate('book');

		let token = crypto.randomUUID().replace(/-/g, '');

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			[
				'Content-Type: application/json',
				`Zotero-Write-Token: ${token}`
			]
		);
		assert200ForObject(response);

		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			[
				'Content-Type: application/json',
				`Zotero-Write-Token: ${token}`
			]
		);
		assert412(response);
	});

	// PHP: testInvalidCharacters
	it('should strip invalid characters', async function () {
		let data = {
			title: 'A\0A',
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
		let xml = await API.createItem('book', data, 'atom');
		let atomData = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(atomData.content);
		assert.equal(json.title, 'AA');
		assert.equal(json.creators[0].name, 'BB');
		assert.equal(json.tags[0].tag, 'CC');
	});
});
