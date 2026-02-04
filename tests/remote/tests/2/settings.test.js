/**
 * Settings tests for API v2
 * Port of tests/remote/tests/API/2/SettingsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert204,
	assert400,
	assert404,
	assert412,
	assert428,
	assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Settings (API v2)', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
	});

	beforeEach(async function() {
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	afterEach(async function() {
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
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

		let json = { value };

		// No version
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert428(response);

		// Version must be 0 for non-existent setting
		response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
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
			`settings/${settingKey}?key=${config.get('apiKey')}`,
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
			`settings?key=${config.get('apiKey')}`
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
			`settings/${settingKey}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);
	});

	// PHP: testAddUserSettingMultiple
	it('should add user setting via POST', async function() {
		let settingKey = 'tagColors';
		let value = [
			{
				name: '_READ',
				color: '#990000'
			}
		];

		// TODO: multiple, once more settings are supported

		let libraryVersion = await API.getLibraryVersion();

		let json = {
			[settingKey]: { value }
		};
		let response = await API.userPost(
			config.get('userID'),
			`settings?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Multi-object GET
		response = await API.userGet(
			config.get('userID'),
			`settings?key=${config.get('apiKey')}`
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
			`settings/${settingKey}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);
	});

	// PHP: testAddGroupSettingMultiple
	it('should add group setting via POST', async function() {
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

		let json = {
			[settingKey]: { value }
		};
		let response = await API.groupPost(
			groupID,
			`settings?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Multi-object GET
		response = await API.groupGet(
			groupID,
			`settings?key=${config.get('apiKey')}`
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
			`settings/${settingKey}?key=${config.get('apiKey')}`
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

		let json = { value, version: 0 };

		// Create
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`
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
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(json.version, libraryVersion + 1);

		// Update with new value
		let newValue = [
			{
				name: '_READ',
				color: '#CC9933'
			}
		];
		json.value = newValue;

		response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`
		);
		assert200(response);
		assertContentType(response, 'application/json');
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.deepEqual(json.value, newValue);
		assert.equal(json.version, libraryVersion + 2);
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

		let json = { value, version: 0 };

		let libraryVersion = await API.getLibraryVersion();

		// Create
		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);

		// Delete
		response = await API.userDelete(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			[`If-Unmodified-Since-Version: ${libraryVersion + 1}`]
		);
		assert204(response);

		// Check
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`
		);
		assert404(response);

		assert.equal(await API.getLibraryVersion(), libraryVersion + 2);
	});

	// PHP: testDeleteNonexistentSetting
	it('should return 404 when deleting nonexistent setting', async function() {
		let response = await API.userDelete(
			config.get('userID'),
			`settings/nonexistentSetting?key=${config.get('apiKey')}`,
			['If-Unmodified-Since-Version: 0']
		);
		assert404(response);
	});

	// PHP: testUnsupportedSetting
	it('should reject unsupported setting', async function() {
		let settingKey = 'unsupportedSetting';
		let value = true;

		let json = { value, version: 0 };

		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response, `Invalid setting '${settingKey}'`);
	});

	// PHP: testUnsupportedSettingMultiple
	it('should reject unsupported setting in multiple mode', async function() {
		let settingKey = 'unsupportedSetting';
		let json = {
			tagColors: {
				value: {
					name: '_READ',
					color: '#990000'
				},
				version: 0
			},
			[settingKey]: {
				value: false,
				version: 0
			}
		};

		let libraryVersion = await API.getLibraryVersion();

		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response, `Invalid setting '${settingKey}'`);

		// Valid setting shouldn't exist, and library version should be unchanged
		response = await API.userGet(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`
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

		let json = { value, version: 0 };

		let response = await API.userPut(
			config.get('userID'),
			`settings/${settingKey}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert400(response, "'value' cannot be longer than 30000 characters");
	});
});
