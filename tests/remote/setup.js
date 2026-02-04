/**
 * Test setup module - initializes test environment
 * Equivalent to bootstrap.inc.php in PHP tests
 */

import config from 'config';
import { API } from './api3.js';

let setupComplete = false;

async function setup() {
	if (!setupComplete) {
		let apiURLPrefix = config.get('apiURLPrefix');
		let userID = config.get('userID');
		let userID2 = config.get('userID2');
		let rootUsername = config.get('rootUsername');
		let rootPassword = config.get('rootPassword');

		// Wipe data and create API key
		let credentials = Buffer.from(`${rootUsername}:${rootPassword}`).toString('base64');
		let response = await fetch(
			`${apiURLPrefix}test/setup?u=${userID}&u2=${userID2}`,
			{
				method: 'POST',
				headers: {
					'Authorization': `Basic ${credentials}`
				},
				body: ' '
			}
		);

		let body = await response.text();
		let json;
		try {
			json = JSON.parse(body);
		}
		catch (e) {
			console.error(`Status: ${response.status}`);
			console.error(body);
			throw new Error('Invalid test setup response');
		}

		// Store runtime API keys
		config.user1APIKey = json.user1.apiKey;
		config.user2APIKey = json.user2.apiKey;
		config.apiKey = json.user1.apiKey;

		// Set up groups
		await setUpGroups();

		setupComplete = true;
	}

	// Always reset API key and version before each test (like PHP setUp())
	API.useAPIKey(config.apiKey);
	API.useAPIVersion(3);
}

async function setUpGroups() {
	let userID = config.get('userID');
	let userID2 = config.get('userID2');

	let response = await API.superGet(`users/${userID}/groups`);
	let groups = API.getJSONFromResponse(response);

	let ownedPublicGroupID = null;
	let ownedPublicNoAnonymousGroupID = null;
	let ownedPrivateGroupID = null;
	let ownedPrivateGroupName = 'Private Test Group';
	let ownedPrivateGroupID2 = null;

	let toDelete = [];

	for (let group of groups) {
		let data = group.data;
		let id = data.id;
		let type = data.type;
		let owner = data.owner;
		let libraryReading = data.libraryReading;

		if (!ownedPublicGroupID
				&& type === 'PublicOpen'
				&& owner === userID
				&& libraryReading === 'all') {
			ownedPublicGroupID = id;
		}
		else if (!ownedPublicNoAnonymousGroupID
				&& type === 'PublicClosed'
				&& owner === userID
				&& libraryReading === 'members') {
			ownedPublicNoAnonymousGroupID = id;
		}
		else if (type === 'Private' && owner === userID && data.name === ownedPrivateGroupName) {
			ownedPrivateGroupID = id;
		}
		else if (type === 'Private' && owner === userID2) {
			ownedPrivateGroupID2 = id;
		}
		else {
			toDelete.push(id);
		}
	}

	// Create missing groups
	if (!ownedPublicGroupID) {
		ownedPublicGroupID = await API.createGroup({
			owner: userID,
			type: 'PublicOpen',
			libraryReading: 'all'
		});
	}
	if (!ownedPublicNoAnonymousGroupID) {
		ownedPublicNoAnonymousGroupID = await API.createGroup({
			owner: userID,
			type: 'PublicClosed',
			libraryReading: 'members'
		});
	}
	if (!ownedPrivateGroupID) {
		ownedPrivateGroupID = await API.createGroup({
			owner: userID,
			name: 'Private Test Group',
			type: 'Private',
			libraryReading: 'members',
			fileEditing: 'members',
			members: [userID2]
		});
	}
	if (!ownedPrivateGroupID2) {
		ownedPrivateGroupID2 = await API.createGroup({
			owner: userID2,
			type: 'Private',
			libraryReading: 'members',
			fileEditing: 'members'
		});
	}

	// Delete extra groups
	for (let groupID of toDelete) {
		await API.deleteGroup(groupID);
	}

	// Set runtime config values
	config.ownedPublicGroupID = ownedPublicGroupID;
	config.ownedPublicNoAnonymousGroupID = ownedPublicNoAnonymousGroupID;
	config.ownedPrivateGroupID = ownedPrivateGroupID;
	config.ownedPrivateGroupID2 = ownedPrivateGroupID2;
	config.ownedPrivateGroupName = ownedPrivateGroupName;
	config.numOwnedGroups = 3;
	config.numPublicGroups = 2;

	// Clear all groups
	for (let group of groups) {
		if (!toDelete.includes(group.id)) {
			await API.groupClear(group.id);
		}
	}
}

export { setup };
