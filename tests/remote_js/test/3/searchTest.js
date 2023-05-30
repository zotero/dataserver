const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('SearchTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});
	const testNewSearch = async () => {
		let name = "Test Search";
		let conditions = [
			{
				condition: "title",
				operator: "contains",
				value: "test"
			},
			{
				condition: "noChildren",
				operator: "false",
				value: ""
			},
			{
				condition: "fulltextContent/regexp",
				operator: "contains",
				value: "/test/"
			}
		];

		// DEBUG: Should fail with no version?
		let response = await API.userPost(
			config.userID,
			"searches",
			JSON.stringify([{
				name: name,
				conditions: conditions
			}]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
		let libraryVersion = response.headers["last-modified-version"][0];
		let json = API.getJSONFromResponse(response);
		assert.equal(Object.keys(json.successful).length, 1);
		// Deprecated
		assert.equal(Object.keys(json.success).length, 1);

		// Check data in write response
		let data = json.successful[0].data;
		assert.equal(json.successful[0].key, data.key);
		assert.equal(libraryVersion, data.version);
		assert.equal(libraryVersion, data.version);
		assert.equal(name, data.name);
		assert.isArray(data.conditions);
		assert.equal(conditions.length, data.conditions.length);
		for (let i = 0; i < conditions.length; i++) {
			for (let key in conditions[i]) {
				assert.equal(conditions[i][key], data.conditions[i][key]);
			}
		}


		// Check in separate request, to be safe
		let keys = Object.keys(json.successful).map(i => json.successful[i].key);
		response = await API.getSearchResponse(keys);
		Helpers.assertTotalResults(response, 1);
		json = API.getJSONFromResponse(response);
		data = json[0].data;
		assert.equal(name, data.name);
		assert.isArray(data.conditions);
		assert.equal(conditions.length, data.conditions.length);

		for (let i = 0; i < conditions.length; i++) {
			for (let key in conditions[i]) {
				assert.equal(conditions[i][key], data.conditions[i][key]);
			}
		}

		return data;
	};

	it('testEditMultipleSearches', async function () {
		const search1Name = "Test 1";
		const search1Conditions = [
			{
				condition: "title",
				operator: "contains",
				value: "test"
			}
		];
		let search1Data = await API.createSearch(search1Name, search1Conditions, this, 'jsonData');
		const search1NewName = "Test 1 Modified";
	
		const search2Name = "Test 2";
		const search2Conditions = [
			{
				condition: "title",
				operator: "is",
				value: "test2"
			}
		];
		let search2Data = await API.createSearch(search2Name, search2Conditions, this, 'jsonData');
		const search2NewConditions = [
			{
				condition: "title",
				operator: "isNot",
				value: "test1"
			}
		];
	
		const response = await API.userPost(
			config.userID,
			"searches",
			JSON.stringify([
				{
					key: search1Data.key,
					version: search1Data.version,
					name: search1NewName
				},
				{
					key: search2Data.key,
					version: search2Data.version,
					conditions: search2NewConditions
				}
			]),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert200(response);
		const libraryVersion = response.headers["last-modified-version"][0];
		const json = API.getJSONFromResponse(response);
		assert.equal(Object.keys(json.successful).length, 2);
		assert.equal(Object.keys(json.success).length, 2);
	
		// Check data in write response
		assert.equal(json.successful[0].key, json.successful[0].data.key);
		assert.equal(json.successful[1].key, json.successful[1].data.key);
		assert.equal(libraryVersion, json.successful[0].version);
		assert.equal(libraryVersion, json.successful[1].version);
		assert.equal(libraryVersion, json.successful[0].data.version);
		assert.equal(libraryVersion, json.successful[1].data.version);
		assert.equal(search1NewName, json.successful[0].data.name);
		assert.equal(search2Name, json.successful[1].data.name);
		assert.deepEqual(search1Conditions, json.successful[0].data.conditions);
		assert.deepEqual(search2NewConditions, json.successful[1].data.conditions);
	
		// Check in separate request, to be safe
		const keys = Object.keys(json.successful).map(i => json.successful[i].key);
		const response2 = await API.getSearchResponse(keys);
		Helpers.assertTotalResults(response2, 2);
		const json2 = API.getJSONFromResponse(response2);
		// POST follows PATCH behavior, so unspecified values shouldn't change
		assert.equal(search1NewName, json2[0].data.name);
		assert.deepEqual(search1Conditions, json2[0].data.conditions);
		assert.equal(search2Name, json2[1].data.name);
		assert.deepEqual(search2NewConditions, json2[1].data.conditions);
	});
	

	it('testModifySearch', async function () {
		let searchJson = await testNewSearch();

		// Remove one search condition
		searchJson.conditions.shift();

		const name = searchJson.name;
		const conditions = searchJson.conditions;

		let response = await API.userPut(
			config.userID,
			`searches/${searchJson.key}`,
			JSON.stringify(searchJson),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": searchJson.version
			}
		);

		Helpers.assertStatusCode(response, 204);

		searchJson = (await API.getSearch(searchJson.key, true, 'json')).data;

		assert.equal(name, searchJson.name);
		assert.isArray(searchJson.conditions);
		assert.equal(conditions.length, searchJson.conditions.length);
		
		for (let i = 0; i < conditions.length; i++) {
			const condition = conditions[i];
			assert.equal(condition.field, searchJson.conditions[i].field);
			assert.equal(condition.operator, searchJson.conditions[i].operator);
			assert.equal(condition.value, searchJson.conditions[i].value);
		}
	});

	it('testNewSearchNoName', async function () {
		const conditions = [
			{
				condition: 'title',
				operator: 'contains',
				value: 'test',
			},
		];
		const headers = {
			'Content-Type': 'application/json',
		};
		const response = await API.createSearch('', conditions, headers, 'responseJSON');
		Helpers.assertStatusForObject(response, 'failed', 0, 400, 'Search name cannot be empty');
	});

	it('testNewSearchNoConditions', async function () {
		const json = await API.createSearch("Test", [], true, 'responseJSON');
		Helpers.assertStatusForObject(json, 'failed', 0, 400, "'conditions' cannot be empty");
	});

	it('testNewSearchConditionErrors', async function () {
		let json = await API.createSearch(
			'Test',
			[
				{
					operator: 'contains',
					value: 'test'
				}
			],
			true,
			'responseJSON'
		);
		Helpers.assertStatusForObject(json, 'failed', 0, 400, "'condition' property not provided for search condition");


		json = await API.createSearch(
			'Test',
			[
				{
					condition: '',
					operator: 'contains',
					value: 'test'
				}
			],
			true,
			'responseJSON'
		);
		Helpers.assertStatusForObject(json, 'failed', 0, 400, 'Search condition cannot be empty');


		json = await API.createSearch(
			'Test',
			[
				{
					condition: 'title',
					value: 'test'
				}
			],
			true,
			'responseJSON'
		);
		Helpers.assertStatusForObject(json, 'failed', 0, 400, "'operator' property not provided for search condition");


		json = await API.createSearch(
			'Test',
			[
				{
					condition: 'title',
					operator: '',
					value: 'test'
				}
			],
			true,
			'responseJSON'
		);
		Helpers.assertStatusForObject(json, 'failed', 0, 400, 'Search operator cannot be empty');
	});
	it('test_should_allow_a_search_with_emoji_values', async function () {
		let response = await API.createSearch(
			"🐶", // 4-byte character
			[
				{
					condition: "title",
					operator: "contains",
					value: "🐶" // 4-byte character
				}
			],
			true,
			'responseJSON'
		);
		Helpers.assert200ForObject(response);
	});
});
