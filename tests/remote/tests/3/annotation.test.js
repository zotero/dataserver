/**
 * Annotation API tests
 * Port of tests/remote/tests/API/3/AnnotationTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200ForObject,
	assert204,
	assert400,
	assert400ForObject
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Annotations', function () {
	this.timeout(30000);

	let pdfAttachmentKey = null;
	let epubAttachmentKey = null;
	let _snapshotAttachmentKey = null;

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		API.resetSchemaVersion();
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));

		let key = await API.createItem('book', {}, 'key');
		let json = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'application/pdf' },
			key,
			'jsonData'
		);
		pdfAttachmentKey = json.key;

		json = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'application/epub+zip' },
			key,
			'jsonData'
		);
		epubAttachmentKey = json.key;

		json = await API.createAttachmentItem(
			'imported_url',
			{ contentType: 'text/html' },
			key,
			'jsonData'
		);
		_snapshotAttachmentKey = json.key;
	});

	after(async function () {
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	// PHP: test_should_save_a_highlight_annotation
	it('should save a highlight annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationAuthorName: 'First Last',
			annotationText: 'This is highlighted text.',
			annotationColor: '#ff8c19',
			annotationPageLabel: '10',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let jsonData = responseJSON.successful[0].data;
		assert.equal(jsonData.itemType, 'annotation');
		assert.equal(jsonData.annotationType, 'highlight');
		assert.equal(jsonData.annotationAuthorName, 'First Last');
		assert.equal(jsonData.annotationText, 'This is highlighted text.');
		assert.equal(jsonData.annotationColor, '#ff8c19');
		assert.equal(jsonData.annotationPageLabel, '10');
		assert.equal(jsonData.annotationSortIndex, '00015|002431|00000');
		let position = JSON.parse(jsonData.annotationPosition);
		assert.equal(position.pageIndex, 123);
		assert.deepEqual([[314.4, 412.8, 556.2, 609.6]], position.rects);
	});

	// PHP: test_should_save_a_highlight_annotation_with_parentItem_specified_last
	it('should save a highlight annotation with parent item specified last', async function () {
		let json = {
			itemType: 'annotation',
			annotationType: 'highlight',
			annotationAuthorName: 'First Last',
			annotationText: 'This is highlighted text.',
			annotationColor: '#ff8c19',
			annotationPageLabel: '10',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			}),
			parentItem: pdfAttachmentKey
		};

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
	});

	// PHP: test_should_save_a_note_annotation
	it('should save a note annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'note',
			annotationComment: 'This is a comment.',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};

		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let jsonData = responseJSON.successful[0].data;
		assert.equal(jsonData.itemType, 'annotation');
		assert.equal(jsonData.annotationType, 'note');
		assert.equal(jsonData.annotationComment, 'This is a comment.');
		assert.equal(jsonData.annotationSortIndex, '00015|002431|00000');
		let position = JSON.parse(jsonData.annotationPosition);
		assert.equal(position.pageIndex, 123);
		assert.deepEqual([[314.4, 412.8, 556.2, 609.6]], position.rects);
		assert.notProperty(jsonData, 'annotationText');
	});

	// PHP: test_should_reject_empty_annotationText_for_image_annotation
	it('should reject empty annotation text for image annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'image',
			annotationText: '',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'annotationText' can only be set for highlight and underline annotations");
	});

	// PHP: test_should_reject_non_empty_annotationText_for_image_annotation
	it('should reject non empty annotation text for image annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'image',
			annotationText: 'test',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "'annotationText' can only be set for highlight and underline annotations");
	});

	// PHP: test_should_save_an_image_annotation
	it('should save an image annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'image',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let responseItem = responseJSON.successful[0];
		let jsonData = responseItem.data;
		let _annotationKey = responseItem.key;
		assert.equal(jsonData.itemType, 'annotation');
		assert.equal(jsonData.annotationType, 'image');
		assert.equal(jsonData.annotationSortIndex, '00015|002431|00000');
		let position = JSON.parse(jsonData.annotationPosition);
		assert.equal(position.pageIndex, 123);
		assert.deepEqual([[314.4, 412.8, 556.2, 609.6]], position.rects);
		assert.notProperty(jsonData, 'annotationText');
	});

	// PHP: test_should_save_an_ink_annotation
	it('should save an ink annotation', async function () {
		let paths = [
			[173.54, 647.25, 175.88, 647.25, 181.32, 647.25, 184.44, 647.25, 191.44, 647.25, 197.67, 647.25, 203.89, 645.7, 206.23, 645.7, 210.12, 644.92, 216.34, 643.36, 218.68],
			[92.4075, 245.284, 92.4075, 245.284, 92.4075, 246.034, 91.6575, 248.284, 91.6575, 253.534, 91.6575, 255.034, 91.6575, 261.034, 91.6575, 263.284, 95.4076, 271.535, 99.9077]
		];
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'ink',
			annotationColor: '#ff8c19',
			annotationPageLabel: '10',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				paths: paths,
				width: 2
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let jsonData = responseJSON.successful[0].data;
		assert.equal(jsonData.itemType, 'annotation');
		assert.equal(jsonData.annotationType, 'ink');
		assert.equal(jsonData.annotationColor, '#ff8c19');
		assert.equal(jsonData.annotationPageLabel, '10');
		assert.equal(jsonData.annotationSortIndex, '00015|002431|00000');
		let position = JSON.parse(jsonData.annotationPosition);
		assert.equal(position.pageIndex, 123);
		assert.deepEqual(paths, position.paths);
	});

	// PHP: test_should_not_include_authorName_if_empty
	it('should not include author name if empty', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: 'This is highlighted text.',
			annotationColor: '#ff8c19',
			annotationPageLabel: '10',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let jsonData = responseJSON.successful[0].data;
		assert.notProperty(jsonData, 'annotationAuthorName');
	});

	async function createTextAnnotation(annotationType) {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType,
			annotationText: 'This is annotated text.',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		return {
			key: responseJSON.successful[0].key,
			version: responseJSON.successful[0].version
		};
	}
	
	it('should change underline annotation to highlight via PATCH', async function () {
		let { key, version } = await createTextAnnotation('underline');
		
		let response = await API.userPatch(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify({ version, annotationType: 'highlight' }),
			['Content-Type: application/json']
		);
		assert204(response);
		
		let item = await API.getItem(key, 'json');
		assert.equal(item.data.annotationType, 'highlight');
		assert.equal(item.data.annotationText, 'This is annotated text.');
		assert.isAbove(item.version, version);
	});
	
	it('should change highlight annotation to underline via PUT', async function () {
		let { key } = await createTextAnnotation('highlight');
		
		let item = await API.getItem(key, 'json');
		let version = item.version;
		let json = item.data;
		json.annotationType = 'underline';
		let response = await API.userPut(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
		
		item = await API.getItem(key, 'json');
		assert.equal(item.data.annotationType, 'underline');
		assert.isAbove(item.version, version);
	});
	
	it('should change annotation type between highlight and underline via multi-object POST', async function () {
		let { key, version } = await createTextAnnotation('highlight');
		
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([{ key, version, annotationType: 'underline' }]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.equal(responseJSON.successful[0].data.annotationType, 'underline');
		assert.isAbove(responseJSON.successful[0].version, version);
		
		let item = await API.getItem(key, 'json');
		assert.equal(item.data.annotationType, 'underline');
		version = item.version;
		
		response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([{ key, version, annotationType: 'highlight' }]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		
		item = await API.getItem(key, 'json');
		assert.equal(item.data.annotationType, 'highlight');
		assert.isAbove(item.version, version);
	});
	
	// PHP: test_should_not_allow_changing_annotation_type
	it('should not allow changing highlight annotation to note', async function () {
		let { key, version } = await createTextAnnotation('highlight');
		
		let response = await API.userPatch(
			config.get('userID'),
			`items/${key}`,
			JSON.stringify({ version, annotationType: 'note' }),
			['Content-Type: application/json']
		);
		assert400(response);
		assert.include(response.getBody(), 'Cannot change existing annotationType');
		
		let item = await API.getItem(key, 'json');
		assert.equal(item.data.annotationType, 'highlight');
	});
	
	it('should not allow changing underline annotation to image via multi-object POST', async function () {
		let { key, version } = await createTextAnnotation('underline');
		
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([{ key, version, annotationType: 'image' }]),
			['Content-Type: application/json']
		);
		assert400ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		assert.include(responseJSON.failed[0].message, 'Cannot change existing annotationType');
		
		let item = await API.getItem(key, 'json');
		assert.equal(item.data.annotationType, 'underline');
	});

	// PHP: test_should_update_annotation_comment
	it('should update annotation comment', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: 'This is highlighted text.',
			annotationComment: '',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let annotationKey = responseJSON.successful[0].key;
		let version = responseJSON.successful[0].version;

		json = {
			key: annotationKey,
			version: version,
			annotationComment: 'What a highlight!'
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${annotationKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
		let item = await API.getItem(annotationKey, 'json');
		assert.equal(item.data.annotationComment, 'What a highlight!');
	});

	// PHP: test_should_update_annotation_text
	it('should update annotation text', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: 'This is highlighted text.',
			annotationComment: '',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let annotationKey = responseJSON.successful[0].key;
		let version = responseJSON.successful[0].version;

		json = {
			key: annotationKey,
			version: version,
			annotationText: 'New text'
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${annotationKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
		let item = await API.getItem(annotationKey, 'json');
		assert.equal(item.data.annotationText, 'New text');
	});

	// PHP: test_should_preserve_0_for_annotation_fields
	it('should preserve 0 for annotation fields', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: '0',
			annotationComment: '0',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let responseItem = responseJSON.successful[0];
		assert.equal(responseItem.data.annotationText, '0');
		assert.equal(responseItem.data.annotationComment, '0');
	});

	// PHP: test_should_clear_annotation_fields
	it('should clear annotation fields', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: 'This is highlighted text.',
			annotationComment: 'This is a comment.',
			annotationSortIndex: '00015|002431|00000',
			annotationPageLabel: '5',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let annotationKey = responseJSON.successful[0].key;
		let version = responseJSON.successful[0].version;

		json = {
			key: annotationKey,
			version: version,
			annotationComment: '',
			annotationPageLabel: ''
		};
		response = await API.userPatch(
			config.get('userID'),
			`items/${annotationKey}`,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
		assert204(response);
		let item = await API.getItem(annotationKey, 'json');
		assert.equal(item.data.annotationComment, '');
		assert.equal(item.data.annotationPageLabel, '');
	});

	// PHP: test_should_reject_long_page_label
	it('should reject long page label', async function () {
		let label = 'x'.repeat(51);
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'ink',
			annotationSortIndex: '00015|002431|00000',
			annotationColor: '#ff8c19',
			annotationPageLabel: label,
			annotationPosition: {
				paths: []
			}
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(
			response,
			`Annotation page label is too long for attachment ${pdfAttachmentKey}`,
			0
		);
	});

	// PHP: test_should_reject_long_position
	it('should reject long position', async function () {
		let positionJSON = JSON.stringify({
			pageIndex: 123,
			rects: [
				Array.from({ length: 13001 }, (_, i) => i)
			]
		});
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'ink',
			annotationSortIndex: '00015|002431|00000',
			annotationColor: '#ff8c19',
			annotationPosition: positionJSON
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(
			response,
			`Annotation position is too long for attachment ${pdfAttachmentKey}`,
			0
		);
	});

	// PHP: test_should_truncate_long_text
	it('should truncate long text', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: '这是一个测试。'.repeat(5000),
			annotationSortIndex: '00015|002431|00000',
			annotationColor: '#ff8c19',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let jsonData = responseJSON.successful[0].data;
		// Should be truncated to 7500 characters
		assert.equal(jsonData.annotationText.length, 7500);
	});

	// PHP: test_should_reject_invalid_sortIndex
	it('should reject invalid sort index', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: '',
			annotationSortIndex: '0000',
			annotationColor: '#ff8c19',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(response, "Invalid sortIndex '0000'", 0);
	});

	// PHP: test_should_use_default_yellow_if_color_not_specified
	it('should use default yellow if color not specified', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: '',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let jsonData = responseJSON.successful[0].data;
		assert.equal(jsonData.annotationColor, '#ffd400');
	});

	// PHP: test_should_reject_invalid_color_value
	it('should reject invalid color value', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: pdfAttachmentKey,
			annotationType: 'highlight',
			annotationText: '',
			annotationSortIndex: '00015|002431|00000',
			annotationColor: 'ff8c19', // Missing '#'
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert400ForObject(
			response,
			"annotationColor must be a hex color (e.g., '#FF0000')",
			0
		);
	});

	// PHP: test_should_trigger_upgrade_error_for_epub_annotation_on_old_clients
	it('should trigger upgrade error for epub annotation on old clients', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: epubAttachmentKey,
			annotationType: 'highlight',
			annotationText: 'foo',
			annotationSortIndex: '00050|00013029',
			annotationColor: '#ff8c19',
			annotationPosition: JSON.stringify({
				type: 'FragmentSelector',
				conformsTo: 'http://www.idpf.org/epub/linking/cfi/epub-cfi.html',
				value: 'epubcfi(/6/4!/4/2[pg-header]/2[pg-header-heading],/1:4,/1:11)'
			})
		};
		let response = await API.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		assert200ForObject(response);
		let responseJSON = API.getJSONFromResponse(response);
		let annotationKey = responseJSON.successful[0].key;

		API.useSchemaVersion(28);
		response = await API.userGet(
			config.get('userID'),
			`items/${annotationKey}`
		);
		let itemJSON = API.getJSONFromResponse(response);
		let jsonData = itemJSON.data;
		assert.property(jsonData, 'invalidProp');
		API.resetSchemaVersion();
	});
});
