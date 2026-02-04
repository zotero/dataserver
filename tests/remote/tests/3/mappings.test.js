/**
 * Mappings API tests
 * Port of tests/remote/tests/API/3/MappingsTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assert400,
	assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Mappings', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
	});

	// PHP: testNewItem
	it('should return item template', async function() {
		let response = await API.get('items/new?itemType=invalidItemType');
		assert400(response);

		response = await API.get('items/new?itemType=book');
		assert200(response);
		assertContentType(response, 'application/json');
		let json = JSON.parse(response.getBody());
		assert.equal(json.itemType, 'book');
	});

	// PHP: test_should_return_a_note_template
	it('should return a note template', async function() {
		let response = await API.get('items/new?itemType=note');
		assert200(response);
		assertContentType(response, 'application/json');
		let json = API.getJSONFromResponse(response);
		assert.equal(json.itemType, 'note');
		assert.property(json, 'note');
	});

	// PHP: test_should_return_attachment_fields
	it('should return attachment fields', async function() {
		let response = await API.get('items/new?itemType=attachment&linkMode=linked_url');
		let json = JSON.parse(response.getBody());
		assert.strictEqual(json.url, '');
		assert.notProperty(json, 'filename');
		assert.notProperty(json, 'path');

		response = await API.get('items/new?itemType=attachment&linkMode=linked_file');
		json = JSON.parse(response.getBody());
		assert.strictEqual(json.path, '');
		assert.notProperty(json, 'filename');
		assert.notProperty(json, 'url');

		response = await API.get('items/new?itemType=attachment&linkMode=imported_url');
		json = JSON.parse(response.getBody());
		assert.strictEqual(json.filename, '');
		assert.strictEqual(json.url, '');
		assert.notProperty(json, 'path');

		response = await API.get('items/new?itemType=attachment&linkMode=imported_file');
		json = JSON.parse(response.getBody());
		assert.strictEqual(json.filename, '');
		assert.notProperty(json, 'path');
		assert.notProperty(json, 'url');

		response = await API.get('items/new?itemType=attachment&linkMode=embedded_image');
		json = JSON.parse(response.getBody());
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

	// PHP: test_should_reject_missing_annotation_type
	it('should reject missing annotation type', async function() {
		let response = await API.get('items/new?itemType=annotation');
		assert400(response);
	});

	// PHP: test_should_reject_unknown_annotation_type
	it('should reject unknown annotation type', async function() {
		let response = await API.get('items/new?itemType=annotation&annotationType=foo');
		assert400(response);
	});

	// PHP: test_should_return_fields_for_all_annotation_types
	it('should return fields for all annotation types', async function() {
		for (let type of ['highlight', 'note', 'image']) {
			let response = await API.get(`items/new?itemType=annotation&annotationType=${type}`);
			let json = API.getJSONFromResponse(response);

			assert.property(json, 'annotationComment');
			assert.equal(json.annotationComment, '');
			assert.equal(json.annotationColor, '');
			assert.equal(json.annotationPageLabel, '');
			assert.equal(json.annotationSortIndex, '00000|000000|00000');
			assert.property(json, 'annotationPosition');
			assert.equal(json.annotationPosition.pageIndex, 0);
			assert.isArray(json.annotationPosition.rects);
			assert.notProperty(json, 'collections');
			assert.notProperty(json, 'relations');
		}
	});

	// PHP: test_should_return_fields_for_highlight_annotations
	it('should return fields for highlight annotations', async function() {
		let response = await API.get('items/new?itemType=annotation&annotationType=highlight');
		let json = API.getJSONFromResponse(response);
		assert.property(json, 'annotationText');
		assert.equal(json.annotationText, '');
	});

	// PHP: test_should_return_fields_for_note_annotations
	it('should return fields for note annotations', async function() {
		let response = await API.get('items/new?itemType=annotation&annotationType=highlight');
		let json = API.getJSONFromResponse(response);
		assert.property(json, 'annotationText');
		assert.equal(json.annotationText, '');
	});

	// PHP: test_should_return_fields_for_image_annotations
	it('should return fields for image annotations', async function() {
		let response = await API.get('items/new?itemType=annotation&annotationType=image');
		let json = API.getJSONFromResponse(response);
		assert.equal(json.annotationPosition.width, 0);
		assert.equal(json.annotationPosition.height, 0);
	});

	// PHP: testComputerProgramVersion
	it('should return computer program version field', async function() {
		let response = await API.get('items/new?itemType=computerProgram');
		assert200(response);
		let json = JSON.parse(response.getBody());
		assert.property(json, 'versionNumber');
		assert.notProperty(json, 'version');

		response = await API.get('itemTypeFields?itemType=computerProgram');
		assert200(response);
		json = JSON.parse(response.getBody());
		let fields = json.map(val => val.field);
		assert.include(fields, 'versionNumber');
		assert.notInclude(fields, 'version');
	});

	// PHP: testLocale
	it('should support locale parameter', async function() {
		let response = await API.get('itemTypes?locale=fr-FR');
		assert200(response);
		let json = JSON.parse(response.getBody());
		let bookType = json.find(o => o.itemType === 'book');
		assert.equal(bookType.localized, 'Livre');
	});
});
