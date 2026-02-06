/**
 * Mappings tests for API v2
 * Port of tests/remote/tests/API/2/MappingsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200,
	assert400,
	assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Mappings (API v2)', function () {
	this.timeout(30000);

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
	});

	// PHP: testNewItem
	it('should return error for invalid item type and valid item for valid type', async function () {
		let response = await API.get('items/new?itemType=invalidItemType');
		assert400(response);

		response = await API.get('items/new?itemType=book');
		assert200(response);
		assertContentType(response, 'application/json');
		let json = JSON.parse(response.getBody());
		assert.equal(json.itemType, 'book');
	});

	// PHP: testNewItemAttachment
	it('should handle new item attachment templates', async function () {
		let response = await API.get('items/new?itemType=attachment');
		assert400(response);

		response = await API.get('items/new?itemType=attachment&linkMode=invalidLinkMode');
		assert400(response);

		response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		assert200(response);
		let json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.property(json, 'url');

		response = await API.get('items/new?itemType=attachment&linkMode=linked_file');
		assert200(response);
		json = JSON.parse(response.getBody());
		assert.isNotNull(json);
		assert.notProperty(json, 'url');
	});

	// PHP: testComputerProgramVersion
	it('should use "version" field for computerProgram', async function () {
		let response = await API.get('items/new?itemType=computerProgram');
		assert200(response);
		let json = JSON.parse(response.getBody());
		assert.property(json, 'version');
		assert.notProperty(json, 'versionNumber');

		response = await API.get('itemTypeFields?itemType=computerProgram');
		assert200(response);
		json = JSON.parse(response.getBody());
		let fields = json.map(val => val.field);
		assert.include(fields, 'version');
		assert.notInclude(fields, 'versionNumber');
	});
});
