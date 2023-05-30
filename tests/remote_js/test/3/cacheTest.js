const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('CacheTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	it('testCacheCreatorPrimaryData', async function () {
		const data = {
			title: 'Title',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last',
				},
				{
					creatorType: 'editor',
					firstName: 'Ed',
					lastName: 'McEditor',
				},
			],
		};

		const key = await API.createItem('book', data, true, 'key');

		const response = await API.userGet(
			config.userID,
			`items/${key}?content=csljson`
		);
		const json = JSON.parse(API.getContentFromResponse(response));
		assert.equal(json.author[0].given, 'First');
		assert.equal(json.author[0].family, 'Last');
		assert.equal(json.editor[0].given, 'Ed');
		assert.equal(json.editor[0].family, 'McEditor');
	});
});
