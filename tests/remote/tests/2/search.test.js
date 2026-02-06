/**
 * Search tests for API v2
 * Port of tests/remote/tests/API/2/SearchTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert204,
	assert400ForObject
} from '../../assertions3.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Searches (API v2)', function () {
	this.timeout(30000);

	let savedSearchData = null;

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testNewSearch
	it('should create new search', async function () {
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

		let xml = await API.createSearch(name, conditions, 'atom');
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), 1);

		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(json.name, name);
		assert.isArray(json.conditions);
		assert.lengthOf(json.conditions, conditions.length);

		for (let i = 0; i < conditions.length; i++) {
			for (let key in conditions[i]) {
				assert.equal(json.conditions[i][key], conditions[i][key]);
			}
		}

		savedSearchData = data;
	});

	// PHP: testModifySearch
	it('should modify search', async function () {
		if (!savedSearchData) {
			this.skip();
		}

		let key = savedSearchData.key;
		let version = savedSearchData.version;
		let json = JSON.parse(savedSearchData.content);

		// Remove one search condition
		json.conditions.shift();

		let name = json.name;
		let conditions = json.conditions;

		let response = await API.userPut(
			config.get('userID'),
			`searches/${key}?key=${config.get('apiKey')}`,
			JSON.stringify(json),
			[
				'Content-Type: application/json',
				`If-Unmodified-Since-Version: ${version}`
			]
		);
		assert204(response);

		let xml = await API.getSearchXML(key);
		let data = API.parseDataFromAtomEntry(xml);
		let searchJson = JSON.parse(data.content);
		assert.equal(searchJson.name, name);
		assert.isArray(searchJson.conditions);
		assert.lengthOf(searchJson.conditions, conditions.length);

		for (let i = 0; i < conditions.length; i++) {
			for (let condKey in conditions[i]) {
				assert.equal(searchJson.conditions[i][condKey], conditions[i][condKey]);
			}
		}
	});

	// PHP: testNewSearchNoName
	it('should reject search with no name', async function () {
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

	// PHP: testNewSearchNoConditions
	it('should reject search with no conditions', async function () {
		let response = await API.createSearch('Test', [], 'response');
		assert400ForObject(response, "'conditions' cannot be empty");
	});

	// PHP: testNewSearchConditionErrors
	it('should reject search with condition errors', async function () {
		// Missing condition property
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
