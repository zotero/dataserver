/**
 * Publications API tests
 * Port of tests/remote/tests/API/3/PublicationsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import HTTP from '../../http.js';
import {
	assert200,
	assert201,
	assert204,
	assert302,
	assert400,
	assert400ForObject,
	assert403,
	assert404,
	assert405,
	assert200ForObject,
	assertNumResults,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { getS3Client } from '../../s3-helper.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { xpathSelect } from '../../xpath.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

describe('My Publications', function() {
	this.timeout(120000);

	let workDir = path.join(process.cwd(), 'work');
	let toDelete = [];

	// Helper functions
	function getRandomUnicodeString() {
		let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let length = 10 + Math.floor(Math.random() * 11);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return "Âéìøü 这是一个测试。 " + result;
	}

	function implodeParams(params, exclude = []) {
		let parts = [];
		for (let [key, val] of Object.entries(params)) {
			if (exclude.includes(key)) continue;
			parts.push(`${key}=${encodeURIComponent(val)}`);
		}
		return parts.join('&');
	}

	beforeEach(async function() {
		await setup();
		await API.userClear(config.get('userID'));
		// Default to anonymous requests
		API.useAPIKey('');
	});

	after(async function() {
		let s3Client = getS3Client();

		if (!s3Client || !config.has('s3Bucket') || toDelete.length === 0) {
			return;
		}

		// Clean up S3 files
		for (let hash of toDelete) {
			try {
				await s3Client.send(new DeleteObjectCommand({
					Bucket: config.get('s3Bucket'),
					Key: hash
				}));
			} catch (err) {
				// Ignore cleanup errors
			}
		}
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: test_should_return_no_results_for_empty_publications_list
	it('should return no results for empty publications list', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		assertNumResults(response, 0);
		assertTotalResults(response, 0);
	});

	// PHP: test_should_return_no_results_for_empty_publications_list_with_key
	it('should return no results for empty publications list with key', async function() {
		API.useAPIKey(config.get('apiKey'));
		let response = await API.userGet(
			config.get('userID'),
			'publications/items'
		);
		assert200(response);
		assertNumResults(response, 0);
		assertTotalResults(response, 0);
	});

	// PHP: test_should_return_no_atom_results_for_empty_publications_list
	it('should return no atom results for empty publications list', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/items?format=atom`);
		assert200(response);
		assertNumResults(response, 0);
		assertTotalResults(response, 0);
	});

	// PHP: test_should_return_200_for_settings_request_with_no_items
	it('should return 200 for settings request with no items', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/settings`);
		assert200(response);
	});

	// PHP: test_should_return_400_for_settings_request_with_items
	it('should return 400 for settings request with items', async function() {
		// Add item to publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'key');

		// Anonymous settings request should return 400 when there are items
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/settings`);
		assert400(response);
	});

	// PHP: test_should_return_200_for_deleted_request
	it('should return 200 for deleted request', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/deleted`);
		assert200(response);
	});

	// PHP: test_should_return_404_for_collections_request
	it('should return 404 for collections request', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/collections`);
		assert404(response);
	});

	// PHP: test_should_return_404_for_searches_request
	it('should return 404 for searches request', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/searches`);
		assert404(response);
	});

	// PHP: test_should_return_403_for_anonymous_write
	it('should return 403 for anonymous write', async function() {
		API.useAPIKey('');
		let json = await API.getItemTemplate('book');
		json.inPublications = true;

		let response = await API.userPost(
			config.get('userID'),
			'publications/items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert403(response);
	});

	// PHP: test_should_return_405_for_authenticated_write
	it('should return 405 for authenticated write', async function() {
		API.useAPIKey(config.get('apiKey'));
		let json = await API.getItemTemplate('book');
		json.inPublications = true;

		let response = await API.userPost(
			config.get('userID'),
			'publications/items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert405(response);
	});

	// PHP: test_should_return_404_for_anonymous_request_for_item_not_in_publications
	it('should return 404 for anonymous request for item not in publications', async function() {
		// Create item without inPublications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', { title: 'Test' }, 'key');

		// Anonymous request should return 404
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/${key}`);
		assert404(response);
	});

	// PHP: test_should_return_404_for_authenticated_request_for_item_not_in_publications
	it('should return 404 for authenticated request for item not in publications', async function() {
		// Create item without inPublications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', { title: 'Test' }, 'key');

		// Authenticated request should also return 404 for non-published items
		let response = await API.userGet(
			config.get('userID'),
			`publications/items/${key}`
		);
		assert404(response);
	});

	// PHP: test_should_show_item_for_anonymous_single_object_request
	it('should show item for anonymous single-object request', async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'key');

		// Anonymous request should succeed
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/${key}`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.data.title, 'Test');
		assert.equal(json.library.type, 'user');
	});

	// PHP: test_should_show_item_for_anonymous_multi_object_request
	it('should show item for anonymous multi-object request', async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'key');

		// Anonymous request should succeed
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		assertNumResults(response, 1);
		let json = API.getJSONFromResponse(response);
		assert.equal(json[0].data.title, 'Test');
		assert.equal(json[0].library.type, 'user');
	});

	// PHP: test_shouldnt_show_child_item_not_in_publications
	it("shouldn't show child item not in publications", async function() {
		// Create parent item in publications
		API.useAPIKey(config.get('apiKey'));
		let parentKey = await API.createItem('book', {
			title: 'Parent',
			inPublications: true
		}, 'key');

		// Create child note without inPublications
		let childKey = await API.createNoteItem('Child note', parentKey, 'key');

		// Anonymous request should only show parent
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		assertNumResults(response, 1);
	});

	// PHP: test_shouldnt_show_child_item_not_in_publications_for_item_children_request
	it("shouldn't show child item not in publications for item children request", async function() {
		// Create parent item in publications
		API.useAPIKey(config.get('apiKey'));
		let parentKey = await API.createItem('book', {
			title: 'Parent',
			inPublications: true
		}, 'key');

		// Create child note without inPublications
		let childKey = await API.createNoteItem('Child note', parentKey, 'key');

		// Anonymous request for children should return 0 results
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/${parentKey}/children`);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: test_shouldnt_include_hidden_child_items_in_numChildren
	it("shouldn't include hidden child items in numChildren", async function() {
		// Create parent item in publications
		API.useAPIKey(config.get('apiKey'));
		let parentKey = await API.createItem('book', {
			title: 'Parent',
			inPublications: true
		}, 'key');

		// Create child note without inPublications
		await API.createNoteItem('Child note', parentKey, 'key');

		// Anonymous request should show numChildren as 0
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/${parentKey}`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.equal(json.meta.numChildren, 0);
	});

	// PHP: test_shouldnt_show_child_items_in_top_mode
	it("shouldn't show child items in top mode", async function() {
		// Create parent item in publications
		API.useAPIKey(config.get('apiKey'));
		let parentKey = await API.createItem('book', {
			title: 'Parent',
			inPublications: true
		}, 'key');

		// Create child note in publications
		let childKey = await API.createNoteItem('Child note', parentKey, 'key');
		await API.userPatch(
			config.get('userID'),
			`items/${childKey}`,
			JSON.stringify({ inPublications: true })
		);

		// Anonymous request with top mode should only show parent
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/top`);
		assert200(response);
		assertNumResults(response, 1);
	});

	// PHP: test_shouldnt_show_trashed_item
	it("shouldn't show trashed item", async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true,
			deleted: true
		}, 'key');

		// Anonymous request should return 0 results
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: test_shouldnt_show_restricted_properties
	it("shouldn't show restricted properties", async function() {
		// Create item in publications with various properties
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true,
			collections: [],
			relations: {},
			tags: [{ tag: 'test' }]
		}, 'key');

		// Anonymous request should hide restricted properties
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/${key}`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.notProperty(json.data, 'collections');
		assert.notProperty(json.data, 'relations');
		assert.notProperty(json.data, 'tags');
		assert.equal(json.data.title, 'Test');
	});

	// PHP: test_shouldnt_show_trashed_item_in_versions_response
	it("shouldn't show trashed item in versions response", async function() {
		// Create trashed item in publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true,
			deleted: true
		}, 'key');

		// Anonymous request for versions should not include it
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items?format=versions`);
		assert200(response);
		let json = API.getJSONFromResponse(response);
		assert.deepEqual(json, {});
	});

	// PHP: test_should_show_publications_urls_in_json_response_for_single_object_request
	it('should show publications urls in json response for single object request', async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'key');

		// Check URLs
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items/${key}`);
		assert200(response);
		let json = API.getJSONFromResponse(response);

		// Self link should contain publications and the item key
		assert.include(json.links.self.href, '/publications/items/' + key);
		// Alternate link points to web interface, just check it exists
		assert.property(json.links, 'alternate');
	});

	// PHP: test_should_show_publications_urls_in_json_response_for_multi_object_request
	it('should show publications URLs in JSON response for multi-object request', async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let key = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'key');

		// Check URLs
		API.useAPIKey('');
		let response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		let json = API.getJSONFromResponse(response);

		// Self link should contain publications and the item key
		assert.include(json[0].links.self.href, '/publications/items/' + key);
		// Alternate link points to web interface, just check it exists
		assert.property(json[0].links, 'alternate');
	});

	// PHP: testTopLevelAttachmentAndNote
	it('should reject top level attachment and note in publications', async function() {
		let msg = 'Top-level notes and attachments cannot be added to My Publications';

		// Try to create attachment in publications
		API.useAPIKey(config.get('apiKey'));
		let json = await API.getItemTemplate('attachment&linkMode=imported_file');
		json.inPublications = true;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, msg);

		// Try to create note in publications
		json = await API.getItemTemplate('note');
		json.inPublications = true;
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, msg);
	});

	// PHP: testLinkedFileAttachment
	it('should reject linked file attachment', async function() {
		// Try to create linked file attachment in publications
		API.useAPIKey(config.get('apiKey'));
		let json = await API.getItemTemplate('attachment&linkMode=linked_file');
		json.inPublications = true;
		json.title = 'Test';
		json.path = '/path/to/file.pdf';

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		// Should fail - linked files can't be in publications (batch response)
		assert400ForObject(response, 'Top-level notes and attachments cannot be added to My Publications');
	});

	// PHP: test_should_remove_inPublications_on_POST_with_false
	it('should remove inPublications on POST with false', async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let json = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'jsonData');

		// Update with inPublications: false
		json.inPublications = false;
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);

		// Verify it's no longer in publications
		API.useAPIKey('');
		response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		assertNumResults(response, 0);
	});

	// PHP: test_shouldnt_remove_inPublications_on_POST_without_property
	it("shouldn't remove inPublications on POST without property", async function() {
		// Create item in publications
		API.useAPIKey(config.get('apiKey'));
		let json = await API.createItem('book', {
			title: 'Test',
			inPublications: true
		}, 'jsonData');

		// Update without inPublications property
		delete json.inPublications;
		json.title = 'Modified';
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200(response);

		// Verify it's still in publications
		API.useAPIKey('');
		response = await API.get(`users/${config.get('userID')}/publications/items`);
		assert200(response);
		assertNumResults(response, 1);
	});

	// PHP: test_shouldnt_allow_inPublications_in_group_library
	it("shouldn't allow inPublications in group library", async function() {
		API.useAPIKey(config.get('apiKey'));
		let json = await API.getItemTemplate('book');
		json.inPublications = true;

		let response = await API.groupPost(
			config.get('ownedPublicGroupID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "Group items cannot be added to My Publications");
	});

	// PHP: test_should_trigger_notification_on_publications_topic
	it('should trigger notification on publications topic', async function() {
		// Create item with inPublications
		API.useAPIKey(config.get('apiKey'));
		let response = await API.createItem('book', { inPublications: true }, 'response');
		let json = API.getJSONFromResponse(response);
		let version = json.successful[0].version;

		// Check notification header
		let notificationHeader = response.getHeader('zotero-debug-notifications');
		assert.isNotNull(notificationHeader, 'Expected notification header to be present');

		let notificationStrings = JSON.parse(Buffer.from(notificationHeader, 'base64').toString());
		let notifications = notificationStrings.map(s => JSON.parse(s));
		assert.equal(notifications.length, 2, 'Expected 2 notifications');

		// Check for regular library notification
		let libraryNotification = notifications.find(n =>
			n.event === 'topicUpdated' &&
			n.topic === `/users/${config.get('userID')}` &&
			n.version === version
		);
		assert.exists(libraryNotification, 'Expected library notification');

		// Check for publications notification
		let publicationsNotification = notifications.find(n =>
			n.event === 'topicUpdated' &&
			n.topic === `/users/${config.get('userID')}/publications`
		);
		assert.exists(publicationsNotification, 'Expected publications notification');
	});

	// PHP: test_should_include_download_details
	it('should include download details', async function() {
		let s3Client = getS3Client();
		if (!s3Client || !config.has('s3Bucket')) {
			throw new Error('S3 configuration is required for this test');
		}

		let file = path.join(workDir, 'file');
		let fileContents = getRandomUnicodeString();
		let contentType = 'text/html';
		let charset = 'utf-8';
		fs.writeFileSync(file, fileContents);
		let hash = crypto.createHash('md5').update(fileContents).digest('hex');
		let filename = `test_${fileContents}`;
		let stats = fs.statSync(file);
		let mtime = Math.round(stats.mtimeMs);
		let size = Buffer.byteLength(fileContents);

		// Create parent item and attachment in publications
		API.useAPIKey(config.get('apiKey'));
		let parentItemKey = await API.createItem('book', { title: 'A', inPublications: true }, 'key');
		let json = await API.createAttachmentItem('imported_file', {
			parentItem: parentItemKey,
			inPublications: true,
			contentType: contentType,
			charset: charset
		}, false, 'jsonData');
		let key = json.key;
		let originalVersion = json.version;

		// Get upload authorization
		let response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			implodeParams({ md5: hash, mtime: mtime, filename: filename, filesize: size }),
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert200(response);
		let authJSON = API.getJSONFromResponse(response);

		toDelete.push(hash);

		// Upload to S3
		response = await HTTP.post(
			authJSON.url,
			authJSON.prefix + fileContents + authJSON.suffix,
			[`Content-Type: ${authJSON.contentType}`]
		);
		assert201(response);

		// Register upload
		response = await API.userPost(
			config.get('userID'),
			`items/${key}/file`,
			`upload=${authJSON.uploadKey}`,
			['Content-Type: application/x-www-form-urlencoded', 'If-None-Match: *']
		);
		assert204(response);
		let newVersion = parseInt(response.getHeader('Last-Modified-Version'));
		assert.isAbove(newVersion, originalVersion);

		// Anonymous read
		API.useAPIKey('');

		// Verify attachment item metadata (JSON)
		response = await API.userGet(
			config.get('userID'),
			`publications/items/${key}`
		);
		json = API.getJSONFromResponse(response);
		let jsonData = json.data;
		assert.equal(jsonData.md5, hash);
		assert.equal(jsonData.mtime, mtime);
		assert.equal(jsonData.filename, filename);
		assert.equal(jsonData.contentType, contentType);
		assert.equal(jsonData.charset, charset);

		// Verify download details (JSON)
		assert.match(
			json.links.enclosure.href,
			new RegExp(`https?://[^/]+/users/${config.get('userID')}/publications/items/${key}/file/view`)
		);

		// Verify attachment item metadata (Atom)
		response = await API.userGet(
			config.get('userID'),
			`publications/items/${key}?format=atom`
		);
		let xml = API.getXMLFromResponse(response);
		let enclosureNode = xpathSelect(xml, '//atom:entry/atom:link[@rel="enclosure"]/@href', true);
		let href = enclosureNode ? enclosureNode.nodeValue : '';

		// Verify download details (Atom)
		assert.match(
			href,
			new RegExp(`https?://[^/]+/users/${config.get('userID')}/publications/items/${key}/file/view`)
		);

		// Check access to file
		let match = href.match(new RegExp(`https?://[^/]+/(users/${config.get('userID')}/publications/items/${key}/file/view)`));
		assert.exists(match, 'Expected file URL match');
		let fileURL = match[1];
		response = await API.get(fileURL);
		assert302(response);

		// Remove item from My Publications
		API.useAPIKey(config.get('apiKey'));
		json.data.inPublications = false;
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);

		// No more access via publications URL
		API.useAPIKey('');
		response = await API.get(fileURL);
		assert404(response);
	});

	// PHP: test_should_show_publications_urls_in_atom_response_for_single_object_request
	it('should show publications URLs in Atom response for single object request', async function() {
		API.useAPIKey(config.get('apiKey'));
		let itemKey = await API.createItem('book', { inPublications: true }, 'key');

		let response = await API.get(`users/${config.get('userID')}/publications/items/${itemKey}?format=atom`);
		let xml = API.getXMLFromResponse(response);
		// id
		let idNode = xpathSelect(xml, '//atom:id/text()', true);
		let id = idNode ? idNode.nodeValue : '';
		assert.match(
			id,
			new RegExp(`http://[^/]+/users/${config.get('userID')}/items/${itemKey}`)
		);

		// rel="self"
		let selfNode = xpathSelect(xml, '//atom:link[@rel="self"]/@href', true);
		let selfHref = selfNode ? selfNode.nodeValue : '';
		assert.match(
			selfHref,
			new RegExp(`https?://[^/]+/users/${config.get('userID')}/publications/items/${itemKey}\\?format=atom`)
		);
	});

	// PHP: test_should_show_publications_urls_in_atom_response_for_multi_object_request
	it('should show publications URLs in Atom response for multi-object request', async function() {
		let response = await API.get(`users/${config.get('userID')}/publications/items?format=atom`);
		let xml = API.getXMLFromResponse(response);
		// id
		let idNode = xpathSelect(xml, '//atom:id/text()', true);
		let id = idNode ? idNode.nodeValue : '';
		assert.match(
			id,
			new RegExp(`http://[^/]+/users/${config.get('userID')}/publications/items`)
		);

		// rel="self"
		let selfNode = xpathSelect(xml, '//atom:link[@rel="self"]/@href', true);
		let selfHref = selfNode ? selfNode.nodeValue : '';
		assert.match(
			selfHref,
			new RegExp(`https?://[^/]+/users/${config.get('userID')}/publications/items\\?format=atom`)
		);

		// rel="first"
		let firstNode = xpathSelect(xml, '//atom:link[@rel="first"]/@href', true);
		let firstHref = firstNode ? firstNode.nodeValue : '';
		assert.match(
			firstHref,
			new RegExp(`https?://[^/]+/users/${config.get('userID')}/publications/items\\?format=atom`)
		);
	});
});
