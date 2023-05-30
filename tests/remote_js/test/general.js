const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../api3.js');
const Helpers = require('../helpers3.js');
const { API3Before, API3After } = require("./shared.js");
const HTTP = require("../httpHandler");

describe('GeneralTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
		API.useAPIVersion(false);
	});

	after(async function () {
		await API3After();
	});

	beforeEach(async function () {
		API.useAPIKey(config.apiKey);
	});
	

	it('test404Compression', async function () {
		const response = await API.get("invalidurl");
		Helpers.assert404(response);
		Helpers.assertCompression(response);
	});

	it('testAPIVersionHeader', async function () {
		let minVersion = 1;
		let maxVersion = 3;
		let defaultVersion = 3;
		let response;

		for (let i = minVersion; i <= maxVersion; i++) {
			response = await API.userGet(config.userID, "items?format=keys&limit=1",
				{ "Zotero-API-Version": i }
			);
			Helpers.assert200(response);
			assert.equal(i, response.headers["zotero-api-version"][0]);
		}

		// Default
		response = await API.userGet(config.userID, "items?format=keys&limit=1");
		Helpers.assert200(response);
		assert.equal(defaultVersion, response.headers["zotero-api-version"][0]);
	});

	it('test200Compression', async function () {
		const response = await API.get('itemTypes');
		Helpers.assert200(response);
		Helpers.assertCompression(response);
	});

	it('testAuthorization', async function () {
		let apiKey = config.apiKey;
		API.useAPIKey(false);
	
		// Zotero-API-Key header
		let response = await API.userGet(
			config.userID,
			"items",
			{
				"Zotero-API-Key": apiKey
			}
		);
		Helpers.assert200(response);
	
		// Authorization header
		response = await API.userGet(
			config.userID,
			"items",
			{
				Authorization: "Bearer " + apiKey
			}
		);
		Helpers.assert200(response);
	
		// Query parameter
		response = await API.userGet(
			config.userID,
			"items?key=" + apiKey
		);
		Helpers.assert200(response);
	
		// Zotero-API-Key header and query parameter
		response = await API.userGet(
			config.userID,
			"items?key=" + apiKey,
			{
				"Zotero-API-Key": apiKey
			}
		);
		Helpers.assert200(response);
	
		// No key
		response = await API.userGet(
			config.userID,
			"items"
		);
		Helpers.assert403(response);
	
		// Zotero-API-Key header and empty key (which is still an error)
		response = await API.userGet(
			config.userID,
			"items?key=",
			{
				"Zotero-API-Key": apiKey
			}
		);
		Helpers.assert400(response);
	
		// Zotero-API-Key header and incorrect Authorization key (which is ignored)
		response = await API.userGet(
			config.userID,
			"items",
			{
				"Zotero-API-Key": apiKey,
				Authorization: "Bearer invalidkey"
			}
		);
		Helpers.assert200(response);
	
		// Zotero-API-Key header and key mismatch
		response = await API.userGet(
			config.userID,
			"items?key=invalidkey",
			{
				"Zotero-API-Key": apiKey
			}
		);
		Helpers.assert400(response);
	
		// Invalid Bearer format
		response = await API.userGet(
			config.userID,
			"items",
			{
				Authorization: "Bearer key=" + apiKey
			}
		);
		Helpers.assert400(response);
	
		// Ignored OAuth 1.0 header, with key query parameter
		response = await API.userGet(
			config.userID,
			"items?key=" + apiKey,
			{
				Authorization: 'OAuth oauth_consumer_key="aaaaaaaaaaaaaaaaaaaa"'
			}
		);
		Helpers.assert200(response);
	
		// Ignored OAuth 1.0 header, with no key query parameter
		response = await API.userGet(
			config.userID,
			"items",
			{
				Authorization: 'OAuth oauth_consumer_key="aaaaaaaaaaaaaaaaaaaa"'
			}
		);
		Helpers.assert403(response);
	});

	it('testAPIVersionParameter', async function () {
		let minVersion = 1;
		let maxVersion = 3;
   
		for (let i = minVersion; i <= maxVersion; i++) {
			const response = await API.userGet(
				config.userID,
				'items?format=keys&limit=1&v=' + i
			);
			assert.equal(i, response.headers['zotero-api-version'][0]);
		}
	});

	it('testCORS', async function () {
		let response = await HTTP.options(config.apiURLPrefix, { Origin: "http://example.com" });
		Helpers.assert200(response);
		assert.equal('', response.data);
		assert.equal('*', response.headers['access-control-allow-origin'][0]);
	});

	it('test204NoCompression', async function () {
		let json = await API.createItem("book", [], null, 'jsonData');
		let response = await API.userDelete(
			config.userID,
			`items/${json.key}`,
			{
				"If-Unmodified-Since-Version": json.version
			}
		);
		Helpers.assert204(response);
		Helpers.assertNoCompression(response);
		Helpers.assertContentLength(response, 0);
	});
});
