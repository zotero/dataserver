const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('CreatorTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});


	it('test_should_allow_emoji_in_creator_name', async function () {
		const char = "🐻";
		const data = {
			creators: [
				{
					creatorType: "author",
					name: char
				}
			]
		};
		const json = await API.createItem("book", data, true, 'json');

		assert.equal(json.data.creators[0].name, char);
	});

	it('testCreatorCaseSensitivity', async function () {
		await API.createItem("book", {
			creators: [
				{
					creatorType: "author",
					name: "SMITH"
				}
			]
		}, true, 'json');
		const json = await API.createItem("book", {
			creators: [
				{
					creatorType: "author",
					name: "Smith"
				}
			]
		}, true, 'json');
		assert.equal(json.data.creators[0].name, 'Smith');
	});

	it('testCreatorSummaryAtom', async function () {
		let xml = await API.createItem("book", {
			creators: [
				{
					creatorType: "author",
					name: "Test"
				}
			]
		}, null, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let itemKey = data.key;
		let json = JSON.parse(data.content);

		let creatorSummary = Helpers.xpathEval(xml, '//atom:entry/zapi:creatorSummary');
		assert.equal(creatorSummary, "Test");

		json.creators.push({
			creatorType: "author",
			firstName: "Alice",
			lastName: "Foo"
		});

		let response = await API.userPut(
			config.userID,
			`items/${itemKey}`,
			JSON.stringify(json)
		);
		Helpers.assert204(response);

		xml = await API.getItemXML(itemKey);
		creatorSummary = Helpers.xpathEval(xml, '//atom:entry/zapi:creatorSummary');
		assert.equal(creatorSummary, "Test and Foo");

		data = API.parseDataFromAtomEntry(xml);
		json = JSON.parse(data.content);

		json.creators.push({
			creatorType: "author",
			firstName: "Bob",
			lastName: "Bar"
		});

		response = await API.userPut(
			config.userID,
			`items/${itemKey}`,
			JSON.stringify(json)
		);
		Helpers.assert204(response);

		xml = await API.getItemXML(itemKey);
		creatorSummary = Helpers.xpathEval(xml, '//atom:entry/zapi:creatorSummary');
		assert.equal(creatorSummary, "Test et al.");
	});


	it('testCreatorSummaryJSON', async function () {
		let json = await API.createItem('book', {
			creators: [{
				creatorType: 'author',
				name: 'Test'
			}]
		}, true, 'json');
		const itemKey = json.key;

		assert.equal(json.meta.creatorSummary, 'Test');

		json = json.data;
		json.creators.push({
			creatorType: 'author',
			firstName: 'Alice',
			lastName: 'Foo'
		});

		const response = await API.userPut(
			config.userID,
			`items/${itemKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert204(response);

		json = await API.getItem(itemKey, true, 'json');
		assert.equal(json.meta.creatorSummary, 'Test and Foo');

		json = json.data;
		json.creators.push({
			creatorType: 'author',
			firstName: 'Bob',
			lastName: 'Bar'
		});

		const response2 = await API.userPut(
			config.userID,
			`items/${itemKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert204(response2);

		json = await API.getItem(itemKey, true, 'json');
		assert.equal(json.meta.creatorSummary, 'Test et al.');
	});

	it('testEmptyCreator', async function () {
		let data = {
			creators: [
				{
					creatorType: "author",
					name: "\uFEFF"
				}
			]
		};
		let response = await API.createItem("book", data, true, 'json');
		assert.notProperty(response.meta, 'creatorSummary');
	});

	it('test_should_add_creator_with_correct_case', async function () {
		let data = {
			creators: [
				{
					creatorType: "author",
					name: "test"
				}
			]
		};
		await API.createItem("book", data);
		await API.createItem("book", data);

		let json = await API.createItem("book", {
			creators: [
				{
					creatorType: "author",
					name: "Test"
				}
			]
		}, true, 'json');

		assert.equal(json.data.creators[0].name, "Test");
	});
});
