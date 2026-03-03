/**
 * TTS API tests
 * Tests for /tts/speak, /tts/voices, and /tts/credits endpoints
 */

import { assert } from 'chai';
import config from 'config';
import crypto from 'crypto';
import { API } from '../../api3.js';
import {
	assert200,
	assert302,
	assert400,
	assert403,
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('TTS', function () {
	this.timeout(60000);

	let testKey;
	// Populated from /tts/voices in before() -- keyed by locale
	let voices = {};

	before(async function () {
		testKey = config.get('ttsTestKey');
		if (!testKey) {
			this.skip();
		}
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);

		// Fetch the voice list and pick the first default voice per locale
		let response = await API.get('tts/voices');
		assert200(response);
		let json = JSON.parse(response.getBody());
		assert.property(json, 'standard');
		assert.property(json, 'premium');
		let provider = json.standard[0];
		for (let [locale, groups] of Object.entries(provider.locales)) {
			let defaults = groups.default || [];
			if (defaults.length >= 2) {
				voices[locale] = defaults.slice(0, 2);
			}
			else if (defaults.length === 1) {
				voices[locale] = defaults;
			}
		}
		assert.isAbove(Object.keys(voices).length, 0, 'Expected at least one locale with voices');
		assert.property(voices, 'en-US', 'Expected en-US voices');
	});

	beforeEach(function () {
		API.useAPIKey(config.get('apiKey'));
	});

	/**
	 * Helper to POST to /tts/speak with the test key and given params.
	 */
	function speak(params) {
		let body = JSON.stringify({ test: testKey, ...params });
		return API.post(
			'tts/speak',
			body,
			[['Content-Type', 'application/json']]
		);
	}

	/**
	 * Generate random text to force cache misses.
	 */
	function randomText(prefix = 'Test synthesis') {
		return `${prefix} ${crypto.randomBytes(8).toString('hex')}`;
	}

	describe('/credits', function () {
		it('should return remaining credits', async function () {
			let response = await API.get('tts/credits');
			assert200(response);
			let json = JSON.parse(response.getBody());
			assert.property(json, 'standardCreditsRemaining');
			assert.property(json, 'premiumCreditsRemaining');
			assert.isNumber(json.standardCreditsRemaining);
			assert.isNumber(json.premiumCreditsRemaining);
		});
	});

	describe('/speak -- basics', function () {
		it('should synthesize and return 302 with Location header', async function () {
			let voice = voices['en-US'][0];
			let text = randomText();
			let response = await speak({ voice, text });
			assert302(response);
			let location = response.getHeader('location');
			assert.isOk(location, 'Expected Location header');
			assert.match(location, /^https?:\/\//, 'Location should be a URL');
		});

		it('should return valid audio at redirect URL', async function () {
			let voice = voices['en-US'][0];
			let text = randomText();
			let response = await speak({ voice, text });
			assert302(response);
			let location = response.getHeader('location');

			// Follow the redirect manually
			let audioResponse = await fetch(location);
			assert.equal(audioResponse.status, 200);
			let contentType = audioResponse.headers.get('content-type');
			assert.match(contentType, /^audio\//, 'Expected audio content type');
			let buffer = await audioResponse.arrayBuffer();
			assert.isAbove(buffer.byteLength, 100, 'Audio should be non-trivial');
		});

		it('should return 302 on cache hit with same Location', async function () {
			let voice = voices['en-US'][0];
			let text = randomText();
			let response1 = await speak({ voice, text });
			assert302(response1);
			let location1 = response1.getHeader('location');

			let response2 = await speak({ voice, text });
			assert302(response2);
			let location2 = response2.getHeader('location');

			assert.equal(location1, location2, 'Cache hit should return same URL');
		});
	});

	describe('/speak -- error handling', function () {
		it('should return 400 without voice param', async function () {
			let response = await speak({ text: 'Hello' });
			assert400(response);
		});

		it('should return 400 without text param', async function () {
			let voice = voices['en-US'][0];
			let response = await speak({ voice });
			assert400(response);
		});

		it('should return 400 with invalid voice ID', async function () {
			let response = await speak({ voice: 'zz_invalid', text: 'Hello' });
			assert400(response);
		});

		it('should return 403 with wrong test key', async function () {
			let voice = voices['en-US'][0];
			let body = JSON.stringify({
				test: 'wrong_key',
				voice,
				text: 'Hello',
			});
			let response = await API.post(
				'tts/speak',
				body,
				[['Content-Type', 'application/json']]
			);
			assert403(response);
		});

		it('should return 403 without API key', async function () {
			API.useAPIKey('');
			let voice = voices['en-US'][0];
			let response = await speak({ voice, text: 'Hello' });
			assert403(response);
		});
	});

	describe('/speak -- voices and locales', function () {
		it('should synthesize with multiple en-US voices', async function () {
			for (let voice of voices['en-US']) {
				let response = await speak({
					voice,
					text: randomText(),
				});
				assert302(response);
				assert.isOk(response.getHeader('location'));
			}
		});

		let localeTexts = {
			'es-ES': 'Prueba de síntesis',
			'ja-JP': '合成テスト',
			'fr-FR': 'Test de synthèse',
			'zh-CN': '合成测试',
		};

		for (let [locale, prefix] of Object.entries(localeTexts)) {
			it(`should synthesize with ${locale} voice`, async function () {
				if (!voices[locale]) {
					this.skip();
				}
				let response = await speak({
					voice: voices[locale][0],
					text: randomText(prefix),
				});
				assert302(response);
				assert.isOk(response.getHeader('location'));
			});
		}
	});
});
