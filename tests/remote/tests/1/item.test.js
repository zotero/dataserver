/**
 * Item API tests for API v1
 * Port of tests/remote/tests/API/1/ItemTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert201,
	assertNumResults
} from '../../assertions3.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Items (API v1)', function() {
	this.timeout(30000);

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(1);
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	after(async function() {
		await API.userClear(config.get('userID'));
		await API.groupClear(config.get('ownedPrivateGroupID'));
	});

	// PHP: testCreateItemWithChildren
	it('should create item with children', async function() {
		// PHP: $json = API::getItemTemplate("newspaperArticle")
		let json = await API.getItemTemplate('newspaperArticle');

		// PHP: $noteJSON = API::getItemTemplate("note")
		let noteJSON = await API.getItemTemplate('note');

		// PHP: $noteJSON->note = "<p>Here's a test note</p>"
		noteJSON.note = "<p>Here's a test note</p>";

		// PHP: $json->notes = array($noteJSON)
		json.notes = [noteJSON];

		// PHP: $response = API::userPost(..., json_encode(array("items" => array($json))))
		let response = await API.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify({
				items: [json]
			})
		);

		// PHP: $this->assert201($response)
		assert201(response);

		// PHP: $xml = API::getXMLFromResponse($response)
		let xml = API.getXMLFromResponse(response);

		// PHP: $this->assertNumResults(1, $response)
		assertNumResults(response, 1);

		// PHP: $this->assertEquals(1, (int) array_get_first($xml->xpath('//atom:entry/zapi:numChildren')))
		let numChildrenNode = xpathSelect(xml, '//atom:entry/zapi:numChildren', true);
		assert.equal(parseInt(numChildrenNode?.textContent || '0'), 1);
	});
});
