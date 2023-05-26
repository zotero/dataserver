const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('TranslationTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	it('testWebTranslationMultiple', async function () {
		const url = 'https://zotero-static.s3.amazonaws.com/test-multiple.html';
		const title = 'Digital history: A guide to gathering, preserving, and presenting the past on the web';

		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify({
				url: url
			}),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert300(response);
		const json = JSON.parse(response.data);

		const results = Object.assign({}, json.items);
		const key = Object.keys(results)[0];
		const val = Object.values(results)[0];
		assert.equal('0', key);
		assert.equal(title, val);

		const items = {};
		items[key] = val;

		// Missing token
		response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				url: url,
				items: items
			}),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert400(response, "Token not provided with selected items");

		// Invalid selection
		const items2 = Object.assign({}, items);
		const invalidKey = "12345";
		items2[invalidKey] = items2[key];
		delete items2[key];
		response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				url: url,
				token: json.token,
				items: items2
			}),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert400(response, `Index '${invalidKey}' not found for URL and token`);

		response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				url: url,
				token: json.token,
				items: items
			}),
			{
				"Content-Type": "application/json"
			}
		);

		Helpers.assert200(response);
		Helpers.assert200ForObject(response);
		const itemKey = API.getJSONFromResponse(response).success[0];
		const data = (await API.getItem(itemKey, this, 'json')).data;
		assert.equal(title, data.title);
	});

	//disabled
	it('testWebTranslationSingleWithChildItems', async function () {
		this.skip();
		let title = 'A Clustering Approach to Identify Intergenic Non-coding RNA in Mouse Macrophages';

		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify({
				url: "http://www.computer.org/csdl/proceedings/bibe/2010/4083/00/4083a001-abs.html"
			}),
			{
				"Content-Type": "application/json"
			}
		);
		Helpers.assert200(response);
		Helpers.assert200ForObject(response, false, 0);
		Helpers.assert200ForObject(response, false, 1);
		let json = await API.getJSONFromResponse(response);

		// Check item
		let itemKey = json.success[0];
		let data = (await API.getItem(itemKey, this, 'json')).data;
		Helpers.assertEquals(title, data.title);
		// NOTE: Tags currently not served via BibTeX (though available in RIS)
		Helpers.assertCount(0, data.tags);
		//$this->assertContains(['tag' => 'chip-seq; clustering; non-coding rna; rna polymerase; macrophage', 'type' => 1], $data['tags']); // TODO: split in translator

		// Check note
		itemKey = json.success[1];
		data = (await API.getItem(itemKey, this, 'json')).data;
		Helpers.assertEquals("Complete PDF document was either not available or accessible. "
			+ "Please make sure you're logged in to the digital library to retrieve the "
			+ "complete PDF document.", data.note);
	});

	it('testWebTranslationSingle', async function () {
		const url = "https://forums.zotero.org";
		const title = 'Recent Discussions';

		const response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify({
				url: url
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200(response);
		Helpers.assert200ForObject(response);
		const json = API.getJSONFromResponse(response);
		const itemKey = json.success[0];
		const data = await API.getItem(itemKey, this, 'json');
		assert.equal(title, data.data.title);
	});

	it('testWebTranslationInvalidToken', async function () {
		const url = "https://zotero-static.s3.amazonaws.com/test.html";

		const response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				url: url,
				token: Helpers.md5(Helpers.uniqueID())
			}),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400(response, "'token' is valid only for item selection requests");
	});
});
