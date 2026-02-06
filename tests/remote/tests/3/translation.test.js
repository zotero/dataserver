/**
 * Web Translation API tests
 * Port of tests/remote/tests/API/3/TranslationTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert300,
	assert400,
	assert200ForObject
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Translation', function () {
	this.timeout(30000);

	beforeEach(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testWebTranslationSingle
	it('should translate single web page', async function () {
		let url = 'https://forums.zotero.org';
		let title = 'Recent Discussions';

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify({
				url: url
			}),
			['Content-Type: application/json']
		);
		assert200(response);
		assert200ForObject(response);
		let json = API.getJSONFromResponse(response);
		let itemKey = json.success[0];
		let data = (await API.getItem(itemKey, 'json')).data;
		assert.equal(data.title, title);
	});

	// PHP: testWebTranslationMultiple
	it('should translate multiple web pages', async function () {
		this.timeout(60000); // Longer timeout for translation service

		let url = 'https://zotero-static.s3.amazonaws.com/test-multiple.html';
		let title = 'Digital history: A guide to gathering, preserving, and presenting the past on the web';

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify({
				url: url
			}),
			['Content-Type: application/json']
		);
		assert300(response);
		let json = JSON.parse(response.getBody());

		let results = json.items;
		let keys = Object.keys(results);
		let key = keys[0];
		let val = results[key];
		assert.equal(key, '0');
		assert.equal(val, title);

		let items = {};
		items[key] = val;

		// Missing token
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				url: url,
				items: items
			}),
			['Content-Type: application/json']
		);
		assert400(response, 'Token not provided with selected items');

		// Invalid selection
		let items2 = { ...items };
		let invalidKey = '12345';
		items2[invalidKey] = items2[key];
		delete items2[key];
		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				url: url,
				token: json.token,
				items: items2
			}),
			['Content-Type: application/json']
		);
		assert400(response, `Index '${invalidKey}' not found for URL and token`);

		response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				url: url,
				token: json.token,
				items: items
			}),
			['Content-Type: application/json']
		);

		assert200(response);
		assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		let itemKey = json.success[0];
		let data = (await API.getItem(itemKey, 'json')).data;
		assert.equal(data.title, title);
	});

	// PHP: testWebTranslationInvalidToken
	it('should reject invalid token', async function () {
		let url = 'https://zotero-static.s3.amazonaws.com/test.html';

		// Generate a random MD5-like token
		let token = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)
		).join('');

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				url: url,
				token: token
			}),
			['Content-Type: application/json']
		);
		assert400(response, "'token' is valid only for item selection requests");
	});
});
