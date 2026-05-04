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
	// One default en-US voice from each provider entry in /tts/voices, in the
	// order they appear under standard then premium. Used by the timestamps
	// tests, which iterate every provider rather than naming any of them.
	let perProviderVoices = [];

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

		// One default en-US voice per provider entry for the timestamps tests.
		for (let p of [...(json.standard || []), ...(json.premium || [])]) {
			let voice = p?.locales?.['en-US']?.default?.[0];
			if (voice) perProviderVoices.push(voice);
		}
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

	describe('/speak -- timestamps', function () {
		// Validate the shape of a single timestamps entry.
		function assertEntryShape(t, sourceText) {
			assert.isNumber(t.start);
			assert.isNumber(t.end);
			assert.isAtLeast(t.end, t.start);
			assert.isNumber(t.charStart);
			assert.isNumber(t.charEnd);
			assert.isAtLeast(t.charStart, 0);
			assert.isAbove(t.charEnd, t.charStart);
			assert.isAtMost(t.charEnd, sourceText.length);
			assert.notProperty(t, 'word', 'Server response should not include `word`');
		}

		// Run the same JSON-shape check against every provider.
		for (let i = 0; i < 3; i++) {
			it(`should return JSON with audioURL for provider #${i}`, async function () {
				if (!perProviderVoices[i]) this.skip();
				let voice = perProviderVoices[i];
				let text = randomText();
				let response = await speak({ voice, text, timestamps: 1 });
				assert200(response);
				assert.match(response.getHeader('Content-Type'), /^application\/json/);
				let json = JSON.parse(response.getBody());
				assert.property(json, 'audioURL');
				assert.match(json.audioURL, /^https?:\/\//);
				// `timestamps` may be absent (provider can't produce alignment)
				// or a (possibly empty) array; both are valid.
				if (json.timestamps !== undefined) {
					assert.isArray(json.timestamps);
					let prevStart = -Infinity;
					for (let t of json.timestamps) {
						assertEntryShape(t, text);
						assert.isAtLeast(t.start, prevStart, 'starts must be non-decreasing');
						prevStart = t.start;
					}
				}
			});
		}

		it('at least one provider should produce timestamps', async function () {
			if (perProviderVoices.length === 0) this.skip();
			let saw = false;
			for (let voice of perProviderVoices) {
				let text = randomText();
				let response = await speak({ voice, text, timestamps: 1 });
				assert200(response);
				let json = JSON.parse(response.getBody());
				if (Array.isArray(json.timestamps) && json.timestamps.length > 0) {
					saw = true;
					break;
				}
			}
			assert.isTrue(saw, 'Expected at least one provider to return non-empty timestamps');
		});

		it('should preserve existing 302 behavior when flag is omitted', async function () {
			let voice = perProviderVoices[0] || voices['en-US'][0];
			let text = randomText();
			let response = await speak({ voice, text });
			assert302(response);
			assert.isOk(response.getHeader('location'));
		});

		it('should hit cache and return identical timestamps on repeat call', async function () {
			// Find a provider that returns timestamps (skip if none).
			let voice = null;
			let firstJSON = null;
			let text = randomText();
			for (let v of perProviderVoices) {
				let response = await speak({ voice: v, text, timestamps: 1 });
				assert200(response);
				let json = JSON.parse(response.getBody());
				if (Array.isArray(json.timestamps) && json.timestamps.length > 0) {
					voice = v;
					firstJSON = json;
					break;
				}
			}
			if (!voice) this.skip();
			let response2 = await speak({ voice, text, timestamps: 1 });
			assert200(response2);
			let secondJSON = JSON.parse(response2.getBody());
			assert.equal(secondJSON.audioURL, firstJSON.audioURL);
			assert.deepEqual(secondJSON.timestamps, firstJSON.timestamps);
		});

		it('should populate sibling on no-flag synth so later flag request hits cache', async function () {
			// Seed the cache without the flag, then request with it. If the
			// provider supports timestamps, the second call must be a cache
			// hit (same audioURL) AND return non-empty timestamps from the
			// sibling written during the seed call.
			let seeded = false;
			for (let v of perProviderVoices) {
				let text = randomText();
				let r1 = await speak({ voice: v, text });
				assert302(r1);
				let firstURL = r1.getHeader('location');

				let r2 = await speak({ voice: v, text, timestamps: 1 });
				assert200(r2);
				let json = JSON.parse(r2.getBody());
				assert.equal(json.audioURL, firstURL, 'Cache hit must reuse the same audio URL');
				if (Array.isArray(json.timestamps) && json.timestamps.length > 0) {
					seeded = true;
					break;
				}
			}
			assert.isTrue(seeded, 'Expected at least one provider to populate sibling on first synth');
		});
	});
});
