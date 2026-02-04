/**
 * Cache tests for API v2
 * Port of tests/remote/tests/API/2/CacheTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Cache (API v2)', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testCacheCreatorPrimaryData
	it('should cache creator primary data', async function() {
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
			`items/${key}?key=${config.get('apiKey')}&content=csljson`
		);
		assert200(response);
		let content = API.getContentFromResponse(response);
		let json = JSON.parse(content);
		assert.equal(json.author[0].given, 'First');
		assert.equal(json.author[0].family, 'Last');
		assert.equal(json.editor[0].given, 'Ed');
		assert.equal(json.editor[0].family, 'McEditor');
	});
});
