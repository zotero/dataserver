const { assert } = require('chai');
const API = require('../../api2.js');
var config = require('config');
const Helpers = require('../../helpers2.js');
const { API1Before, API1After } = require("../shared.js");

describe('ItemTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API1Before();
		await API.setKeyOption(config.userID, config.apiKey, 'libraryNotes', 1);
	});

	after(async function () {
		await API1After();
	});

	it('testCreateItemWithChildren', async function () {
		let json = await API.getItemTemplate("newspaperArticle");
		let noteJSON = await API.getItemTemplate("note");
		noteJSON.note = "<p>Here's a test note</p>";
		json.notes = [noteJSON];
		let response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({ items: [json] }),
			{ "Content-Type": "application/json" }
		);
		Helpers.assertStatusCode(response, 201);
		let xml = API.getXMLFromResponse(response);
		Helpers.assertNumResults(response, 1);
		const numChildren = Helpers.xpathEval(xml, '//atom:entry/zapi:numChildren');
		assert.equal(parseInt(numChildren), 1);
	});
});
