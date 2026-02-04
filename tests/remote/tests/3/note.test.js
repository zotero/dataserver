/**
 * Note API tests
 * Port of tests/remote/tests/API/3/NoteTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200ForObject,
	assert413ForObject
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Notes', function() {
	this.timeout(30000);

	let content;
	let json;

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	beforeEach(async function() {
		// Create too-long note content
		content = '1234567890'.repeat(50001);

		// Create JSON template
		json = await API.getItemTemplate('note');
		json.note = content;
	});

	// PHP: test_utf8mb4_note
	it('should save utf8mb4 note', async function() {
		let note = '<p>🐻</p>'; // 4-byte character
		let json = await API.getItemTemplate('note');
		json.note = note;

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);

		assert200ForObject(response);

		json = API.getJSONFromResponse(response);
		json = json.successful[0].data;
		assert.strictEqual(json.note, note);
	});

	// PHP: testNoteTooLong
	it('should reject note that is too long', async function() {
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long"
		);
	});

	// PHP: testNoteTooLongBlankFirstLines
	it('should reject note that is too long with blank first lines', async function() {
		json.note = ' \n \n' + content;

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123456789...' too long"
		);
	});

	// PHP: testNoteTooLongBlankFirstLinesHTML
	it('should reject note that is too long with blank first lines HTML', async function() {
		json.note = '\n<p>&nbsp;</p>\n<p>&nbsp;</p>\n' + content;

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '1234567890123456789012345678901234567890123456789012345678901234567890123...' too long"
		);
	});

	// PHP: testNoteTooLongTitlePlusNewlines
	it('should reject note that is too long with title plus newlines', async function() {
		json.note = 'Full Text:\n\n' + content;

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note 'Full Text: 1234567890123456789012345678901234567890123456789012345678901234567...' too long"
		);
	});

	// PHP: testNoteTooLongWithinHTMLTags
	it('should reject note that is too long within HTML tags', async function() {
		json.note = '&nbsp;\n<p><!-- ' + content + ' --></p>';

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert413ForObject(
			response,
			"Note '&lt;p&gt;&lt;!-- 1234567890123456789012345678901234567890123456789012345678901234...' too long"
		);
	});

	// PHP: testSaveHTML
	it('should save HTML', async function() {
		let content = '<p>Foo &amp; Bar</p>';
		let json = await API.createNoteItem(content, false, 'json');
		assert.equal(json.data.note, content);
	});

	// PHP: testSaveHTMLAtom
	it('should save HTML in Atom', async function() {
		let content = '<p>Foo &amp; Bar</p>';
		let xml = await API.createNoteItem(content, false, 'atom');
		let data = API.parseDataFromAtomEntry(xml);
		let jsonContent = JSON.parse(data.content);
		assert.equal(jsonContent.note, content);
	});

	// PHP: testSaveUnchangedSanitizedNote
	it('should save unchanged sanitized note', async function() {
		let json = await API.createNoteItem('<span >Foo</span>', false, 'json');
		let response = await API.postItem(json.data);
		json = API.getJSONFromResponse(response);
		assert.property(json.unchanged, 0);
	});

	// PHP: test_should_allow_zotero_links_in_notes
	it('should allow zotero links in notes', async function() {
		let json = await API.createNoteItem('<p>Test</p>', false, 'json');

		let val = '<p><a href="zotero://select/library/items/ABCD2345">Test</a></p>';
		json.data.note = val;

		let response = await API.postItem(json.data);
		json = API.getJSONFromResponse(response);
		assert.equal(json.successful[0].data.note, val);
	});
});
