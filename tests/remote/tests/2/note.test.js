/**
 * Note tests for API v2
 * Port of tests/remote/tests/API/2/NoteTest.php
 */

import config from 'config';
import { API } from '../../api2.js';
import {
	assert413ForObject
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Notes (API v2)', function () {
	this.timeout(30000);

	let content;
	let json;

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	beforeEach(async function () {
		// Create too-long note content
		content = '1234567890'.repeat(50001);

		// Create JSON template
		json = await API.getItemTemplate('note');
		json.note = content;
	});

	// PHP: testNoteTooLong
	it('should reject note that is too long', async function () {
		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long"
		);
	});

	// PHP: testNoteTooLongBlankFirstLines
	it('should reject note too long with blank first lines', async function () {
		json.note = ' \n \n' + content;

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long"
		);
	});

	// PHP: testNoteTooLongBlankFirstLinesHTML
	it('should reject note too long with blank first lines HTML', async function () {
		json.note = '\n<p>&nbsp;</p>\n<p>&nbsp;</p>\n' + content;

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123...' too long"
		);
	});

	// PHP: testNoteTooLongTitlePlusNewlines
	it('should reject note too long with title plus newlines', async function () {
		json.note = 'Full Text:\n\n' + content;

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note 'Full Text: 1234567890123456789012345678901234567890123456789012345678901234567...' too long"
		);
	});

	// PHP: testNoteTooLongWithinHTMLTags
	it('should reject note too long with all content within HTML tags', async function () {
		json.note = '&nbsp;\n<p><!-- ' + content + ' --></p>';

		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			}),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '&lt;p&gt;&lt;!-- 1234567890123456789012345678901234567890123456789012345678901234...' too long"
		);
	});
});
