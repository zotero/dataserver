const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After, resetGroups } = require("../shared.js");

describe('SettingsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
		await resetGroups();
	});

	after(async function () {
		await API3After();
		await resetGroups();
	});

	beforeEach(async function () {
		await API.userClear(config.userID);
		await API.groupClear(config.ownedPrivateGroupID);
	});

	it('testAddUserSetting', async function () {
		const settingKey = "tagColors";
		const value = [
			{
				name: "_READ",
				color: "#990000"
			}
		];

		const libraryVersion = await API.getLibraryVersion();

		const json = {
			value: value
		};

		// No version
		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 428);

		// Version must be 0 for non-existent setting
		response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": "1"
			}
		);
		Helpers.assertStatusCode(response, 412);

		// Create
		response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": "0"
			}
		);
		Helpers.assertStatusCode(response, 204);

		// Multi-object GET
		response = await API.userGet(
			config.userID,
			`settings`
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.headers['content-type'][0], "application/json");
		let jsonResponse = JSON.parse(response.data);

		assert.property(jsonResponse, settingKey);
		assert.deepEqual(value, jsonResponse[settingKey].value);
		assert.equal(parseInt(libraryVersion) + 1, jsonResponse[settingKey].version);

		// Single-object GET
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.headers['content-type'][0], "application/json");
		jsonResponse = JSON.parse(response.data);

		assert.deepEqual(value, jsonResponse.value);
		assert.equal(parseInt(libraryVersion) + 1, jsonResponse.version);
	});

	it('testAddUserSettingMultiple', async function () {
		await API.userClear(config.userID);
		let json = {
			tagColors: {
				value: [
					{
						name: "_READ",
						color: "#990000"
					}
				]
			},
			feeds: {
				value: {
					"http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml": {
						url: "http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml",
						name: "NYT > Home Page",
						cleanupAfter: 2,
						refreshInterval: 60
					}
				}
			},
			// eslint-disable-next-line camelcase
			lastPageIndex_u_ABCD2345: {
				value: 123
			},
			// eslint-disable-next-line camelcase
			lastPageIndex_g1234567890_ABCD2345: {
				value: 123
			},
			// eslint-disable-next-line camelcase
			lastRead_g1234567890_ABCD2345: {
				value: 1674251397
			}
		};
		
		let settingsKeys = Object.keys(json);
		let libraryVersion = parseInt(await API.getLibraryVersion());

		let response = await API.userPost(
			config.userID,
			`settings`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assertStatusCode(response, 204);
		assert.equal(++libraryVersion, response.headers['last-modified-version']);

		// Multi-object GET
		const multiObjResponse = await API.userGet(
			config.userID,
			`settings`
		);
		Helpers.assertStatusCode(multiObjResponse, 200);

		assert.equal(multiObjResponse.headers['content-type'][0], 'application/json');
		const multiObjJson = JSON.parse(multiObjResponse.data);
		for (let settingsKey of settingsKeys) {
			assert.property(multiObjJson, settingsKey);
			assert.deepEqual(multiObjJson[settingsKey].value, json[settingsKey].value);
			assert.equal(multiObjJson[settingsKey].version, parseInt(libraryVersion));
		}

		// Single-object GET
		for (let settingsKey of settingsKeys) {
			response = await API.userGet(
				config.userID,
				`settings/${settingsKey}`
			);
	
			Helpers.assertStatusCode(response, 200);
			Helpers.assertContentType(response, 'application/json');
			const singleObjJson = JSON.parse(response.data);
			assert.exists(singleObjJson);
			assert.deepEqual(json[settingsKey].value, singleObjJson.value);
			assert.equal(singleObjJson.version, libraryVersion);
		}
	});

	it('testAddGroupSettingMultiple', async function () {
		const settingKey = "tagColors";
		const value = [
			{
				name: "_READ",
				color: "#990000"
			}
		];

		// TODO: multiple, once more settings are supported

		const groupID = config.ownedPrivateGroupID;
		const libraryVersion = await API.getGroupLibraryVersion(groupID);

		const json = {
			[settingKey]: {
				value: value
			}
		};

		const response = await API.groupPost(
			groupID,
			`settings`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);

		Helpers.assertStatusCode(response, 204);

		// Multi-object GET
		const response2 = await API.groupGet(
			groupID,
			`settings`
		);

		Helpers.assertStatusCode(response2, 200);
		assert.equal(response2.headers['content-type'][0], "application/json");
		const json2 = JSON.parse(response2.data);
		assert.exists(json2);
		assert.property(json2, settingKey);
		assert.deepEqual(value, json2[settingKey].value);
		assert.equal(parseInt(libraryVersion) + 1, json2[settingKey].version);

		// Single-object GET
		const response3 = await API.groupGet(
			groupID,
			`settings/${settingKey}`
		);

		Helpers.assertStatusCode(response3, 200);
		assert.equal(response3.headers['content-type'][0], "application/json");
		const json3 = JSON.parse(response3.data);
		assert.exists(json3);
		assert.deepEqual(value, json3.value);
		assert.equal(parseInt(libraryVersion) + 1, json3.version);
	});

	it('testDeleteNonexistentSetting', async function () {
		const response = await API.userDelete(config.userID,
			`settings/nonexistentSetting`,
			{ "If-Unmodified-Since-Version": "0" });
		Helpers.assertStatusCode(response, 404);
	});

	it('testUnsupportedSetting', async function () {
		const settingKey = "unsupportedSetting";
		let value = true;

		const json = {
			value: value,
			version: 0
		};

		const response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 400, `Invalid setting '${settingKey}'`);
	});

	it('testUpdateUserSetting', async function () {
		let settingKey = "tagColors";
		let value = [
			{
				name: "_READ",
				color: "#990000"
			}
		];
	
		let libraryVersion = await API.getLibraryVersion();
	
		let json = {
			value: value,
			version: 0
		};
	
		// Create
		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert204(response);
	
		// Check
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(parseInt(json.version), parseInt(libraryVersion) + 1);
	
		// Update with no change
		response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert204(response);
	
		// Check
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		assert.isNotNull(json);
		assert.deepEqual(json.value, value);
		assert.equal(parseInt(json.version), parseInt(libraryVersion) + 1);
	
		let newValue = [
			{
				name: "_READ",
				color: "#CC9933"
			}
		];
		json.value = newValue;
	
		// Update, no change
		response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert204(response);
	
		// Check
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		json = JSON.parse(response.data);
		assert.isNotNull(json);
		assert.deepEqual(json.value, newValue);
		assert.equal(parseInt(json.version), parseInt(libraryVersion) + 2);
	});

	it('testUpdateUserSettings', async function () {
		let settingKey = "tagColors";
		let value = [
			{
				name: "_READ",
				color: "#990000"
			}
		];
	
		let libraryVersion = parseInt(await API.getLibraryVersion());
	
		let json = {
			value: value,
			version: 0
		};
	
		// Create
		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert204(response);
		assert.equal(parseInt(response.headers['last-modified-version'][0]), ++libraryVersion);

		// Check
		response = await API.userGet(
			config.userID,
			`settings`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		assert.equal(parseInt(response.headers['last-modified-version'][0]), libraryVersion);
		json = JSON.parse(response.data);
		assert.isNotNull(json);
		assert.deepEqual(json[settingKey].value, value);
		assert.equal(parseInt(json[settingKey].version), libraryVersion);
	
		// Update with no change
		response = await API.userPost(
			config.userID,
			`settings`,
			JSON.stringify({
				[settingKey]: {
					value: value
				}
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": libraryVersion
			}
		);
		
		Helpers.assert204(response);
		assert.equal(parseInt(response.headers['last-modified-version'][0]), libraryVersion);
		// Check
		response = await API.userGet(
			config.userID,
			`settings`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		assert.equal(parseInt(response.headers['last-modified-version'][0]), libraryVersion);
		json = JSON.parse(response.data);
		assert.isNotNull(json);
		assert.deepEqual(json[settingKey].value, value);
		assert.equal(parseInt(json[settingKey].version), libraryVersion);
	
		let newValue = [
			{
				name: "_READ",
				color: "#CC9933"
			}
		];
	
		// Update
		response = await API.userPost(
			config.userID,
			`settings`,
			JSON.stringify({
				[settingKey]: {
					value: newValue
				}
			}),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": libraryVersion
			}
		);
		Helpers.assert204(response);
		assert.equal(parseInt(response.headers['last-modified-version'][0]), ++libraryVersion);
		// Check
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assert200(response);
		Helpers.assertContentType(response, "application/json");
		assert.equal(parseInt(response.headers['last-modified-version'][0]), libraryVersion);
		json = JSON.parse(response.data);
		assert.isNotNull(json);
		assert.deepEqual(json.value, newValue);
		assert.equal(parseInt(json.version), libraryVersion);
	});

	it('testUnsupportedSettingMultiple', async function () {
		const settingKey = 'unsupportedSetting';
		const json = {
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

		const libraryVersion = await API.getLibraryVersion();

		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assertStatusCode(response, 400);

		// Valid setting shouldn't exist, and library version should be unchanged
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assertStatusCode(response, 404);
		assert.equal(libraryVersion, await API.getLibraryVersion());
	});

	it('testOverlongSetting', async function () {
		const settingKey = "tagColors";
		const value = [
			{
				name: "abcdefghij".repeat(3001),
				color: "#990000"
			}
		];

		const json = {
			value: value,
			version: 0
		};

		const response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 400, "'value' cannot be longer than 30000 characters");
	});

	it('testDeleteUserSetting', async function () {
		let settingKey = "tagColors";
		let value = [
			{
				name: "_READ",
				color: "#990000"
			}
		];
	
		let json = {
			value: value,
			version: 0
		};
	
		let libraryVersion = parseInt(await API.getLibraryVersion());
	
		// Create
		let response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert204(response);
	
		// Delete
		response = await API.userDelete(
			config.userID,
			`settings/${settingKey}`,
			{
				"If-Unmodified-Since-Version": `${libraryVersion + 1}`
			}
		);
		Helpers.assert204(response);
	
		// Check
		response = await API.userGet(
			config.userID,
			`settings/${settingKey}`
		);
		Helpers.assert404(response);
	
		assert.equal(libraryVersion + 2, await API.getLibraryVersion());
	});

	it('testSettingsSince', async function () {
		let libraryVersion1 = parseInt(await API.getLibraryVersion());
		let response = await API.userPost(
			config.userID,
			"settings",
			JSON.stringify({
				tagColors: {
					value: [
						{
							name: "_READ",
							color: "#990000"
						}
					]
				}
			})
		);
		Helpers.assert204(response);
		let libraryVersion2 = response.headers['last-modified-version'][0];
	
		response = await API.userPost(
			config.userID,
			"settings",
			JSON.stringify({
				feeds: {
					value: {
						"http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml": {
							url: "http://www.nytimes.com/services/xml/rss/nyt/HomePage.xml",
							name: "NYT > Home Page",
							cleanupAfter: 2,
							refreshInterval: 60
						}
					}
				}
			})
		);
		Helpers.assert204(response);
		let libraryVersion3 = response.headers['last-modified-version'][0];
	
		response = await API.userGet(
			config.userID,
			`settings?since=${libraryVersion1}`
		);
		Helpers.assertNumResults(response, 2);
	
		response = await API.userGet(
			config.userID,
			`settings?since=${libraryVersion2}`
		);
		Helpers.assertNumResults(response, 1);
	
		response = await API.userGet(
			config.userID,
			`settings?since=${libraryVersion3}`
		);
		Helpers.assertNumResults(response, 0);
	});

	it('test_should_reject_lastPageLabel_in_group_library', async function () {
		const settingKey = `lastPageIndex_g${config.ownedPrivateGroupID}_ABCD2345`;
		const value = 1234;
	
		const json = {
			value: value,
			version: 0
		};
	
		
		const response = await API.groupPut(
			config.ownedPrivateGroupID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400(response, "lastPageIndex can only be set in user library");
	});

	it('test_should_allow_emoji_character', async function () {
		const settingKey = 'tagColors';
		const value = [
			{
				name: "🐶",
				color: "#990000"
			}
		];
	
		const json = {
			value: value,
			version: 0
		};
	
		const response = await API.userPut(
			config.userID,
			`settings/${settingKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
	});
});
