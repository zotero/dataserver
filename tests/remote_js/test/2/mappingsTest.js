const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('MappingsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API2Setup();
	});

	after(async function () {
		await API2WrapUp();
	});

	it('testNewItem', async function () {
		let response = await API.get("items/new?itemType=invalidItemType");
		Helpers.assertStatusCode(response, 400);
		
		response = await API.get("items/new?itemType=book");
		Helpers.assertStatusCode(response, 200);
		assert.equal(response.headers['content-type'][0], 'application/json');
		const json = JSON.parse(response.data);
		assert.equal(json.itemType, 'book');
	});

	it('testNewItemAttachment', async function () {
		let response = await API.get('items/new?itemType=attachment');
		Helpers.assertStatusCode(response, 400);
	
		response = await API.get('items/new?itemType=attachment&linkMode=invalidLinkMode');
		Helpers.assertStatusCode(response, 400);
	
		response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		Helpers.assertStatusCode(response, 200);
		const json1 = JSON.parse(response.data);
		assert.isNotNull(json1);
		assert.property(json1, 'url');
	
		response = await API.get('items/new?itemType=attachment&linkMode=linked_file');
		Helpers.assertStatusCode(response, 200);
		const json2 = JSON.parse(response.data);
		assert.isNotNull(json2);
		assert.notProperty(json2, 'url');
	});

	it('testComputerProgramVersion', async function () {
		let response = await API.get("items/new?itemType=computerProgram");
		Helpers.assertStatusCode(response, 200);
		let json = JSON.parse(response.data);
		assert.property(json, 'version');
		assert.notProperty(json, 'versionNumber');
			
		response = await API.get("itemTypeFields?itemType=computerProgram");
		Helpers.assertStatusCode(response, 200);
		json = JSON.parse(response.data);
		let fields = json.map(val => val.field);
		assert.include(fields, 'version');
		assert.notInclude(fields, 'versionNumber');
	});
});