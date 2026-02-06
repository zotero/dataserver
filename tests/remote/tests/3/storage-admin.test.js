/**
 * Storage Admin API tests
 * Port of tests/remote/tests/API/3/StorageAdminTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Storage Admin', function () {
	this.timeout(30000);

	const DEFAULT_QUOTA = 300;

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
	});

	beforeEach(async function () {
		// Clear subscription
		let response = await API.post(
			`users/${config.get('userID')}/storageadmin`,
			'quota=0&expiration=0',
			['Content-Type: application/x-www-form-urlencoded'],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let quotaNode = xpathSelect(xml, '//quota/text()', true);
		assert.equal(parseInt(quotaNode ? quotaNode.nodeValue : '0'), DEFAULT_QUOTA);
	});

	after(async function () {
		// Clear subscription
		await API.post(
			`users/${config.get('userID')}/storageadmin`,
			'quota=0&expiration=0',
			['Content-Type: application/x-www-form-urlencoded'],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
	});

	// PHP: test2GB
	it('should set 2GB quota', async function () {
		let quota = 2000;
		let expiration = Math.floor(Date.now() / 1000) + (86400 * 365);

		let response = await API.post(
			`users/${config.get('userID')}/storageadmin`,
			`quota=${quota}&expiration=${expiration}`,
			['Content-Type: application/x-www-form-urlencoded'],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let quotaNode = xpathSelect(xml, '//quota/text()', true);
		let expirationNode = xpathSelect(xml, '//expiration/text()', true);
		assert.equal(parseInt(quotaNode ? quotaNode.nodeValue : '0'), quota);
		assert.equal(parseInt(expirationNode ? expirationNode.nodeValue : '0'), expiration);
	});

	// PHP: testUnlimited
	it('should set unlimited quota', async function () {
		let quota = 'unlimited';
		let expiration = Math.floor(Date.now() / 1000) + (86400 * 365);

		let response = await API.post(
			`users/${config.get('userID')}/storageadmin`,
			`quota=${quota}&expiration=${expiration}`,
			['Content-Type: application/x-www-form-urlencoded'],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let quotaNode = xpathSelect(xml, '//quota/text()', true);
		let expirationNode = xpathSelect(xml, '//expiration/text()', true);
		assert.equal(quotaNode ? quotaNode.nodeValue : '', quota);
		assert.equal(parseInt(expirationNode ? expirationNode.nodeValue : '0'), expiration);
	});
});
