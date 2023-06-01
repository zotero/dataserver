var config = require('config');
const { API3Before, API3After } = require("../shared.js");

describe('SchemaTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});

	it('test_should_reject_download_from_old_client_for_item_using_newer_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_collection_using_legacy_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_search_using_legacy_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_item_using_legacy_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_attachment_using_legacy_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_linked_file_attachment_using_legacy_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_note_using_legacy_schema', async function () {
		this.skip();
	});
	it('test_should_not_reject_download_from_old_client_for_child_note_using_legacy_schema', async function () {
		this.skip();
	});
});
