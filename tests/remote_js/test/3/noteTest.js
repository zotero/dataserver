const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('NoteTests', function () {
	//this.timeout(config.timeout);
	this.timeout(config.timeout);

	let content, json;
	
	before(async function () {
		await API3Setup();
	});

	after(async function () {
		await API3WrapUp();
	});

	this.beforeEach(async function() {
		content = "1234567890".repeat(50001);
		json = await API.getItemTemplate('note');
		json.note = content;
	});

	it('testSaveHTML', async function () {
		const content = '<p>Foo &amp; Bar</p>';
		const json = await API.createNoteItem(content, false, this, 'json');
		Helpers.assertEquals(content, json.data.note);
	});

	it('testNoteTooLong', async function () {
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long"
		);
	});

	it('testNoteTooLongBlankFirstLines', async function () {
		json.note = " \n \n" + content;

		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);

		Helpers.assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long"
		);
	});

	it('testSaveUnchangedSanitizedNote', async function () {
		let json = await API.createNoteItem('<span >Foo</span>', false, this, 'json');
		let response = await API.postItem(json.data, { "Content-Type": "application/json" });
		json = await API.getJSONFromResponse(response);
		let unchanged = json.unchanged;
		assert.property(unchanged, 0);
	});

	it('testNoteTooLongBlankFirstLinesHTML', async function () {
		json.note = "\n<p>&nbsp;</p>\n<p>&nbsp;</p>\n" + content;

		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);

		Helpers.assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123...' too long"
		);
	});

	it('test_utf8mb4_note', async function () {
		let note = "<p>🐻</p>";
		json.note = note;

		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);

		Helpers.assert200ForObject(response);

		let jsonResponse = await API.getJSONFromResponse(response);
		let data = jsonResponse.successful[0].data;
		assert.equal(note, data.note);
	});

	it('testNoteTooLongWithinHTMLTags', async function () {
		json.note = "&nbsp;\n<p><!-- " + content + " --></p>";
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert413ForObject(
			response,
			"Note '&lt;p&gt;&lt;!-- 1234567890123456789012345678901234567890123456789012345678901234...' too long"
		);
	});

	it('testNoteTooLongTitlePlusNewlines', async function () {
		json.note = `Full Text:\n\n${content}`;
		let response = await API.userPost(
			config.userID,
			'items',
			JSON.stringify([json]),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert413ForObject(
			response,
			"Note 'Full Text: 1234567890123456789012345678901234567890123456789012345678901234567...' too long"
		);
	});

	it('test_should_allow_zotero_links_in_notes', async function () {
		let json = await API.createNoteItem('<p>Test</p>', false, this, 'json');

		const val = '<p><a href="zotero://select/library/items/ABCD2345">Test</a></p>';
		json.data.note = val;

		let response = await API.postItem(json.data);
		let jsonResp = await API.getJSONFromResponse(response);
		Helpers.assertEquals(val, jsonResp.successful[0].data.note);
	});

	it('testSaveHTMLAtom', async function () {
		let content = '<p>Foo &amp; Bar</p>';
		let xml = await API.createNoteItem(content, false, this, 'atom');
		let contentXml = xml.getElementsByTagName('content')[0];
		const tempNode = xml.createElement("textarea");
		const htmlNote = JSON.parse(contentXml.innerHTML).note;
		tempNode.innerHTML = htmlNote;
		assert.equal(tempNode.textContent, content);
	});
});
