const config = require("../config.js");
const API = require('../api2.js');
const API3 = require('../api3.js');
const { resetGroups } = require("../groupsSetup.js");

// To fix socket hang up errors
const retryIfNeeded = async (action) => {
	let success = false;
	let attempts = 3;
	let tried = 0;
	while (tried < attempts && !success) {
		try {
			await action();
			success = true;
		}
		catch (e) {
			console.log(e);
			console.log("Waiting for 2 seconds and re-trying.");
			await new Promise(r => setTimeout(r, 2000));
			tried += 1;
		}
	}
	if (!success) {
		throw new Error(`Setup action did not succeed after ${attempts} retried.`);
	}
};

module.exports = {

	resetGroups: async () => {
		await retryIfNeeded(async () => {
			await resetGroups();
		});
	},
	

	API1Setup: async () => {
		const credentials = await API.login();
		config.apiKey = credentials.user1.apiKey;
		config.user2APIKey = credentials.user2.apiKey;
		await API.useAPIVersion(1);
		await API.userClear(config.userID);
	},
	API1WrapUp: async () => {
		await API.userClear(config.userID);
	},

	API2Setup: async () => {
		await retryIfNeeded(async () => {
			const credentials = await API.login();
			config.apiKey = credentials.user1.apiKey;
			config.user2APIKey = credentials.user2.apiKey;
			await API.useAPIVersion(2);
			await API.setKeyOption(config.userID, config.apiKey, 'libraryNotes', 1);
			await API.userClear(config.userID);
		});
	},
	API2WrapUp: async () => {
		await retryIfNeeded(async () => {
			await API.userClear(config.userID);
		});
	},

	API3Setup: async () => {
		await retryIfNeeded(async () => {
			const credentials = await API.login();
			config.apiKey = credentials.user1.apiKey;
			config.user2APIKey = credentials.user2.apiKey;
			await API3.useAPIVersion(3);
			await API3.useAPIKey(config.apiKey);
			await API3.resetSchemaVersion();
			await API3.setKeyUserPermission(config.apiKey, 'notes', true);
			await API3.setKeyUserPermission(config.apiKey, 'write', true);
			await API.userClear(config.userID);
		});
	},
	API3WrapUp: async () => {
		await retryIfNeeded(async () => {
			await API3.useAPIKey(config.apiKey);
			await API.userClear(config.userID);
		});
	},
	retryIfNeeded: retryIfNeeded
};
