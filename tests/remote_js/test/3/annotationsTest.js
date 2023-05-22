const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { resetGroups } = require('../../groupsSetup.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('AnnotationsTests', function () {
	this.timeout(config.timeout);
	let attachmentKey, attachmentJSON;

	before(async function () {
		await API3Setup();
		await resetGroups();
		await API.groupClear(config.ownedPrivateGroupID);
	
		let key = await API.createItem("book", {}, null, 'key');
		attachmentJSON = await API.createAttachmentItem(
			"imported_url",
			{ contentType: 'application/pdf' },
			key,
			null,
			'jsonData'
		);
	
		attachmentKey = attachmentJSON.key;
	});

	after(async function () {
		await API3WrapUp();
	});


	it('test_should_reject_non_empty_annotationText_for_image_annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert400ForObject(response, "'annotationText' can only be set for highlight annotations");
	});

	it('test_should_not_allow_changing_annotation_type', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
			annotationType: 'highlight',
			annotationText: 'This is highlighted text.',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0];
		let annotationKey = json.key;
		let version = json.version;

		json = {
			version: version,
			annotationType: 'note'
		};
		response = await API.userPatch(
			config.userID,
			`items/${annotationKey}`,
			JSON.stringify(json),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert400(response);
	});

	it('test_should_reject_invalid_color_value', async function () {
		const json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
			annotationType: 'highlight',
			annotationText: '',
			annotationSortIndex: '00015|002431|00000',
			annotationColor: 'ff8c19',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6],
				],
			}),
		};
		const response = await API.userPost(
			config.userID,
			'items',
			JSON.stringify([json]),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert400ForObject(
			response,
			'annotationColor must be a hex color (e.g., \'#FF0000\')'
		);
	});

	it('test_should_not_include_authorName_if_empty', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
		let response = await API.userPost(config.userID, 'items', JSON.stringify([json]), { 'Content-Type': 'application/json' });
		Helpers.assert200ForObject(response);
		let jsonResponse = await API.getJSONFromResponse(response);
		let jsonData = jsonResponse.successful[0].data;
		assert.notProperty(jsonData, 'annotationAuthorName');
	});

	it('test_should_use_default_yellow_if_color_not_specified', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response);
		let jsonData = json.successful[0].data;
		Helpers.assertEquals('#ffd400', jsonData.annotationColor);
	});

	it('test_should_clear_annotation_fields', async function () {
		const json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
			annotationType: 'highlight',
			annotationText: 'This is highlighted text.',
			annotationComment: 'This is a comment.',
			annotationSortIndex: '00015|002431|00000',
			annotationPageLabel: "5",
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6]
				]
			})
		};
		const response = await API.userPost(config.userID, 'items', JSON.stringify([json]), { "Content-Type": "application/json" });
		Helpers.assert200ForObject(response);
		const result = await API.getJSONFromResponse(response);
		const { key: annotationKey, version } = result.successful[0];
		const patchJson = {
			key: annotationKey,
			version: version,
			annotationComment: '',
			annotationPageLabel: ''
		};
		const patchResponse = await API.userPatch(config.userID, `items/${annotationKey}`, JSON.stringify(patchJson), { "Content-Type": "application/json" });
		Helpers.assert204(patchResponse);
		const itemJson = await API.getItem(annotationKey, this, 'json');
		Helpers.assertEquals('', itemJson.data.annotationComment);
		Helpers.assertEquals('', itemJson.data.annotationPageLabel);
	});

	it('test_should_reject_empty_annotationText_for_image_annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			'items',
			JSON.stringify([json]),
			{ 'Content-Type': 'application/json' },
		);

		Helpers.assert400ForObject(response, "'annotationText' can only be set for highlight annotations");
	});

	it('test_should_save_an_ink_annotation', async function () {
		const paths = [
			[173.54, 647.25, 175.88, 647.25, 181.32, 647.25, 184.44, 647.25, 191.44, 647.25, 197.67, 647.25, 203.89, 645.7, 206.23, 645.7, 210.12, 644.92, 216.34, 643.36, 218.68],
			[92.4075, 245.284, 92.4075, 245.284, 92.4075, 246.034, 91.6575, 248.284, 91.6575, 253.534, 91.6575, 255.034, 91.6575, 261.034, 91.6575, 263.284, 95.4076, 271.535, 99.9077]
		];
		const json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
			annotationType: 'ink',
			annotationColor: '#ff8c19',
			annotationPageLabel: '10',
			annotationSortIndex: '00015|002431|00000',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				paths,
				width: 2
			})
		};
		const response = await API.userPost(config.userID, "items", JSON.stringify([json]), { "Content-Type": "application/json" });
		Helpers.assert200ForObject(response);
		const jsonResponse = API.getJSONFromResponse(response);
		const jsonData = jsonResponse.successful[0].data;
		Helpers.assertEquals('annotation', jsonData.itemType);
		Helpers.assertEquals('ink', jsonData.annotationType);
		Helpers.assertEquals('#ff8c19', jsonData.annotationColor);
		Helpers.assertEquals('10', jsonData.annotationPageLabel);
		Helpers.assertEquals('00015|002431|00000', jsonData.annotationSortIndex);
		const position = JSON.parse(jsonData.annotationPosition);
		Helpers.assertEquals(123, position.pageIndex);
		assert.deepEqual(paths, position.paths);
	});

	it('test_should_save_a_note_annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		let jsonResponse = await API.getJSONFromResponse(response);
		let jsonData = jsonResponse.successful[0].data;
		Helpers.assertEquals('annotation', jsonData.itemType.toString());
		Helpers.assertEquals('note', jsonData.annotationType);
		Helpers.assertEquals('This is a comment.', jsonData.annotationComment);
		Helpers.assertEquals('00015|002431|00000', jsonData.annotationSortIndex);
		let position = JSON.parse(jsonData.annotationPosition);
		Helpers.assertEquals(123, position.pageIndex);
		assert.deepEqual([[314.4, 412.8, 556.2, 609.6]], position.rects);
		assert.notProperty(jsonData, 'annotationText');
	});

	it('test_should_update_annotation_text', async function () {
		const json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
		const response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		const jsonResponse = API.getJSONFromResponse(response).successful[0];
		const annotationKey = jsonResponse.key;
		const version = jsonResponse.version;

		const updateJson = {
			key: annotationKey,
			version: version,
			annotationText: 'New text'
		};
		const updateResponse = await API.userPatch(
			config.userID,
			`items/${annotationKey}`,
			JSON.stringify(updateJson),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(updateResponse);

		const getItemResponse = await API.getItem(annotationKey, this, 'json');
		const jsonItemText = getItemResponse.data.annotationText;
		Helpers.assertEquals('New text', jsonItemText);
	});

	it('test_should_reject_long_position', async function () {
		let rects = [];
		for (let i = 0; i <= 13000; i++) {
			rects.push(i);
		}
		let positionJSON = JSON.stringify({
			pageIndex: 123,
			rects: [rects],
		});
		let json = {
			itemType: "annotation",
			parentItem: attachmentKey,
			annotationType: "ink",
			annotationSortIndex: "00015|002431|00000",
			annotationColor: "#ff8c19",
			annotationPosition: positionJSON,
		};
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		// TEMP: See note in Item.inc.php
		//assert413ForObject(
		Helpers.assert400ForObject(
		// TODO: Restore once output isn't HTML-encoded
		//response, "Annotation position '" . mb_substr(positionJSON, 0, 50) . "…' is too long", 0
			response,
			"Annotation position is too long for attachment " + attachmentKey,
			0
		);
	});

	it('test_should_truncate_long_text', async function () {
		const json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
		const response = await API.userPost(
			config.userID,
			'items',
			JSON.stringify([json]),
			{ 'Content-Type': 'application/json' }
		);
		Helpers.assert200ForObject(response);
		const jsonResponse = API.getJSONFromResponse(response);
		const jsonData = jsonResponse.successful[0].data;
		Helpers.assertEquals(7500, jsonData.annotationText.length);
	});

	it('test_should_update_annotation_comment', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		json = API.getJSONFromResponse(response).successful[0];
		let annotationKey = json.key, version = json.version;
		json = {
			key: annotationKey,
			version: version,
			annotationComment: 'What a highlight!'
		};
		response = await API.userPatch(
			config.userID,
			`items/${annotationKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert204(response);
		json = await API.getItem(annotationKey, this, 'json');
		Helpers.assertEquals('What a highlight!', json.data.annotationComment);
	});

	it('test_should_save_a_highlight_annotation', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		let jsonResponse = await API.getJSONFromResponse(response);
		let jsonData = jsonResponse.successful[0].data;
		Helpers.assertEquals('annotation', String(jsonData.itemType));
		Helpers.assertEquals('highlight', jsonData.annotationType);
		Helpers.assertEquals('First Last', jsonData.annotationAuthorName);
		Helpers.assertEquals('This is highlighted text.', jsonData.annotationText);
		Helpers.assertEquals('#ff8c19', jsonData.annotationColor);
		Helpers.assertEquals('10', jsonData.annotationPageLabel);
		Helpers.assertEquals('00015|002431|00000', jsonData.annotationSortIndex);
		let position = JSON.parse(jsonData.annotationPosition);
		Helpers.assertEquals(123, position.pageIndex);
		assert.deepEqual([[314.4, 412.8, 556.2, 609.6]], position.rects);
	});

	it('test_should_save_an_image_annotation', async function () {
	// Create annotation
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
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
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		Helpers.assert200ForObject(response);
		let jsonResponse = await API.getJSONFromResponse(response);
		jsonResponse = jsonResponse.successful[0];
		let jsonData = jsonResponse.data;
		Helpers.assertEquals('annotation', jsonData.itemType);
		Helpers.assertEquals('image', jsonData.annotationType);
		Helpers.assertEquals('00015|002431|00000', jsonData.annotationSortIndex);
		let position = JSON.parse(jsonData.annotationPosition);
		Helpers.assertEquals(123, position.pageIndex);
		assert.deepEqual([[314.4, 412.8, 556.2, 609.6]], position.rects);
		assert.notProperty(jsonData, 'annotationText');

	// Image uploading tested in FileTest
	});

	it('test_should_reject_invalid_sortIndex', async function () {
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
			annotationType: 'highlight',
			annotationText: '',
			annotationSortIndex: '0000',
			annotationColor: '#ff8c19',
			annotationPosition: JSON.stringify({
				pageIndex: 123,
				rects: [
					[314.4, 412.8, 556.2, 609.6],
				]
			})
		};
		let response = await API.userPost(config.userID, 'items', JSON.stringify([json]), { 'Content-Type': 'application/json' });
		Helpers.assert400ForObject(response, "Invalid sortIndex '0000'", 0);
	});

	it('test_should_reject_long_page_label', async function () {
		let label = Helpers.uniqueID(52);
		let json = {
			itemType: 'annotation',
			parentItem: attachmentKey,
			annotationType: 'ink',
			annotationSortIndex: '00015|002431|00000',
			annotationColor: '#ff8c19',
			annotationPageLabel: label,
			annotationPosition: {
				paths: []
			}
		};
		let response = await API.userPost(
			config.userID,
			"items",
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		// TEMP: See note in Item.inc.php
		//Helpers.assert413ForObject(
		Helpers.assert400ForObject(
		// TODO: Restore once output isn't HTML-encoded
		//response, "Annotation page label '" + label.substr(0, 50) + "…' is too long", 0
			response, "Annotation page label is too long for attachment " + attachmentKey, 0
		);
	});
});
