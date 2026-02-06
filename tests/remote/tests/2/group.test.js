/**
 * Group tests for API v2
 * Port of tests/remote/tests/API/2/GroupTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { xpathSelect } from '../../xpath.js';
import { API } from '../../api2.js';
import {
	assert200
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Groups (API v2)', function () {
	this.timeout(60000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testUpdateMetadata
	it('should update metadata', async function () {
		let response = await API.userGet(
			config.get('userID'),
			`groups?fq=GroupType:PublicOpen&content=json&key=${config.get('apiKey')}`
		);
		assert200(response);

		// Get group API URI and ETag
		let xml = API.getXMLFromResponse(response);
		let groupIDNode = xpathSelect(xml, '//atom:entry/zapi:groupID/text()', true);
		let groupID = parseInt(groupIDNode.nodeValue);

		let urlNode = xpathSelect(xml, '//atom:entry/atom:link[@rel="self"]/@href', true);
		let url = urlNode.value;
		url = url.replace(config.get('apiURLPrefix'), '');

		let etagNode = xpathSelect(xml, '//atom:entry/atom:content/@etag', true);
		let etag = etagNode.value;

		// Make sure format=etags returns the same ETag
		response = await API.userGet(
			config.get('userID'),
			`groups?format=etags&key=${config.get('apiKey')}`
		);
		assert200(response);
		let etagsJSON = API.getJSONFromResponse(response);
		assert.equal(etagsJSON[groupID], etag);

		// Update group metadata
		let contentNode = xpathSelect(xml, '//atom:entry/atom:content/text()', true);
		let contentJSON = JSON.parse(contentNode.nodeValue);

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
				case 'url':
					// Will be set in XML body
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

		response = await API.put(
			url,
			groupXml,
			['Content-Type: text/xml'],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert200(response);

		let responseXML = API.getXMLFromResponse(response);
		let group = xpathSelect(responseXML, '//atom:entry/atom:content/zxfer:group');
		assert.equal(group.length, 1);
		assert.equal(group[0].getAttribute('name'), name);

		response = await API.userGet(
			config.get('userID'),
			`groups?format=etags&key=${config.get('apiKey')}`
		);
		assert200(response);
		etagsJSON = API.getJSONFromResponse(response);
		let newETag = etagsJSON[groupID];
		assert.notEqual(etag, newETag);

		// Check ETag header on individual group request
		response = await API.groupGet(
			groupID,
			`?content=json&key=${config.get('apiKey')}`
		);
		assert200(response);
		assert.equal(response.getHeader('ETag'), newETag);
		let contentData = JSON.parse(API.getContentFromResponse(response));
		assert.equal(contentData.name, name);
		assert.equal(contentData.description, description);
		assert.equal(contentData.url, urlField);
	});
});
