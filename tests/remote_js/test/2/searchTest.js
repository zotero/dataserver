const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('SearchTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
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

		let xml = await API.createSearch(name, conditions, true);
		assert.equal(parseInt(Helpers.xpathEval(xml, '/atom:feed/zapi:totalResults')), 1);

		let data = API.parseDataFromAtomEntry(xml);
		let json = JSON.parse(data.content);
		assert.equal(name, json.name);
		assert.isArray(json.conditions);
		assert.equal(conditions.length, json.conditions.length);
		for (let i = 0; i < conditions.length; i++) {
			for (let key in conditions[i]) {
				assert.equal(conditions[i][key], json.conditions[i][key]);
			}
		}

		return data;
	};

	it('testModifySearch', async function () {
		const newSearchData = await testNewSearch();
		let json = JSON.parse(newSearchData.content);

		// Remove one search condition
		json.conditions.shift();

		const name = json.name;
		const conditions = json.conditions;

		let response = await API.userPut(
			config.userID,
			`searches/${newSearchData.key}?key=${config.apiKey}`,
			JSON.stringify(json),
			{
				"Content-Type": "application/json",
				"If-Unmodified-Since-Version": newSearchData.version
			}
		);

		Helpers.assertStatusCode(response, 204);

		const xml = await API.getSearchXML(newSearchData.key);
		const data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		assert.equal(name, json.name);
		assert.isArray(json.conditions);
		assert.equal(conditions.length, json.conditions.length);

		for (let i = 0; i < conditions.length; i++) {
			const condition = conditions[i];
			assert.equal(condition.field, json.conditions[i].field);
			assert.equal(condition.operator, json.conditions[i].operator);
			assert.equal(condition.value, json.conditions[i].value);
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
		const response = await API.createSearch('', conditions, headers, 'responsejson');
		Helpers.assertStatusForObject(response, 'failed', 0, 400, 'Search name cannot be empty');
	});

	it('testNewSearchNoConditions', async function () {
		const json = await API.createSearch("Test", [], true, 'responsejson');
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
			'responsejson'
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
			'responsejson'
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
			'responsejson'
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
			'responsejson'
		);
		Helpers.assertStatusForObject(json, 'failed', 0, 400, 'Search operator cannot be empty');
	});
});
