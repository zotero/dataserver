
var config = require('config');
const API3 = require('./api3.js');

const resetGroups = async () => {
	let resetGroups = true;

	let response = await API3.superGet(
		`users/${config.userID}/groups`
	);
	let groups = await API3.getJSONFromResponse(response);
	config.ownedPublicGroupID = null;
	config.ownedPublicNoAnonymousGroupID = null;
	config.ownedPrivateGroupID = null;
	config.ownedPrivateGroupName = 'Private Test Group';
	config.ownedPrivateGroupID2 = null;
	let toDelete = [];
	for (let group of groups) {
		let data = group.data;
		let id = data.id;
		let type = data.type;
		let owner = data.owner;
		let libraryReading = data.libraryReading;

		if (resetGroups) {
			toDelete.push(id);
			continue;
		}

		if (!config.ownedPublicGroupID
			&& type == 'PublicOpen'
			&& owner == config.userID
			&& libraryReading == 'all') {
			config.ownedPublicGroupID = id;
		}
		else if (!config.ownedPublicNoAnonymousGroupID
			&& type == 'PublicClosed'
			&& owner == config.userID
			&& libraryReading == 'members') {
			config.ownedPublicNoAnonymousGroupID = id;
		}
		else if (type == 'Private' && owner == config.userID && data.name == config.ownedPrivateGroupName) {
			config.ownedPrivateGroupID = id;
		}
		else if (type == 'Private' && owner == config.userID2) {
			config.ownedPrivateGroupID2 = id;
		}
		else {
			toDelete.push(id);
		}
	}

	if (!config.ownedPublicGroupID) {
		config.ownedPublicGroupID = await API3.createGroup({
			owner: config.userID,
			type: 'PublicOpen',
			libraryReading: 'all'
		});
	}
	if (!config.ownedPublicNoAnonymousGroupID) {
		config.ownedPublicNoAnonymousGroupID = await API3.createGroup({
			owner: config.userID,
			type: 'PublicClosed',
			libraryReading: 'members'
		});
	}
	if (!config.ownedPrivateGroupID) {
		config.ownedPrivateGroupID = await API3.createGroup({
			owner: config.userID,
			name: "Private Test Group",
			type: 'Private',
			libraryReading: 'members',
			fileEditing: 'members',
			members: [
				config.userID2
			]
		});
	}
	if (!config.ownedPrivateGroupID2) {
		config.ownedPrivateGroupID2 = await API3.createGroup({
			owner: config.userID2,
			type: 'Private',
			libraryReading: 'members',
			fileEditing: 'members'
		});
	}
	for (let groupID of toDelete) {
		await API3.deleteGroup(groupID);
	}

	for (let group of groups) {
		if (!toDelete.includes(group.id)) {
			await API3.groupClear(group.id);
		}
	}
};

module.exports = {
	resetGroups
};
