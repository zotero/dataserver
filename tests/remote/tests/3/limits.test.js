/**
 * Request limit tests
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import { assert200, assert400 } from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Request limits', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
	});

	beforeEach(function () {
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
	});

	describe('Deep start offset', function () {
		it('should return 400 for a deep start', async function () {
			let response = await API.userGet(config.get('userID'), 'items/top?start=50001&limit=100');
			assert400(response);
			assert.include(response.getBody(), '/syncing');
		});

		it('should allow a start at the threshold', async function () {
			let response = await API.userGet(config.get('userID'), 'items/top?start=50000&limit=100');
			assert200(response);
		});

		it('should return 400 for a deep start with since', async function () {
			let response = await API.userGet(config.get('userID'), 'items/top?start=50001&limit=100&since=1');
			assert400(response);
		});

		it('should allow a deep start from the web library', async function () {
			let response = await API.userGet(
				config.get('userID'),
				'items/top?start=50001&limit=100',
				[`Origin: ${config.get('wwwOrigin')}`]
			);
			assert200(response);
		});

		it('should return 400 for a deep start from another origin', async function () {
			let response = await API.userGet(
				config.get('userID'),
				'items/top?start=50001&limit=100',
				['Origin: https://example.com']
			);
			assert400(response);
		});

		it('should return 400 for a deep start on collections', async function () {
			let response = await API.userGet(config.get('userID'), 'collections?start=50001');
			assert400(response);
		});
	});
});
