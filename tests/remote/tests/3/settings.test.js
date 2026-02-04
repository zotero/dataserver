/**
 * Settings API tests
 * Port of tests/remote/tests/API/3/SettingsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert204,
	assert400,
	assert404,
	assert412,
	assert428,
	assertContentType,
	assertNumResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Settings', function() {
	this.timeout(30000);

	beforeEach(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
		if (config.get('ownedPrivateGroupID')) {
			await API.groupClear(config.get('ownedPrivateGroupID'));
		}
	});

	afterEach(async function() {
		await API.userClear(config.get('userID'));
		if (config.get('ownedPrivateGroupID')) {
			await API.groupClear(config.get('ownedPrivateGroupID'));
		}
	});

	// PHP: testAddUserSetting
	it('should add user setting', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '_READ',
				color: '#990000'
			}
		];

		let libraryVersion = await API.getLibraryVersion();

		let json = {
			value: value
		};

		// No version
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert428(response);

		// Version must be 0 for non-existent setting
		response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 1'
			]
		);
		assert412(response);

		// Create
		response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 0'
			]
		);
		assert204(response);

		// Multi-object GET
		response = await API.userGet(
			config.get('userID'),
			'settings'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.property(json, settingKey);
		assert.deepEqual(json[settingKey].value, value);
		assert.equal(json[settingKey].version, libraryVersion + 1);

		// Single-object GET
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);
	});

	// PHP: testAddUserSettingMultiple
	it('should add user setting multiple', async function() {
		let json = {
			tagColors: {
				value: [
					{
						name: '_READ',
						color: '#990000'
					}
				]
			},
			feeds: {
				value: {
					'http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml': {
						url: 'http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml',
						name: 'NYT > Home Page',
						cleanupAfter: 2,
						refreshInterval: 60
					}
				}
			},
			lastPageIndex_u_ABCD2345: {
				value: 123
			},
			lastPageIndex_g1234567890_ABCD2345: {
				value: 123
			},
			lastRead_g1234567890_ABCD2345: {
				value: 1674251397
			}
		};
		let settingKeys = Object.keys(json);

		let libraryVersion = await API.getLibraryVersion();

		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), ++libraryVersion);

		// Multi-object GET
		response = await API.userGet(
			config.get('userID'),
			'settings'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		let json2 = JSON.parse(response.getBody());
		assert.isNotNull(json2);
		for (let settingKey of settingKeys) {
			assert.property(json2, settingKey, `Object should have ${settingKey} property`);
			assert.deepEqual(json2[settingKey].value, json[settingKey].value, `'${settingKey}' value should match`);
			assert.equal(json2[settingKey].version, libraryVersion, `'${settingKey}' version should match`);
		}

		// Single-object GET
		for (let settingKey of settingKeys) {
			response = await API.userGet(
				config.get('userID'),
				`settings/${settingKey}`
			);
			assert200(response);
			assertContentType(response, 'application/json');
			json2 = JSON.parse(response.getBody());
			assert.isNotNull(json2);
			assert.deepEqual(json2.value, json[settingKey].value);
			assert.equal(json2.version, libraryVersion);
		}
	});

	// PHP: testAddGroupSettingMultiple
	it('should add group setting multiple', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '_READ',
				color: '#990000'
			}
		];

		// TODO: multiple, once more settings are supported

		let groupID = config.get('ownedPrivateGroupID');
		let libraryVersion = await API.getGroupLibraryVersion(groupID);

		let json = {};
		json[settingKey] = {
			value: value
		};
		let response = await API.groupPost(
			groupID,
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Multi-object GET
		response = await API.groupGet(
			groupID,
			'settings'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.property(json, settingKey);
		assert.deepEqual(json[settingKey].value, value);
		assert.equal(json[settingKey].version, libraryVersion + 1);

		// Single-object GET
		response = await API.groupGet(
			groupID,
			`settings/${settingKey}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);
	});

	// PHP: testUpdateUserSetting
	it('should update user setting', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '_READ',
				color: '#990000'
			}
		];

		let libraryVersion = await API.getLibraryVersion();

		let json = {
			value: value,
			version: 0
		};

		// Create
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);

		// Update with no change
		response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);

		let newValue = [
			{
				name: '_READ',
				color: '#CC9933'
			}
		];
		json.value = newValue;

		// Update, no change
		response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, newValue);
		assert.equal(json.version, libraryVersion + 2);
	});

	// PHP: test_should_add_zero_integer_value_for_lastPageIndex
	it('should add zero integer value for lastPageIndex', async function() {
		let settingKey = 'lastPageIndex_u_NJP24DAM';
		let value = 0;

		let libraryVersion = await API.getLibraryVersion();

		let json = {
			value: value
		};

		// Create
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				'If-Unmodified-Since-Version: 0'
			]
		);
		assert204(response);

		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.equal(json.value, value);
		assert.equal(json.version, libraryVersion + 1);
	});

	// PHP: testUpdateUserSettings
	it('should update user settings', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '_READ',
				color: '#990000'
			}
		];

		let libraryVersion = await API.getLibraryVersion();

		let json = {
			value: value,
			version: 0
		};

		// Create
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), ++libraryVersion);

		response = await API.userGet(
			config.get('userID'),
			'settings'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.property(json, settingKey);
		assert.deepEqual(json[settingKey].value, value);
		assert.equal(json[settingKey].version, libraryVersion);

		// Update with no change
		let jsonPost = {};
		jsonPost[settingKey] = {
			value: value
		};
		response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(jsonPost),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${libraryVersion}`
			]
		);
		assert204(response);
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);

		// Check
		response = await API.userGet(
			config.get('userID'),
			'settings'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.property(json, settingKey);
		assert.deepEqual(json[settingKey].value, value);
		assert.equal(json[settingKey].version, libraryVersion);

		let newValue = [
			{
				name: '_READ',
				color: '#CC9933'
			}
		];

		// Update
		jsonPost[settingKey] = {
			value: newValue
		};
		response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(jsonPost),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${libraryVersion}`
			]
		);
		assert204(response);
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), ++libraryVersion);

		// Check
		response = await API.userGet(
			config.get('userID'),
			'settings'
		);
		assert200(response);
		assertContentType(response, 'application/json');
		assert.equal(parseInt(response.getHeader('Last-Modified-Version')), libraryVersion);
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.property(json, settingKey);
		assert.deepEqual(json[settingKey].value, newValue);
		assert.equal(json[settingKey].version, libraryVersion);
	});

	// PHP: testDeleteUserSetting
	it('should delete user setting', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '_READ',
				color: '#990000'
			}
		];

		let json = {
			value: value,
			version: 0
		};

		let libraryVersion = await API.getLibraryVersion();

		// Create
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Delete
		response = await API.userDelete(
			config.get('userID'),
			`settings/${settingKey}`,
			[`If-Unmodified-Since-Version: ${libraryVersion + 1}`]
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert404(response);

		assert.equal(await API.getLibraryVersion(), libraryVersion + 2);
	});

	// PHP: testDeleteNonexistentSetting
	it('should return 404 for nonexistent setting deletion', async function() {
		let response = await API.userDelete(
			config.get('userID'),
			'settings/nonexistentSetting',
			['If-Unmodified-Since-Version: 0']
		);
		assert404(response);
	});

	// PHP: testSettingsSince
	it('should filter settings by since parameter', async function() {
		let libraryVersion1 = await API.getLibraryVersion();
		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify({
				tagColors: {
					value: [
						{
							name: '_READ',
							color: '#990000'
						}
					]
				}
			})
		);
		assert204(response);
		let libraryVersion2 = response.getHeader('Last-Modified-Version');

		response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify({
				feeds: {
					value: {
						'http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml': {
							url: 'http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml',
							name: 'NYT > Home Page',
							cleanupAfter: 2,
							refreshInterval: 60
						}
					}
				}
			})
		);
		assert204(response);
		let libraryVersion3 = response.getHeader('Last-Modified-Version');

		response = await API.userGet(
			config.get('userID'),
			`settings?since=${libraryVersion1}`
		);
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 2);

		response = await API.userGet(
			config.get('userID'),
			`settings?since=${libraryVersion2}`
		);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 1);

		response = await API.userGet(
			config.get('userID'),
			`settings?since=${libraryVersion3}`
		);
		json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json), 0);
	});

	// PHP: testUnsupportedSetting
	it('should reject unsupported setting', async function() {
		let settingKey = 'unsupportedSetting';
		let value = true;

		let json = {
			value: value,
			version: 0
		};

		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.include(response.getBody(), `Invalid setting '${settingKey}'`);
	});

	// PHP: testUnsupportedSettingMultiple
	it('should reject unsupported setting in multiple', async function() {
		let settingKey = 'unsupportedSetting';
		let json = {
			tagColors: {
				value: {
					name: '_READ',
					color: '#990000'
				},
				version: 0
			}
		};
		json[settingKey] = {
			value: false,
			version: 0
		};

		let libraryVersion = await API.getLibraryVersion();

		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.include(response.getBody(), `Invalid setting '${settingKey}'`);

		// Valid setting shouldn't exist, and library version should be unchanged
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}`
		);
		assert404(response);
		assert.equal(await API.getLibraryVersion(), libraryVersion);
	});

	// PHP: testOverlongSetting
	it('should reject overlong setting', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: 'abcdefghij'.repeat(3001),
				color: '#990000'
			}
		];

		let json = {
			value: value,
			version: 0
		};

		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.include(response.getBody(), "'value' cannot be longer than 30000 characters");
	});

	// PHP: test_lastPageIndex_should_accept_percentages_with_one_decimal_place
	it('should accept percentages with one decimal place for lastPageIndex', async function() {
		let json = {
			lastPageIndex_u_ABCD2345: {
				value: 12.2
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
	});

	// PHP: test_lastPageIndex_should_accept_integers
	it('should accept integers for lastPageIndex', async function() {
		let json = {
			lastPageIndex_u_ABCD2345: {
				value: 12
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
	});

	// PHP: test_preserve_massive_integer_values
	it('should preserve massive integer values', async function() {
		// Use raw JSON string to avoid JavaScript precision issues with large integers
		// Values are preserved as-is by the server using JSON_BIGINT_AS_STRING
		// - Values <= PHP_INT_MAX (9223372036854775807) come back as integers
		// - Values > PHP_INT_MAX come back as strings to preserve precision
		// https://forums.zotero.org/discussion/121223/sync-problem-settings-failed-with-status-code-400
		let values = [
			'9223372036854775807', // PHP_INT_MAX - will be returned as integer
			'9223372036854776000'  // > PHP_INT_MAX - will be returned as string
		];
		let jsonString = `{"lastPageIndex_u_ABCD2345":{"value":${values[0]}},"lastPageIndex_u_BCDE3456":{"value":${values[1]}}}`;
		let response = await API.userPost(
			config.get('userID'),
			'settings',
			jsonString,
			['Content-Type: application/json']
		);
		assert204(response);

		let settingKeys = ['ABCD2345', 'BCDE3456'];
		for (let i = 0; i < settingKeys.length; i++) {
			response = await API.userGet(
				config.get('userID'),
				`settings/lastPageIndex_u_${settingKeys[i]}`
			);
			assert200(response);
			// Check raw body to avoid JavaScript precision issues
			// The value should be present in the response (as number or string)
			let body = response.getBody();
			assert.include(body, values[i], `Value ${values[i]} should be in response for ${settingKeys[i]}`);
		}
	});

	// PHP: test_lastPageIndex_should_reject_percentages_below_0_or_above_100
	it('should reject percentages below 0 or above 100 for lastPageIndex', async function() {
		let json = {
			lastPageIndex_u_ABCD2345: {
				value: -1.2
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);

		json = {
			lastPageIndex_u_ABCD2345: {
				value: 100.1
			}
		};
		response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
	});

	// PHP: test_lastPageIndex_should_reject_percentages_with_two_decimal_places
	it('should reject percentages with two decimal places for lastPageIndex', async function() {
		let json = {
			lastPageIndex_u_ABCD2345: {
				value: 12.23
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'settings',
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
	});

	// PHP: test_should_reject_lastPageIndex_in_group_library
	it('should reject lastPageIndex in group library', async function() {
		let settingKey = `lastPageIndex_g${config.get('ownedPrivateGroupID')}_ABCD2345`;
		let value = 1234;

		let json = {
			value: value,
			version: 0
		};

		let response = await API.groupPut(
			config.get('ownedPrivateGroupID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.include(response.getBody(), 'lastPageIndex can only be set in user library');
	});

	// PHP: test_should_allow_emoji_character
	it('should allow emoji character', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '🐶',
				color: '#990000'
			}
		];
		let json = {
			value: value,
			version: 0
		};
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
	});
});
