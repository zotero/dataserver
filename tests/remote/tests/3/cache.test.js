/**
 * Cache API tests
 * Port of tests/remote/tests/API/3/CacheTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import { setup } from '../../setup.js';

describe('Caching', function () {
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

	// PHP: testCacheCreatorPrimaryData
	it('should cache creator primary data', async function () {
		let data = {
			title: 'Title',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last'
				},
				{
					creatorType: 'editor',
					firstName: 'Ed',
					lastName: 'McEditor'
				}
			]
		};

		let key = await API.createItem('book', data, 'key');

		let response = await API.userGet(
			config.get('userID'),
			`items/${key}?content=csljson`
		);
		let json = JSON.parse(API.getContentFromResponse(response));
		assert.equal(json.author[0].given, 'First');
		assert.equal(json.author[0].family, 'Last');
		assert.equal(json.editor[0].given, 'Ed');
		assert.equal(json.editor[0].family, 'McEditor');
	});
});
