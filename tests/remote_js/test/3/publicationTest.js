const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp, resetGroups } = require("../shared.js");
const { S3Client, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const HTTP = require('../../httpHandler.js');
const fs = require('fs');
const { JSDOM } = require("jsdom");


describe('PublicationTests', function () {
	this.timeout(0);
	let toDelete = [];
	const s3Client = new S3Client({ region: "us-east-1" });

	before(async function () {
		await API3Setup();
		await resetGroups();
		try {
			fs.mkdirSync("./work");
		}
		catch {}
	});

	after(async function () {
		await API3WrapUp();
		fs.rmdirSync("./work", { recursive: true, force: true });
		if (toDelete.length > 0) {
			const commandInput = {
				Bucket: config.s3Bucket,
				Delete: {
					Objects: toDelete.map((x) => {
						return { Key: x };
					})
				}
			};
			const command = new DeleteObjectsCommand(commandInput);
			await s3Client.send(command);
		}
	});
	beforeEach(async function () {
		await API.userClear(config.userID);
		API.useAPIKey("");
	});


	it('test_should_return_404_for_collections_request', async function () {
		let response = await API.get(`users/${config.userID}/publications/collections`, { "Content-Type": "application/json" });
		Helpers.assert404(response);
	});

	it('test_should_show_publications_urls_in_json_response_for_multi_object_request', async function () {
		await API.useAPIKey(config.apiKey);
		const itemKey1 = await API.createItem("book", { inPublications: true }, this, 'key');
		const itemKey2 = await API.createItem("book", { inPublications: true }, this, 'key');

		const response = await API.get("users/" + config.userID + "/publications/items?limit=1", { "Content-Type": "application/json" });
		const json = API.getJSONFromResponse(response);

		const links = await API.parseLinkHeader(response);

		Helpers.assertRegExp(
			`https?://[^/]+/users/${config.userID}/publications/items/(${itemKey1}|${itemKey2})`,
			json[0].links.self.href
		);

		Helpers.assertRegExp(
			`https?://[^/]+/users/${config.userID}/publications/items`,
			links.next
		);

		// TODO: rel="alternate" (what should this be?)
	});

	it('test_should_trigger_notification_on_publications_topic', async function () {
		API.useAPIKey(config.apiKey);
		const response = await API.createItem('book', { inPublications: true }, this, 'response');
		const version = API.getJSONFromResponse(response).successful[0].version;
		Helpers.assertNotificationCount(2, response);
		Helpers.assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.userID}`,
			version: version
		}, response);
		Helpers.assertHasNotification({
			event: 'topicUpdated',
			topic: `/users/${config.userID}/publications`
		}, response);
	});

	it('test_should_show_publications_urls_in_atom_response_for_single_object_request', async function () {
		API.useAPIKey(config.apiKey);
		const itemKey = await API.createItem('book', { inPublications: true }, this, 'key');
		const response = await API.get(`users/${config.userID}/publications/items/${itemKey}?format=atom`);
		const xml = await API.getXMLFromResponse(response);

		// id
		Helpers.assertRegExp(
			`http://[^/]+/users/${config.userID}/items/${itemKey}`,
			Helpers.xpathEval(xml, '//atom:id')
		);

		// rel="self"
		const selfRel = Helpers.xpathEval(xml, '//atom:link[@rel="self"]', true, false);
		Helpers.assertRegExp(
			`https?://[^/]+/users/${config.userID}/publications/items/${itemKey}\\?format=atom`,
			selfRel.getAttribute("href")
		);

		// TODO: rel="alternate"
	});

	// Disabled
	it('test_should_return_304_for_request_with_etag', async function () {
		this.skip();
		let response = await API.get(`users/${config.userID}/publications/items`);
		Helpers.assert200(response);
		let etag = response.headers.etag[0];
		Helpers.assertNotNull(etag);

		response = await API.get(
			`users/${config.userID}/publications/items`,
			{
				"If-None-Match": etag
			}
		);
		Helpers.assert304(response);
		assert.equal(etag, response.headers.etag[0]);
	});

	it('test_should_show_publications_urls_in_json_response_for_single_object_request', async function () {
		await API.useAPIKey(config.apiKey);
		const itemKey = await API.createItem("book", { inPublications: true }, this, 'key');

		const response = await API.get(`users/${config.userID}/publications/items/${itemKey}`);
		const json = await API.getJSONFromResponse(response);

		// rel="self"
		Helpers.assertRegExp(
			`https?://[^/]+/users/${config.userID}/publications/items/${itemKey}`,
			json.links.self.href
		);
	});

	it('test_should_return_no_atom_results_for_empty_publications_list', async function () {
		let response = await API.get(`users/${config.userID}/publications/items?format=atom`);
		Helpers.assert200(response);
		Helpers.assertNoResults(response);
		assert.isNumber(parseInt(response.headers['last-modified-version'][0]));
	});

	it('test_shouldnt_include_hidden_child_items_in_numChildren', async function () {
		API.useAPIKey(config.apiKey);
		const parentItemKey = await API.createItem('book', { inPublications: true }, this, 'key');

		const json1 = await API.getItemTemplate('attachment&linkMode=imported_file');
		json1.title = 'A';
		json1.parentItem = parentItemKey;
		json1.inPublications = true;

		const json2 = await API.getItemTemplate('note');
		json2.note = 'B';
		json2.parentItem = parentItemKey;
		json2.inPublications = true;

		const json3 = await API.getItemTemplate('attachment&linkMode=imported_file');
		json3.title = 'C';
		json3.parentItem = parentItemKey;

		const json4 = await API.getItemTemplate('note');
		json4.note = 'D';
		json4.parentItem = parentItemKey;
		json4.inPublications = true;
		json4.deleted = true;

		const json5 = await API.getItemTemplate('attachment&linkMode=imported_file');
		json5.title = 'E';
		json5.parentItem = parentItemKey;
		json5.deleted = true;

		let response = await API.userPost(config.userID, 'items', JSON.stringify([json1, json2, json3, json4, json5]));
		Helpers.assert200(response);

		API.useAPIKey('');

		response = await API.userGet(config.userID, `publications/items/${parentItemKey}`);
		Helpers.assert200(response);
		const json = API.getJSONFromResponse(response);
		assert.equal(2, json.meta.numChildren);

		response = await API.userGet(config.userID, `publications/items/${parentItemKey}/children`);

		response = await API.userGet(config.userID, `publications/items/${parentItemKey}?format=atom`);
		Helpers.assert200(response);
		const xml = API.getXMLFromResponse(response);
		assert.equal(2, parseInt(Helpers.xpathEval(xml, '/atom:entry/zapi:numChildren')));
	});

	it('testLinkedFileAttachment', async function () {
		let json = await API.getItemTemplate("book");
		json.inPublications = true;
		API.useAPIKey(config.apiKey);
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json])
		);
		Helpers.assert200(response);
		json = API.getJSONFromResponse(response);
		let itemKey = json.successful[0].key;

		json = await API.getItemTemplate("attachment&linkMode=linked_file");
		json.inPublications = true;
		json.parentItem = itemKey;
		await API.useAPIKey(config.apiKey);
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, { message: "Linked-file attachments cannot be added to My Publications" });
	});

	it('testTopLevelAttachmentAndNote', async function () {
		let msg = "Top-level notes and attachments cannot be added to My Publications";

		// Attachment
		API.useAPIKey(config.apiKey);
		let json = await API.getItemTemplate("attachment&linkMode=imported_file");
		json.inPublications = true;
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, msg, 0);

		// Note
		API.useAPIKey(config.apiKey);
		json = await API.getItemTemplate("note");
		json.inPublications = true;
		response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, msg, 0);
	});

	it('test_shouldnt_allow_inPublications_in_group_library', async function () {
		API.useAPIKey(config.apiKey);
		let json = await API.getItemTemplate("book");
		json.inPublications = true;
		const response = await API.groupPost(config.ownedPrivateGroupID, "items", JSON.stringify([json]), { "Content-Type": "application/json" });
		Helpers.assert400ForObject(response, { message: "Group items cannot be added to My Publications" });
	});

	it('test_should_show_item_for_anonymous_single_object_request', async function () {
		// Create item
		API.useAPIKey(config.apiKey);
		const itemKey = await API.createItem('book', { inPublications: true }, this, 'key');

		// Read item anonymously
		API.useAPIKey('');

		// JSON
		let response = await API.userGet(config.userID, `publications/items/${itemKey}`);
		Helpers.assert200(response);
		let json = await API.getJSONFromResponse(response);
		assert.equal(config.displayName, json.library.name);
		assert.equal('user', json.library.type);

		// Atom
		response = await API.userGet(config.userID, `publications/items/${itemKey}?format=atom`);
		Helpers.assert200(response);
		const xml = API.getXMLFromResponse(response);
		const author = xml.getElementsByTagName("author")[0];
		const name = author.getElementsByTagName("name")[0];
		assert.equal(config.displayName, name.innerHTML);
	});

	it('test_should_remove_inPublications_on_POST_with_false', async function () {
		API.useAPIKey(config.apiKey);
		let json = await API.getItemTemplate('book');
		json.inPublications = true;
		let response = await API.userPost(config.userID, 'items', JSON.stringify([json]));
		Helpers.assert200(response);
		let key = API.getJSONFromResponse(response).successful[0].key;
		let version = response.headers['last-modified-version'][0];
		json = {
			key,
			version,
			title: 'Test',
			inPublications: false,
		};
		response = await API.userPost(config.userID, 'items', JSON.stringify([json]), {
			'Content-Type': 'application/json',
		});
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		assert.notProperty(json.successful[0].data, 'inPublications');
	});

	it('test_should_return_404_for_anonymous_request_for_item_not_in_publications', async function () {
		API.useAPIKey(config.apiKey);
		const key = await API.createItem("book", [], this, 'key');
		API.useAPIKey();
		const response = await API.get("users/" + config.userID + "/publications/items/" + key, { "Content-Type": "application/json" });
		Helpers.assert404(response);
	});

	it('test_should_return_no_results_for_empty_publications_list_with_key', async function () {
		API.useAPIKey(config.apiKey);
		let response = await API.get(`users/${config.userID}/publications/items`);
		Helpers.assert200(response);
		Helpers.assertNoResults(response);
		assert.isNumber(parseInt(response.headers['last-modified-version'][0]));
	});

	it('test_should_show_item_for_anonymous_multi_object_request', async function () {
		// Create item
		API.useAPIKey(config.apiKey);
		let itemKey = await API.createItem('book', { inPublications: true }, this, 'key');

		// Read item anonymously
		API.useAPIKey('');

		// JSON
		let response = await API.userGet(config.userID, 'publications/items');
		Helpers.assert200(response);
		let json = await API.getJSONFromResponse(response);
		assert.include(json.map(item => item.key), itemKey);

		// Atom
		response = await API.userGet(config.userID, 'publications/items?format=atom');
		Helpers.assert200(response);
		let xml = await API.getXMLFromResponse(response);
		let xpath = Helpers.xpathEval(xml, '//atom:entry/zapi:key');
		assert.include(xpath, itemKey);
	});

	it('test_should_show_publications_urls_in_atom_response_for_multi_object_request', async function () {
		let response = await API.get(`users/${config.userID}/publications/items?format=atom`);
		let xml = await API.getXMLFromResponse(response);

		// id
		let id = Helpers.xpathEval(xml, '//atom:id');
		Helpers.assertRegExp(`http://[^/]+/users/${config.userID}/publications/items`, id);

		let link = Helpers.xpathEval(xml, '//atom:link[@rel="self"]', true, false);
		let href = link.getAttribute('href');
		Helpers.assertRegExp(`https?://[^/]+/users/${config.userID}/publications/items\\?format=atom`, href);

		// rel="first"
		link = Helpers.xpathEval(xml, '//atom:link[@rel="first"]', true, false);
		href = link.getAttribute('href');
		Helpers.assertRegExp(`https?://[^/]+/users/${config.userID}/publications/items\\?format=atom`, href);

		// TODO: rel="alternate" (what should this be?)
	});

	it('test_should_return_200_for_deleted_request', async function () {
		let response = await API.get(`users/${config.userID}/publications/deleted?since=0`, { 'Content-Type': 'application/json' });
		Helpers.assert200(response);
	});

	// Disabled until after integrated My Publications upgrade
	it('test_should_return_404_for_settings_request', async function () {
		this.skip();
		let response = await API.get(`users/${config.userID}/publications/settings`);
		Helpers.assert404(response);
	});

	it('test_should_return_404_for_authenticated_request_for_item_not_in_publications', async function () {
		API.useAPIKey(config.apiKey);
		let key = await API.createItem("book", [], this, 'key');
		let response = await API.get("users/" + config.userID + "/publications/items/" + key, { "Content-Type": "application/json" });
		Helpers.assert404(response);
	});

	it('test_shouldnt_show_trashed_item', async function () {
		API.useAPIKey(config.apiKey);
		const itemKey = await API.createItem("book", { inPublications: true, deleted: true }, this, 'key');

		const response = await API.userGet(
			config.userID,
			"publications/items/" + itemKey
		);
		Helpers.assert404(response);
	});

	it('test_should_return_400_for_settings_request_with_items', async function () {
		API.useAPIKey(config.apiKey);
		let response = await API.createItem("book", { inPublications: true }, this, 'response');
		Helpers.assert200ForObject(response);

		response = await API.get(`users/${config.userID}/publications/settings`);
		assert.equal(response.status, 400);
	});

	// Disabled until after integrated My Publications upgrade
	it('test_should_return_404_for_deleted_request', async function () {
		this.skip();
		let response = await API.get(`users/${config.userID}/publications/deleted?since=0`);
		Helpers.assert404(response);
	});

	it('test_should_return_no_results_for_empty_publications_list', async function () {
		let response = await API.get(`users/${config.userID}/publications/items`);
		Helpers.assert200(response);
		Helpers.assertNoResults(response);
		assert.isNumber(parseInt(response.headers['last-modified-version'][0]));
	});

	it('test_shouldnt_show_restricted_properties', async function () {
		API.useAPIKey(config.apiKey);
		let itemKey = await API.createItem('book', { inPublications: true }, this, 'key');

		// JSON
		let response = await API.userGet(config.userID, `publications/items/${itemKey}`);
		Helpers.assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.notProperty(json.data, 'inPublications');
		assert.notProperty(json.data, 'collections');
		assert.notProperty(json.data, 'relations');
		assert.notProperty(json.data, 'tags');
		assert.notProperty(json.data, 'dateAdded');
		assert.notProperty(json.data, 'dateModified');

		// Atom
		response = await API.userGet(config.userID, `publications/items/${itemKey}?format=atom&content=html,json`);
		Helpers.assert200(response);

		// HTML in Atom
		let html = await API.getContentFromAtomResponse(response, 'html');
		let doc = (new JSDOM(html.innerHTML)).window.document;
		let trs = Array.from(doc.getElementsByTagName("tr"));
		let publications = trs.filter(node => node.getAttribute("class") == "publication");
		assert.equal(publications.length, 0);

		// JSON in Atom
		let atomJson = await API.getContentFromAtomResponse(response, 'json');
		assert.notProperty(atomJson, 'inPublications');
		assert.notProperty(atomJson, 'collections');
		assert.notProperty(atomJson, 'relations');
		assert.notProperty(atomJson, 'tags');
		assert.notProperty(atomJson, 'dateAdded');
		assert.notProperty(atomJson, 'dateModified');
	});

	it('test_shouldnt_remove_inPublications_on_POST_without_property', async function () {
		await API.useAPIKey(config.apiKey);
		const json = await API.getItemTemplate('book');
		json.inPublications = true;
		const response = await API.userPost(config.userID, 'items', JSON.stringify([json]));

		Helpers.assert200(response);
		const key = API.getJSONFromResponse(response).successful[0].key;
		const version = response.headers['last-modified-version'][0];

		const newJson = {
			key: key,
			version: version,
			title: 'Test',
			inPublications: false
		};

		const newResponse = await API.userPost(
			config.userID,
			'items',
			JSON.stringify([newJson]),
			{ 'Content-Type': 'application/json' }
		);

		Helpers.assert200ForObject(newResponse);

		const newJsonResponse = API.getJSONFromResponse(newResponse);

		assert.notProperty(newJsonResponse.successful[0].data, 'inPublications');
	});

	it('test_should_return_404_for_searches_request', async function () {
		let response = await API.get(`users/${config.userID}/publications/searches`);
		Helpers.assert404(response);
	});

	it('test_shouldnt_show_child_items_in_top_mode', async function () {
		API.useAPIKey(config.apiKey);

		let parentItemKey = await API.createItem("book", { title: 'A', inPublications: true }, this, 'key');

		let json1 = await API.getItemTemplate("attachment&linkMode=imported_file");
		json1.title = 'B';
		json1.parentItem = parentItemKey;
		json1.inPublications = true;

		let json2 = await API.getItemTemplate("attachment&linkMode=imported_file");
		json2.title = 'C';
		json2.parentItem = parentItemKey;

		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json1, json2])
		);

		Helpers.assert200(response);
		API.useAPIKey("");

		response = await API.userGet(
			config.userID,
			"publications/items/top"
		);

		Helpers.assert200(response);
		let json = await API.getJSONFromResponse(response);

		assert.equal(json.length, 1);

		let titles = json.map(item => item.data.title);

		assert.include(titles, 'A');
	});

	it('test_shouldnt_show_child_item_not_in_publications_for_item_children_request', async function () {
		API.useAPIKey(config.apiKey);
		const parentItemKey = await API.createItem("book", { title: 'A', inPublications: true }, this, 'key');

		const json1 = await API.getItemTemplate("attachment&linkMode=imported_file");
		json1.title = 'B';
		json1.parentItem = parentItemKey;
		json1.inPublications = true;
		// Create hidden child attachment
		const json2 = await API.getItemTemplate("attachment&linkMode=imported_file");
		json2.title = 'C';
		json2.parentItem = parentItemKey;
		const response = await API.userPost(config.userID, "items", JSON.stringify([json1, json2]));
		Helpers.assert200(response);

		// Anonymous read
		API.useAPIKey("");

		const response2 = await API.userGet(config.userID, `publications/items/${parentItemKey}/children`);
		Helpers.assert200(response2);
		const json = API.getJSONFromResponse(response2);
		assert.equal(json.length, 1);
		const titles = json.map(item => item.data.title);
		assert.include(titles, 'B');
	});

	it('test_shouldnt_show_child_item_not_in_publications', async function () {
		API.useAPIKey(config.apiKey);
		const parentItemKey = await API.createItem('book', { title: 'A', inPublications: true }, this, 'key');

		const json1 = await API.getItemTemplate('attachment&linkMode=imported_file');
		json1.title = 'B';
		json1.parentItem = parentItemKey;
		json1.inPublications = true;
		const json2 = await API.getItemTemplate('attachment&linkMode=imported_file');
		json2.title = 'C';
		json2.parentItem = parentItemKey;
		const response = await API.userPost(config.userID, 'items', JSON.stringify([json1, json2]));
		Helpers.assert200(response);
		API.useAPIKey('');
		const readResponse = await API.userGet(config.userID, 'publications/items');
		Helpers.assert200(readResponse);
		const json = API.getJSONFromResponse(readResponse);
		Helpers.assertCount(2, json);
		const titles = json.map(item => item.data.title);
		assert.include(titles, 'A');
		assert.include(titles, 'B');
		assert.notInclude(titles, 'C');
	});

	it('test_should_return_200_for_settings_request_with_no_items', async function () {
		let response = await API.get(`users/${config.userID}/publications/settings`);
		Helpers.assert200(response);
		Helpers.assertNoResults(response);
	});

	it('test_should_return_403_for_anonymous_write', async function () {
		const json = await API.getItemTemplate("book");
		const response = await API.userPost(config.userID, "publications/items", JSON.stringify(json));
		Helpers.assert403(response);
	});

	it('test_should_return_405_for_authenticated_write', async function () {
		await API.useAPIKey(config.apiKey);
		const json = await API.getItemTemplate('book');
		const response = await API.userPost(config.userID, 'publications/items', JSON.stringify(json), { 'Content-Type': 'application/json' });
		Helpers.assert405(response);
	});

	it('test_shouldnt_show_trashed_item_in_versions_response', async function () {
		await API.useAPIKey(config.apiKey);
		let itemKey1 = await API.createItem("book", { inPublications: true }, this, 'key');
		let itemKey2 = await API.createItem("book", { inPublications: true, deleted: true }, this, 'key');

		let response = await API.userGet(
			config.userID,
			"publications/items?format=versions"
		);
		Helpers.assert200(response);
		let json = await API.getJSONFromResponse(response);
		assert.equal(json.hasOwnProperty(itemKey1), true);
		assert.equal(json.hasOwnProperty(itemKey2), false);

		// Shouldn't show with includeTrashed=1 here
		response = await API.userGet(
			config.userID,
			"publications/items?format=versions&includeTrashed=1"
		);
		Helpers.assert200(response);
		json = await API.getJSONFromResponse(response);
		assert.equal(json.hasOwnProperty(itemKey1), true);
		assert.equal(json.hasOwnProperty(itemKey2), false);
	});

	it('test_should_include_download_details', async function () {
		API.useAPIKey(config.apiKey);
		const file = "work/file";
		const fileContents = Helpers.getRandomUnicodeString();
		const contentType = "text/html";
		const charset = "utf-8";
		fs.writeFileSync(file, fileContents);
		const hash = Helpers.md5File(file);
		const filename = "test_" + fileContents;
		const mtime = parseInt(fs.statSync(file).mtimeMs);
		const size = fs.statSync(file).size;

		const parentItemKey = await API.createItem("book", { title: 'A', inPublications: true }, this, 'key');
		const json = await API.createAttachmentItem("imported_file", {
			parentItem: parentItemKey,
			inPublications: true,
			contentType: contentType,
			charset: charset
		}, false, this, 'jsonData');
		const key = json.key;
		const originalVersion = json.version;

		// Get upload authorization
		API.useAPIKey(config.apiKey);
		let response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			Helpers.implodeParams({
				md5: hash,
				mtime: mtime,
				filename: filename,
				filesize: size
			}),
			{
				'Content-Type': 'application/x-www-form-urlencoded',
				'If-None-Match': '*'
			}
		);
		Helpers.assert200(response);
		let jsonResponse = JSON.parse(response.data);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			jsonResponse.url,
			jsonResponse.prefix + fileContents + jsonResponse.suffix,
			{ 'Content-Type': jsonResponse.contentType }
		);
		Helpers.assert201(response);

		// Register upload
		response = await API.userPost(
			config.userID,
			`items/${key}/file`,
			`upload=${jsonResponse.uploadKey}`,
			{ 'Content-Type': 'application/x-www-form-urlencoded',
				'If-None-Match': '*' }
		);
		Helpers.assert204(response);
		const newVersion = response.headers['last-modified-version'][0];
		assert.isAbove(parseInt(newVersion), parseInt(originalVersion));

		// Anonymous read
		API.useAPIKey('');

		// Verify attachment item metadata (JSON)
		response = await API.userGet(
			config.userID,
			`publications/items/${key}`
		);
		const responseData = JSON.parse(response.data);
		const jsonData = responseData.data;
		assert.equal(hash, jsonData.md5);
		assert.equal(mtime, jsonData.mtime);
		assert.equal(filename, jsonData.filename);
		assert.equal(contentType, jsonData.contentType);
		assert.equal(charset, jsonData.charset);

		// Verify download details (JSON)
		Helpers.assertRegExp(
			`https?://[^/]+/users/${config.userID}/publications/items/${key}/file/view`,
			responseData.links.enclosure.href
		);

		// Verify attachment item metadata (Atom)
		response = await API.userGet(
			config.userID,
			`publications/items/${key}?format=atom`
		);
		const xml = API.getXMLFromResponse(response);
		const hrefComp = Helpers.xpathEval(xml, '//atom:entry/atom:link[@rel="enclosure"]', true, false);
		const href = hrefComp.getAttribute('href');
		// Verify download details (JSON)
		Helpers.assertRegExp(
			`https?://[^/]+/users/${config.userID}/publications/items/${key}/file/view`,
			href
		);

		// Check access to file
		const r = `https?://[^/]+/(users/${config.userID}/publications/items/${key}/file/view)`;
		const exp = new RegExp(r);
		const matches = href.match(exp);
		const fileURL = matches[1];
		response = await API.get(fileURL);
		Helpers.assert302(response);

		// Remove item from My Publications
		API.useAPIKey(config.apiKey);

		responseData.data.inPublications = false;
		response = await API.userPost(
			config.userID,
			'items',
			JSON.stringify([responseData]),
			{
				'Content-Type': 'application/json'
				
			}
		);
		Helpers.assert200ForObject(response);

		// No more access via publications URL
		API.useAPIKey();
		response = await API.get(fileURL);
		Helpers.assert404(response);
	});
});
