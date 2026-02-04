/**
 * Schema API tests
 * Port of tests/remote/tests/API/3/SchemaTest.php
 *
 * Note: All tests are skipped in PHP via markTestSkipped() in setUp
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert400
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Schema', function() {
	this.timeout(30000);

	const legacySchemaErrorMessage =
		"Some data in \"My Library\" was created in a newer version of Zotero and could not be downloaded. "
		+ "Upgrade Zotero to continue syncing this library.";

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
	});

	afterEach(async function() {
		await API.resetSchemaVersion(false);
	});

	// PHP: test_should_reject_download_from_old_client_for_item_using_newer_schema
	// All tests are skipped in PHP
	it.skip('should reject download from old client for item using newer schema', async function() {
		let key = await API.createItem(
			'book',
			{
				originalDate: '2018'
			},
			'key'
		);

		await API.useSchemaVersion(false);

		// Property should show up in 5.0.78
		//
		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.78']
		);
		assert200(response);
		assert.equal(API.getJSONFromResponse(response).data.originalDate, '2018');

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.78']
		);
		assert200(response);
		assert.equal(API.getJSONFromResponse(response)[0].data.originalDate, '2018');

		// Should be an error in 5.0.77
		//
		// Single-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert400(response, legacySchemaErrorMessage);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert400(response, legacySchemaErrorMessage);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_collection_using_legacy_schema
	it.skip('should not reject download from old client for collection using legacy schema', async function() {
		let key = await API.createCollection('Foo', {}, 'key');

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`collections/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`collections?collectionKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_search_using_legacy_schema
	it.skip('should not reject download from old client for search using legacy schema', async function() {
		let key = await API.createSearch(
			'Foo',
			[
				{
					condition: 'title',
					operator: 'contains',
					value: 'test'
				}
			],
			'key'
		);

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`searches/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`searches?searchKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_item_using_legacy_schema
	it.skip('should not reject download from old client for item using legacy schema', async function() {
		let key = await API.createItem(
			'book',
			{
				title: 'Foo',
				deleted: true,
				inPublications: true
			},
			'key'
		);

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.data.deleted, 1);
		assert.isTrue(json.data.inPublications);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_attachment_using_legacy_schema
	it.skip('should not reject download from old client for attachment using legacy schema', async function() {
		let key = await API.createAttachmentItem('imported_file', [], false, 'key');

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_linked_file_attachment_using_legacy_schema
	it.skip('should not reject download from old client for linked file attachment using legacy schema', async function() {
		let key = await API.createAttachmentItem('linked_file', { path: '/home/user/foo.pdf' }, false, 'key');

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_note_using_legacy_schema
	it.skip('should not reject download from old client for note using legacy schema', async function() {
		let key = await API.createNoteItem('Test', null, 'key');

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});

	// PHP: test_should_not_reject_download_from_old_client_for_child_note_using_legacy_schema
	it.skip('should not reject download from old client for child note using legacy schema', async function() {
		let parentKey = await API.createItem('book', null, 'key');
		let key = await API.createNoteItem('Test', parentKey, 'key');

		await API.useSchemaVersion(false);

		// Single-object endpoint
		let response = await API.userGet(
			config.get('userID'),
			`items/${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);

		// Multi-object endpoint
		response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${key}`,
			['X-Zotero-Version: 5.0.77']
		);
		assert200(response);
	});
});
