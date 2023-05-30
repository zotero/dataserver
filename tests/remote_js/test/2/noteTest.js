const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require("../../helpers2.js");
const { API2Before, API2After } = require("../shared.js");

describe('NoteTests', function () {
	this.timeout(config.timeout);
	let content;
	let json;

	before(async function () {
		await API2Before();
	});

	after(async function () {
		await API2After();
	});

	beforeEach(async function () {
		content = "1234567890".repeat(50001);
		json = await API.getItemTemplate("note");
		json.note = content;
	});

	it('testNoteTooLong', async function () {
		const response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{
				headers: { "Content-Type": "application/json" }
			}
		);
		const expectedMessage = "Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long";
		Helpers.assertStatusForObject(response, 'failed', 0, 413, expectedMessage);
	});

	it('testNoteTooLongBlankFirstLines', async function () {
		json.note = " \n \n" + content;

		const response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);
		const expectedMessage = "Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long";
		Helpers.assertStatusForObject(response, 'failed', 0, 413, expectedMessage);
	});

	it('testNoteTooLongBlankFirstLinesHTML', async function () {
		json.note = '\n<p>&nbsp;</p>\n<p>&nbsp;</p>\n' + content;

		const response = await API.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		const expectedMessage = "Note '1234567890123456789012345678901234567890123456789012345678901234567890123...' too long";
		Helpers.assertStatusForObject(response, 'failed', 0, 413, expectedMessage);
	});

	it('testNoteTooLongTitlePlusNewlines', async function () {
		json.note = "Full Text:\n\n" + content;

		const response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		const expectedMessage = "Note 'Full Text: 1234567890123456789012345678901234567890123456789012345678901234567...' too long";
		Helpers.assertStatusForObject(response, 'failed', 0, 413, expectedMessage);
	});

	it('testNoteTooLongWithinHTMLTags', async function () {
		json.note = "&nbsp;\n<p><!-- " + content + " --></p>";

		const response = await API.userPost(
			config.userID,
			"items?key=" + config.apiKey,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		const expectedMessage = "Note '&lt;p&gt;&lt;!-- 1234567890123456789012345678901234567890123456789012345678901234...' too long";
		Helpers.assertStatusForObject(response, 'failed', 0, 413, expectedMessage);
	});
});
