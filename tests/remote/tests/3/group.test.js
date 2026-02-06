/**
 * Group API tests
 * Port of tests/remote/tests/API/3/GroupTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { xpathSelect } from '../../xpath.js';
import { API } from '../../api3.js';
import {
	assert200,
	assert404,
	assertNumResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Groups', function () {
	this.timeout(60000);

	beforeEach(async function () {
		await setup();
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	/**
	 * Changing a group's metadata should change its version
	 */
	// PHP: testUpdateMetadataJSON
	it('should update metadata in JSON format', async function () {
		let response = await API.userGet(
			config.get('userID'),
			'groups?fq=GroupType:PublicOpen'
		);
		assert200(response);

		// Get group API URI and version
		let json = API.getJSONFromResponse(response)[0];
		let groupID = json.id;
		let url = json.links.self.href;
		url = url.replace(config.get('apiURLPrefix'), '');
		let version = json.version;

		// Make sure format=versions returns the same version
		response = await API.userGet(
			config.get('userID'),
			`groups?format=versions&key=${config.get('apiKey')}`
		);
		assert200(response);
		let versionsJSON = API.getJSONFromResponse(response);
		assert.equal(versionsJSON[groupID], version);

		// Update group metadata
		let name = 'My Test Group ' + Date.now();
		let description = 'This is a test description ' + Date.now();
		let urlField = 'http://example.com/' + Date.now();

		let xml = '<group';
		for (let key in json.data) {
			switch (key) {
				case 'id':
				case 'version':
				case 'members':
					continue;

				case 'name':
					xml += ` name="${name}"`;
					break;

				case 'description':
					// Skip for now - will be set in XML body
					break;

				case 'url':
					// Skip for now - will be set in XML body
					break;

				default:
					if (typeof json.data[key] === 'string') {
						xml += ` ${key}="${json.data[key]}"`;
					}
					else {
						xml += ` ${key}="${json.data[key]}"`;
					}
			}
		}
		xml += `><description>${description}</description>`;
		xml += `<url>${urlField}</url>`;
		xml += '</group>';

		response = await API.superPut(
			url,
			xml,
			['Content-Type: text/xml']
		);
		assert200(response);

		let responseXML = API.getXMLFromResponse(response);
		let group = xpathSelect(responseXML, '//atom:entry/atom:content/zxfer:group');
		assert.equal(group.length, 1);
		assert.equal(group[0].getAttribute('name'), name);

		response = await API.userGet(
			config.get('userID'),
			`groups?format=versions&key=${config.get('apiKey')}`
		);
		assert200(response);
		versionsJSON = API.getJSONFromResponse(response);
		let newVersion = versionsJSON[groupID];
		assert.notEqual(version, newVersion);

		// Check version header on individual group request
		response = await API.groupGet(groupID, '');
		assert200(response);
		assert.equal(response.getHeader('Last-Modified-Version'), newVersion);
		json = API.getJSONFromResponse(response).data;
		assert.equal(json.name, name);
		assert.equal(json.description, description);
		assert.equal(json.url, urlField);
	});

	/**
	 * Changing a group's metadata should change its version
	 */
	// PHP: testUpdateMetadataAtom
	it('should update metadata in Atom format', async function () {
		let response = await API.userGet(
			config.get('userID'),
			`groups?fq=GroupType:PublicOpen&content=json&key=${config.get('apiKey')}`
		);
		assert200(response);

		// Get group API URI and version
		let xml = API.getXMLFromResponse(response);
		let groupID = parseInt(xpathSelect(xml, '//atom:entry/zapi:groupID')[0].textContent);
		let url = xpathSelect(xml, '//atom:entry/atom:link[@rel="self"]/@href')[0].value;
		url = url.replace(config.get('apiURLPrefix'), '');
		let content = xpathSelect(xml, '//atom:entry/atom:content')[0].textContent;
		let contentJSON = JSON.parse(content);
		let version = contentJSON.version;

		// Make sure format=versions returns the same version
		response = await API.userGet(
			config.get('userID'),
			`groups?format=versions&key=${config.get('apiKey')}`
		);
		assert200(response);
		let versionsJSON = API.getJSONFromResponse(response);
		assert.equal(versionsJSON[groupID], version);

		// Update group metadata
		let name = 'My Test Group ' + Date.now();
		let description = 'This is a test description ' + Date.now();
		let urlField = 'http://example.com/' + Date.now();

		let groupXml = '<group';
		for (let key in contentJSON) {
			switch (key) {
				case 'id':
				case 'members':
					continue;

				case 'name':
					groupXml += ` name="${name}"`;
					break;

				case 'description':
					// Skip for now - will be set in XML body
					break;

				case 'url':
					// Skip for now - will be set in XML body
					break;

				default:
					if (typeof contentJSON[key] === 'string') {
						groupXml += ` ${key}="${contentJSON[key]}"`;
					}
					else {
						groupXml += ` ${key}="${contentJSON[key]}"`;
					}
			}
		}
		groupXml += `><description>${description}</description>`;
		groupXml += `<url>${urlField}</url>`;
		groupXml += '</group>';

		response = await API.superPut(
			url,
			groupXml,
			['Content-Type: text/xml']
		);
		assert200(response);

		let responseXML = API.getXMLFromResponse(response);
		let group = xpathSelect(responseXML, '//atom:entry/atom:content/zxfer:group');
		assert.equal(group.length, 1);
		assert.equal(group[0].getAttribute('name'), name);

		response = await API.userGet(
			config.get('userID'),
			`groups?format=versions&key=${config.get('apiKey')}`
		);
		assert200(response);
		versionsJSON = API.getJSONFromResponse(response);
		let newVersion = versionsJSON[groupID];
		assert.notEqual(version, newVersion);

		// Check version header on individual group request
		response = await API.groupGet(
			groupID,
			`?content=json&key=${config.get('apiKey')}`
		);
		assert200(response);
		assert.equal(response.getHeader('Last-Modified-Version'), newVersion);
		let contentData = JSON.parse(API.getContentFromResponse(response));
		assert.equal(contentData.name, name);
		assert.equal(contentData.description, description);
		assert.equal(contentData.url, urlField);
	});

	// PHP: testUpdateMemberJSON
	it('should update group version when member is added', async function () {
		let groupID = await API.createGroup({
			owner: config.get('userID'),
			type: 'Private',
			libraryReading: 'all'
		});

		// Get group version
		let response = await API.userGet(
			config.get('userID'),
			`groups?format=versions&key=${config.get('apiKey')}`
		);
		assert200(response);
		let versionsJSON = API.getJSONFromResponse(response);
		let version = versionsJSON[groupID];

		response = await API.superPost(
			`groups/${groupID}/users`,
			`<user id="${config.get('userID2')}" role="member"/>`,
			['Content-Type: text/xml']
		);
		assert200(response);

		// Group metadata version should have changed
		response = await API.userGet(
			config.get('userID'),
			`groups?format=versions&key=${config.get('apiKey')}`
		);
		assert200(response);
		versionsJSON = API.getJSONFromResponse(response);
		let newVersion = versionsJSON[groupID];
		assert.notEqual(version, newVersion);

		// Check version header on individual group request
		response = await API.groupGet(groupID, '');
		assert200(response);
		assert.equal(response.getHeader('Last-Modified-Version'), newVersion);

		await API.deleteGroup(groupID);
	});

	// PHP: test_group_should_not_appear_in_search_until_first_populated
	it("shouldn't appear in search until first populated", async function () {
		let name = 'TestGroup' + Date.now() + Math.random().toString(36).substr(2, 9);
		let groupID = await API.createGroup({
			owner: config.get('userID'),
			type: 'PublicClosed',
			name: name,
			libraryReading: 'all'
		});

		// Group shouldn't show up if it's never had items
		let response = await API.superGet(`groups?q=${name}`);
		assertNumResults(response, 0);

		await API.groupCreateItem(groupID, 'book', {}, 'key');

		response = await API.superGet(`groups?q=${name}`);
		assertNumResults(response, 1);

		await API.deleteGroup(groupID);
	});

	// PHP: testDeleteGroup
	it('should delete group with items', async function () {
		let groupID = await API.createGroup({
			owner: config.get('userID'),
			type: 'Private',
			libraryReading: 'all'
		});
		await API.groupCreateItem(groupID, 'book', {}, 'key');
		await API.groupCreateItem(groupID, 'book', {}, 'key');
		await API.groupCreateItem(groupID, 'book', {}, 'key');
		await API.deleteGroup(groupID);

		let response = await API.groupGet(groupID, '');
		assert404(response);
	});
});
