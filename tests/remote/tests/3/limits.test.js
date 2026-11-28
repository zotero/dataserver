/**
 * Request limit tests
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import { assert200, assert400, assert429 } from '../../assertions3.js';
import { setup } from '../../setup.js';
import { randomString } from '../../utils.js';

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

	describe('Query time', function () {
		// The test header selects an isolated, always-enforced bucket of the
		// given type. Any request that runs a DB query spends more than a
		// microsecond on it, so a single request exhausts a 1 µs capacity, and
		// the slow refill keeps it exhausted.
		function queryTimeLimitHeader(type, bucket, capacity = 0.000001, replenishRate = 0.0001) {
			return `Zotero-Test-Query-Time-Limit: type=${type}&bucket=${bucket}&capacity=${capacity}`
				+ `&replenishRate=${replenishRate}`;
		}

		describe('Per user', function () {
			it('should debit DB time and return 429 with Retry-After once exhausted', async function () {
				let header = queryTimeLimitHeader('user_query_time', randomString(16));
				let response = await API.userGet(config.get('userID'), 'items/top', [header]);
				assert200(response);

				response = await API.userGet(config.get('userID'), 'items/top', [header]);
				assert429(response);
				let retryAfter = response.getHeader('Retry-After');
				assert.match(retryAfter, /^[1-9][0-9]*$/, 'Expected Retry-After in whole seconds');
			});

			it('should not share a bucket with other clients', async function () {
				let header = queryTimeLimitHeader('user_query_time', randomString(16));
				let response = await API.userGet(config.get('userID'), 'items/top', [header]);
				assert200(response);
				response = await API.userGet(config.get('userID'), 'items/top', [header]);
				assert429(response);

				response = await API.userGet(
					config.get('userID'),
					'items/top',
					[queryTimeLimitHeader('user_query_time', randomString(16))]
				);
				assert200(response);
			});

			it('should refill over time', async function () {
				// 1 µs capacity refilling at 1 s/s
				let header = queryTimeLimitHeader('user_query_time', randomString(16), 0.000001, 1);
				let response = await API.userGet(config.get('userID'), 'items/top', [header]);
				assert200(response);
				await new Promise(resolve => setTimeout(resolve, 2500));
				response = await API.userGet(config.get('userID'), 'items/top', [header]);
				assert200(response);
			});
		});

		describe('Per library, anonymous', function () {
			afterEach(function () {
				API.useAPIKey(config.get('apiKey'));
			});

			it('should charge anonymous requests to the library', async function () {
				let header = queryTimeLimitHeader('library_anon_query_time', randomString(16));
				API.useAPIKey('');
				let response = await API.groupGet(config.get('ownedPublicGroupID'), 'items?format=keys', [header]);
				assert200(response);

				response = await API.groupGet(config.get('ownedPublicGroupID'), 'items?format=keys', [header]);
				assert429(response);
				let retryAfter = response.getHeader('Retry-After');
				assert.match(retryAfter, /^[1-9][0-9]*$/, 'Expected Retry-After in whole seconds');

				// Other libraries have their own buckets
				response = await API.userGet(config.get('userID'), 'publications/items', [header]);
				assert200(response);
			});

			it('should not charge authenticated requests to the library', async function () {
				let header = queryTimeLimitHeader('library_anon_query_time', randomString(16));
				for (let i = 0; i < 3; i++) {
					let response = await API.groupGet(config.get('ownedPublicGroupID'), 'items?format=keys', [header]);
					assert200(response);
				}

				// The bucket is still full for anonymous requests
				API.useAPIKey('');
				let response = await API.groupGet(config.get('ownedPublicGroupID'), 'items?format=keys', [header]);
				assert200(response);
				response = await API.groupGet(config.get('ownedPublicGroupID'), 'items?format=keys', [header]);
				assert429(response);
			});
		});

		it('should return 400 with an invalid header', async function () {
			let response = await API.userGet(
				config.get('userID'),
				'items/top',
				[queryTimeLimitHeader('user_query_time', randomString(16), 1, 0)]
			);
			assert400(response);

			response = await API.userGet(
				config.get('userID'),
				'items/top',
				[queryTimeLimitHeader('foo_query_time', randomString(16))]
			);
			assert400(response);
		});
	});
});
