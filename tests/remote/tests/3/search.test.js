/**
 * Search API tests
 * Port of tests/remote/tests/API/3/SearchTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert200ForObject,
	assert204,
	assert400ForObject,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Searches', function() {
	this.timeout(30000);

	let testSearchData = null;

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testNewSearch
	it('should create new search', async function() {
		let name = 'Test Search';
		let conditions = [
			{
				condition: 'title',
				operator: 'contains',
				value: 'test'
			},
			{
				condition: 'noChildren',
				operator: 'false',
				value: ''
			},
			{
				condition: 'fulltextContent/regexp',
				operator: 'contains',
				value: '/test/'
			}
		];

		let response = await API.userPost(
			config.get('userID'),
			'searches',
			JSON.stringify([{
				name: name,
				conditions: conditions
			}]),
			['Content-Type: application/json']
		);
		assert200(response);
		let libraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 1);
		// Deprecated
		assert.lengthOf(Object.keys(json.success), 1);

		// Check data in write response
		let data = json.successful[0].data;
		assert.equal(json.successful[0].key, data.key);
		assert.equal(data.version, libraryVersion);
		assert.equal(data.name, name);
		assert.isArray(data.conditions);
		assert.lengthOf(data.conditions, conditions.length);
		for (let i = 0; i < conditions.length; i++) {
			for (let [key, val] of Object.entries(conditions[i])) {
				assert.equal(data.conditions[i][key], val);
			}
		}

		// Check in separate request, to be safe
		let keys = Object.values(json.successful).map(o => o.key);
		response = await API.getSearchResponse(keys);
		assertTotalResults(response, 1);
		json = API.getJSONFromResponse(response);
		data = json[0].data;
		assert.equal(data.name, name);
		assert.isArray(data.conditions);
		assert.lengthOf(data.conditions, conditions.length);
		for (let i = 0; i < conditions.length; i++) {
			for (let [key, val] of Object.entries(conditions[i])) {
				assert.equal(data.conditions[i][key], val);
			}
		}

		// Store for next test
		testSearchData = data;
	});

	// PHP: testModifySearch
	it('should modify search', async function() {
		// Depends on testNewSearch
		assert.isNotNull(testSearchData, 'testNewSearch must run first');

		let key = testSearchData.key;
		let version = testSearchData.version;

		// Remove one search condition
		let data = { ...testSearchData };
		data.conditions = data.conditions.slice(1);

		let name = data.name;
		let conditions = data.conditions;

		let response = await API.userPut(
			config.get('userID'),
			`searches/${key}`,
			JSON.stringify(data),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		let json = await API.getSearch(key, 'json');
		data = json.data;
		assert.equal(data.name, name);
		assert.isArray(data.conditions);
		assert.lengthOf(data.conditions, conditions.length);
		for (let i = 0; i < conditions.length; i++) {
			for (let [key, val] of Object.entries(conditions[i])) {
				assert.equal(data.conditions[i][key], val);
			}
		}
	});

	// PHP: testEditMultipleSearches
	it('should edit multiple searches', async function() {
		let search1Name = 'Test 1';
		let search1Conditions = [
			{
				condition: 'title',
				operator: 'contains',
				value: 'test'
			}
		];
		let search1Data = await API.createSearch(search1Name, search1Conditions, 'jsonData');
		let search1NewName = 'Test 1 Modified';

		let search2Name = 'Test 2';
		let search2Conditions = [
			{
				condition: 'title',
				operator: 'is',
				value: 'test2'
			}
		];
		let search2Data = await API.createSearch(search2Name, search2Conditions, 'jsonData');
		let search2NewConditions = [
			{
				condition: 'title',
				operator: 'isNot',
				value: 'test1'
			}
		];

		let response = await API.userPost(
			config.get('userID'),
			'searches',
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
			['Content-Type: application/json']
		);
		assert200(response);
		let libraryVersion = parseInt(response.getHeader('Last-Modified-Version'));
		let json = API.getJSONFromResponse(response);
		assert.lengthOf(Object.keys(json.successful), 2);
		// Deprecated
		assert.lengthOf(Object.keys(json.success), 2);

		// Check data in write response
		assert.equal(json.successful[0].key, json.successful[0].data.key);
		assert.equal(json.successful[1].key, json.successful[1].data.key);
		assert.equal(json.successful[0].version, libraryVersion);
		assert.equal(json.successful[1].version, libraryVersion);
		assert.equal(json.successful[0].data.version, libraryVersion);
		assert.equal(json.successful[1].data.version, libraryVersion);
		assert.equal(json.successful[0].data.name, search1NewName);
		assert.equal(json.successful[1].data.name, search2Name);
		assert.deepEqual(search1Conditions, json.successful[0].data.conditions);
		assert.deepEqual(search2NewConditions, json.successful[1].data.conditions);

		// Check in separate request, to be safe
		let keys = Object.values(json.successful).map(o => o.key);
		response = await API.getSearchResponse(keys);
		assertTotalResults(response, 2);
		json = API.getJSONFromResponse(response);
		// POST follows PATCH behavior, so unspecified values shouldn't change
		assert.equal(json[0].data.name, search1NewName);
		assert.deepEqual(search1Conditions, json[0].data.conditions);
		assert.equal(json[1].data.name, search2Name);
		assert.deepEqual(search2NewConditions, json[1].data.conditions);
	});

	// PHP: testNewSearchNoName
	it('should reject new search with no name', async function() {
		let response = await API.createSearch(
			'',
			[
				{
					condition: 'title',
					operator: 'contains',
					value: 'test'
				}
			],
			'response'
		);
		assert400ForObject(response, 'Search name cannot be empty');
	});

	// PHP: test_should_allow_a_search_with_emoji_values
	it('should allow a search with emoji values', async function() {
		let response = await API.createSearch(
			'\uD83D\uDC36', // Dog emoji (4-byte character)
			[
				{
					condition: 'title',
					operator: 'contains',
					value: '\uD83D\uDC36' // Dog emoji (4-byte character)
				}
			],
			'response'
		);
		assert200ForObject(response);
	});

	// PHP: testNewSearchNoConditions
	it('should reject new search with no conditions', async function() {
		let json = {
			name: 'Test',
			conditions: []
		};
		let response = await API.postObjects('search', [json]);
		assert400ForObject(response, "'conditions' cannot be empty");
	});

	// PHP: testNewSearchConditionErrors
	it('should handle new search condition errors', async function() {
		// Missing condition
		let response = await API.createSearch(
			'Test',
			[
				{
					operator: 'contains',
					value: 'test'
				}
			],
			'response'
		);
		assert400ForObject(response, "'condition' property not provided for search condition");

		// Empty condition
		response = await API.createSearch(
			'Test',
			[
				{
					condition: '',
					operator: 'contains',
					value: 'test'
				}
			],
			'response'
		);
		assert400ForObject(response, 'Search condition cannot be empty');

		// Missing operator
		response = await API.createSearch(
			'Test',
			[
				{
					condition: 'title',
					value: 'test'
				}
			],
			'response'
		);
		assert400ForObject(response, "'operator' property not provided for search condition");

		// Empty operator
		response = await API.createSearch(
			'Test',
			[
				{
					condition: 'title',
					operator: '',
					value: 'test'
				}
			],
			'response'
		);
		assert400ForObject(response, 'Search operator cannot be empty');
	});
});
