const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Before, API3After } = require("../shared.js");

describe('MappingsTests', function () {
	this.timeout(config.timeout);

	before(async function () {
		await API3Before();
	});

	after(async function () {
		await API3After();
	});

	it('testLocale', async function () {
		let response = await API.get("itemTypes?locale=fr-FR");
		Helpers.assert200(response);
		let json = JSON.parse(response.data);
		let o;
		for (let i = 0; i < json.length; i++) {
			if (json[i].itemType == 'book') {
				o = json[i];
				break;
			}
		}
		Helpers.assertEquals('Livre', o.localized);
	});

	it('test_should_return_fields_for_note_annotations', async function () {
		let response = await API.get("items/new?itemType=annotation&annotationType=highlight");
		let json = API.getJSONFromResponse(response);
		assert.property(json, 'annotationText');
		Helpers.assertEquals(json.annotationText, '');
	});

	it('test_should_reject_unknown_annotation_type', async function () {
		let response = await API.get("items/new?itemType=annotation&annotationType=foo", { "Content-Type": "application/json" });
		Helpers.assert400(response);
	});

	it('testNewItem', async function () {
		let response = await API.get("items/new?itemType=invalidItemType");
		Helpers.assert400(response);

		response = await API.get("items/new?itemType=book");
		Helpers.assert200(response);
		Helpers.assertContentType(response, 'application/json');
		let json = JSON.parse(response.data);
		Helpers.assertEquals('book', json.itemType);
	});

	it('testComputerProgramVersion', async function () {
		let response = await API.get("items/new?itemType=computerProgram");
		Helpers.assert200(response);
		let json = JSON.parse(response.data);

		assert.property(json, 'versionNumber');
		assert.notProperty(json, 'version');

		response = await API.get("itemTypeFields?itemType=computerProgram");
		Helpers.assert200(response);
		json = JSON.parse(response.data);

		let fields = json.map((val) => {
			return val.field;
		});

		assert.include(fields, 'versionNumber');
		assert.notInclude(fields, 'version');
	});

	it('test_should_return_fields_for_highlight_annotations', async function () {
		const response = await API.get("items/new?itemType=annotation&annotationType=highlight");
		const json = API.getJSONFromResponse(response);
		assert.property(json, 'annotationText');
		assert.equal(json.annotationText, '');
	});

	it('test_should_return_fields_for_all_annotation_types', async function () {
		for (let type of ['highlight', 'note', 'image']) {
			const response = await API.get(`items/new?itemType=annotation&annotationType=${type}`);
			const json = API.getJSONFromResponse(response);

			assert.property(json, 'annotationComment');
			Helpers.assertEquals('', json.annotationComment);
			Helpers.assertEquals('', json.annotationColor);
			Helpers.assertEquals('', json.annotationPageLabel);
			Helpers.assertEquals('00000|000000|00000', json.annotationSortIndex);
			assert.property(json, 'annotationPosition');
			Helpers.assertEquals(0, json.annotationPosition.pageIndex);
			assert.isArray(json.annotationPosition.rects);
			assert.notProperty(json, 'collections');
			assert.notProperty(json, 'relations');
		}
	});

	it('test_should_reject_missing_annotation_type', async function () {
		let response = await API.get("items/new?itemType=annotation");
		Helpers.assert400(response);
	});

	it('test_should_return_attachment_fields', async function () {
		let response = await API.get("items/new?itemType=attachment&linkMode=linked_url");
		let json = JSON.parse(response.data);
		assert.equal(json.url, '');
		assert.notProperty(json, 'filename');
		assert.notProperty(json, 'path');

		response = await API.get("items/new?itemType=attachment&linkMode=linked_file");
		json = JSON.parse(response.data);
		assert.equal(json.path, '');
		assert.notProperty(json, 'filename');
		assert.notProperty(json, 'url');

		response = await API.get("items/new?itemType=attachment&linkMode=imported_url");
		json = JSON.parse(response.data);
		assert.equal(json.filename, '');
		assert.equal(json.url, '');
		assert.notProperty(json, 'path');

		response = await API.get("items/new?itemType=attachment&linkMode=imported_file");
		json = JSON.parse(response.data);
		assert.equal(json.filename, '');
		assert.notProperty(json, 'path');
		assert.notProperty(json, 'url');

		response = await API.get("items/new?itemType=attachment&linkMode=embedded_image");
		json = JSON.parse(response.data);
		assert.notProperty(json, 'title');
		assert.notProperty(json, 'url');
		assert.notProperty(json, 'accessDate');
		assert.notProperty(json, 'tags');
		assert.notProperty(json, 'collections');
		assert.notProperty(json, 'relations');
		assert.notProperty(json, 'note');
		assert.notProperty(json, 'charset');
		assert.notProperty(json, 'path');
	});

	it('test_should_return_fields_for_image_annotations', async function () {
		let response = await API.get('items/new?itemType=annotation&annotationType=image');
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals(0, json.annotationPosition.width);
		Helpers.assertEquals(0, json.annotationPosition.height);
	});

	it('test_should_return_a_note_template', async function () {
		let response = await API.get("items/new?itemType=note");
		Helpers.assert200(response);
		Helpers.assertContentType(response, 'application/json');
		let json = API.getJSONFromResponse(response);
		Helpers.assertEquals('note', json.itemType);
		assert.property(json, 'note');
	});
});
