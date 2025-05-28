const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers2.js');
const { API2Before, API2After } = require("../shared.js");


describe('GeneralTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Before();
	});

	after(async function () {
		await API2After();
	});

	it('testInvalidCharacters', async function () {
		const data = {
			title: "A" + String.fromCharCode(0) + "A",
			creators: [
				{
					creatorType: "author",
					name: "B" + String.fromCharCode(1) + "B"
				}
			],
			tags: [
				{
					tag: "C" + String.fromCharCode(2) + "C"
				}
			]
		};
		const xml = await API.createItem("book", data, this, 'atom');
		const parsedData = API.parseDataFromAtomEntry(xml);
		const json = JSON.parse(parsedData.content);
		assert.equal("AA", json.title);
		assert.equal("BB", json.creators[0].name);
		assert.equal("CC", json.tags[0].tag);
	});

	it('testZoteroWriteToken', async function () {
		const json = await API.getItemTemplate('book');
		const token = Helpers.uniqueToken();

		let response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({ items: [json] }),
			{ 'Content-Type': 'application/json', 'Zotero-Write-Token': token }
		);

		Helpers.assertStatusCode(response, 200);
		Helpers.assert200ForObject(response);

		response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({ items: [json] }),
			{ 'Content-Type': 'application/json', 'Zotero-Write-Token': token }
		);

		Helpers.assertStatusCode(response, 412);
	});
});
